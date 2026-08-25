import { fromWorkerErrorPayload, PdfDomainError } from './errors';
import {
  isWorkerResponse,
  type PdfOperation,
  type WorkerRequest,
  type WorkerResponse,
} from './protocol';
import { discardWorkerResponseResources } from './resources';

export type WorkerFactory = () => Worker;

export interface PdfWorkerClientOptions {
  workerFactory?: WorkerFactory;
  onResponse?: (response: WorkerResponse) => void;
  onError?: (error: PdfDomainError) => void;
  onRestart?: (worker: Worker, sessionId: string) => void;
}

export interface WorkerTaskHandle {
  taskId: string;
  promise: Promise<void>;
  cancel: () => void;
}

interface TaskRecord {
  operation: PdfOperation;
  resolve: () => void;
  reject: (error: PdfDomainError) => void;
  cancelled: boolean;
  settled: boolean;
}

function createId(prefix: string): string {
  const cryptoObject = globalThis.crypto;
  if (typeof cryptoObject?.randomUUID === 'function') return `${prefix}-${cryptoObject.randomUUID()}`;
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function defaultWorkerFactory(): Worker {
  return new Worker(new URL('./worker.ts', import.meta.url), { type: 'module' });
}

function isTerminalResponse(response: WorkerResponse): boolean {
  return (
    response.type === 'OUTPUT_READY' ||
    response.type === 'TASK_COMPLETED' ||
    response.type === 'TASK_CANCELLED' ||
    response.type === 'TASK_ERROR'
  );
}

export class PdfWorkerClient {
  private readonly workerFactory: WorkerFactory;
  private readonly onResponse?: (response: WorkerResponse) => void;
  private readonly onError?: (error: PdfDomainError) => void;
  private readonly onRestart?: (worker: Worker, sessionId: string) => void;
  private readonly tasks = new Map<string, TaskRecord>();
  private disposed = false;
  private workerInstance: Worker;
  private session = createId('session');

  constructor(options: PdfWorkerClientOptions = {}) {
    this.workerFactory = options.workerFactory ?? defaultWorkerFactory;
    this.onResponse = options.onResponse;
    this.onError = options.onError;
    this.onRestart = options.onRestart;
    this.workerInstance = this.createWorker();
  }

  get worker(): Worker {
    return this.workerInstance;
  }

  get sessionId(): string {
    return this.session;
  }

  get activeTaskIds(): string[] {
    return [...this.tasks.keys()];
  }

  parseFile(fileId: string, file: File): WorkerTaskHandle {
    return this.dispatch('PARSE_FILE', { fileId, file }, 'parse');
  }

  mergeFiles(files: Extract<WorkerRequest, { type: 'MERGE_FILES' }>['payload']['files']): WorkerTaskHandle {
    return this.dispatch('MERGE_FILES', { files }, 'merge');
  }

  mergePages(
    files: Extract<WorkerRequest, { type: 'MERGE_PAGES' }>['payload']['files'],
    pages: Extract<WorkerRequest, { type: 'MERGE_PAGES' }>['payload']['pages'],
  ): WorkerTaskHandle {
    return this.dispatch('MERGE_PAGES', { files, pages }, 'merge');
  }

  extractPages(
    files: Extract<WorkerRequest, { type: 'EXTRACT_PAGES' }>['payload']['files'],
    pages: Extract<WorkerRequest, { type: 'EXTRACT_PAGES' }>['payload']['pages'],
  ): WorkerTaskHandle {
    return this.dispatch('EXTRACT_PAGES', { files, pages }, 'extract');
  }

  cancel(taskId: string): void {
    const task = this.tasks.get(taskId);
    if (!task || task.cancelled) return;
    task.cancelled = true;
    if (!task.settled) {
      task.settled = true;
      task.reject(new PdfDomainError('TASK_CANCELLED', 'PDF task was cancelled.'));
    }
    this.tasks.delete(taskId);

    const request: Extract<WorkerRequest, { type: 'CANCEL_TASK' }> = {
      type: 'CANCEL_TASK',
      sessionId: this.session,
      taskId,
      payload: { targetTaskId: taskId },
    };
    try {
      this.workerInstance.postMessage(request);
    } catch {
      this.tasks.delete(taskId);
    }
  }

  restart(): void {
    this.rejectAll(new PdfDomainError('WORKER_RUNTIME_FAILED', 'PDF worker restarted.'));
    this.detachAndTerminateWorker();
    this.disposed = false;
    this.session = createId('session');
    this.workerInstance = this.createWorker();
    this.onRestart?.(this.workerInstance, this.session);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.rejectAll(new PdfDomainError('TASK_CANCELLED', 'PDF session was disposed.'));
    try {
      const request: Extract<WorkerRequest, { type: 'DISPOSE_SESSION' }> = {
        type: 'DISPOSE_SESSION',
        sessionId: this.session,
        taskId: createId('dispose'),
        payload: {},
      };
      this.workerInstance.postMessage(request);
    } catch {
      // The worker is being terminated regardless.
    }
    this.detachAndTerminateWorker();
  }

  private createWorker(): Worker {
    let worker: Worker;
    try {
      worker = this.workerFactory();
    } catch (error) {
      throw new PdfDomainError(
        'WORKER_INITIALIZATION_FAILED',
        error instanceof Error ? error.message : 'Could not create the PDF worker.',
        error,
      );
    }

    worker.onmessage = event => this.handleMessage(event.data);
    worker.onerror = event => {
      const message = typeof event === 'object' && event !== null && 'message' in event && event.message
        ? String(event.message)
        : 'PDF worker failed.';
      this.handleWorkerFailure(new PdfDomainError('WORKER_RUNTIME_FAILED', message, event));
    };
    worker.onmessageerror = event => {
      this.handleWorkerFailure(new PdfDomainError('WORKER_RUNTIME_FAILED', 'Could not read a PDF worker response.', event));
    };
    return worker;
  }

  private dispatch(
    type: 'PARSE_FILE' | 'MERGE_FILES' | 'MERGE_PAGES' | 'EXTRACT_PAGES',
    payload: unknown,
    operation: PdfOperation,
  ): WorkerTaskHandle {
    if (this.disposed) {
      const error = new PdfDomainError('TASK_CANCELLED', 'PDF session was disposed.');
      const promise = Promise.reject<void>(error);
      promise.catch(() => undefined);
      return { taskId: createId('task'), promise, cancel: () => undefined };
    }

    const taskId = createId('task');
    let resolveTask!: () => void;
    let rejectTask!: (error: PdfDomainError) => void;
    const promise = new Promise<void>((resolve, reject) => {
      resolveTask = resolve;
      rejectTask = reject;
    });
    promise.catch(() => undefined);
    this.tasks.set(taskId, {
      operation,
      resolve: resolveTask,
      reject: rejectTask,
      cancelled: false,
      settled: false,
    });

    const request = {
      type,
      sessionId: this.session,
      taskId,
      payload,
    } as WorkerRequest;
    try {
      this.workerInstance.postMessage(request);
    } catch (error) {
      const domainError = new PdfDomainError(
        'WORKER_RUNTIME_FAILED',
        error instanceof Error ? error.message : 'Could not dispatch PDF task.',
        error,
      );
      this.tasks.delete(taskId);
      rejectTask(domainError);
      this.onError?.(domainError);
    }

    return {
      taskId,
      promise,
      cancel: () => this.cancel(taskId),
    };
  }

  private handleMessage(value: unknown): void {
    if (!isWorkerResponse(value)) {
      this.handleWorkerFailure(new PdfDomainError('WORKER_RUNTIME_FAILED', 'PDF worker returned an invalid response.'));
      return;
    }
    const response = value;
    if (this.disposed || response.sessionId !== this.session) {
      discardWorkerResponseResources(response);
      return;
    }

    const task = this.tasks.get(response.taskId);
    if (!task) {
      discardWorkerResponseResources(response);
      return;
    }

    if (task.cancelled) {
      if (response.type === 'TASK_CANCELLED' || response.type === 'TASK_ERROR') {
        this.onResponse?.(response);
        this.tasks.delete(response.taskId);
      } else if (isTerminalResponse(response)) {
        discardWorkerResponseResources(response);
        this.tasks.delete(response.taskId);
      }
      return;
    }

    this.onResponse?.(response);
    if (!isTerminalResponse(response)) return;

    this.tasks.delete(response.taskId);
    if (response.type === 'TASK_ERROR') {
      const error = fromWorkerErrorPayload(response.payload);
      task.settled = true;
      task.reject(error);
      return;
    }
    if (response.type === 'TASK_CANCELLED') {
      const error = new PdfDomainError('TASK_CANCELLED', response.payload.reason || 'PDF task was cancelled.');
      task.settled = true;
      task.reject(error);
      return;
    }
    task.settled = true;
    task.resolve();
  }

  private handleWorkerFailure(error: PdfDomainError): void {
    if (this.disposed) return;
    this.rejectAll(error);
    this.detachAndTerminateWorker();
    this.onError?.(error);
  }

  private rejectAll(error: PdfDomainError): void {
    for (const task of this.tasks.values()) {
      if (!task.settled) {
        task.settled = true;
        task.reject(error);
      }
    }
    this.tasks.clear();
  }

  private detachAndTerminateWorker(): void {
    this.workerInstance.onmessage = null;
    this.workerInstance.onerror = null;
    this.workerInstance.onmessageerror = null;
    this.workerInstance.terminate();
  }
}
