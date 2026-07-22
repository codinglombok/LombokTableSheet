package lombok

import "testing"

func TestCsvDecodeRefusesOversizedInput(t *testing.T) {
	res := DecodeCsv("a,b\n1,2\n", CsvDecodeOptions{MaxInputBytes: 4})
	if res.Workbook != nil {
		t.Fatal("expected nil workbook for oversized input")
	}
	if len(res.Warnings) == 0 {
		t.Fatal("expected a warning")
	}
}

func TestCsvDecodeRefusesTooManyRows(t *testing.T) {
	text := ""
	for i := 0; i < 100; i++ {
		text += "row\n"
	}
	res := DecodeCsv(text, CsvDecodeOptions{MaxRows: 10})
	if res.Workbook != nil {
		t.Fatal("expected nil workbook when row limit exceeded")
	}
}

func TestCsvDecodeStillWorksWithDefaultLimits(t *testing.T) {
	res := DecodeCsv("a,b\n1,2\n", CsvDecodeOptions{})
	if res.Workbook == nil {
		t.Fatalf("unexpected failure: %v", res.Warnings)
	}
}

func TestJsonDecodeRefusesOversizedInput(t *testing.T) {
	res := DecodeJson(`[{"a":1}]`, JsonDecodeOptions{MaxInputBytes: 2})
	if res.Workbook != nil {
		t.Fatal("expected nil workbook for oversized input")
	}
}

func TestEvaluateRecoversFromInternalPanic(t *testing.T) {
	// Evaluate wraps evalNode in a recover() specifically so a bug deep in
	// evaluation (e.g. an unexpected nil dereference on hostile input) turns
	// into a #ERROR! value, not a crashed process. This test exercises that
	// safety net directly via a resolver that panics.
	panicResolver := panicOnResolve{}
	ast, err := ParseFormula("=A1")
	if err != nil {
		t.Fatal(err)
	}
	result := Evaluate(ast, panicResolver)
	fe, ok := result.(FormulaError)
	if !ok || fe.Code != "#ERROR!" {
		t.Errorf("expected #ERROR! FormulaError after a panic was recovered, got %v", result)
	}
}

type panicOnResolve struct{}

func (panicOnResolve) Resolve(ref string) FormulaValue {
	panic("simulated internal failure")
}
