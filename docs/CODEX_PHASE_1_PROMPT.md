# Codex Execution Prompt — ZenPDF Phase 1

Use this prompt after the Phase 0 foundation PR is accepted/merged or from a clean branch based on that accepted head.

---

Work on the ZenPDF repository.

Authoritative repository:
`https://github.com/bokoboss/ZenPDF`

Your task is **Issue #3 / Phase 1A only**: migrate the PDF engine from the current stringified runtime-CDN worker to the locally bundled typed worker architecture already specified in the repository.

## Read before changing code

Treat these files as authoritative requirements, in this order:

1. `AGENTS.md`
2. `docs/PHASE_1_IMPLEMENTATION_PACKET.md`
3. `docs/DESIGN_GUARDRAILS.md`
4. `docs/TEST_MATRIX.md`
5. `docs/SUPPORT_MATRIX.md`
6. `docs/PERFORMANCE_BASELINE.md`
7. `docs/ARCHITECTURE.md`
8. GitHub Issue #3

Do not reopen design/product decisions already fixed by those documents.

## Core objective

Replace the current `workerCode.ts` string/Blob worker and runtime CDN PDF dependencies with:

- local `pdf-lib@1.17.1`,
- the specified current stable `pdfjs-dist` migration target,
- a TypeScript module worker,
- typed request/response contracts,
- explicit session/task lifecycle handling,
- centralized Object URL/resource ownership,
- typed recoverable errors.

Preserve current PDF behavior and UI.

## Absolute design constraint

**Do not redesign ZenPDF.**

Do not change the current palette, typography, spacing, rounded geometry, shadows, upload-page composition, layout language, icons, or motion unless a tiny visible change is strictly necessary for a Phase 1 recoverable error state.

If no visible change is required, Phase 1 should be visually neutral.

## Required migration sequence

Follow the migration order in `docs/PHASE_1_IMPLEMENTATION_PACKET.md`.

Do not delete `workerCode.ts` until the replacement has passed the isolated and browser regression gates.

Do not combine Phase 1 with:

- performance virtualization,
- new PDF features,
- workspace redesign,
- OCR,
- crop/compression/watermark,
- unrelated dependency or component-library changes.

## Existing behavior that must remain green

At minimum preserve and run tests covering:

- PDF/PDF Quick Merge order and source dimensions,
- mixed PNG/PDF merge,
- Thai/non-ASCII filename handling,
- editor rotation,
- additive source-page + editor rotation,
- selected-page extraction,
- malformed PDF recoverability,
- stale-response/reset/file-removal lifecycle behavior,
- Object URL cleanup,
- visual baseline.

## Required validation

Run the repository-prescribed validation, including at minimum:

```bash
npm ci
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

Run the performance baseline before and after the migration using the existing harness. A material slowdown must be investigated and explained; do not hide it by only increasing timeouts.

## Work discipline

- Work in an isolated branch/worktree based on the accepted Phase 0 head.
- Keep commits logically scoped.
- Inspect existing tests before changing behavior.
- Prefer compatibility-preserving adapters over broad component rewrites.
- Use test evidence to decide migration details.
- If PDF.js integration produces an unexpected browser-specific constraint, document the evidence and choose the smallest compatible architecture that still meets the implementation packet.

## Completion report

When done, report:

1. branch and final commit SHA,
2. exact dependency versions,
3. old files removed/new files added,
4. worker/protocol architecture implemented,
5. session/task/error/resource lifecycle behavior,
6. deterministic test counts/results,
7. browser E2E result,
8. before/after performance baseline,
9. visual-regression result,
10. remaining limitations,
11. PR/issue status.

Do not claim Phase 1 complete if any required gate is failing or if PDF processing still depends on a runtime CDN.

---

## Suggested model policy

This is intentionally a bounded execution packet. Start with a strong Luna execution setting (for example Luna Max) and escalate only if evidence shows a genuine architecture-level blocker that cannot be resolved from the repository specification and tests.
