import { Workbook, Sheet, CellValue } from '../core/model.js';

export type ConflictStrategy = 'left-wins' | 'right-wins' | 'error';

/** Split a sheet by row index, column index, or into N equal row chunks. */
export function splitByRows(workbook: Workbook, sheetName: string, at: number): [Workbook, Workbook] {
  const sheet = workbook.sheet(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const rows = sheet.toRows();
  const top = rows.slice(0, at);
  const bottom = rows.slice(at);
  return [
    Workbook.fromRows(top, `${sheet.name}_part1`, workbook.locale),
    Workbook.fromRows(bottom, `${sheet.name}_part2`, workbook.locale),
  ];
}

export function splitByColumns(workbook: Workbook, sheetName: string, at: number): [Workbook, Workbook] {
  const sheet = workbook.sheet(sheetName);
  if (!sheet) throw new Error(`Sheet not found: ${sheetName}`);
  const rows = sheet.toRows();
  const left = rows.map(r => r.slice(0, at));
  const right = rows.map(r => r.slice(at));
  return [
    Workbook.fromRows(left, `${sheet.name}_left`, workbook.locale),
    Workbook.fromRows(right, `${sheet.name}_right`, workbook.locale),
  ];
}

export function splitBySheet(workbook: Workbook): Workbook[] {
  return workbook.sheets.map(s => {
    const wb = new Workbook(workbook.locale);
    wb.addSheet(s.clone());
    return wb;
  });
}

/**
 * Merge multiple workbooks into one. Sheets with the same name are combined
 * row-wise; on cell conflicts (shouldn't normally happen with row-wise append,
 * but relevant for future cell-level merges) the strategy decides the winner.
 */
export function merge(workbooks: Workbook[], opts: { onConflict?: ConflictStrategy } = {}): Workbook {
  if (workbooks.length === 0) throw new Error('merge() requires at least one workbook');
  const strategy = opts.onConflict ?? 'left-wins';
  const result = new Workbook(workbooks[0]?.locale ?? 'en-US');
  const bySheetName = new Map<string, CellValue[][]>();

  for (const wb of workbooks) {
    for (const sheet of wb.sheets) {
      const rows = sheet.toRows();
      if (!bySheetName.has(sheet.name)) {
        bySheetName.set(sheet.name, rows.map(r => [...r]));
      } else {
        const existing = bySheetName.get(sheet.name)!;
        const firstExisting = existing[0];
        const firstNew = rows[0];
        const width = Math.max(firstExisting?.length ?? 0, firstNew?.length ?? 0);
        // Row-wise append; header row de-duplication left to the caller (documented behavior).
        for (const row of rows) {
          const padded = [...row];
          while (padded.length < width) padded.push(null);
          existing.push(padded);
        }
      }
    }
  }

  if (strategy === 'error') {
    const names = [...bySheetName.keys()];
    const wbNames = workbooks.map(w => w.sheets.map(s => s.name));
    const dup = names.filter(n => wbNames.filter(list => list.includes(n)).length > 1);
    if (dup.length > 0) {
      throw new Error(`Sheet name conflicts during merge (strategy=error): ${dup.join(', ')}`);
    }
  }

  for (const [name, rows] of bySheetName.entries()) {
    const width = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const sheet = new Sheet(name, rows.length, width);
    rows.forEach((row, r) => row.forEach((v, c) => sheet.setValue(r, c, v)));
    result.addSheet(sheet);
  }
  return result;
}
