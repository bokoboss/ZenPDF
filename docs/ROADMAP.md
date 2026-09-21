# ZenPDF Modernization Roadmap

ZenPDF v1.0 modernization is implementation-complete. The remaining release work is validation, versioning, production sign-off, and tagging.

## Completed for v1.0

### Phase 0 — Foundation and safety

- [x] Remove obsolete Gemini/API-key scaffold
- [x] Deterministic lockfile and CI
- [x] Typecheck, unit, browser, visual, and performance harnesses
- [x] Design guardrails and support/test documentation
- [x] 100-page and 500-page performance baselines

### Phase 1 — PDF engine hardening

- [x] Typed Vite module worker
- [x] Local pinned PDF.js and pdf-lib dependencies
- [x] Session/task-scoped worker protocol
- [x] Stale-response rejection
- [x] Cancellation, restart, and reset lifecycle
- [x] Centralized Object URL ownership/cleanup
- [x] Stable typed PDF error taxonomy
- [x] Recoverable malformed/protected-document handling

### Phase 2 — Large-document performance

- [x] Isolate thumbnail updates from editor-wide page-order churn
- [x] Narrow Zustand subscriptions and hot-path membership lookups
- [x] Preserve full logical grid while windowing expensive sortable/card work
- [x] Qualify mouse, touch, keyboard, group, and far-range DnD with windowing
- [x] Viewport/overscan thumbnail priority
- [x] Worker-wide bounded thumbnail queue (maximum two renders)
- [x] Session/task cancellation and cleanup while thumbnail work is active
- [x] Blank 100/500 benchmark qualification
- [x] Text/vector-heavy and raster/scanned-like scheduling qualification

The 1,000-page case remains a targeted/manual stress case rather than a routine v1 release gate. Rich long-operation progress UI is also deferred because current release gates are met without adding interface density.

### Phase 3 — UX/accessibility/information finishing

- [x] Keyboard-operable upload and navigation controls
- [x] Explicit accessible names and visible focus treatment
- [x] Touch/narrow-editor qualification at 390×844 and 360×800
- [x] Selected-count status
- [x] Output-position numbering and conditional source provenance
- [x] Recoverable per-file error state
- [x] Toast status/alert semantics
- [x] Start Over modal focus trapping/Escape/focus restoration
- [x] Per-page delete focus persistence
- [x] Same-file re-selection
- [x] Deterministic post-drag selection-clear correctness regression

## v1.0 release closure

- [x] Implementation phases accepted
- [x] Release-blocking DnD/selection correctness defect fixed
- [ ] Release metadata/docs PR exact-head CI
- [ ] Production deployment smoke
- [ ] Tag accepted release SHA as `v1.0.0`
- [ ] Publish GitHub Release if available
- [ ] Close Issue #18 and umbrella Issue #5

## Deferred post-v1 / future

Potential work must remain separately scoped and must preserve ZenPDF's focused product identity.

- 1,000-page routine qualification
- richer long-operation progress/cancellation UI
- persistent workspace/session restoration
- custom output filename editing
- shortcut discoverability/help
- complex touch range selection
- direct malformed-file Retry action
- Firefox/WebKit release qualification
- duplicate/blank-page/range utilities
- crop/normalize page sizes
- metadata/watermark/password features
- improved image-to-PDF controls

## Explicit non-goals

Unless requirements change, do not turn ZenPDF into:

- a full PDF text editor
- a full annotation/signature suite
- a server-side document store
- an account platform
- an OCR/cloud-processing product
- a catalogue of unrelated PDF micro-tools

## Product principle

> A calm, fast, privacy-first PDF workspace.

Technical hardening should make ZenPDF more trustworthy without making it noisier.
