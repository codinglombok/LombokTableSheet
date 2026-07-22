# USAGE — How to use LombokTableSheet

This is the detailed how-to guide. For a quick start, see `README.md`. For internals,
see `ARCHITECTURE.md`. For an exhaustive, per-function API reference across all three
languages (parameter tables, error codes, full locale list, worked examples), see
[DETAILED_USAGE.md](./DETAILED_USAGE.md) — this document covers every public API
surface with runnable examples, but that one is the line-by-line reference.

## Table of contents

- [Installation](#installation)
- [TypeScript/JS: core concepts](#typescriptjs-core-concepts)
- [TypeScript/JS: import & export](#typescriptjs-import--export)
- [TypeScript/JS: the Table (read-only) renderer](#typescriptjs-the-table-read-only-renderer)
- [TypeScript/JS: the Spreadsheet (editable) renderer](#typescriptjs-the-spreadsheet-editable-renderer)
- [TypeScript/JS: formulas](#typescriptjs-formulas)
- [TypeScript/JS: split & merge](#typescriptjs-split--merge)
- [TypeScript/JS: templates](#typescriptjs-templates)
- [TypeScript/JS: internationalization](#typescriptjs-internationalization)
- [TypeScript/JS: React adapter](#typescriptjs-react-adapter)
- [TypeScript/JS: Vue adapter](#typescriptjs-vue-adapter)
- [PHP: installation & concepts](#php-installation--concepts)
- [PHP: import & export](#php-import--export)
- [PHP: formulas](#php-formulas)
- [PHP: split & merge](#php-split--merge)
- [Go: installation & concepts](#go-installation--concepts)
- [Go: import & export](#go-import--export)
- [Go: formulas](#go-formulas)
- [Go: split & merge](#go-split--merge)
- [Security-relevant options](#security-relevant-options)
- [Troubleshooting](#troubleshooting)

---

## Installation

**TypeScript/JS (once published to npm):**
```bash
npm install lomboktablesheet
```

**PHP (once published to Packagist):**
```bash
composer require codinglombok/lomboktablesheet
```

**Working from this repository directly (not yet published):**
```bash
# TS/JS
cd LombokTableSheet && npm install && npm run build
# then import from ./dist/index.js

# PHP
cd LombokTableSheet/ports/php
# composer install (once Packagist is reachable), or use the bundled
# classmap-style bootstrap for local testing:
php -r 'require "autoload.php"; /* your code here */'
```

---

## TypeScript/JS: core concepts

Everything revolves around a `Workbook`, which holds one or more `Sheet`s, each a grid
of `Cell`s. You rarely construct `Cell` objects directly — use `Sheet.setValue()` or
`Workbook.fromRows()`.

```ts
import { Workbook, Sheet } from 'lomboktablesheet';

// From a 2D array (first row often used as a header by convention, not enforced)
const workbook = Workbook.fromRows([
  ['name', 'age'],
  ['Alice', 30],
  ['Bob', 25],
], 'People', 'en-US');

// Or build a sheet manually
const sheet = new Sheet('Custom');
sheet.setValue(0, 0, 'Hello');
sheet.setValue(0, 1, 42);
const wb2 = new Workbook();
wb2.addSheet(sheet);

// Reading data back
console.log(workbook.sheets[0].toRows());
// [['name','age'], ['Alice',30], ['Bob',25]]

console.log(workbook.sheet('People')?.getCell(1, 0).value); // 'Alice'
```

`Sheet` only ever grows in dimension as you write cells further out — this is
deliberate (see ARCHITECTURE.md §2.2) and is why `undo()` in the Spreadsheet adapter
needs to explicitly restore prior dimensions, not just cell values (see SECURITY.md
for the bug this caused and how it was fixed).

---

## TypeScript/JS: import & export

All decoders return `{ workbook, warnings }` and **never throw** on malformed input —
check `warnings` instead of wrapping in try/catch for expected parse issues.

```ts
import {
  decodeCsv, encodeCsv,
  decodeJson, encodeJson, encodeMarkdown,
  decodeXlsx, encodeXlsx,
  decodeHtml, encodeHtml,
} from 'lomboktablesheet';

// CSV
const { workbook, warnings } = decodeCsv('name,age\nAlice,30\n');
if (warnings.length) console.warn(warnings);
const csvText = encodeCsv(workbook!);

// JSON (array-of-records shape)
const { workbook: fromJson } = decodeJson('[{"name":"Alice","age":30}]');
const jsonText = encodeJson(fromJson!, { pretty: true });

// Markdown — export only (import is unsupported; Markdown tables are a lossy,
// ambiguous source format, so decoding one isn't offered)
const mdText = encodeMarkdown(workbook!);

// XLSX — Buffer in, Buffer out. No external xlsx/zip library involved.
const xlsxBuffer = encodeXlsx(workbook!);
import { writeFileSync } from 'node:fs';
writeFileSync('out.xlsx', xlsxBuffer);
const { workbook: fromXlsx } = decodeXlsx(xlsxBuffer);

// HTML
const html = encodeHtml(workbook!, { className: 'my-table' });
const { workbook: fromHtml } = decodeHtml('<table><tr><td>x</td></tr></table>');
```

### Handling multiple sheets
```ts
const workbook = new Workbook('en-US');
workbook.addSheet(Sheet1);
workbook.addSheet(Sheet2);

// Most codecs default to the first sheet; pass sheetName to target another:
const csvOfSecondSheet = encodeCsv(workbook, { sheetName: 'Sheet2' });
```

---

## TypeScript/JS: the Table (read-only) renderer

```ts
import { LombokTable } from 'lomboktablesheet';

const container = document.getElementById('app')!;
const table = new LombokTable(container, {
  workbook,               // OR: data: [[...]] / data: [{...}, {...}]
  template: 'report',     // 'plain' | 'report' | 'invoice' | 'financial-statement'
  locale: 'en-US',
});

// Update data later without recreating the instance
table.setData([['x', 'y'], [1, 2]]);

// Get the underlying workbook (e.g. to export it)
const wb = table.getWorkbook();
```

`LombokTable` renders every cell as a text node — never `innerHTML` — so it's safe
against malicious cell content by construction (see SECURITY.md).

---

## TypeScript/JS: the Spreadsheet (editable) renderer

```ts
import { LombokSheet, Workbook } from 'lomboktablesheet';

const workbook = new Workbook('en-US');
const sheet = new LombokSheet(document.getElementById('app')!, { workbook });

sheet.on('cellChange', (row, col) => {
  console.log(`Cell (${row}, ${col}) changed`);
});

// Programmatic undo/redo (also bound to Ctrl+Z / Ctrl+Y in the rendered grid)
sheet.undo();
sheet.redo();
sheet.canUndo(); // boolean
sheet.canRedo(); // boolean
```

**Interaction model:** double-click a cell to edit; type a value or a formula
(anything starting with `=`); press Enter to commit, Escape to cancel, or click away
(blur) to commit.

---

## TypeScript/JS: formulas

You don't usually call the formula engine directly — `LombokSheet` does it for you when
a cell's raw input starts with `=`. But it's a public API if you need it standalone
(e.g. to validate a formula string before accepting it, or to build your own UI):

```ts
import { Sheet, parseFormula, evaluate, makeSheetResolver, FormulaError } from 'lomboktablesheet';

const sheet = new Sheet('S1');
sheet.setValue(0, 0, 10); // A1
sheet.setValue(0, 1, 20); // B1

const ast = parseFormula('=SUM(A1:B1)*2');
const result = evaluate(ast, makeSheetResolver(sheet));

if (result instanceof FormulaError) {
  console.error('Formula error:', result.code); // e.g. '#DIV/0!'
} else {
  console.log(result); // 60
}
```

**Supported syntax:** `+ - * / ^`, comparisons (`= <> < <= > >=`), cell refs (`A1`),
ranges (`A1:B3`), parentheses, and functions `SUM`, `AVG`, `MIN`, `MAX`, `COUNT`, `IF`,
`ROUND`, `CONCAT`. Circular references resolve to `#CIRC!` rather than hanging. Formulas
nested more than 200 levels deep (parens or unary chains) are rejected with a clear error
rather than risking a stack overflow — see SECURITY.md.

### Using the transaction layer directly (undo/redo without a DOM)
```ts
import { Sheet, TransactionalSheet } from 'lomboktablesheet';

const sheet = new Sheet('S1');
const tx = new TransactionalSheet(sheet);

tx.setCellInput(0, 0, 10);
tx.setCellInput(0, 1, '=A1*2'); // recalculates automatically
tx.undo(); // reverts the last commit, including sheet dimensions
tx.redo();
tx.dependentsOf('A1'); // -> cell refs of formulas that reference A1
```

---

## TypeScript/JS: split & merge

```ts
import { splitByRows, splitByColumns, splitBySheet, merge } from 'lomboktablesheet';

const [top, bottom] = splitByRows(workbook, 'Sheet1', 100);      // split at row 100
const [left, right] = splitByColumns(workbook, 'Sheet1', 3);      // split at column 3
const perSheet = splitBySheet(workbook);                          // one workbook per sheet

const combined = merge([top, bottom], { onConflict: 'left-wins' });
// onConflict: 'left-wins' (default) | 'right-wins' | 'error'
```

---

## TypeScript/JS: templates

Templates are purely presentational — they never touch data, so exporting to
CSV/JSON strips them entirely, as it should.

```ts
import { defaultTemplates } from 'lomboktablesheet';

defaultTemplates.list(); // ['plain', 'report', 'invoice', 'financial-statement']

defaultTemplates.register({
  name: 'dashboard',
  description: 'Compact dashboard style',
  header: { bold: true, sticky: true },
  zebraRows: true,
  borders: 'horizontal',
  numberAlign: 'right',
  cssHooks: ['lts-dashboard'], // class names LombokCSS (if present) can theme
});
```

---

## TypeScript/JS: internationalization

```ts
import { I18n, t } from 'lomboktablesheet';

const i18n = new I18n('ar-EG');
i18n.isRtl();                          // true
i18n.formatNumber(1234.5);             // locale-formatted
i18n.formatCurrency(1500, 'USD');
i18n.formatDate(new Date());

t('id', 'export'); // 'Ekspor' — UI-string catalog lookup (11 built-in locales)
```

Locale is also accepted directly by `LombokTable`/`LombokSheet`/decoders via a
`locale` option, and drives both `Intl` cell formatting and RTL layout automatically.

---

## TypeScript/JS: React adapter

```tsx
import { LombokTableReact, LombokSheetReact } from 'lomboktablesheet/react';

function ReportView({ rows }: { rows: unknown[][] }) {
  return <LombokTableReact data={rows} template="report" locale="en-US" />;
}

function EditableView({ workbook }: { workbook: Workbook }) {
  return (
    <LombokSheetReact
      workbook={workbook}
      onCellChange={(row, col) => console.log('changed', row, col)}
    />
  );
}
```

This is an opt-in sub-path — importing it does not add React to projects that don't
use it (the core bundle has zero React code, verified in CI).

---

## TypeScript/JS: Vue adapter

```vue
<script setup lang="ts">
import { LombokTableVue, LombokSheetVue } from 'lomboktablesheet/vue';
import { ref } from 'vue';
const workbook = ref(/* ... */);
</script>

<template>
  <LombokTableVue :workbook="workbook" template="invoice" />
  <LombokSheetVue :workbook="workbook" @cell-change="(r, c) => console.log(r, c)" />
</template>
```

---

## PHP: installation & concepts

Same `Workbook`/`Sheet`/`Cell` model, structurally translated:

```php
use Lombok\TableSheet\Core\Workbook;
use Lombok\TableSheet\Core\Sheet;

$workbook = Workbook::fromRows([
    ['name', 'age'],
    ['Alice', 30],
    ['Bob', 25],
], 'People', 'en-US');

$sheet = new Sheet('Custom');
$sheet->setValue(0, 0, 'Hello');
$sheet->setValue(0, 1, 42);

echo json_encode($workbook->sheets[0]->toRows());
```

**Scope note:** the PHP port is a data/formula layer, not a UI library — PHP has no
DOM to render into. There is no `LombokTable`/`LombokSheet` equivalent in PHP; instead,
use it inside your own framework (Laravel, Symfony, plain PHP) to build/transform data
that you then export as CSV/JSON, or render however your framework does tables.

---

## PHP: import & export

```php
use Lombok\TableSheet\Formats\CsvCodec;
use Lombok\TableSheet\Formats\JsonCodec;
use Lombok\TableSheet\Formats\MarkdownCodec;

$result = CsvCodec::decode("name,age\nAlice,30\n");
if (!empty($result->warnings)) {
    foreach ($result->warnings as $w) { error_log($w->message); }
}
$csvOut = CsvCodec::encode($result->workbook);

$jsonResult = JsonCodec::decode('[{"name":"Alice","age":30}]');
$jsonOut = JsonCodec::encode($jsonResult->workbook, pretty: true);

$mdOut = MarkdownCodec::encode($result->workbook); // export only, same rationale as TS
```

---

## PHP: formulas

```php
use Lombok\TableSheet\Core\Sheet;
use Lombok\TableSheet\Core\FormulaEngine;
use Lombok\TableSheet\Core\FormulaError;

$sheet = new Sheet('S1');
$sheet->setValue(0, 0, 10);
$sheet->setValue(0, 1, 20);

$ast = FormulaEngine::parse('=SUM(A1:B1)*2');
$result = FormulaEngine::evaluate($ast, FormulaEngine::sheetResolver($sheet));

if ($result instanceof FormulaError) {
    echo "Error: {$result->code}\n";
} else {
    echo $result . "\n"; // 60
}
```

Same syntax support and same 200-level nesting-depth guard as the TS engine — both
were built to the same spec and verified to produce identical results on the same
inputs (see ARCHITECTURE.md §8 and SECURITY.md).

---

## PHP: split & merge

```php
use Lombok\TableSheet\Core\SplitMerge;

[$top, $bottom] = SplitMerge::splitByRows($workbook, 'Sheet1', 100);
[$left, $right] = SplitMerge::splitByColumns($workbook, 'Sheet1', 3);
$perSheet = SplitMerge::splitBySheet($workbook);

$combined = SplitMerge::merge([$top, $bottom], 'left-wins'); // or 'right-wins' | 'error'
```

---

## Go: installation & concepts

```bash
go get github.com/codinglombok/lomboktablesheet-go
```

Same `Workbook`/`Sheet`/`Cell` model as TS and PHP, structurally translated:

```go
import lombok "github.com/codinglombok/lomboktablesheet-go/lombok"

workbook := lombok.WorkbookFromRows([][]interface{}{
    {"name", "age"},
    {"Alice", 30.0},
    {"Bob", 25.0},
}, "People", "en-US")

sheet := lombok.NewSheet("Custom")
sheet.SetValue(0, 0, "Hello")
sheet.SetValue(0, 1, 42.0)
```

**Scope note:** same as PHP — Go has no DOM, so this is a data/formula layer, not a UI
library. No `LombokTable`/`LombokSheet` equivalent exists in Go.

## Go: import & export

```go
result := lombok.DecodeCsv("name,age\nAlice,30\n", lombok.CsvDecodeOptions{})
if len(result.Warnings) > 0 {
    for _, w := range result.Warnings { log.Println(w.Message) }
}
csvOut := lombok.EncodeCsv(result.Workbook, "", 0) // delimiter 0 = default ','

jsonResult := lombok.DecodeJson(`[{"name":"Alice","age":30}]`, lombok.JsonDecodeOptions{})
jsonOut, _ := lombok.EncodeJson(jsonResult.Workbook, "", true) // pretty=true

mdOut := lombok.EncodeMarkdown(result.Workbook, "") // export only, same rationale as TS/PHP
```

## Go: formulas

```go
sheet := lombok.NewSheet("S1")
sheet.SetValue(0, 0, 10.0)
sheet.SetValue(0, 1, 20.0)

ast, err := lombok.ParseFormula("=SUM(A1:B1)*2")
if err != nil { /* syntax or nesting-depth error */ }
result := lombok.Evaluate(ast, lombok.SheetResolver(sheet))

if fe, ok := result.(lombok.FormulaError); ok {
    fmt.Println("Error:", fe.Code)
} else {
    fmt.Println(result) // 60
}
```

Same syntax support and the same 200-level nesting-depth guard as the TS/PHP engines —
`Evaluate` additionally wraps execution in a `recover()`, so an unexpected internal
failure degrades to a `#ERROR!` value rather than panicking your program.

## Go: split & merge

```go
top, bottom, err := lombok.SplitByRows(workbook, "Sheet1", 100)
left, right, err := lombok.SplitByColumns(workbook, "Sheet1", 3)
perSheet := lombok.SplitBySheet(workbook)

combined, err := lombok.Merge([]*lombok.Workbook{top, bottom}, lombok.LeftWins)
```

---

## Security-relevant options

Every decoder that touches untrusted input has configurable resource limits — the
defaults are generous but not infinite. Lower them if you're accepting arbitrary
user uploads:

```ts
// TS
decodeCsv(text, { maxInputBytes: 10 * 1024 * 1024, maxRows: 100_000 });
decodeJson(text, { maxInputBytes: 10 * 1024 * 1024 });
decodeHtml(html, { maxInputBytes: 10 * 1024 * 1024 });
decodeXlsx(buf, { maxEntrySize: 50 * 1024 * 1024, maxTotalSize: 100 * 1024 * 1024, maxEntries: 100 });
```
```php
// PHP
CsvCodec::decode($text, maxInputBytes: 10 * 1024 * 1024);
JsonCodec::decode($text, maxInputBytes: 10 * 1024 * 1024);
```

See `SECURITY.md` for what these guard against and why the defaults are what they are.

---

## Troubleshooting

**"Cannot find module 'lomboktablesheet'"** — the package isn't published yet (see
PROJECT_SUMMARY.md's honest scope section). Build from source: `npm install && npm run
build` in the repo root, then import from `./dist/index.js`.

**Decoders return `workbook: null`** — check `warnings`; decoders never throw on bad
input by design, they return warnings instead. A `null` workbook with a warning like
"exceeds the configured size limit" means a resource guard rejected the input — see
Security-relevant options above to adjust the limit if the input is legitimately large.

**Formula returns a string like `#DIV/0!` instead of throwing** — that's by design.
Formula errors are typed values (`FormulaError` in TS, an instance with a `->code`
property in PHP), not exceptions, matching how spreadsheet software has always
surfaced these to users. Check `result instanceof FormulaError`.

**PHP: "Class not found" errors when not using Composer** — if you're working from
this repo directly without `composer install` (e.g. because Packagist isn't reachable
in your environment), use the bundled `ports/php/autoload.php`, which eagerly requires
every source file rather than relying on PSR-4 autoloading.
