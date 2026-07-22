import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './testUtils';
import { LombokTable } from '../src/adapters/dom';
import { Workbook } from '../src/core/model';

test('LombokTable renders a real <table> with header and data rows', () => {
  const { window, cleanup } = installDom();
  try {
    const container = window.document.createElement('div');
    const workbook = Workbook.fromRows([['name', 'age'], ['Alice', 30], ['Bob', 25]]);
    new LombokTable(container, { workbook, template: 'report' });

    const table = container.querySelector('table');
    assert.ok(table, 'a <table> element should be rendered');
    const rows = container.querySelectorAll('tr');
    assert.equal(rows.length, 3);
    const headerCells = rows[0]!.querySelectorAll('th');
    assert.equal(headerCells.length, 2);
    assert.equal(headerCells[0]!.textContent, 'name');
    const dataCells = rows[1]!.querySelectorAll('td');
    assert.equal(dataCells[0]!.textContent, 'Alice');
  } finally {
    cleanup();
  }
});

test('LombokTable never uses innerHTML for cell content (XSS safety)', () => {
  const { window, cleanup } = installDom();
  try {
    const container = window.document.createElement('div');
    const workbook = Workbook.fromRows([['<img src=x onerror=alert(1)>']]);
    new LombokTable(container, { workbook });
    // If this were innerHTML'd, an <img> element would exist in the DOM.
    const img = container.querySelector('img');
    assert.equal(img, null, 'malicious markup must render as inert text, not be parsed as HTML');
    const cellText = container.querySelector('th')?.textContent;
    assert.equal(cellText, '<img src=x onerror=alert(1)>');
  } finally {
    cleanup();
  }
});

test('LombokTable.setData re-renders with new data', () => {
  const { window, cleanup } = installDom();
  try {
    const container = window.document.createElement('div');
    const table = new LombokTable(container, { workbook: Workbook.fromRows([['a']]) });
    table.setData([['x', 'y'], [1, 2]]);
    const rows = container.querySelectorAll('tr');
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.querySelector('th')?.textContent, 'x');
  } finally {
    cleanup();
  }
});

test('LombokTable applies RTL direction for Arabic locale', () => {
  const { window, cleanup } = installDom();
  try {
    const container = window.document.createElement('div');
    new LombokTable(container, { workbook: Workbook.fromRows([['a']]), locale: 'ar-EG' });
    const table = container.querySelector('table');
    assert.equal(table?.getAttribute('dir'), 'rtl');
  } finally {
    cleanup();
  }
});

test('LombokTable accepts array-of-records data with inferred columns', () => {
  const { window, cleanup } = installDom();
  try {
    const container = window.document.createElement('div');
    new LombokTable(container, { data: [{ name: 'Alice', age: 30 }, { name: 'Bob', age: 25 }] });
    const rows = container.querySelectorAll('tr');
    assert.equal(rows.length, 3); // header + 2 records
    assert.equal(rows[1]!.querySelector('td')?.textContent, 'Alice');
  } finally {
    cleanup();
  }
});
