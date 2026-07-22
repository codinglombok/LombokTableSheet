# LombokTableSheet

Fast, lightweight Table + Spreadsheet library. Framework-agnostic core, thin adapters
for React/Vue/vanilla JS. Apache 2.0.

> **Current status: v0.6.0.** JS/TS core (hardened) + PHP + Go data-layer ports. Table
> and editable Spreadsheet (formulas, undo/redo), CSV/JSON/Markdown/XLSX/HTML
> import-export, split/merge, templates, i18n (**30 locales**), and React/Vue adapters
> are implemented and tested (84 TS/JS tests). PHP ([`ports/php`](./ports/php), 33
> tests) and Go ([`ports/go`](./ports/go), 34 tests) data-layer ports exist, both
> verified value-identical to the TS core on matching inputs — **151 tests total**
> across all three languages. ~19 CI/CD workflows automate testing, security scanning,
> labeling, releases, and publishing — see [WORKFLOWS.md](./WORKFLOWS.md) for what's
> automated and what's honestly not (yet). A security hardening pass added
> resource-exhaustion guards and a fuzz test — which found and fixed two real bugs; see
> [SECURITY.md](./SECURITY.md). Rust is next — see
> [MASTERPROMPT-STAGES.md](./MASTERPROMPT-STAGES.md) for the concrete stage-by-stage plan.

**Full documentation set:**
[PROJECT_SUMMARY.md](./PROJECT_SUMMARY.md) (what actually exists, in numbers) ·
[ARCHITECTURE.md](./ARCHITECTURE.md) (design & roadmap) ·
[USAGE.md](./USAGE.md) (quick how-to, TS + PHP) ·
[DETAILED_USAGE.md](./DETAILED_USAGE.md) (exhaustive API reference, all 3 languages) ·
[SECURITY.md](./SECURITY.md) (hardening record) ·
[WORKFLOWS.md](./WORKFLOWS.md) (CI/CD — what's automated and what's honestly not) ·
[DEPLOYMENT.md](./DEPLOYMENT.md) (how to ship it) ·


## Why

- **Fast**: virtualization-ready data model, sparse storage, no framework tax in the core.
- **Simple**: one small, dependency-free core; adapters are thin wrappers, not reimplementations.
- **Portable**: the core is written so it can be mechanically ported to PHP, Go, and Rust
  (planned — see roadmap). No `eval`, no reflection magic, no host-language tricks.
- **International**: `Intl`-backed number/date/currency formatting, RTL support,
  UI string catalog for 11 languages out of the box.
- **Unique from the pack**: templates are pure JSON/CSS, never coupled to your data —
  export to CSV/JSON and the presentation concerns disappear entirely.

## Install

```bash
npm install lomboktablesheet
```

## Quick start

```ts
import { LombokTable, decodeCsv } from 'lomboktablesheet';

const { workbook } = decodeCsv('name,age\nAlice,30\nBob,25\n');
const table = new LombokTable(document.getElementById('app')!, {
  workbook,
  template: 'report',
  locale: 'en-US',
});
```

### Import / export

```ts
import { decodeCsv, encodeCsv, decodeJson, encodeJson, encodeMarkdown, decodeXlsx, encodeXlsx, decodeHtml, encodeHtml } from 'lomboktablesheet';

const { workbook, warnings } = decodeCsv(csvText);       // never throws — check `warnings`
const csvOut = encodeCsv(workbook);
const jsonOut = encodeJson(workbook);
const mdOut = encodeMarkdown(workbook);                  // GitHub-flavored Markdown table

// XLSX: dependency-free — no external zip/xlsx library, hand-written ZIP writer
const xlsxBuf = encodeXlsx(workbook);                    // returns a Buffer, write it to disk
const { workbook: fromXlsx } = decodeXlsx(xlsxBuf);

// HTML tables
const htmlOut = encodeHtml(workbook, { className: 'my-table' });
const { workbook: fromHtml } = decodeHtml('<table>...</table>');
```

### Split / merge

```ts
import { splitByRows, splitByColumns, splitBySheet, merge } from 'lomboktablesheet';

const [top, bottom] = splitByRows(workbook, 'Sheet1', 100);
const [left, right] = splitByColumns(workbook, 'Sheet1', 3);
const combined = merge([top, bottom], { onConflict: 'left-wins' });
```

### Editable Spreadsheet + formulas

```ts
import { LombokSheet, Workbook } from 'lomboktablesheet';

const workbook = new Workbook('en-US');
const sheet = new LombokSheet(document.getElementById('app')!, { workbook });

sheet.on('cellChange', (row, col) => console.log('edited', row, col));
// Double-click a cell to edit. Type "=SUM(A1:A3)*2" — formulas recalculate
// automatically when their dependencies change. Ctrl+Z / Ctrl+Y for undo/redo.
```

Formula engine supports `+ - * / ^`, comparisons, cell refs (`A1`) and ranges (`A1:B3`),
and `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `IF`, `ROUND`, `CONCAT` — with `#DIV/0!`, `#CIRC!`,
`#NAME?`, `#VALUE!` error cells instead of throwing (see ARCHITECTURE.md §3.3/§6 for why
there's no `eval` anywhere in the evaluator).

### Templates

Built in: `plain`, `report`, `invoice`, `financial-statement`. Register your own:

```ts
import { defaultTemplates } from 'lomboktablesheet';

defaultTemplates.register({
  name: 'dashboard',
  description: 'Compact dashboard style',
  header: { bold: true, sticky: true },
  zebraRows: true,
  borders: 'horizontal',
  numberAlign: 'right',
  cssHooks: ['lts-dashboard'],
});
```

### i18n

```ts
import { I18n } from 'lomboktablesheet';

const i18n = new I18n('ar-EG');
i18n.isRtl();                 // true
i18n.formatCurrency(1500, 'USD');
```

## Optional peers

- [LombokCharts](https://github.com/codinglombok/LombokCharts) — chart rendering from the same `Workbook` data.
- [LombokCSS](https://github.com/codinglombok/LombokCSS) — themeable styling via the `cssHooks` templates expose.

Both are optional `peerDependencies`; LombokTableSheet works standalone without them.

## Framework adapters

React and Vue are opt-in sub-paths — the core bundle has zero React/Vue code in it.

```tsx
// React
import { LombokTableReact, LombokSheetReact } from 'lomboktablesheet/react';

function App() {
  return <LombokTableReact data={rows} template="report" locale="en-US" />;
}
```

```vue
<!-- Vue 3 -->
<script setup>
import { LombokTableVue } from 'lomboktablesheet/vue';
</script>
<template>
  <LombokTableVue :workbook="workbook" template="invoice" />
</template>
```

Both wrappers mount the same framework-agnostic `LombokTable`/`LombokSheet` core underneath —
they're thin, not reimplementations, per the portability goal in ARCHITECTURE.md §2.2.

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) — full system design, data model, roadmap, trade-offs.
- [DEPLOYMENT.md](./DEPLOYMENT.md) — multi-stage deployment plan (GitHub, Docker, npm, Packagist, CDN, hosting).

## Development

```bash
npm install
npm run typecheck   # tsc --strict, no emit
npm test            # node --test, 18 unit tests covering model/codecs/split-merge
npm run build        # emits dist/ (ESM + type declarations)
```

## License

Apache 2.0 — see [LICENSE](./LICENSE).
