# Project Profile

## Identity

- Project name: ZenPDF
- Repository: `https://github.com/bokoboss/ZenPDF`
- Authoritative local path: `C:\\MyRD\\ZenPDF`
- Primary branch: `main`
- Release target: `v1.0.0`
- Package/application version: `1.0.0`

## Release candidate baseline

- Accepted implementation main before release metadata: `1c482407a274a3c14f9afec2d7039c23c96290d2`
- Release-closure branch: `release/v1.0.0-closure`
- Release-closure tracking: Issue #18
- Umbrella modernization tracking: Issue #5
- Final release SHA: the commit tagged `v1.0.0` after release-closure acceptance

## Completed modernization

- Phase 0 — foundation, deterministic build/test/visual/performance baseline
- Phase 1A — typed local PDF module worker
- Phase 1B — lifecycle, cancellation, stale-response, and Object URL hardening
- Phase 1C — local UI runtime dependencies and protected visual baseline
- Phase 2A — editor render isolation
- Phase 2A2 — bounded expensive sortable/card activation for large documents
- Phase 2B — viewport-priority thumbnail scheduling with worker-wide concurrency limit
- Phase 3 — UX, accessibility, mobile/touch qualification, output position/provenance
- v1 blocker #19 — deterministic post-drag selection-clear correctness regression

## Technology stack

- TypeScript
- React 19
- Vite
- Zustand
- `pdfjs-dist@6.2.108`
- `pdf-lib@1.17.1`
- dnd-kit
- Tailwind CSS 3 build-time pipeline
- Vitest
- Playwright Chromium
- npm with committed `package-lock.json`

CI validates Node.js 20 and 22.

## Standard commands

```text
npm ci
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run benchmark:pdf
npm run check
```

## Architecture invariants

- Document processing remains local in the browser.
- PDF parsing, thumbnail rendering, merge/extract, and output generation run through the typed module-worker boundary.
- Worker requests/responses are session/task scoped; stale work cannot repopulate newer state.
- Browser Object URLs have explicit ownership and cleanup.
- `pageOrder` is the authoritative output-page sequence.
- Source page identity and output position remain distinct.
- The logical grid remains complete while expensive sortable/card work is windowed.
- Thumbnail scheduling is viewport-aware and worker-wide concurrency is capped at two.
- The protected ZenPDF visual language is not redesigned by infrastructure work.

## v1.0 release qualification

Required release gates:

- deterministic `npm ci`
- TypeScript typecheck
- unit/lifecycle tests
- production build
- Chromium PDF/output/E2E tests
- protected visual baseline
- narrow mobile 390×844 and 360×800 qualification
- runtime-network audit
- blank 100/500 performance
- vector/raster real-content scheduling qualification
- exact-head GitHub CI
- production deployment smoke

## Current known limitations

- Chromium is the qualified browser baseline; Firefox/WebKit are not fully qualified.
- Prolonged edge-triggered mouse-drag auto-scroll remains nondeterministic in browser automation.
- Raster-heavy PDF parse time can dominate before thumbnail scheduling starts.
- Reprioritization bounds normal stale in-flight thumbnail work rather than cancelling every render.
- No direct malformed-PDF retry; remove/re-add is the supported recovery path.
- No persistent workspace/session restore.
- No custom filename editor, shortcut-help UI, or complex touch range-selection mode.
- 1,000-page stress is targeted/manual rather than a routine release gate.

## Next objective

Complete Issue #18 release closure, verify the merged production deployment, tag the accepted release SHA as `v1.0.0`, publish release notes where tooling permits, and then close Issue #5.
