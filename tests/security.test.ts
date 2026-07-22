import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeZip, readZip } from '../src/formats/zip';
import { decodeCsv } from '../src/formats/csv';
import { decodeJson } from '../src/formats/json';
import { decodeHtml } from '../src/formats/html';
import { decodeXlsx } from '../src/formats/xlsx';
import { parseFormula } from '../src/core/formula';

test('readZip enforces maxEntrySize against actual decompressed bytes, not just declared header', () => {
  // 2MB of highly-compressible data — small on disk, would expand past our tiny limit.
  const bomb = Buffer.alloc(2 * 1024 * 1024, 65); // all 'A's, deflates to almost nothing
  const zip = writeZip([{ name: 'bomb.txt', data: bomb }]);
  assert.throws(
    () => readZip(zip, { maxEntrySize: 1024 }), // 1KB limit, real payload is 2MB
    /exceed|larger/i,
  );
});

test('readZip enforces maxEntries to reject archives with an absurd declared entry count', () => {
  const zip = writeZip([{ name: 'a.txt', data: Buffer.from('x') }]);
  // The archive only has 1 real entry, but we can still verify the *option* is honored
  // by setting maxEntries below the real count.
  assert.throws(() => readZip(zip, { maxEntries: 0 }), /zip bomb|entries/i);
});

test('readZip with default limits still parses a normal small archive fine', () => {
  const zip = writeZip([{ name: 'hello.txt', data: Buffer.from('hello world') }]);
  const entries = readZip(zip); // defaults, no options
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.data.toString(), 'hello world');
});

test('decodeXlsx returns a warning (not a crash) when the embedded zip is a bomb', () => {
  const bomb = Buffer.alloc(2 * 1024 * 1024, 65);
  const maliciousZip = writeZip([
    { name: '[Content_Types].xml', data: Buffer.from('<Types/>') },
    { name: 'xl/workbook.xml', data: bomb },
  ]);
  const { workbook, warnings } = decodeXlsx(maliciousZip, { maxEntrySize: 1024 });
  assert.equal(workbook, null);
  assert.ok(warnings.length > 0);
});

test('decodeCsv refuses oversized input rather than allocating unbounded memory', () => {
  const text = 'a,b\n1,2\n';
  const { workbook, warnings } = decodeCsv(text, { maxInputBytes: 4 }); // absurdly small on purpose
  assert.equal(workbook, null);
  assert.match(warnings[0]!.message, /exceeds the configured size limit/);
});

test('decodeCsv refuses input with more rows than the configured limit', () => {
  const text = Array.from({ length: 100 }, (_, i) => `row${i}`).join('\n');
  const { workbook, warnings } = decodeCsv(text, { maxRows: 10 });
  assert.equal(workbook, null);
  assert.match(warnings[0]!.message, /rows, exceeding/);
});

test('decodeJson refuses oversized input', () => {
  const { workbook, warnings } = decodeJson('[{"a":1}]', { maxInputBytes: 2 });
  assert.equal(workbook, null);
  assert.match(warnings[0]!.message, /exceeds the configured size limit/);
});

test('decodeHtml refuses oversized input', () => {
  const { workbook, warnings } = decodeHtml('<table><tr><td>x</td></tr></table>', { maxInputBytes: 2 });
  assert.equal(workbook, null);
  assert.match(warnings[0]!.message, /exceeds the configured size limit/);
});

test('formula parser refuses pathologically deep nesting instead of crashing the process', () => {
  const depth = 5000;
  const pathological = '='.padEnd(0, '') + '('.repeat(depth) + '1' + ')'.repeat(depth);
  assert.throws(() => parseFormula(pathological), /maximum supported depth/);
});

test('formula parser refuses pathologically long unary chains instead of crashing the process', () => {
  const pathological = '=' + '-'.repeat(5000) + '1';
  assert.throws(() => parseFormula(pathological), /maximum supported depth/);
});

test('formula parser still handles reasonable nesting fine', () => {
  const node = parseFormula('=((((1+2))))*3');
  assert.ok(node);
});
