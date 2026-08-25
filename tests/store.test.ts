import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdfStore, pdfResourceRegistry } from '../store';
import type { PageItem, PdfFile } from '../types';

const workers: FakeWorker[] = [];
let createObjectUrlCount = 0;
const createObjectURL = vi.fn(() => `blob:created-${++createObjectUrlCount}`);
const revokeObjectURL = vi.fn();
const NativeURL = globalThis.URL;

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor(public readonly url: unknown) {
    workers.push(this);
  }
}

const makeFile = (id: string, thumbnails: string[] = []): PdfFile => ({
  id,
  file: {} as File,
  name: `${id}.pdf`,
  size: '1.00 MB',
  pageCount: Math.max(1, thumbnails.length),
  thumbnails,
  status: 'ready',
  type: 'pdf',
});

const makePage = (uniqueId: string, fileId: string): PageItem => ({
  uniqueId,
  fileId,
  pageIndex: 0,
  thumb: '',
  rotation: 0,
});

const resetStoreState = () => {
  usePdfStore.getState().workerClient?.dispose();
  pdfResourceRegistry.releaseAll();
  usePdfStore.setState({
    files: [],
    pageOrder: [],
    selectedPageIds: [],
    currentPage: 1,
    worker: null,
    workerClient: null,
    sessionId: null,
    parseTaskIds: {},
    saveTaskId: null,
    extractTaskId: null,
    mergedUrl: null,
    extractedUrl: null,
    isSaving: false,
    isExtracting: false,
    history: { past: [], future: [] },
    toasts: [],
  });
};

function dispatch(worker: FakeWorker, data: unknown) {
  worker.onmessage?.({ data } as MessageEvent);
}

describe('PDF store lifecycle hardening', () => {
  beforeEach(() => {
    workers.length = 0;
    createObjectUrlCount = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    const TestURL = class extends NativeURL {};
    TestURL.createObjectURL = createObjectURL;
    TestURL.revokeObjectURL = revokeObjectURL;
    vi.stubGlobal('URL', TestURL);
    resetStoreState();
  });

  afterEach(() => {
    usePdfStore.getState().workerClient?.dispose();
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('ignores file reorders when the drop target no longer exists', () => {
    usePdfStore.setState({ files: [makeFile('a'), makeFile('b')] });

    usePdfStore.getState().reorderFiles('a', 'missing');

    expect(usePdfStore.getState().files.map(file => file.id)).toEqual(['a', 'b']);
  });

  it('preserves a generated output when an invalid file reorder is a no-op', () => {
    usePdfStore.setState({
      files: [makeFile('a'), makeFile('b')],
      mergedUrl: 'blob:valid-output',
    });

    usePdfStore.getState().reorderFiles('a', 'missing');

    expect(usePdfStore.getState().mergedUrl).toBe('blob:valid-output');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:valid-output');
  });

  it('preserves a generated output when undo and redo have no available history', () => {
    usePdfStore.setState({
      mergedUrl: 'blob:valid-output',
      history: { past: [], future: [] },
    });

    usePdfStore.getState().undo();
    usePdfStore.getState().redo();

    expect(usePdfStore.getState().mergedUrl).toBe('blob:valid-output');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:valid-output');
  });

  it('preserves a generated output for invalid or empty page mutations', () => {
    const page = makePage('page-a', 'a');
    usePdfStore.setState({
      pageOrder: [page],
      selectedPageIds: [],
      mergedUrl: 'blob:valid-output',
    });

    usePdfStore.getState().rotatePage('missing-page');
    usePdfStore.getState().removePage('missing-page');
    usePdfStore.getState().rotateSelectedPages();
    usePdfStore.getState().removeSelectedPages();

    expect(usePdfStore.getState().pageOrder).toEqual([page]);
    expect(usePdfStore.getState().mergedUrl).toBe('blob:valid-output');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:valid-output');
  });

  it('removes page state and releases file/output URLs when a file is removed', () => {
    const page = makePage('page-a', 'a');
    usePdfStore.setState({
      files: [makeFile('a', ['blob:thumb-a'])],
      pageOrder: [page],
      selectedPageIds: ['page-a'],
      mergedUrl: 'blob:merged-old',
      history: { past: [[page]], future: [[page]] },
    });

    usePdfStore.getState().removeFile('a');

    const state = usePdfStore.getState();
    expect(state.files).toEqual([]);
    expect(state.pageOrder).toEqual([]);
    expect(state.selectedPageIds).toEqual([]);
    expect(state.history).toEqual({ past: [], future: [] });
    expect(state.mergedUrl).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:thumb-a');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:merged-old');
  });

  it('terminates the active worker and starts a clean worker on reset', () => {
    const existingWorker = new FakeWorker('existing-worker');
    usePdfStore.setState({
      worker: existingWorker as unknown as Worker,
      files: [makeFile('a', ['blob:thumb-a'])],
      mergedUrl: 'blob:merged-old',
      extractedUrl: 'blob:extract-old',
      currentPage: 3,
    });

    usePdfStore.getState().resetAll();

    const state = usePdfStore.getState();
    expect(existingWorker.terminate).toHaveBeenCalledTimes(1);
    expect(workers).toHaveLength(2);
    expect(state.worker).toBe(workers[1] as unknown as Worker);
    expect(state.files).toEqual([]);
    expect(state.pageOrder).toEqual([]);
    expect(state.currentPage).toBe(1);
    expect(state.mergedUrl).toBeNull();
    expect(state.extractedUrl).toBeNull();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:thumb-a');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:merged-old');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:extract-old');
  });

  it('ignores a parse response captured before reset', () => {
    const input = new File(['%PDF-1.7'], 'document.pdf', { type: 'application/pdf' });
    usePdfStore.getState().addFiles([input]);
    const beforeReset = usePdfStore.getState();
    const oldWorker = workers[0];
    const oldOnMessage = oldWorker.onmessage;
    const oldTaskId = beforeReset.parseTaskIds[beforeReset.files[0].id];
    const oldSessionId = beforeReset.sessionId;

    usePdfStore.getState().resetAll();
    oldOnMessage?.({
      data: {
        type: 'FILE_PARSED',
        sessionId: oldSessionId,
        taskId: oldTaskId,
        payload: { fileId: beforeReset.files[0].id, pageCount: 99 },
      },
    } as MessageEvent);

    expect(usePdfStore.getState().files).toEqual([]);
    expect(usePdfStore.getState().sessionId).not.toBe(oldSessionId);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('ignores an output response captured before reset', () => {
    usePdfStore.getState().initWorker();
    const oldWorker = workers[0];
    const oldOnMessage = oldWorker.onmessage;
    const file = makeFile('a');
    const page = makePage('page-a', 'a');
    usePdfStore.setState({ files: [file], pageOrder: [page] });
    usePdfStore.getState().mergePages();

    const beforeReset = usePdfStore.getState();
    const oldTaskId = beforeReset.saveTaskId;
    const oldSessionId = beforeReset.sessionId;
    usePdfStore.getState().resetAll();
    oldOnMessage?.({
      data: {
        type: 'OUTPUT_READY',
        sessionId: oldSessionId,
        taskId: oldTaskId,
        payload: { operation: 'merge', blob: new Blob(['stale']) },
      },
    } as MessageEvent);

    expect(usePdfStore.getState().mergedUrl).toBeNull();
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('accepts a current typed parse response and owns the generated thumbnail URL', () => {
    const input = new File(['%PDF-1.7'], 'document.pdf', { type: 'application/pdf' });
    usePdfStore.getState().addFiles([input]);
    const state = usePdfStore.getState();
    const entry = state.files[0];
    const worker = workers[0];
    const taskId = state.parseTaskIds[entry.id];

    dispatch(worker, {
      type: 'FILE_PARSED',
      sessionId: state.sessionId,
      taskId,
      payload: { fileId: entry.id, pageCount: 1 },
    });
    dispatch(worker, {
      type: 'THUMBNAIL_GENERATED',
      sessionId: state.sessionId,
      taskId,
      payload: { fileId: entry.id, pageIndex: 0, blob: new Blob(['thumb']) },
    });
    dispatch(worker, {
      type: 'TASK_COMPLETED',
      sessionId: state.sessionId,
      taskId,
      payload: { operation: 'parse' },
    });

    const result = usePdfStore.getState();
    expect(result.files[0]?.pageCount).toBe(1);
    expect(result.files[0]?.status).toBe('ready');
    expect(result.files[0]?.thumbnails[0]).toBe('blob:created-1');
    expect(pdfResourceRegistry.ownedUrlCount()).toBe(1);
  });

  it('ignores stale session responses before creating any object URL', () => {
    const input = new File(['%PDF-1.7'], 'document.pdf', { type: 'application/pdf' });
    usePdfStore.getState().addFiles([input]);
    const state = usePdfStore.getState();
    const entry = state.files[0];
    const worker = workers[0];
    const taskId = state.parseTaskIds[entry.id];

    dispatch(worker, {
      type: 'THUMBNAIL_GENERATED',
      sessionId: 'stale-session',
      taskId,
      payload: { fileId: entry.id, pageIndex: 0, blob: new Blob(['stale']) },
    });

    expect(usePdfStore.getState().files[0]?.thumbnails).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('rejects a late response for a removed file without restoring state', () => {
    const input = new File(['%PDF-1.7'], 'document.pdf', { type: 'application/pdf' });
    usePdfStore.getState().addFiles([input]);
    const state = usePdfStore.getState();
    const entry = state.files[0];
    const worker = workers[0];
    const taskId = state.parseTaskIds[entry.id];

    usePdfStore.getState().removeFile(entry.id);
    dispatch(worker, {
      type: 'FILE_PARSED',
      sessionId: state.sessionId,
      taskId,
      payload: { fileId: entry.id, pageCount: 20 },
    });
    dispatch(worker, {
      type: 'THUMBNAIL_GENERATED',
      sessionId: state.sessionId,
      taskId,
      payload: { fileId: entry.id, pageIndex: 0, blob: new Blob(['stale']) },
    });

    expect(usePdfStore.getState().files).toEqual([]);
    expect(usePdfStore.getState().pageOrder).toEqual([]);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('does not dispatch a second save while a save is already active', () => {
    usePdfStore.getState().initWorker();
    const worker = workers[0];
    usePdfStore.setState({
      files: [makeFile('a')],
      pageOrder: [makePage('page-a', 'a')],
      isSaving: true,
      saveTaskId: 'existing-task',
    });

    usePdfStore.getState().mergePages();

    expect(worker.postMessage).not.toHaveBeenCalled();
  });
});
