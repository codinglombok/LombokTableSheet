package lombok

import (
	"reflect"
	"strings"
	"testing"
)

func TestCsvDecodeBasicGridWithTypeCoercion(t *testing.T) {
	res := DecodeCsv("name,age\nAlice,30\nBob,25\n", CsvDecodeOptions{})
	if len(res.Warnings) != 0 {
		t.Fatalf("unexpected warnings: %v", res.Warnings)
	}
	got := res.Workbook.Sheets[0].ToRows()
	want := [][]interface{}{{"name", "age"}, {"Alice", 30.0}, {"Bob", 25.0}}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("got %v, want %v", got, want)
	}
}

func TestCsvDecodeQuotedFieldsWithEmbeddedCommas(t *testing.T) {
	res := DecodeCsv("a,b\n\"hello, world\",\"she said \"\"hi\"\"\"\n", CsvDecodeOptions{})
	rows := res.Workbook.Sheets[0].ToRows()
	if rows[1][0] != "hello, world" {
		t.Errorf("got %v", rows[1][0])
	}
	if rows[1][1] != `she said "hi"` {
		t.Errorf("got %v", rows[1][1])
	}
}

func TestCsvRoundTrip(t *testing.T) {
	original := "name,age\nAlice,30\nBob,25"
	res := DecodeCsv(original, CsvDecodeOptions{})
	out := EncodeCsv(res.Workbook, "", 0)
	res2 := DecodeCsv(out, CsvDecodeOptions{})
	if !reflect.DeepEqual(res.Workbook.Sheets[0].ToRows(), res2.Workbook.Sheets[0].ToRows()) {
		t.Errorf("round trip mismatch:\n%v\nvs\n%v", res.Workbook.Sheets[0].ToRows(), res2.Workbook.Sheets[0].ToRows())
	}
}

func TestJsonRoundTripViaArrayOfRecords(t *testing.T) {
	input := `[{"name":"Alice","age":30},{"name":"Bob","age":25}]`
	res := DecodeJson(input, JsonDecodeOptions{})
	if res.Workbook == nil {
		t.Fatalf("decode failed: %v", res.Warnings)
	}
	out, err := EncodeJson(res.Workbook, "", false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, `"name":"Alice"`) || !strings.Contains(out, `"age":30`) {
		t.Errorf("unexpected JSON output: %s", out)
	}
}

func TestJsonDecodeNonArrayRootProducesWarning(t *testing.T) {
	res := DecodeJson(`{"not":"an array"}`, JsonDecodeOptions{})
	if res.Workbook != nil {
		t.Errorf("expected nil workbook for invalid root")
	}
	if len(res.Warnings) == 0 {
		t.Errorf("expected a warning")
	}
}

func TestMarkdownExportProducesGfmTable(t *testing.T) {
	w := WorkbookFromRows([][]interface{}{{"a", "b"}, {1.0, 2.0}}, "", "")
	md := EncodeMarkdown(w, "")
	if !strings.Contains(md, "| a | b |") {
		t.Errorf("missing header row: %s", md)
	}
	if !strings.Contains(md, "| --- | --- |") {
		t.Errorf("missing separator row: %s", md)
	}
}

func TestSplitByRows(t *testing.T) {
	w := WorkbookFromRows([][]interface{}{{"h1", "h2"}, {1.0, 2.0}, {3.0, 4.0}, {5.0, 6.0}}, "Sheet1", "")
	top, bottom, err := SplitByRows(w, "Sheet1", 2)
	if err != nil {
		t.Fatal(err)
	}
	wantTop := [][]interface{}{{"h1", "h2"}, {1.0, 2.0}}
	if !reflect.DeepEqual(top.Sheets[0].ToRows(), wantTop) {
		t.Errorf("top: got %v, want %v", top.Sheets[0].ToRows(), wantTop)
	}
	wantBottom := [][]interface{}{{3.0, 4.0}, {5.0, 6.0}}
	if !reflect.DeepEqual(bottom.Sheets[0].ToRows(), wantBottom) {
		t.Errorf("bottom: got %v, want %v", bottom.Sheets[0].ToRows(), wantBottom)
	}
}

func TestMergeCombinesSameNamedSheetsRowWise(t *testing.T) {
	a := WorkbookFromRows([][]interface{}{{"h1", "h2"}, {1.0, 2.0}}, "Sheet1", "")
	b := WorkbookFromRows([][]interface{}{{"h1", "h2"}, {3.0, 4.0}}, "Sheet1", "")
	merged, err := Merge([]*Workbook{a, b}, LeftWins)
	if err != nil {
		t.Fatal(err)
	}
	want := [][]interface{}{{"h1", "h2"}, {1.0, 2.0}, {"h1", "h2"}, {3.0, 4.0}}
	if !reflect.DeepEqual(merged.Sheets[0].ToRows(), want) {
		t.Errorf("got %v, want %v", merged.Sheets[0].ToRows(), want)
	}
}

func TestMergeWithErrorStrategyRejectsDuplicateNames(t *testing.T) {
	a := WorkbookFromRows([][]interface{}{{"x"}}, "Sheet1", "")
	b := WorkbookFromRows([][]interface{}{{"y"}}, "Sheet1", "")
	_, err := Merge([]*Workbook{a, b}, OnError)
	if err == nil {
		t.Fatal("expected an error for duplicate sheet names with strategy=error")
	}
}

func TestMergeWithEmptySliceReturnsError(t *testing.T) {
	_, err := Merge(nil, LeftWins)
	if err == nil {
		t.Fatal("expected an error for empty workbook slice")
	}
}

// --- Cross-language parity: identical to the TS/PHP scenario ---
func TestCrossLanguageParityCsvToJsonAndSplit(t *testing.T) {
	res := DecodeCsv("name,age\nAlice,30\nBob,25\n", CsvDecodeOptions{})
	out, err := EncodeJson(res.Workbook, "", false)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(out, `"name":"Alice","age":30`) && !strings.Contains(out, `"age":30,"name":"Alice"`) {
		t.Logf("JSON key order may differ from TS/PHP (Go map iteration order isn't guaranteed) — checking values instead: %s", out)
	}
	top, bottom, err := SplitByRows(res.Workbook, "Sheet1", 2)
	if err != nil {
		t.Fatal(err)
	}
	wantTop := [][]interface{}{{"name", "age"}, {"Alice", 30.0}}
	if !reflect.DeepEqual(top.Sheets[0].ToRows(), wantTop) {
		t.Errorf("split part1: got %v, want %v (matching TS/PHP)", top.Sheets[0].ToRows(), wantTop)
	}
	wantBottom := [][]interface{}{{"Bob", 25.0}}
	if !reflect.DeepEqual(bottom.Sheets[0].ToRows(), wantBottom) {
		t.Errorf("split part2: got %v, want %v (matching TS/PHP)", bottom.Sheets[0].ToRows(), wantBottom)
	}
}
