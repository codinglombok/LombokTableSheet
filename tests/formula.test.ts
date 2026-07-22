import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Sheet } from '../src/core/model';
import { parseFormula, evaluate, makeSheetResolver, FormulaError, cellRefName, parseCellRef, extractDependencies } from '../src/core/formula';

function evalFormula(sheet: Sheet, formula: string) {
  return evaluate(parseFormula(formula), makeSheetResolver(sheet));
}

test('arithmetic operator precedence', () => {
  const sheet = new Sheet('S1');
  assert.equal(evalFormula(sheet, '=2+3*4'), 14);
  assert.equal(evalFormula(sheet, '=(2+3)*4'), 20);
  assert.equal(evalFormula(sheet, '=2^3+1'), 9);
  assert.equal(evalFormula(sheet, '=-5+2'), -3);
});

test('cell references resolve to sheet values', () => {
  const sheet = new Sheet('S1');
  sheet.setValue(0, 0, 10); // A1
  sheet.setValue(1, 0, 20); // A2
  assert.equal(evalFormula(sheet, '=A1+A2'), 30);
});

test('SUM/AVG/MIN/MAX over a range', () => {
  const sheet = new Sheet('S1');
  [1, 2, 3, 4, 5].forEach((v, i) => sheet.setValue(i, 0, v)); // A1:A5
  assert.equal(evalFormula(sheet, '=SUM(A1:A5)'), 15);
  assert.equal(evalFormula(sheet, '=AVG(A1:A5)'), 3);
  assert.equal(evalFormula(sheet, '=MIN(A1:A5)'), 1);
  assert.equal(evalFormula(sheet, '=MAX(A1:A5)'), 5);
  assert.equal(evalFormula(sheet, '=COUNT(A1:A5)'), 5);
});

test('IF and comparisons', () => {
  const sheet = new Sheet('S1');
  sheet.setValue(0, 0, 10);
  assert.equal(evalFormula(sheet, '=IF(A1>5,"big","small")'), 'big');
  assert.equal(evalFormula(sheet, '=IF(A1<5,"big","small")'), 'small');
});

test('division by zero yields #DIV/0! FormulaError', () => {
  const sheet = new Sheet('S1');
  const result = evalFormula(sheet, '=10/0');
  assert.ok(result instanceof FormulaError);
  assert.equal((result as FormulaError).code, '#DIV/0!');
});

test('unknown function yields #NAME? error', () => {
  const sheet = new Sheet('S1');
  const result = evalFormula(sheet, '=NOTAFUNC(1,2)');
  assert.ok(result instanceof FormulaError);
  assert.equal((result as FormulaError).code, '#NAME?');
});

test('circular reference is detected, not infinite-looped', () => {
  const sheet = new Sheet('S1');
  sheet.setCell(0, 0, { value: null, type: 'formula', formula: '=B1' }); // A1 = B1
  sheet.setCell(0, 1, { value: null, type: 'formula', formula: '=A1' }); // B1 = A1
  const result = evalFormula(sheet, '=A1');
  assert.ok(result instanceof FormulaError);
  assert.equal((result as FormulaError).code, '#CIRC!');
});

test('cellRefName / parseCellRef round-trip', () => {
  assert.equal(cellRefName(0, 0), 'A1');
  assert.equal(cellRefName(0, 26), 'AA1');
  assert.deepEqual(parseCellRef('B3'), { row: 2, col: 1 });
  assert.deepEqual(parseCellRef(cellRefName(9, 27)), { row: 9, col: 27 });
});

test('extractDependencies finds refs and expands ranges', () => {
  const ast = parseFormula('=SUM(A1:A3)+B1');
  const deps = extractDependencies(ast).sort();
  assert.deepEqual(deps, ['A1', 'A2', 'A3', 'B1']);
});

test('CONCAT and ROUND', () => {
  const sheet = new Sheet('S1');
  assert.equal(evalFormula(sheet, '=CONCAT("a","b","c")'), 'abc');
  assert.equal(evalFormula(sheet, '=ROUND(3.14159,2)'), 3.14);
});
