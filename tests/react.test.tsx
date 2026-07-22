import { test } from 'node:test';
import assert from 'node:assert/strict';
import { installDom } from './testUtils';
import { Workbook } from '../src/core/model';

test('LombokTableReact mounts and renders the workbook into the DOM', async () => {
  const { window, cleanup } = installDom();
  try {
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = React;
    const { LombokTableReact } = await import('../src/adapters/react');

    const container = window.document.createElement('div');
    window.document.body.appendChild(container);
    const root = createRoot(container);

    const workbook = Workbook.fromRows([['name', 'age'], ['Alice', 30]]);
    await act(async () => {
      root.render(React.createElement(LombokTableReact, { workbook, template: 'report' }));
    });

    const table = container.querySelector('table');
    assert.ok(table, 'LombokTableReact should render a <table> via the core LombokTable');
    assert.equal(container.querySelectorAll('tr').length, 2);
    assert.equal(container.querySelector('th')?.textContent, 'name');

    await act(async () => { root.unmount(); });
  } finally {
    cleanup();
  }
});

test('LombokTableReact updates when data prop changes', async () => {
  const { window, cleanup } = installDom();
  try {
    const React = await import('react');
    const { createRoot } = await import('react-dom/client');
    const { act } = React;
    const { LombokTableReact } = await import('../src/adapters/react');

    const container = window.document.createElement('div');
    window.document.body.appendChild(container);
    const root = createRoot(container);

    await act(async () => {
      root.render(React.createElement(LombokTableReact, { data: [['a'], [1]] }));
    });
    assert.equal(container.querySelector('th')?.textContent, 'a');

    await act(async () => {
      root.render(React.createElement(LombokTableReact, { data: [['z'], [9]] }));
    });
    assert.equal(container.querySelector('th')?.textContent, 'z');

    await act(async () => { root.unmount(); });
  } finally {
    cleanup();
  }
});
