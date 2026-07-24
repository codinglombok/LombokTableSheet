# LombokTableSheet (Rust port) — Catatan Review Kode

**Konteks:** review manual persiapan sebelum Stage 10 (audit keamanan independen).
Ini **bukan** audit independen — saya membaca dan menguji ulang kode yang sama yang
sudah "ditulis" sebelumnya, jadi tetap butuh reviewer pihak ketiga yang sesungguhnya
sebelum rilis 1.0. Tujuan dokumen ini murni mempersempit pekerjaan reviewer itu.

**Metode:** proyek direkonstruksi dari file yang diunggah (`Cargo.toml` + 5 file `src/`
+ 3 file test + 1 example), di-*build* dan dijalankan sungguhan di sandbox (Rust 1.75,
`cargo build/test/fmt`) — bukan cuma dibaca. Semua klaim di dokumentasi diverifikasi
lebih dulu:

| Klaim di dokumentasi | Hasil verifikasi |
|---|---|
| 38 test, semua lulus | ✅ Cocok persis: 17+15+6=38 |
| `cargo fmt` bersih | ✅ Cocok (satu-satunya diff ada di `lib.rs` yang saya buat sendiri untuk rekonstruksi struktur, bukan bagian kode asli) |
| Parity formula `=SUM(A1:B1)*2+IF(A1>5,1,0)` → 61 | ✅ Cocok persis lewat `examples/parity_check.rs` |
| `cargo clippy` bersih | ⚠️ Tidak bisa diverifikasi — `cargo-clippy` tidak tersedia di sandbox ini (hanya rustc+cargo dasar via apt). Tidak ada alasan meragukannya, tapi juga tidak saya buktikan ulang. |

## Temuan baru (belum ada di SECURITY.md)

### 1. 🔴 Integer overflow di `parse_cell_ref` — panic (debug) / wraparound diam-diam (release)

**Lokasi:** `src/formula.rs`, perhitungan kolom `col = col * 26 + (...)`.

**Reproduksi:** formula berisi "referensi sel" dengan ratusan huruf, misalnya
`="AAAA...A(400 kali)A"1` → `parse_cell_ref` mengalikan berulang tanpa batas panjang.

- **Build debug** (mode default `cargo test`/`cargo run`): **panic** —
  `attempt to multiply with overflow`. Ini kontradiksi langsung dengan kontrak inti
  proyek: "`evaluate()` never panics on malformed data" / "never throw on data",
  yang jadi non-negotiable di MASTERPROMPT.md dan diulang di README semua port.
- **Build release**: tidak panic, tapi **wraparound diam-diam** menghasilkan index
  kolom sampah (mis. `8116567392432202710`) — secara diam-diam salah, bukan
  ditolak. Kalau nilai ini dipakai lebih lanjut untuk `set_value`, berisiko memicu
  alokasi memori raksasa di `Sheet::to_rows()` (yang membangun grid padat seukuran
  `row_count × col_count`).

**Severity:** Sedang-tinggi. Ini adalah input formula murni (teks), tidak perlu akses
ke data sheet — jadi termasuk kategori "untrusted input path" yang menurut
SECURITY.md seharusnya sudah dijaga (sama seperti CSV/JSON punya `max_input_bytes`).

**Status: sudah diperbaiki di sesi ini** (lihat bagian Perbaikan di bawah) — diverifikasi
tidak lagi panic (debug) maupun wraparound (release), keduanya sekarang mengembalikan
`Err`/`FormulaError` yang eksplisit.

### 2. 🔴 Ekspansi range formula tanpa batas — resource exhaustion

**Lokasi:** `src/formula.rs`, `evaluate()` cabang `Node::Call` saat argumen berupa
`Node::Range`.

**Reproduksi:** `=SUM(A1:A50000000)` pada sheet kosong — dijalankan sungguhan, proses
**masih belum selesai setelah 20 detik** (dihentikan paksa), karena loop
`for r in r1..=r2 { for c in c1..=c2 { vals.push(...) } }` tidak punya batas atas.

Ini beda perlakuan dengan jalur input tak-tepercaya lain di proyek yang sama:
`CsvDecodeOptions`/`JsonDecodeOptions` punya `max_input_bytes`/`max_rows` eksplisit,
tapi teks formula (yang juga input tak tepercaya — bisa datang dari sel yang diisi
pengguna lain) tidak punya batas apa pun untuk ukuran range. Angka range murni berasal
dari teks formula, **tidak perlu ada data apa pun di sheet** untuk memicunya — jadi DoS
ini murah bagi penyerang (satu baris formula pendek) dan mahal bagi korban.

**Severity:** Sedang-tinggi — DoS trivial, sejalan dengan ancaman yang justru sudah
diantisipasi & dijaga di bagian lain proyek yang sama (guard depth-nesting parser 200
level sudah ada persis untuk kelas masalah ini).

**Status: sudah diperbaiki di sesi ini** — ditambahkan `MAX_RANGE_CELLS = 1_000_000`,
diverifikasi formula yang sama sekarang selesai dalam **~8 mikrodetik**, bukan hang.

**Catatan desain yang perlu diketahui pereview lain:** `SUM`/`COUNT`/dll sudah lama
memfilter argumen non-numerik secara diam-diam (`flatten_nums` pakai `filter_map`), jadi
efek yang terlihat dari guard baru ini adalah "cepat selesai", **bukan** "melempar
`#VALUE!` yang terlihat pengguna" — karena error placeholder untuk range-kelebihan-batas
ikut terfilter sama seperti sel teks biasa. Ini konsisten dengan perilaku lama, bukan
regresi baru, tapi didokumentasikan di sini supaya tidak dianggap bug tersembunyi oleh
reviewer berikutnya.

## Hal yang diamati tapi TIDAK diperbaiki (butuh keputusan produk, bukan sekadar patch)

### 3. 🟡 Referensi sel bersifat case-sensitive (harus UPPERCASE)

`=a1+a2` **gagal parse** (`unknown identifier: A1`) — tokenizer hanya mengenali `A1`
sebagai referensi sel jika huruf besar; huruf kecil malah diperlakukan sebagai nama
fungsi yang tidak ditemukan. Kebanyakan spreadsheet umum (Excel, Google Sheets)
menerima huruf besar/kecil untuk referensi sel.

Ini bukan bug keamanan, ini **keputusan scope/UX** yang mungkin memang disengaja (perlu
dicek konsistensi dengan port TS/PHP/Go — saya belum membandingkan file formula
mereka). Kalau disengaja, sebaiknya didokumentasikan eksplisit di README/USAGE agar
tidak dianggap bug oleh pengguna baru. Kalau tidak disengaja, perbaikannya sederhana
(uppercase identifier sebelum cek `is_cell_ref`).

### 4. 🟡 `extract_dependencies` punya potensi risiko serupa temuan #2

`extract_dependencies` juga meng-*expand* range menjadi nama sel satu per satu untuk
membangun graf dependency, tanpa batas ukuran yang sama. Saya **sengaja tidak
menambal ini** di sesi ini karena beda dari `evaluate()`: dependency graph dipakai untuk
kebutuhan rekalkulasi, jadi memotong/menolak begitu saja bisa berarti sel-sel di ujung
range hilang dari graf ketergantungan — ini keputusan desain (truncate vs reject vs
biarkan) yang lebih baik diambil oleh yang punya konteks penuh soal bagaimana graf ini
dipakai di TransactionalSheet TS, bukan ditambal buru-buru di port Rust saja.

## Ringkasan status setelah sesi ini

- Build: ✅ bersih (`cargo build --all-targets`)
- Test: **42 lulus** (38 asli + 4 regression test baru untuk temuan #1 dan #2)
- Format: ✅ bersih (`cargo fmt --check`)
- 2 bug nyata ditemukan **dan** diperbaiki dengan regression test
- 2 catatan desain (case-sensitivity, dependency-graph range guard) didokumentasikan,
  sengaja tidak ditambal karena butuh keputusan di luar scope port Rust saja

File kode yang sudah dipatch: `formula.rs` dan `formula_tests.rs` (lihat file terpisah).
Belum di-*commit*/dipush ke mana pun — ini masih berupa patch lokal di sandbox, perlu
Anda review dan terapkan ke repo sungguhan.
