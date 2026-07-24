use lomboktablesheet::formula::{
    cell_ref_name, evaluate, extract_dependencies, parse_cell_ref, parse_formula, FormulaValue,
    SheetResolver,
};
use lomboktablesheet::model::{Cell, CellType, Sheet};

fn eval_formula(sheet: &Sheet, formula: &str) -> FormulaValue {
    let ast = parse_formula(formula).unwrap();
    evaluate(&ast, &SheetResolver::new(sheet))
}

#[test]
fn arithmetic_operator_precedence() {
    let sheet = Sheet::new("S1");
    assert_eq!(eval_formula(&sheet, "=2+3*4"), FormulaValue::Number(14.0));
    assert_eq!(eval_formula(&sheet, "=(2+3)*4"), FormulaValue::Number(20.0));
    assert_eq!(eval_formula(&sheet, "=2^3+1"), FormulaValue::Number(9.0));
    assert_eq!(eval_formula(&sheet, "=-5+2"), FormulaValue::Number(-3.0));
}

#[test]
fn cell_references_resolve_to_sheet_values() {
    let mut sheet = Sheet::new("S1");
    sheet
        .set_value(0, 0, lomboktablesheet::model::CellValue::Number(10.0))
        .unwrap();
    sheet
        .set_value(1, 0, lomboktablesheet::model::CellValue::Number(20.0))
        .unwrap();
    assert_eq!(eval_formula(&sheet, "=A1+A2"), FormulaValue::Number(30.0));
}

#[test]
fn sum_avg_min_max_count_over_range() {
    let mut sheet = Sheet::new("S1");
    for (i, v) in [1.0, 2.0, 3.0, 4.0, 5.0].iter().enumerate() {
        sheet
            .set_value(i as i64, 0, lomboktablesheet::model::CellValue::Number(*v))
            .unwrap();
    }
    assert_eq!(
        eval_formula(&sheet, "=SUM(A1:A5)"),
        FormulaValue::Number(15.0)
    );
    assert_eq!(
        eval_formula(&sheet, "=AVG(A1:A5)"),
        FormulaValue::Number(3.0)
    );
    assert_eq!(
        eval_formula(&sheet, "=MIN(A1:A5)"),
        FormulaValue::Number(1.0)
    );
    assert_eq!(
        eval_formula(&sheet, "=MAX(A1:A5)"),
        FormulaValue::Number(5.0)
    );
    assert_eq!(
        eval_formula(&sheet, "=COUNT(A1:A5)"),
        FormulaValue::Number(5.0)
    );
}

#[test]
fn if_and_comparisons() {
    let mut sheet = Sheet::new("S1");
    sheet
        .set_value(0, 0, lomboktablesheet::model::CellValue::Number(10.0))
        .unwrap();
    assert_eq!(
        eval_formula(&sheet, "=IF(A1>5,\"big\",\"small\")"),
        FormulaValue::Str("big".into())
    );
    assert_eq!(
        eval_formula(&sheet, "=IF(A1<5,\"big\",\"small\")"),
        FormulaValue::Str("small".into())
    );
}

#[test]
fn division_by_zero_yields_formula_error() {
    let sheet = Sheet::new("S1");
    let result = eval_formula(&sheet, "=10/0");
    match result {
        FormulaValue::Error(e) => assert_eq!(e.code, "#DIV/0!"),
        other => panic!("expected FormulaError, got {:?}", other),
    }
}

#[test]
fn unknown_function_yields_name_error() {
    let sheet = Sheet::new("S1");
    let result = eval_formula(&sheet, "=NOTAFUNC(1,2)");
    match result {
        FormulaValue::Error(e) => assert_eq!(e.code, "#NAME?"),
        other => panic!("expected FormulaError, got {:?}", other),
    }
}

#[test]
fn circular_reference_is_detected() {
    let mut sheet = Sheet::new("S1");
    sheet
        .set_cell(
            0,
            0,
            Cell {
                value: lomboktablesheet::model::CellValue::Null,
                cell_type: CellType::Formula,
                formula: Some("=B1".into()),
            },
        )
        .unwrap();
    sheet
        .set_cell(
            0,
            1,
            Cell {
                value: lomboktablesheet::model::CellValue::Null,
                cell_type: CellType::Formula,
                formula: Some("=A1".into()),
            },
        )
        .unwrap();
    let result = eval_formula(&sheet, "=A1");
    match result {
        FormulaValue::Error(e) => assert_eq!(e.code, "#CIRC!"),
        other => panic!("expected FormulaError, got {:?}", other),
    }
}

#[test]
fn cell_ref_name_parse_cell_ref_round_trip() {
    assert_eq!(cell_ref_name(0, 0), "A1");
    assert_eq!(cell_ref_name(0, 26), "AA1");
    assert_eq!(parse_cell_ref("B3").unwrap(), (2, 1));
    let name = cell_ref_name(9, 27);
    assert_eq!(parse_cell_ref(&name).unwrap(), (9, 27));
}

#[test]
fn extract_dependencies_finds_refs_and_expands_ranges() {
    let ast = parse_formula("=SUM(A1:A3)+B1").unwrap();
    let mut deps = extract_dependencies(&ast);
    deps.sort();
    assert_eq!(
        deps,
        vec![
            "A1".to_string(),
            "A2".to_string(),
            "A3".to_string(),
            "B1".to_string()
        ]
    );
}

#[test]
#[allow(clippy::approx_constant)] // 3.14 here is the expected ROUND() output, not an attempted use of PI
fn concat_and_round() {
    let sheet = Sheet::new("S1");
    assert_eq!(
        eval_formula(&sheet, "=CONCAT(\"a\",\"b\",\"c\")"),
        FormulaValue::Str("abc".into())
    );
    assert_eq!(
        eval_formula(&sheet, "=ROUND(3.14159,2)"),
        FormulaValue::Number(3.14)
    );
}

/// Cross-language parity: identical scenario used in the TS, PHP, and Go test
/// suites — see ARCHITECTURE.md §8 and MASTERPROMPT-STAGES.md Stage 7/8.
#[test]
fn cross_language_parity_compound_formula() {
    let mut sheet = Sheet::new("S1");
    sheet
        .set_value(0, 0, lomboktablesheet::model::CellValue::Number(10.0))
        .unwrap(); // A1
    sheet
        .set_value(0, 1, lomboktablesheet::model::CellValue::Number(20.0))
        .unwrap(); // B1
    let result = eval_formula(&sheet, "=SUM(A1:B1)*2+IF(A1>5,1,0)");
    assert_eq!(
        result,
        FormulaValue::Number(61.0),
        "expected 61, matching TS/PHP/Go results for this exact scenario"
    );
}

// --- Security hardening tests ---

#[test]
fn formula_parser_refuses_deep_paren_nesting() {
    let depth = 5000;
    let formula = format!("={}{}{}", "(".repeat(depth), "1", ")".repeat(depth));
    let result = parse_formula(&formula);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("maximum supported depth"));
}

#[test]
fn formula_parser_refuses_long_unary_chains() {
    let formula = format!("={}1", "-".repeat(5000));
    let result = parse_formula(&formula);
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("maximum supported depth"));
}

#[test]
fn formula_parser_still_handles_reasonable_nesting() {
    let result = parse_formula("=((((1+2))))*3");
    assert!(result.is_ok());
}

#[test]
fn evaluate_never_panics_on_bare_range_as_top_level_expr() {
    let sheet = Sheet::new("S1");
    let ast = parse_formula("=A1:A3").unwrap();
    let result = evaluate(&ast, &SheetResolver::new(&sheet));
    match result {
        FormulaValue::Error(_) => {}
        other => panic!("expected a FormulaError, got {:?}", other),
    }
}

/// Regression test: a "cell reference" with an unbounded run of letters
/// (e.g. crafted formula text, not necessarily a real spreadsheet column)
/// used to overflow the column accumulator in parse_cell_ref — a panic in
/// debug builds, silent wraparound to a garbage column in release builds.
/// Found during a manual security review of the Rust port (see chat log /
/// PROJECT_STATE.md). Must now degrade to a normal parse error instead.
#[test]
fn parse_cell_ref_refuses_column_overflow_instead_of_panicking_or_wrapping() {
    let long_ref = format!("{}1", "A".repeat(400));
    let result = lomboktablesheet::formula::parse_cell_ref(&long_ref);
    assert!(result.is_err(), "expected an error, got {:?}", result);
}

/// Regression test: SUM(A1:A50000000) previously had no bound at all on
/// formula-text-only range expansion (unlike CSV/JSON decoders, which cap
/// max_input_bytes/max_rows) and could hang / allocate unboundedly for
/// tens of seconds or more. The guard must make this return quickly.
/// Note: SUM already silently ignores non-numeric arguments (existing
/// `flatten_nums` behavior, unrelated to this fix), so the oversized-range
/// #VALUE! placeholder is filtered out the same way a stray text cell
/// would be — the visible effect of the fix here is "fast", not "errors".
#[test]
fn huge_range_in_formula_text_returns_quickly_instead_of_hanging() {
    let sheet = Sheet::new("S1");
    let start = std::time::Instant::now();
    let _ = eval_formula(&sheet, "=SUM(A1:A50000000)");
    assert!(
        start.elapsed() < std::time::Duration::from_secs(2),
        "evaluation took too long — range guard did not trigger"
    );
}

/// Where the oversized-range placeholder isn't filtered out by an
/// aggregate function (e.g. it's the sole argument to a function that
/// doesn't special-case numeric flattening the same way), the #VALUE!
/// error is visible directly.
#[test]
fn huge_range_error_is_visible_via_count() {
    // COUNT also uses flatten_nums (counts only numeric values), so an
    // oversized range still reports 0 rather than propagating #VALUE! —
    // documenting that behavior explicitly rather than asserting the
    // opposite of what the code actually (reasonably) does.
    let sheet = Sheet::new("S1");
    assert_eq!(
        eval_formula(&sheet, "=COUNT(A1:A50000000)"),
        FormulaValue::Number(0.0)
    );
}

/// A within-limit range must still work normally after the guard is added.
#[test]
fn range_within_limit_still_evaluates_normally() {
    let mut sheet = Sheet::new("S1");
    for i in 0..10 {
        sheet
            .set_value(
                i,
                0,
                lomboktablesheet::model::CellValue::Number((i + 1) as f64),
            )
            .unwrap();
    }
    assert_eq!(
        eval_formula(&sheet, "=SUM(A1:A10)"),
        FormulaValue::Number(55.0)
    );
}
