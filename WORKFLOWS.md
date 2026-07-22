# CI/CD Workflows

This repo's `.github/workflows/` set, and the reasoning behind each — including the
ones deliberately **not** built, per this project's rule that scaffolding presented as working is worse than an honest gap.

## Implemented

| Workflow | Trigger | What it does |
|---|---|---|
| `ci.yml` | push/PR to `main` | TS/JS: typecheck, full test suite, build (Node 18.x/20.x matrix) |
| `php-ci.yml` | push/PR touching `ports/php/**` | PHP: lint + PHPUnit (8.1–8.3 matrix) |
| `go-ci.yml` | push/PR touching `ports/go/**` | Go: build, vet, gofmt check, tests w/ coverage (1.21–1.22 matrix) |
| `codeql.yml` | push/PR + weekly schedule | CodeQL security scanning (JS/TS now; Go/PHP query packs to add once validated) |
| `dependency-review.yml` | PR | Blocks PRs introducing high-severity vulns or copyleft-licensed deps (GPL/AGPL, which would conflict with our Apache-2.0 license) |
| `labeler.yml` + `.github/labeler.yml` | PR | Auto-labels PRs by changed path (`lang: typescript`, `lang: php`, `lang: go`, `security`, `i18n`, etc.) |
| `label.yml` + `.github/labels.yml` | push to label config | Keeps the repo's label set in sync with a version-controlled definition |
| `linter.yml` | push/PR | Static checks across all three languages: `tsc --strict`, `go vet`+`gofmt`, `php -l` |
| `npm-publish.yml` | GitHub release published, or manual dispatch | Publishes to npm with provenance; requires an `NPM_TOKEN` secret |
| `pages.yml` | push touching the demo/core, or manual | Deploys the vanilla-JS demo to GitHub Pages |
| `release-please.yml` + config | push to `main` | Automated release PRs (changelog + version bump) per package — separate streams for the npm package, the PHP port, and the Go port |
| `stale.yml` | daily schedule | Marks inactive issues/PRs stale after 60 days, closes after 14 more (exempts `security`/`pinned`) |
| `greetings.yml` | first issue/PR from a contributor | Welcome message pointing new PR authors at test/security expectations |
| `fix-code.yml` | PR labeled `fix-code` | Runs auto-formatters (ESLint `--fix`, `gofmt -w`) and pushes the result — opt-in via label, not automatic on every PR |
| `publish.yml` | GitHub release published | Orchestrates `npm-publish.yml` and posts a job-summary checklist of the *other* publish targets that still need a manual step (Packagist, Docker, static hosting — see DEPLOYMENT.md) |
| `generate-wiki.yml` | push touching root docs | Mirrors the root-level `.md` docs into the repo's GitHub Wiki (`README.md` → wiki `Home.md`) |
| `screenshots.yml` | push touching the demo/adapters | Boots the vanilla demo, screenshots it with Playwright, commits the image to `docs/screenshots/` |

## Deliberately not implemented

| Name (from reference list) | Why it's skipped, honestly |
|---|---|
| `defender-for-devops` | Microsoft Defender for DevOps is Azure-specific and needs an Azure subscription/tenant this project doesn't have. Building a workflow file that references credentials that don't exist would be exactly the "scaffolding presented as working" this project's non-negotiables warn against. `codeql.yml` + `dependency-review.yml` already cover the same category of risk (SAST + dependency vulnerabilities) without that dependency. |
| `ossar` | OSSAR (Open Source Static Analysis Runner) was retired by Microsoft/GitHub — a workflow using it would fail on first run. `codeql.yml` and `linter.yml` are the current replacements. |
| `static` | Ambiguous name in the reference list — most likely "static analysis," which `codeql.yml` (security-focused) and `linter.yml` (correctness/formatting-focused) already cover between them. Adding a third workflow with unclear scope would be duplication, not more rigor. |
| `dist` | Likely a "build and attach dist artifacts to release" step — folded into `npm-publish.yml`, which already runs the build before publishing rather than needing a separate artifact-only workflow. |
| `visual` / `visual-baselines` | Real visual regression testing (screenshot diffing against an approved baseline) needs an actual first-run to establish those baselines, a storage location for them, and a review process for intentional visual changes. `screenshots.yml` above captures a current-state screenshot (useful for docs), but that is **not** the same thing as regression testing, and building a `visual-baselines` workflow with no real baseline images behind it would be fake infrastructure. This is left as an honest gap — worth doing once the Table/Sheet visual design stabilizes enough that baselines are worth committing to. |

If you disagree with any of these calls — e.g. you do have Azure DevOps credentials, or
you want to seed real visual-regression baselines — that's a legitimate reason to build
the corresponding workflow for real. The point isn't that these are permanently out of
scope, it's that they weren't faked here.
