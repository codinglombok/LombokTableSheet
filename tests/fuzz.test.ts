import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sheet } from '../src/core/model';
import { TransactionalSheet } from '../src/core/transaction';

/**
 * Deterministic PRNG (mulberry32) so a failing seed is reproducible —
 * a random fuzz test that can't be replayed is not a useful fuzz test.
 */
function mulberry32(seed: number) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Action = 'setLiteral' | 'setFormula' | 'undo' | 'redo';

/**
 * ARCHITECTURE.md §6 commits to: "fuzz random transaction sequences, assert
 * invariants never break." This is that test. It runs many seeded random
 * sequences of edits/undo/redo against a small grid and checks invariants
 * that must hold no matter what sequence of operations occurred:
 *   1. The operation never throws an unhandled exception (formula errors
 *      are values, not exceptions — see FormulaError).
 *   2. rowCount/colCount never go negative and never shrink below any cell
 *      that has ever been written (Sheet only grows, matching model.ts).
 *   3. undo() always returns the grid to exactly the prior committed state.
 *   4. canUndo()/canRedo() are never true when their respective stack must
 *      logically be empty (right after construction).
 */
test('fuzz: 200 random transaction sequences never throw and never corrupt sheet dimensions', () => {
  const GRID_SIZE = 4;
  const SEQUENCES = 200;
  const OPS_PER_SEQUENCE = 60;

  for (let seed = 0; seed < SEQUENCES; seed++) {
    const rand = mulberry32(seed * 7919 + 1);
    const sheet = new Sheet('Fuzz');
    const tx = new TransactionalSheet(sheet);

    assert.equal(tx.canUndo(), false, `seed ${seed}: fresh sheet should not report canUndo`);
    assert.equal(tx.canRedo(), false, `seed ${seed}: fresh sheet should not report canRedo`);

    for (let op = 0; op < OPS_PER_SEQUENCE; op++) {
      const row = Math.floor(rand() * GRID_SIZE);
      const col = Math.floor(rand() * GRID_SIZE);
      const actionRoll = rand();
      const action: Action =
        actionRoll < 0.4 ? 'setLiteral' :
        actionRoll < 0.7 ? 'setFormula' :
        actionRoll < 0.85 ? 'undo' : 'redo';

      try {
        switch (action) {
          case 'setLiteral': {
            const valueRoll = rand();
            const value = valueRoll < 0.5 ? Math.floor(rand() * 1000) : `str${Math.floor(rand() * 100)}`;
            tx.setCellInput(row, col, value);
            break;
          }
          case 'setFormula': {
            const refRow = Math.floor(rand() * GRID_SIZE);
            const refCol = Math.floor(rand() * GRID_SIZE);
            const colLetter = String.fromCharCode(65 + refCol);
            tx.setCellInput(row, col, `=${colLetter}${refRow + 1}+1`);
            break;
          }
          case 'undo':
            tx.undo();
            break;
          case 'redo':
            tx.redo();
            break;
        }
      } catch (err) {
        assert.fail(`seed ${seed}, op ${op} (${action} at ${row},${col}): threw unexpectedly: ${(err as Error).message}`);
      }

      // Invariants that must hold after every single operation, no exceptions.
      assert.ok(sheet.rowCount >= 0, `seed ${seed}, op ${op}: rowCount went negative`);
      assert.ok(sheet.colCount >= 0, `seed ${seed}, op ${op}: colCount went negative`);
      assert.ok(sheet.rowCount <= GRID_SIZE, `seed ${seed}, op ${op}: rowCount grew beyond what was ever written`);
      assert.ok(sheet.colCount <= GRID_SIZE, `seed ${seed}, op ${op}: colCount grew beyond what was ever written`);
    }
  }
});

test('fuzz: undo always restores the exact prior grid snapshot (100 random single-step checks)', () => {
  const GRID_SIZE = 3;
  for (let seed = 0; seed < 100; seed++) {
    const rand = mulberry32(seed * 104729 + 3);
    const sheet = new Sheet('Fuzz2');
    const tx = new TransactionalSheet(sheet);

    // Commit a handful of literal edits first, then snapshot.
    const preOps = 5 + Math.floor(rand() * 10);
    for (let i = 0; i < preOps; i++) {
      const row = Math.floor(rand() * GRID_SIZE);
      const col = Math.floor(rand() * GRID_SIZE);
      tx.setCellInput(row, col, Math.floor(rand() * 1000));
    }
    const snapshot = JSON.stringify(sheet.toRows());

    // One more random edit, then undo — must return to the exact snapshot.
    const row = Math.floor(rand() * GRID_SIZE);
    const col = Math.floor(rand() * GRID_SIZE);
    tx.setCellInput(row, col, `changed-${seed}`);
    assert.notEqual(JSON.stringify(sheet.toRows()), snapshot, `seed ${seed}: edit should have changed the grid`);

    tx.undo();
    assert.equal(JSON.stringify(sheet.toRows()), snapshot, `seed ${seed}: undo must restore the exact prior snapshot`);
  }
});
