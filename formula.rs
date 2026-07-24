//! Formula engine — same tokenizer -> Pratt parser -> AST -> evaluator shape
//! as the TS/PHP/Go engines. No `eval`-equivalent exists in Rust to accidentally
//! reach for, but the architecture is kept identical across languages on
//! purpose (see MASTERPROMPT.md non-negotiable #1 and ARCHITECTURE.md §3.3).

use crate::model::{Cell, CellType, CellValue, Sheet};
use std::collections::HashSet;
use std::fmt;

#[derive(Debug, Clone, PartialEq)]
pub struct FormulaError {
    pub code: &'static str,
}

impl fmt::Display for FormulaError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.code)
    }
}

/// What evaluation produces: a plain value or a typed error — never a panic
/// on hostile/malformed *data* (parse-time syntax errors are a separate,
/// explicit `Result::Err`, matching "errors are for programmer mistakes,
/// FormulaError is for data").
#[derive(Debug, Clone, PartialEq)]
pub enum FormulaValue {
    Number(f64),
    Str(String),
    Bool(bool),
    Error(FormulaError),
}

impl FormulaValue {
    pub fn as_f64(&self) -> Option<f64> {
        match self {
            FormulaValue::Number(n) => Some(*n),
            _ => None,
        }
    }
}

// ---------- Tokenizer ----------

#[derive(Debug, Clone, PartialEq)]
enum Tok {
    Number(f64),
    Str(String),
    Ref(String),
    Range(String, String),
    Ident(String),
    Op(String),
    LParen,
    RParen,
    Comma,
    Eof,
}

fn is_cell_ref(s: &str) -> bool {
    let bytes = s.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_uppercase() {
        i += 1;
    }
    if i == 0 || i == bytes.len() {
        return false;
    }
    bytes[i..].iter().all(|b| b.is_ascii_digit())
}

fn tokenize(input: &str) -> Result<Vec<Tok>, String> {
    let src: &str = input.trim().strip_prefix('=').unwrap_or(input.trim());
    let chars: Vec<char> = src.chars().collect();
    let mut tokens = Vec::new();
    let mut i = 0;
    let n = chars.len();

    while i < n {
        let c = chars[i];
        match c {
            ' ' | '\t' | '\n' | '\r' => i += 1,
            '(' => {
                tokens.push(Tok::LParen);
                i += 1;
            }
            ')' => {
                tokens.push(Tok::RParen);
                i += 1;
            }
            ',' => {
                tokens.push(Tok::Comma);
                i += 1;
            }
            '"' => {
                let mut j = i + 1;
                let mut s = String::new();
                while j < n && chars[j] != '"' {
                    s.push(chars[j]);
                    j += 1;
                }
                tokens.push(Tok::Str(s));
                i = j + 1;
            }
            c if c.is_ascii_digit() => {
                let mut j = i;
                while j < n && (chars[j].is_ascii_digit() || chars[j] == '.') {
                    j += 1;
                }
                let num_str: String = chars[i..j].iter().collect();
                let num = num_str
                    .parse::<f64>()
                    .map_err(|_| format!("invalid number: {}", num_str))?;
                tokens.push(Tok::Number(num));
                i = j;
            }
            c if c.is_ascii_alphabetic() => {
                let mut j = i;
                while j < n && chars[j].is_ascii_alphanumeric() {
                    j += 1;
                }
                let ident: String = chars[i..j].iter().collect();
                if is_cell_ref(&ident) {
                    if j < n && chars[j] == ':' {
                        let mut k = j + 1;
                        while k < n && chars[k].is_ascii_alphanumeric() {
                            k += 1;
                        }
                        let ident2: String = chars[j + 1..k].iter().collect();
                        if is_cell_ref(&ident2) {
                            tokens.push(Tok::Range(ident, ident2));
                            i = k;
                            continue;
                        }
                    }
                    tokens.push(Tok::Ref(ident));
                    i = j;
                    continue;
                }
                tokens.push(Tok::Ident(ident.to_uppercase()));
                i = j;
            }
            '+' | '-' | '*' | '/' | '^' => {
                tokens.push(Tok::Op(c.to_string()));
                i += 1;
            }
            '=' | '<' | '>' => {
                let mut op = c.to_string();
                i += 1;
                if i < n && ((chars[i] == '=' && c != '=') || (c == '<' && chars[i] == '>')) {
                    op.push(chars[i]);
                    i += 1;
                }
                tokens.push(Tok::Op(op));
            }
            other => return Err(format!("unexpected character in formula: '{}'", other)),
        }
    }
    tokens.push(Tok::Eof);
    Ok(tokens)
}

// ---------- AST ----------

#[derive(Debug, Clone)]
pub enum Node {
    Num(f64),
    Str(String),
    Ref(String),
    Range(String, String),
    Call(String, Vec<Node>),
    BinOp(String, Box<Node>, Box<Node>),
    Unary(String, Box<Node>),
}

fn precedence(op: &str) -> Option<i32> {
    match op {
        "=" | "<>" | "<" | "<=" | ">" | ">=" => Some(1),
        "+" | "-" => Some(2),
        "*" | "/" => Some(3),
        "^" => Some(4),
        _ => None,
    }
}

const MAX_PARSE_DEPTH: i32 = 200;

/// Maximum number of cells a single A1:Z9-style range may expand to during
/// evaluation. Matches the spirit of csv.rs's DEFAULT_MAX_ROWS / json.rs's
/// DEFAULT_MAX_INPUT_BYTES — a resource-exhaustion guard on untrusted input,
/// here applied to formula text rather than file input.
const MAX_RANGE_CELLS: i64 = 1_000_000;

struct Parser {
    tokens: Vec<Tok>,
    pos: usize,
    depth: i32,
}

impl Parser {
    fn peek(&self) -> &Tok {
        self.tokens.get(self.pos).unwrap_or(&Tok::Eof)
    }

    fn next(&mut self) -> Tok {
        let t = self.peek().clone();
        self.pos += 1;
        t
    }

    fn depth_guard(&mut self) -> Result<(), String> {
        self.depth += 1;
        if self.depth > MAX_PARSE_DEPTH {
            return Err(format!(
                "formula nesting exceeds the maximum supported depth ({}) — refusing to parse further to avoid a stack overflow",
                MAX_PARSE_DEPTH
            ));
        }
        Ok(())
    }

    fn parse_expr(&mut self, min_prec: i32) -> Result<Node, String> {
        self.depth_guard()?;
        let result = (|| {
            let mut left = self.parse_unary()?;
            // Not a plain `while let Tok::Op(op) = self.peek()` because the loop
            // also needs to break on operator precedence, not just token type —
            // clippy's while_let_loop suggestion doesn't fit that second condition.
            #[allow(clippy::while_let_loop)]
            loop {
                let op = match self.peek() {
                    Tok::Op(op) => op.clone(),
                    _ => break,
                };
                let prec = match precedence(&op) {
                    Some(p) if p >= min_prec => p,
                    _ => break,
                };
                self.next();
                let right = self.parse_expr(prec + 1)?;
                left = Node::BinOp(op, Box::new(left), Box::new(right));
            }
            Ok(left)
        })();
        self.depth -= 1;
        result
    }

    fn parse_unary(&mut self) -> Result<Node, String> {
        if let Tok::Op(op) = self.peek().clone() {
            if op == "-" || op == "+" {
                self.depth_guard()?;
                self.next();
                let arg = self.parse_unary();
                self.depth -= 1;
                return Ok(Node::Unary(op, Box::new(arg?)));
            }
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Result<Node, String> {
        match self.next() {
            Tok::Number(n) => Ok(Node::Num(n)),
            Tok::Str(s) => Ok(Node::Str(s)),
            Tok::Ref(r) => Ok(Node::Ref(r)),
            Tok::Range(a, b) => Ok(Node::Range(a, b)),
            Tok::Ident(name) => {
                if *self.peek() != Tok::LParen {
                    return Err(format!("unknown identifier: {}", name));
                }
                self.next(); // consume (
                let mut args = Vec::new();
                if *self.peek() != Tok::RParen {
                    args.push(self.parse_expr(0)?);
                    while *self.peek() == Tok::Comma {
                        self.next();
                        args.push(self.parse_expr(0)?);
                    }
                }
                if *self.peek() != Tok::RParen {
                    return Err("expected )".to_string());
                }
                self.next();
                Ok(Node::Call(name, args))
            }
            Tok::LParen => {
                let inner = self.parse_expr(0)?;
                if *self.peek() != Tok::RParen {
                    return Err("expected )".to_string());
                }
                self.next();
                Ok(inner)
            }
            other => Err(format!("unexpected token: {:?}", other)),
        }
    }
}

pub fn parse_formula(formula: &str) -> Result<Node, String> {
    let tokens = tokenize(formula)?;
    let mut parser = Parser {
        tokens,
        pos: 0,
        depth: 0,
    };
    let node = parser.parse_expr(0)?;
    if *parser.peek() != Tok::Eof {
        return Err(format!("unexpected trailing token: {:?}", parser.peek()));
    }
    Ok(node)
}

// ---------- Cell ref helpers ----------

pub fn parse_cell_ref(r#ref: &str) -> Result<(i64, i64), String> {
    let bytes = r#ref.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_uppercase() {
        i += 1;
    }
    if i == 0 || i == bytes.len() {
        return Err(format!("invalid cell reference: {}", r#ref));
    }
    let letters = &r#ref[..i];
    let digits = &r#ref[i..];
    if !digits.bytes().all(|b| b.is_ascii_digit()) {
        return Err(format!("invalid cell reference: {}", r#ref));
    }
    // Use checked arithmetic: an attacker-supplied "cell ref" with an
    // unbounded run of letters (e.g. formula text crafted to look like a
    // ref) previously overflowed this multiply — a panic in debug builds,
    // silent wraparound into a garbage column index in release builds.
    // Neither is acceptable for untrusted formula text; degrade to the
    // same explicit parse error as any other malformed reference instead.
    let mut col: i64 = 0;
    for ch in letters.chars() {
        col = col
            .checked_mul(26)
            .and_then(|v| v.checked_add(ch as i64 - 'A' as i64 + 1))
            .ok_or_else(|| format!("invalid cell reference: {} (column overflow)", r#ref))?;
    }
    let row: i64 = digits
        .parse()
        .map_err(|_| format!("invalid cell reference: {}", r#ref))?;
    Ok((row - 1, col - 1))
}

pub fn cell_ref_name(row: i64, col: i64) -> String {
    let mut c = col + 1;
    let mut letters = Vec::new();
    while c > 0 {
        let rem = (c - 1) % 26;
        letters.push((b'A' + rem as u8) as char);
        c = (c - 1) / 26;
    }
    letters.reverse();
    let letters: String = letters.into_iter().collect();
    format!("{}{}", letters, row + 1)
}

pub fn extract_dependencies(node: &Node) -> Vec<String> {
    let mut seen = std::collections::BTreeSet::new();
    fn walk(node: &Node, seen: &mut std::collections::BTreeSet<String>) {
        match node {
            Node::Ref(r) => {
                seen.insert(r.clone());
            }
            Node::Range(a, b) => {
                if let (Ok((r1, c1)), Ok((r2, c2))) = (parse_cell_ref(a), parse_cell_ref(b)) {
                    for r in r1.min(r2)..=r1.max(r2) {
                        for c in c1.min(c2)..=c1.max(c2) {
                            seen.insert(cell_ref_name(r, c));
                        }
                    }
                }
            }
            Node::Call(_, args) => {
                for a in args {
                    walk(a, seen);
                }
            }
            Node::BinOp(_, l, r) => {
                walk(l, seen);
                walk(r, seen);
            }
            Node::Unary(_, a) => walk(a, seen),
            _ => {}
        }
    }
    walk(node, &mut seen);
    seen.into_iter().collect()
}

// ---------- Evaluator ----------

pub trait CellResolver {
    fn resolve(&self, r#ref: &str) -> FormulaValue;
}

fn flatten_nums(args: &[Vec<FormulaValue>]) -> Vec<f64> {
    args.iter().flatten().filter_map(|v| v.as_f64()).collect()
}

fn call_builtin(name: &str, args: &[Vec<FormulaValue>]) -> FormulaValue {
    match name {
        "SUM" => FormulaValue::Number(flatten_nums(args).iter().sum()),
        "AVG" => {
            let nums = flatten_nums(args);
            if nums.is_empty() {
                FormulaValue::Number(0.0)
            } else {
                FormulaValue::Number(nums.iter().sum::<f64>() / nums.len() as f64)
            }
        }
        "MIN" => flatten_nums(args)
            .into_iter()
            .fold(None, |acc, v| Some(acc.map_or(v, |a: f64| a.min(v))))
            .map(FormulaValue::Number)
            .unwrap_or(FormulaValue::Number(0.0)),
        "MAX" => flatten_nums(args)
            .into_iter()
            .fold(None, |acc, v| Some(acc.map_or(v, |a: f64| a.max(v))))
            .map(FormulaValue::Number)
            .unwrap_or(FormulaValue::Number(0.0)),
        "COUNT" => FormulaValue::Number(flatten_nums(args).len() as f64),
        "ROUND" => {
            let nums = flatten_nums(args);
            let val = nums.first().copied().unwrap_or(0.0);
            let digits = nums.get(1).copied().unwrap_or(0.0);
            let factor = 10f64.powf(digits);
            FormulaValue::Number((val * factor).round() / factor)
        }
        "IF" => {
            let cond = args
                .first()
                .and_then(|g| g.first())
                .map(is_truthy)
                .unwrap_or(false);
            if cond {
                args.get(1)
                    .and_then(|g| g.first())
                    .cloned()
                    .unwrap_or(FormulaValue::Str(String::new()))
            } else {
                args.get(2)
                    .and_then(|g| g.first())
                    .cloned()
                    .unwrap_or(FormulaValue::Str(String::new()))
            }
        }
        "CONCAT" => {
            let s: String = args.iter().flatten().map(format_value).collect();
            FormulaValue::Str(s)
        }
        _ => FormulaValue::Error(FormulaError { code: "#NAME?" }),
    }
}

fn is_truthy(v: &FormulaValue) -> bool {
    match v {
        FormulaValue::Bool(b) => *b,
        FormulaValue::Number(n) => *n != 0.0,
        _ => false,
    }
}

fn format_value(v: &FormulaValue) -> String {
    match v {
        FormulaValue::Number(n) => format!("{}", n),
        FormulaValue::Bool(b) => format!("{}", b),
        FormulaValue::Str(s) => s.clone(),
        FormulaValue::Error(e) => e.code.to_string(),
    }
}

/// Evaluate never panics — malformed *data* degrades to a FormulaError value,
/// matching the "never throw on data" contract shared across all four languages.
pub fn evaluate(node: &Node, resolver: &dyn CellResolver) -> FormulaValue {
    match node {
        Node::Num(n) => FormulaValue::Number(*n),
        Node::Str(s) => FormulaValue::Str(s.clone()),
        Node::Ref(r) => resolver.resolve(r),
        Node::Range(_, _) => FormulaValue::Error(FormulaError { code: "#VALUE!" }),
        Node::Unary(op, arg) => {
            let v = evaluate(arg, resolver);
            match v.as_f64() {
                Some(f) => FormulaValue::Number(if op == "-" { -f } else { f }),
                None => FormulaValue::Error(FormulaError { code: "#VALUE!" }),
            }
        }
        Node::BinOp(op, l, r) => {
            if matches!(op.as_str(), "=" | "<>" | "<" | "<=" | ">" | ">=") {
                let lv = evaluate(l, resolver);
                let rv = evaluate(r, resolver);
                return match op.as_str() {
                    "=" => FormulaValue::Bool(lv == rv),
                    "<>" => FormulaValue::Bool(lv != rv),
                    "<" | "<=" | ">" | ">=" => match (lv.as_f64(), rv.as_f64()) {
                        (Some(a), Some(b)) => FormulaValue::Bool(match op.as_str() {
                            "<" => a < b,
                            "<=" => a <= b,
                            ">" => a > b,
                            _ => a >= b,
                        }),
                        _ => FormulaValue::Bool(false),
                    },
                    _ => FormulaValue::Error(FormulaError { code: "#ERROR!" }),
                };
            }
            let lv = evaluate(l, resolver);
            let rv = evaluate(r, resolver);
            match (lv.as_f64(), rv.as_f64()) {
                (Some(a), Some(b)) => match op.as_str() {
                    "+" => FormulaValue::Number(a + b),
                    "-" => FormulaValue::Number(a - b),
                    "*" => FormulaValue::Number(a * b),
                    "/" => {
                        if b == 0.0 {
                            FormulaValue::Error(FormulaError { code: "#DIV/0!" })
                        } else {
                            FormulaValue::Number(a / b)
                        }
                    }
                    "^" => FormulaValue::Number(a.powf(b)),
                    _ => FormulaValue::Error(FormulaError { code: "#ERROR!" }),
                },
                _ => FormulaValue::Error(FormulaError { code: "#VALUE!" }),
            }
        }
        Node::Call(name, arg_nodes) => {
            let mut args: Vec<Vec<FormulaValue>> = Vec::with_capacity(arg_nodes.len());
            for arg in arg_nodes {
                if let Node::Range(a, b) = arg {
                    match (parse_cell_ref(a), parse_cell_ref(b)) {
                        (Ok((r1, c1)), Ok((r2, c2))) => {
                            let rows = r1.max(r2) - r1.min(r2) + 1;
                            let cols = c1.max(c2) - c1.min(c2) + 1;
                            // A range like A1:A50000000 previously had no
                            // guard at all — unlike the CSV/JSON decoders
                            // (max_input_bytes/max_rows), formula range
                            // expansion could allocate and iterate an
                            // unbounded number of cells from formula *text*
                            // alone, with no sheet data behind it. Cap it
                            // the same way the other untrusted-input paths
                            // are capped, and degrade to a typed error
                            // instead of hanging or exhausting memory.
                            match rows.checked_mul(cols) {
                                Some(size) if size <= MAX_RANGE_CELLS => {
                                    let mut vals = Vec::with_capacity(size as usize);
                                    for r in r1.min(r2)..=r1.max(r2) {
                                        for c in c1.min(c2)..=c1.max(c2) {
                                            vals.push(resolver.resolve(&cell_ref_name(r, c)));
                                        }
                                    }
                                    args.push(vals);
                                }
                                _ => args.push(vec![FormulaValue::Error(FormulaError {
                                    code: "#VALUE!",
                                })]),
                            }
                        }
                        _ => args.push(vec![FormulaValue::Error(FormulaError { code: "#VALUE!" })]),
                    }
                } else {
                    args.push(vec![evaluate(arg, resolver)]);
                }
            }
            call_builtin(name, &args)
        }
    }
}

/// Resolves cell references against a Sheet, detecting circular formula
/// references via a per-evaluation-chain "visiting" set — mirrors
/// makeSheetResolver (TS) / SheetResolver (PHP/Go) exactly.
pub struct SheetResolver<'a> {
    sheet: &'a Sheet,
    visiting: HashSet<String>,
}

impl<'a> SheetResolver<'a> {
    pub fn new(sheet: &'a Sheet) -> Self {
        SheetResolver {
            sheet,
            visiting: HashSet::new(),
        }
    }

    fn with_visiting(sheet: &'a Sheet, visiting: HashSet<String>) -> Self {
        SheetResolver { sheet, visiting }
    }
}

impl<'a> CellResolver for SheetResolver<'a> {
    fn resolve(&self, r#ref: &str) -> FormulaValue {
        if self.visiting.contains(r#ref) {
            return FormulaValue::Error(FormulaError { code: "#CIRC!" });
        }
        let (row, col) = match parse_cell_ref(r#ref) {
            Ok(pos) => pos,
            Err(_) => return FormulaValue::Error(FormulaError { code: "#REF!" }),
        };
        let cell: Cell = self.sheet.get_cell(row, col);
        if cell.cell_type == CellType::Formula {
            if let Some(formula) = &cell.formula {
                let mut next_visiting = self.visiting.clone();
                next_visiting.insert(r#ref.to_string());
                return match parse_formula(formula) {
                    Ok(ast) => evaluate(
                        &ast,
                        &SheetResolver::with_visiting(self.sheet, next_visiting),
                    ),
                    Err(_) => FormulaValue::Error(FormulaError { code: "#ERROR!" }),
                };
            }
        }
        match cell.value {
            CellValue::Null => FormulaValue::Number(0.0),
            CellValue::Number(n) => FormulaValue::Number(n),
            CellValue::Bool(b) => FormulaValue::Bool(b),
            CellValue::Str(s) => FormulaValue::Str(s),
        }
    }
}
