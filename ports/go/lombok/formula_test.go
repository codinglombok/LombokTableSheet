package lombok

import (
	"strings"
	"testing"
)

func evalFormula(t *testing.T, sheet *Sheet, formula string) FormulaValue {
	t.Helper()
	ast, err := ParseFormula(formula)
	if err != nil {
		t.Fatalf("parse error for %q: %v", formula, err)
	}
	return Evaluate(ast, SheetResolver(sheet))
}

func TestArithmeticOperatorPrecedence(t *testing.T) {
	s := NewSheet("S1")
	if v := evalFormula(t, s, "=2+3*4"); v != 14.0 {
		t.Errorf("got %v, want 14", v)
	}
	if v := evalFormula(t, s, "=(2+3)*4"); v != 20.0 {
		t.Errorf("got %v, want 20", v)
	}
	if v := evalFormula(t, s, "=2^3+1"); v != 9.0 {
		t.Errorf("got %v, want 9", v)
	}
	if v := evalFormula(t, s, "=-5+2"); v != -3.0 {
		t.Errorf("got %v, want -3", v)
	}
}

func TestCellReferencesResolveToSheetValues(t *testing.T) {
	s := NewSheet("S1")
	_ = s.SetValue(0, 0, 10.0)
	_ = s.SetValue(1, 0, 20.0)
	if v := evalFormula(t, s, "=A1+A2"); v != 30.0 {
		t.Errorf("got %v, want 30", v)
	}
}

func TestSumAvgMinMaxCountOverRange(t *testing.T) {
	s := NewSheet("S1")
	for i, v := range []float64{1, 2, 3, 4, 5} {
		_ = s.SetValue(i, 0, v)
	}
	if v := evalFormula(t, s, "=SUM(A1:A5)"); v != 15.0 {
		t.Errorf("SUM got %v, want 15", v)
	}
	if v := evalFormula(t, s, "=AVG(A1:A5)"); v != 3.0 {
		t.Errorf("AVG got %v, want 3", v)
	}
	if v := evalFormula(t, s, "=MIN(A1:A5)"); v != 1.0 {
		t.Errorf("MIN got %v, want 1", v)
	}
	if v := evalFormula(t, s, "=MAX(A1:A5)"); v != 5.0 {
		t.Errorf("MAX got %v, want 5", v)
	}
	if v := evalFormula(t, s, "=COUNT(A1:A5)"); v != 5.0 {
		t.Errorf("COUNT got %v, want 5", v)
	}
}

func TestIfAndComparisons(t *testing.T) {
	s := NewSheet("S1")
	_ = s.SetValue(0, 0, 10.0)
	if v := evalFormula(t, s, `=IF(A1>5,"big","small")`); v != "big" {
		t.Errorf("got %v, want big", v)
	}
	if v := evalFormula(t, s, `=IF(A1<5,"big","small")`); v != "small" {
		t.Errorf("got %v, want small", v)
	}
}

func TestDivisionByZeroYieldsFormulaError(t *testing.T) {
	s := NewSheet("S1")
	v := evalFormula(t, s, "=10/0")
	fe, ok := v.(FormulaError)
	if !ok || fe.Code != "#DIV/0!" {
		t.Errorf("got %v, want FormulaError #DIV/0!", v)
	}
}

func TestUnknownFunctionYieldsNameError(t *testing.T) {
	s := NewSheet("S1")
	v := evalFormula(t, s, "=NOTAFUNC(1,2)")
	fe, ok := v.(FormulaError)
	if !ok || fe.Code != "#NAME?" {
		t.Errorf("got %v, want FormulaError #NAME?", v)
	}
}

func TestCircularReferenceIsDetected(t *testing.T) {
	s := NewSheet("S1")
	_ = s.SetCell(0, 0, Cell{Type: CellFormula, Formula: "=B1"})
	_ = s.SetCell(0, 1, Cell{Type: CellFormula, Formula: "=A1"})
	v := evalFormula(t, s, "=A1")
	fe, ok := v.(FormulaError)
	if !ok || fe.Code != "#CIRC!" {
		t.Errorf("got %v, want FormulaError #CIRC!", v)
	}
}

func TestCellRefNameParseCellRefRoundTrip(t *testing.T) {
	if got := CellRefName(0, 0); got != "A1" {
		t.Errorf("got %s, want A1", got)
	}
	if got := CellRefName(0, 26); got != "AA1" {
		t.Errorf("got %s, want AA1", got)
	}
	ref, err := ParseCellRef("B3")
	if err != nil || ref.Row != 2 || ref.Col != 1 {
		t.Errorf("got %+v err=%v, want {2 1}", ref, err)
	}
	name := CellRefName(9, 27)
	ref2, err := ParseCellRef(name)
	if err != nil || ref2.Row != 9 || ref2.Col != 27 {
		t.Errorf("round-trip failed: got %+v err=%v", ref2, err)
	}
}

func TestExtractDependenciesFindsRefsAndExpandsRanges(t *testing.T) {
	ast, err := ParseFormula("=SUM(A1:A3)+B1")
	if err != nil {
		t.Fatal(err)
	}
	deps := ExtractDependencies(ast)
	want := map[string]bool{"A1": true, "A2": true, "A3": true, "B1": true}
	if len(deps) != len(want) {
		t.Fatalf("got %v deps, want 4", deps)
	}
	for _, d := range deps {
		if !want[d] {
			t.Errorf("unexpected dependency %s", d)
		}
	}
}

func TestConcatAndRound(t *testing.T) {
	s := NewSheet("S1")
	if v := evalFormula(t, s, `=CONCAT("a","b","c")`); v != "abc" {
		t.Errorf("got %v, want abc", v)
	}
	if v := evalFormula(t, s, "=ROUND(3.14159,2)"); v != 3.14 {
		t.Errorf("got %v, want 3.14", v)
	}
}

// --- Cross-language parity: same scenario used in the TS and PHP test suites ---
// See ARCHITECTURE.md §8 and MASTERPROMPT-STAGES.md Stage 7's suggested scenarios.
func TestCrossLanguageParityCompoundFormula(t *testing.T) {
	s := NewSheet("S1")
	_ = s.SetValue(0, 0, 10.0) // A1
	_ = s.SetValue(0, 1, 20.0) // B1
	v := evalFormula(t, s, "=SUM(A1:B1)*2+IF(A1>5,1,0)")
	if v != 61.0 {
		t.Fatalf("expected 61 (matching TS and PHP results for this exact scenario), got %v", v)
	}
}

// --- Security hardening tests ---

func TestFormulaParserRefusesDeepParenNesting(t *testing.T) {
	depth := 5000
	formula := "=" + strings.Repeat("(", depth) + "1" + strings.Repeat(")", depth)
	_, err := ParseFormula(formula)
	if err == nil {
		t.Fatal("expected an error for pathological nesting depth")
	}
	if !strings.Contains(err.Error(), "maximum supported depth") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestFormulaParserRefusesLongUnaryChains(t *testing.T) {
	formula := "=" + strings.Repeat("-", 5000) + "1"
	_, err := ParseFormula(formula)
	if err == nil {
		t.Fatal("expected an error for pathological unary chain")
	}
	if !strings.Contains(err.Error(), "maximum supported depth") {
		t.Errorf("unexpected error message: %v", err)
	}
}

func TestFormulaParserStillHandlesReasonableNesting(t *testing.T) {
	_, err := ParseFormula("=((((1+2))))*3")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestEvaluateNeverPanicsOnMalformedRangeAsTopLevelExpr(t *testing.T) {
	// A bare range isn't a valid top-level value — must degrade to a
	// FormulaError, never panic the process.
	s := NewSheet("S1")
	ast, err := ParseFormula("=A1:A3")
	if err != nil {
		t.Fatalf("unexpected parse error: %v", err)
	}
	v := Evaluate(ast, SheetResolver(s))
	if _, ok := v.(FormulaError); !ok {
		t.Errorf("expected a FormulaError, got %v (%T)", v, v)
	}
}
