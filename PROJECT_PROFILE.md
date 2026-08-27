# Project Profile

## Identity
- Project name: ZenPDF
- Repository URL: `https://github.com/bokoboss/ZenPDF`
- Authoritative local path: `C:\MyRD\ZenPDF`
- Primary branch: `main`
- Package/application version: `0.0.0` (`package.json`)

## Current accepted baseline
- Accepted branch: `main`
- Accepted HEAD SHA: `d350b38ef347cf446ec3e28c04dac1db8a4b1aef`
- Accepted date: 2026-08-26 (`main` commit date)
- Current phase/milestone: Issue #3 / Phase 1A, Issue #4 / Phase 1B, and Issue #6 / Phase 1C are accepted; Issue #5 / Phase 2A large-document editor scalability is in progress
- Last accepted PR / CI run: PR #10 / CI run `32982880221`

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
- PDF parsing/thumbnails and output generation run in a Vite-bundled TypeScript module worker through `PdfWorkerClient`.
- `pdfjs-dist@6.2.108` and `pdf-lib@1.17.1` are pinned local application dependencies; document contents remain browser-local.
- Worker lifecycle, Object URL cleanup, page ordering, page dimensions, rotation, mixed PDF/PNG behavior, malformed-PDF recovery, and responsive large-document behavior are protected by the Phase 0 validation contract.
- Architecture direction is documented in `docs/ARCHITECTURE.md` and the Phase 1 packet; no server-side document upload/storage is part of the current privacy model.

## Protected behavior
Changes must not alter the following unless explicitly approved:
- Existing ZenPDF premium visual design and visual language.
- Warm palette, typography hierarchy, whitespace, rounded geometry, shadows, motion, upload-page composition, and information hierarchy.
- Local document processing and the current privacy boundary.
- PDF correctness: page count/order, source dimensions, rotation, mixed PDF/image output, and recoverable malformed-PDF behavior.
- Required regression validation and Phase 0 guardrails.
- Local UI runtime CSS/font dependency removal must preserve the accepted visual baseline.
- Issue #5 / Phase 2A is the current objective; Phase 2B thumbnail scheduling/priority and true bounded rendering remain separate.

## Important paths
- Source: `App.tsx`, `components/`, `store.ts`, `types.ts`, `utils.ts`, `src/pdf/`
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
- The Phase 1 PDF worker is Chromium-qualified; Firefox/WebKit qualification remains pending.
- The PDF.js worker module uses a local dynamic import/bootstrap suppression shim because `pdfjs-dist@6.2.108` auto-initializes against the host worker global.
- Tailwind CSS is build-time local and the tested production shell has no third-party UI/font runtime requests; full offline capability beyond the tested boundary is not claimed.
- The Phase 1C 500-page hosted baseline identifies substantial editor/grid scaling cost; Phase 2A is testing bounded editor/render amplification without redesigning the UI or introducing true virtualization.
- Some Phase 1 test cases remain intentionally pending in `docs/TEST_MATRIX.md`.

## Current next objective
- Qualify Issue #5 / Phase 2A on the hosted Linux runner, report the exact-head CI result, and leave thumbnail scheduling/priority and true virtualization for Phase 2B.
