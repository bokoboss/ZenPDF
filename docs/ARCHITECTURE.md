# ZenPDF Architecture

## Current architecture

ZenPDF is a browser-only React/Vite application.

```text
React UI
  │
  ├─ UploadPage
  ├─ FileManager
  └─ PageEditor
       │
       ▼
Zustand store
  │
  ├─ document/file state
  ├─ page ordering + selection
  ├─ undo/redo history
  ├─ generated output URLs
  └─ worker lifecycle
       │
       ▼
Blob-backed Web Worker
  │
  ├─ PDF.js: parse + raster thumbnails
  └─ pdf-lib: merge/extract/rotate output
```

The UI and application state live on the main browser thread. PDF parsing/rendering and output generation are delegated to a worker so heavy document work does not directly execute inside React event/render code.

## Current strengths

- Document contents do not need to be uploaded to an application server.
- PDF work is separated from React rendering through a Web Worker.
- Page state has stable application-level IDs independent of source PDF page indexes.
- File and page reorder behavior is centralized in the store.
- Undo/redo operates on page-order snapshots.
- PDF output is generated as browser Blob URLs.
- The application already has a strong, coherent visual design that should be preserved.

## Current technical constraints

### Stringified worker

`workerCode.ts` stores the full worker implementation inside a string. TypeScript therefore checks the host module but cannot typecheck the JavaScript inside that string as ordinary worker source.

### Runtime PDF CDNs

The worker currently imports PDF.js and pdf-lib from third-party CDNs. This prevents ZenPDF from being fully self-contained/offline-capable and makes runtime behavior dependent on external availability.

### Runtime CSS/font dependencies

The UI currently loads Tailwind's browser CDN script and Google Fonts resources. React/application dependencies previously also used an `esm.sh` import map; that redundant import map has been removed in Phase 0 so Vite now owns those application dependencies.

### Worker protocol

Worker messages currently use string `type` values and untyped payloads at runtime. There is no shared discriminated-union protocol between the worker and Zustand store yet.

### Task identity

Merge/extract messages distinguish only `taskType`. There is not yet a complete `taskId` / `sessionId` protocol for rejecting stale completion messages after concurrent document changes.

### Large-document rendering

The current worker renders thumbnails sequentially for every parsed page. The editor renders the full page grid. A large document can therefore create unnecessary work before distant pages are visible.

## Phase 0 hardening already introduced

The modernization branch adds several protections without changing the visual design:

- strict TypeScript checking
- Node 20/22 CI
- regression tests around store lifecycle
- worker termination/reinitialization on full reset
- stale file thumbnail/page-response guards
- Object URL cleanup for removed/replaced resources
- invalid DnD target guards
- keyboard exposure for page actions
- removal of obsolete Gemini client configuration
- removal of the redundant application import map

## Target architecture

```text
React UI (visual design preserved)
  │
  ▼
Typed application/domain store
  │
  ├─ document model
  ├─ page model
  ├─ selection/history
  ├─ task state/progress
  └─ resource registry
       │
       ▼
Typed worker client
  │  request/response discriminated unions
  │  taskId + sessionId + progress + cancellation
  ▼
Vite-bundled TypeScript module worker
  │
  ├─ pdfjs-dist (local dependency)
  ├─ pdf-lib (local dependency)
  ├─ parse/thumbnail pipeline
  └─ output operations
```

## Proposed module boundaries

A future bounded refactor can move toward:

```text
src/
  pdf/
    protocol.ts
    worker.ts
    workerClient.ts
    resources.ts
    operations/
      parse.ts
      thumbnails.ts
      merge.ts
      extract.ts
  state/
    pdfStore.ts
    history.ts
  components/
    ...existing visual components...
```

The exact folder migration is less important than separating:

1. PDF-engine concerns
2. worker transport/lifecycle
3. domain state/history
4. React presentation

## Worker protocol direction

Use discriminated unions rather than unchecked message payloads, for example conceptually:

```ts
type WorkerRequest =
  | { type: 'PARSE_FILE'; sessionId: string; taskId: string; payload: ParsePayload }
  | { type: 'MERGE_PAGES'; sessionId: string; taskId: string; payload: MergePayload };

type WorkerResponse =
  | { type: 'FILE_PARSED'; sessionId: string; taskId: string; payload: ParsedPayload }
  | { type: 'PROGRESS'; sessionId: string; taskId: string; payload: ProgressPayload }
  | { type: 'COMPLETE'; sessionId: string; taskId: string; payload: CompletePayload }
  | { type: 'ERROR'; sessionId: string; taskId: string; payload: ErrorPayload };
```

The store/client should reject responses that no longer match the active session/task.

## Resource ownership

Blob/Object URLs and workers are resources with explicit lifecycles.

Ownership should be deterministic:

- thumbnail URL → owned by its source file/page cache
- generated merge URL → owned by the current generated output
- extracted URL → owned until download/replacement/reset
- worker instance → owned by the active application PDF session

Replacing/removing an owner should revoke/terminate its resources.

## Performance direction

For large documents:

- parse document structure first
- make the editor usable without waiting for every thumbnail
- prioritize visible/near-visible pages
- cap concurrent raster work
- cancel work for removed/reset sessions
- virtualize or otherwise avoid mounting hundreds/thousands of expensive page cards simultaneously

## Design boundary

Architecture work must remain visually neutral unless a visible change is required for a concrete UX/accessibility state. See `docs/DESIGN_GUARDRAILS.md` and root `AGENTS.md`.
