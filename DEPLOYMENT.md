# Deployment Plan (Multi-Stage)

Each stage is independently shippable — don't wait for the whole list to do stage 1.

## Stage 1 — GitHub (source of truth)
- Public repo `codinglombok/LombokTableSheet`, Apache-2.0 `LICENSE`, branch protection on `main`.
- `.github/workflows/ci.yml` (included in this scaffold): install → typecheck → test → build on every PR.
- Tag releases `vX.Y.Z`; GitHub Releases auto-generated from conventional commits / changelog.

## Stage 2 — npm
```bash
npm login
npm publish --access public
```
- `package.json` already sets `"files"`, `"main"`, `"types"`, `"license": "Apache-2.0"`.
- Use `npm version patch|minor|major` + `npm publish` per release; CI can automate this on tag push.

## Stage 3 — unpkg / jsDelivr (CDN, zero-install usage)
Nothing to deploy — both CDNs mirror npm automatically once published:
```html
<script type="module">
  import { decodeCsv, LombokTable } from 'https://unpkg.com/lomboktablesheet@0.1.0/dist/index.js';
</script>
```

## Stage 4 — Docker (demo / CI environment image)
`docker/Dockerfile` (included) builds a minimal Node image that runs the test suite and
can serve the `examples/` folder for a live demo:
```bash
docker build -t lomboktablesheet-demo -f docker/Dockerfile .
docker run --rm -p 8080:8080 lomboktablesheet-demo
```
Publish to Docker Hub / GHCR from CI on tagged releases: `ghcr.io/codinglombok/lomboktablesheet-demo:X.Y.Z`.

## Stage 5 — Static hosting (AWS, Niagahoster / shared VPS)
The demo build (`examples/vanilla`) is static HTML/JS — deployable anywhere that serves files:

**AWS (S3 + CloudFront)**
```bash
aws s3 sync ./examples/vanilla s3://your-bucket --delete
aws cloudfront create-invalidation --distribution-id XXXX --paths "/*"
```

**Niagahoster / generic shared hosting / VPS**
- Build static assets locally (`npm run build` + copy `dist/` and `examples/vanilla/`).
- Upload via SFTP/FTP to `public_html/` (shared hosting) or `rsync` to a VPS behind Nginx:
```bash
rsync -avz ./examples/vanilla/ user@your-vps:/var/www/lomboktablesheet/
```
- Nginx serves it as static files — no server runtime required for the demo, since the
  library itself is client-side.

## Stage 6 — Packagist / Composer (PHP port)
The PHP port already exists at `ports/php` (Stage 6 of the roadmap is done — core model,
formula engine, CSV/JSON/Markdown codecs, split/merge; 27 PHPUnit tests, verified
byte-identical to the TS core on matching inputs — see ARCHITECTURE.md §8). To publish:
```bash
cd ports/php
composer validate
git tag php-vX.Y.Z && git push --tags
```
Submit the repo to [packagist.org](https://packagist.org) with GitHub webhook auto-sync enabled,
so every tag push republishes automatically. Consumers install via:
```bash
composer require codinglombok/lomboktablesheet
```

## Stage 6b — Go module (pkg.go.dev)
The Go port already exists at `ports/go` (34 tests, `go vet`/`gofmt` clean, verified
three-way parity with TS and PHP — see ARCHITECTURE.md §8). Go modules don't require a
separate publish step to a registry the way npm/Packagist do — tagging the repo is
enough:
```bash
git tag ports/go/v0.1.0
git push --tags
```
Once tagged and pushed to a public GitHub repo, the module is installable immediately:
```bash
go get github.com/codinglombok/lomboktablesheet-go@v0.1.0
```
`pkg.go.dev` indexes it automatically on first fetch (no submission step, unlike
Packagist) — though the first `go get` from anywhere can take a few minutes to appear.

## Stage 7 — Google (developer directory / search surface)
Not a deploy target in the infra sense — this means: submit the docs site to Google Search
Console, add JSON-LD `SoftwareSourceCode` structured data to the docs homepage, and list on
relevant package directories (npm's own search already indexes to Google). No separate action
beyond good SEO metadata in `README.md`/docs site `<head>`.

## Stage 8 — Framework integration snippets
Kept in `examples/`:
- `examples/vanilla/` — plain `<script type="module">` usage.
- React/Vue usage — the adapters are done (`lomboktablesheet/react`, `lomboktablesheet/vue`,
  see README.md's Framework adapters section for usage snippets); a dedicated
  `examples/react/` and `examples/vue/` demo app is a nice-to-have, not yet built as a
  standalone example.
- Go consumption — done: `go get github.com/codinglombok/lomboktablesheet-go` (see
  `ports/go/README.md`).
- Rust consumption — not yet available; once that port exists: `cargo add
  lomboktablesheet` (crates.io) with an optional `wasm` feature flag for web use.

## Release checklist (per version)
1. `npm run typecheck && npm test` green in CI.
2. Bump version (`npm version …`), update `CHANGELOG.md`.
3. `npm publish`.
4. Tag pushed → GitHub Release notes generated.
5. Docker demo image rebuilt and pushed (CI).
6. Static demo re-synced to S3/CloudFront and/or VPS if the demo changed.
