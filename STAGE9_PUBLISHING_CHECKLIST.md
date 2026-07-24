# Stage 9 — Publishing & Distribution: Checklist Eksekusi

Status di MASTERPROMPT-STAGES.md: 🟡 *"Documented, not executed"* — semua langkah di
bawah sudah direncanakan di `DEPLOYMENT.md`, tapi belum dijalankan karena butuh
kredensial nyata (login npm, akun Packagist, dll) yang tidak ada di sandbox
pengembangan. Checklist ini mengubahnya jadi daftar tugas yang bisa dicentang satu per
satu oleh siapa pun yang **punya** kredensial tersebut.

> ⚠️ Saya tidak bisa mengeksekusi langkah manapun di sini (tidak ada akses
> kredensial/akun Anda). Ini murni daftar kerja yang siap dieksekusi manusia.

## 1. Pra-syarat (sekali jalan, sebelum publish pertama)

- [ ] Buat/pastikan akun npm punya akses publish ke nama paket `lomboktablesheet`
      (cek dulu apakah nama itu sudah dipakai orang lain di npm — kalau sudah, perlu
      nama alternatif atau scope `@namaorg/lomboktablesheet`)
- [ ] Buat akun Packagist (packagist.org) yang terhubung ke akun GitHub/VCS repo
- [ ] Buat akun crates.io (untuk port Rust) — `cargo login` dengan API token
- [ ] Pastikan `LICENSE` (Apache-2.0) ada persis di root setiap sub-package yang akan
      dipublish terpisah (root repo, `ports/php`, `ports/rust`)
- [ ] Cek ulang `Cargo.toml`, `composer.json` (PHP), `go.mod`, dan `package.json` (TS)
      — field `repository`, `description`, `license`, `version` konsisten satu sama
      lain dan dengan README masing-masing

## 2. TypeScript/JS core → npm

- [ ] `npm run build` menghasilkan `dist/` bersih (ESM + type declarations)
- [ ] `npm pack --dry-run` untuk cek isi tarball sebelum publish sungguhan (pastikan
      tidak ada file dev/test yang ikut terbawa)
- [ ] `npm publish` (perlu `npm login` dengan akun yang sudah 2FA-enabled — disarankan)
- [ ] Verifikasi `npm install lomboktablesheet` dari environment bersih benar-benar
      berhasil dan `import` bekerja
- [ ] Tag rilis di git (`v0.6.0`) dan buat GitHub Release dengan changelog

## 3. CDN (otomatis, tapi perlu diverifikasi manual)

- [ ] Setelah npm publish sukses, cek `https://unpkg.com/lomboktablesheet` termuat
- [ ] Cek `https://cdn.jsdelivr.net/npm/lomboktablesheet` termuat
- [ ] (Kedua CDN ini mirror otomatis dari npm — tidak ada langkah publish terpisah,
      tapi propagasi bisa butuh beberapa menit, jadi tetap perlu dicek manual sebelum
      diumumkan ke pengguna)

## 4. PHP port → Packagist

- [ ] Pastikan `composer.json` di `ports/php/` valid (`composer validate`)
- [ ] Submit repo (atau sub-path) ke Packagist, hubungkan webhook GitHub agar update
      otomatis ter-refresh tiap push tag baru
- [ ] Verifikasi `composer require codinglombok/lomboktablesheet-php` (atau nama paket
      final) berhasil dari environment bersih

## 5. Go port

- [ ] Pastikan `go.mod` module path cocok dengan URL repo GitHub yang sesungguhnya
      (Go tidak punya registry terpusat — publish = tag git yang valid + module path
      benar)
- [ ] Tag versi (`git tag ports/go/v0.6.0` sesuai konvensi Go module di subdirektori)
- [ ] Verifikasi `go get github.com/codinglombok/LombokTableSheet/ports/go@v0.6.0`
      dari environment bersih
- [ ] Cek muncul di `pkg.go.dev` (otomatis terindeks setelah tag pertama kali diakses)

## 6. Rust port → crates.io

- [ ] `cargo publish --dry-run` di `ports/rust/` dulu untuk cek isi package
- [ ] Pastikan field `description`, `license`, `repository` di `Cargo.toml` terisi
      (repository sudah ada, license sudah `Apache-2.0` — cek deskripsi cukup jelas)
- [ ] `cargo publish` (perlu token dari `cargo login`)
- [ ] Verifikasi `cargo add lomboktablesheet` dari project Rust bersih berhasil
- [ ] Cek halaman docs.rs otomatis ter-generate dengan benar (docs.rs build otomatis
      dari crates.io, tapi kadang gagal kalau ada dependency/feature flag aneh — di
      sini harusnya aman karena zero-dependency)

## 7. Docker image

- [ ] Build image dari `docker/Dockerfile` yang sudah ada, tag sesuai versi
      (`v0.6.0` dan `latest`)
- [ ] Push ke registry pilihan (Docker Hub / GHCR) — GHCR (`ghcr.io`) biasanya lebih
      mudah karena terintegrasi langsung dengan GitHub Actions & permission repo
- [ ] Verifikasi `docker pull` + jalan dari environment bersih

## 8. Demo statis

- [ ] Build demo di `examples/` jadi bundle statis
- [ ] Deploy ke GitHub Pages / Vercel / Netlify (pilih salah satu — repo belum
      menentukan mana, ini keputusan yang perlu diambil, bukan cuma langkah teknis)
- [ ] Pastikan demo memuat versi yang baru dipublish (bukan cache versi lama)

## 9. Setelah semua publish sukses

- [ ] Update badge/status di `README.md` root — ganti klaim "v0.6.0, JS/TS core
      (hardened) + PHP/Go/Rust ports" jadi menyertakan link nyata ke npm/Packagist/
      crates.io/pkg.go.dev
- [ ] Update `MASTERPROMPT-STAGES.md` Stage 9 dari 🟡 jadi ✅, sertakan tanggal &
      link masing-masing package sebagai bukti (bukan cuma tulis "done")
- [ ] Umumkan (kalau relevan) — repo GitHub release notes, dsb.

## Catatan urutan yang disarankan

TS/JS core dulu (paling banyak dipakai, sudah paling matang) → lalu Rust (zero-dep,
risiko publish paling kecil) → PHP dan Go bisa paralel setelah itu. Docker & demo
statis terakhir karena bergantung pada versi yang sudah live di registry masing-masing.

**Yang sengaja TIDAK masuk checklist ini:** Stage 10 (audit keamanan independen) —
itu prasyarat sebelum rilis **1.0**, bukan bagian dari publish v0.6.0 sebagai preview/
pra-rilis. Jangan campur keduanya; mempublish v0.6.0 ke registry tidak berarti proyek
sudah "1.0-ready".
