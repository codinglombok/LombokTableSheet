import { Workbook, Sheet } from '../core/model.js';
import { TransactionalSheet } from '../core/transaction.js';
import { I18n } from '../i18n/index.js';

export interface SheetOptions {
  workbook: Workbook;
  sheetName?: string;
  locale?: string;
}

/** Editable Spreadsheet renderer: click a cell to edit, Enter/blur commits, ctrl+Z/Y undo/redo. */
export class LombokSheet {
  private container: HTMLElement;
  private workbook: Workbook;
  private txSheet: TransactionalSheet;
  private i18n: I18n;
  private listeners: { cellChange: Array<(row: number, col: number) => void> } = { cellChange: [] };

  constructor(container: HTMLElement, opts: SheetOptions) {
    this.container = container;
    this.workbook = opts.workbook;
    const sheet: Sheet = opts.sheetName ? (this.workbook.sheet(opts.sheetName) ?? this.workbook.sheets[0]!) : this.workbook.sheets[0]!;
    this.txSheet = new TransactionalSheet(sheet);
    this.i18n = new I18n(opts.locale ?? this.workbook.locale);
    this.render();
  }

  on(event: 'cellChange', handler: (row: number, col: number) => void): void {
    this.listeners[event].push(handler);
  }

  undo(): void { if (this.txSheet.undo()) this.render(); }
  redo(): void { if (this.txSheet.redo()) this.render(); }
  canUndo(): boolean { return this.txSheet.canUndo(); }
  canRedo(): boolean { return this.txSheet.canRedo(); }
  getWorkbook(): Workbook { return this.workbook; }

  private render(): void {
    const sheet = this.txSheet.sheet;
    const rows = Math.max(sheet.rowCount, 1);
    const cols = Math.max(sheet.colCount, 1);
    const table = document.createElement('table');
    table.className = 'lts-sheet';
    table.setAttribute('dir', this.i18n.isRtl() ? 'rtl' : 'ltr');

    for (let r = 0; r < rows; r++) {
      const tr = document.createElement('tr');
      for (let c = 0; c < cols; c++) {
        const td = document.createElement('td');
        const cell = sheet.getCell(r, c);
        const displayValue = cell.type === 'formula' ? cell.value : cell.value;
        td.textContent = this.i18n.formatCell(displayValue);
        td.tabIndex = 0;
        td.dataset.row = String(r);
        td.dataset.col = String(c);
        td.addEventListener('dblclick', () => this.beginEdit(td, r, c));
        tr.appendChild(td);
      }
      table.appendChild(tr);
    }

    table.addEventListener('keydown', (e) => {
      const isUndo = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey;
      const isRedo = (e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey));
      if (isUndo) { e.preventDefault(); this.undo(); }
      else if (isRedo) { e.preventDefault(); this.redo(); }
    });

    this.container.replaceChildren(table);
  }

  private beginEdit(td: HTMLTableCellElement, row: number, col: number): void {
    const cell = this.txSheet.sheet.getCell(row, col);
    const rawInitial = cell.formula ?? (cell.value ?? '');
    const input = document.createElement('input');
    input.value = String(rawInitial);
    input.className = 'lts-cell-edit';
    td.replaceChildren(input);
    input.focus();
    input.select();

    const commit = () => {
      const raw = input.value;
      const parsed: string | number | boolean | null =
        raw === '' ? null :
        raw.startsWith('=') ? raw :
        !Number.isNaN(Number(raw)) ? Number(raw) :
        raw === 'true' ? true : raw === 'false' ? false : raw;
      this.txSheet.setCellInput(row, col, parsed);
      this.render();
      this.listeners.cellChange.forEach(fn => fn(row, col));
    };

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); commit(); }
      if (e.key === 'Escape') { e.preventDefault(); this.render(); }
    });
    input.addEventListener('blur', commit, { once: true });
  }
}
