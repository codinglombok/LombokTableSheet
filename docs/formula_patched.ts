/**
 * Formula engine: tokenizer -> Pratt parser -> AST -> evaluator.
 * Deliberately no `eval` / `new Function` — see ARCHITECTURE.md §3.3 and §6.
 * Supports: numbers, cell refs (A1), ranges (A1:B3), + - * / ^, parens,
 * comparisons (= <> < <= > >=), and a small function table (SUM, AVG, MIN,
 * MAX, COUNT, IF, ROUND, CONCAT).
 */

import { Sheet, CellValue } from './model.js';

export type FormulaValue = number | string | boolean | FormulaError;

export class FormulaError {
  constructor(public code: '#REF!' | '#DIV/0!' | '#CIRC!' | '#NAME?' | '#VALUE!' | '#ERROR!') {}
  toString() { return this.code; }
}

const MAX_RANGE_CELLS = 1_000_000;

// ---------- Tokenizer ----------

type TokenType = 'NUMBER' | 'STRING' | 'REF' | 'RANGE' | 'IDENT' | 'OP' | 'LPAREN' | 'RPAREN' | 'COMMA' | 'EOF';
interface Token { type: TokenType; value: string }

const CELL_RE = /^[A-Z]+[0-9]+/;

function tokenize(input: string): Token[] {
  const src = input.trim().replace(/^=/, '');
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === undefined) break;
    if (/\s/.test(c)) { i++; continue; }
    if (c === '(') { tokens.push({ type: 'LPAREN', value: c }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'RPAREN', value: c }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'COMMA', value: c }); i++; continue; }
    if (c === '"') {
      let j = i + 1, str = '';
      while (j < src.length && src[j] !== '"') { str += src[j]; j++; }
      tokens.push({ type: 'STRING', value: str });
      i = j + 1; continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i, num = '';
      while (j < src.length && /[0-9.]/.test(src[j] ?? '')) { num += src[j]; j++; }
      tokens.push({ type: 'NUMBER', value: num });
      i = j; continue;
    }
    if (/[A-Za-z]/.test(c)) {
      let j = i, ident = '';
      while (j < src.length && /[A-Za-z0-9]/.test(src[j] ?? '')) { ident += src[j]; j++; }
      const rest = src.slice(j);
      if (CELL_RE.test(ident) && /^[A-Z]+$/.test(ident.replace(/[0-9]+$/, ''))) {
        if (rest.startsWith(':')) {
          let k = j + 1, ident2 = '';
          while (k < src.length && /[A-Za-z0-9]/.test(src[k] ?? '')) { ident2 += src[k]; k++; }
          if (CELL_RE.test(ident2)) {
            tokens.push({ type: 'RANGE', value: `${ident}:${ident2}` });
            i = k; continue;
          }
        }
        tokens.push({ type: 'REF', value: ident });
        i = j; continue;
      }
      tokens.push({ type: 'IDENT', value: ident.toUpperCase() });
      i = j; continue;
    }
    if ('+-*/^'.includes(c)) { tokens.push({ type: 'OP', value: c }); i++; continue; }
    if (c === '=' || c === '<' || c === '>') {
      let op = c; i++;
      if ((src[i] === '=' && c !== '=') || (c === '<' && src[i] === '>')) { op += src[i]; i++; }
      tokens.push({ type: 'OP', value: op }); continue;
    }
    throw new Error(`Unexpected character in formula: '${c}'`);
  }
  tokens.push({ type: 'EOF', value: '' });
  return tokens;
}

// ---------- AST ----------

export type Node =
  | { kind: 'num'; value: number }
  | { kind: 'str'; value: string }
  | { kind: 'ref'; value: string }
  | { kind: 'range'; from: string; to: string }
  | { kind: 'call'; name: string; args: Node[] }
  | { kind: 'binop'; op: string; left: Node; right: Node }
  | { kind: 'unary'; op: string; arg: Node };

const PRECEDENCE: Record<string, number> = {
  '=': 1, '<>': 1, '<': 1, '<=': 1, '>': 1, '>=': 1,
  '+': 2, '-': 2,
  '*': 3, '/': 3,
  '^': 4,
};

class Parser {
  private tokens: Token[];
  private pos = 0;
  private depth = 0;
  private static readonly MAX_DEPTH = 200;

  constructor(tokens: Token[]) { this.tokens = tokens; }

  private peek(): Token { return this.tokens[this.pos] ?? { type: 'EOF', value: '' }; }
  private next(): Token { const t = this.peek(); this.pos++; return t; }

  parse(): Node {
    const node = this.parseExpr(0);
    if (this.peek().type !== 'EOF') throw new Error(`Unexpected token: ${this.peek().value}`);
    return node;
  }

  private parseExpr(minPrec: number): Node {
    this.depth++;
    if (this.depth > Parser.MAX_DEPTH) {
      throw new Error(`Formula nesting exceeds the maximum supported depth (${Parser.MAX_DEPTH}) — refusing to parse further to avoid a stack overflow`);
    }
    try {
      let left = this.parseUnary();
      for (;;) {
        const tok = this.peek();
        if (tok.type !== 'OP') break;
        const prec = PRECEDENCE[tok.value];
        if (prec === undefined || prec < minPrec) break;
        this.next();
        const right = this.parseExpr(prec + 1);
        left = { kind: 'binop', op: tok.value, left, right };
      }
      return left;
    } finally {
      this.depth--;
    }
  }

  private parseUnary(): Node {
    const tok = this.peek();
    if (tok.type === 'OP' && (tok.value === '-' || tok.value === '+')) {
      this.depth++;
      if (this.depth > Parser.MAX_DEPTH) {
        throw new Error(`Formula nesting exceeds the maximum supported depth (${Parser.MAX_DEPTH}) — refusing to parse further to avoid a stack overflow`);
      }
      try {
        this.next();
        return { kind: 'unary', op: tok.value, arg: this.parseUnary() };
      } finally {
        this.depth--;
      }
    }
    return this.parsePrimary();
  }

  private parsePrimary(): Node {
    const tok = this.next();
    switch (tok.type) {
      case 'NUMBER': return { kind: 'num', value: Number(tok.value) };
      case 'STRING': return { kind: 'str', value: tok.value };
      case 'REF': return { kind: 'ref', value: tok.value };
      case 'RANGE': {
        const [from, to] = tok.value.split(':');
        return { kind: 'range', from: from ?? '', to: to ?? '' };
      }
      case 'IDENT': {
        if (this.peek().type === 'LPAREN') {
          this.next();
          const args: Node[] = [];
          if (this.peek().type !== 'RPAREN') {
            args.push(this.parseExpr(0));
            while (this.peek().type === 'COMMA') { this.next(); args.push(this.parseExpr(0)); }
          }
          if (this.peek().type !== 'RPAREN') throw new Error('Expected )');
          this.next();
          return { kind: 'call', name: tok.value, args };
        }
        throw new Error(`Unknown identifier: ${tok.value}`);
      }
      case 'LPAREN': {
        const inner = this.parseExpr(0);
        if (this.peek().type !== 'RPAREN') throw new Error('Expected )');
        this.next();
        return inner;
      }
      default:
        throw new Error(`Unexpected token: ${tok.value || 'EOF'}`);
    }
  }
}

export function parseFormula(formula: string): Node {
  return new Parser(tokenize(formula)).parse();
}

// ---------- Cell ref helpers ----------

export function parseCellRef(ref: string): { row: number; col: number } {
  const m = /^([A-Z]+)([0-9]+)$/.exec(ref);
  if (!m) throw new Error(`Invalid cell reference: ${ref}`);
  const letters = m[1] ?? '';
  const digits = m[2] ?? '0';
  let col = 0;
  for (const ch of letters) {
    col = col * 26 + (ch.charCodeAt(0) - 64);
    if (!Number.isFinite(col) || col > 16384) {
      throw new Error(`Invalid cell reference: ${ref} (column overflow)`);
    }
  }
  return { row: Number(digits) - 1, col: col - 1 };
}

export function cellRefName(row: number, col: number): string {
  let c = col + 1, letters = '';
  while (c > 0) {
    const rem = (c - 1) % 26;
    letters = String.fromCharCode(65 + rem) + letters;
    c = Math.floor((c - 1) / 26);
  }
  return `${letters}${row + 1}`;
}

/** Cells a formula depends on — used to build the recalculation dependency graph. */
export function extractDependencies(node: Node): string[] {
  const refs = new Set<string>();
  const walk = (n: Node) => {
    if (n.kind === 'ref') refs.add(n.value);
    else if (n.kind === 'range') {
      const { row: r1, col: c1 } = parseCellRef(n.from);
      const { row: r2, col: c2 } = parseCellRef(n.to);
      for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
        for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) refs.add(cellRefName(r, c));
      }
    } else if (n.kind === 'call') n.args.forEach(walk);
    else if (n.kind === 'binop') { walk(n.left); walk(n.right); }
    else if (n.kind === 'unary') walk(n.arg);
  };
  walk(node);
  return [...refs];
}

// ---------- Evaluator ----------

type FnImpl = (args: FormulaValue[][]) => FormulaValue;

const FUNCTIONS: Record<string, FnImpl> = {
  SUM: (args) => flattenNums(args).reduce((a, b) => a + b, 0),
  AVG: (args) => { const nums = flattenNums(args); return nums.length ? nums.reduce((a, b) => a + b, 0) / nums.length : 0; },
  MIN: (args) => Math.min(...flattenNums(args)),
  MAX: (args) => Math.max(...flattenNums(args)),
  COUNT: (args) => flattenNums(args).length,
  ROUND: (args) => {
    const nums = flattenNums(args);
    const val = nums[0] ?? 0;
    const digits = nums[1] ?? 0;
    const factor = Math.pow(10, digits);
    return Math.round(val * factor) / factor;
  },
  IF: (args) => {
    const cond = args[0]?.[0];
    return cond ? args[1]?.[0] ?? '' : args[2]?.[0] ?? '';
  },
  CONCAT: (args) => args.flat().map(v => String(v)).join(''),
};

function flattenNums(args: FormulaValue[][]): number[] {
  return args.flat().filter((v): v is number => typeof v === 'number');
}

export interface CellResolver {
  resolve(ref: string): FormulaValue;
}

export function evaluate(node: Node, resolver: CellResolver): FormulaValue {
  try {
    return evalNode(node, resolver);
  } catch (err) {
    if (err instanceof FormulaError) return err;
    return new FormulaError('#ERROR!');
  }
}

function evalNode(node: Node, resolver: CellResolver): FormulaValue {
  switch (node.kind) {
    case 'num': return node.value;
    case 'str': return node.value;
    case 'ref': return resolver.resolve(node.value);
    case 'range': throw new FormulaError('#VALUE!'); // ranges only valid as function args
    case 'unary': {
      const v = evalNode(node.arg, resolver);
      if (typeof v !== 'number') return new FormulaError('#VALUE!');
      return node.op === '-' ? -v : v;
    }
    case 'binop': {
      if (node.op === '=' || node.op === '<>' || ['<', '<=', '>', '>='].includes(node.op)) {
        const l = evalNode(node.left, resolver);
        const r = evalNode(node.right, resolver);
        switch (node.op) {
          case '=': return l === r;
          case '<>': return l !== r;
          case '<': return (l as number) < (r as number);
          case '<=': return (l as number) <= (r as number);
          case '>': return (l as number) > (r as number);
          case '>=': return (l as number) >= (r as number);
        }
      }
      const l = evalNode(node.left, resolver);
      const r = evalNode(node.right, resolver);
      if (typeof l !== 'number' || typeof r !== 'number') return new FormulaError('#VALUE!');
      switch (node.op) {
        case '+': return l + r;
        case '-': return l - r;
        case '*': return l * r;
        case '/': return r === 0 ? new FormulaError('#DIV/0!') : l / r;
        case '^': return Math.pow(l, r);
        default: return new FormulaError('#ERROR!');
      }
    }
    case 'call': {
      const fn = FUNCTIONS[node.name];
      if (!fn) return new FormulaError('#NAME?');
      const args: FormulaValue[][] = node.args.map(arg => {
        if (arg.kind === 'range') {
          const { row: r1, col: c1 } = parseCellRef(arg.from);
          const { row: r2, col: c2 } = parseCellRef(arg.to);
          const rangeRows = Math.abs(r2 - r1) + 1;
          const rangeCols = Math.abs(c2 - c1) + 1;
          if (rangeRows * rangeCols > MAX_RANGE_CELLS) {
            return [new FormulaError('#VALUE!')];
          }
          const values: FormulaValue[] = [];
          for (let r = Math.min(r1, r2); r <= Math.max(r1, r2); r++) {
            for (let c = Math.min(c1, c2); c <= Math.max(c1, c2); c++) {
              values.push(resolver.resolve(cellRefName(r, c)));
            }
          }
          return values;
        }
        return [evalNode(arg, resolver)];
      });
      return fn(args);
    }
  }
}

/** Build a resolver bound to a specific sheet, with a visiting-set for cycle detection. */
export function makeSheetResolver(sheet: Sheet, visiting: Set<string> = new Set()): CellResolver {
  return {
    resolve(ref: string): FormulaValue {
      if (visiting.has(ref)) return new FormulaError('#CIRC!');
      const { row, col } = parseCellRef(ref);
      const cell = sheet.getCell(row, col);
      if (cell.type === 'formula' && cell.formula) {
        const nextVisiting = new Set(visiting);
        nextVisiting.add(ref);
        const ast = parseFormula(cell.formula);
        return evaluate(ast, makeSheetResolver(sheet, nextVisiting));
      }
      const v: CellValue = cell.value;
      if (v === null) return 0;
      return v as FormulaValue;
    },
  };
}
