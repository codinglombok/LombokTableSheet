/**
 * XLSX codec — minimal OOXML SpreadsheetML reader/writer.
 * Documented subset (see ARCHITECTURE.md §3.4): cell values (string/number/
 * boolean), multiple sheets, sheet names. NOT supported yet: styles, merged
 * cells, formulas-in-file (formulas are exported as their last computed
 * value), charts, comments. Uses inline strings (t="inlineStr") rather than
 * a shared-strings table, trading a slightly larger file for a much simpler
 * — and therefore more auditable — writer.
 */

import { Workbook, Sheet, CellValue } from '../core/model.js';
import { writeZip, readZip, ReadZipOptions } from './zip.js';
import { ImportResult, ImportWarning } from './csv.js';
import { cellRefName, parseCellRef } from '../core/formula.js';

const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
{{SHEET_OVERRIDES}}
</Types>`;

const ROOT_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

function xmlEscape(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function cellXml(ref: string, value: CellValue): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'number') {
    return `<c r="${ref}"><v>${value}</v></c>`;
  }
  if (typeof value === 'boolean') {
    return `<c r="${ref}" t="b"><v>${value ? 1 : 0}</v></c>`;
  }
  return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(value))}</t></is></c>`;
}

function sheetXml(sheet: Sheet): string {
  const rows = sheet.toRows();
  const rowsXml = rows.map((row, r) => {
    const cells = row
      .map((v, c) => cellXml(cellRefName(r, c), v))
      .filter(Boolean)
      .join('');
    return cells ? `<row r="${r + 1}">${cells}</row>` : '';
  }).filter(Boolean).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<sheetData>${rowsXml}</sheetData>
</worksheet>`;
}

function workbookXml(sheets: Sheet[]): string {
  const entries = sheets.map((s, i) =>
    `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
          xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets>${entries}</sheets>
</workbook>`;
}

function workbookRels(sheets: Sheet[]): string {
  const entries = sheets.map((_, i) =>
    `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`
  ).join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${entries}
</Relationships>`;
}

export function encodeXlsx(workbook: Workbook): Buffer {
  const sheets = workbook.sheets.length > 0 ? workbook.sheets : [new Sheet('Sheet1')];
  const sheetOverrides = sheets.map((_, i) =>
    `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`
  ).join('\n');

  const entries = [
    { name: '[Content_Types].xml', data: Buffer.from(CONTENT_TYPES.replace('{{SHEET_OVERRIDES}}', sheetOverrides), 'utf8') },
    { name: '_rels/.rels', data: Buffer.from(ROOT_RELS, 'utf8') },
    { name: 'xl/workbook.xml', data: Buffer.from(workbookXml(sheets), 'utf8') },
    { name: 'xl/_rels/workbook.xml.rels', data: Buffer.from(workbookRels(sheets), 'utf8') },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: Buffer.from(sheetXml(s), 'utf8') })),
  ];

  return writeZip(entries);
}

function textOf(xml: string, tag: string): string[] {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'g');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) out.push(m[1] ?? '');
  return out;
}

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

export function decodeXlsx(buf: Buffer, opts: ReadZipOptions = {}): ImportResult {
  const warnings: ImportWarning[] = [];
  try {
    const entries = readZip(buf, opts);
    const byName = new Map(entries.map(e => [e.name, e.data]));

    const wbXmlBuf = byName.get('xl/workbook.xml');
    if (!wbXmlBuf) {
      warnings.push({ message: 'xl/workbook.xml not found — not a valid .xlsx package' });
      return { workbook: null, warnings };
    }
    const wbXml = wbXmlBuf.toString('utf8');
    const sheetTagRe = /<sheet[^>]*name="([^"]*)"[^>]*\/>/g;
    const sheetNames: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = sheetTagRe.exec(wbXml)) !== null) sheetNames.push(unescapeXml(m[1] ?? `Sheet${sheetNames.length + 1}`));

    const workbook = new Workbook('en-US');
    sheetNames.forEach((name, i) => {
      const sheetBuf = byName.get(`xl/worksheets/sheet${i + 1}.xml`);
      if (!sheetBuf) {
        warnings.push({ message: `Missing worksheet part for sheet "${name}"` });
        return;
      }
      const sheetXmlText = sheetBuf.toString('utf8');
      const sheet = new Sheet(name);
      const cellRe = /<c r="([A-Z]+[0-9]+)"(?:\s+t="([a-zA-Z]+)")?[^>]*>([\s\S]*?)<\/c>/g;
      let cm: RegExpExecArray | null;
      while ((cm = cellRe.exec(sheetXmlText)) !== null) {
        const ref = cm[1] ?? '';
        const type = cm[2];
        const inner = cm[3] ?? '';
        const { row, col } = parseCellRef(ref);
        let value: CellValue;
        if (type === 'inlineStr') {
          const t = textOf(inner, 't')[0] ?? '';
          value = unescapeXml(t);
        } else if (type === 'b') {
          const v = textOf(inner, 'v')[0] ?? '0';
          value = v === '1';
        } else {
          const v = textOf(inner, 'v')[0];
          value = v !== undefined && v !== '' ? Number(v) : null;
        }
        sheet.setValue(row, col, value);
      }
      workbook.addSheet(sheet);
    });

    return { workbook, warnings };
  } catch (err) {
    warnings.push({ message: `XLSX parse failed: ${(err as Error).message}` });
    return { workbook: null, warnings };
  }
}
