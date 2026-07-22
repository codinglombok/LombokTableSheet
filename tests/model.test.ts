import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workbook, Sheet } from '../src/core/model';

test('Sheet.setCell / getCell round-trip', () => {
  const sheet = new Sheet('S1');
  sheet.setValue(0, 0, 'Name');
  sheet.setValue(0, 1, 'Age');
  sheet.setValue(1, 0, 'Alice');
  sheet.setValue(1, 1, 30);

  assert.equal(sheet.getCell(0, 0).value, 'Name');
  assert.equal(sheet.getCell(1, 1).value, 30);
  assert.equal(sheet.getCell(1, 1).type, 'number');
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.colCount, 2);
});

test('Sheet.getCell on unset cell returns empty', () => {
  const sheet = new Sheet('S1');
  const c = sheet.getCell(5, 5);
  assert.equal(c.value, null);
  assert.equal(c.type, 'empty');
});

test('Sheet.setCell rejects negative coordinates', () => {
  const sheet = new Sheet('S1');
  assert.throws(() => sheet.setCell(-1, 0, { value: 1, type: 'number' }));
});

test('Workbook.fromRows builds a sheet with correct dimensions', () => {
  const wb = Workbook.fromRows([
    ['a', 'b', 'c'],
    [1, 2, 3],
  ]);
  const sheet = wb.sheets[0];
  assert.equal(sheet.rowCount, 2);
  assert.equal(sheet.colCount, 3);
  assert.deepEqual(sheet.toRows(), [['a', 'b', 'c'], [1, 2, 3]]);
});

test('Sheet.clone is a deep, independent copy', () => {
  const sheet = new Sheet('S1');
  sheet.setValue(0, 0, 'x');
  const clone = sheet.clone();
  clone.setValue(0, 0, 'y');
  assert.equal(sheet.getCell(0, 0).value, 'x');
  assert.equal(clone.getCell(0, 0).value, 'y');
});
