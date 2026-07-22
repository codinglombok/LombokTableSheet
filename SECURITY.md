# Security Policy

## Reporting a vulnerability

Please report suspected security issues privately rather than opening a public issue.
Open a GitHub Security Advisory on this repository, or email the maintainers listed in
`composer.json` / `package.json`. We aim to acknowledge reports within a few business
days. This is a young project without a formal bug-bounty program — please don't expect
one, but genuine reports are taken seriously and credited.

## What "audit, no bug" actually means here

No software honestly earns a "zero bugs, fully audited" claim on day one — that phrase
gets used a lot in marketing and rarely means anything. What this project does instead,
per ARCHITECTURE.md §6, is commit to a **process**, and this document is the running
record of that process actually being followed — including the bugs it already found.

### Practices in place today

1. **No `eval()` / `new Function()` anywhere in the formula engine** (TS or PHP). The
   engine is a real tokenizer → parser → AST → evaluator specifically so that formula
   text is never handed to a language interpreter. This is the single highest-value
   security decision in the codebase — spreadsheet formula engines that shell out to
   `eval` are a recurring, well-known vulnerability class.
2. **Text-node-only DOM rendering** — `LombokTable`/`LombokSheet` never use `innerHTML`
   for cell content, so a cell value like `<img src=x onerror=...>` renders as inert
   text, not markup. Covered by `tests/dom.test.ts`.
3. **Resource-exhaustion guards** on every import path:
   - CSV/JSON/HTML decoders (TS and PHP) reject oversized input via a configurable
     `maxInputBytes` (default 100MB), and CSV additionally caps row count
     (`maxRows`, default 2,000,000).
   - The hand-written ZIP reader (used by the XLSX codec) enforces
     `maxEntrySize`, `maxTotalSize`, and `maxEntries` — and critically, the
     per-entry limit is enforced by Node's `zlib` via `maxOutputLength` against
     the **actual** decompressed bytes, not just the (attacker-controlled)
     declared size in the zip header. A header can lie; `zlib` can't be lied to
     the same way. Covered by `tests/security.test.ts`.
   - The formula parser (TS and PHP) enforces a maximum AST nesting depth (200)
     against both deeply parenthesized expressions and long unary-operator chains,
     to prevent a stack-overflow denial-of-service from a single malicious formula
     string. Covered in both languages' security test suites.
4. **Circular formula references** resolve to a `#CIRC!` error value instead of
   infinite-looping or crashing the process (a `visiting`-set check per evaluation
   chain). Covered by `tests/formula.test.ts`.
5. **Fuzz/property testing** on the undo/redo transaction layer: `tests/fuzz.test.ts`
   runs 200 seeded-random sequences of edits/undo/redo (deterministic seeds, so any
   failure is reproducible) and asserts core invariants never break. **This test
   already found and led to fixing a real bug** — see below.
6. **Dependency audit**: `npm audit` reports zero known vulnerabilities across the
   full dependency tree as of this writing (see CI, which runs `npm audit
   --audit-level=high` on every push). The PHP port currently has zero runtime
   dependencies (only a dev-dependency on PHPUnit), so there is no dependency
   surface to audit there yet.
7. **Strict typing**: `tsc --strict` (including `noUncheckedIndexedAccess`) on the
   TS side; `declare(strict_types=1)` throughout the PHP port; Go's static type system
   plus `go vet` clean on the Go port.
8. **Go-specific**: `Evaluate()` wraps AST evaluation in a `recover()`, so an unexpected
   internal failure degrades to a `#ERROR!` value instead of crashing the process —
   Go's idiomatic equivalent of the "never throw on data" contract the TS/PHP engines
   already follow. The Go port also uses Go's standard-library `encoding/csv` and
   `encoding/json` rather than hand-rolled parsers, since those aren't third-party
   dependencies the way an external package would be (contrast with the TS core's
   XLSX codec, which hand-rolls specifically to *avoid* a third-party dependency).

### Bugs the process has already caught (this is the point of the process)

- **Undo did not restore sheet dimensions.** The fuzz test in `tests/fuzz.test.ts`
  found that `TransactionalSheet.undo()` correctly reverted cell *values* but left
  `rowCount`/`colCount` unchanged, so undoing an edit that had grown the sheet left
  stale, oversized dimensions. Worse, this interacted with a second bug —
  `Sheet.toRows()` didn't bounds-check cell references against current
  `rowCount`/`colCount`, so stale cells beyond a (hypothetically) shrunk boundary
  could leak back in as jagged, uneven rows. Both are fixed: edits now snapshot
  before/after dimensions, undo/redo restore them exactly via a new
  `Sheet.resize()`, and `toRows()` bounds-checks every cell reference. Regression
  tests for both are in `tests/fuzz.test.ts` and `tests/model.test.ts`. The Go port
  (built after this was found) includes the equivalent bounds-check in `ToRows()`
  from the start, with its own regression test
  (`TestResizeShrinksDimensionsAndToRowsRespectsIt`) — proof that documenting a
  found bug actually prevented it from being reintroduced in the next port, which
  is the entire point of writing it down here instead of just fixing it quietly.

This section will keep growing as more auditing happens — that's the intent. A
security document with zero findings on a project handling formula parsing, file
format decoding, and third-party file import isn't a sign of a clean codebase, it's
a sign no one looked hard enough yet.

## Scope of what's covered

Covered by the practices above: the TS/JS core (`src/`), the PHP port
(`ports/php/`), and the Go port (`ports/go/`) — all three have the resource-exhaustion
guards and formula-parser depth guard described above, and no dynamic code execution
anywhere. **Not yet covered** (because it doesn't exist yet): the Rust port. When it
lands, it inherits this same checklist before being marked "done" in ARCHITECTURE.md's
roadmap — see ARCHITECTURE.md §8 for the cross-language parity standard it's held to.

## Reporting expectations

If you find something not covered above, please report it — that's exactly what this
process is for.
