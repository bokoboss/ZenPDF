# ZenPDF Large-Document Performance Baseline

## Purpose

This document defines how ZenPDF performance is measured before Phase 1/2 changes.

The purpose is not to enforce arbitrary speed targets yet. It is to create a repeatable baseline so later worker and virtualization changes can be compared against the same workflow.

## Benchmark implementation

Benchmark source:

- `tests/perf/large-document.perf.ts`
- `playwright.perf.config.ts`

Command:

```bash
npm run build
npx playwright install chromium
ZENPDF_PERF_PAGES=100 npm run benchmark:pdf
```

Examples for larger runs:

```bash
ZENPDF_PERF_PAGES=500 npm run benchmark:pdf
ZENPDF_PERF_PAGES=1000 npm run benchmark:pdf
```

CI records 100-page and 500-page baselines. The 1,000-page case is intentionally available for targeted qualification rather than required on every PR until the current implementation's behavior is characterized.

## Fixture

The benchmark generates a deterministic in-memory PDF containing blank A4-like pages:

- width: 595 pt
- height: 842 pt
- page count: controlled by `ZENPDF_PERF_PAGES`

Blank pages are intentional. They isolate page/thumbnail pipeline overhead from complex PDF content/rendering cost.

Separate future fixtures should cover image-heavy and vector/text-heavy PDFs.

## Measured milestones

### `parseMs`

Elapsed time from file selection until the Documents screen reports the expected page count.

This represents user-perceived document recognition/readiness, not completion of all thumbnails.

### `editorReadyMs`

Elapsed time from file selection until the Page Editor has instantiated the expected number of page cards.

This captures the cost of entering the current non-virtualized editor.

### `allThumbnailsMs`

Elapsed time from file selection until all expected page thumbnail images are present in the editor.

Current ZenPDF renders thumbnails sequentially, so this metric is especially useful for evaluating Phase 2 scheduling and prioritization.

### `sourceBytes`

Generated fixture size for reproducibility/context.

### Browser/runtime identity

The benchmark records the browser user agent and timestamp because CI/browser updates can move timings independently of ZenPDF code.

## Output

Metrics are written to:

```text
test-results/performance/<page-count>-pages.json
```

CI uploads these files as artifacts.

## Interpretation rules

1. Do not compare timing values from materially different hardware as if they were controlled laboratory measurements.
2. CI numbers are primarily useful for before/after comparisons within the same hosted-runner class.
3. A single noisy run should not trigger architecture changes.
4. A repeatable material regression after Phase 1 must be investigated and explained.
5. Do not 'fix' performance regression by only raising test timeouts.
6. Phase 1 must preserve acceptable responsiveness; Phase 2 is where large-document optimization is intentionally implemented.

## Phase 2 performance questions

The baseline is designed to answer these later questions:

- Does lazy thumbnail generation improve time-to-editor?
- Does viewport priority reduce time to useful visible thumbnails?
- Does a bounded render queue avoid resource spikes?
- Does page-grid virtualization reduce editor construction cost?
- At what page count does the current full-DOM grid become operationally uncomfortable?
- Does task cancellation prevent wasted work after reset/navigation?

## Future benchmark classes

After the basic baseline is stable, add targeted fixtures for:

### Content complexity

- text/vector-heavy PDF
- scanned/image-heavy PDF
- mixed portrait/landscape PDF
- source pages with rotation

### Input composition

- many small PDFs merged together
- mixed PDF/PNG/JPG input
- one very large PDF

### Stress/lifecycle

- reset during 500-page thumbnail generation
- remove file during rendering
- repeated merge/extract cycles
- repeated large-file open/reset loops

## Initial baseline status

The CI workflow is configured to collect:

- 100-page baseline
- 500-page baseline

Record the measured values below after the first successful run.

| Pages | Parse | Editor ready | All thumbnails | Status |
|---:|---:|---:|---:|---|
| 100 | pending | pending | pending | CI measurement pending |
| 500 | pending | pending | pending | CI measurement pending |
| 1,000 | not routinely run | not routinely run | not routinely run | targeted stress case |
