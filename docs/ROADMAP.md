# ZenPDF Modernization Roadmap

This roadmap modernizes ZenPDF while preserving the established visual design.

## Phase 0 — Foundation and safety

Goal: make the current application easier to trust, build, review, and change without redesigning it.

- [x] Remove obsolete AI Studio / Gemini configuration
- [x] Replace scaffold README with project-specific documentation
- [x] Record visual design guardrails
- [ ] Add deterministic dependency lockfile
- [ ] Add TypeScript typecheck command
- [ ] Add build/typecheck CI
- [ ] Add a small fixture-based regression test harness
- [ ] Document the current supported/unsupported PDF matrix
- [ ] Record a verified visual baseline for desktop and mobile

Exit criteria:

- A clean checkout can be installed and built reproducibly.
- CI blocks changes that fail typecheck/build.
- The visual baseline is explicitly protected.

## Phase 1 — PDF engine hardening

Goal: keep document processing local while making worker behavior reliable and maintainable.

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

Exit criteria:

- Reset while processing cannot repopulate stale state.
- Worker failures are recoverable without refreshing the page.
- No PDF processing library is loaded from a runtime CDN.
- Blob/Object URL lifecycle is covered by tests.

## Phase 2 — Performance and large-document behavior

Goal: keep the current premium interaction quality when documents become large.

- [ ] Lazy/priority thumbnail generation
- [ ] Bounded thumbnail render queue
- [ ] Cancel off-session thumbnail work
- [ ] Page-grid virtualization or equivalent rendering strategy
- [ ] Avoid repeated O(n) lookups in hot page operations
- [ ] Define performance fixtures (100 / 500 / 1,000 pages)
- [ ] Add progress reporting for long operations

Exit criteria:

- A large document does not freeze the primary UI thread.
- Thumbnail work prioritizes visible/near-visible pages.
- Long operations provide useful progress and cancellation behavior.

## Phase 3 — UX hardening without visual redesign

Goal: improve usability while preserving the existing ZenPDF visual language.

- [ ] Improve touch interactions where hover is currently required
- [ ] Improve keyboard and focus behavior
- [ ] Clarify output-page position versus original source page number
- [ ] Add document/page provenance where useful
- [ ] Add per-file error/retry states
- [ ] Review destructive-action confirmations
- [ ] Review mobile toolbar density and reachability
- [ ] Evaluate whether the 3-step flow should evolve into a persistent workspace

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
