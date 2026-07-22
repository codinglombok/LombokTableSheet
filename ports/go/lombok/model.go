// Package lombok is the Go port of LombokTableSheet's data/formula layer.
// Structural translation of the TypeScript core (see ARCHITECTURE.md §2.2 and
// MASTERPROMPT-STAGES.md Stage 7) — same Cell/Sheet/Workbook shape, same
// formula-engine design (tokenizer -> parser -> AST -> evaluator, no dynamic
// code execution), scoped to the data layer since Go, like PHP, has no DOM to
// render a UI into.
package lombok

import (
	"fmt"
	"sort"
)

// CellType mirrors the TS CellType union.
type CellType string

const (
	CellEmpty   CellType = "empty"
	CellString  CellType = "string"
	CellNumber  CellType = "number"
	CellBoolean CellType = "boolean"
	CellFormula CellType = "formula"
)

// Cell mirrors src/core/model.ts's Cell interface.
type Cell struct {
	Value   interface{} // string | float64 | bool | nil
	Type    CellType
	Formula string // raw formula text, e.g. "=SUM(A1:A10)"; only set when Type == CellFormula
}

// CellRef is a zero-indexed (row, col) position.
type CellRef struct {
	Row int
	Col int
}

type cellKey struct {
	row int
	col int
}

// Sheet mirrors src/core/model.ts's Sheet class. Like the TS core, a Sheet
// only ever grows via SetCell/SetValue — RowCount/ColCount never shrink
// implicitly. Use Resize to explicitly restore a prior shape (mirroring the
// fix documented in SECURITY.md for the TS undo/redo bug this same pattern
// could otherwise reproduce here).
type Sheet struct {
	Name     string
	RowCount int
	ColCount int

	cells map[cellKey]Cell
}

// NewSheet constructs an empty sheet with the given name.
func NewSheet(name string) *Sheet {
	return &Sheet{Name: name, cells: make(map[cellKey]Cell)}
}

// GetCell returns the cell at (row, col), or an empty Cell if unset.
func (s *Sheet) GetCell(row, col int) Cell {
	if c, ok := s.cells[cellKey{row, col}]; ok {
		return c
	}
	return Cell{Value: nil, Type: CellEmpty}
}

// SetCell stores a cell and grows RowCount/ColCount if needed. Panics via a
// returned error (not a runtime panic) on negative coordinates, matching the
// TS core's RangeError behavior.
func (s *Sheet) SetCell(row, col int, cell Cell) error {
	if row < 0 || col < 0 {
		return fmt.Errorf("cell position out of bounds: (%d, %d)", row, col)
	}
	if s.cells == nil {
		s.cells = make(map[cellKey]Cell)
	}
	s.cells[cellKey{row, col}] = cell
	if row+1 > s.RowCount {
		s.RowCount = row + 1
	}
	if col+1 > s.ColCount {
		s.ColCount = col + 1
	}
	return nil
}

// SetValue is a convenience wrapper around SetCell that infers CellType from
// the Go value's dynamic type.
func (s *Sheet) SetValue(row, col int, value interface{}) error {
	var t CellType
	switch value.(type) {
	case nil:
		t = CellEmpty
	case float64, int:
		t = CellNumber
	case bool:
		t = CellBoolean
	default:
		t = CellString
	}
	return s.SetCell(row, col, Cell{Value: value, Type: t})
}

// Resize explicitly sets RowCount/ColCount, including shrinking them. Only
// the transaction/undo layer (not yet ported — see MASTERPROMPT-STAGES.md)
// should need this; normal editing only ever grows a sheet.
func (s *Sheet) Resize(rowCount, colCount int) {
	if rowCount < 0 {
		rowCount = 0
	}
	if colCount < 0 {
		colCount = 0
	}
	s.RowCount = rowCount
	s.ColCount = colCount
}

// ToRows materializes the sheet as a dense [][]interface{} grid, bounds-checked
// against current RowCount/ColCount (this bounds check is the fix for the real
// bug the TS fuzz test found — see SECURITY.md — applied here proactively
// rather than waiting to rediscover it).
func (s *Sheet) ToRows() [][]interface{} {
	rows := make([][]interface{}, s.RowCount)
	for r := range rows {
		rows[r] = make([]interface{}, s.ColCount)
	}
	// Deterministic iteration order isn't required for correctness here since
	// we're writing into a pre-sized grid by (row,col) key, not appending.
	for key, cell := range s.cells {
		if key.row < 0 || key.row >= s.RowCount || key.col < 0 || key.col >= s.ColCount {
			continue
		}
		rows[key.row][key.col] = cell.Value
	}
	return rows
}

// IterCells returns all stored cells in a stable (row, then col) order —
// stable iteration matters for reproducible dependency-extraction output.
func (s *Sheet) IterCells() []struct {
	Ref  CellRef
	Cell Cell
} {
	keys := make([]cellKey, 0, len(s.cells))
	for k := range s.cells {
		keys = append(keys, k)
	}
	sort.Slice(keys, func(i, j int) bool {
		if keys[i].row != keys[j].row {
			return keys[i].row < keys[j].row
		}
		return keys[i].col < keys[j].col
	})
	out := make([]struct {
		Ref  CellRef
		Cell Cell
	}, 0, len(keys))
	for _, k := range keys {
		out = append(out, struct {
			Ref  CellRef
			Cell Cell
		}{CellRef{k.row, k.col}, s.cells[k]})
	}
	return out
}

// Clone returns a deep, independent copy of the sheet.
func (s *Sheet) Clone() *Sheet {
	c := NewSheet(s.Name)
	c.RowCount = s.RowCount
	c.ColCount = s.ColCount
	for k, v := range s.cells {
		c.cells[k] = v
	}
	return c
}

// Workbook mirrors src/core/model.ts's Workbook class.
type Workbook struct {
	Sheets []*Sheet
	Locale string
}

// NewWorkbook constructs an empty workbook with the given locale (BCP-47).
func NewWorkbook(locale string) *Workbook {
	if locale == "" {
		locale = "en-US"
	}
	return &Workbook{Locale: locale}
}

// AddSheet appends a sheet to the workbook.
func (w *Workbook) AddSheet(s *Sheet) {
	w.Sheets = append(w.Sheets, s)
}

// Sheet returns the first sheet with the given name, or nil.
func (w *Workbook) Sheet(name string) *Sheet {
	for _, s := range w.Sheets {
		if s.Name == name {
			return s
		}
	}
	return nil
}

// WorkbookFromRows builds a single-sheet workbook from a 2D grid, mirroring
// Workbook.fromRows in the TS core.
func WorkbookFromRows(rows [][]interface{}, sheetName, locale string) *Workbook {
	if sheetName == "" {
		sheetName = "Sheet1"
	}
	w := NewWorkbook(locale)
	cols := 0
	for _, row := range rows {
		if len(row) > cols {
			cols = len(row)
		}
	}
	sheet := NewSheet(sheetName)
	sheet.RowCount = len(rows)
	sheet.ColCount = cols
	for r, row := range rows {
		for c, val := range row {
			_ = sheet.SetValue(r, c, val)
		}
	}
	w.AddSheet(sheet)
	return w
}
