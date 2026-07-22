# DETAILED USAGE — Complete API Reference (All Supported Languages)

This is the exhaustive reference. For a faster-reading how-to, see `USAGE.md`. For
design rationale, see `ARCHITECTURE.md`. This document covers **every public function,
class, and method** across all three implemented languages (TypeScript/JS, PHP, Go),
with full parameter tables, return types, error/edge-case behavior, and worked examples.

## Table of contents

1. [Language support matrix](#1-language-support-matrix)
2. [Shared concepts across all languages](#2-shared-concepts-across-all-languages)
3. [TypeScript/JS — complete API reference](#3-typescriptjs--complete-api-reference)
4. [PHP — complete API reference](#4-php--complete-api-reference)
5. [Go — complete API reference](#5-go--complete-api-reference)
6. [Formula language reference](#6-formula-language-reference-shared-across-ts-php-go)
7. [Error code reference](#7-error-code-reference)
8. [Internationalization reference](#8-internationalization-reference)
9. [Security/resource-limit options reference](#9-securityresource-limit-options-reference)
10. [Worked examples, end to end](#10-worked-examples-end-to-end)
11. [Edge cases and behavior notes](#11-edge-cases-and-behavior-notes)
12. [FAQ](#12-faq)

---

## 1. Language support matrix

| Capability | TypeScript/JS | PHP | Go |
|---|:---:|:---:|:---:|
| Core data model (`Workbook`/`Sheet`/`Cell`) | ✅ | ✅ | ✅ |
| Formula engine (no dynamic code execution) | ✅ | ✅ | ✅ |
| Circular-reference detection | ✅ | ✅ | ✅ |
| Formula nesting-depth guard (DoS hardening) | ✅ (200) | ✅ (200) | ✅ (200) |
| CSV import/export | ✅ | ✅ | ✅ (stdlib `encoding/csv`) |
| JSON import/export | ✅ | ✅ | ✅ (stdlib `encoding/json`) |
| Markdown export (import intentionally unsupported) | ✅ | ✅ | ✅ |
| HTML import/export | ✅ | — | — |
| XLSX import/export | ✅ (hand-written zip, zero deps) | — | — |
| Split (rows/columns/sheet) | ✅ | ✅ | ✅ |
| Merge (with conflict strategy) | ✅ | ✅ | ✅ |
| Templates (presentational presets) | ✅ | — | — |
| i18n cell formatting (`Intl`) | ✅ | — | — |
| i18n UI-string catalog (30 locales) | ✅ | — | — |
| Editable Spreadsheet DOM renderer | ✅ | — | — |
| Read-only Table DOM renderer | ✅ | — | — |
| Undo/redo transaction layer | ✅ | — | — |
| React adapter | ✅ | n/a | n/a |
| Vue adapter | ✅ | n/a | n/a |
| Resource-exhaustion guards on decoders | ✅ | ✅ | ✅ |

**Why PHP and Go don't have "—" rows filled in:** neither language has a DOM to render
a UI into, so the Table/Sheet renderers, templates (which are presentational), and i18n
*cell formatting* (which exists to feed those renderers) don't have an equivalent
target. This is a deliberate scope decision (MASTERPROMPT.md non-negotiable #8), not
missing work — see each language's port README for the full rationale.

---

## 2. Shared concepts across all languages

Every language implements the same conceptual model:

- **`Cell`**: `{ value, type, formula? }`. `type` is one of `empty | string | number |
  boolean | date | formula`.
- **`Sheet`**: a named, 2D grid of cells, addressed by zero-indexed `(row, col)`.
  Sheets only ever **grow** as you write cells further out — there's no implicit
  shrink. (TS's transaction/undo layer explicitly restores prior dimensions when
  needed; see §11 for why that matters.)
- **`Workbook`**: one or more `Sheet`s plus a `locale` (BCP-47, e.g. `"id-ID"`).
- **Decoders never throw on malformed *data*.** A decoder returns a result object
  containing either a workbook or `null` plus a list of warnings/messages. Exceptions/
  errors are reserved for programmer errors (e.g. calling `splitByRows` on a sheet name
  that doesn't exist) or, in Go, for a handful of explicit `error` returns.
- **Formula evaluation never throws either.** A formula error (`#DIV/0!`, `#CIRC!`,
  `#NAME?`, `#VALUE!`, `#REF!`, `#ERROR!`) is a typed *value*, matching how every
  spreadsheet application (Excel, Sheets, Calc) has always surfaced these to users.
- **Cell references** use standard `A1` notation. Column letters are 1-indexed in the
  letter sense (`A`=1) but `CellRef.row`/`.col` in code are always zero-indexed.

---

## 3. TypeScript/JS — complete API reference

### 3.1 `core/model` — `Workbook`, `Sheet`, `Cell`

#### `class Sheet`
```ts
new Sheet(name: string, rowCount = 0, colCount = 0)
```
| Method | Signature | Notes |
|---|---|---|
| `getCell` | `(row: number, col: number) => Cell` | Returns `{ value: null, type: 'empty' }` if unset |
| `setCell` | `(row: number, col: number, cell: Cell) => void` | Throws `RangeError` if `row < 0 \|\| col < 0`. Grows `rowCount`/`colCount` if needed |
| `setValue` | `(row: number, col: number, value: CellValue) => void` | Convenience wrapper; infers `type` from the JS value's `typeof` |
| `iterCells` | `() => IterableIterator<[CellRef, Cell]>` | Iterates only cells that have been explicitly set (sparse) |
| `toRows` | `() => CellValue[][]` | Dense grid, bounds-checked against current `rowCount`/`colCount` |
| `clone` | `() => Sheet` | Deep, independent copy |

#### `class Workbook`
| Method | Signature | Notes |
|---|---|---|
| `addSheet` | `(sheet: Sheet) => void` | Appends |
| `sheet` | `(name: string) => Sheet \| undefined` | First sheet matching `name` |
| `Workbook.fromRows` (static) | `(rows: CellValue[][], sheetName?, locale?) => Workbook` | Builds a single-sheet workbook from a 2D array |

### 3.2 `formats/csv`
| Function | Signature |
|---|---|
| `decodeCsv` | `(text: string, opts?: { delimiter?, sheetName?, locale?, maxInputBytes?, maxRows? }) => ImportResult` |
| `encodeCsv` | `(workbook: Workbook, opts?: { sheetName?, delimiter? }) => string` |

`ImportResult = { workbook: Workbook \| null; warnings: ImportWarning[] }`. Coercion
rules on decode: empty string → `null`; `"true"`/`"false"` → boolean; numeric-looking
strings → `number`; everything else stays `string`.

### 3.3 `formats/json`
| Function | Signature |
|---|---|
| `decodeJson` | `(text: string, opts?: { sheetName?, locale?, maxInputBytes? }) => ImportResult` |
| `encodeJson` | `(workbook: Workbook, opts?: { sheetName?, pretty? }) => string` |
| `encodeMarkdown` | `(workbook: Workbook, opts?: { sheetName? }) => string` |

`decodeJson` expects the JSON root to be an array of records (objects); the column set
is the union of every record's keys, in first-seen order. `encodeMarkdown` is
**export-only** — see §11 for why import isn't offered.

### 3.4 `formats/xlsx`
| Function | Signature |
|---|---|
| `decodeXlsx` | `(buf: Buffer, opts?: ReadZipOptions) => ImportResult` |
| `encodeXlsx` | `(workbook: Workbook) => Buffer` |

`ReadZipOptions = { maxEntrySize?, maxTotalSize?, maxEntries? }` — see §9. Supported
subset: cell values (string/number/boolean), multiple sheets, sheet names. Not
supported: styles, merged cells, formulas-in-file, charts, comments (documented subset,
see ARCHITECTURE.md §3.4).

### 3.5 `formats/html`
| Function | Signature |
|---|---|
| `decodeHtml` | `(html: string, opts?: { sheetName?, locale?, maxInputBytes? }) => ImportResult` |
| `encodeHtml` | `(workbook: Workbook, opts?: { sheetName?, className? }) => string` |

Decoder is regex-based (no DOM dependency); parses the first `<table>` found, handles
`<thead>`/`<tbody>`, decodes basic HTML entities. Doesn't handle nested tables,
`colspan`/`rowspan`.

### 3.6 `core/splitMerge`
| Function | Signature |
|---|---|
| `splitByRows` | `(workbook: Workbook, sheetName: string, at: number) => [Workbook, Workbook]` |
| `splitByColumns` | `(workbook: Workbook, sheetName: string, at: number) => [Workbook, Workbook]` |
| `splitBySheet` | `(workbook: Workbook) => Workbook[]` |
| `merge` | `(workbooks: Workbook[], opts?: { onConflict?: ConflictStrategy }) => Workbook` |

`ConflictStrategy = 'left-wins' | 'right-wins' | 'error'`. Note: despite the name,
`left-wins`/`right-wins` currently both result in row-wise append for same-named
sheets (first-workbook's rows first) — `'error'` is the strategy that behaves
distinctly, by rejecting the merge outright on any duplicate sheet name. Split
functions throw a plain `Error` if `sheetName` doesn't exist in the workbook.

### 3.7 `templates/registry`
```ts
class TemplateRegistry {
  get(name: string): TableTemplate;       // falls back to 'plain' if not found
  register(template: TableTemplate): void;
  list(): string[];
}
export const defaultTemplates: TemplateRegistry; // pre-loaded with 4 built-ins
```
`TableTemplate = { name, description, header: { bold, background?, sticky? }, zebraRows,
borders: 'none'|'grid'|'horizontal', numberAlign: 'left'|'right', cssHooks: string[] }`.
Built-ins: `plain`, `report`, `invoice`, `financial-statement`.

### 3.8 `i18n`
```ts
class I18n {
  constructor(locale = 'en-US')
  formatNumber(value: number, opts?: Intl.NumberFormatOptions): string;
  formatCurrency(value: number, currency: string): string;
  formatDate(value: Date, opts?: Intl.DateTimeFormatOptions): string;
  formatCell(value: CellValue): string;   // dispatches by type; number → formatNumber, boolean → 'TRUE'/'FALSE'
  isRtl(): boolean;                        // true for ar/he/fa/ur primary subtags
}
export const catalog: Record<string, Record<string, string>>; // 30 locales x 10 keys
export const localesList: string[];                            // the 30 ISO 639-1 codes
export function t(locale: string, key: string): string;         // falls back to 'en', then to the key itself
```
See §8 for the full locale list and key set.

### 3.9 `adapters/dom` — `LombokTable`
```ts
new LombokTable(container: HTMLElement, opts?: TableOptions)
```
`TableOptions = { data?, columns?, workbook?, template?, locale?, sheetName? }`. `data`
accepts either a 2D array or an array of records (objects) — records mode infers
columns from `Object.keys()` of the first record unless `columns` is given explicitly.

| Method | Signature |
|---|---|
| `setData` | `(data: unknown[][] \| Record<string, unknown>[], columns?: string[]) => void` |
| `getWorkbook` | `() => Workbook` |

Renders every cell via `textContent`, never `innerHTML` (see SECURITY.md).

### 3.10 `adapters/sheet` — `LombokSheet`
```ts
new LombokSheet(container: HTMLElement, opts: SheetOptions)
```
`SheetOptions = { workbook: Workbook, sheetName?, locale? }`.

| Method | Signature |
|---|---|
| `on` | `(event: 'cellChange', handler: (row, col) => void) => void` |
| `undo` / `redo` | `() => void` |
| `canUndo` / `canRedo` | `() => boolean` |
| `getWorkbook` | `() => Workbook` |

Interaction: double-click a cell → input appears → Enter commits, Escape cancels,
blur commits. `Ctrl+Z`/`Ctrl+Y` (or `Ctrl+Shift+Z`) trigger undo/redo on the rendered
grid directly.

### 3.11 `core/formula`
```ts
function parseFormula(formula: string): Node;                          // throws on syntax error or excessive nesting
function evaluate(node: Node, resolver: CellResolver): FormulaValue;   // never throws — returns FormulaError on failure
function makeSheetResolver(sheet: Sheet, visiting?: Set<string>): CellResolver;
function extractDependencies(node: Node): string[];                     // expands ranges into individual refs
function parseCellRef(ref: string): { row: number; col: number };      // throws on malformed ref like "1A"
function cellRefName(row: number, col: number): string;                 // e.g. (0,27) -> "AB1"
class FormulaError { code: '#REF!' | '#DIV/0!' | '#CIRC!' | '#NAME?' | '#VALUE!' | '#ERROR!' }
```
See §6 for the full formula language grammar and function list.

### 3.12 `core/transaction` — `TransactionalSheet`
```ts
new TransactionalSheet(sheet: Sheet, opts?: { maxHistory?: number })  // maxHistory default 200
```
| Method | Signature | Notes |
|---|---|---|
| `setCellInput` | `(row, col, raw: string \| number \| boolean \| null) => CommitResult` | `raw` starting with `=` is stored as a formula; everything else as a literal. Triggers a full recalculation sweep. |
| `undo` / `redo` | `() => boolean` | Returns `false` if the respective stack is empty. Restores exact prior/next cell values **and dimensions**. |
| `canUndo` / `canRedo` | `() => boolean` | |
| `recalculate` | `() => string[]` | Re-evaluates every formula cell; returns the list of touched cell keys |
| `dependentsOf` | `(ref: string) => string[]` | Cell keys (`"row:col"` format) of formulas that reference `ref` |

### 3.13 `adapters/react` (sub-path: `lomboktablesheet/react`)
```tsx
function LombokTableReact(props: TableOptions & { className?: string }): JSX.Element;
function LombokSheetReact(props: SheetOptions & { className?: string; onCellChange?: (row, col) => void }): JSX.Element;
```
Both mount the vanilla core into a `<div ref>` via `useEffect`; `data`/`columns` changes
call `setData` rather than remounting. `workbook`/`template`/`locale`/`sheetName`
changes do remount (they're structural, not incremental-update-friendly).

### 3.14 `adapters/vue` (sub-path: `lomboktablesheet/vue`)
```ts
const LombokTableVue: DefineComponent<{ data?, columns?, workbook?, template?, locale?, sheetName? }>;
const LombokSheetVue: DefineComponent<{ workbook, sheetName?, locale? }, { cellChange: [row, col] }>;
```
Vue 3 Composition API components; same mount-the-vanilla-core-in-onMounted approach as
the React adapter.

---

## 4. PHP — complete API reference

Namespace root: `Lombok\TableSheet\`.

### 4.1 `Core\Sheet` / `Core\Workbook` / `Core\Cell`
```php
final class Cell {
    public function __construct(public mixed $value, public string $type = 'empty',
        public ?string $formula = null, public ?string $styleRef = null) {}
}

final class Sheet {
    public function __construct(public string $name, public int $rowCount = 0, public int $colCount = 0) {}
    public function getCell(int $row, int $col): Cell;
    public function setCell(int $row, int $col, Cell $cell): void;   // throws RangeException on negative coords
    public function setValue(int $row, int $col, mixed $value): void;
    public function iterCells(): iterable;                            // yields [CellRef, Cell]
    public function toRows(): array;                                  // bounds-checked, same as TS
    public function clone(): self;
}

final class Workbook {
    public array $sheets = [];
    public string $locale;
    public function __construct(string $locale = 'en-US') {}
    public function addSheet(Sheet $sheet): void;
    public function sheet(string $name): ?Sheet;
    public static function fromRows(array $rows, string $sheetName = 'Sheet1', string $locale = 'en-US'): self;
}
```

### 4.2 `Formats\CsvCodec`
```php
final class CsvCodec {
    public static function decode(
        string $text, string $delimiter = ',', string $sheetName = 'Sheet1',
        string $locale = 'en-US', int $maxInputBytes = 100*1024*1024
    ): ImportResult;
    public static function encode(Workbook $workbook, ?string $sheetName = null, string $delimiter = ','): string;
}
```
Uses PHP's native `fgetcsv`/`fputcsv` on an in-memory stream for RFC-4180 correctness.

### 4.3 `Formats\JsonCodec` / `Formats\MarkdownCodec`
```php
final class JsonCodec {
    public static function decode(string $text, string $sheetName = 'Sheet1',
        string $locale = 'en-US', int $maxInputBytes = 100*1024*1024): ImportResult;
    public static function encode(Workbook $workbook, ?string $sheetName = null, bool $pretty = true): string;
}
final class MarkdownCodec {
    public static function encode(Workbook $workbook, ?string $sheetName = null): string; // export-only
}
```

### 4.4 `Core\SplitMerge`
```php
final class SplitMerge {
    public static function splitByRows(Workbook $wb, string $sheetName, int $at): array;    // [Workbook, Workbook]
    public static function splitByColumns(Workbook $wb, string $sheetName, int $at): array;  // [Workbook, Workbook]
    public static function splitBySheet(Workbook $wb): array;                                // Workbook[]
    public static function merge(array $workbooks, string $onConflict = 'left-wins'): Workbook;
}
```
Throws `InvalidArgumentException` for a missing sheet name or an empty `$workbooks`
array; throws `RuntimeException` for `$onConflict === 'error'` with duplicate sheet
names.

### 4.5 `Core\FormulaEngine`
```php
final class FormulaEngine {
    public static function parse(string $formula): Node;                       // throws RuntimeException on syntax/depth error
    public static function evaluate(Node $node, CellResolver $resolver): mixed; // never throws — returns FormulaError
    public static function sheetResolver(Sheet $sheet, array $visiting = []): CellResolver;
    public static function extractDependencies(Node $node): array;
}
final class CellRefUtil {
    public static function parse(string $ref): array;      // ['row' => int, 'col' => int]
    public static function name(int $row, int $col): string;
}
final class FormulaError {
    public function __construct(public string $code) {}
    public function __toString(): string;
}
```

---

## 5. Go — complete API reference

Package: `github.com/codinglombok/lomboktablesheet-go/lombok`.

### 5.1 Core types
```go
type CellType string // "empty" | "string" | "number" | "boolean" | "formula"
type Cell struct { Value interface{}; Type CellType; Formula string }
type CellRef struct { Row, Col int }

type Sheet struct { Name string; RowCount, ColCount int /* + unexported storage */ }
func NewSheet(name string) *Sheet
func (s *Sheet) GetCell(row, col int) Cell
func (s *Sheet) SetCell(row, col int, cell Cell) error   // error (not panic) on negative coords
func (s *Sheet) SetValue(row, col int, value interface{}) error
func (s *Sheet) Resize(rowCount, colCount int)             // explicit shrink support
func (s *Sheet) ToRows() [][]interface{}                    // bounds-checked
func (s *Sheet) IterCells() []struct{ Ref CellRef; Cell Cell }
func (s *Sheet) Clone() *Sheet

type Workbook struct { Sheets []*Sheet; Locale string }
func NewWorkbook(locale string) *Workbook
func (w *Workbook) AddSheet(s *Sheet)
func (w *Workbook) Sheet(name string) *Sheet
func WorkbookFromRows(rows [][]interface{}, sheetName, locale string) *Workbook
```

### 5.2 CSV codec
```go
type CsvDecodeOptions struct { Delimiter rune; SheetName, Locale string; MaxInputBytes, MaxRows int }
func DecodeCsv(text string, opts CsvDecodeOptions) ImportResult
func EncodeCsv(w *Workbook, sheetName string, delimiter rune) string
```
Uses Go's standard-library `encoding/csv` — not a hand-rolled parser (see §11 for why
that's a deliberate difference from the TS core's XLSX approach).

### 5.3 JSON / Markdown codecs
```go
type JsonDecodeOptions struct { SheetName, Locale string; MaxInputBytes int }
func DecodeJson(text string, opts JsonDecodeOptions) ImportResult
func EncodeJson(w *Workbook, sheetName string, pretty bool) (string, error)
func EncodeMarkdown(w *Workbook, sheetName string) string // export-only
```

### 5.4 Split/merge
```go
type ConflictStrategy string // LeftWins | RightWins | OnError
func SplitByRows(w *Workbook, sheetName string, at int) (*Workbook, *Workbook, error)
func SplitByColumns(w *Workbook, sheetName string, at int) (*Workbook, *Workbook, error)
func SplitBySheet(w *Workbook) []*Workbook
func Merge(workbooks []*Workbook, onConflict ConflictStrategy) (*Workbook, error)
```

### 5.5 Formula engine
```go
func ParseFormula(formula string) (*Node, error)
func Evaluate(n *Node, resolver CellResolver) FormulaValue  // never panics — recover()'s internally, returns #ERROR!
func SheetResolver(sheet *Sheet) CellResolver
func ExtractDependencies(n *Node) []string
func ParseCellRef(ref string) (CellRef, error)
func CellRefName(row, col int) string
type FormulaError struct { Code string }
func (e FormulaError) Error() string
type CellResolver interface { Resolve(ref string) FormulaValue }
```
`Evaluate` wraps evaluation in a `defer/recover()` — Go's idiomatic equivalent of the
"never throw on data" contract, since Go doesn't have exceptions in the JS/PHP sense.

---

## 6. Formula language reference (shared across TS, PHP, Go)

### Grammar
```
expr       := comparison
comparison := addsub (('=' | '<>' | '<' | '<=' | '>' | '>=') addsub)*
addsub     := muldiv (('+' | '-') muldiv)*
muldiv     := power (('*' | '/') power)*
power      := unary ('^' unary)*
unary      := ('-' | '+')? primary
primary    := NUMBER | STRING | REF | RANGE | CALL | '(' expr ')'
CALL       := IDENT '(' (expr (',' expr)*)? ')'
REF        := [A-Z]+[0-9]+          e.g. A1, AB27
RANGE      := REF ':' REF            e.g. A1:B10
```

### Built-in functions
| Function | Arity | Behavior |
|---|---|---|
| `SUM(range\|args...)` | 1+ | Sum of numeric arguments (non-numeric args ignored) |
| `AVG(range\|args...)` | 1+ | Arithmetic mean of numeric arguments; `0` if none |
| `MIN(range\|args...)` | 1+ | Minimum numeric argument |
| `MAX(range\|args...)` | 1+ | Maximum numeric argument |
| `COUNT(range\|args...)` | 1+ | Count of numeric arguments |
| `ROUND(value, digits)` | 2 | Rounds `value` to `digits` decimal places |
| `IF(cond, then, else)` | 3 | `cond` truthy → `then`, else `else` |
| `CONCAT(args...)` | 1+ | String-concatenates all arguments (any type, stringified) |

### Hardening (identical across all three languages)
- **Nesting depth limit: 200.** Applies to both parenthesized-expression nesting and
  chained unary operators (e.g. `-----5`). Exceeding it raises a clear error rather
  than risking a native stack overflow.
- **Circular references** resolve to `#CIRC!` via a per-evaluation-chain "visiting set"
  — a formula that (directly or transitively) references itself during its own
  evaluation gets this error instead of infinite-looping.
- **No dynamic code execution, ever.** Every language's engine is a real
  tokenizer → parser → AST → evaluator. This is non-negotiable per MASTERPROMPT.md.

---

## 7. Error code reference

These are the same across TS, PHP, and Go — a `FormulaError`/error-value with one of:

| Code | Meaning | Triggered by |
|---|---|---|
| `#DIV/0!` | Division by zero | `=A1/0` or any division where the divisor evaluates to `0` |
| `#CIRC!` | Circular reference | A formula that (directly or transitively) depends on its own cell |
| `#NAME?` | Unknown function | `=NOTAREALFUNC(1)` |
| `#VALUE!` | Type mismatch | Arithmetic on a non-numeric operand; a bare range used where a scalar is expected |
| `#REF!` | Invalid reference | A malformed cell reference reaches the resolver |
| `#ERROR!` | Generic/internal error | Catch-all for anything that doesn't fit the above (e.g. a Go internal panic recovered by `Evaluate`) |

Check for these with `instanceof FormulaError` (TS), `instanceof FormulaError` (PHP), or
a type assertion `result.(FormulaError)` (Go) — never by comparing the *displayed*
value to a string, since a legitimate cell could coincidentally contain text like
`"#DIV/0!"`.

---

## 8. Internationalization reference

**30 locales**, each with the same 10 UI-chrome keys (TypeScript/JS only — see §1 for
why PHP/Go don't have a UI layer to translate).

### Supported locale codes
`ar, bn, cs, da, de, el, en, es, fa, fi, fr, he, hi, id, it, ja, ko, ms, nl, pl, pt, ro,
ru, sv, sw, th, tr, uk, vi, zh`

(Arabic, Bengali, Czech, Danish, German, Greek, English, Spanish, Persian/Farsi,
Finnish, French, Hebrew, Hindi, Indonesian, Italian, Japanese, Korean, Malay, Dutch,
Polish, Portuguese, Romanian, Russian, Swedish, Swahili, Thai, Turkish, Ukrainian,
Vietnamese, Chinese Simplified.)

### Keys
`export, import, addRow, addColumn, search, save, cancel, delete, edit, close`

### Accuracy note
These are best-effort translations of common software UI terms — accurate for
straightforward cases like "Save"/"Cancel"/"Search", but **not** professionally
certified translations. If you're building a product for native speakers of any of
these languages, a native-speaker review of the specific 10 strings you actually use
is cheap insurance. Corrections are welcome — each locale lives in its own file at
`src/i18n/locales/<code>.ts`, so a fix is a one-file PR.

### RTL locales
`ar` (Arabic), `he` (Hebrew), `fa` (Persian/Farsi) — plus `ur` (Urdu) is recognized by
`isRtl()` even though it doesn't yet have its own UI-string catalog file (a good
candidate for a future contribution).

### Cell-data formatting (separate from the UI catalog)
Number/date/currency formatting for **cell values** (not UI chrome) uses the browser/
Node's built-in `Intl` API directly via `I18n.formatNumber`/`formatCurrency`/
`formatDate` — this works for far more locales than the 30-language UI catalog, since
`Intl` has its own much larger built-in locale database.

---

## 9. Security/resource-limit options reference

All defaults are generous but finite — see SECURITY.md for the reasoning.

| Option | Languages | Default | Guards against |
|---|---|---|---|
| `maxInputBytes` (CSV/JSON/HTML decode) | TS, PHP, Go | 100MB | Oversized-input memory exhaustion |
| `maxRows` (CSV decode) | TS, Go | 2,000,000 | Row-count-based memory exhaustion |
| `maxEntrySize` (XLSX/zip decode) | TS | 200MB | Zip-bomb — enforced by `zlib`'s `maxOutputLength` against *actual* decompressed bytes, not just the declared header value |
| `maxTotalSize` (XLSX/zip decode) | TS | 500MB | Zip-bomb across the whole archive |
| `maxEntries` (XLSX/zip decode) | TS | 10,000 | Archive-entry-count DoS |
| Formula nesting depth | TS, PHP, Go | 200 (fixed, not configurable) | Stack-overflow DoS from pathological formula strings |

Lower these when accepting arbitrary user uploads; there's rarely a reason to raise
them, since a legitimate spreadsheet is very unlikely to need 500MB or 2 million rows.

---

## 10. Worked examples, end to end

### 10.1 TS: CSV upload → validate → XLSX download (Node/Express-style)
```ts
import { decodeCsv, encodeXlsx } from 'lomboktablesheet';

function handleUpload(csvText: string): Buffer | { error: string } {
  const { workbook, warnings } = decodeCsv(csvText, { maxInputBytes: 20 * 1024 * 1024 });
  if (!workbook) {
    return { error: warnings.map(w => w.message).join('; ') };
  }
  return encodeXlsx(workbook);
}
```

### 10.2 TS: a minimal editable spreadsheet page
```ts
import { LombokSheet, Workbook, encodeCsv } from 'lomboktablesheet';

const workbook = new Workbook('en-US');
const sheet = new LombokSheet(document.getElementById('app')!, { workbook });

document.getElementById('export-btn')!.addEventListener('click', () => {
  const csv = encodeCsv(sheet.getWorkbook());
  const blob = new Blob([csv], { type: 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'export.csv';
  a.click();
});
```

### 10.3 PHP: Laravel controller exporting a query result as CSV
```php
use Lombok\TableSheet\Core\Workbook;
use Lombok\TableSheet\Formats\CsvCodec;

class ReportController {
    public function export() {
        $rows = [['Order ID', 'Customer', 'Total']];
        foreach (Order::all() as $order) {
            $rows[] = [$order->id, $order->customer_name, $order->total];
        }
        $workbook = Workbook::fromRows($rows, 'Orders');
        $csv = CsvCodec::encode($workbook);
        return response($csv, 200, [
            'Content-Type' => 'text/csv',
            'Content-Disposition' => 'attachment; filename="orders.csv"',
        ]);
    }
}
```

### 10.4 Go: CLI tool that recalculates a formula-bearing CSV column
```go
package main

import (
	"fmt"
	"os"
	lombok "github.com/codinglombok/lomboktablesheet-go/lombok"
)

func main() {
	data, _ := os.ReadFile("input.csv")
	res := lombok.DecodeCsv(string(data), lombok.CsvDecodeOptions{})
	if res.Workbook == nil {
		fmt.Println("decode failed:", res.Warnings)
		os.Exit(1)
	}
	sheet := res.Workbook.Sheets[0]
	// Compute a total in a new column from columns 0 and 1.
	for r := 1; r < sheet.RowCount; r++ { // skip header row
		ref := func(c int) string { return lombok.CellRefName(r, c) }
		ast, _ := lombok.ParseFormula(fmt.Sprintf("=%s+%s", ref(0), ref(1)))
		total := lombok.Evaluate(ast, lombok.SheetResolver(sheet))
		sheet.SetValue(r, 2, total)
	}
	out := lombok.EncodeCsv(res.Workbook, "", 0)
	fmt.Println(out)
}
```

### 10.5 TS: multi-locale table (RTL-aware) rendered per user preference
```ts
import { LombokTable, localesList } from 'lomboktablesheet';

function renderForUser(container: HTMLElement, data: unknown[][], userLocale: string) {
  const locale = localesList.includes(userLocale.split('-')[0]) ? userLocale : 'en-US';
  new LombokTable(container, { data, locale, template: 'report' });
  // The rendered <table> automatically gets dir="rtl" for ar/he/fa locales.
}
```

---

## 11. Edge cases and behavior notes

- **Sheets only grow, never shrink implicitly.** Writing to `(50, 50)` on an otherwise
  empty sheet makes it a 51×51 grid, even though only one cell has data — `toRows()`
  will include 2,600 `null` cells. This is deliberate (sparse *storage*, dense
  *output*), but worth knowing before writing to far-flung cells casually.
- **`undo()` restores dimensions, not just values.** If an edit grew the sheet,
  undoing it shrinks the sheet back — this wasn't true in an earlier version and was a
  real bug found by fuzz testing (see SECURITY.md). If you're inspecting
  `sheet.rowCount`/`sheet.colCount` after an undo, expect them to reflect the exact
  prior state, not just the cell values.
- **Markdown import is not offered, on purpose.** A Markdown table's cell content can
  itself contain arbitrary Markdown/HTML-like text with no reliable escaping
  convention — round-tripping it back into typed cell values would be lossy and
  ambiguous in ways CSV/JSON/XLSX aren't. `encodeMarkdown` (export) is safe because
  going *from* structured data *to* text has no such ambiguity.
- **`merge()`'s `left-wins`/`right-wins` naming is currently aspirational for
  same-named sheets** — both strategies currently append rows in workbook-array order;
  only `'error'` behaves distinctly (rejects on duplicate names). If you need true
  cell-level conflict resolution, that's a reasonable future enhancement, not
  something silently different from the docs — flagging it here so it's not a surprise.
- **JSON object key order isn't guaranteed across languages.** The Go port's
  `EncodeJson` uses a Go `map` internally, and Go doesn't guarantee map iteration
  order — so `{"name":"Alice","age":30}` from Go might come out as
  `{"age":30,"name":"Alice"}`. This is semantically identical JSON (object key order
  isn't meaningful) but worth knowing if you're diffing raw JSON text across ports.
- **Why Go's CSV/JSON codecs use the standard library and TS's XLSX codec doesn't
  use one.** This looks inconsistent at first glance but isn't: the TS core hand-rolls
  its ZIP/XLSX writer specifically to avoid adding a *third-party* npm dependency,
  which was a stated project goal (lightweight, few dependencies). Go's
  `encoding/csv`/`encoding/json` are standard library — using them adds zero
  dependencies, so there was no reason to hand-roll a CSV parser in Go just for
  "consistency" with a decision that was about avoiding third-party code, not about
  avoiding standard library code.
- **PHP and Go have no formula-*editing* UI**, only the formula *engine*. If you want
  an editable grid in a PHP or Go application, you're building your own UI layer (web
  frontend, TUI, etc.) and calling into the formula engine/data model as a library —
  see the worked examples in §10 for the intended usage pattern (server-side
  computation/transformation, not client-side rendering).

---

## 12. FAQ

**Q: Can I use the PHP or Go ports to render an actual spreadsheet UI?**
No — see §1 and §11. They're data/formula layers. Pair them with your own frontend
(which could even be the TS/JS core, called from a different service) if you need a UI.

**Q: Why doesn't `decodeCsv` throw when I pass it garbage?**
By design (MASTERPROMPT.md non-negotiable #7's spirit, and USAGE.md's troubleshooting
section) — check the `warnings` array instead. This makes batch-processing many
untrusted files simpler (one bad file doesn't need a try/catch around the whole batch).

**Q: Is the formula engine Excel-compatible?**
Partially — same `A1` notation, same general function-call syntax, and the function
names/behaviors that exist (`SUM`, `IF`, etc.) match Excel's. It is **not** a full
Excel formula language implementation — no lookup functions (`VLOOKUP` etc.), no array
formulas, no more than the 8 functions listed in §6. Treat it as "a real formula
engine with a deliberately small function library," not "Excel in miniature."

**Q: How do I add a new locale to the i18n catalog?**
Add `src/i18n/locales/<code>.ts` following the existing files' shape (10 keys, default
export), and it's automatically picked up by `src/i18n/locales/index.ts` the next time
that index is regenerated (or add the import manually — the index is a flat list of
imports, not magic).

**Q: What happens if two people's fuzz-testing/security review disagree with the
"200" nesting-depth limit?**
It's a constant, not something with elaborate tuning logic — if 200 turns out to be too
restrictive for a legitimate use case, that's a one-line change (`maxParseDepth`/
`MAX_DEPTH`/`maxParseDepth` depending on language) plus re-running the existing
pathological-input tests to confirm the new limit still protects against the DoS it was
added for. See SECURITY.md for the original rationale.
