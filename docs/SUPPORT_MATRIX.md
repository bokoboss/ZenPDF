# ZenPDF Support Matrix

This document records the behavior that is supported by the current implementation and distinguishes it from planned capabilities. It is intentionally conservative: a format or workflow is not called supported unless the current code path handles it explicitly or automated browser verification covers it.

## Input formats

| Input | Current status | Notes |
|---|---|---|
| PDF | Supported | Parsed with PDF.js; merged/output with pdf-lib. |
| JPEG / JPG | Supported | Imported as a one-page image document and can be merged into PDF output. |
| PNG | Supported | Imported as a one-page image document and can be merged into PDF output. |
| WebP | Not supported | Not accepted by the current file inputs/worker image path. |
| GIF | Not supported | Not accepted by the current file inputs/worker image path. |
| TIFF | Not supported | Not accepted by the current file inputs/worker image path. |
| Office documents | Not supported | DOCX/XLSX/PPTX conversion is outside the current product scope. |

## PDF workflows

| Capability | Current status | Verification |
|---|---|---|
| Merge multiple PDF files | Supported | Chromium E2E verifies output page count/order and source page dimensions. |
| Merge PDF + JPEG/PNG | Supported by implementation | Browser fixture coverage should be expanded for mixed-format output. |
| Reorder files before quick merge | Supported | Store/DnD path exists; dedicated browser drag regression is still desirable. |
| Open page editor | Supported | Browser E2E exercises the editor. |
| Reorder pages | Supported | Store behavior implemented; dedicated output-order browser drag test remains desirable. |
| Multi-select pages | Supported | Current editor behavior. |
| Shift-select a page range | Supported on desktop pointer/keyboard workflow | Touch equivalent should be reviewed separately. |
| Move selected pages as a group | Supported | Store/DnD path exists. |
| Rotate individual pages | Supported | Chromium E2E verifies generated PDF rotation. |
| Rotate selected pages | Supported | Implemented in page editor. |
| Delete pages | Supported | Implemented with undo/redo history. |
| Extract selected pages | Supported | Chromium E2E verifies only selected pages are emitted. |
| Undo/redo page edits | Supported | Store regression coverage exists. |
| Add files while in editor | Supported | New pages are appended when parsing completes. |
| Download generated PDF | Supported | Browser E2E downloads and reparses generated files. |

## Document characteristics

| Characteristic | Current status | Notes |
|---|---|---|
| Portrait pages | Supported | Normal PDF path. |
| Landscape pages | Supported | Current PDF path preserves source dimensions. |
| Mixed page sizes | Supported by merge engine | Automated browser fixture verifies distinct dimensions across merged files. |
| Source page rotation | Expected to be preserved | pdf-lib copied-page behavior; dedicated regression fixture remains desirable. |
| Added 90° page rotation | Supported | Browser E2E verified. |
| Very large page counts | Functionally possible, not performance-qualified | Current implementation renders thumbnails for all pages and mounts the full editor grid. Phase 2 addresses this. |
| Very large file sizes | Browser/memory dependent; no explicit guarantee | No application-level file size ceiling is currently enforced. |

## Passwords, encryption, and malformed PDFs

| Case | Current status | Notes |
|---|---|---|
| Password-protected/encrypted PDF | Not supported as a user workflow | No password prompt or decryption flow exists. The file may fail during parsing/loading. |
| Add password protection | Not supported | Candidate Phase 4 feature. |
| Remove password with known password | Not supported | No password workflow exists. |
| Corrupt/malformed PDF | Error path exists, recovery UX incomplete | Worker errors are surfaced via toast/busy-state reset, but per-file recovery needs further hardening. |

## Privacy / connectivity

| Property | Current status | Notes |
|---|---|---|
| Document processing on application server | Not used | Core document processing occurs in the browser. |
| Document upload required | No | The application does not require an app-server upload for current PDF operations. |
| Fully offline/self-contained runtime | Not yet | Tailwind, Google Fonts, PDF.js, and pdf-lib still have runtime CDN dependencies in the current engine/UI setup. |
| API key required | No | Obsolete Gemini/API-key scaffold has been removed. |

## Browsers

Current automated browser qualification is Chromium-based. Other modern browsers may work, but Firefox/Safari are not yet part of the release matrix. This matters particularly for `OffscreenCanvas`, Web Worker behavior, Blob/Object URL lifecycle, drag-and-drop, and large-document performance.

## Current automated qualification

The Phase 0 branch currently validates:

- deterministic `npm ci`
- strict TypeScript
- Zustand/store lifecycle regression tests
- production Vite build
- Chromium launch of the production preview
- real PDF quick merge output
- output page dimensions/order
- real page rotation output
- real selected-page extraction output
- actionable browser console errors during those flows
- desktop/mobile visual baseline screenshots captured as a CI artifact

See `docs/TEST_MATRIX.md` for the broader target matrix and `docs/ROADMAP.md` for planned hardening.
