# ZenPDF

ZenPDF is a calm, privacy-first PDF workspace for merging, organizing, extracting, rotating, and reordering document pages directly in the browser.

The product deliberately favors a focused workflow and a refined, minimal interface over a large collection of unrelated PDF utilities.

## Current capabilities

- Merge multiple PDF files
- Combine PDF, JPG, and PNG files
- Reorder documents with drag and drop
- Reorder individual pages
- Multi-select and move pages as a group
- Shift-select page ranges
- Rotate and remove pages
- Extract selected pages
- Undo and redo page-level edits
- Generate the output PDF in-browser

## Run locally

### Prerequisites

- Node.js
- npm

### Development

```bash
npm install
npm run dev
```

The development server runs on port `3000` by default.

No Gemini API key or other application secret is required.

## Privacy model

ZenPDF is designed so that document processing occurs in the browser rather than on an application server. The current implementation still loads some runtime assets and PDF libraries from third-party CDNs, so the application is not yet fully offline/self-contained.

A modernization goal is to bundle all runtime dependencies locally so that ZenPDF can accurately provide a zero-upload, offline-capable document workflow.

## Product direction

ZenPDF is intended to remain a focused document-organizing workspace:

> Drop → arrange → clean → extract → merge → save

The current visual design is part of the product identity and should be preserved during technical modernization. Infrastructure, reliability, accessibility, performance, and PDF-engine changes should avoid unnecessary visual redesign.

See [`docs/DESIGN_GUARDRAILS.md`](docs/DESIGN_GUARDRAILS.md) and [`docs/ROADMAP.md`](docs/ROADMAP.md) for the modernization constraints and planned work.
