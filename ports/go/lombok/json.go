package lombok

import (
	"encoding/json"
	"fmt"
	"strings"
)

// JsonDecodeOptions mirrors the TS decodeJson options.
type JsonDecodeOptions struct {
	SheetName     string
	Locale        string
	MaxInputBytes int
}

// DecodeJson decodes a JSON array-of-records string into a Workbook, using the
// union of all record keys (in first-seen order) as columns.
func DecodeJson(text string, opts JsonDecodeOptions) ImportResult {
	maxInputBytes := opts.MaxInputBytes
	if maxInputBytes == 0 {
		maxInputBytes = defaultMaxInputBytes
	}
	if len(text) > maxInputBytes {
		return ImportResult{nil, []ImportWarning{{fmt.Sprintf(
			"input exceeds the configured size limit of %d bytes; refusing to parse (possible resource-exhaustion attempt)", maxInputBytes)}}}
	}

	var data []map[string]interface{}
	if err := json.Unmarshal([]byte(text), &data); err != nil {
		return ImportResult{nil, []ImportWarning{{fmt.Sprintf("JSON root must be an array of records (or parse failed): %s", err.Error())}}}
	}

	var keys []string
	seen := map[string]bool{}
	for _, rec := range data {
		for k := range rec {
			if !seen[k] {
				seen[k] = true
				keys = append(keys, k)
			}
		}
	}

	rows := make([][]interface{}, 0, len(data)+1)
	header := make([]interface{}, len(keys))
	for i, k := range keys {
		header[i] = k
	}
	rows = append(rows, header)
	for _, rec := range data {
		row := make([]interface{}, len(keys))
		for i, k := range keys {
			row[i] = rec[k]
		}
		rows = append(rows, row)
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

// EncodeJson serializes a workbook's sheet to a JSON array-of-records string.
func EncodeJson(w *Workbook, sheetName string, pretty bool) (string, error) {
	var sheet *Sheet
	if sheetName != "" {
		sheet = w.Sheet(sheetName)
	} else if len(w.Sheets) > 0 {
		sheet = w.Sheets[0]
	}
	if sheet == nil {
		return "[]", nil
	}
	rows := sheet.ToRows()
	if len(rows) == 0 {
		return "[]", nil
	}
	header := rows[0]
	records := make([]map[string]interface{}, 0, len(rows)-1)
	for _, row := range rows[1:] {
		rec := map[string]interface{}{}
		for i, h := range header {
			key := fmt.Sprintf("%v", h)
			if h == nil {
				key = fmt.Sprintf("col%d", i)
			}
			if i < len(row) {
				rec[key] = row[i]
			} else {
				rec[key] = nil
			}
		}
		records = append(records, rec)
	}

	var b []byte
	var err error
	if pretty {
		b, err = json.MarshalIndent(records, "", "  ")
	} else {
		b, err = json.Marshal(records)
	}
	if err != nil {
		return "", err
	}
	return string(b), nil
}

// EncodeMarkdown produces a GitHub-flavored Markdown table. Export-only, same
// rationale as the TS/PHP ports: Markdown tables are a lossy, ambiguous
// source format, so import is intentionally not offered.
func EncodeMarkdown(w *Workbook, sheetName string) string {
	var sheet *Sheet
	if sheetName != "" {
		sheet = w.Sheet(sheetName)
	} else if len(w.Sheets) > 0 {
		sheet = w.Sheets[0]
	}
	if sheet == nil {
		return ""
	}
	rows := sheet.ToRows()
	if len(rows) == 0 {
		return ""
	}
	esc := func(v interface{}) string {
		s := formatCsvValue(v)
		s = strings.ReplaceAll(s, "|", "\\|")
		s = strings.ReplaceAll(s, "\n", " ")
		return s
	}
	var lines []string
	header := rows[0]
	headerCells := make([]string, len(header))
	sepCells := make([]string, len(header))
	for i, h := range header {
		headerCells[i] = esc(h)
		sepCells[i] = "---"
	}
	lines = append(lines, "| "+strings.Join(headerCells, " | ")+" |")
	lines = append(lines, "| "+strings.Join(sepCells, " | ")+" |")
	for _, row := range rows[1:] {
		cells := make([]string, len(row))
		for i, v := range row {
			cells[i] = esc(v)
		}
		lines = append(lines, "| "+strings.Join(cells, " | ")+" |")
	}
	return strings.Join(lines, "\n")
}
