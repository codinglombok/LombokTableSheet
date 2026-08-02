import { Workbook, Sheet, CellValue } from '../core/model.js';
import { ImportResult, ImportWarning } from './csv.js';
import { utf8ByteLength } from '../core/bytes.js';

function stripTags(html: string): string {
  let result = '';
  let inTag = false;
  for (const ch of html) {
    if (ch === '<') {
      inTag = true;
    } else if (ch === '>') {
      inTag = false;
    } else if (!inTag) {
      result += ch;
    }
  }
  return result;
}

function decodeEntities(s: string): string {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

function coerce(raw: string): CellValue {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  const n = Number(trimmed);
  if (!Number.isNaN(n) && trimmed !== '') return n;
  return trimmed;
}

/**
 * Locate `<name ...>` starting at or after `from`, returning where its content
 * begins and where the open tag started.
 *
 * Index scanning rather than a regex: the previous `<table[^>]*>([\s\S]*?)</table>`
 * form was flagged by CodeQL as a polynomial ReDoS (js/polynomial-redos). Both
 * `[^>]*` and the lazy `[\s\S]*?` can backtrack over the same input, so a
 * crafted document — many `<table` openings with no closing tag — costs
 * quadratic time. Decoding untrusted HTML is exactly the case where that
 * matters. A linear scan cannot backtrack at all.
 */
function findTag(haystack: string, lower: string, name: string, from: number):
  { tagStart: number; contentStart: number } | null {
  const needle = `<${name}`;
  let i = lower.indexOf(needle, from);
  while (i !== -1) {
    // Guard against `<tablet>` matching `<table`: the next character must end
    // the name, not continue it.
    const after = lower[i + needle.length];
    if (after === undefined || after === '>' || after === '/' || after === ' ' ||
        after === '\t' || after === '\n' || after === '\r' || after === '\f') {
      const gt = haystack.indexOf('>', i + needle.length);
      if (gt === -1) return null;
      return { tagStart: i, contentStart: gt + 1 };
    }
    i = lower.indexOf(needle, i + needle.length);
  }
  return null;
}

/** Content of the first `<name>…</name>` at or after `from`, plus where it ended. */
function readElement(haystack: string, lower: string, name: string, from: number):
  { inner: string; end: number } | null {
  const open = findTag(haystack, lower, name, from);
  if (!open) return null;
  const close = lower.indexOf(`</${name}>`, open.contentStart);
  if (close === -1) return null;
  return { inner: haystack.slice(open.contentStart, close), end: close + name.length + 3 };
}

/**
 * Like readElement, but accepts any one of `names` — used for `<td>`/`<th>`,
 * which the old code matched with `<t[dh][^>]*>`.
 */
function readAnyElement(haystack: string, lower: string, names: readonly string[], from: number):
  { inner: string; end: number } | null {
  let best: { inner: string; end: number } | null = null;
  let bestStart = Infinity;
  for (const name of names) {
    const open = findTag(haystack, lower, name, from);
    if (!open || open.tagStart >= bestStart) continue;
    const close = lower.indexOf(`</${name}>`, open.contentStart);
    if (close === -1) continue;
    bestStart = open.tagStart;
    best = { inner: haystack.slice(open.contentStart, close), end: close + name.length + 3 };
  }
  return best;
}

/**
 * Decode the first <table> found in an HTML fragment/document.
 * Deliberately a small hand-written reader (no DOM dependency, matching the
 * "no host-runtime tricks" portability goal) — handles the common case of a
 * simple table without nested tables, colspan/rowspan.
 */
const DEFAULT_MAX_INPUT_BYTES = 100 * 1024 * 1024; // 100MB
const DEFAULT_MAX_ROWS = 100_000; // Safeguard against extracting huge tables
const DEFAULT_MAX_COLS = 1_000;

export function decodeHtml(html: string, opts: { sheetName?: string; locale?: string; maxInputBytes?: number } = {}): ImportResult {
  const warnings: ImportWarning[] = [];
  const maxInputBytes = opts.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  if (utf8ByteLength(html) > maxInputBytes) {
    warnings.push({ message: `Input exceeds the configured size limit of ${maxInputBytes} bytes; refusing to parse (possible resource-exhaustion attempt)` });
    return { workbook: null, warnings };
  }
  try {
    const lowerHtml = html.toLowerCase();
    const table = readElement(html, lowerHtml, 'table', 0);
    if (!table) {
      warnings.push({ message: 'No <table> element found in HTML input' });
      return { workbook: null, warnings };
    }
    const tableBody = table.inner;
    const lowerBody = tableBody.toLowerCase();

    const rows: CellValue[][] = [];
    let cursor = 0;
    for (;;) {
      const row = readElement(tableBody, lowerBody, 'tr', cursor);
      if (!row) break;
      // Checked while scanning rather than after collecting every row, so a
      // document claiming a million rows stops costing memory at the limit.
      if (rows.length >= DEFAULT_MAX_ROWS) {
        warnings.push({ message: `Table exceeds maximum row limit of ${DEFAULT_MAX_ROWS}` });
        return { workbook: null, warnings };
      }
      cursor = row.end;

      const rowHtml = row.inner;
      const lowerRow = rowHtml.toLowerCase();
      const cells: CellValue[] = [];
      let cellCursor = 0;
      let overflowed = false;
      for (;;) {
        const cell = readAnyElement(rowHtml, lowerRow, ['td', 'th'], cellCursor);
        if (!cell) break;
        if (cells.length >= DEFAULT_MAX_COLS) {
          warnings.push({ message: `Row exceeds maximum column limit of ${DEFAULT_MAX_COLS}` });
          overflowed = true;
          break;
        }
        cellCursor = cell.end;
        cells.push(coerce(decodeEntities(stripTags(cell.inner))));
      }
      rows.push(overflowed ? [] : cells);
    }
    if (rows.length === 0) {
      warnings.push({ message: 'Table had no rows' });
    }
    const workbook = Workbook.fromRows(rows, opts.sheetName ?? 'Sheet1', opts.locale ?? 'en-US');
    return { workbook, warnings };
  } catch (err) {
    warnings.push({ message: `HTML parse failed: ${(err as Error).message}` });
    return { workbook: null, warnings };
  }
}

function htmlEscape(v: CellValue): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function encodeHtml(workbook: Workbook, opts: { sheetName?: string; className?: string } = {}): string {
  const sheet: Sheet | undefined = opts.sheetName ? workbook.sheet(opts.sheetName) : workbook.sheets[0];
  if (!sheet) return '<table></table>';
  const rows = sheet.toRows();
  if (rows.length === 0) return `<table${opts.className ? ` class="${opts.className}"` : ''}></table>`;

  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const thead = `<thead><tr>${header.map(h => `<th>${htmlEscape(h)}</th>`).join('')}</tr></thead>`;
  const tbody = `<tbody>${body.map(row => `<tr>${row.map(v => `<td>${htmlEscape(v)}</td>`).join('')}</tr>`).join('')}</tbody>`;
  const cls = opts.className ? ` class="${opts.className}"` : '';
  return `<table${cls}>${thead}${tbody}</table>`;
}
