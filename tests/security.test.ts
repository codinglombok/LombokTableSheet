import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeZip, readZip } from '../src/formats/zip';
import { decodeCsv } from '../src/formats/csv';
import { decodeJson } from '../src/formats/json';
import { decodeHtml } from '../src/formats/html';
import { decodeXlsx } from '../src/formats/xlsx';
import { parseFormula } from '../src/core/formula';
import { utf8ByteLength } from '../src/core/bytes';

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

// ═══════════════════════════════════════════════════════════
// REGRESSION — polynomial ReDoS (CodeQL js/polynomial-redos)
//
// Three regexes used to scan untrusted input with patterns that could
// backtrack quadratically. They were replaced with linear scans. These tests
// pin the behaviour AND the cost: on the old code the timed cases took
// seconds to minutes, so a generous budget still fails loudly if the
// backtracking forms ever come back.
// ═══════════════════════════════════════════════════════════

test('decodeHtml stays linear on many unclosed <table> openings', () => {
  // Old: /<table[^>]*>([\s\S]*?)<\/table>/ retried the lazy body from every
  // one of these starts, none of which can ever reach a closing tag.
  const hostile = '<table '.repeat(40_000);
  const started = Date.now();
  const { workbook, warnings } = decodeHtml(hostile);
  const elapsed = Date.now() - started;

  assert.equal(workbook, null);
  assert.match(warnings[0]?.message ?? '', /No <table> element found/);
  assert.ok(elapsed < 2000, `decodeHtml took ${elapsed}ms on hostile input`);
});

test('decodeHtml stays linear on a table full of unclosed <tr> openings', () => {
  const hostile = `<table>${'<tr '.repeat(40_000)}</table>`;
  const started = Date.now();
  const { warnings } = decodeHtml(hostile);
  const elapsed = Date.now() - started;

  assert.ok(warnings.some(w => /no rows/i.test(w.message)));
  assert.ok(elapsed < 2000, `decodeHtml took ${elapsed}ms on hostile input`);
});

test('formula lexer stays linear on a long digit run followed by a letter', () => {
  // The hostile shape is digits that do NOT end the identifier: `/[0-9]+$/`
  // then matches a run, hits the trailing letter, fails, and retries one
  // position later — quadratic. (A run that *does* end the identifier matches
  // on the first attempt and was never slow, which is why the input matters.)
  //
  // Measured against the old expression: 10k->100ms, 20k->385ms, 40k->1559ms,
  // i.e. 4x per doubling. The linear scan does the same work in 3/5/10ms.
  const started = Date.now();
  try {
    parseFormula(`A${'0'.repeat(60_000)}B`);
  } catch {
    // Rejected as an unknown function — irrelevant here; lexing is what we time.
  }
  const elapsed = Date.now() - started;
  assert.ok(elapsed < 2000, `formula lexing took ${elapsed}ms on a hostile identifier`);
});

test('tag matching is exact: <tablet> is not a <table>', () => {
  const { workbook, warnings } = decodeHtml('<tablet><tr><td>x</td></tr></tablet>');
  assert.equal(workbook, null);
  assert.match(warnings[0]?.message ?? '', /No <table> element found/);
});

test('cell-ref identification still distinguishes refs from function names', () => {
  // Letters-then-digits is a ref; anything else is an identifier.
  const ref = parseFormula('A1');
  assert.equal(ref.kind, 'ref');
  const call = parseFormula('SUM(A1:A2)');
  assert.equal(call.kind, 'call');
});

// ═══════════════════════════════════════════════════════════
// REGRESSION — Buffer is not a browser global
//
// The size guards in the CSV/JSON/HTML decoders used
// `Buffer.byteLength(text, 'utf8')`, which threw "Buffer is not defined" on
// the very first line of every decode in a browser. Avoiding `node:` imports
// was not sufficient — an assumed global breaks just as completely.
// ═══════════════════════════════════════════════════════════

test('utf8ByteLength matches Buffer.byteLength across tricky inputs', () => {
  const cases = [
    '',
    'ascii only',
    'café',                       // 2-byte
    'åäö ñ ü',
    '日本語のテキスト',              // 3-byte
    'مرحبا بالعالم',               // RTL, 2-byte
    '😀🎉👨‍👩‍👧‍👦',                     // 4-byte + ZWJ sequence
    'mixed: a√b𝄞c',
    'a'.repeat(1000) + 'é'.repeat(500) + '漢'.repeat(250),
  ];
  for (const s of cases) {
    assert.equal(
      utf8ByteLength(s),
      Buffer.byteLength(s, 'utf8'),
      `byte length mismatch for ${JSON.stringify(s.slice(0, 24))}`
    );
  }
});

test('utf8ByteLength counts a lone surrogate as the replacement character', () => {
  const lone = '\uD800';
  assert.equal(utf8ByteLength(lone), Buffer.byteLength(lone, 'utf8'));
  assert.equal(utf8ByteLength(lone), 3);
});

test('the decoders no longer touch Buffer at all', () => {
  // Runs the guard path with Buffer removed from the global scope: the same
  // condition a browser presents.
  const savedBuffer = (globalThis as Record<string, unknown>).Buffer;
  delete (globalThis as Record<string, unknown>).Buffer;
  try {
    assert.ok(decodeCsv('a,b\n1,2\n').workbook);
    assert.ok(decodeJson('[{"a":1}]').workbook);
    assert.ok(decodeHtml('<table><tr><td>1</td></tr></table>').workbook);
  } finally {
    (globalThis as Record<string, unknown>).Buffer = savedBuffer;
  }
});
