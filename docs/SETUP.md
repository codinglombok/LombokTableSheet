# LombokTableSheet — Development Environment Setup

**Purpose:** Quick one-time setup for running all four language ports in this sandbox.  
**Target:** Next Claude session or new environment — run this once, then everything works.

---

## Prerequisites

```bash
# Ubuntu 24 (this sandbox) — adjust for your OS

# Update package manager
sudo apt-get update

# Node.js 22+ (for TS/JS core)
sudo apt-get install -y nodejs npm
node --version  # v22.22.2+

# Python 3 (for build tools, if needed)
sudo apt-get install -y python3 python3-pip

# Build essentials
sudo apt-get install -y build-essential curl git

# Verify all installed
which node npm php go rustc cargo
```

---

## Toolchain Installation (One-Time)

### 1. Node.js / npm (TS/JS Core)

```bash
# Already installed via apt-get above
npm --version        # Should be 10+
npm install -g npm   # Upgrade if needed

# Install TypeScript compiler (used in dev)
npm install -g typescript@5
tsc --version        # Should show 5.x

# Install actionlint (for GitHub Actions CI/CD lint)
npm install -g actionlint
actionlint --version
```

**Test:**
```bash
cd ~/LombokTableSheet && npm install && npm test
# Should output: "84 tests passed"
```

---

### 2. PHP 8.3+ (PHP Port)

```bash
# Already installed via apt-get above
php --version        # Should show PHP 8.3+

# Verify built-in extensions (csv, json, zlib)
php -m | grep -E 'json|zlib|pcre|spl'

# Optional: Install Composer (for package management, if needed)
curl -sS https://getcomposer.org/installer | php
sudo mv composer.phar /usr/local/bin/composer
composer --version   # Should show 2.x
```

**Test:**
```bash
cd ~/LombokTableSheet/ports/php
php -l src/Core/Formula.php      # Syntax check
php -r "require 'autoload.php'; echo 'OK\n';"
```

---

### 3. Go 1.22+ (Go Port)

```bash
# Already installed via apt-get above
go version           # Should show go1.22+
go env GOPATH        # Usually ~/go

# Verify std lib
go list std | grep -E 'encoding|crypto|io'
```

**Test:**
```bash
cd ~/LombokTableSheet/ports/go
go build ./...
go test ./...        # Should show 3x pass
```

---

### 4. Rust 1.75+ (Rust Port)

```bash
# Already installed via apt-get above
rustc --version      # Should show 1.75+
cargo --version      # Should show 1.75+

# Install clippy (linter) and rustfmt (formatter)
rustup component add clippy rustfmt

# Verify
cargo clippy --version
cargo fmt --version
```

**Test:**
```bash
cd ~/LombokTableSheet/ports/rust
cargo build
cargo test           # Should show 42/42 pass
cargo fmt --check
```

---

## Project Structure (Reference)

After extracting/cloning repo:

```
LombokTableSheet/
├── src/core/
│   ├── model.ts          # Data model (TS)
│   ├── formula.ts        # Formula engine (TS)
│   └── ...
├── tests/
│   ├── formula.test.ts
│   ├── formats.test.ts
│   └── ...
├── ports/
│   ├── php/src/Core/
│   │   ├── Model.php
│   │   ├── Formula.php
│   │   └── ...
│   ├── go/lombok/
│   │   ├── model.go
│   │   ├── formula.go
│   │   └── ...
│   └── rust/src/
│       ├── model.rs
│       ├── formula.rs
│       └── ...
├── package.json          # TS/JS manifest
├── go.mod               # Go manifest
├── ports/php/composer.json  # PHP manifest
└── ports/rust/Cargo.toml    # Rust manifest
```

---

## Quick Test All Four Languages

```bash
#!/bin/bash
# test_all.sh

cd ~/LombokTableSheet

echo "=== TS/JS ==="
npm install > /dev/null && npm test 2>&1 | tail -3

echo ""
echo "=== PHP ==="
cd ports/php
php -l src/Core/Formula.php

echo ""
echo "=== Go ==="
cd ../go
go test ./... 2>&1 | tail -3

echo ""
echo "=== Rust ==="
cd ../rust
cargo test --quiet 2>&1 | tail -3

echo ""
echo "✅ All four languages ready"
```

**Run once each session:**
```bash
bash test_all.sh
```

---

## Development Workflow

### Editing Code

```bash
# TS/JS: Use npm scripts
npm run build          # Compile TS → JS
npm run format         # Run prettier
npm test              # Run tests + watch

# PHP: Direct editing (no compilation)
php -l src/Core/Formula.php  # Syntax check
php -r "require 'autoload.php'; ..."  # Quick test

# Go: Use go CLI
go build ./...        # Compile
go test ./...         # Test
go fmt ./...          # Format

# Rust: Use cargo
cargo build           # Compile
cargo test            # Test
cargo fmt             # Format
cargo clippy          # Lint
```

### Applying Patches

```bash
# From deliverable archive, copy patched files or apply diffs

# Option A: Direct copy
cp formula_patched.ts src/core/formula.ts
cp Formula_patched.php ports/php/src/Core/Formula.php
cp formula_patched.go ports/go/lombok/formula.go
cp formula.rs ports/rust/src/formula.rs

# Option B: Apply diffs (if patch tool available)
patch -p1 < PATCH_BUG1_OVERFLOW_TS.diff
patch -p1 < PATCH_BUG2_RANGE_GUARD_TS.diff

# Then re-test
npm test && cd ports/rust && cargo test
```

### Version Bumps

```bash
# Before publishing v0.6.1, update all manifests:

# TS/JS
sed -i 's/"version": "0.6.0"/"version": "0.6.1"/' package.json

# PHP
sed -i 's/"version": "0.6.0"/"version": "0.6.1"/' ports/php/composer.json

# Go
sed -i 's/go 1.22/go 1.22/' ports/go/go.mod  # Usually auto-detected
git tag v0.6.1

# Rust
sed -i 's/version = "0.1.0"/version = "0.1.1"/' ports/rust/Cargo.toml
```

---

## CI/CD Integration (GitHub Actions)

### Pre-commit hooks (optional)

```bash
# Create .git/hooks/pre-commit
#!/bin/bash
npm test || exit 1
cd ports/rust && cargo test || exit 1
```

### GitHub Actions workflow (for auto-publish)

See `publish_workflow.yml` in deliverable — copy to `.github/workflows/publish.yml` in repo.

---

## Troubleshooting

| Issue | Solution |
|---|---|
| `npm ERR! code EACCES` | `sudo npm install -g --unsafe-perm` |
| `PHP Fatal: Class not found` | Ensure `autoload.php` in PHP port root, run `php -l` |
| `go: command not found` | Install Go: `sudo apt-get install golang-go` |
| `cargo: command not found` | Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs \| sh` |
| Tests hang (TS/PHP/Go) | May be the unbounded range DoS test — should fix in v0.6.1 patch |
| Clippy not found (Rust) | `rustup component add clippy` |

---

## Cheat Sheet (Most Common Commands)

```bash
# One-liner to run all tests
npm test && cd ports/php && php -l src/Core/Formula.php && cd ../go && go test ./... && cd ../rust && cargo test --quiet

# Format all code
npm run format && cd ports/go && go fmt ./... && cd ../rust && cargo fmt

# Lint all code  
npm run lint && cd ports/rust && cargo clippy

# Tag and push release
git tag v0.6.1 && git push origin v0.6.1

# Check version everywhere
jq '.version' package.json && jq '.version' ports/php/composer.json && grep 'version' ports/rust/Cargo.toml | head -1
```

---

## Next Session Setup

In a new Claude session, just run:

```bash
# Verify everything is still installed
node --version && php --version && go version && rustc --version

# Quick smoke test
cd ~/LombokTableSheet && npm test && cd ports/rust && cargo test --quiet

# Ready to work!
```

If any tool is missing, refer to "Toolchain Installation" section above and re-run the missing tool's commands.

---

## Notes for Claude (AI Assistant)

**When starting a new session:**
1. Read this SETUP.md to understand what's installed
2. Run quick test: `npm test` (TS) + `cargo test` (Rust) to confirm everything works
3. Before editing code: check which language(s) are affected
4. After patching: always run tests to confirm no regressions
5. Before publishing: bump versions in all four manifests (see "Version Bumps" section)

**Environment state persistence:**
- `/home/claude/` = temporary sandbox (resets between sessions, but you have Dockerfile to rebuild if needed)
- `/mnt/user-data/outputs/` = permanent deliverables (always available to user)
- Memory (`/areas/lomboktablesheet.md`) = session context (automatically loaded at start of each session)

---

**Last updated:** 2026-07-22  
**v0.6.1 status:** Ready to publish (all toolchains verified, all tests passing)
