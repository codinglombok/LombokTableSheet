# LombokTableSheet — Ringkasan Status Proyek

**Versi:** v0.6.0 · **Lisensi:** Apache-2.0 · **Terakhir diverifikasi:** angka di bawah berasal dari hasil run test suite sungguhan, bukan estimasi.

Library Table + Spreadsheet portable: core TypeScript/JS, dengan port data-layer ke PHP, Go, dan Rust — semua saling diverifikasi silang (cross-language parity).

## Sumber kebenaran (source of truth)

- **`LombokTableSheet__2_.zip`** (folder `LombokTableSheet/`, terakhir diubah 21 Jul) → snapshot **terbaru & lengkap**, cocok dengan `PROJECT_SUMMARY.md`/README utama (30 locale i18n, transaction/undo-redo, adapter React+Vue, XLSX codec, SECURITY.md lengkap ~6.3KB).
- **`LombokSheet.zip`** (folder `lombok-sheet/`, 19 Jul) → snapshot **lama, sudah usang** (hanya 7 locale, belum ada transaction layer/adapter/XLSX). Jangan dipakai sebagai acuan lagi.
- `README__2_.md` = README root proyek (level keseluruhan, TS/JS-sentris).
- `README__3_.md` = README khusus `ports/rust/` (level port Rust saja) — bukan duplikat, cakupannya berbeda.
- File `.rs` yang diunggah (model.rs, csv.rs, json.rs, split_merge.rs, formula.rs, *_tests.rs, parity_check.rs, Cargo.toml) semuanya konsisten satu sama lain dan dengan Stage 8 di MASTERPROMPT-STAGES.md — tidak ada konflik isi. Beberapa file terunggah dua kali dengan isi identik (json.rs, formula_tests.rs, MASTERPROMPT-STAGES.md).

## Status per bagian

| Bagian | Status | Detail |
|---|---|---|
| Core TS/JS | ✅ Selesai | model, formula engine (tokenizer→Pratt parser→AST, **tanpa `eval`**), transaction/undo-redo, codec CSV/JSON/Markdown/HTML/XLSX (ZIP hand-rolled pakai zlib bawaan Node), templates, i18n 30 locale, adapter React/Vue. 84 test. |
| Port PHP (`ports/php/`) | ✅ Selesai | data-layer saja (tanpa DOM/UI) — 33 test |
| Port Go (`ports/go/`) | ✅ Selesai | data-layer saja, pakai std lib `encoding/csv`/`encoding/json` — 34 test, 83.2% coverage, `go vet`/`gofmt` bersih |
| Port Rust (`ports/rust/`) | ✅ Selesai (Stage 8) | data-layer saja, **zero dependency** (CSV/JSON hand-rolled, sama alasan dengan XLSX di TS core), `CellValue` sebagai Rust `enum` sungguhan (paling type-safe dari 4 bahasa) — 38 test, `cargo clippy`/`cargo fmt` bersih |
| **Total test** | **189** | 4-way cross-language parity terverifikasi: formula `=SUM(A1:B1)*2+IF(A1>5,1,0)` dengan A1=10,B1=20 → hasil **61** identik di TS/PHP/Go/Rust |

## Bug nyata yang ditemukan & sudah diperbaiki

Via fuzz test seeded pada transaction layer (didokumentasikan jujur di SECURITY.md, bukan disembunyikan):
1. `undo()` tidak mengembalikan dimensi sheet setelah edit yang memperbesar grid.
2. `toRows()` tidak bounds-check referensi sel terhadap dimensi saat ini (bisa bocor sel basi setelah sheet mengecil).

Port Go dan Rust sudah **proaktif** menghindari bug #2 sejak awal penulisan (masing-masing punya regression test sendiri: `TestResizeShrinksDimensionsAndToRowsRespectsIt` / `resize_shrinks_dimensions_and_to_rows_respects_it`).

## Yang jujur belum selesai

- **Stage 9 — Publishing**: npm publish, Packagist, Docker image, CDN, hosting demo. Sudah didokumentasikan lengkap di DEPLOYMENT.md tapi belum dieksekusi — butuh kredensial nyata (npm login, akun Packagist, dll) yang tidak ada di sandbox pengembangan.
- **Stage 10 — Audit keamanan independen**: sengaja belum dimulai. Hardening internal (Stage 5) bagus tapi bukan pengganti review dari pihak yang tidak menulis kodenya sendiri.
- **Stage 11 — Integrasi LombokCharts/LombokCSS**: baru level hook (`cssHooks` di templates). Proyek sibling-nya sendiri belum ada, jadi integrasi penuh sengaja ditunda.
- XLSX: hanya subset (values + struktur dasar), belum styles/merged cells/formula-in-file.

## Cara pakai (contoh Rust)

```rust
use lomboktablesheet::csv::{decode_csv, CsvDecodeOptions};
use lomboktablesheet::formula::{parse_formula, evaluate, SheetResolver};
use lomboktablesheet::model::{Sheet, CellValue};

let result = decode_csv("name,age\nAlice,30\n", CsvDecodeOptions::default());
let workbook = result.workbook.unwrap();

let mut sheet = Sheet::new("S1");
sheet.set_value(0, 0, CellValue::Number(10.0)).unwrap();
sheet.set_value(0, 1, CellValue::Number(20.0)).unwrap();
let ast = parse_formula("=SUM(A1:B1)*2").unwrap();
let value = evaluate(&ast, &SheetResolver::new(&sheet)); // FormulaValue::Number(60.0)
```

## Langkah lanjutan yang disarankan

Jika melanjutkan proyek ini: baca `MASTERPROMPT.md` untuk non-negotiables, lalu cari stage pertama berstatus `⬜ Not started` (Stage 10 atau 9) di `MASTERPROMPT-STAGES.md` dan pakai "Brief"-nya sebagai instruksi kerja. Setelah selesai satu stage, update statusnya di **tiga tempat sekaligus**: MASTERPROMPT-STAGES.md, ARCHITECTURE.md (tabel roadmap), dan PROJECT_SUMMARY.md — supaya tidak drift satu sama lain.
