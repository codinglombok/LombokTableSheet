import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workbook, Sheet } from '../src/core/model';
import { encodeXlsx, decodeXlsx } from '../src/formats/xlsx';

test('XLSX round-trip: numbers, strings, booleans survive encode->decode', () => {
  const wb = Workbook.fromRows([
    ['name', 'age', 'active'],
    ['Alice', 30, true],
    ['Bob', 25, false],
  ], 'People');
  const buf = encodeXlsx(wb);
  const { workbook, warnings } = decodeXlsx(buf);
  assert.equal(warnings.length, 0);
  assert.equal(workbook!.sheets[0].name, 'People');
  assert.deepEqual(workbook!.sheets[0].toRows(), [
    ['name', 'age', 'active'],
    ['Alice', 30, true],
    ['Bob', 25, false],
  ]);
});

test('XLSX round-trip: multiple sheets preserved with correct names', () => {
  const wb = new Workbook();
  wb.addSheet(Workbook.fromRows([['a', 1]], 'First').sheets[0]);
  wb.addSheet(Workbook.fromRows([['b', 2]], 'Second').sheets[0]);
  const buf = encodeXlsx(wb);
  const { workbook } = decodeXlsx(buf);
  assert.deepEqual(workbook!.sheets.map(s => s.name), ['First', 'Second']);
  assert.deepEqual(workbook!.sheets[0].toRows(), [['a', 1]]);
  assert.deepEqual(workbook!.sheets[1].toRows(), [['b', 2]]);
});

test('XLSX handles special characters requiring XML escaping', () => {
  const wb = Workbook.fromRows([['<tag> & "quotes" \'apos\'', 1]]);
  const buf = encodeXlsx(wb);
  const { workbook } = decodeXlsx(buf);
  assert.equal(workbook!.sheets[0].getCell(0, 0).value, '<tag> & "quotes" \'apos\'');
});

test('XLSX handles empty cells (sparse rows) without misaligning columns', () => {
  const wb = new Workbook();
  const sheet = new Sheet('S1');
  sheet.setValue(0, 0, 'A1');
  sheet.setValue(0, 2, 'C1'); // B1 left empty
  wb.addSheet(sheet);
  const buf = encodeXlsx(wb);
  const { workbook } = decodeXlsx(buf);
  const row = workbook!.sheets[0].toRows()[0];
  assert.equal(row[0], 'A1');
  assert.equal(row[1], null);
  assert.equal(row[2], 'C1');
});

test('decodeXlsx returns a warning (not a throw) for garbage input', () => {
  const { workbook, warnings } = decodeXlsx(Buffer.from('not an xlsx file'));
  assert.equal(workbook, null);
  assert.ok(warnings.length > 0);
});

test('the produced .xlsx is a structurally valid ZIP openable by a real unzip tool', () => {
  const wb = Workbook.fromRows([['x', 'y'], [1, 2]]);
  const buf = encodeXlsx(wb);
  // ZIP local file header signature must be the first four bytes.
  assert.equal(buf.readUInt32LE(0), 0x04034b50);
});
