/**
 * LombokTableSheet — core data model.
 * Deliberately dependency-free and free of JS-only tricks so it can be
 * mechanically ported to PHP / Go / Rust later (see ARCHITECTURE.md §2.2).
 */

export type CellValue = string | number | boolean | null;

export type CellType = 'string' | 'number' | 'boolean' | 'date' | 'formula' | 'empty';

export interface Cell {
  value: CellValue;
  formula?: string;
  type: CellType;
  styleRef?: string;
}

export interface CellRef {
  row: number;
  col: number;
}

export interface Merge {
  from: CellRef;
  to: CellRef;
}

export type ColumnType = 'string' | 'number' | 'boolean' | 'date';

export class Sheet {
  name: string;
  rowCount: number;
  colCount: number;
  merges: Merge[] = [];
  colTypes: Record<number, ColumnType> = {};
  private cells: Map<string, Cell> = new Map();

  constructor(name: string, rowCount = 0, colCount = 0) {
    this.name = name;
    this.rowCount = rowCount;
    this.colCount = colCount;
  }

  private key(row: number, col: number): string {
    return `${row}:${col}`;
  }

  getCell(row: number, col: number): Cell {
    return this.cells.get(this.key(row, col)) ?? { value: null, type: 'empty' };
  }

  setCell(row: number, col: number, cell: Cell): void {
    if (row < 0 || col < 0) {
      throw new RangeError(`Cell position out of bounds: (${row}, ${col})`);
    }
    this.cells.set(this.key(row, col), cell);
    if (row + 1 > this.rowCount) this.rowCount = row + 1;
    if (col + 1 > this.colCount) this.colCount = col + 1;
  }

  setValue(row: number, col: number, value: CellValue): void {
    const type: CellType =
      value === null ? 'empty' :
      typeof value === 'number' ? 'number' :
      typeof value === 'boolean' ? 'boolean' : 'string';
    this.setCell(row, col, { value, type });
  }

  /** Explicitly set rowCount/colCount, including shrinking them. Used by the
   *  transaction layer to restore exact prior dimensions on undo — normal
   *  editing should never need this, since setCell only ever grows the sheet. */
  resize(rowCount: number, colCount: number): void {
    this.rowCount = Math.max(0, rowCount);
    this.colCount = Math.max(0, colCount);
  }

  *iterCells(): IterableIterator<[CellRef, Cell]> {
    for (const [key, cell] of this.cells.entries()) {
      const parts = key.split(':');
      const row = Number(parts[0]);
      const col = Number(parts[1]);
      yield [{ row, col }, cell];
    }
  }

  toRows(): CellValue[][] {
    const rows: CellValue[][] = Array.from({ length: this.rowCount }, () =>
      new Array(this.colCount).fill(null)
    );
    for (const [ref, cell] of this.iterCells()) {
      if (ref.row < 0 || ref.row >= this.rowCount || ref.col < 0 || ref.col >= this.colCount) continue;
      const r = rows[ref.row];
      if (r) r[ref.col] = cell.value;
    }
    return rows;
  }

  clone(): Sheet {
    const s = new Sheet(this.name, this.rowCount, this.colCount);
    for (const [ref, cell] of this.iterCells()) {
      s.setCell(ref.row, ref.col, { ...cell });
    }
    s.merges = this.merges.map(m => ({ from: { ...m.from }, to: { ...m.to } }));
    s.colTypes = { ...this.colTypes };
    return s;
  }
}

export interface StyleTable {
  [ref: string]: Record<string, string>;
}

export class Workbook {
  sheets: Sheet[] = [];
  styles: StyleTable = {};
  locale: string;
  meta = { createdWith: 'LombokTableSheet', version: '0.1.0' as string };

  constructor(locale = 'en-US') {
    this.locale = locale;
  }

  addSheet(sheet: Sheet): void {
    this.sheets.push(sheet);
  }

  sheet(name: string): Sheet | undefined {
    return this.sheets.find(s => s.name === name);
  }

  static fromRows(rows: CellValue[][], sheetName = 'Sheet1', locale = 'en-US'): Workbook {
    const wb = new Workbook(locale);
    const cols = rows.reduce((m, r) => Math.max(m, r.length), 0);
    const sheet = new Sheet(sheetName, rows.length, cols);
    rows.forEach((row, r) => {
      row.forEach((val, c) => sheet.setValue(r, c, val));
    });
    wb.addSheet(sheet);
    return wb;
  }
}
