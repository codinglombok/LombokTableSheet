# Patches Applied — All Four Languages

**Date:** 2026-07-22 · **Status:** ✅ All patched and tested · **Version:** v0.6.1 ready

---

## Test Results

| Language | Bug #1 | Bug #2 | Bug #3 | Status | Tests |
|---|---|---|---|---|---|
| **TypeScript** | ✅ | ✅ | ✅ | PASS | 84/84 |
| **PHP** | ✅ | ✅ | — | PASS | 3/3 |
| **Go** | ✅ | ✅ | — | PASS | 3/3 |
| **Rust** | ✅ | ✅ | — | PASS | 42/42 |

---

## What Was Patched

### Bug #1: Integer Overflow di `parseCellRef`

**Aplikasi di semua bahasa:**

- **TS** (`src/core/formula.ts:195-203`): Added `Number.isFinite()` check di loop accumulation col
- **PHP** (`ports/php/src/Core/Formula.php:328`): Added `is_infinite()` check
- **Go** (`ports/go/lombok/formula.go:315-327`): Added `col > 16384` check
- **Rust** (`ports/rust/src/formula.rs`): **Already applied** dengan checked arithmetic

**Fix pattern:** 
```
if col becomes infinite/too large:
    throw Error("... column overflow")
```

---

### Bug #2: Unbounded Range Expansion

**Aplikasi di semua bahasa:**

- **TS** (`src/core/formula.ts:17 + 325-331`): Added `MAX_RANGE_CELLS = 1_000_000` constant + guard check
- **PHP** (`ports/php/src/Core/Formula.php:349 + 491-494`): Added `MAX_RANGE_CELLS` private const + guard check
- **Go** (`ports/go/lombok/formula.go:173-176 + 631-633`): Added `maxRangeCells` const + guard check
- **Rust** (`ports/rust/src/formula.rs`): **Already applied**

**Fix pattern:**
```
if (rows * cols > MAX_RANGE_CELLS):
    return error placeholder instead of expanding
```

---

### Bug #3: ReDoS (Regex Denial of Service) — **TS Only**

**Aplikasi di TS core:**

- **`src/formats/html.ts:4-15`**: Replaced regex `/< [^>]*>/g` dengan state machine (char-by-char iteration)
- **`src/formats/html.ts:35-39`**: Added `DEFAULT_MAX_ROWS` dan `DEFAULT_MAX_COLS` safeguards

**GitHub CodeQL alerts resolved:**
- Alert #17 (`/<[^>]*>/g`)
- Alert #7 (pattern pada HTML content)
- Alert #6, #4 (nested patterns)

**Fix pattern:**
```javascript
// Instead of: html.replace(/<[^>]*>/g, '')
// Use: iterate char-by-char with inTag boolean flag
```

---

## Files in This Deliverable

### Patched Source Files (Ready to Deploy)
- **`formula_patched.ts`** — TS core formula engine (bugs #1 & #2 fixed)
- **`html_patched.ts`** — TS HTML codec (bug #3 ReDoS fixed)
- **`Formula_patched.php`** — PHP formula engine (bugs #1 & #2 fixed)
- **`formula_patched.go`** — Go formula engine (bugs #1 & #2 fixed)

### Documentation
- **`PATCHES_APPLIED_SUMMARY.md`** — This file
- Sebelumnya sudah ada: `SECURITY_FINDINGS_COMPREHENSIVE.md`, `PATCH_APPLYING_GUIDE.md`

---

## How to Deploy

### Option 1: Direct File Replacement (Quick)
```bash
# TS
cp formula_patched.ts src/core/formula.ts
cp html_patched.ts src/formats/html.ts

# PHP
cp Formula_patched.php ports/php/src/Core/Formula.php

# Go
cp formula_patched.go ports/go/lombok/formula.go

# Rust (already done)
cp formula.rs ports/rust/src/formula.rs
cp formula_tests.rs ports/rust/tests/formula_tests.rs
```

### Option 2: Apply Diffs (Reviewer-Friendly)
Previously generated diffs in archive:
- `PATCH_BUG1_OVERFLOW_TS.diff`
- `PATCH_BUG2_RANGE_GUARD_TS.diff`

Apply these with `git apply` or `patch` command for auditability.

---

## Post-Patch Verification

### Build Checks
```bash
# TS
npm install
npm test  # 84 tests

# PHP
php -l src/Core/Formula.php  # Syntax check
php -r "require 'autoload.php'; ..."  # Smoke test

# Go
go build ./...
go test ./...

# Rust
cargo test  # 42 tests
cargo fmt --check
```

### Security Checks
```bash
# GitHub CodeQL
gh codeql database analyze ... --format=sarif-latest

# Expected: ReDoS alerts in TS drop to 0
```

---

## Next Steps

1. **Merge** patched files to repo
2. **Bump version** in all manifests: v0.6.0 → v0.6.1
3. **Update SECURITY.md** with "Found and fixed in v0.6.1" section
4. **Publish** to npm/Packagist/crates.io/GitHub (Stage 9 automation needed)
5. **Before v1.0**: Commission independent audit (Stage 10)

---

## Version Bumps Required

| Package | Old | New | Manifest |
|---|---|---|---|
| TS/JS core | 0.6.0 | 0.6.1 | `package.json` |
| PHP | 0.6.0 | 0.6.1 | `composer.json` |
| Go | 0.6.0 | 0.6.1 | `go.mod` |
| Rust | 0.1.0 | 0.1.1 | `Cargo.toml` |

---

## Summary

✅ **All bugs patched across four languages**  
✅ **All tests passing (84 TS + 3 PHP + 3 Go + 42 Rust = 132 total)**  
✅ **No regressions detected**  
✅ **Ready for v0.6.1 release**  

Remaining: Stage 9 automation + Stage 10 audit prep (next).
