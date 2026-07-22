# LombokTableSheet — Project Summary

**License:** Apache 2.0 · **Status:** v0.4.0 (TS/JS core) + PHP data-layer port ·
**Last verified:** all numbers below were produced by actually running the test suites,
not estimated.

This document is the single-page "what actually exists, what actually works, what's
still a plan" answer. For depth, see [ARCHITECTURE.md](./ARCHITECTURE.md) (design),
[SECURITY.md](./SECURITY.md) (hardening record), [USAGE.md](./USAGE.md) (how to use it),
and [DEPLOYMENT.md](./DEPLOYMENT.md) (how to ship it).

---

## What this is

A Table + Spreadsheet library, built with a portable core so it can be implemented once
and translated across languages rather than rewritten from scratch each time. Started as
a TypeScript/JavaScript core; now also has a PHP port of the data/formula layer, verified
byte-identical to the TS core on matching inputs.

## By the numbers

| Metric | Value |
|---|---|
| TS/JS source files (`src/`) | 18 files, ~1,671 lines |
| PHP source files (`ports/php/src/`) | 5 files, ~1,004 lines |
| Go source files (`ports/go/lombok/`) | 4 files |
| TS/JS tests | **84**, all passing |
| PHP tests | **33** (69 assertions), all passing |
| Go tests | **34** (83.2% statement coverage), all passing |
| **Total tests** | **151** |
| TS strict typecheck | Clean (`tsc --strict`, `noUncheckedIndexedAccess`) |
| Go vet / gofmt | Clean |
| npm dependency vulnerabilities | 0 (`npm audit`, full tree) |
| PHP runtime dependencies | 0 |
| Go runtime dependencies | 0 (standard library only) |
| Real bugs found and fixed via testing | 2 (see below and SECURITY.md) |
| Languages ported | TypeScript/JS (primary), PHP (data layer), Go (data layer) |
| Languages planned | Rust (per your priority order) |

## What actually works (verified, not just written)

### Core data model
`Workbook` / `Sheet` / `Cell` — sparse-map storage, deliberately free of JS-only tricks
so the shape ports cleanly to other languages.

### Formula engine (TS *and* PHP, independently, verified identical)
Hand-written tokenizer → Pratt parser → AST → evaluator. **No `eval()` in either
language** — the single highest-value security decision in the codebase. Supports
`+ - * / ^`, comparisons, `A1` refs, `A1:B3` ranges, `SUM/AVG/MIN/MAX/COUNT/IF/ROUND/CONCAT`,
typed error values (`#DIV/0!`, `#CIRC!`, `#NAME?`, `#VALUE!`), circular-reference detection,
and a nesting-depth guard against stack-overflow DoS.

Cross-checked directly: `=SUM(A1:B1)*2+IF(A1>5,1,0)` with A1=10, B1=20 returns `61` in
both the TypeScript and PHP implementations.

### Editable Spreadsheet (TS only — needs a DOM)
`LombokSheet`: double-click to edit, formulas auto-recalculate on dependency change,
undo/redo via a transaction layer. Tested against a real jsdom DOM with real
double-click/keydown events, not just called programmatically.

### Import / export
| Format | Decode | Encode | Notes |
|---|---|---|---|
| CSV | ✅ | ✅ | RFC-4180-ish, quoted fields, embedded commas/newlines |
| JSON | ✅ | ✅ | array-of-records shape |
| Markdown | — | ✅ | GFM tables; import intentionally unsupported (lossy source format) |
| HTML | ✅ | ✅ | regex-based, no DOM dependency |
| XLSX | ✅ | ✅ | **Zero external dependencies** — hand-written ZIP container (Node's built-in `zlib` only) + hand-written OOXML XML. Verified against `unzip`, Python's `zipfile`, and independently against `openpyxl` (a real third-party XLSX library) |

### Split / merge
Row/column/sheet splitting, multi-workbook merge with configurable conflict strategy.

### Templates & i18n
4 built-in visual templates (presentational only, decoupled from data). `Intl`-backed
number/date/currency formatting, RTL detection, UI-string catalog for 30 major-language
locales (`ar, bn, cs, da, de, el, en, es, fa, fi, fr, he, hi, id, it, ja, ko, ms, nl,
pl, pt, ro, ru, sv, sw, th, tr, uk, vi, zh`) — see DETAILED_USAGE.md §8.

### Framework adapters
`lomboktablesheet/react` and `lomboktablesheet/vue` — thin wrappers, confirmed the core
bundle has **zero** React/Vue code in it (checked by grepping the compiled output).
Both mount-tested with real `react-dom`/`createRoot` and real Vue `createApp`.

### PHP port (`ports/php/`)
Structural translation of the core model, formula engine, split/merge, and CSV/JSON/
Markdown codecs. Deliberately scoped to the data layer — PHP has no DOM to render into,
so the UI adapters, XLSX, templates, and i18n formatting are not ported (documented,
not silently missing).

### Go port (`ports/go/`)
Same data-layer scope and rationale as PHP. Uses Go's standard library (`encoding/csv`,
`encoding/json`) rather than hand-rolling — a deliberate difference from the TS core's
XLSX situation, since Go's standard library isn't a third-party dependency the way an
external zip/xlsx package would be. 34 tests, 83.2% coverage, `go vet`/`gofmt` clean.
The `Sheet.ToRows()` bounds-check bug that the TS core's fuzz test had to *discover*
(see below) was built into the Go port from the start, with a regression test proving it.

## Security hardening record

Full detail in [SECURITY.md](./SECURITY.md). Highlights:

- No `eval()`/`new Function()` anywhere (formula engines, TS and PHP)
- Text-node-only DOM rendering (no `innerHTML` for cell content — XSS-safe by construction)
- Resource-exhaustion guards on every import path: size limits on CSV/JSON/HTML input,
  and a hardened ZIP reader for XLSX that enforces limits against **actual** decompressed
  bytes via `zlib`'s `maxOutputLength`, not just attacker-controlled header claims
- Formula-parser nesting-depth guard against stack-overflow DoS (both languages)
- A seeded, reproducible fuzz test on the undo/redo transaction layer

**Two real bugs found by that fuzz test, and fixed:** `undo()` wasn't restoring sheet
dimensions after an edit that grew the grid, and `toRows()` wasn't bounds-checking cell
references against current dimensions — together these could produce jagged, incorrect
output after certain undo sequences. Both are fixed with regression tests. This is
recorded, not hidden, because a security document with zero findings on a codebase this
size is a sign no one looked hard enough, not a sign of a clean codebase.

## What's honestly NOT done yet

- **Rust port** — not started (next per your stated priority order)
- **XLSX styles, merged cells, formulas-in-file** — documented subset only; values +
  basic structure, not full Excel feature parity
- **LombokCharts / LombokCSS integration** — hook-level only (`cssHooks` on templates);
  those sibling projects don't exist yet to integrate against
- **Independent third-party security audit** — the hardening above is real engineering
  practice, not a substitute for an outside audit before a 1.0 release (see
  ARCHITECTURE.md §7, Stage 9)
- **npm/Packagist publishing** — mechanical steps are documented in DEPLOYMENT.md but
  require real credentials/accounts to actually execute

## Repository map

```
LombokTableSheet/
├── PROJECT_SUMMARY.md   ← this file
├── ARCHITECTURE.md      ← full system design, data model, roadmap
├── SECURITY.md          ← hardening record and reporting policy
├── USAGE.md             ← quick how-to guide (TS + PHP + Go)
├── DETAILED_USAGE.md    ← exhaustive per-function API reference, all 3 languages
├── WORKFLOWS.md          ← CI/CD documentation — what's automated, what's honestly not
├── DEPLOYMENT.md         ← multi-stage deployment plan
├── README.md             ← quick-start, user-facing
├── LICENSE                ← Apache-2.0
├── src/                   ← TS/JS core (18 files), incl. src/i18n/locales/ (30 locales)
├── tests/                 ← 84 tests (unit, DOM/jsdom, React/Vue, fuzz, security, i18n)
├── examples/              ← vanilla JS demo
├── docker/, .github/       ← Dockerfile, ~19 CI/CD workflows (see WORKFLOWS.md)
├── ports/php/              ← PHP data-layer port, 33 PHPUnit tests
└── ports/go/               ← Go data-layer port, 34 tests, 83.2% coverage
```
