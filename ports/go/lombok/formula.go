package lombok

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
)

// FormulaError mirrors the TS/PHP FormulaError — a typed error VALUE, not a
// panic/exception, matching how spreadsheet software surfaces these to users.
type FormulaError struct {
	Code string // "#REF!" | "#DIV/0!" | "#CIRC!" | "#NAME?" | "#VALUE!" | "#ERROR!"
}

func (e FormulaError) Error() string { return e.Code }

// FormulaValue is what evaluation produces: float64 | string | bool | FormulaError.
type FormulaValue interface{}

// --- Tokenizer ---

type tokenType string

const (
	tNumber tokenType = "NUMBER"
	tString tokenType = "STRING"
	tRef    tokenType = "REF"
	tRange  tokenType = "RANGE"
	tIdent  tokenType = "IDENT"
	tOp     tokenType = "OP"
	tLParen tokenType = "LPAREN"
	tRParen tokenType = "RPAREN"
	tComma  tokenType = "COMMA"
	tEOF    tokenType = "EOF"
)

type token struct {
	typ tokenType
	val string
}

var cellRefRe = regexp.MustCompile(`^[A-Z]+[0-9]+$`)

func tokenize(input string) ([]token, error) {
	src := strings.TrimPrefix(strings.TrimSpace(input), "=")
	var tokens []token
	i := 0
	n := len(src)

	isAlpha := func(b byte) bool { return (b >= 'A' && b <= 'Z') || (b >= 'a' && b <= 'z') }
	isDigit := func(b byte) bool { return b >= '0' && b <= '9' }
	isAlnum := func(b byte) bool { return isAlpha(b) || isDigit(b) }

	for i < n {
		c := src[i]
		switch {
		case c == ' ' || c == '\t' || c == '\n' || c == '\r':
			i++
		case c == '(':
			tokens = append(tokens, token{tLParen, "("})
			i++
		case c == ')':
			tokens = append(tokens, token{tRParen, ")"})
			i++
		case c == ',':
			tokens = append(tokens, token{tComma, ","})
			i++
		case c == '"':
			j := i + 1
			var sb strings.Builder
			for j < n && src[j] != '"' {
				sb.WriteByte(src[j])
				j++
			}
			tokens = append(tokens, token{tString, sb.String()})
			i = j + 1
		case isDigit(c):
			j := i
			for j < n && (isDigit(src[j]) || src[j] == '.') {
				j++
			}
			tokens = append(tokens, token{tNumber, src[i:j]})
			i = j
		case isAlpha(c):
			j := i
			for j < n && isAlnum(src[j]) {
				j++
			}
			ident := src[i:j]
			if cellRefRe.MatchString(ident) {
				if j < n && src[j] == ':' {
					k := j + 1
					for k < n && isAlnum(src[k]) {
						k++
					}
					ident2 := src[j+1 : k]
					if cellRefRe.MatchString(ident2) {
						tokens = append(tokens, token{tRange, ident + ":" + ident2})
						i = k
						continue
					}
				}
				tokens = append(tokens, token{tRef, ident})
				i = j
				continue
			}
			tokens = append(tokens, token{tIdent, strings.ToUpper(ident)})
			i = j
		case strings.ContainsRune("+-*/^", rune(c)):
			tokens = append(tokens, token{tOp, string(c)})
			i++
		case c == '=' || c == '<' || c == '>':
			op := string(c)
			i++
			if i < n && ((src[i] == '=' && c != '=') || (c == '<' && src[i] == '>')) {
				op += string(src[i])
				i++
			}
			tokens = append(tokens, token{tOp, op})
		default:
			return nil, fmt.Errorf("unexpected character in formula: '%c'", c)
		}
	}
	tokens = append(tokens, token{tEOF, ""})
	return tokens, nil
}

// --- AST ---

type nodeKind int

const (
	nkNum nodeKind = iota
	nkStr
	nkRef
	nkRange
	nkCall
	nkBinOp
	nkUnary
)

// Node is the formula AST node type. Only the fields relevant to Kind are populated.
type Node struct {
	Kind     nodeKind
	NumVal   float64
	StrVal   string
	RefVal   string
	RangeLo  string
	RangeHi  string
	CallName string
	Args     []*Node
	Op       string
	Left     *Node
	Right    *Node
	Unary    *Node
}

var precedence = map[string]int{
	"=": 1, "<>": 1, "<": 1, "<=": 1, ">": 1, ">=": 1,
	"+": 2, "-": 2,
	"*": 3, "/": 3,
	"^": 4,
}

// maxParseDepth guards against a stack-overflow DoS from pathologically
// nested formulas — same hardening as the TS/PHP engines (see SECURITY.md).
const maxParseDepth = 200

type parser struct {
	tokens []token
	pos    int
	depth  int
}

func (p *parser) peek() token {
	if p.pos < len(p.tokens) {
		return p.tokens[p.pos]
	}
	return token{tEOF, ""}
}

func (p *parser) next() token {
	t := p.peek()
	p.pos++
	return t
}

// ParseFormula parses a formula string (with or without a leading '=') into an AST.
func ParseFormula(formula string) (*Node, error) {
	tokens, err := tokenize(formula)
	if err != nil {
		return nil, err
	}
	p := &parser{tokens: tokens}
	node, err := p.parseExpr(0)
	if err != nil {
		return nil, err
	}
	if p.peek().typ != tEOF {
		return nil, fmt.Errorf("unexpected token: %s", p.peek().val)
	}
	return node, nil
}

func (p *parser) parseExpr(minPrec int) (*Node, error) {
	p.depth++
	defer func() { p.depth-- }()
	if p.depth > maxParseDepth {
		return nil, fmt.Errorf("formula nesting exceeds the maximum supported depth (%d) — refusing to parse further to avoid a stack overflow", maxParseDepth)
	}
	left, err := p.parseUnary()
	if err != nil {
		return nil, err
	}
	for {
		tok := p.peek()
		if tok.typ != tOp {
			break
		}
		prec, ok := precedence[tok.val]
		if !ok || prec < minPrec {
			break
		}
		p.next()
		right, err := p.parseExpr(prec + 1)
		if err != nil {
			return nil, err
		}
		left = &Node{Kind: nkBinOp, Op: tok.val, Left: left, Right: right}
	}
	return left, nil
}

func (p *parser) parseUnary() (*Node, error) {
	tok := p.peek()
	if tok.typ == tOp && (tok.val == "-" || tok.val == "+") {
		p.depth++
		defer func() { p.depth-- }()
		if p.depth > maxParseDepth {
			return nil, fmt.Errorf("formula nesting exceeds the maximum supported depth (%d) — refusing to parse further to avoid a stack overflow", maxParseDepth)
		}
		p.next()
		arg, err := p.parseUnary()
		if err != nil {
			return nil, err
		}
		return &Node{Kind: nkUnary, Op: tok.val, Unary: arg}, nil
	}
	return p.parsePrimary()
}

func (p *parser) parsePrimary() (*Node, error) {
	tok := p.next()
	switch tok.typ {
	case tNumber:
		v, err := strconv.ParseFloat(tok.val, 64)
		if err != nil {
			return nil, fmt.Errorf("invalid number: %s", tok.val)
		}
		return &Node{Kind: nkNum, NumVal: v}, nil
	case tString:
		return &Node{Kind: nkStr, StrVal: tok.val}, nil
	case tRef:
		return &Node{Kind: nkRef, RefVal: tok.val}, nil
	case tRange:
		parts := strings.SplitN(tok.val, ":", 2)
		return &Node{Kind: nkRange, RangeLo: parts[0], RangeHi: parts[1]}, nil
	case tIdent:
		if p.peek().typ != tLParen {
			return nil, fmt.Errorf("unknown identifier: %s", tok.val)
		}
		p.next() // consume '('
		var args []*Node
		if p.peek().typ != tRParen {
			arg, err := p.parseExpr(0)
			if err != nil {
				return nil, err
			}
			args = append(args, arg)
			for p.peek().typ == tComma {
				p.next()
				arg, err := p.parseExpr(0)
				if err != nil {
					return nil, err
				}
				args = append(args, arg)
			}
		}
		if p.peek().typ != tRParen {
			return nil, fmt.Errorf("expected )")
		}
		p.next()
		return &Node{Kind: nkCall, CallName: tok.val, Args: args}, nil
	case tLParen:
		inner, err := p.parseExpr(0)
		if err != nil {
			return nil, err
		}
		if p.peek().typ != tRParen {
			return nil, fmt.Errorf("expected )")
		}
		p.next()
		return inner, nil
	default:
		return nil, fmt.Errorf("unexpected token: %s", tok.val)
	}
}

// --- Cell ref helpers ---

var cellRefParseRe = regexp.MustCompile(`^([A-Z]+)([0-9]+)$`)

// ParseCellRef converts "B3" -> CellRef{Row: 2, Col: 1} (zero-indexed).
func ParseCellRef(ref string) (CellRef, error) {
	m := cellRefParseRe.FindStringSubmatch(ref)
	if m == nil {
		return CellRef{}, fmt.Errorf("invalid cell reference: %s", ref)
	}
	col := 0
	for _, ch := range m[1] {
		col = col*26 + int(ch-'A'+1)
	}
	row, _ := strconv.Atoi(m[2])
	return CellRef{Row: row - 1, Col: col - 1}, nil
}

// CellRefName converts CellRef{Row:0, Col:0} -> "A1".
func CellRefName(row, col int) string {
	c := col + 1
	var letters []byte
	for c > 0 {
		rem := (c - 1) % 26
		letters = append([]byte{byte('A' + rem)}, letters...)
		c = (c - 1) / 26
	}
	return string(letters) + strconv.Itoa(row+1)
}

// ExtractDependencies returns every cell reference a formula's AST depends on,
// expanding ranges into individual refs.
func ExtractDependencies(n *Node) []string {
	seen := map[string]bool{}
	var walk func(*Node)
	walk = func(n *Node) {
		switch n.Kind {
		case nkRef:
			seen[n.RefVal] = true
		case nkRange:
			from, err1 := ParseCellRef(n.RangeLo)
			to, err2 := ParseCellRef(n.RangeHi)
			if err1 != nil || err2 != nil {
				return
			}
			r1, r2 := minInt(from.Row, to.Row), maxInt(from.Row, to.Row)
			c1, c2 := minInt(from.Col, to.Col), maxInt(from.Col, to.Col)
			for r := r1; r <= r2; r++ {
				for c := c1; c <= c2; c++ {
					seen[CellRefName(r, c)] = true
				}
			}
		case nkCall:
			for _, a := range n.Args {
				walk(a)
			}
		case nkBinOp:
			walk(n.Left)
			walk(n.Right)
		case nkUnary:
			walk(n.Unary)
		}
	}
	walk(n)
	out := make([]string, 0, len(seen))
	for k := range seen {
		out = append(out, k)
	}
	return out
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}
func maxInt(a, b int) int {
	if a > b {
		return a
	}
	return b
}

// --- Evaluator ---

// CellResolver resolves a cell reference to a FormulaValue during evaluation.
type CellResolver interface {
	Resolve(ref string) FormulaValue
}

func toFloat(v FormulaValue) (float64, bool) {
	f, ok := v.(float64)
	return f, ok
}

var builtinFunctions = map[string]func(args [][]FormulaValue) FormulaValue{
	"SUM": func(args [][]FormulaValue) FormulaValue {
		sum := 0.0
		for _, g := range args {
			for _, v := range g {
				if f, ok := toFloat(v); ok {
					sum += f
				}
			}
		}
		return sum
	},
	"AVG": func(args [][]FormulaValue) FormulaValue {
		sum, n := 0.0, 0
		for _, g := range args {
			for _, v := range g {
				if f, ok := toFloat(v); ok {
					sum += f
					n++
				}
			}
		}
		if n == 0 {
			return 0.0
		}
		return sum / float64(n)
	},
	"MIN": func(args [][]FormulaValue) FormulaValue {
		var m float64
		first := true
		for _, g := range args {
			for _, v := range g {
				if f, ok := toFloat(v); ok {
					if first || f < m {
						m, first = f, false
					}
				}
			}
		}
		return m
	},
	"MAX": func(args [][]FormulaValue) FormulaValue {
		var m float64
		first := true
		for _, g := range args {
			for _, v := range g {
				if f, ok := toFloat(v); ok {
					if first || f > m {
						m, first = f, false
					}
				}
			}
		}
		return m
	},
	"COUNT": func(args [][]FormulaValue) FormulaValue {
		n := 0
		for _, g := range args {
			for _, v := range g {
				if _, ok := toFloat(v); ok {
					n++
				}
			}
		}
		return float64(n)
	},
	"ROUND": func(args [][]FormulaValue) FormulaValue {
		val := 0.0
		digits := 0.0
		if len(args) > 0 && len(args[0]) > 0 {
			if f, ok := toFloat(args[0][0]); ok {
				val = f
			}
		}
		if len(args) > 1 && len(args[1]) > 0 {
			if f, ok := toFloat(args[1][0]); ok {
				digits = f
			}
		}
		factor := math.Pow(10, digits)
		return math.Round(val*factor) / factor
	},
	"IF": func(args [][]FormulaValue) FormulaValue {
		cond := false
		if len(args) > 0 && len(args[0]) > 0 {
			if b, ok := args[0][0].(bool); ok {
				cond = b
			} else if f, ok := toFloat(args[0][0]); ok {
				cond = f != 0
			}
		}
		if cond {
			if len(args) > 1 && len(args[1]) > 0 {
				return args[1][0]
			}
			return ""
		}
		if len(args) > 2 && len(args[2]) > 0 {
			return args[2][0]
		}
		return ""
	},
	"CONCAT": func(args [][]FormulaValue) FormulaValue {
		var sb strings.Builder
		for _, g := range args {
			for _, v := range g {
				sb.WriteString(formatValue(v))
			}
		}
		return sb.String()
	},
}

func formatValue(v FormulaValue) string {
	switch t := v.(type) {
	case float64:
		return strconv.FormatFloat(t, 'g', -1, 64)
	case bool:
		if t {
			return "true"
		}
		return "false"
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", t)
	}
}

// Evaluate walks the AST and produces a FormulaValue (float64 | string | bool | FormulaError).
// Never panics on malformed/hostile input — errors become FormulaError values,
// matching the "never throw on data, only on programmer error" contract.
func Evaluate(n *Node, resolver CellResolver) (result FormulaValue) {
	defer func() {
		if r := recover(); r != nil {
			result = FormulaError{Code: "#ERROR!"}
		}
	}()
	return evalNode(n, resolver)
}

func evalNode(n *Node, resolver CellResolver) FormulaValue {
	switch n.Kind {
	case nkNum:
		return n.NumVal
	case nkStr:
		return n.StrVal
	case nkRef:
		return resolver.Resolve(n.RefVal)
	case nkRange:
		return FormulaError{Code: "#VALUE!"}
	case nkUnary:
		v := evalNode(n.Unary, resolver)
		f, ok := toFloat(v)
		if !ok {
			return FormulaError{Code: "#VALUE!"}
		}
		if n.Op == "-" {
			return -f
		}
		return f
	case nkBinOp:
		if n.Op == "=" || n.Op == "<>" || n.Op == "<" || n.Op == "<=" || n.Op == ">" || n.Op == ">=" {
			l := evalNode(n.Left, resolver)
			r := evalNode(n.Right, resolver)
			lf, lok := toFloat(l)
			rf, rok := toFloat(r)
			switch n.Op {
			case "=":
				return l == r
			case "<>":
				return l != r
			case "<":
				return lok && rok && lf < rf
			case "<=":
				return lok && rok && lf <= rf
			case ">":
				return lok && rok && lf > rf
			case ">=":
				return lok && rok && lf >= rf
			}
		}
		l := evalNode(n.Left, resolver)
		r := evalNode(n.Right, resolver)
		lf, lok := toFloat(l)
		rf, rok := toFloat(r)
		if !lok || !rok {
			return FormulaError{Code: "#VALUE!"}
		}
		switch n.Op {
		case "+":
			return lf + rf
		case "-":
			return lf - rf
		case "*":
			return lf * rf
		case "/":
			if rf == 0 {
				return FormulaError{Code: "#DIV/0!"}
			}
			return lf / rf
		case "^":
			return math.Pow(lf, rf)
		default:
			return FormulaError{Code: "#ERROR!"}
		}
	case nkCall:
		fn, ok := builtinFunctions[n.CallName]
		if !ok {
			return FormulaError{Code: "#NAME?"}
		}
		args := make([][]FormulaValue, len(n.Args))
		for i, arg := range n.Args {
			if arg.Kind == nkRange {
				from, err1 := ParseCellRef(arg.RangeLo)
				to, err2 := ParseCellRef(arg.RangeHi)
				if err1 != nil || err2 != nil {
					args[i] = []FormulaValue{FormulaError{Code: "#VALUE!"}}
					continue
				}
				r1, r2 := minInt(from.Row, to.Row), maxInt(from.Row, to.Row)
				c1, c2 := minInt(from.Col, to.Col), maxInt(from.Col, to.Col)
				var vals []FormulaValue
				for r := r1; r <= r2; r++ {
					for c := c1; c <= c2; c++ {
						vals = append(vals, resolver.Resolve(CellRefName(r, c)))
					}
				}
				args[i] = vals
			} else {
				args[i] = []FormulaValue{evalNode(arg, resolver)}
			}
		}
		return fn(args)
	default:
		return FormulaError{Code: "#ERROR!"}
	}
}

// sheetResolver resolves cell references against a Sheet, detecting circular
// formula references via a per-evaluation-chain visiting set — mirrors
// makeSheetResolver in the TS core exactly.
type sheetResolver struct {
	sheet    *Sheet
	visiting map[string]bool
}

// SheetResolver builds a CellResolver bound to a specific sheet.
func SheetResolver(sheet *Sheet) CellResolver {
	return &sheetResolver{sheet: sheet, visiting: map[string]bool{}}
}

func (r *sheetResolver) Resolve(ref string) FormulaValue {
	if r.visiting[ref] {
		return FormulaError{Code: "#CIRC!"}
	}
	pos, err := ParseCellRef(ref)
	if err != nil {
		return FormulaError{Code: "#REF!"}
	}
	cell := r.sheet.GetCell(pos.Row, pos.Col)
	if cell.Type == CellFormula && cell.Formula != "" {
		nextVisiting := make(map[string]bool, len(r.visiting)+1)
		for k, v := range r.visiting {
			nextVisiting[k] = v
		}
		nextVisiting[ref] = true
		ast, err := ParseFormula(cell.Formula)
		if err != nil {
			return FormulaError{Code: "#ERROR!"}
		}
		return Evaluate(ast, &sheetResolver{sheet: r.sheet, visiting: nextVisiting})
	}
	if cell.Value == nil {
		return 0.0
	}
	return cell.Value
}
