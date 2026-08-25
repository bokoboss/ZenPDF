# Phase 1 Implementation Packet — Local Typed PDF Engine

## Purpose

This packet is the authoritative execution contract for the Phase 1 PDF-engine modernization.

The implementation goal is narrow:

> Replace the current runtime-CDN/string-worker PDF engine with a locally bundled, typed, recoverable worker architecture **without changing ZenPDF's visual design or proven PDF behavior**.

This is an implementation/refactor phase, not a product redesign and not a feature-expansion phase.

Read first:

- `AGENTS.md`
- `docs/DESIGN_GUARDRAILS.md`
- `docs/ARCHITECTURE.md`
- `docs/TEST_MATRIX.md`
- `docs/SUPPORT_MATRIX.md`

## Frozen product invariants

The following are acceptance-level invariants. Phase 1 must not intentionally change them.

1. Documents are processed locally in the browser.
2. No user document is uploaded to an application server.
3. PDF/JPG/PNG import remains supported.
4. Quick Merge preserves file order.
5. Page Editor preserves explicit page order.
6. Extract preserves selected-page order.
7. Existing source-page rotation is preserved.
8. Editor rotation is additive to source-page rotation.
9. Mixed image/PDF merge remains supported.
10. PDF output preserves source page dimensions unless the existing image conversion behavior requires image-native page dimensions.
11. Thai/non-ASCII filenames remain usable.
12. Reset cannot allow stale worker results to repopulate state.
13. Removing a file cannot allow late parse/thumbnail responses to restore it.
14. Generated Blob/Object URLs are revoked when replaced or invalidated.
15. The current ZenPDF visual language remains unchanged except for a narrowly justified error/recovery state if required.

## Dependency decisions

### `pdf-lib`

Target: `pdf-lib@1.17.1`.

Rationale:

- This is still the latest release of the primary Hopding/pdf-lib upstream.
- ZenPDF already uses 1.17.1 in the runtime worker.
- Changing the package or moving to a fork would create unnecessary behavioral risk during an infrastructure migration.

Decision: **localize, do not substitute**.

### `pdfjs-dist`

Target candidate: `pdfjs-dist@6.2.108`.

Current ZenPDF runtime version: PDF.js `3.11.174`.

Rationale:

- 6.2.108 is the current stable npm package at preparation time.
- The version gap is large and must be treated as a migration, not a routine patch upgrade.
- PDF.js publishes modern and legacy distributions. ZenPDF should initially favor compatibility and correctness over minimum bundle size.

Implementation rule:

- Start with the current stable `pdfjs-dist` package.
- Prefer a locally bundled distribution compatible with the browser support target.
- If the modern build causes a verified Safari/compatibility regression, use the package's `legacy` distribution rather than weakening the application architecture.
- Do not fetch PDF.js or its worker from a runtime CDN.

Reference points used while preparing this packet:

- Vite Web Workers: https://vite.dev/guide/features.html#web-workers
- PDF.js support FAQ: https://github.com/mozilla/pdf.js/wiki/Frequently-Asked-Questions
- PDF.js npm package: https://www.npmjs.com/package/pdfjs-dist
- pdf-lib releases: https://github.com/Hopding/pdf-lib/releases

## Target source layout

Use this logical structure unless a small variation clearly improves type boundaries:

```text
src/
  pdf/
    protocol.ts
    workerClient.ts
    worker.ts
    errors.ts
    resources.ts
    operations/
      parse.ts
      thumbnails.ts
      merge.ts
      extract.ts
```

The existing `workerCode.ts` should be removed after the new implementation passes all gates.

`store.ts` should own UI/application state, not PDF-library integration details.

## Worker construction

Use Vite's recommended module-worker pattern:

```ts
new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
});
```

Do not:

- generate the worker from a source-code string,
- create the application worker with a Blob URL,
- call `importScripts()` for runtime dependencies,
- fetch `pdf-lib` or PDF.js from jsDelivr/cdnjs/unpkg/esm.sh,
- inject DOM/window compatibility shims into the main application merely to satisfy the old worker design.

## PDF.js inside the ZenPDF worker

ZenPDF currently performs parse/thumbnail work inside its own worker so thumbnail rendering does not occupy the UI thread.

Preserve that architectural property in Phase 1.

The implementation may use the locally bundled PDF.js worker/fake-worker mechanism that is compatible with running the display layer inside ZenPDF's worker, but it must satisfy these observable requirements:

- PDF parsing/thumbnail loops do not move back to the React/UI thread.
- No remote PDF.js worker is fetched.
- No dependence on an undefined browser `window` inside the ZenPDF worker.
- Chromium browser regression tests pass before the old worker is removed.
- Add a focused integration test that proves a real PDF can be parsed and a thumbnail can be produced through the new worker boundary.

Do not optimize this integration prematurely. Correct local operation is Phase 1; thumbnail scheduling/virtualization is Phase 2.

## Typed protocol

All worker requests and responses must use discriminated unions.

Minimum request envelope:

```ts
interface WorkerRequestEnvelope<TType extends string, TPayload> {
  type: TType;
  sessionId: string;
  taskId: string;
  payload: TPayload;
}
```

Minimum response envelope:

```ts
interface WorkerResponseEnvelope<TType extends string, TPayload> {
  type: TType;
  sessionId: string;
  taskId: string;
  payload: TPayload;
}
```

Expected request types:

- `PARSE_FILE`
- `MERGE_FILES`
- `MERGE_PAGES`
- `EXTRACT_PAGES`
- `CANCEL_TASK`
- `DISPOSE_SESSION`

Expected response types:

- `FILE_PARSED`
- `THUMBNAIL_GENERATED`
- `TASK_PROGRESS`
- `OUTPUT_READY`
- `TASK_CANCELLED`
- `TASK_ERROR`

Names may vary slightly if the final union is clearer, but the semantics must remain explicit.

## Session semantics

A session represents the current editor lifetime between full resets.

Rules:

1. A new session ID is created when the PDF engine/store initializes.
2. `Start Over` disposes the old session and starts a new session.
3. Responses whose `sessionId` does not equal the active session are ignored.
4. Any Blob/Object URL contained in an ignored stale response must still be revoked/cleaned.
5. Worker restart after fatal error starts a new session.

## Task semantics

A task represents one parse, merge, extract, or other bounded operation.

Rules:

1. Every dispatched operation gets a unique `taskId`.
2. The store/client tracks which tasks are active.
3. A stale output from an older save/extract task cannot replace a newer output.
4. Duplicate save/extract dispatch remains guarded.
5. Cancelled tasks must not emit an accepted final output.
6. Cancellation is best-effort for library calls that cannot be interrupted mid-call, but late results must be rejected deterministically.

## Error taxonomy

Create typed/domain errors rather than passing arbitrary library strings directly to UI state.

Minimum error codes:

- `INVALID_PDF`
- `PASSWORD_REQUIRED`
- `UNSUPPORTED_ENCRYPTION`
- `UNSUPPORTED_FILE_TYPE`
- `IMAGE_DECODE_FAILED`
- `PDF_PARSE_FAILED`
- `PDF_RENDER_FAILED`
- `PDF_WRITE_FAILED`
- `WORKER_INITIALIZATION_FAILED`
- `WORKER_RUNTIME_FAILED`
- `TASK_CANCELLED`
- `OUT_OF_MEMORY_OR_RESOURCE_LIMIT`
- `UNKNOWN`

Each error should retain a developer-oriented cause/message internally while exposing a stable code and safe user-facing message.

Do not promise password support in Phase 1. Password-protected documents may be detected and reported cleanly without being opened.

## Resource ownership

Create one explicit resource owner/registry for Object URLs created by the client/worker boundary.

Ownership rules:

- Thumbnail URL belongs to its file/page record.
- Merged output URL belongs to the current save result.
- Extracted output URL belongs to the current extraction result.
- Replacing an owned URL revokes the previous URL first.
- Removing a file revokes all thumbnail URLs owned by that file.
- Reset/dispose revokes every URL owned by the session.
- Stale responses carrying URLs are revoked immediately.

Avoid scattered `URL.revokeObjectURL` calls where ownership cannot be audited.

## Migration sequence

Implement in this order. Do not combine unrelated product changes into these steps.

### Step 1 — Add local dependencies

- Add `pdf-lib@1.17.1` as an application dependency.
- Add the selected `pdfjs-dist` version as an application dependency.
- Update lockfile with `npm install` once.
- Keep old worker operational until new worker integration passes isolated tests.

### Step 2 — Add protocol + worker client

- Add typed protocol.
- Add task/session ID generation.
- Add worker-client lifecycle wrapper.
- Unit-test message acceptance/rejection without changing visible UI.

### Step 3 — Implement parse + thumbnail in module worker

- Parse PDF.
- Parse image as a single page.
- Generate thumbnails off the UI thread.
- Match current page-count and thumbnail behavior.
- Run real-browser fixtures.

### Step 4 — Implement merge/extract

- Port PDF Quick Merge.
- Port page-specific merge.
- Port extraction.
- Preserve source rotation + additive editor rotation.
- Preserve mixed PDF/image behavior.

### Step 5 — Wire store to worker client

- Replace direct worker message construction in `store.ts`.
- Keep store action API stable where practical so components do not need broad rewrites.
- Preserve existing visual state transitions.

### Step 6 — Remove old runtime worker

Only after all acceptance gates pass:

- delete `workerCode.ts`,
- remove PDF-library runtime CDN references,
- remove obsolete worker compatibility shims,
- update architecture/security documentation.

## Required tests before removal of old worker

All existing tests must remain green, plus targeted Phase 1 coverage.

### Deterministic checks

```bash
npm ci
npm run typecheck
npm run test
npm run build
npm run test:e2e
```

### Browser/output invariants

Must continue to verify:

- PDF + PDF Quick Merge order/dimensions
- mixed PNG/PDF merge
- Thai filename import/generation
- editor rotation
- additive source + editor rotation
- selected-page extraction
- malformed PDF recoverability
- no unexpected browser console errors

### Lifecycle tests

Must verify:

- reset during parsing
- reset during output generation
- remove file during parsing
- stale session response
- stale task output
- cancellation response
- worker fatal error + restart
- URL cleanup for accepted and rejected/stale outputs

## Browser qualification

Phase 1 minimum gate:

- Chromium desktop regression suite.

Before declaring broader browser support, add at least:

- Firefox current desktop,
- WebKit/Safari-compatible Playwright coverage where practical.

Do not claim untested browser compatibility in documentation.

## Performance non-regression rule

Phase 1 is not the performance-optimization phase, but it must not cause an obvious regression.

Compare against the recorded Phase 0 performance baseline for:

- parse/page-count readiness,
- editor readiness,
- all-thumbnail readiness,
- browser console errors.

A material regression must be explained before merge. Do not hide a regression by simply raising timeouts.

## Visual non-regression rule

Phase 1 should be visually neutral.

The CI visual baseline exists to support review. If screenshots change unexpectedly, treat that as a defect unless a visible change was explicitly required and approved.

Do not change:

- palette,
- typography,
- spacing system,
- radii,
- shadows,
- layout concept,
- upload-page treatment,
- icon language,
- interaction motion.

## Scope exclusions

Do not add in Phase 1:

- OCR,
- compression,
- crop,
- annotations,
- full text editing,
- page numbering,
- watermarking,
- account/cloud storage,
- AI document features,
- new design system/component library,
- workspace redesign,
- large-document virtualization.

Those belong to later phases.

## Definition of done

Phase 1 is complete only when all statements below are true:

- [ ] no PDF processing dependency is fetched from a runtime CDN
- [ ] no stringified Blob worker remains
- [ ] PDF worker code is TypeScript and typechecked
- [ ] protocol is typed and session/task aware
- [ ] stale worker responses cannot mutate active state
- [ ] lifecycle/URL ownership tests pass
- [ ] PDF output regression suite passes
- [ ] malformed/password-protected inputs fail recoverably
- [ ] deterministic Node 20/22 checks pass (or the CI matrix is intentionally updated with documented rationale)
- [ ] Chromium browser qualification passes
- [ ] performance baseline shows no unexplained material regression
- [ ] visual baseline shows no unintended redesign
- [ ] architecture/security/support documentation is updated

## Execution-model guidance

This packet intentionally converts Phase 1 into a bounded implementation task.

Preferred execution approach:

- use the least expensive coding model that can reliably complete the packet,
- start with a strong Luna execution setting for the implementation loop,
- escalate only if the worker/PDF.js integration produces architecture-level blockers that cannot be resolved from the packet and test evidence.

The coding agent should implement and validate; it should not reopen product/design decisions already fixed here.
