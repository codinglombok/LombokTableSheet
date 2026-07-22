import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workbook } from '../src/core/model';
import { splitByRows, splitByColumns, splitBySheet, merge } from '../src/core/splitMerge';

function wb(rows: (string | number | boolean | null)[][], name = 'Sheet1') {
  return Workbook.fromRows(rows, name);
}

test('splitByRows divides a sheet at the given row index', () => {
  const source = wb([['h1', 'h2'], [1, 2], [3, 4], [5, 6]]);
  const [top, bottom] = splitByRows(source, 'Sheet1', 2);
  assert.deepEqual(top.sheets[0].toRows(), [['h1', 'h2'], [1, 2]]);
  assert.deepEqual(bottom.sheets[0].toRows(), [[3, 4], [5, 6]]);
});

test('splitByColumns divides a sheet at the given column index', () => {
  const source = wb([['a', 'b', 'c'], [1, 2, 3]]);
  const [left, right] = splitByColumns(source, 'Sheet1', 1);
  assert.deepEqual(left.sheets[0].toRows(), [['a'], [1]]);
  assert.deepEqual(right.sheets[0].toRows(), [['b', 'c'], [2, 3]]);
});

test('splitBySheet returns one workbook per sheet', () => {
  const source = new Workbook();
  source.addSheet(wb([['a']], 'One').sheets[0]);
  source.addSheet(wb([['b']], 'Two').sheets[0]);
  const parts = splitBySheet(source);
  assert.equal(parts.length, 2);
  assert.equal(parts[0].sheets[0].name, 'One');
  assert.equal(parts[1].sheets[0].name, 'Two');
});

test('merge combines same-named sheets row-wise', () => {
  const a = wb([['h1', 'h2'], [1, 2]]);
  const b = wb([['h1', 'h2'], [3, 4]]);
  const merged = merge([a, b]);
  assert.deepEqual(merged.sheets[0].toRows(), [['h1', 'h2'], [1, 2], ['h1', 'h2'], [3, 4]]);
});

test('merge with strategy=error throws on duplicate sheet names', () => {
  const a = wb([['x']], 'Sheet1');
  const b = wb([['y']], 'Sheet1');
  assert.throws(() => merge([a, b], { onConflict: 'error' }));
});

test('merge() with an empty array throws', () => {
  assert.throws(() => merge([]));
});
