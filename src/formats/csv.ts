import { Workbook, Sheet, CellValue } from '../core/model.js';

export interface ImportWarning {
  message: string;
  row?: number;
  col?: number;
}

export interface ImportResult {
  workbook: Workbook | null;
  warnings: ImportWarning[];
}

/** Minimal RFC-4180-ish CSV parser: handles quoted fields, escaped quotes, CRLF/LF. */
function parseCsv(text: string, delimiter = ','): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  const pushField = () => { row.push(field); field = ''; };
  const pushRow = () => { pushField(); rows.push(row); row = []; };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"') { inQuotes = true; i++; continue; }
    if (c === delimiter) { pushField(); i++; continue; }
    if (c === '\r') { i++; continue; }
    if (c === '\n') { pushRow(); i++; continue; }
    field += c; i++;
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter(r => !(r.length === 1 && r[0] === ''));
}

function coerce(raw: string): CellValue {
  if (raw === '') return null;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  const n = Number(raw);
  if (!Number.isNaN(n) && raw.trim() !== '') return n;
  return raw;
}

const DEFAULT_MAX_INPUT_BYTES = 100 * 1024 * 1024; // 100MB
const DEFAULT_MAX_ROWS = 2_000_000;

export function decodeCsv(text: string, opts: { delimiter?: string; sheetName?: string; locale?: string; maxInputBytes?: number; maxRows?: number } = {}): ImportResult {
  const warnings: ImportWarning[] = [];
  const maxInputBytes = opts.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  const maxRows = opts.maxRows ?? DEFAULT_MAX_ROWS;
  if (Buffer.byteLength(text, 'utf8') > maxInputBytes) {
    warnings.push({ message: `Input exceeds the configured size limit of ${maxInputBytes} bytes; refusing to parse (possible resource-exhaustion attempt)` });
    return { workbook: null, warnings };
  }
  try {
    const grid = parseCsv(text, opts.delimiter ?? ',');
    if (grid.length > maxRows) {
      warnings.push({ message: `Input has ${grid.length} rows, exceeding the configured limit of ${maxRows}; refusing to parse` });
      return { workbook: null, warnings };
    }
    const rows: CellValue[][] = grid.map(r => r.map(coerce));
    const workbook = Workbook.fromRows(rows, opts.sheetName ?? 'Sheet1', opts.locale ?? 'en-US');
    return { workbook, warnings };
  } catch (err) {
    warnings.push({ message: `CSV parse failed: ${(err as Error).message}` });
    return { workbook: null, warnings };
  }
}

function csvEscape(value: CellValue, delimiter: string): string {
  if (value === null || value === undefined) return '';
  const str = String(value);
  if (str.includes(delimiter) || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function encodeCsv(workbook: Workbook, opts: { sheetName?: string; delimiter?: string } = {}): string {
  const delimiter = opts.delimiter ?? ',';
  const sheet: Sheet | undefined = opts.sheetName ? workbook.sheet(opts.sheetName) : workbook.sheets[0];
  if (!sheet) return '';
  const rows = sheet.toRows();
  return rows.map(row => row.map(v => csvEscape(v, delimiter)).join(delimiter)).join('\r\n');
}
