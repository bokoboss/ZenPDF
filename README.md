# ZenPDF

ZenPDF is a privacy-first browser workspace for combining and organizing PDF pages without uploading document contents to an application server.

The v1.0 workflow is intentionally focused:

> Upload → Documents → Page Editor → Save / Download

## Supported inputs

- PDF
- JPG / JPEG
- PNG

PDF pages preserve their source dimensions and rotation. Images are converted to PDF pages in-browser.

## v1.0 capabilities

- Quick Merge multiple source files in document order
- Combine PDF and image inputs
- Reorder source documents
- Reorder individual pages with mouse, touch, or keyboard drag-and-drop
- Multi-select and move pages as a group
- Shift-select page ranges on desktop
- Rotate and delete individual or selected pages
- Extract selected pages
- Undo and redo page-level edits
- Add files from the Page Editor
- Show output position plus source file/page provenance when useful
- Save and download the generated PDF in-browser
- Recover from malformed-file input by removing the failed file and adding it again

## Local processing and privacy

ZenPDF is a browser-only React/Vite application.

Current PDF workflows use locally bundled dependencies:

- `pdfjs-dist@6.2.108` for PDF parsing and thumbnails
- `pdf-lib@1.17.1` for merge, extract, rotation, and output generation

PDF work runs in a Vite-bundled TypeScript module worker. Document contents are not uploaded to an application server by the current product workflow.

The tested production shell also makes no runtime requests to third-party UI, font, icon, or PDF-library CDNs.

No Gemini API key or other application secret is required.

## Development

### Prerequisites

- Node.js 20 or 22
- npm

### Install

```bash
npm ci
```

### Run locally

```bash
npm run dev
```

### Validate

```bash
npm run typecheck
npm run test
npm run build
npm run test:e2e
npm run benchmark:pdf
```

The Vite development server uses port 3000 by default.

## Qualified browser baseline

ZenPDF v1.0 is release-qualified with Chromium through the repository Playwright/CI suite.

Firefox and WebKit/Safari are not claimed as fully release-qualified for v1.0. They may work, but they are outside the automated release matrix.

## Large-document qualification

The v1 architecture keeps the full logical page sequence while limiting expensive mounted sortable/card work to visible and near-visible rows. Thumbnail rendering uses a worker-wide bounded queue with viewport priority.

The release qualification includes:

- blank 100-page PDF
- blank 500-page PDF
- 120-page text/vector-heavy PDF
- 100-page raster/scanned-like PDF

See `docs/PERFORMANCE_BASELINE.md` for measured reference results.

## Known v1.0 limitations

- Firefox/WebKit are not fully release-qualified.
- Prolonged edge-triggered mouse-drag auto-scroll is not deterministic in automated qualification.
- Large raster PDFs can spend substantial time in PDF parsing before viewport-priority thumbnail scheduling can help.
- Thumbnail reprioritization bounds stale in-flight work rather than cancelling every ordinary render.
- Malformed-file recovery is remove/re-add; there is no direct Retry control.
- Workspace/session state is not persisted across reloads.
- Output filenames are generated automatically; there is no custom filename editor.
- There is no shortcut-help UI or complex touch range-selection mode.
- WebP, GIF, TIFF, Office-document conversion, OCR, and password entry/decryption are outside v1.0 scope.

## Project documentation

- `docs/ARCHITECTURE.md`
- `docs/DESIGN_GUARDRAILS.md`
- `docs/SUPPORT_MATRIX.md`
- `docs/TEST_MATRIX.md`
- `docs/PERFORMANCE_BASELINE.md`
- `docs/UX_AUDIT_NO_REDESIGN.md`
- `SECURITY.md`
- `docs/releases/v1.0.0.md`
