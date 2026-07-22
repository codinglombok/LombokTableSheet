import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Workbook } from '../src/core/model';
import { decodeHtml, encodeHtml } from '../src/formats/html';

test('decodeHtml parses a simple table with th/td', () => {
  const html = `<table><tr><th>name</th><th>age</th></tr><tr><td>Alice</td><td>30</td></tr></table>`;
  const { workbook, warnings } = decodeHtml(html);
  assert.equal(warnings.length, 0);
  assert.deepEqual(workbook!.sheets[0].toRows(), [['name', 'age'], ['Alice', 30]]);
});

test('decodeHtml handles thead/tbody wrapping and decodes entities', () => {
  const html = `<table><thead><tr><th>a &amp; b</th></tr></thead><tbody><tr><td>x &lt; y</td></tr></tbody></table>`;
  const { workbook } = decodeHtml(html);
  const rows = workbook!.sheets[0].toRows();
  assert.equal(rows[0][0], 'a & b');
  assert.equal(rows[1][0], 'x < y');
});

test('decodeHtml warns and returns null when no table is present', () => {
  const { workbook, warnings } = decodeHtml('<div>no table here</div>');
  assert.equal(workbook, null);
  assert.ok(warnings.length > 0);
});

test('encodeHtml produces a table with escaped content', () => {
  const wb = Workbook.fromRows([['a', 'b'], ['<script>', 'y & z']]);
  const html = encodeHtml(wb);
  assert.match(html, /<table>/);
  assert.match(html, /<th>a<\/th>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /y &amp; z/);
});

test('HTML round-trip: encode then decode preserves data (as strings/numbers)', () => {
  const wb = Workbook.fromRows([['name', 'count'], ['widgets', 5]]);
  const html = encodeHtml(wb);
  const { workbook } = decodeHtml(html);
  assert.deepEqual(workbook!.sheets[0].toRows(), [['name', 'count'], ['widgets', 5]]);
});
