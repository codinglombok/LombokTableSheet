import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './testUtils';
import { LombokSheet } from '../src/adapters/sheet';
import { Workbook } from '../src/core/model';

test('LombokSheet renders an editable grid sized to the sheet', () => {
  const { window, cleanup } = installDom();
  try {
    const container = window.document.createElement('div');
    const workbook = Workbook.fromRows([['a', 'b'], [1, 2]]);
    new LombokSheet(container, { workbook });
    const rows = container.querySelectorAll('tr');
    assert.equal(rows.length, 2);
    assert.equal(rows[0]!.querySelectorAll('td').length, 2);
  } finally {
    cleanup();
  }
});

test('LombokSheet: double-click, type, Enter commits a formula and displays its computed value', () => {
  const { window, cleanup } = installDom();
  try {
    const container = window.document.createElement('div');
    const workbook = Workbook.fromRows([[10, 20, null]]);
    new LombokSheet(container, { workbook });

    const cells = container.querySelectorAll('td');
    const targetCell = cells[2]! as HTMLTableCellElement; // C1, currently empty

    targetCell.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
    const input = container.querySelector('input.lts-cell-edit') as HTMLInputElement;
    assert.ok(input, 'an input should appear in edit mode');

    input.value = '=A1+B1';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    const rerenderedCells = container.querySelectorAll('td');
    assert.equal(rerenderedCells[2]!.textContent, '30');
  } finally {
    cleanup();
  }
});

test('LombokSheet: cellChange listener fires on commit', () => {
  const { window, cleanup } = installDom();
  try {
    const container = window.document.createElement('div');
    const workbook = Workbook.fromRows([[null]]);
    const sheet = new LombokSheet(container, { workbook });
    let firedWith: [number, number] | null = null;
    sheet.on('cellChange', (row, col) => { firedWith = [row, col]; });

    const cell = container.querySelector('td') as HTMLTableCellElement;
    cell.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
    const input = container.querySelector('input.lts-cell-edit') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    assert.deepEqual(firedWith, [0, 0]);
  } finally {
    cleanup();
  }
});

test('LombokSheet: Ctrl+Z undoes the last committed edit', () => {
  const { window, cleanup } = installDom();
  try {
    const container = window.document.createElement('div');
    const workbook = Workbook.fromRows([['original']]);
    const sheet = new LombokSheet(container, { workbook });

    let cell = container.querySelector('td') as HTMLTableCellElement;
    cell.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
    let input = container.querySelector('input.lts-cell-edit') as HTMLInputElement;
    input.value = 'changed';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    assert.equal(container.querySelector('td')!.textContent, 'changed');
    assert.equal(sheet.canUndo(), true);

    sheet.undo();
    assert.equal(container.querySelector('td')!.textContent, 'original');
  } finally {
    cleanup();
  }
});
