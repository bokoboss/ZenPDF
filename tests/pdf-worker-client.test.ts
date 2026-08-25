import { afterEach, describe, expect, it, vi } from 'vitest';
import { PdfDomainError, toPdfDomainError } from '../src/pdf/errors';
import { PdfWorkerClient } from '../src/pdf/workerClient';
import type { WorkerResponse } from '../src/pdf/protocol';

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}

const createdWorkers: FakeWorker[] = [];
const workerFactory = () => {
  const worker = new FakeWorker();
  createdWorkers.push(worker);
  return worker as unknown as Worker;
};

function dispatch(worker: FakeWorker, response: WorkerResponse | Record<string, unknown>) {
  worker.onmessage?.({ data: response } as MessageEvent);
}

afterEach(() => {
  createdWorkers.length = 0;
  vi.unstubAllGlobals();
});

describe('PdfWorkerClient typed lifecycle', () => {
  it('dispatches an envelope and resolves on a terminal response', async () => {
    const responses: WorkerResponse[] = [];
    const client = new PdfWorkerClient({ workerFactory, onResponse: response => responses.push(response) });
    const worker = createdWorkers[0];
    const handle = client.mergeFiles([]);
    const request = worker.postMessage.mock.calls[0]?.[0] as Record<string, unknown>;

    expect(request.type).toBe('MERGE_FILES');
    expect(request.sessionId).toBe(client.sessionId);
    expect(request.taskId).toBe(handle.taskId);

    dispatch(worker, {
      type: 'OUTPUT_READY',
      sessionId: client.sessionId,
      taskId: handle.taskId,
      payload: { operation: 'merge', blob: new Blob(['pdf']) },
    });

    await expect(handle.promise).resolves.toBeUndefined();
    expect(responses).toHaveLength(1);
    client.dispose();
  });

  it('maps a typed task error to a stable domain error', async () => {
    const client = new PdfWorkerClient({ workerFactory });
    const worker = createdWorkers[0];
    const handle = client.mergeFiles([]);

    dispatch(worker, {
      type: 'TASK_ERROR',
      sessionId: client.sessionId,
      taskId: handle.taskId,
      payload: {
        code: 'INVALID_PDF',
        message: 'Invalid PDF structure',
        userMessage: 'This PDF is invalid or could not be read.',
      },
    });

    await expect(handle.promise).rejects.toMatchObject({
      code: 'INVALID_PDF',
      userMessage: 'This PDF is invalid or could not be read.',
    });
    client.dispose();
  });

  it('classifies protected PDFs and image decode failures without exposing library-only errors', () => {
    const passwordError = Object.assign(new Error('Password required'), {
      name: 'PasswordException',
      code: 2,
    });

    expect(toPdfDomainError(passwordError).code).toBe('PASSWORD_REQUIRED');
    expect(toPdfDomainError(new Error('Unable to decode PNG image')).code).toBe('IMAGE_DECODE_FAILED');
  });

  it('rejects stale-session responses and releases any legacy response URL', async () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { revokeObjectURL, createObjectURL: vi.fn() });
    const responses: WorkerResponse[] = [];
    const client = new PdfWorkerClient({ workerFactory, onResponse: response => responses.push(response) });
    const worker = createdWorkers[0];
    const handle = client.mergeFiles([]);

    dispatch(worker, {
      type: 'OUTPUT_READY',
      sessionId: 'old-session',
      taskId: handle.taskId,
      payload: { operation: 'merge', blob: new Blob(['stale']), url: 'blob:stale' },
    });

    expect(responses).toEqual([]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stale');
    expect(client.activeTaskIds).toContain(handle.taskId);
    handle.cancel();
    await expect(handle.promise).rejects.toMatchObject({ code: 'TASK_CANCELLED' });
    client.dispose();
  });

  it('rejects stale-task output without invoking the response handler', () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { revokeObjectURL, createObjectURL: vi.fn() });
    const responses: WorkerResponse[] = [];
    const client = new PdfWorkerClient({ workerFactory, onResponse: response => responses.push(response) });
    const worker = createdWorkers[0];

    dispatch(worker, {
      type: 'OUTPUT_READY',
      sessionId: client.sessionId,
      taskId: 'task-from-an-older-operation',
      payload: { operation: 'merge', blob: new Blob(['stale']), url: 'blob:stale-task' },
    });

    expect(responses).toEqual([]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stale-task');
    client.dispose();
  });

  it('rejects cancellation deterministically and ignores a late output', async () => {
    const responses: WorkerResponse[] = [];
    const client = new PdfWorkerClient({ workerFactory, onResponse: response => responses.push(response) });
    const worker = createdWorkers[0];
    const handle = client.extractPages([], []);

    handle.cancel();
    const cancelRequest = worker.postMessage.mock.calls[1]?.[0] as Record<string, unknown>;
    expect(cancelRequest.type).toBe('CANCEL_TASK');
    expect(cancelRequest.taskId).toBe(handle.taskId);
    await expect(handle.promise).rejects.toBeInstanceOf(PdfDomainError);

    dispatch(worker, {
      type: 'OUTPUT_READY',
      sessionId: client.sessionId,
      taskId: handle.taskId,
      payload: { operation: 'extract', blob: new Blob(['late']) },
    });
    expect(responses).toEqual([]);
    client.dispose();
  });

  it('maps worker failure and can restart into a new session', () => {
    const errors: PdfDomainError[] = [];
    const restarts: string[] = [];
    const client = new PdfWorkerClient({
      workerFactory,
      onError: error => errors.push(error),
      onRestart: (_worker, sessionId) => restarts.push(sessionId),
    });
    const oldWorker = createdWorkers[0];
    const oldSession = client.sessionId;
    const handle = client.mergeFiles([]);

    oldWorker.onerror?.({ message: 'worker exploded' } as ErrorEvent);

    expect(errors[0]?.code).toBe('WORKER_RUNTIME_FAILED');
    expect(oldWorker.terminate).toHaveBeenCalledTimes(1);
    expect(client.activeTaskIds).toEqual([]);
    expect(client.sessionId).toBe(oldSession);

    client.restart();

    expect(createdWorkers).toHaveLength(2);
    expect(client.sessionId).not.toBe(oldSession);
    expect(restarts).toEqual([client.sessionId]);
    expect(handle.taskId).toBeTruthy();
    client.dispose();
  });
});
