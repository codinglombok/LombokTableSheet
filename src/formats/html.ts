import { Workbook, Sheet, CellValue } from '../core/model.js';
import { ImportResult, ImportWarning } from './csv.js';

function stripTags(html: string): string {
  return html.replace(/<[^>]*>/g, '');
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
 * Decode the first <table> found in an HTML fragment/document.
 * Deliberately a small regex-based reader (no DOM dependency, matching the
 * "no host-runtime tricks" portability goal) — handles the common case of a
 * simple table without nested tables, colspan/rowspan.
 */
const DEFAULT_MAX_INPUT_BYTES = 100 * 1024 * 1024; // 100MB

export function decodeHtml(html: string, opts: { sheetName?: string; locale?: string; maxInputBytes?: number } = {}): ImportResult {
  const warnings: ImportWarning[] = [];
  const maxInputBytes = opts.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  if (Buffer.byteLength(html, 'utf8') > maxInputBytes) {
    warnings.push({ message: `Input exceeds the configured size limit of ${maxInputBytes} bytes; refusing to parse (possible resource-exhaustion attempt)` });
    return { workbook: null, warnings };
  }
  try {
    const tableMatch = /<table[^>]*>([\s\S]*?)<\/table>/i.exec(html);
    if (!tableMatch) {
      warnings.push({ message: 'No <table> element found in HTML input' });
      return { workbook: null, warnings };
    }
    const tableBody = tableMatch[1] ?? '';
    const rowMatches = tableBody.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];
    const rows: CellValue[][] = rowMatches.map(rowHtml => {
      const cellMatches = rowHtml.match(/<t[dh][^>]*>[\s\S]*?<\/t[dh]>/gi) ?? [];
      return cellMatches.map(cellHtml => {
        const inner = cellHtml.replace(/^<t[dh][^>]*>/i, '').replace(/<\/t[dh]>$/i, '');
        return coerce(decodeEntities(stripTags(inner)));
      });
    });
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
