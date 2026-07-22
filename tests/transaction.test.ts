import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sheet } from '../src/core/model';
import { TransactionalSheet } from '../src/core/transaction';

test('setCellInput stores a literal value', () => {
  const tx = new TransactionalSheet(new Sheet('S1'));
  tx.setCellInput(0, 0, 'hello');
  assert.equal(tx.sheet.getCell(0, 0).value, 'hello');
  assert.equal(tx.sheet.getCell(0, 0).type, 'string');
});

test('setCellInput stores and evaluates a formula', () => {
  const tx = new TransactionalSheet(new Sheet('S1'));
  tx.setCellInput(0, 0, 10);   // A1
  tx.setCellInput(0, 1, 20);   // B1
  tx.setCellInput(0, 2, '=A1+B1'); // C1
  assert.equal(tx.sheet.getCell(0, 2).value, 30);
  assert.equal(tx.sheet.getCell(0, 2).formula, '=A1+B1');
});

test('formula recalculates when its dependency changes', () => {
  const tx = new TransactionalSheet(new Sheet('S1'));
  tx.setCellInput(0, 0, 10);
  tx.setCellInput(0, 1, '=A1*2');
  assert.equal(tx.sheet.getCell(0, 1).value, 20);

  tx.setCellInput(0, 0, 50); // change A1
  assert.equal(tx.sheet.getCell(0, 1).value, 100, 'B1 should recalculate to reflect new A1');
});

test('undo reverts the last edit, redo reapplies it', () => {
  const tx = new TransactionalSheet(new Sheet('S1'));
  tx.setCellInput(0, 0, 'first');
  tx.setCellInput(0, 0, 'second');
  assert.equal(tx.sheet.getCell(0, 0).value, 'second');

  assert.equal(tx.undo(), true);
  assert.equal(tx.sheet.getCell(0, 0).value, 'first');

  assert.equal(tx.redo(), true);
  assert.equal(tx.sheet.getCell(0, 0).value, 'second');
});

test('undo with empty history returns false and does nothing', () => {
  const tx = new TransactionalSheet(new Sheet('S1'));
  assert.equal(tx.undo(), false);
});

test('a new edit after undo clears the redo stack', () => {
  const tx = new TransactionalSheet(new Sheet('S1'));
  tx.setCellInput(0, 0, 'a');
  tx.setCellInput(0, 0, 'b');
  tx.undo(); // back to 'a'
  tx.setCellInput(0, 0, 'c'); // new branch
  assert.equal(tx.canRedo(), false, 'redo stack should be cleared after a fresh edit');
  assert.equal(tx.sheet.getCell(0, 0).value, 'c');
});

test('dependentsOf finds formula cells referencing a given ref', () => {
  const tx = new TransactionalSheet(new Sheet('S1'));
  tx.setCellInput(0, 0, 5);        // A1
  tx.setCellInput(0, 1, '=A1+1');  // B1 depends on A1
  tx.setCellInput(0, 2, '=A1*2');  // C1 depends on A1
  const deps = tx.dependentsOf('A1').sort();
  assert.deepEqual(deps, ['0:1', '0:2']);
});
