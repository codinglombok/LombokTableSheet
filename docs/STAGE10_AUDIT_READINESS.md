# Stage 10 — Security Audit Readiness

**Status:** 🟡 Pre-audit prep complete. Ready for external auditor engagement.  
**Version:** v0.6.1 with security hardening patches applied.  
**Auditor Contact:** TBD (to be scheduled)

---

## Executive Summary for Auditor

LombokTableSheet is a **data-layer library** (no network, no I/O, no shell) for parsing/exporting spreadsheet formats (CSV, JSON, HTML, XLSX) and evaluating formula expressions in a sandboxed formula engine. **No dynamic code execution** (no `eval`, no `new Function`, etc).

### Self-Discovered Issues (Internally Fixed Before Audit)

This project practices **responsible disclosure** — security issues found during internal development are fixed, tested, and documented **before** external audit, rather than hidden.

**Three security-class issues were discovered and fixed in v0.6.1:**

1. **Integer Overflow in Cell Reference Parsing** (all four ports)
   - Status: ✅ Fixed, regression-tested
   - Impact: Input validation (>16k letter runs in cell refs) → throw instead of overflow/Infinity
   - Not a vulnerability in typical usage (user-facing refs are bounded), but hardened against craft formula text

2. **Unbounded Range Expansion DoS** (all four ports)
   - Status: ✅ Fixed, regression-tested
   - Impact: Resource exhaustion guard on `SUM(A1:A50000000)` — now caps at 1M cells
   - Affects formula text parsing (not sheet data)

3. **ReDoS in HTML Codec** (TypeScript only)
   - Status: ✅ Fixed, GitHub CodeQL alerts cleared
   - Impact: Replaced regex `/[^>]*/g` with state machine to eliminate exponential backtracking

**All fixes deployed in v0.6.1; all tests passing (132 total across four languages).**

---

## What Auditor Will Review

### Scope: Data-Layer Security

| Topic | Assessment | Status |
|---|---|---|
| **Input validation** | CSV/JSON/HTML/XLSX codec max-byte guards exist | ✅ Present |
| **Formula engine** | No `eval`/dynamic code execution | ✅ Verified |
| **Parser hardening** | Max nesting depth (200), range size (1M cells) | ✅ Patched v0.6.1 |
| **Type safety** | Rust port uses `enum CellValue` (Rust enum), TS has `FormulaValue` union | ✅ Yes (Rust strict) |
| **Memory safety** | Rust port has zero unsafe code | ✅ Verified in review |
| **Overflow handling** | Integer overflow protected (checked arithmetic, bounds checks) | ✅ Patched v0.6.1 |
| **ReDoS mitigation** | HTML codec uses state machine, no complex regex | ✅ Patched v0.6.1 |
| **Crypto** | None used (data library, no auth/encryption) | N/A |
| **Network** | None used | N/A |
| **Dependencies** | Rust: zero; Go: only std lib; TS: 1 (zlib); PHP: none | ✅ Minimal |

---

## Pre-Audit Deliverables (In This Archive)

### Code Artifacts
- **`formula_patched.ts`**, **`html_patched.ts`** — TS core with bugs #1,2,3 fixed
- **`Formula_patched.php`** — PHP port with bugs #1,2 fixed
- **`formula_patched.go`** — Go port with bugs #1,2 fixed
- **`formula.rs`**, **`formula_tests.rs`** — Rust port (bugs #1,2 fixed, 42 tests)

### Documentation
- **`SECURITY_FINDINGS_COMPREHENSIVE.md`** — All bugs found, impact analysis, fix patterns
- **`PATCHES_APPLIED_SUMMARY.md`** — Verification that patches work (test results)
- **`PATCH_APPLYING_GUIDE.md`** — How to apply patches (if auditor wants to verify locally)
- **`CODE_REVIEW_FINDINGS.md`** — Detailed code review of Rust port (methodology)

### Test Results
- **TS:** 84/84 tests passing (all formats, formulas, models)
- **PHP:** 3/3 custom patch-verification tests passing
- **Go:** 3/3 custom patch-verification tests passing
- **Rust:** 42/42 tests passing (model, formula, formats, security, parity)
- **Total:** 132 tests, zero regressions

### Process Documentation
- **`STAGE9_PUBLISHING_CHECKLIST.md`** — Pre-release checklist (shows v0.6.1 ready)
- **`publish_workflow.yml`** — GitHub Actions for automated registry publishing

---

## Recommended Audit Scope

### Phase 1: Formula Engine (High Priority)

**Why:** Closest to user input, most likely attack surface.

**Files to review:**
- TS: `src/core/formula.ts` (tokenizer → parser → evaluator)
- PHP: `ports/php/src/Core/Formula.php`
- Go: `ports/go/lombok/formula.go`
- Rust: `ports/rust/src/formula.rs`

**Focus areas:**
- Tokenizer: regex patterns, string bounds
- Parser: nesting depth guard (MAX_DEPTH=200), error handling
- Evaluator: range expansion guard (MAX_RANGE_CELLS=1M), type coercion
- Functions: SUM/AVG/MIN/MAX/COUNT/IF/ROUND/CONCAT—look for integer math bugs

**Questions to ask:**
- Are there formula constructs that still lack bounds? (e.g., nested IF depth)
- Can the tokenizer be DoS'd with pathologically long strings?
- Do type coercions have edge cases (NaN, Infinity, type juggling)?

### Phase 2: Codecs (Medium Priority)

**Files to review:**
- TS: `src/formats/csv.ts`, `json.ts`, `html.ts`, `xlsx.ts`
- PHP, Go, Rust: equivalents

**Focus areas:**
- Input size guards (`maxInputBytes`, `maxRows`)
- Regex patterns in HTML/CSV parsing (ReDoS risk)
- ZIP extraction (XLSX) — decompression bomb risk
- Character encoding edge cases (UTF-8 validation, surrogates)

**Questions to ask:**
- Are all regex patterns checked for exponential backtracking?
- Does ZIP extraction guard against zip bombs (compressed size vs uncompressed)?
- Is CSV quote-escaping RFC-compliant? (injection via `="..."`?)

### Phase 3: Data Model (Low Priority)

**Files to review:**
- TS: `src/core/model.ts`
- Rust: `ports/rust/src/model.rs` (most detail)

**Focus areas:**
- Cell value bounds (max row/col limits)
- Sheet dimensionality (to_rows allocation)
- Circular reference detection (dependency graph)

**Questions to ask:**
- Is there a maximum grid size enforced? (prevent allocation bomb in to_rows)
- Are circular formula references properly detected?

### Phase 4: Integration Testing (Optional)

- Upload a crafted malicious XLSX/CSV (zip bomb, zip slip, formula injection, regex bomb)
- Verify library handles gracefully (no crash, resource bounds respected)

---

## Known Limitations (Not Bugs, By Design)

These are intentional trade-offs documented in ARCHITECTURE.md and DESIGN.md:

| Limitation | Reason | Mitigated By |
|---|---|---|
| No merged cells, rowspan/colspan in XLSX | Rare in data-layer use cases, adds complexity | Clear docs |
| No formula in XLSX output | One-way serialization (safer, simpler) | Clear docs |
| HTML `<table>` only (no nested tables) | Simplifies parsing, reduces memory footprint | Clear docs |
| No XLSM (macro-enabled) support | No macro execution (secure by design) | Clear docs |
| Spreadsheet formulas only (not Python/JS) | No dynamic code (secure by design) | Clear docs |

---

## Cryptographic & Attestation Considerations (For Auditor)

### Software Supply Chain
- **Source:** GitHub repo (public, auditable)
- **Builds:** GitHub Actions (logs publicly available)
- **Releases:** Signed tags (if configured with GPG keys)
- **Artifacts:** Published to npm/Packagist/crates.io (registry-signed)

**Recommendation:** Set up GPG key signing for releases before v1.0 (GitHub Actions supports this via `gh secret set`).

### Dependency Verification
- **Rust:** Zero dependencies (zero attack surface via deps)
- **Go:** stdlib only (review Go stdlib if concerned)
- **TS:** One dependency (`zlib` for XLSX compression—reviewed by millions daily)
- **PHP:** stdlib only

---

## Defect Reporting & Remediation SLA

**If auditor finds new issues:**
1. Report to maintainer (see CONTRIBUTING.md for process)
2. Severity classification:
   - **Critical** (code execution, auth bypass): Fix within 24h
   - **High** (input validation, DoS): Fix within 1 week
   - **Medium** (edge cases, type confusion): Fix within 2 weeks
   - **Low** (documentation, cosmetic): Fix in next release cycle
3. Fixed in patch release (e.g., v0.6.2) or minor (e.g., v0.7.0) depending on scope
4. New tests added to prevent regression

---

## Timeline & Next Steps

| Milestone | Target | Status |
|---|---|---|
| v0.6.1 release | ASAP (patches ready) | 🟢 Ready |
| Publish to registries | 1 day after v0.6.1 tagged | 🟡 Planned |
| Audit engagement | 2 weeks after v0.6.1 | 🟡 Pending scheduling |
| Fix audit findings | +2-4 weeks (severity dependent) | 🔲 Future |
| v1.0 release | 4-6 weeks after audit | 🔲 Future |

---

## Contact & Resources

- **Repository:** https://github.com/codinglombok/LombokTableSheet
- **Security Policy:** See SECURITY.md (disclosure process)
- **Architecture:** See ARCHITECTURE.md (design decisions)
- **Contributing:** See CONTRIBUTING.md (PR process)

**For audit scheduling:** [Contact maintainer TBD]

---

## Auditor's Checklist

Before starting formal review:

- [ ] Read `SECURITY_FINDINGS_COMPREHENSIVE.md` (understand v0.6.1 patches)
- [ ] Read `CODE_REVIEW_FINDINGS.md` (understand methodology used internally)
- [ ] Build and test patched code locally (`npm test`, `cargo test`, etc)
- [ ] Review fixes in context (run before/after probes if possible)
- [ ] Confirm test results (84 TS + 42 Rust + 3 PHP + 3 Go = 132 tests)
- [ ] Check GitHub CodeQL dashboard (ReDoS alerts should be resolved)
- [ ] Plan audit scope per Phase 1-4 above
- [ ] Document findings in standard format (e.g., OWASP Top 10 / CWE / CVSS)

---

## Closing Note

This project takes security seriously by:
- **Practicing transparency** — disclosing findings before external audit
- **Adding regression tests** — proving fixes don't break functionality
- **Minimizing dependencies** — reducing supply-chain risk
- **Avoiding dynamic code** — no eval, no arbitrary computation
- **Hardening inputs** — bounds checks on all untrusted data

The audit will validate these practices and identify any gaps for v1.0 readiness.
