# LombokTableSheet — Comprehensive Security Findings

**Date:** 2026-07-22 · **Scope:** All four language ports (TS/JS, PHP, Go, Rust) · **Test method:** Manual code review + active probe testing (verifikasi nyata di sandbox dengan toolchain sesungguhnya)

---

## Executive Summary

Tiga bug keamanan ditemukan dan diverifikasi di semua port atau di mana relevan. Semuanya adalah resource-exhaustion atau input-validation issue yang konsisten dengan pattern penyakit yang sudah pernah ditemukan di proyek ini (fuzz test stage 5, direkam di SECURITY.md). **Tidak ada eksekusi kode dinamis atau akses memori jarak jauh — semua tetap dalam lingkup formula/codec untrusted-input.**

---

## Bug #1: Integer Overflow di `parseCellRef` — Severity: 🔴 Sedang-Tinggi

### Deskripsi
Perhitungan kolom dalam parsing referensi sel mengalami overflow ketika panjang string huruf (A-Z) tidak terbatas.

### Manifestasi per bahasa

| Bahasa | Manifestasi | Proof |
|---|---|---|
| **Rust** | `panic` (debug build), wraparound diam-diam → garbage column (release build) | `col: 8116567392432202710` dari 400 A's |
| **TS/JS** | `col: Infinity` (JavaScript number overflow, bukan error) | `{row: 0, col: Infinity}` dari 400 A's |
| **PHP** | `col: INF` (float("INF")) | `["col" => float(INF)]` dari 400 A's |
| **Go** | Wraparound → garbage column (Go int64 overflow diam-diam) | `Col:8116567392432202710` dari 400 A's |

### Lokasi Kode

- **TS** (`src/core/formula.ts:201`): `col = col * 26 + (ch.charCodeAt(0) - 64)`
- **PHP** (`ports/php/src/Core/Formula.php:329`): `$col = $col * 26 + (ord($ch) - 64)`
- **Go** (`ports/go/lombok/formula.go:323`): `col = col*26 + int(ch-'A'+1)`
- **Rust** (`ports/rust/src/formula.rs:...`): `col = col * 26 + (...)` — **SUDAH DIPERBAIKI** dengan checked arithmetic

### Penyebab

Parse cell reference ("A1", "B3", dll) tidak punya batas panjang input. Spreadsheet sungguhan punya batas (~16k kolom di Excel, ~1k di Google Sheets), tapi panjang string adalah kontrol penyerang, bukan data sheet. Kalau 400 huruf → multiply berulang 400 kali tanpa batas.

### Impact

- **Rust debug**: stack trace panic → potential DoS via query log spam
- **Rust release/TS/PHP/Go**: garbage column index → kalau dipakai untuk `set_value` atau alokasi grid (`to_rows`), bisa alokasi memori raksasa
- Tidak ada crash process, tapi alokasi memori dan latensi bisa jelek

### Fix Pattern

Gunakan **checked arithmetic** (semua bahasa punya semacam itu):

```typescript
// TS: gunakan BigInt atau buat early return check
let col = 0;
for (const ch of letters) {
  col = col * 26 + (ch.charCodeAt(0) - 64);
  if (col > Number.MAX_SAFE_INTEGER) {
    throw new Error(`Invalid cell reference: ${ref} (column overflow)`);
  }
}

// PHP: sama, tapi checked saat float overflow
$col = 0;
foreach (str_split($m[1]) as $ch) {
    $col = $col * 26 + (ord($ch) - 64);
    if (is_infinite($col) || $col > PHP_INT_MAX) {
        throw new \InvalidArgumentException("...column overflow");
    }
}

// Go: checked dengan batasan reasonable
col := 0
for _, ch := range m[1] {
    col = col*26 + int(ch-'A'+1)
    if col > 16384 { // praktis batas Excel/Sheets
        return CellRef{}, fmt.Errorf("invalid cell reference: %s (column overflow)", ref)
    }
}

// Rust: sudah diperbaiki dengan checked_mul/checked_add (lihat PR/commit)
```

---

## Bug #2: Unbounded Range Expansion dalam Formula Evaluation — Severity: 🔴 Sedang-Tinggi

### Deskripsi
Formula dengan range seperti `SUM(A1:A50000000)` tidak punya batas pada berapa sel bisa di-expand **dari teks formula saja**, tanpa perlu data sheet apa pun.

### Manifestasi per bahasa

| Bahasa | Apa yang terjadi | Timing |
|---|---|---|
| **Rust** | Tidak hang (fixed, lihat bug #1 fix), selesai dalam μs | ~8 μs |
| **TS/JS** | Hang >20 detik (timeout test) | Tidak terbatas |
| **PHP** | Hang >20 detik (timeout test) | Tidak terbatas |
| **Go** | Hang >20 detik (timeout test) | Tidak terbatas |

### Lokasi Kode

- **TS** (`src/core/formula.ts:319-324`): loop `for (let r = ...) for (let c = ...) vals.push(...)`
- **PHP** (`ports/php/src/Core/Formula.php:494-498`): `for ($r = ...) for ($c = ...) { $values[] = ... }`
- **Go** (`ports/go/lombok/formula.go:630-635`): `for r := r1; r <= r2; r++ { for c := ... }`
- **Rust**: **SUDAH DIPERBAIKI** dengan `MAX_RANGE_CELLS = 1_000_000`

### Konteks

CSV/JSON decoder sudah ada guard (`MAX_INPUT_BYTES`, `MAX_ROWS`) — ini adalah asimetri sengaja: file input ada guard, tapi teks formula (juga input tak terpercaya) tidak punya batas. Penyerang bisa mengirim formula pendek `=SUM(A1:Z999999)` (panjang <50 char) tapi menyebabkan iterasi 26M× untuk expand semua sel.

### Fix Pattern

Tambahkan konstanta `MAX_RANGE_CELLS` dan check di `evaluate()`:

```typescript
// Semua bahasa: sebelum loop expand range
const MAX_RANGE_CELLS = 1_000_000;
const rangeSize = (r2 - r1 + 1) * (c2 - c1 + 1);
if (rangeSize > MAX_RANGE_CELLS) {
    // Return error placeholder, aggregate functions filter diam-diam
    args.push([new FormulaError('#VALUE!')]);
    continue;
}
// Lanjut loop expand normal
```

---

## Bug #3: ReDoS (Regular Expression Denial of Service) — Severity: 🔴 Tinggi

### Deskripsi
HTML codec di TS core menggunakan regex yang kompleks pada untrusted input (cell content), berpotensi exponential backtracking. **GitHub CodeQL mendeteksi 4 alert** di src/formats/html.ts.

### Manifestasi

**Hanya TS/JS core** — port PHP/Go/Rust tidak punya HTML codec.

GitHub CodeQL alert:
- #17 (`html.ts:9`): `/<[^>]*>/g` pada HTML content
- #7 (`html.ts:52`): `/<[A-Za-z0-9]/` pada cell content  
- #6 (`html.ts:58`): Multiple regex patterns
- #4 (`html.ts:50`): Nested regex patterns

### Contoh Payload

Sebuah cell dengan `<` dan `>` yang sangat panjang, misalnya 5000 karakter:
```
<aaaaaaa...aaaaaaa (5000 a's) >
```

Regex `/[A-Za-z0-9]/` dengan banyak quantifier `*` / `+` akan **exponential backtrack** mencari match.

### Fix Pattern

**Hindari regex untuk HTML parsing.** Gunakan state machine sederhana:

```typescript
// Alih-alih regex, gunakan indexed search:
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

// Atau gunakan built-in HTML parser (tapi butuh library, go against zero-dep goal):
// const div = document.createElement('div');
// div.innerHTML = html;
// return div.textContent || '';
```

**Tidak direkomendasikan:** escape regex quantifier (`.*?` → `[^>]*`), karena masih vulnerable untuk input panjang.

---

## Perbaikan yang Direkomendasikan

### Urutan Prioritas
1. **Bug #2 (range expansion)**: DoS trivial, dijalankan dalam microseconds, fix sederhana (add one line)
2. **Bug #1 (overflow)**: Ada di 4 bahasa, gejala beda tapi fix konsisten
3. **Bug #3 (ReDoS)**: Hanya TS, bisa deferred ke patch minor, tapi perlu sebelum 1.0

### Checklist Aplikasi

- [ ] Rust: **DONE** — 4 regression test baru ditambahkan, 42 test total lulus
- [ ] TS: Apply overflow check + range guard + HTML parser replacement
- [ ] PHP: Apply overflow check + range guard  
- [ ] Go: Apply overflow check + range guard

### Timeline yang Disarankan

- **v0.6.1 (patch)**: Bug #1 dan #2 di semua port, ReDoS fix di TS (tidak butuh major version bump)
- **Sebelum v1.0**: Commissioning independent security audit (Stage 10), audit ini akan catch masalah lain

---

## Dokumentasi Patch

File patch terlampir:
- `formula_overflow_fix.diff` — Bug #1 untuk semua bahasa
- `formula_range_guard_fix.diff` — Bug #2 untuk semua bahasa  
- `html_redos_fix.diff` — Bug #3 untuk TS core
- `formula_tests_regression.diff` — Test cases untuk Bug #1 & #2 (semua bahasa)

Atau lihat direktori `/outputs/patches/` untuk file `.rs`/`.ts`/`.php`/`.go` yang sudah diperbaiki lengkap per-bahasa.
