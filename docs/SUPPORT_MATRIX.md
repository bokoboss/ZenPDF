# ZenPDF Support Matrix

This document records the behavior that is supported by the current implementation and distinguishes it from planned capabilities. It is intentionally conservative: a format or workflow is not called supported unless the current code path handles it explicitly or automated browser verification covers it.

## Input formats

| Input | Current status | Notes |
|---|---|---|
| PDF | Supported | Parsed with PDF.js; merged/output with pdf-lib. |
| JPEG / JPG | Supported | Imported as a one-page image document and can be merged into PDF output. |
| PNG | Supported | Imported as a one-page image document and can be merged into PDF output; mixed PNG/PDF output is browser-regression tested. |
| WebP | Not supported | Not accepted by the current file inputs/worker image path. |
| GIF | Not supported | Not accepted by the current file inputs/worker image path. |
| TIFF | Not supported | Not accepted by the current file inputs/worker image path. |
| Office documents | Not supported | DOCX/XLSX/PPTX conversion is outside the current product scope. |

## PDF workflows

| Capability | Current status | Verification |
|---|---|---|
| Merge multiple PDF files | Supported | Chromium E2E verifies output page count/order and source page dimensions. |
| Merge PDF + PNG | Supported | Chromium E2E verifies mixed PNG/PDF output page count and dimensions. |
| Merge PDF + JPEG | Supported by implementation | Same worker path as PNG with JPEG embedding; dedicated mixed JPEG browser fixture remains desirable. |
| Reorder files before quick merge | Supported | Store/DnD path exists; dedicated browser drag regression is still desirable. |
| Open page editor | Supported | Browser E2E exercises the editor. |
| Reorder pages | Supported | Store behavior implemented; dedicated output-order browser drag test remains desirable. |
| Multi-select pages | Supported | Current editor behavior. |
| Shift-select a page range | Supported on desktop pointer/keyboard workflow | Touch equivalent should be reviewed separately. |
| Move selected pages as a group | Supported | Store/DnD path exists. |
| Rotate individual pages | Supported | Chromium E2E verifies generated PDF rotation. |
| Preserve source rotation + add editor rotation | Supported | Chromium E2E verifies 90° source rotation + 90° editor rotation produces 180°. |
| Rotate selected pages | Supported | Implemented in page editor. |
| Delete pages | Supported | Implemented with undo/redo history. |
| Extract selected pages | Supported | Chromium E2E verifies only selected pages are emitted. |
| Undo/redo page edits | Supported | Store regression coverage exists. |
| Add files while in editor | Supported | New pages are appended when parsing completes. |
| Download generated PDF | Supported | Browser E2E downloads and reparses generated files. |
| Thai/non-ASCII source filename | Supported for import/generation | Chromium E2E imports `เอกสารทดสอบ-01.pdf` and generates a valid output. |

## Document characteristics

| Characteristic | Current status | Notes |
|---|---|---|
| Portrait pages | Supported | Normal PDF path. |
| Landscape pages | Supported | Current PDF path preserves source dimensions. |
| Mixed page sizes | Supported | Automated browser fixture verifies distinct dimensions across merged files. |
| Source page rotation | Supported | Dedicated browser regression verifies source rotation is preserved and editor rotation is additive. |
| Added 90° page rotation | Supported | Browser E2E verified. |
| 100-page blank synthetic PDF | Performance-qualified baseline | Phase 0 CI: parse 368 ms; editor ready 811 ms; all thumbnails 2,229 ms on the recorded hosted-runner environment. |
| 500-page blank synthetic PDF | Functionally qualified, performance concern identified | Phase 0 CI: parse 876 ms; editor ready 20,697 ms; all thumbnails 20,731 ms. Full-grid/editor construction is a major Phase 2 hypothesis. |
| 1,000-page PDFs | Not routinely qualified | Targeted stress case; not part of every PR. |
| Very large file sizes | Browser/memory dependent; no explicit guarantee | No application-level file size ceiling is currently enforced. |

Performance values are reference measurements from one GitHub-hosted runner class, not universal guarantees. See `docs/PERFORMANCE_BASELINE.md`.

## Passwords, encryption, and malformed PDFs

| Case | Current status | Notes |
|---|---|---|
| Password-protected/encrypted PDF | Recoverable rejection; not supported as a user workflow | The typed worker classifies password/encryption errors. No password prompt/decryption workflow exists. |
| Add password protection | Not supported | Candidate Phase 4 feature. |
| Remove password with known password | Not supported | No password workflow exists. |
| Corrupt/malformed PDF | Recoverable at application level | Chromium E2E verifies an invalid PDF produces a typed error while Documents/Add File remain usable. |

## Privacy / connectivity

| Property | Current status | Notes |
|---|---|---|
| Document processing on application server | Not used | Core document processing occurs in the browser. |
| Document upload required | No | The application does not require an app-server upload for current PDF operations. |
| Fully offline/self-contained runtime | Not yet | PDF.js and pdf-lib are bundled locally in the Phase 1 worker. Tailwind and Google Fonts still have runtime CDN dependencies. |
| API key required | No | Obsolete Gemini/API-key scaffold has been removed. |

## Browsers

Current automated browser qualification is Chromium-based. Other modern browsers may work, but Firefox/Safari are not yet part of the release matrix. This matters particularly for `OffscreenCanvas`, Web Worker behavior, Blob/Object URL lifecycle, drag-and-drop, and large-document performance.

## Current automated qualification

The Phase 1 branch currently validates:

- deterministic `npm ci`
- strict TypeScript
- Zustand/store lifecycle regression tests
- production Vite build
- Chromium launch of the production preview
- real PDF quick merge output
- output page dimensions/order
- mixed PNG/PDF output
- Thai/non-ASCII filename workflow
- source + editor rotation composition
- real selected-page extraction output
- malformed-PDF recoverability
- typed worker session/task isolation, cancellation, restart, and resource cleanup
- actionable browser console errors during supported flows
- desktop/mobile visual baseline screenshots captured as a CI artifact
- repeatable 100-page and 500-page performance baseline artifacts

See `docs/TEST_MATRIX.md` for the broader target matrix and `docs/ROADMAP.md` for planned hardening.
