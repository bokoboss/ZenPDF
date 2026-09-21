# ZenPDF Support Matrix

This matrix is intentionally conservative. A capability is called supported only when the current implementation handles it explicitly and the v1 release evidence supports the claim.

## Input formats

| Input | v1.0 status | Notes |
|---|---|---|
| PDF | Supported | Parsed with PDF.js; output generated with pdf-lib. |
| JPEG / JPG | Supported | Imported as a one-page image document. Dedicated mixed-JPEG browser fixture remains desirable. |
| PNG | Supported | Imported as a one-page image document; mixed PDF/PNG output is browser-tested. |
| WebP / GIF / TIFF | Not supported | Not accepted by the current input/worker image path. |
| Office documents | Not supported | DOCX/XLSX/PPTX conversion is outside v1 scope. |

## Core workflows

| Capability | v1.0 status | Qualification |
|---|---|---|
| Quick Merge multiple PDFs | Supported | Chromium output page order/count/dimensions. |
| Mixed PDF + PNG | Supported | Chromium output regression. |
| Page Editor | Supported | Full Chromium E2E suite. |
| Mouse page reorder | Supported | Output/reparse regression. |
| Keyboard DnD | Supported | Browser-qualified. |
| Touch DnD | Supported | Browser-qualified. |
| Multi-selected group move | Supported | Browser-qualified with undo/redo. |
| Shift-range selection | Supported on desktop | Touch uses individual selection / existing multi-selection paths. |
| Rotate individual/selected pages | Supported | Rotation behavior and toolbar interaction qualified. |
| Preserve source + editor rotation | Supported | Additive rotation regression. |
| Delete / undo / redo | Supported | Browser and store regressions. |
| Extract selected pages | Supported | Download/reparse regression. |
| Add files in Editor | Supported | Browser-qualified, including failed-added-file save isolation. |
| Output position + source provenance | Supported | Multi-source reorder/delete/save regression. |
| Download generated PDF | Supported | Browser download and PDF reparse. |
| Thai/non-ASCII filename | Supported | Chromium import/output workflow. |
| Malformed PDF recovery | Supported by remove/re-add | Stable failed-file card and typed error; no direct Retry control. |

## Document characteristics

| Characteristic | v1.0 status | Notes |
|---|---|---|
| Portrait / landscape pages | Supported | Source dimensions preserved. |
| Mixed page sizes | Supported | Browser fixture verifies distinct dimensions. |
| Source rotation | Supported | Preserved and composed with editor rotation. |
| 100-page blank PDF | Release-qualified | Routine CI performance fixture. |
| 500-page blank PDF | Release-qualified | Windowed expensive work; routine CI gate. |
| 120-page text/vector-heavy PDF | Release-qualified | Viewport-priority scheduling fixture. |
| 100-page raster/scanned-like PDF | Release-qualified | Real rendering-cost scheduling fixture. |
| 1,000-page PDF | Targeted/manual only | Not a routine v1 release gate. |
| Very large files | Browser/memory dependent | No application-level size guarantee. |

Reference release-candidate evidence from PR #20 CI #87:
- blank 500: 278 ms parse, 637 ms editor shell, 733 ms editor ready, 25 expensive sortables
- vector 120: 502 ms far-priority first thumbnail
- raster 100: 147 ms far-priority first thumbnail
- worker-wide thumbnail concurrency 2/2, duplicate successful renders 0

These measurements are runner-specific reference values, not universal guarantees.

## Passwords and encryption

| Case | v1.0 status |
|---|---|
| Password-protected/encrypted PDF | Recoverable rejection; no password-entry workflow |
| Add/remove password protection | Not supported |
| Corrupt/malformed PDF | Recoverable failed-file state |

## Privacy/connectivity

- Document contents remain in the browser for current workflows.
- Application-server document upload is not required.
- PDF.js, pdf-lib, CSS, icons, and typography are local/bundled for the tested production build.
- No API key is required.
- Runtime-network audit is part of release qualification.

## Browser qualification

Chromium is the v1.0 release-qualified browser baseline.

Firefox and WebKit/Safari are not fully qualified for v1.0. Browser-specific behavior around workers, canvas, Blob/Object URLs, DnD, and large-document performance is therefore not guaranteed outside Chromium.

## Known interaction limitations

- Prolonged edge-triggered mouse-drag auto-scroll remains nondeterministic in automated qualification.
- There is no complex touch range-selection mode.
- There is no persistent workspace/session restore.
- There is no custom output filename editor or shortcut-help UI.

See `docs/TEST_MATRIX.md`, `docs/PERFORMANCE_BASELINE.md`, and `docs/releases/v1.0.0.md`.
