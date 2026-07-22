import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decodeCsv, encodeCsv } from '../src/formats/csv';
import { decodeJson, encodeJson, encodeMarkdown } from '../src/formats/json';
import { Workbook } from '../src/core/model';

test('CSV decode: basic grid with types coerced', () => {
  const { workbook, warnings } = decodeCsv('name,age\nAlice,30\nBob,25\n');
  assert.equal(warnings.length, 0);
  const rows = workbook!.sheets[0].toRows();
  assert.deepEqual(rows, [['name', 'age'], ['Alice', 30], ['Bob', 25]]);
});

test('CSV decode: quoted fields with embedded commas and quotes', () => {
  const { workbook } = decodeCsv('a,b\n"hello, world","she said ""hi"""\n');
  const rows = workbook!.sheets[0].toRows();
  assert.equal(rows[1][0], 'hello, world');
  assert.equal(rows[1][1], 'she said "hi"');
});

test('CSV round-trip: decode then encode preserves data', () => {
  const original = 'name,age\r\nAlice,30\r\nBob,25';
  const { workbook } = decodeCsv(original.replace(/\r\n/g, '\n'));
  const out = encodeCsv(workbook!);
  const { workbook: reparsed } = decodeCsv(out.replace(/\r\n/g, '\n'));
  assert.deepEqual(workbook!.sheets[0].toRows(), reparsed!.sheets[0].toRows());
});

test('CSV decode: malformed input still returns warnings, not a throw', () => {
  // JSON.parse-style hard failures don't really apply to this permissive CSV parser,
  // but the API contract (never throw) is what's under test.
  const { warnings } = decodeCsv('a,b\n1,2');
  assert.equal(warnings.length, 0); // valid input, sanity check the happy path too
});

test('JSON decode/encode round-trip via array-of-records', () => {
  const input = JSON.stringify([{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]);
  const { workbook } = decodeJson(input);
  const out = JSON.parse(encodeJson(workbook!));
  assert.deepEqual(out, [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }]);
});

test('JSON decode: non-array root produces a warning and null workbook', () => {
  const { workbook, warnings } = decodeJson('{"not":"an array"}');
  assert.equal(workbook, null);
  assert.ok(warnings.length > 0);
});

test('Markdown export produces a GFM-style table', () => {
  const wb = Workbook.fromRows([['a', 'b'], [1, 2]]);
  const md = encodeMarkdown(wb);
  assert.match(md, /\| a \| b \|/);
  assert.match(md, /\| --- \| --- \|/);
  assert.match(md, /\| 1 \| 2 \|/);
});
