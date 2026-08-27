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

Elapsed time from file selection until the Page Editor has exposed the expected number of logical page entries.
In the windowed editor, logical entries include lightweight geometry-preserving shells;
this metric does not require every expensive sortable card or thumbnail subtree to be mounted.

This captures the cost of entering the editor while keeping the full logical page order available.

### `allThumbnailsMs`

Elapsed time from file selection until the store reports all expected canonical page thumbnails ready.
The metric is independent of how many thumbnail subtrees are currently mounted in the window.

Current ZenPDF renders thumbnails sequentially, so this metric is especially useful for evaluating Phase 2 scheduling and prioritization.

### Phase 2A editor milestones

Phase 2A adds milestones that separate editor construction from thumbnail completion:

- `editorShellReadyMs`: the editor heading and usable Save control are available.
- `firstCardUsableMs`: the first page card can be selected.
- `firstVisibleThumbnailMs`: the first visible page thumbnail is present.
- `firstCardInteractionMs` / `farCardInteractionMs`: the elapsed time for selection at the first and last page cards once each is exercised.
- `thumbnailReadyCountAtEditorShell`: the number of canonical thumbnails ready when the editor shell becomes ready.

These values are recorded alongside the original three milestones in the same JSON artifact.

### Phase 2A2 window metrics

Phase 2A2 adds bounded sortable activation while preserving the complete logical
grid. The editor uses one deterministic range manager based on the existing grid
geometry and one `ResizeObserver`/scroll subscription. Visible and near-visible
pages mount `SortablePageGridItem`, `useSortable`, and the thumbnail subtree;
off-screen pages use a geometry-preserving `PageGridShell`. The active dragged page
is pinned into the mounted ID set. Zustand remains the owner of the full `pageOrder`
and reorder semantics.

The performance and browser artifacts record `logicalPageCount`,
`lightweightShellCount`, `mountedSortableCount`, `mountedThumbnailCount`, visible
and overscan row ranges, grid column count, and zoom level. The mounted counts
describe expensive DOM work; they are intentionally distinct from the logical page
count and must not grow linearly to 500 pages.

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

## Phase 0 measured baseline

Environment for the first recorded run:

- GitHub-hosted Ubuntu 24.04 runner
- Node 22 job environment
- Headless Chrome 151.0.7922.34
- blank A4-like generated PDF fixture

| Pages | Source size | Parse | Editor ready | All thumbnails | Status |
|---:|---:|---:|---:|---:|---|
| 100 | 1,738 B | 368 ms | 811 ms | 2,229 ms | PASS |
| 500 | 6,581 B | 876 ms | 20,697 ms | 20,731 ms | PASS |
| 1,000 | not routinely run | — | — | — | targeted stress case |

These are reference measurements, not universal performance guarantees.

## Phase 1A local comparison

The same harness was run before and after the local typed-worker migration on
the same Windows/Headless Chrome 151.0.7922.34 environment. These values are
local comparison evidence, not a replacement for the hosted-runner baseline
above.

| Pages | Phase 0 local parse / editor / thumbnails | Phase 1A parse / editor / thumbnails |
|---:|---:|---:|
| 100 | 871 / 1,006 / 2,335 ms | 128 / 243 / 250 ms |
| 500 | 856 / 1,801 / 9,471 ms | 124 / 5,972 / 5,978 ms |

The Phase 1A 500-page editor-ready measurement repeated at 6,543 ms, so the
editor milestone regression is real in this local run rather than a single
outlier. Parse and all-thumbnail readiness improved materially. The current
benchmark navigates immediately into the existing full page grid while the
typed worker delivers 500 thumbnail `Blob` responses that the main-thread
resource registry converts to owned Object URLs. Those state/resource updates
contend with mounting 500 sortable page cards, while the all-thumbnail result
still completes faster overall. This is documented as a Phase 2 full-grid and
thumbnail-bridge performance issue; no timeout was increased to hide it.

## Initial interpretation

The 500-page result exposes a clear scaling problem in the current editor path:

- document recognition/page-count parsing remains relatively fast (`876 ms`),
- entering a 500-page editor takes about `20.7 s`,
- all thumbnails are ready at almost the same point (`20.73 s`).

`FileManager` does not intentionally disable the Page Editor while thumbnails finish, so the long `editorReadyMs` is not simply a thumbnail-completion gate. The current Page Editor mounts the complete page grid and one sortable item/hook set per page. The first evidence therefore supports **full-grid construction / DnD component cost as a major Phase 2 hypothesis**, while sequential thumbnail work remains a parallel optimization target.

Phase 2 should test this hypothesis directly by comparing:

1. page-grid virtualization or equivalent bounded rendering,
2. lazy/viewport-priority thumbnails,
3. bounded thumbnail concurrency,
4. reduced sortable/DnD work for off-screen pages.

The goal is not merely to make the final thumbnail completion faster; the primary user-facing objective is to make a large document useful and interactive much earlier.

## Phase 2A bounded editor qualification

Phase 2A addresses the confirmed main-thread amplification in the existing full-DOM editor: each thumbnail response previously rewrote every page item, waking the entire sortable grid. The bounded change keeps canonical thumbnails on `files[fileId].thumbnails`, leaves `pageOrder` stable for thumbnail-only responses, narrows `PageEditor` subscriptions, isolates each card's thumbnail subscription, memoizes cards/IDs, and applies `content-visibility: auto` only to inner page content. The outer sortable card geometry remains in the DOM. No true virtualization or DnD rewrite is included.

The Phase 1C hosted reference used for this comparison was:

| Pages | Parse | Editor ready | All thumbnails |
|---:|---:|---:|---:|
| 100 | 257 ms | 521 ms | 531 ms |
| 500 | 261 ms | 9,860 ms | 9,868 ms |

One local Windows/Headless Chrome 151 qualification after the Phase 2A change was:

| Pages | Parse | Editor ready | All thumbnails | Editor shell | First card usable | First visible thumbnail | First interaction | Far interaction | Thumbnails at shell |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 215 ms | 347 ms | 296 ms | 296 ms | 340 ms | 342 ms | 38 ms | 42 ms | 100 |
| 500 | 105 ms | 3,762 ms | 3,696 ms | 3,696 ms | 3,756 ms | 3,758 ms | 47 ms | 65 ms | 500 |

These local values are directional evidence only. The authoritative Phase 2A gate is the hosted Linux CI run: the 500-page `editorReadyMs` target is at or below 3,500 ms, with no material parse or 100-page regression and no timeout increase.

The exact hosted Linux qualification was CI run `33072439871` at commit `8b16cd61773cf1fd2aa438d34f654b7dca188017`:

| Pages | Parse | Editor ready | All thumbnails | Editor shell | First card usable | First visible thumbnail | First interaction | Far interaction | Thumbnails at shell |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 267 ms | 635 ms | 517 ms | 517 ms | 625 ms | 629 ms | 93 ms | 88 ms | 100 |
| 500 | 273 ms | 8,698 ms | 8,587 ms | 8,587 ms | 8,683 ms | 8,690 ms | 79 ms | 160 ms | 500 |

The 500-page target was **not met**: `editorReadyMs` was 8,698 ms versus the 3,500 ms ceiling. This is an improvement of 1,162 ms (11.8%) over the Phase 1C hosted editor-ready reference, while parse remained comparable and the 100-page all-thumbnail result improved. The shell snapshot still contained all 500 thumbnails and the first card became usable only after the full-grid cost, so thumbnail response remapping was not the sole remaining gate.

The remaining bottleneck is full-DOM sortable construction and layout/measurement work: one outer sortable card and hook set is still created for every page, including off-screen pages. `content-visibility: auto` is limited to inner page content so sortable geometry remains correct; it therefore does not bound that outer cost. Phase 2B should explicitly evaluate bounded rendering/virtualization or an off-screen sortable strategy, together with thumbnail scheduling/priority, while preserving keyboard/touch behavior and stable geometry. No Phase 2B architecture is included in this qualification.

The corresponding 100-page browser qualification covers first/far selection, zoom levels 1–5, multi-select and group movement, mouse/keyboard/touch drag, reorder undo, rotation, removal undo/redo, and reparsed output order/dimensions/rotation. Lifecycle tests separately verify that thumbnail-only responses do not mutate `pageOrder` and that existing stale/reset/remove/fatal-worker protections remain intact.

## Phase 2A2 bounded sortable qualification

Phase 2A2 bounds the remaining full-DOM sortable work identified above. The
implementation keeps every page in the grid for stable scroll height and current
responsive geometry, but only mounts the expensive sortable/card/thumbnail subtree
for visible and near-visible rows. The first DnD experiment uses the mounted IDs
with the existing `rectSortingStrategy`; global reorder still resolves against the
full Zustand `pageOrder`. No new dependency, worker scheduling change, or DnD
architecture migration is included.

One local Windows/Headless Chrome 151 run on the Phase 2A2 branch recorded:

| Pages | Parse | Editor ready | All thumbnails | Editor shell | First card usable | First visible thumbnail | First interaction | Far interaction | Sortables at shell | Shells at shell |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 113 ms | 269 ms | 218 ms | 218 ms | 266 ms | 267 ms | 44 ms | 38 ms | 25 | 75 |
| 500 | 213 ms | 540 ms | 497 ms | 497 ms | 536 ms | 538 ms | 36 ms | 34 ms | 25 | 475 |

The deterministic 500-page browser qualification recorded 30 mounted sortables
at default zoom 3 at 1440x1000, with 470 lightweight shells. Mounted sortables
at zoom levels 1 through 5 were 56, 36, 30, 20, and 15 respectively. The far
range mounted 30 sortables, and document scroll height remained 32,808 px before
and after the range change. These local values are directional; the exact hosted
CI run remains the acceptance authority.

The exact hosted Linux qualification was CI run `33083372374` at commit
`d207c092f4f97429b9093e53447464d4f01462e0`:

| Pages | Parse | Editor ready | All thumbnails | Editor shell | First card usable | First visible thumbnail | First interaction | Far interaction | Sortables at shell | Shells at shell |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 100 | 388 ms | 711 ms | 644 ms | 644 ms | 706 ms | 709 ms | 55 ms | 42 ms | 25 | 75 |
| 500 | 233 ms | 1,137 ms | 1,086 ms | 1,086 ms | 1,131 ms | 1,134 ms | 34 ms | 81 ms | 25 | 475 |

The hosted 500-page result meets the Phase 2A2 ceilings of 2,500 ms for
`editorShellReadyMs`, 2,750 ms for `firstCardUsableMs`, 3,500 ms for
`editorReadyMs`, and 500 ms for the measured visible interactions. The hosted
browser artifact also recorded the same 56, 36, 30, 20, and 15 mounted-sortable
counts at zoom levels 1 through 5, with 30 sortables in the far range and stable
scroll geometry.
