# Project Profile

## Identity
- Project name: ZenPDF
- Repository URL: `https://github.com/bokoboss/ZenPDF`
- Authoritative local path: `C:\MyRD\ZenPDF`
- Primary branch: `main`
- Package/application version: `0.0.0` (`package.json`)

## Current accepted baseline
- Accepted branch: `main`
- Accepted HEAD SHA: `99b2518db056478a02ae79b4a12b2ac25c707993`
- Accepted date: 2026-08-25 (`main` commit date)
- Current phase/milestone: Phase 0 foundation hardening is complete and accepted; workflow adoption is being reconciled separately
- Last accepted PR / CI run: PR #1 was squash-merged according to the task context; CI run identifier was not verified locally

## Technology stack
- Languages: TypeScript
- Frameworks/runtime: React 19, Vite, Zustand
- Validation tools: TypeScript strict mode, Vitest, Playwright Chromium
- Package manager: npm with committed `package-lock.json`; deterministic install path is `npm ci`
- Supported CI runtimes: Node.js 20 and 22 (`.github/workflows/ci.yml`)

## Standard commands
### Install/bootstrap
```text
npm ci
```
### Fast validation
```text
npm run typecheck
npm run test
```
### Full validation
```text
npm run typecheck
npm run test
npm run test:e2e
npm run benchmark:pdf
```
### Build/package
```text
npm run build
```
### Local run
```text
npm run dev
```
### Combined check
```text
npm run check
```

## Architecture / invariants
- ZenPDF is a browser-only React/Vite application; document processing remains local in the browser.
- The current PDF runtime uses the legacy stringified `workerCode.ts` Blob worker until Issue #3.
- The current worker still loads PDF.js and pdf-lib from runtime CDNs; local typed worker migration is Issue #3 scope.
- Worker lifecycle, Object URL cleanup, page ordering, page dimensions, rotation, mixed PDF/PNG behavior, malformed-PDF recovery, and responsive large-document behavior are protected by the Phase 0 validation contract.
- Architecture direction is documented in `docs/ARCHITECTURE.md` and the Phase 1 packet; no server-side document upload/storage is part of the current privacy model.

## Protected behavior
Changes must not alter the following unless explicitly approved:
- Existing ZenPDF premium visual design and visual language.
- Warm palette, typography hierarchy, whitespace, rounded geometry, shadows, motion, upload-page composition, and information hierarchy.
- Local document processing and the current privacy boundary.
- PDF correctness: page count/order, source dimensions, rotation, mixed PDF/image output, and recoverable malformed-PDF behavior.
- Required regression validation and Phase 0 guardrails.
- Tailwind and Google Fonts runtime CDN removal must be handled separately and must not cause visual drift.
- Issue #3 / Phase 1 PDF-engine migration is the next objective but is outside this workflow-reconciliation change.

## Important paths
- Source: `App.tsx`, `components/`, `store.ts`, `types.ts`, `utils.ts`, `workerCode.ts`
- Tests: `tests/store.test.ts`, `tests/e2e/`, `tests/perf/`
- Documentation: `docs/ARCHITECTURE.md`, `docs/DESIGN_GUARDRAILS.md`, `docs/TEST_MATRIX.md`, `docs/SUPPORT_MATRIX.md`, `docs/PERFORMANCE_BASELINE.md`, `SECURITY.md`
- CI: `.github/workflows/ci.yml`
- Generated output: `dist/`, `test-results/` (local/CI-generated)
- Local-only / sensitive / licensed data: document contents are intended to remain in the browser; no committed sensitive data was identified

## Validation matrix
| Gate | Command / Method | Required |
|---|---|---|
| Unit / targeted | `npm run test` (Vitest store/lifecycle regression coverage) | Yes |
| Integration / regression | `npm run test:e2e` (Playwright Chromium real-PDF output and visual baseline coverage) | Yes when browser qualification is required |
| Browser/UI | Playwright Chromium visual baseline test | Yes for visual-sensitive changes |
| Build/package/runtime | `npm ci`, `npm run typecheck`, `npm run build` | Yes |
| Performance | `ZENPDF_PERF_PAGES=100 npm run benchmark:pdf` and `ZENPDF_PERF_PAGES=500 npm run benchmark:pdf` | Required by CI qualification |
| CI | `.github/workflows/ci.yml` | Yes |

## Execution characteristics
- Typical task ambiguity: Bounded modernization work should follow the repository’s implementation packet and test matrix.
- High-risk areas: PDF correctness, worker/session lifecycle, Object URL cleanup, privacy boundary, large-document performance, and visual drift.
- Modules safe to parallelize: Not established; preserve the project ownership boundaries in the execution contract.
- Modules tightly coupled / single-owner: PDF worker/store lifecycle and browser regression flows.
- Preferred local execution constraints: Keep document processing local, preserve the existing visual language, and run the required regression gates before claiming completion.

## Git / release policy
- Branch naming: Feature/workflow branches are used; exact naming policy is not otherwise documented in the repository.
- Commit policy: Preserve reviewable, scoped commits; exact policy is not otherwise documented.
- PR policy: Changes are reviewed through GitHub pull requests; do not merge workflow adoption automatically.
- Merge policy: `main` is the accepted baseline; exact merge settings are GitHub-side and not verified locally.
- Release policy: Not established in the repository.

## Current known limitations / risks
- The current PDF worker remains stringified/Blob-backed and runtime CDN-dependent until Issue #3.
- Tailwind and Google Fonts are still loaded at runtime; their removal is separately tracked and must preserve the protected visual baseline.
- The 500-page baseline identifies substantial current editor/grid scaling cost; performance optimization is not part of this reconciliation.
- Some Phase 1 test cases remain intentionally pending in `docs/TEST_MATRIX.md`.

## Current next objective
- Issue #3 / Phase 1 typed/local PDF worker migration, without redesigning ZenPDF or changing proven PDF behavior.
