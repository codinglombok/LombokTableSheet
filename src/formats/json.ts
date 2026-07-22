import { Workbook, Sheet, CellValue } from '../core/model.js';
import { ImportResult, ImportWarning } from './csv.js';

/** JSON codec: array-of-objects (records) <-> Workbook, using the union of keys as columns. */
const DEFAULT_MAX_INPUT_BYTES = 100 * 1024 * 1024; // 100MB

export function decodeJson(text: string, opts: { sheetName?: string; locale?: string; maxInputBytes?: number } = {}): ImportResult {
  const warnings: ImportWarning[] = [];
  const maxInputBytes = opts.maxInputBytes ?? DEFAULT_MAX_INPUT_BYTES;
  if (Buffer.byteLength(text, 'utf8') > maxInputBytes) {
    warnings.push({ message: `Input exceeds the configured size limit of ${maxInputBytes} bytes; refusing to parse (possible resource-exhaustion attempt)` });
    return { workbook: null, warnings };
  }
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) {
      warnings.push({ message: 'JSON root must be an array of records' });
      return { workbook: null, warnings };
    }
    const keys: string[] = [];
    for (const rec of data) {
      if (rec && typeof rec === 'object') {
        for (const k of Object.keys(rec)) if (!keys.includes(k)) keys.push(k);
      }
    }
    const rows: CellValue[][] = [keys, ...data.map((rec: Record<string, CellValue>) =>
      keys.map(k => (rec && k in rec ? rec[k] ?? null : null))
    )];
    const workbook = Workbook.fromRows(rows, opts.sheetName ?? 'Sheet1', opts.locale ?? 'en-US');
    return { workbook, warnings };
  } catch (err) {
    warnings.push({ message: `JSON parse failed: ${(err as Error).message}` });
    return { workbook: null, warnings };
  }
}

export function encodeJson(workbook: Workbook, opts: { sheetName?: string; pretty?: boolean } = {}): string {
  const sheet: Sheet | undefined = opts.sheetName ? workbook.sheet(opts.sheetName) : workbook.sheets[0];
  if (!sheet) return '[]';
  const rows = sheet.toRows();
  if (rows.length === 0) return '[]';
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const records = body.map(row => {
    const rec: Record<string, CellValue> = {};
    header.forEach((h, i) => { rec[String(h ?? `col${i}`)] = row[i] ?? null; });
    return rec;
  });
  return JSON.stringify(records, null, opts.pretty === false ? undefined : 2);
}

/** GitHub-flavored Markdown table export (write-only; import is intentionally not supported —
 *  Markdown tables are lossy/ambiguous as a source format). */
export function encodeMarkdown(workbook: Workbook, opts: { sheetName?: string } = {}): string {
  const sheet: Sheet | undefined = opts.sheetName ? workbook.sheet(opts.sheetName) : workbook.sheets[0];
  if (!sheet) return '';
  const rows = sheet.toRows();
  if (rows.length === 0) return '';
  const esc = (v: CellValue) => String(v ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
  const header = rows[0] ?? [];
  const body = rows.slice(1);
  const lines = [
    `| ${header.map(esc).join(' | ')} |`,
    `| ${header.map(() => '---').join(' | ')} |`,
    ...body.map(row => `| ${row.map(esc).join(' | ')} |`),
  ];
  return lines.join('\n');
}
