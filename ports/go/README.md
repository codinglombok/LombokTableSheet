# LombokTableSheet — Go port

Go 1.22+ port of the [LombokTableSheet](../../README.md) core, structurally translated
from the TypeScript core (see ARCHITECTURE.md §2.2 / MASTERPROMPT-STAGES.md Stage 7).
Same scope decision as the PHP port: this is a **data/formula layer**, not a UI library —
Go has no DOM to render into.

## What's here

- **Core data model** — `Cell`, `Sheet`, `Workbook` (`lombok/model.go`)
- **Formula engine** — tokenizer → Pratt parser → AST → evaluator, **no dynamic code
  execution** (`lombok/formula.go`). Same nesting-depth guard (200) as the TS/PHP
  engines, plus a `recover()` safety net in `Evaluate` so an internal bug degrades to a
  `#ERROR!` value instead of crashing the process.
- **Split/merge** (`lombok/splitmerge.go`)
- **CSV codec** (`lombok/csv.go`) — uses Go's standard-library `encoding/csv`, not a
  hand-rolled parser. This is a deliberate difference from the TS core's XLSX situation:
  hand-rolling there avoided a *third-party* dependency; `encoding/csv` is standard
  library, so there's no reason not to use it.
- **JSON + Markdown codecs** (`lombok/json.go`) — likewise uses standard-library
  `encoding/json`.

**Not ported** (same rationale as PHP): DOM/editable Sheet rendering, XLSX, i18n
formatting, templates. A future stage could reasonably add a terminal/TUI table
renderer as a Go-specific addition, since that's a natural fit for Go — but that's a
new feature decision, not a parity requirement, and hasn't been built yet.

## Install

```bash
go get github.com/codinglombok/lomboktablesheet-go
```

## Usage

```go
import lombok "github.com/codinglombok/lomboktablesheet-go/lombok"

result := lombok.DecodeCsv("name,age\nAlice,30\nBob,25\n", lombok.CsvDecodeOptions{})
out, _ := lombok.EncodeJson(result.Workbook, "", false)

top, bottom, _ := lombok.SplitByRows(result.Workbook, "Sheet1", 1)

sheet := lombok.NewSheet("S1")
sheet.SetValue(0, 0, 10.0)
sheet.SetValue(0, 1, 20.0)
ast, _ := lombok.ParseFormula("=SUM(A1:B1)*2")
value := lombok.Evaluate(ast, lombok.SheetResolver(sheet)) // 60.0, or a FormulaError
```

## Development

```bash
go build ./...
go vet ./...
gofmt -l .            # should print nothing
go test ./... -v -cover
```

34 tests, 83.2% statement coverage, covering the same behavioral scenarios as the
TypeScript and PHP test suites — including a direct **three-way cross-language parity
check**: the same CSV input and the same compound formula
(`=SUM(A1:B1)*2+IF(A1>5,1,0)` with A1=10, B1=20) were run through the TS, PHP, and Go
implementations independently and produced identical results (`61` for the formula;
identical split output for the CSV scenario — Go's JSON key ordering differs
cosmetically since Go map iteration order isn't guaranteed, which doesn't affect
correctness).

## License

Apache 2.0 — see [../../LICENSE](../../LICENSE).
