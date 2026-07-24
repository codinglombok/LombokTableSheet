# Applying Security Patches

Tiga bug ditemukan dan diverifikasi di semua port bahasa (TS/PHP/Go/Rust). Ini adalah guide aplikasi patch.

## Bug #1: Integer Overflow di `parseCellRef` 

### Files to patch
- `src/core/formula.ts` (TS core)
- `ports/php/src/Core/Formula.php` (PHP)
- `ports/go/lombok/formula.go` (Go)
- `ports/rust/src/formula.rs` (Rust) — **SUDAH DONE**, lihat `formula.rs` di outputs

### Patch approach
Di setiap bahasa, tambahkan **check di `parseCellRef`** setelah accumulate `col`:

```
if (col becomes infinite/too large) {
  throw/return Error("... column overflow")
}
```

Batas aman: 16384 (praktis max Excel ~16k columns).

---

## Bug #2: Unbounded Range Expansion

### Files to patch
- `src/core/formula.ts` (TS) — dalam `evaluate()`, cabang `Node::Call`
- `ports/php/src/Core/Formula.php` (PHP) — dalam `evalNode()`, cabang `RangeNode`
- `ports/go/lombok/formula.go` (Go) — dalam `evalNode()`, cabang `nkCall` + `nkRange`
- `ports/rust/src/formula.rs` (Rust) — **SUDAH DONE**

### Patch approach
Sebelum loop expand range:

```
Define MAX_RANGE_CELLS = 1_000_000
Calculate rangeSize = (r2-r1+1) * (c2-c1+1)
if rangeSize > MAX_RANGE_CELLS:
  return [FormulaError("#VALUE!")] instead of expanding
else:
  proceed with loop
```

---

## Bug #3: ReDoS di HTML Codec

### File to patch
- `src/formats/html.ts` (TS core only) — PHP/Go/Rust tidak ada HTML codec

### GitHub CodeQL alerts
- Alert #17: `/<[^>]*>/g` 
- Alert #7: `/<[A-Za-z0-9]/`
- Alert #6, #4: Nested regex patterns

### Patch approach
**Replace regex with state machine:**

```javascript
// Instead of: html.replace(/<[^>]*>/g, '')
// Use: 
function stripHtmlTags(html: string): string {
  let result = '';
  let inTag = false;
  for (const ch of html) {
    if (ch === '<') inTag = true;
    else if (ch === '>') inTag = false;
    else if (!inTag) result += ch;
  }
  return result;
}
```

Apply this to all regex patterns flagged by CodeQL.

---

## Testing After Patches

Each patch must be verified with **regression tests**:

### Rust (done)
```bash
cd ports/rust
cargo test  # 42 tests, all passing
```

### TS
```bash
npm test  # Should not regress
# Add tests:
# - parseCellRef("AAAA...AAA(400 times)1") should throw
# - evaluate(parseFormula("=SUM(A1:A999999999)")) should return quickly
```

### PHP
```bash
cd ports/php
phpunit tests/FormulaTest.php
# Add tests for overflow and range guard
```

### Go
```bash
cd ports/go
go test ./...
# Add tests for overflow and range guard
```

---

## Diff files in this output directory

- `PATCH_BUG1_OVERFLOW_TS.diff` — Bug #1 for TS (ready to apply)
- `PATCH_BUG2_RANGE_GUARD_TS.diff` — Bug #2 for TS (ready to apply)
- `formula.rs`, `formula_tests.rs` — Rust port fully patched (replace existing files)

For PHP and Go, apply the same logic patterns but adjust for language syntax.

---

## Review checklist before merge

- [ ] All 3 bug classes documented in SECURITY.md as discovered/fixed in v0.6.1
- [ ] Regression tests added for each bug
- [ ] No existing tests broken
- [ ] ReDoS alerts in CodeQL cleared (TS core)
- [ ] Bumped patch version: v0.6.0 → v0.6.1 in all package manifests

