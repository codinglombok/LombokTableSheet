package lombok

import (
	"encoding/csv"
	"fmt"
	"strconv"
	"strings"
)

// ImportWarning mirrors the TS/PHP ImportWarning — decoders never panic on
// malformed input, they return warnings instead (see MASTERPROMPT.md
// non-negotiable #7 and SECURITY.md).
type ImportWarning struct {
	Message string
}

// ImportResult mirrors the TS/PHP { workbook, warnings } decode result shape.
type ImportResult struct {
	Workbook *Workbook
	Warnings []ImportWarning
}

const defaultMaxInputBytes = 100 * 1024 * 1024 // 100MB
const defaultMaxRows = 2_000_000

// CsvDecodeOptions mirrors the TS decodeCsv options.
type CsvDecodeOptions struct {
	Delimiter     rune
	SheetName     string
	Locale        string
	MaxInputBytes int
	MaxRows       int
}

func coerceCsvValue(raw string) interface{} {
	if raw == "" {
		return nil
	}
	if raw == "true" {
		return true
	}
	if raw == "false" {
		return false
	}
	if f, err := strconv.ParseFloat(raw, 64); err == nil {
		return f
	}
	return raw
}

// DecodeCsv parses CSV text into a Workbook. Uses Go's standard library
// encoding/csv for RFC-4180 correctness (quoted fields, embedded commas/
// newlines) rather than a hand-rolled parser — this is deliberately different
// from the TS core's XLSX situation, where hand-rolling was chosen to avoid a
// third-party dependency; encoding/csv is standard library, not a dependency,
// so there's no reason not to use it (see MASTERPROMPT-STAGES.md Stage 7).
func DecodeCsv(text string, opts CsvDecodeOptions) ImportResult {
	maxInputBytes := opts.MaxInputBytes
	if maxInputBytes == 0 {
		maxInputBytes = defaultMaxInputBytes
	}
	maxRows := opts.MaxRows
	if maxRows == 0 {
		maxRows = defaultMaxRows
	}
	if len(text) > maxInputBytes {
		return ImportResult{nil, []ImportWarning{{fmt.Sprintf(
			"input exceeds the configured size limit of %d bytes; refusing to parse (possible resource-exhaustion attempt)", maxInputBytes)}}}
	}

	delimiter := opts.Delimiter
	if delimiter == 0 {
		delimiter = ','
	}
	r := csv.NewReader(strings.NewReader(text))
	r.Comma = delimiter
	r.FieldsPerRecord = -1 // allow ragged rows, matching the permissive TS/PHP parsers

	records, err := r.ReadAll()
	if err != nil {
		return ImportResult{nil, []ImportWarning{{fmt.Sprintf("CSV parse failed: %s", err.Error())}}}
	}
	if len(records) > maxRows {
		return ImportResult{nil, []ImportWarning{{fmt.Sprintf(
			"input has %d rows, exceeding the configured limit of %d; refusing to parse", len(records), maxRows)}}}
	}

	rows := make([][]interface{}, len(records))
	for i, rec := range records {
		row := make([]interface{}, len(rec))
		for j, field := range rec {
			row[j] = coerceCsvValue(field)
		}
		rows[i] = row
	}

	sheetName := opts.SheetName
	if sheetName == "" {
		sheetName = "Sheet1"
	}
	locale := opts.Locale
	if locale == "" {
		locale = "en-US"
	}
	return ImportResult{WorkbookFromRows(rows, sheetName, locale), nil}
}

// EncodeCsv serializes a workbook's sheet (first sheet, or sheetName if given) to CSV.
func EncodeCsv(w *Workbook, sheetName string, delimiter rune) string {
	var sheet *Sheet
	if sheetName != "" {
		sheet = w.Sheet(sheetName)
	} else if len(w.Sheets) > 0 {
		sheet = w.Sheets[0]
	}
	if sheet == nil {
		return ""
	}
	if delimiter == 0 {
		delimiter = ','
	}

	var sb strings.Builder
	writer := csv.NewWriter(&sb)
	writer.Comma = delimiter
	writer.UseCRLF = true

	for _, row := range sheet.ToRows() {
		record := make([]string, len(row))
		for i, v := range row {
			record[i] = formatCsvValue(v)
		}
		_ = writer.Write(record)
	}
	writer.Flush()
	return strings.TrimRight(sb.String(), "\r\n")
}

func formatCsvValue(v interface{}) string {
	switch t := v.(type) {
	case nil:
		return ""
	case bool:
		if t {
			return "true"
		}
		return "false"
	case float64:
		return strconv.FormatFloat(t, 'g', -1, 64)
	default:
		return fmt.Sprintf("%v", t)
	}
}
