/**
 * Transaction layer: every edit to a Sheet goes through here so undo/redo
 * and formula recalculation stay consistent. See ARCHITECTURE.md §2.1 and §6.
 */

import { Sheet, Cell } from './model.js';
import { parseFormula, evaluate, makeSheetResolver, extractDependencies, FormulaError } from './formula.js';

export interface CellEdit {
  row: number;
  col: number;
  before: Cell;
  after: Cell;
  /** Sheet dimensions immediately before/after this edit — needed so undo can
   *  restore the exact prior grid shape, not just cell contents. Discovered
   *  as a real bug via the fuzz test in tests/fuzz.test.ts (see ARCHITECTURE.md §6). */
  beforeDims: { rowCount: number; colCount: number };
  afterDims: { rowCount: number; colCount: number };
}

export interface Transaction {
  edits: CellEdit[];
  timestamp: number;
}

export interface CommitResult {
  transaction: Transaction;
  recalculated: string[]; // cell refs that were recalculated as a side effect
}

export class TransactionalSheet {
  readonly sheet: Sheet;
  private undoStack: Transaction[] = [];
  private redoStack: Transaction[] = [];
  private maxHistory: number;

  constructor(sheet: Sheet, opts: { maxHistory?: number } = {}) {
    this.sheet = sheet;
    this.maxHistory = opts.maxHistory ?? 200;
  }

  /** Set a single cell's raw input. Formulas (leading '=') are stored and evaluated;
   *  everything else is stored as a literal value. Returns the committed transaction. */
  setCellInput(row: number, col: number, raw: string | number | boolean | null): CommitResult {
    const before = { ...this.sheet.getCell(row, col) };
    const beforeDims = { rowCount: this.sheet.rowCount, colCount: this.sheet.colCount };
    let after: Cell;

    if (typeof raw === 'string' && raw.startsWith('=')) {
      after = { value: null, type: 'formula', formula: raw };
    } else {
      const type = raw === null ? 'empty' : typeof raw === 'number' ? 'number' : typeof raw === 'boolean' ? 'boolean' : 'string';
      after = { value: raw, type };
    }

    this.sheet.setCell(row, col, after);
    const afterDims = { rowCount: this.sheet.rowCount, colCount: this.sheet.colCount };
    const tx: Transaction = { edits: [{ row, col, before, after, beforeDims, afterDims }], timestamp: Date.now() };
    this.pushUndo(tx);
    const recalculated = this.recalculate();
    return { transaction: tx, recalculated };
  }

  undo(): boolean {
    const tx = this.undoStack.pop();
    if (!tx) return false;
    for (const edit of tx.edits) {
      this.sheet.setCell(edit.row, edit.col, edit.before);
      this.sheet.resize(edit.beforeDims.rowCount, edit.beforeDims.colCount);
    }
    this.redoStack.push(tx);
    this.recalculate();
    return true;
  }

  redo(): boolean {
    const tx = this.redoStack.pop();
    if (!tx) return false;
    for (const edit of tx.edits) {
      this.sheet.setCell(edit.row, edit.col, edit.after);
      this.sheet.resize(edit.afterDims.rowCount, edit.afterDims.colCount);
    }
    this.undoStack.push(tx);
    this.recalculate();
    return true;
  }

  canUndo(): boolean { return this.undoStack.length > 0; }
  canRedo(): boolean { return this.redoStack.length > 0; }

  private pushUndo(tx: Transaction): void {
    this.undoStack.push(tx);
    if (this.undoStack.length > this.maxHistory) this.undoStack.shift();
    this.redoStack = []; // a fresh edit invalidates the redo branch
  }

  /**
   * Recalculate every formula cell. For the MVP this is a full sweep (correct,
   * not yet minimal) — each formula's own evaluator already does per-call cycle
   * detection via makeSheetResolver's visiting-set, so correctness holds even
   * though this isn't a topologically-minimal recompute yet.
   */
  recalculate(): string[] {
    const touched: string[] = [];
    for (const [ref, cell] of this.sheet.iterCells()) {
      if (cell.type === 'formula' && cell.formula) {
        try {
          const ast = parseFormula(cell.formula);
          const result = evaluate(ast, makeSheetResolver(this.sheet));
          const displayValue = result instanceof FormulaError ? result.code : result;
          this.sheet.setCell(ref.row, ref.col, {
            ...cell,
            value: typeof displayValue === 'boolean' ? displayValue : displayValue,
          });
          touched.push(`${ref.row}:${ref.col}`);
        } catch {
          this.sheet.setCell(ref.row, ref.col, { ...cell, value: '#ERROR!' });
        }
      }
    }
    return touched;
  }

  /** Cells that would need recalculation if `ref` changes — for future incremental recalc. */
  dependentsOf(ref: string): string[] {
    const dependents: string[] = [];
    for (const [pos, cell] of this.sheet.iterCells()) {
      if (cell.type === 'formula' && cell.formula) {
        const deps = extractDependencies(parseFormula(cell.formula));
        if (deps.includes(ref)) dependents.push(`${pos.row}:${pos.col}`);
      }
    }
    return dependents;
  }
}
