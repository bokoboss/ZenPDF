# ZenPDF Architecture

## Current architecture

ZenPDF is a browser-only React/Vite application. Document contents stay in the
browser; the application does not upload them to an application server.

```text
React UI
  |
  v
Zustand application store
  |  document/page state, history, task state
  v
PdfWorkerClient
  |  typed request/response envelopes
  |  sessionId + taskId lifecycle
  v
Vite-bundled TypeScript module worker
  |
  +-- pdfjs-dist 6.2.108: PDF parsing and thumbnails
  +-- pdf-lib 1.17.1: merge, extract, and rotation output
  +-- ResourceRegistry boundary: browser Object URL ownership
```

The UI and application state remain on the main browser thread. PDF parsing,
thumbnail rendering, and output generation run through the module worker so
heavy document work does not execute inside React event or render code.

## Module boundaries

```text
src/pdf/
  protocol.ts       shared discriminated request/response contracts
  workerClient.ts   worker construction, dispatch, task settlement, restart
  worker.ts         session-aware worker request handling
  errors.ts         stable domain error taxonomy and safe messages
  resources.ts      Object URL ownership and stale-resource cleanup
  operations/
    parse.ts        PDF.js loading and worker-safe canvas/filter factories
    thumbnails.ts   sequential PDF page rasterization
    merge.ts        pdf-lib merge/extract/rotation output
```

`store.ts` owns UI/application orchestration. It maps accepted worker responses
to file/page state, starts and cancels operations, and delegates PDF work to
`PdfWorkerClient`; it does not import or call PDF.js or pdf-lib directly.

## Worker construction and PDF.js integration

The client uses Vite's module-worker construction:

```ts
new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
```

Both PDF libraries are installed application dependencies and are bundled by
Vite. The worker build is configured for ES module output, including the local
PDF.js worker chunk; there are no runtime PDF-library CDN requests or
`importScripts()` calls.

`pdfjs-dist@6.2.108` publishes a worker module that bootstraps itself when it
is evaluated against a worker global. ZenPDF already owns that worker global,
so `worker.ts` dynamically loads the local PDF.js worker module once while
temporarily suppressing its bootstrap `postMessage`, then restores ZenPDF's
typed message handler. This is the smallest compatible integration that keeps
PDF.js parsing and thumbnail rendering inside the existing worker boundary.

## Typed protocol

Every request and response has this envelope:

```ts
interface WorkerRequestEnvelope<TType extends string, TPayload> {
  type: TType;
  sessionId: string;
  taskId: string;
  payload: TPayload;
}
```

The request union covers `PARSE_FILE`, `MERGE_FILES`, `MERGE_PAGES`,
`EXTRACT_PAGES`, `CANCEL_TASK`, and `DISPOSE_SESSION`. Responses cover parsed
file metadata, generated thumbnail Blobs, progress, output Blobs, completion,
cancellation, and typed errors. Runtime guards reject malformed envelopes
before they can mutate application state.

## Session and task lifecycle

- A client creates a new `sessionId` when the PDF engine starts.
- Reset disposes the old client/session, releases owned resources, and creates
  a clean worker/session.
- Fatal worker failure rejects active tasks and terminates the worker; the
  client can restart into a new session without refreshing the page.
- Every parse, merge, and extract operation receives a unique `taskId`.
- Responses are accepted only when both client/session and task ownership still
  match the current store state.
- Cancellation rejects the task promise immediately with `TASK_CANCELLED` and
  sends a typed cancellation request. Late output is ignored and cannot replace
  a newer result.

## Resource ownership

The worker returns `Blob` values rather than creating browser Object URLs. The
`ResourceRegistry` creates and owns URLs at the client/store boundary:

- thumbnail URL -> source file/page owner;
- merged output URL -> current merged output owner;
- extracted output URL -> current extracted output owner.

Replacing an owner revokes its previous URL. Removing a file releases all of
that file's thumbnail URLs. Reset/dispose releases all known URLs. The client
also has a compatibility cleanup path for ignored legacy responses that carry
`url`/`urls` fields, so stale resources are revoked before being discarded.

## Error taxonomy

Worker/library failures are mapped to stable domain codes:

`INVALID_PDF`, `PASSWORD_REQUIRED`, `UNSUPPORTED_ENCRYPTION`,
`UNSUPPORTED_FILE_TYPE`, `IMAGE_DECODE_FAILED`, `PDF_PARSE_FAILED`,
`PDF_RENDER_FAILED`, `PDF_WRITE_FAILED`, `WORKER_INITIALIZATION_FAILED`,
`WORKER_RUNTIME_FAILED`, `TASK_CANCELLED`,
`OUT_OF_MEMORY_OR_RESOURCE_LIMIT`, and `UNKNOWN`.

Each error retains an internal developer message/cause and exposes a safe
user-facing message. Password-protected documents are reported recoverably;
ZenPDF does not promise password entry or decryption in this phase.

## Current limitations

- Chromium is the currently automated browser qualification target. Firefox
  and WebKit/Safari are not claimed as release-qualified.
- Thumbnail generation remains sequential and the editor still mounts the full
  page grid. Scheduling and virtualization belong to Phase 2.
- Tailwind and Google Fonts still have runtime CDN dependencies; those are UI
  asset concerns tracked separately from the Phase 1 PDF-processing boundary.
- WebP, GIF, TIFF, and Office documents remain unsupported.

## Design boundary

Phase 1 is infrastructure work and is intentionally visually neutral. The
existing warm stone palette, typography, spacing, rounded surfaces, shadows,
motion, upload-page treatment, and quiet information hierarchy are preserved.
See `docs/DESIGN_GUARDRAILS.md` and `AGENTS.md`.
