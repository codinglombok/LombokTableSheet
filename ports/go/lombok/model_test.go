package lombok

import (
	"reflect"
	"testing"
)

func TestSheetSetGetCellRoundTrip(t *testing.T) {
	s := NewSheet("S1")
	_ = s.SetValue(0, 0, "Name")
	_ = s.SetValue(0, 1, "Age")
	_ = s.SetValue(1, 0, "Alice")
	_ = s.SetValue(1, 1, 30.0)

	if v := s.GetCell(0, 0).Value; v != "Name" {
		t.Errorf("expected Name, got %v", v)
	}
	if v := s.GetCell(1, 1).Value; v != 30.0 {
		t.Errorf("expected 30, got %v", v)
	}
	if s.GetCell(1, 1).Type != CellNumber {
		t.Errorf("expected CellNumber type")
	}
	if s.RowCount != 2 || s.ColCount != 2 {
		t.Errorf("expected 2x2 dims, got %dx%d", s.RowCount, s.ColCount)
	}
}

func TestGetCellOnUnsetCellReturnsEmpty(t *testing.T) {
	s := NewSheet("S1")
	c := s.GetCell(5, 5)
	if c.Value != nil || c.Type != CellEmpty {
		t.Errorf("expected empty cell, got %+v", c)
	}
}

func TestSetCellRejectsNegativeCoordinates(t *testing.T) {
	s := NewSheet("S1")
	err := s.SetCell(-1, 0, Cell{Value: 1.0, Type: CellNumber})
	if err == nil {
		t.Fatal("expected an error for negative coordinates")
	}
}

func TestWorkbookFromRowsBuildsCorrectDimensions(t *testing.T) {
	w := WorkbookFromRows([][]interface{}{
		{"a", "b", "c"},
		{1.0, 2.0, 3.0},
	}, "", "")
	sheet := w.Sheets[0]
	if sheet.RowCount != 2 || sheet.ColCount != 3 {
		t.Errorf("expected 2x3, got %dx%d", sheet.RowCount, sheet.ColCount)
	}
	got := sheet.ToRows()
	want := [][]interface{}{{"a", "b", "c"}, {1.0, 2.0, 3.0}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestSheetCloneIsDeepAndIndependent(t *testing.T) {
	s := NewSheet("S1")
	_ = s.SetValue(0, 0, "x")
	clone := s.Clone()
	_ = clone.SetValue(0, 0, "y")
	if s.GetCell(0, 0).Value != "x" {
		t.Errorf("original should be unaffected, got %v", s.GetCell(0, 0).Value)
	}
	if clone.GetCell(0, 0).Value != "y" {
		t.Errorf("clone should have new value, got %v", clone.GetCell(0, 0).Value)
	}
}

func TestResizeShrinksDimensionsAndToRowsRespectsIt(t *testing.T) {
	// Regression test mirroring the real bug found in the TS core via fuzz
	// testing (see SECURITY.md): shrinking dimensions must not leak stale
	// cells back into ToRows() as jagged rows.
	s := NewSheet("S1")
	_ = s.SetValue(0, 0, "a")
	_ = s.SetValue(1, 1, "b")
	_ = s.SetValue(2, 2, "c")
	if s.RowCount != 3 || s.ColCount != 3 {
		t.Fatalf("expected 3x3 before resize, got %dx%d", s.RowCount, s.ColCount)
	}
	s.Resize(1, 1)
	rows := s.ToRows()
	if len(rows) != 1 || len(rows[0]) != 1 {
		t.Fatalf("expected a single 1x1 row after resize, got %v", rows)
	}
	if rows[0][0] != "a" {
		t.Errorf("expected surviving cell 'a', got %v", rows[0][0])
	}
}
