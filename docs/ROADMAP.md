# ZenPDF Modernization Roadmap

This roadmap modernizes ZenPDF while preserving the established visual design.

## Phase 0 — Foundation and safety

Goal: make the current application easier to trust, build, review, and change without redesigning it.

- [x] Remove obsolete AI Studio / Gemini configuration
- [x] Replace scaffold README with project-specific documentation
- [x] Record visual design guardrails
- [x] Add deterministic dependency lockfile
- [x] Add TypeScript typecheck command
- [x] Add build/typecheck/test CI on Node 20 and 22
- [x] Add store lifecycle regression test harness
- [x] Add fixture-generated real PDF output regression harness
- [x] Document the current supported/unsupported PDF matrix
- [x] Record visual baselines for representative desktop and mobile states
- [x] Record 100-page and 500-page performance baselines
- [x] Audit UX/accessibility without redesigning the product
- [x] Prepare a bounded Phase 1 architecture/execution packet
- [x] Prepare a ready-to-use Codex Phase 1 prompt

Phase 0 is considered **foundation-complete** once its final PR qualification is green. Password/encrypted-document classification remains intentionally assigned to the Phase 1 typed-error migration rather than adding throwaway infrastructure to the old worker.

Exit criteria:

- A clean checkout can be installed and built reproducibly.
- CI blocks changes that fail typecheck/test/build.
- Real generated PDFs are downloaded and reparsed in browser regression tests.
- The visual baseline is explicitly protected and captured in CI.
- Large-document behavior has a repeatable before-change benchmark.
- The next implementation phase is bounded by an explicit architecture and acceptance contract.

## Phase 1 — PDF engine hardening

Goal: keep document processing local while making worker behavior reliable and maintainable.

Authoritative execution contract: `docs/PHASE_1_IMPLEMENTATION_PACKET.md`.

- [ ] Replace stringified Blob worker with a typed module worker
- [ ] Bundle `pdf-lib` and PDF.js as local dependencies
- [ ] Remove runtime PDF-library CDN dependencies
- [ ] Define typed worker request/response protocol
- [ ] Add `taskId` and `sessionId`
- [ ] Ignore stale worker responses after reset/session changes
- [ ] Add cancellation/worker restart behavior
- [ ] Centralize Object URL creation and revocation
- [ ] Add explicit file and task error states
- [ ] Handle encrypted, malformed, and unsupported documents gracefully

Interim hardening already in the Phase 0 branch terminates/reinitializes the worker on full reset, suppresses removed-file parse/thumbnail responses, and revokes known thumbnail/generated-output Object URLs. These protections reduce current risk but do not replace the planned typed task/session protocol.

Exit criteria:

- Reset while processing cannot repopulate stale state.
- Worker failures are recoverable without refreshing the page.
- No PDF processing library is loaded from a runtime CDN.
- Blob/Object URL lifecycle is covered by tests.
- Current PDF output regression behavior remains green.
- Phase 0 performance baseline shows no unexplained material regression.
- Visual baseline shows no unintended redesign.

## Phase 2 — Performance and large-document behavior

Goal: keep the current premium interaction quality when documents become large.

Phase 0 evidence: a blank 500-page synthetic PDF reaches page-count recognition quickly but the current full editor grid requires roughly 20.7 seconds to instantiate on the recorded CI runner. See `docs/PERFORMANCE_BASELINE.md`.

- [ ] Lazy/priority thumbnail generation
- [ ] Bounded thumbnail render queue
- [ ] Cancel off-session thumbnail work
- [ ] Page-grid virtualization or equivalent bounded rendering strategy
- [ ] Reduce sortable/DnD work for off-screen pages
- [ ] Avoid repeated O(n) lookups in hot page operations
- [x] Define repeatable 100-page and 500-page performance fixtures
- [ ] Qualify the 1,000-page stress case
- [ ] Add progress reporting for long operations

Exit criteria:

- A large document does not freeze the primary UI thread.
- Useful visible pages become interactive substantially earlier than the Phase 0 baseline.
- Thumbnail work prioritizes visible/near-visible pages.
- Long operations provide useful progress and cancellation behavior.
- Performance improvements are demonstrated against the same benchmark.

## Phase 3 — UX hardening without visual redesign

Goal: improve usability while preserving the existing ZenPDF visual language.

Audit reference: `docs/UX_AUDIT_NO_REDESIGN.md`.

- [ ] Qualify/improve touch interactions where hover is currently relevant
- [ ] Complete keyboard and focus behavior review
- [ ] Clarify output-page position versus original source page number
- [ ] Add document/page provenance where useful
- [ ] Add per-file error/retry states using Phase 1 typed errors
- [ ] Review destructive-action confidence/undo behavior
- [ ] Review mobile toolbar density and reachability
- [ ] Improve same-file re-selection in the Editor-stage file input
- [ ] Complete accessible names for icon-only editor controls
- [ ] Evaluate whether the 3-step flow should ever evolve into a persistent workspace

Phase 0 already exposes per-page actions on keyboard focus and adds accessible labels/focus treatment without changing established styling. A full keyboard/touch review remains outstanding.

Important: a unified workspace may be explored, but only if it can retain the established premium, calm design. This is a UX decision, not a mandate to redesign the app.

## Phase 4 — Focused professional tools

Add capabilities that strengthen the core organizing workflow rather than turning ZenPDF into an all-purpose Acrobat replacement.

Candidate features:

- [ ] Duplicate page
- [ ] Insert blank page
- [ ] Split by page/range
- [ ] Extract page ranges
- [ ] Reverse page order
- [ ] Move selection to beginning/end
- [ ] Page numbering
- [ ] Crop pages
- [ ] Normalize page sizes
- [ ] PDF metadata
- [ ] Watermark
- [ ] Password protection
- [ ] Better image-to-PDF controls

## Explicit non-goals for the near term

Unless requirements change, do not prioritize:

- Full PDF text editing
- Full annotation suite
- Digital-signature platform
- Server-side document storage
- Account system
- AI features that require uploading document contents
- A large catalogue of loosely related PDF micro-tools

## Product principle

ZenPDF should remain recognizable as:

> A calm, fast, privacy-first PDF workspace.

The modernization should make the application more trustworthy and capable without making it noisier.
