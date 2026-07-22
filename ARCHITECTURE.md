# LombokTableSheet — Architecture & System Design

**Status:** Draft v0.1 (design + MVP stage)
**License:** Apache 2.0
**Companion projects:** [LombokCharts](https://github.com/codinglombok/LombokCharts), [LombokCSS](https://github.com/codinglombok/LombokCSS)

> **Honesty note on scope.** This document lays out the full target architecture for a
> Table + Spreadsheet library ported across TypeScript, PHP, Go, and Rust, published to
> npm/Packagist/Docker/etc. That is a multi-quarter effort for a real team. What ships
> alongside this doc is: (1) this design, (2) a working TypeScript/JavaScript **core**
> implementation with real tests, and (3) scaffolding (package manifests, CI, Dockerfile)
> for the other targets — not yet full ports. No software can honestly claim "audited,
> zero bugs" on day one; what we *can* do is build in the practices (typed core, fuzz/property
> tests, CI gates, semver, changelog) that make that claim earn itself over time.

---

## 1. Requirements

### 1.1 Functional requirements
- Render tabular data as a **Table** (read-focused, virtualized) and a **Spreadsheet**
  (editable grid, formulas, cell references) from the same underlying data model.
- Import/export: CSV, TSV, JSON, XLSX, ODS (stretch), Markdown table, HTML table.
- Split a sheet (by rows, by columns, by sheet/tab) and merge multiple sheets/tables
  into one, with conflict resolution rules.
- Templating system: named layout + style presets (e.g. `invoice`, `report`,
  `financial-statement`, `plain`) that can be applied to a dataset without rewriting data.
- Internationalization: number/date/currency formatting and UI strings for the world's
  major languages (start: en, es, zh, hi, ar, pt, fr, ru, ja, de, id), including RTL layout.
- Framework adapters: vanilla JS, React, Vue, (later) Svelte — thin wrappers around a
  framework-agnostic core, not reimplementations.
- Optional charting via LombokCharts and styling via LombokCSS as peer dependencies,
  never hard dependencies.

### 1.2 Non-functional requirements
- **Performance:** virtualized rendering, target 100k rows / 50 columns interactive
  scroll at 60fps on mid-range hardware; O(1) amortized cell read/write.
- **Bundle size:** core < 15KB gzipped (no framework), adapters add < 3KB each.
- **Portability:** core logic (data model, formula engine, import/export parsers)
  written so it can be mechanically ported — no reliance on JS-only runtime quirks
  (no `Proxy`-only tricks in the algorithmic core, no reliance on GC timing).
- **License cleanliness:** Apache 2.0 throughout; every dependency vetted for
  license compatibility (no GPL/AGPL transitive deps in the core).
- **Security:** no `eval`, no dynamic `Function()` construction for formulas (use a
  parsed AST evaluator instead) — this is the #1 historical vuln class in spreadsheet libs.

### 1.3 Constraints
- Single maintainer team at project start → phased roadmap, not simultaneous ports.
- Must interoperate with existing Lombok ecosystem (Charts, CSS) without tight coupling.

---

## 2. High-Level Design

```
                         ┌─────────────────────────────┐
                         │        Public API            │
                         │  Table() / Spreadsheet()     │
                         └──────────────┬────────────────┘
                                         │
        ┌────────────────────────────────────────────────────┐
        │                  Core Engine (portable)              │
        │  ┌───────────┐ ┌────────────┐ ┌───────────────────┐ │
        │  │ DataModel │ │ FormulaAST │ │ Renderer contract  │ │
        │  │ (grid,    │ │ Evaluator  │ │ (virtual DOM diff, │ │
        │  │ sheets)   │ │ (no eval)  │ │  framework-agnostic│ │
        │  └───────────┘ └────────────┘ └───────────────────┘ │
        │  ┌────────────────────┐ ┌──────────────────────────┐│
        │  │ Import/Export       │ │ Template Registry        ││
        │  │ CSV/TSV/JSON/XLSX/  │ │ (JSON schema + CSS hooks)││
        │  │ MD/HTML             │ │                          ││
        │  └────────────────────┘ └──────────────────────────┘│
        │  ┌────────────────────┐ ┌──────────────────────────┐│
        │  │ Split/Merge engine  │ │ i18n (ICU MessageFormat, ││
        │  │                     │ │ number/date/currency)    ││
        │  └────────────────────┘ └──────────────────────────┘│
        └────────────────────────────────────────────────────┘
                                         │
        ┌───────────────┬───────────────┼───────────────┬───────────────┐
        │  Adapter: DOM │ Adapter: React │ Adapter: Vue  │ Adapter: CLI  │
        └───────────────┴───────────────┴───────────────┴───────────────┘
                                         │
                         ┌──────────────────────────────┐
                         │ Optional peers: LombokCharts, │
                         │ LombokCSS                     │
                         └──────────────────────────────┘
```

### 2.1 Data flow
1. Data enters via **Import** (file/stream/array) or is constructed programmatically → normalized into `DataModel`.
2. `DataModel` is the single source of truth: a sparse 2D grid + metadata (column types,
   merges, styles-by-reference, sheet list).
3. `Renderer` reads `DataModel` + active `Template` and produces a render tree; the DOM/React/Vue
   adapter is the only layer that touches the actual UI runtime.
4. Edits (Spreadsheet mode) go through a `Transaction` object (undo/redo, dirty-cell tracking)
   before mutating `DataModel`, so formula recalculation can run a minimal dependency-graph update.
5. **Export** reads `DataModel` (+ optional template) and serializes to the target format.

### 2.2 Why this shape is portable
Everything inside "Core Engine" is deliberately designed with **no host-language-specific
tricks**: plain structs/records, explicit state transitions, no reflection-based magic.
That's what makes a later Go or Rust port a translation exercise instead of a redesign.
The **only** thing that changes per language port is the Renderer contract's concrete
implementation and the adapter layer.

---

## 3. Deep Dive

### 3.1 Data model
```ts
interface CellRef { row: number; col: number; sheet: string }
interface Cell {
  value: string | number | boolean | null;
  formula?: string;        // raw formula text, e.g. "=SUM(A1:A10)"
  type: 'string'|'number'|'boolean'|'date'|'formula'|'empty';
  styleRef?: string;       // points into StyleTable, never inline style blobs
}
interface Sheet {
  name: string;
  cells: Map<string, Cell>;     // sparse: key = "row:col"
  rowCount: number; colCount: number;
  merges: Array<{from: CellRef; to: CellRef}>;
  colTypes?: Record<number, ColumnType>;
}
interface Workbook {
  sheets: Sheet[];
  styles: StyleTable;
  locale: string;           // BCP-47, e.g. "id-ID", "ar-EG"
  meta: { createdWith: 'LombokTableSheet'; version: string };
}
```
Sparse storage keeps memory bounded for large-but-mostly-empty sheets; dense columns
(typed, uniform) can opt into a columnar typed-array backing for numeric performance.

### 3.2 API contract (public surface, v1)
```ts
// Table (read-optimized)
const table = new LombokTable(container, { data, columns, template: 'report', locale: 'en' });
table.setData(newRows);
table.exportAs('csv' | 'xlsx' | 'json' | 'md' | 'html');

// Spreadsheet (editable)
const sheet = new LombokSheet(container, { workbook, locale: 'ja' });
sheet.on('cellChange', (ref, cell) => {...});
sheet.undo(); sheet.redo();
sheet.split({ by: 'rows', at: 42 });                 // -> [Workbook, Workbook]
LombokSheet.merge([wbA, wbB], { onConflict: 'left-wins' | 'right-wins' | 'prompt' });
```

### 3.3 Formula evaluator
- Tokenizer → Pratt-parser → AST → dependency graph (per cell) → topological recalculation.
- No `eval`/`new Function`. Function library (SUM, AVG, IF, VLOOKUP-equivalent, etc.)
  registered as pure functions in a lookup table — also makes sandboxing trivial and the
  same table structure ports 1:1 to Go/Rust (map of function name → implementation).
- Circular reference detection via cycle check on the dependency graph before commit.

### 3.4 Import/Export
- Each format is a `Codec` with `decode(bytes) -> Workbook` and `encode(Workbook) -> bytes`.
- XLSX via a minimal OOXML zip/XML reader-writer (no full Excel feature parity claimed —
  documented subset: values, basic styles, merged cells, sheet names).
- Split/Merge reuse the Codec's `Workbook` shape, so they're format-agnostic.

### 3.5 Template registry
Templates are JSON (layout regions, column width hints, style-ref defaults, header/footer
slots) + a CSS hook namespace consumed by LombokCSS if present, or a small built-in
stylesheet if not. Templates never touch data — purely presentational, so exporting to
CSV/JSON strips template concerns entirely (as it should).

### 3.6 Internationalization
- Uses `Intl.NumberFormat` / `Intl.DateTimeFormat` on the JS side; ICU4X-equivalent on Rust;
  `golang.org/x/text` on Go; `intl` ext on PHP. UI strings via ICU MessageFormat catalogs
  in `src/i18n/<locale>.json`, pluralization-aware.
- RTL detected from locale and applied at the adapter/CSS layer, not baked into DataModel.

### 3.7 Error handling
- Import errors are `Result<Workbook, ImportError[]>` (never throw-and-lose-partial-data);
  partial imports return best-effort data + a warnings array.
- Formula errors resolve to a typed error cell value (`#REF!`, `#DIV/0!`, `#CIRC!`) rather
  than throwing, matching user expectations from Excel/Sheets/Calc.

---

## 4. Scale & Reliability
- **Load estimation:** target use is embedded in web apps and CLIs, not a multi-tenant
  service — so "scale" here means *client-side data volume*, not request throughput.
- Virtualized rendering (windowing) keeps DOM node count bounded regardless of row count.
- Large-file import/export streams row-by-row rather than materializing the whole file
  in memory where the format allows it (CSV/TSV always; XLSX partially, due to zip format).
- No server component in v1 — reliability concerns are: don't corrupt data on
  crash-mid-edit (transaction log + autosave hook exposed to host app) and don't
  freeze the UI thread (heavy parse/recalc offloaded to a Web Worker where available).

---

## 5. Trade-off Analysis

| Decision | Chosen | Alternative | Trade-off |
|---|---|---|---|
| Formula engine | Custom AST evaluator | `eval`/Function ctor | Slower to write, but no code-injection surface — non-negotiable for a library with "audit, no bug" as a goal |
| Storage | Sparse map + optional typed-array | Dense 2D array always | Better memory for sparse sheets; slightly more complex code path |
| Core language | TypeScript (transpiled to plain JS + `.d.ts`) | Rust+WASM as universal core | TS ships smaller/faster for pure web use today; Rust/WASM revisited once perf data justifies it (tracked in §7) |
| Porting strategy | Sequential (TS → PHP → Go → Rust) | Parallel from day one | Sequential lets each port learn from the last language's edge cases instead of triplicating the same bugs |
| Templates | Pure JSON + CSS hooks | Component-based templates | JSON is portable across every target language; component templates would lock the templating system to JS |

**What we'd revisit as the project grows:** if profiling shows the JS core is the
bottleneck for very large in-browser sheets, promote the recalculation engine to a
Rust/WASM module behind the same TS interface (the AST evaluator's pure-function design
makes this a drop-in swap, not a rewrite).

---

## 6. Security & "Audit, No Bug" Practice
"No bug" cannot be promised on day one by any team; the honest version of this goal is
a process. **See [SECURITY.md](./SECURITY.md) for the running, honest record of that
process in practice** — including two real bugs the fuzz test already found and fixed.
Summary of the commitments:
1. Core has no `eval`, no dynamic code execution, no unsanitized HTML injection in the
   DOM adapter (all cell content text-noded, not innerHTML'd).
2. 100% of `DataModel` mutations go through the `Transaction` layer → property-based
   tests (fuzz random transaction sequences, assert invariants never break).
3. CI gate: unit tests + property tests + a static analysis pass (`tsc --strict`,
   ESLint security ruleset) must pass before merge to `main`.
4. Public `SECURITY.md` with a disclosure process before v1.0.
5. Dependency license + vulnerability scan (`npm audit` / `cargo audit` / `composer audit`)
   in CI, blocking on high-severity findings.

---

## 7. Roadmap (multi-stage)

| Stage | Deliverable | Target |
|---|---|---|
| 0 | This architecture doc | Done (this doc) |
| 1 | TS/JS core: DataModel, CSV/JSON codec, Table (read-only) render, unit tests | MVP — shipped alongside this doc |
| 2 | Spreadsheet edit mode, formula engine, undo/redo | **Done** — `LombokSheet`, AST-based formula evaluator (no `eval`), `TransactionalSheet` undo/redo |
| 3 | XLSX/MD/HTML codecs, split/merge, templates v1, i18n (10 locales) | **Done** — XLSX via a hand-written, dependency-free ZIP writer (validated against `unzip`, Python's `zipfile`, and independently against `openpyxl`); HTML codec; split/merge, templates, and i18n were already in place from Stage 1 |
| 4 | React + Vue adapters, LombokCharts/LombokCSS integration | **Done** (React/Vue adapters) — thin wrappers as opt-in sub-path exports (`lomboktablesheet/react`, `lomboktablesheet/vue`), core bundle has zero React/Vue code. LombokCharts/LombokCSS integration remains hook-level only (`cssHooks` on templates) until those sibling projects exist to integrate against. |
| 5 | npm publish, unpkg CDN, GitHub Actions CI/CD, Docker demo image | +2 weeks |
| 6 | PHP port (Packagist/Composer) — reuses format specs & test fixtures from TS | **Done** (data-layer scope) — `ports/php/`, core model + formula engine + CSV/JSON/Markdown + split/merge, 27 PHPUnit tests, verified byte-identical output vs. the TS core on matching inputs (CSV→JSON, split, and a compound formula). DOM/Sheet rendering, XLSX, i18n, templates intentionally out of scope for PHP (no DOM to render into — see `ports/php/README.md`). |
| 7 | Go port | **Done** (data-layer scope, same as PHP) — `ports/go/`, 34 tests (83.2% coverage), `go vet`/`gofmt` clean, uses Go standard library (`encoding/csv`, `encoding/json`) rather than hand-rolling, verified three-way parity with TS and PHP on matching inputs |
| 8 | Rust port (+ WASM build, optional perf-core for TS) | +8–10 weeks |
| 9 | Independent security audit + fuzzing campaign before v1.0.0 | Before v1.0 |

See `DEPLOYMENT.md` for the concrete per-target deployment stages (GitHub, Docker, AWS,
Niagahoster/shared VPS, NPM, Packagist, unpkg, framework integration).

---

## 8. Cross-Language Parity (PHP and Go ports, Stages 6–7)

Each port isn't just "similar" — it's checked against the TS core (and against each
other) with identical inputs, asserted to produce identical outputs:

| Check | TS result | PHP result | Go result |
|---|---|---|---|
| `decodeCsv` → `encodeJson` on `"name,age\nAlice,30\nBob,25\n"` | `[{"name":"Alice","age":30},{"name":"Bob","age":25}]` | identical, byte-for-byte | same key/value pairs (JSON key order differs — Go map iteration isn't ordered, which doesn't affect correctness) |
| `splitByRows(..., 2)` on the same workbook | `[["name","age"],["Alice",30]]` / `[["Bob",25]]` | identical | identical |
| `=SUM(A1:B1)*2+IF(A1>5,1,0)` with A1=10, B1=20 | `61` | `61` | `61` |

This is the standard the remaining port (Rust) should be held to as it lands —
a port is only "done" once it's cross-checked against the reference implementation
on real inputs, not just once its own unit tests pass in isolation.

## 9. Repository Layout (target)

```
LombokTableSheet/
├── ARCHITECTURE.md          ← this file
├── README.md                ← standard, user-facing
├── DEPLOYMENT.md            ← multi-stage deploy plan
├── LICENSE                  ← Apache-2.0
├── package.json
├── src/
│   ├── core/                ← DataModel, Transaction, FormulaAST
│   ├── formats/             ← csv.ts, json.ts, xlsx.ts, md.ts, html.ts
│   ├── templates/           ← built-in template JSON + registry
│   ├── i18n/                ← locale catalogs
│   ├── adapters/             ← dom.ts, react.tsx, vue.ts
│   └── index.ts
├── tests/
├── examples/{react,vue,vanilla}
├── docker/Dockerfile
├── .github/workflows/ci.yml
└── ports/
    ├── php/                  ← done (Stage 6): src/Core, src/Formats, tests/, composer.json
    └── go/                   ← done (Stage 7): lombok/ package, go.mod, tests
                                 rust/ to follow in its respective stage
```
