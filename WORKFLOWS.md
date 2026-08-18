# CI/CD Workflows

This repo's `.github/workflows/` set, and the reasoning behind each — including the
ones deliberately **not** built, per this project's rule that scaffolding presented as working is worse than an honest gap.

That rule is why five workflows were removed in the audit below: each of them was
scaffolding that could not succeed as written, and a permanently red check is worse
than no check, because it trains everyone to ignore the red.

## Implemented

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | push/PR to `main` | TS/JS: typecheck, full test suite, build, `npm audit --audit-level=high` (Node 20.x/22.x/24.x matrix) |
| `php-ci.yml` | push/PR touching `ports/php/**` | PHP: composer install + PHPUnit (8.1–8.3 matrix) |
| `go-ci.yml` | push/PR touching `ports/go/**` | Go: build, vet, gofmt check, tests w/ coverage (1.21–1.22 matrix) |
| `linter.yml` | push/PR | Static checks across all three languages: `tsc --noEmit`, `go vet`+`gofmt`, `php -l` |
| `dependency-review.yml` | PR | Blocks PRs introducing high-severity vulns or copyleft-licensed deps (GPL/AGPL, which would conflict with our Apache-2.0 license) |
| `labeler.yml` + `.github/labeler.yml` | PR | Auto-labels PRs by changed path (`lang: typescript`, `lang: php`, `lang: go`, `security`, `i18n`, etc.) |
| `label.yml` + `.github/labels.yml` | push to label config | Keeps the repo's label set in sync with a version-controlled definition |
| `publish.yml` | GitHub release published | Orchestrates `npm-publish.yml` and posts a job-summary checklist of the *other* publish targets that still need a manual step (Packagist, Docker, static hosting — see DEPLOYMENT.md) |
| `npm-publish.yml` | called by `publish.yml`, or manual dispatch | Publishes to npm with provenance; requires an `NPM_TOKEN` secret |
| `pages.yml` | push touching the demo/core, or manual | Deploys the vanilla-JS demo to GitHub Pages |
| `stale.yml` | daily schedule | Marks inactive issues/PRs stale after 60 days, closes after 14 more (exempts `security`/`pinned`) |
| `greetings.yml` | first issue/PR from a contributor | Welcome message pointing new PR authors at test/security expectations |
| `generate-wiki.yml` | push touching root docs | Mirrors the root-level `.md` docs into the repo's GitHub Wiki (`README.md` → wiki `Home.md`) |
| `linter.yml`'s `ts-lint` job | push/PR | Also runs `scripts/check-action-pins.mjs`, which fails if any action is referenced by tag instead of a full commit SHA |
| `pages.yml`'s verify step | push touching demo/core/workflow | Runs `scripts/verify-pages-site.mjs`, which walks the module graph the demo actually imports and fails on a `node:` import or a Node-only global |

CodeQL scanning is **not** in this table on purpose — it runs through GitHub's
**default setup** (Settings → Security → Code scanning), which covers
JavaScript/TypeScript, Go, Rust, and Actions. See the removals below for why there
is no `codeql.yml` alongside it.

### Requires repository settings, not just the file

Two of the above need configuration outside the workflow file, and will fail with a
confusing error until it exists:

- `pages.yml` — Settings → Pages → Build and deployment → Source must be
  **GitHub Actions**. Without it, `actions/deploy-pages` fails at the deploy job.
- `generate-wiki.yml` — the repository Wiki must be enabled (Settings → Features →
  Wikis) and initialized with at least one page. The action cannot create the wiki
  repository from nothing.

## Removed in the workflow audit

| Workflow | Why it was removed |
|---|---|
| `codeql.yml` | CodeQL **default setup** is enabled on this repo. GitHub refuses to process results from an advanced-configuration workflow while default setup is on, so this file could only ever produce a failed run. Default setup also covers more languages (Go, Rust, Actions) than this file's `javascript-typescript`-only matrix. If you ever need custom query packs, switch default setup off *first*, then restore this file. |
| `summary.yml` | Ran the TS, Go, and PHP suites again on every push — duplicating `ci.yml`, `go-ci.yml`, and `php-ci.yml` — purely to render a summary table. It also could not pass: it called `phpunit` without installing it (`setup-php` was given no `tools:` input) and without a `composer install`. It was the only workflow never documented in this file. |
| `screenshots.yml` | Could not run as written. `npx playwright install` fetches browsers but does not add `playwright` to `node_modules`, so the inline `require('playwright')` failed; `http-server` was likewise not a dependency. Even past that, `examples/vanilla/index.html` imports `../../dist/index.js`, which sits outside the directory being served, so the page would never render a `<table>` for the screenshot. It also pushed commits directly to `main`. |
| `fix-code.yml` | `npm run lint -- --fix --if-present` forwards `--if-present` (an *npm* flag) to ESLint, which rejects it as an unknown option — and the `lint` script is itself broken under ESLint 9 (see below). Beyond that, auto-committing to a pull request's head branch, which may live in a fork, is a pattern worth avoiding rather than repairing. |
| `release-please.yml` | Release Please owns version bumps and tags, deriving them from conventional commits. This project releases in manual staged increments with hand-applied tags, so the two approaches fight over the same files (`package.json`, `.github/.release-please-manifest.json`, `CHANGELOG.md`). Pick one. Restoring this file is fine — but then stop bumping versions and tagging by hand, and let the release PRs do it. |

## Fixed rather than removed

- **`ci.yml`** — the `permissions:` block was indented one level too deep, so YAML
  parsed it as an event named `permissions` under `on:` rather than as a top-level
  key. The workflow was running with the repository's default token permissions and
  the intended read-only restriction never applied. This is the residue of an
  automated "Workflow does not contain permissions" fix that landed in the wrong
  place; the same pattern is worth checking whenever one of those autofix PRs is merged.
- **`npm-publish.yml`** — it listened for `release: published` *and* was invoked by
  `publish.yml`, which listens for the same event. Every release therefore started
  two publish runs, the second failing with a 403 because the version already
  existed on the registry. It now exposes only `workflow_call` and
  `workflow_dispatch`.
- **`generate-wiki.yml`** — referenced `MASTERPROMPT.md` and `MASTERPROMPT-STAGES.md`,
  which do not exist in this repository. Its copy loop was also one reordering away
  from failing the step outright: `run:` executes under `bash -e`, and a bare
  `[ -f x ] && cp x` returns non-zero when the test fails, so a missing file in the
  *last* iteration would fail the job. Both are fixed, and `WORKFLOWS.md` is now
  mirrored to the wiki too.

## Known-broken, tracked separately

- **Resolved (kept for the record):** `npm run lint` used to fail because ESLint 9 requires a flat
  `eslint.config.js`, which the repo lacked. Fixed in v0.7.2; the job is green.
- **`ports/rust/`** does not build: `Cargo.toml` declares `src/lib.rs`,
  `tests/{model,formula,formats}_tests.rs`, and `examples/parity_check.rs`, none of
  which exist — the directory contains only `src/formula.rs`. This is also why
  CodeQL reports "Low Rust analysis quality" against the repo.

## Deliberately not implemented

| Name (from reference list) | Why it's skipped, honestly |
|---|---|
| `defender-for-devops` | **Correction:** an earlier version of this table claimed this needs an Azure subscription the project doesn't have. That is wrong — `microsoft/security-devops-action` runs its open-source analyzers without one, and it runs green today in the sibling repo [LombokCharts](https://github.com/codinglombok/LombokCharts). The honest reason it isn't here is that it hasn't been prioritised: CodeQL default setup plus `dependency-review.yml` already cover SAST and dependency vulnerabilities, so the marginal value was judged low. Worth adding if you want its extra analyzers. |
| `ossar` | **Correction:** an earlier version of this table claimed OSSAR had been retired and would fail on first run. That is wrong — `github/ossar-action` is still published (v2.0.0) and runs green today in [LombokCharts](https://github.com/codinglombok/LombokCharts). As above, the real reason is priority, not impossibility: CodeQL and `linter.yml` cover the same ground. |
| `static` | Ambiguous name in the reference list — most likely "static analysis," which CodeQL (security-focused) and `linter.yml` (correctness/formatting-focused) already cover between them. Adding a third workflow with unclear scope would be duplication, not more rigor. |
| `dist` | Likely a "build and attach dist artifacts to release" step — folded into `npm-publish.yml`, which already runs the build before publishing rather than needing a separate artifact-only workflow. |
| `visual` / `visual-baselines` | Real visual regression testing (screenshot diffing against an approved baseline) needs an actual first-run to establish those baselines, a storage location for them, and a review process for intentional visual changes. Building a `visual-baselines` workflow with no real baseline images behind it would be fake infrastructure. This is left as an honest gap — worth doing once the Table/Sheet visual design stabilizes enough that baselines are worth committing to. |

Both corrections above came from the same mistake: asserting from memory that a
tool was unavailable, instead of checking. A table headed "deliberately not
implemented" is worthless if its reasons are invented — "we didn't get to it"
is a fine entry; "this cannot work" needs evidence.

If you disagree with any of these calls — e.g. you do have Azure DevOps credentials, or
you want to seed real visual-regression baselines — that's a legitimate reason to build
the corresponding workflow for real. The point isn't that these are permanently out of
scope, it's that they weren't faked here.
