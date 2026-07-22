import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './testUtils';
import { Workbook } from '../src/core/model';

test('LombokTableVue mounts and renders the workbook into the DOM', async () => {
  const { window, cleanup } = installDom();
  try {
    const { createApp, h, nextTick } = await import('vue');
    const { LombokTableVue } = await import('../src/adapters/vue');

    const container = window.document.createElement('div');
    window.document.body.appendChild(container);

    const workbook = Workbook.fromRows([['name', 'age'], ['Alice', 30]]);
    const app = createApp({
      render: () => h(LombokTableVue, { workbook, template: 'report' }),
    });
    app.mount(container);
    await nextTick();

    const table = container.querySelector('table');
    assert.ok(table, 'LombokTableVue should render a <table> via the core LombokTable');
    assert.equal(container.querySelectorAll('tr').length, 2);
    assert.equal(container.querySelector('th')?.textContent, 'name');

    app.unmount();
  } finally {
    cleanup();
  }
});

test('LombokSheetVue mounts an editable sheet and emits cellChange', async () => {
  const { window, cleanup } = installDom();
  try {
    const { createApp, h, nextTick } = await import('vue');
    const { LombokSheetVue } = await import('../src/adapters/vue');

    const container = window.document.createElement('div');
    window.document.body.appendChild(container);

    const workbook = Workbook.fromRows([['x']]);
    let fired: [number, number] | null = null;
    const app = createApp({
      render: () => h(LombokSheetVue, {
        workbook,
        onCellChange: (row: number, col: number) => { fired = [row, col]; },
      }),
    });
    app.mount(container);
    await nextTick();

    const cell = container.querySelector('td') as HTMLTableCellElement;
    assert.ok(cell, 'sheet should render at least one editable cell');
    cell.dispatchEvent(new window.Event('dblclick', { bubbles: true }));
    const input = container.querySelector('input.lts-cell-edit') as HTMLInputElement;
    input.value = 'hello';
    input.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));

    assert.deepEqual(fired, [0, 0]);

    app.unmount();
  } finally {
    cleanup();
  }
});
