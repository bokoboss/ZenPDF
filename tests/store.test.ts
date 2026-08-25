import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdfStore, pdfResourceRegistry } from '../store';
import {
  EXTRACTED_OUTPUT_OWNER,
  MERGED_OUTPUT_OWNER,
  thumbnailOwner,
} from '../src/pdf/resources';
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

  it('resets after FILE_PARSED and ignores thumbnails from the disposed parse session', () => {
    const input = new File(['%PDF-1.7'], 'document.pdf', { type: 'application/pdf' });
    usePdfStore.getState().addFiles([input]);
    const beforeReset = usePdfStore.getState();
    const oldWorker = workers[0];
    const oldOnMessage = oldWorker.onmessage;
    const entry = beforeReset.files[0];
    const taskId = beforeReset.parseTaskIds[entry.id];
    const oldSessionId = beforeReset.sessionId;

    dispatch(oldWorker, {
      type: 'FILE_PARSED',
      sessionId: oldSessionId,
      taskId,
      payload: { fileId: entry.id, pageCount: 2 },
    });
    expect(usePdfStore.getState().files[0]?.pageCount).toBe(2);

    usePdfStore.getState().resetAll();
    oldOnMessage?.({
      data: {
        type: 'THUMBNAIL_GENERATED',
        sessionId: oldSessionId,
        taskId,
        payload: { fileId: entry.id, pageIndex: 0, blob: new Blob(['late-thumb']) },
      },
    } as MessageEvent);
    oldOnMessage?.({
      data: {
        type: 'TASK_COMPLETED',
        sessionId: oldSessionId,
        taskId,
        payload: { operation: 'parse' },
      },
    } as MessageEvent);

    const afterReset = usePdfStore.getState();
    expect(afterReset.files).toEqual([]);
    expect(afterReset.pageOrder).toEqual([]);
    expect(afterReset.parseTaskIds).toEqual({});
    expect(afterReset.mergedUrl).toBeNull();
    expect(afterReset.extractedUrl).toBeNull();
    expect(afterReset.isSaving).toBe(false);
    expect(afterReset.isExtracting).toBe(false);
    expect(afterReset.sessionId).not.toBe(oldSessionId);
    expect(pdfResourceRegistry.ownedUrlCount()).toBe(0);
  });

  it('resets an active merge and keeps late output from resurrecting it', () => {
    usePdfStore.getState().initWorker();
    const oldWorker = workers[0];
    const oldOnMessage = oldWorker.onmessage;
    const file = makeFile('merge-file');
    const page = makePage('merge-page', file.id);
    usePdfStore.setState({ files: [file], pageOrder: [page] });
    usePdfStore.getState().mergePages();

    const beforeReset = usePdfStore.getState();
    const oldTaskId = beforeReset.saveTaskId;
    const oldSessionId = beforeReset.sessionId;
    expect(beforeReset.isSaving).toBe(true);

    usePdfStore.getState().resetAll();
    oldOnMessage?.({
      data: {
        type: 'OUTPUT_READY',
        sessionId: oldSessionId,
        taskId: oldTaskId,
        payload: { operation: 'merge', blob: new Blob(['late-merge']) },
      },
    } as MessageEvent);

    const afterReset = usePdfStore.getState();
    expect(afterReset.mergedUrl).toBeNull();
    expect(afterReset.isSaving).toBe(false);
    expect(afterReset.saveTaskId).toBeNull();
    expect(afterReset.workerClient?.activeTaskIds).toEqual([]);
    expect(pdfResourceRegistry.ownedUrlCount()).toBe(0);
  });

  it('resets an active extract and prevents the old result replacing a new result', () => {
    usePdfStore.getState().initWorker();
    const oldWorker = workers[0];
    const oldOnMessage = oldWorker.onmessage;
    const file = makeFile('extract-file');
    const page = makePage('extract-page', file.id);
    usePdfStore.setState({
      files: [file],
      pageOrder: [page],
      selectedPageIds: [page.uniqueId],
    });
    usePdfStore.getState().extractSelectedPages();

    const beforeReset = usePdfStore.getState();
    const oldTaskId = beforeReset.extractTaskId;
    const oldSessionId = beforeReset.sessionId;
    expect(beforeReset.isExtracting).toBe(true);

    usePdfStore.getState().resetAll();
    const newFile = makeFile('new-extract-file');
    const newPage = makePage('new-extract-page', newFile.id);
    usePdfStore.setState({
      files: [newFile],
      pageOrder: [newPage],
      selectedPageIds: [newPage.uniqueId],
    });
    const newWorker = workers[1];
    usePdfStore.getState().extractSelectedPages();
    const newState = usePdfStore.getState();
    const newTaskId = newState.extractTaskId;

    dispatch(newWorker, {
      type: 'OUTPUT_READY',
      sessionId: newState.sessionId,
      taskId: newTaskId,
      payload: { operation: 'extract', blob: new Blob(['new-extract']) },
    });
    const acceptedUrl = usePdfStore.getState().extractedUrl;

    oldOnMessage?.({
      data: {
        type: 'OUTPUT_READY',
        sessionId: oldSessionId,
        taskId: oldTaskId,
        payload: { operation: 'extract', blob: new Blob(['late-extract']) },
      },
    } as MessageEvent);

    const finalState = usePdfStore.getState();
    expect(acceptedUrl).toBe('blob:created-1');
    expect(finalState.extractedUrl).toBe(acceptedUrl);
    expect(finalState.isExtracting).toBe(false);
    expect(finalState.extractTaskId).toBeNull();
    expect(pdfResourceRegistry.ownedUrlCount()).toBe(1);
  });

  it('clears active parse task state and accepts new work after worker recovery', () => {
    const input = new File(['%PDF-1.7'], 'document.pdf', { type: 'application/pdf' });
    usePdfStore.getState().addFiles([input]);
    const beforeFailure = usePdfStore.getState();
    const oldWorker = workers[0];
    const oldSessionId = beforeFailure.sessionId;
    expect(Object.keys(beforeFailure.parseTaskIds)).toHaveLength(1);

    oldWorker.onerror?.({ message: 'worker exploded' } as ErrorEvent);

    expect(usePdfStore.getState().parseTaskIds).toEqual({});
    expect(usePdfStore.getState().isSaving).toBe(false);
    expect(usePdfStore.getState().isExtracting).toBe(false);

    usePdfStore.getState().restartWorker();
    const recovered = usePdfStore.getState();
    expect(recovered.sessionId).not.toBe(oldSessionId);
    expect(recovered.parseTaskIds).toEqual({});
    expect(recovered.worker).toBe(workers[1] as unknown as Worker);

    const recoveredInput = new File(['%PDF-1.7'], 'recovered.pdf', { type: 'application/pdf' });
    usePdfStore.getState().addFiles([recoveredInput]);
    const afterRecovery = usePdfStore.getState();
    const recoveredEntry = afterRecovery.files.find(file => file.name === 'recovered.pdf');
    const recoveredTaskId = recoveredEntry && afterRecovery.parseTaskIds[recoveredEntry.id];
    const recoveredWorker = workers[1];

    dispatch(recoveredWorker, {
      type: 'FILE_PARSED',
      sessionId: afterRecovery.sessionId,
      taskId: recoveredTaskId,
      payload: { fileId: recoveredEntry?.id, pageCount: 1 },
    });
    dispatch(recoveredWorker, {
      type: 'THUMBNAIL_GENERATED',
      sessionId: afterRecovery.sessionId,
      taskId: recoveredTaskId,
      payload: { fileId: recoveredEntry?.id, pageIndex: 0, blob: new Blob(['recovered-thumb']) },
    });
    dispatch(recoveredWorker, {
      type: 'TASK_COMPLETED',
      sessionId: afterRecovery.sessionId,
      taskId: recoveredTaskId,
      payload: { operation: 'parse' },
    });

    const finalState = usePdfStore.getState();
    expect(finalState.files.find(file => file.name === 'recovered.pdf')?.status).toBe('ready');
    expect(finalState.parseTaskIds).toEqual({});
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

  it('removes a parsing file while preserving an unrelated file and its resources', () => {
    const firstInput = new File(['%PDF-1.7'], 'first.pdf', { type: 'application/pdf' });
    const secondInput = new File(['%PDF-1.7'], 'second.pdf', { type: 'application/pdf' });
    usePdfStore.getState().addFiles([firstInput, secondInput]);
    const beforeRemove = usePdfStore.getState();
    const first = beforeRemove.files[0];
    const second = beforeRemove.files[1];
    const worker = workers[0];
    const firstTaskId = beforeRemove.parseTaskIds[first.id];
    const secondTaskId = beforeRemove.parseTaskIds[second.id];

    dispatch(worker, {
      type: 'FILE_PARSED',
      sessionId: beforeRemove.sessionId,
      taskId: firstTaskId,
      payload: { fileId: first.id, pageCount: 1 },
    });
    dispatch(worker, {
      type: 'THUMBNAIL_GENERATED',
      sessionId: beforeRemove.sessionId,
      taskId: firstTaskId,
      payload: { fileId: first.id, pageIndex: 0, blob: new Blob(['first-thumb']) },
    });
    expect(pdfResourceRegistry.ownedUrlCount()).toBe(1);

    usePdfStore.getState().removeFile(first.id);
    expect(worker.postMessage.mock.calls.some(([request]) => (
      request.type === 'CANCEL_TASK' && request.payload.targetTaskId === firstTaskId
    ))).toBe(true);

    dispatch(worker, {
      type: 'THUMBNAIL_GENERATED',
      sessionId: beforeRemove.sessionId,
      taskId: firstTaskId,
      payload: { fileId: first.id, pageIndex: 0, blob: new Blob(['late-first-thumb']) },
    });
    dispatch(worker, {
      type: 'FILE_PARSED',
      sessionId: beforeRemove.sessionId,
      taskId: secondTaskId,
      payload: { fileId: second.id, pageCount: 1 },
    });
    dispatch(worker, {
      type: 'THUMBNAIL_GENERATED',
      sessionId: beforeRemove.sessionId,
      taskId: secondTaskId,
      payload: { fileId: second.id, pageIndex: 0, blob: new Blob(['second-thumb']) },
    });
    dispatch(worker, {
      type: 'TASK_COMPLETED',
      sessionId: beforeRemove.sessionId,
      taskId: secondTaskId,
      payload: { operation: 'parse' },
    });

    const finalState = usePdfStore.getState();
    expect(finalState.files).toHaveLength(1);
    expect(finalState.files[0]?.id).toBe(second.id);
    expect(finalState.files[0]?.status).toBe('ready');
    expect(finalState.files[0]?.thumbnails).toEqual(['blob:created-2']);
    expect(finalState.pageOrder.every(page => page.fileId !== first.id)).toBe(true);
    expect(finalState.parseTaskIds).toEqual({});
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:created-1');
    expect(pdfResourceRegistry.ownedUrlCount()).toBe(1);
  });

  it('settles store busy flags and task IDs after typed save and extract errors', () => {
    usePdfStore.getState().initWorker();
    const worker = workers[0];
    const file = makeFile('error-file');
    const page = makePage('error-page', file.id);
    usePdfStore.setState({ files: [file], pageOrder: [page], selectedPageIds: [page.uniqueId] });

    usePdfStore.getState().mergePages();
    let state = usePdfStore.getState();
    const saveTaskId = state.saveTaskId;
    dispatch(worker, {
      type: 'TASK_ERROR',
      sessionId: state.sessionId,
      taskId: saveTaskId,
      payload: {
        code: 'PDF_WRITE_FAILED',
        message: 'write failed',
        userMessage: 'The PDF could not be generated.',
      },
    });
    state = usePdfStore.getState();
    expect(state.isSaving).toBe(false);
    expect(state.saveTaskId).toBeNull();

    usePdfStore.getState().extractSelectedPages();
    state = usePdfStore.getState();
    const extractTaskId = state.extractTaskId;
    dispatch(worker, {
      type: 'TASK_ERROR',
      sessionId: state.sessionId,
      taskId: extractTaskId,
      payload: {
        code: 'PDF_WRITE_FAILED',
        message: 'extract failed',
        userMessage: 'The PDF could not be generated.',
      },
    });
    state = usePdfStore.getState();
    expect(state.isExtracting).toBe(false);
    expect(state.extractTaskId).toBeNull();
  });

  it('does not let a cancelled save output replace a newer accepted save', () => {
    usePdfStore.getState().initWorker();
    const worker = workers[0];
    const file = makeFile('replace-file');
    const page = makePage('replace-page', file.id);
    usePdfStore.setState({ files: [file], pageOrder: [page] });

    usePdfStore.getState().mergePages();
    const firstState = usePdfStore.getState();
    const firstTaskId = firstState.saveTaskId;
    usePdfStore.getState().rotatePage(page.uniqueId);
    usePdfStore.getState().mergePages();
    const secondState = usePdfStore.getState();
    const secondTaskId = secondState.saveTaskId;
    expect(secondTaskId).not.toBe(firstTaskId);

    dispatch(worker, {
      type: 'OUTPUT_READY',
      sessionId: secondState.sessionId,
      taskId: firstTaskId,
      payload: { operation: 'merge', blob: new Blob(['old-save']) },
    });
    expect(usePdfStore.getState().mergedUrl).toBeNull();

    dispatch(worker, {
      type: 'OUTPUT_READY',
      sessionId: secondState.sessionId,
      taskId: secondTaskId,
      payload: { operation: 'merge', blob: new Blob(['new-save']) },
    });
    expect(usePdfStore.getState().mergedUrl).toBe('blob:created-1');
    expect(usePdfStore.getState().isSaving).toBe(false);
    expect(usePdfStore.getState().saveTaskId).toBeNull();
  });

  it('keeps repeated merge and extract replacement ownership bounded', () => {
    usePdfStore.getState().initWorker();
    const worker = workers[0];
    const file = makeFile('loop-file');
    const page = makePage('loop-page', file.id);
    usePdfStore.setState({
      files: [file],
      pageOrder: [page],
      selectedPageIds: [page.uniqueId],
    });

    for (let iteration = 0; iteration < 8; iteration += 1) {
      usePdfStore.getState().mergePages();
      const mergeState = usePdfStore.getState();
      dispatch(worker, {
        type: 'OUTPUT_READY',
        sessionId: mergeState.sessionId,
        taskId: mergeState.saveTaskId,
        payload: { operation: 'merge', blob: new Blob([`merge-${iteration}`]) },
      });
      expect(pdfResourceRegistry.ownedUrlCount()).toBe(1);
    }
    usePdfStore.getState().setMergedUrl(null);
    expect(pdfResourceRegistry.ownedUrlCount()).toBe(0);

    for (let iteration = 0; iteration < 8; iteration += 1) {
      usePdfStore.getState().extractSelectedPages();
      const extractState = usePdfStore.getState();
      dispatch(worker, {
        type: 'OUTPUT_READY',
        sessionId: extractState.sessionId,
        taskId: extractState.extractTaskId,
        payload: { operation: 'extract', blob: new Blob([`extract-${iteration}`]) },
      });
      expect(pdfResourceRegistry.ownedUrlCount()).toBe(1);
    }
    usePdfStore.getState().resetAll();
    expect(pdfResourceRegistry.ownedUrlCount()).toBe(0);
    expect(usePdfStore.getState().files).toEqual([]);
    expect(usePdfStore.getState().saveTaskId).toBeNull();
    expect(usePdfStore.getState().extractTaskId).toBeNull();
  });

  it('keeps repeated add/remove and reset/reinitialize loops bounded', () => {
    usePdfStore.getState().initWorker();

    for (let iteration = 0; iteration < 8; iteration += 1) {
      const input = new File([`%PDF-1.7-${iteration}`], `loop-${iteration}.pdf`, { type: 'application/pdf' });
      usePdfStore.getState().addFiles([input]);
      const state = usePdfStore.getState();
      const entry = state.files[state.files.length - 1];
      const taskId = state.parseTaskIds[entry.id];
      const worker = state.worker as unknown as FakeWorker;
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
        payload: { fileId: entry.id, pageIndex: 0, blob: new Blob([`thumb-${iteration}`]) },
      });
      dispatch(worker, {
        type: 'TASK_COMPLETED',
        sessionId: state.sessionId,
        taskId,
        payload: { operation: 'parse' },
      });
      expect(pdfResourceRegistry.ownedUrlCount()).toBe(1);

      usePdfStore.getState().removeFile(entry.id);
      expect(usePdfStore.getState().files.some(file => file.id === entry.id)).toBe(false);
      expect(usePdfStore.getState().parseTaskIds).toEqual({});
      expect(pdfResourceRegistry.ownedUrlCount()).toBe(0);
    }

    for (let iteration = 0; iteration < 8; iteration += 1) {
      const fileId = `reset-${iteration}`;
      const thumbUrl = pdfResourceRegistry.create(thumbnailOwner(fileId, 0), new Blob([`thumb-${iteration}`]));
      const mergedUrl = pdfResourceRegistry.create(MERGED_OUTPUT_OWNER, new Blob([`merge-${iteration}`]));
      const extractedUrl = pdfResourceRegistry.create(EXTRACTED_OUTPUT_OWNER, new Blob([`extract-${iteration}`]));
      const page = makePage(`reset-page-${iteration}`, fileId);
      usePdfStore.setState({
        files: [makeFile(fileId, [thumbUrl])],
        pageOrder: [page],
        selectedPageIds: [page.uniqueId],
        mergedUrl,
        extractedUrl,
        parseTaskIds: { [fileId]: `parse-${iteration}` },
        saveTaskId: `save-${iteration}`,
        extractTaskId: `extract-${iteration}`,
        isSaving: true,
        isExtracting: true,
      });
      expect(pdfResourceRegistry.ownedUrlCount()).toBe(3);

      usePdfStore.getState().resetAll();
      const state = usePdfStore.getState();
      expect(pdfResourceRegistry.ownedUrlCount()).toBe(0);
      expect(state.files).toEqual([]);
      expect(state.pageOrder).toEqual([]);
      expect(state.parseTaskIds).toEqual({});
      expect(state.saveTaskId).toBeNull();
      expect(state.extractTaskId).toBeNull();
      expect(state.isSaving).toBe(false);
      expect(state.isExtracting).toBe(false);
    }
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
