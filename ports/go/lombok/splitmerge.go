package lombok

import "fmt"

// ConflictStrategy mirrors the TS/PHP merge conflict strategies.
type ConflictStrategy string

const (
	LeftWins  ConflictStrategy = "left-wins"
	RightWins ConflictStrategy = "right-wins"
	OnError   ConflictStrategy = "error"
)

// SplitByRows splits the named sheet at row index `at`, returning two workbooks.
func SplitByRows(w *Workbook, sheetName string, at int) (*Workbook, *Workbook, error) {
	sheet := w.Sheet(sheetName)
	if sheet == nil {
		return nil, nil, fmt.Errorf("sheet not found: %s", sheetName)
	}
	rows := sheet.ToRows()
	if at < 0 {
		at = 0
	}
	if at > len(rows) {
		at = len(rows)
	}
	top := rows[:at]
	bottom := rows[at:]
	return WorkbookFromRows(top, sheet.Name+"_part1", w.Locale),
		WorkbookFromRows(bottom, sheet.Name+"_part2", w.Locale), nil
}

// SplitByColumns splits the named sheet at column index `at`.
func SplitByColumns(w *Workbook, sheetName string, at int) (*Workbook, *Workbook, error) {
	sheet := w.Sheet(sheetName)
	if sheet == nil {
		return nil, nil, fmt.Errorf("sheet not found: %s", sheetName)
	}
	rows := sheet.ToRows()
	left := make([][]interface{}, len(rows))
	right := make([][]interface{}, len(rows))
	for i, row := range rows {
		a := at
		if a < 0 {
			a = 0
		}
		if a > len(row) {
			a = len(row)
		}
		left[i] = append([]interface{}{}, row[:a]...)
		right[i] = append([]interface{}{}, row[a:]...)
	}
	return WorkbookFromRows(left, sheet.Name+"_left", w.Locale),
		WorkbookFromRows(right, sheet.Name+"_right", w.Locale), nil
}

// SplitBySheet returns one single-sheet workbook per sheet in w.
func SplitBySheet(w *Workbook) []*Workbook {
	out := make([]*Workbook, 0, len(w.Sheets))
	for _, s := range w.Sheets {
		wb := NewWorkbook(w.Locale)
		wb.AddSheet(s.Clone())
		out = append(out, wb)
	}
	return out
}

// Merge combines multiple workbooks. Sheets with the same name are combined
// row-wise, in the order the workbooks were passed. onConflict controls
// behavior when the same sheet name appears in more than one input workbook:
// currently row-wise append happens regardless (matching the TS/PHP
// implementations), and "error" additionally rejects the merge outright if
// any sheet name repeats across inputs.
func Merge(workbooks []*Workbook, onConflict ConflictStrategy) (*Workbook, error) {
	if len(workbooks) == 0 {
		return nil, fmt.Errorf("merge requires at least one workbook")
	}
	if onConflict == "" {
		onConflict = LeftWins
	}
	result := NewWorkbook(workbooks[0].Locale)

	order := []string{}
	bySheetName := map[string][][]interface{}{}
	seenCount := map[string]int{}

	for _, wb := range workbooks {
		for _, sheet := range wb.Sheets {
			rows := sheet.ToRows()
			seenCount[sheet.Name]++
			if existing, ok := bySheetName[sheet.Name]; !ok {
				bySheetName[sheet.Name] = rows
				order = append(order, sheet.Name)
			} else {
				width := 0
				if len(existing) > 0 {
					width = len(existing[0])
				}
				if len(rows) > 0 && len(rows[0]) > width {
					width = len(rows[0])
				}
				for _, row := range rows {
					padded := append([]interface{}{}, row...)
					for len(padded) < width {
						padded = append(padded, nil)
					}
					existing = append(existing, padded)
				}
				bySheetName[sheet.Name] = existing
			}
		}
	}

	if onConflict == OnError {
		var dupes []string
		for name, count := range seenCount {
			if count > 1 {
				dupes = append(dupes, name)
			}
		}
		if len(dupes) > 0 {
			return nil, fmt.Errorf("sheet name conflicts during merge (strategy=error): %v", dupes)
		}
	}

	for _, name := range order {
		wb := WorkbookFromRows(bySheetName[name], name, result.Locale)
		result.AddSheet(wb.Sheets[0])
	}
	return result, nil
}
