import { toWorkerErrorPayload, PdfDomainError } from './errors';
import {
  isWorkerRequest,
  type PdfOperation,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';
import { loadPdfDocument, type PdfOperationContext } from './operations/parse';
import { renderThumbnails } from './operations/thumbnails';
import { extractPages, mergeFiles, mergePages } from './operations/merge';

interface WorkerScope {
  postMessage: (message: WorkerResponse) => void;
  onmessage: ((event: MessageEvent<unknown>) => void) | null;
}

interface ActiveTask {
  operation: PdfOperation;
  cleanup?: () => void | Promise<void>;
}

const workerScope = globalThis as unknown as WorkerScope;
const activeTasks = new Map<string, ActiveTask>();
const cancelledTasks = new Set<string>();
let activeSessionId: string | null = null;
let disposed = false;
let pdfJsWorkerModule: Promise<unknown> | null = null;

function ensurePdfJsWorkerModule(): Promise<unknown> {
  if (pdfJsWorkerModule) return pdfJsWorkerModule;
  const scope = globalThis as unknown as Record<string, unknown>;
  const originalPostMessage = scope.postMessage;
  const originalOnMessage = scope.onmessage;

  // PDF.js's worker distribution auto-initializes against the current worker
  // global. Suppress that bootstrap handshake while loading it inside ZenPDF's
  // already-owned worker, then restore the typed protocol handler.
  scope.postMessage = () => undefined;
  pdfJsWorkerModule = import('pdfjs-dist/build/pdf.worker.mjs').finally(() => {
    scope.postMessage = originalPostMessage;
    scope.onmessage = originalOnMessage;
  });
  return pdfJsWorkerModule;
}

function post<TType extends WorkerResponse['type'], TPayload>(
  sessionId: string,
  taskId: string,
  type: TType,
  payload: TPayload,
): void {
  workerScope.postMessage({ type, sessionId, taskId, payload } as WorkerResponse);
}

function isImage(file: File): boolean {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  return type === 'image/png' || type === 'image/jpeg' || name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg');
}

function isPdf(file: File): boolean {
  return file.type.toLowerCase() === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function ensureSupportedFile(file: File): void {
  if (!isImage(file) && !isPdf(file)) {
    throw new PdfDomainError('UNSUPPORTED_FILE_TYPE', `Unsupported file type: ${file.type || file.name}`);
  }
}

function ensureActive(context: PdfOperationContext): void {
  if (disposed || context.isCancelled()) throw new PdfDomainError('TASK_CANCELLED', 'PDF task was cancelled.');
}

function contextFor(taskId: string, operation: PdfOperation): PdfOperationContext {
  const task = activeTasks.get(taskId);
  return {
    isCancelled: () => disposed || cancelledTasks.has(taskId),
    onProgress: (completed, total, phase) => {
      if (!disposed && !cancelledTasks.has(taskId)) {
        post(activeSessionId as string, taskId, 'TASK_PROGRESS', { operation, phase, completed, total });
      }
    },
    registerCleanup: cleanup => {
      if (task) task.cleanup = cleanup;
    },
  };
}

async function runParse(request: Extract<WorkerRequest, { type: 'PARSE_FILE' }>): Promise<void> {
  const { fileId, file } = request.payload;
  ensureSupportedFile(file);
  const context = contextFor(request.taskId, 'parse');
  if (isImage(file)) {
    ensureActive(context);
    post(request.sessionId, request.taskId, 'FILE_PARSED', { fileId, pageCount: 1 });
    post(request.sessionId, request.taskId, 'THUMBNAIL_GENERATED', { fileId, pageIndex: 0, blob: file });
    context.onProgress?.(1, 1, 'thumbnail');
    post(request.sessionId, request.taskId, 'TASK_COMPLETED', { operation: 'parse' });
    return;
  }

  const document = await loadPdfDocument(file, context);
  try {
    ensureActive(context);
    post(request.sessionId, request.taskId, 'FILE_PARSED', { fileId, pageCount: document.numPages });
    await renderThumbnails(document, document.numPages, context, (pageIndex, blob) => {
      if (!context.isCancelled()) {
        post(request.sessionId, request.taskId, 'THUMBNAIL_GENERATED', { fileId, pageIndex, blob });
      }
    });
    ensureActive(context);
    post(request.sessionId, request.taskId, 'TASK_COMPLETED', { operation: 'parse' });
  } finally {
    await document.cleanup().catch(() => undefined);
  }
}

async function runOutput(request: Extract<WorkerRequest, { type: 'MERGE_FILES' | 'MERGE_PAGES' | 'EXTRACT_PAGES' }>): Promise<void> {
  const context = contextFor(
    request.taskId,
    request.type === 'EXTRACT_PAGES' ? 'extract' : 'merge',
  );
  const blob = request.type === 'MERGE_FILES'
    ? await mergeFiles(request.payload.files, context)
    : request.type === 'MERGE_PAGES'
      ? await mergePages(request.payload.files, request.payload.pages, context)
      : await extractPages(request.payload.files, request.payload.pages, context);
  ensureActive(context);
  post(request.sessionId, request.taskId, 'OUTPUT_READY', {
    operation: request.type === 'EXTRACT_PAGES' ? 'extract' : 'merge',
    blob,
  });
}

async function runRequest(request: WorkerRequest): Promise<void> {
  const operation: PdfOperation = request.type === 'PARSE_FILE'
    ? 'parse'
    : request.type === 'EXTRACT_PAGES'
      ? 'extract'
      : 'merge';
  activeTasks.set(request.taskId, { operation });
  try {
    await ensurePdfJsWorkerModule();
    if (request.type === 'PARSE_FILE') await runParse(request);
    else if (request.type === 'MERGE_FILES' || request.type === 'MERGE_PAGES' || request.type === 'EXTRACT_PAGES') await runOutput(request);
  } catch (error) {
    if (cancelledTasks.has(request.taskId) || disposed || (error instanceof PdfDomainError && error.code === 'TASK_CANCELLED')) {
      post(request.sessionId, request.taskId, 'TASK_CANCELLED', { operation, reason: 'PDF task was cancelled.' });
    } else {
      const fallback = operation === 'parse' ? 'PDF_PARSE_FAILED' : 'PDF_WRITE_FAILED';
      post(request.sessionId, request.taskId, 'TASK_ERROR', toWorkerErrorPayload(error, fallback));
    }
  } finally {
    activeTasks.delete(request.taskId);
    cancelledTasks.delete(request.taskId);
  }
}

function cancelTask(request: Extract<WorkerRequest, { type: 'CANCEL_TASK' }>): void {
  const targetTaskId = request.payload.targetTaskId;
  const task = activeTasks.get(targetTaskId);
  cancelledTasks.add(targetTaskId);
  if (!task) {
    post(request.sessionId, targetTaskId, 'TASK_CANCELLED', { reason: 'PDF task was already complete.' });
    return;
  }
  void Promise.resolve(task.cleanup?.()).catch(() => undefined);
}

workerScope.onmessage = event => {
  const value = event.data;
  if (!isWorkerRequest(value)) return;
  const request = value;

  if (request.type === 'DISPOSE_SESSION') {
    if (activeSessionId === request.sessionId) {
      disposed = true;
      for (const [taskId, task] of activeTasks) {
        cancelledTasks.add(taskId);
        void Promise.resolve(task.cleanup?.()).catch(() => undefined);
      }
    }
    return;
  }

  if (activeSessionId === null) activeSessionId = request.sessionId;
  if (disposed || request.sessionId !== activeSessionId) return;

  if (request.type === 'CANCEL_TASK') {
    cancelTask(request);
    return;
  }
  if (activeTasks.has(request.taskId)) return;
  void runRequest(request);
};
