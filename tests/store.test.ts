import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { usePdfStore } from '../store';
import type { PageItem, PdfFile } from '../types';

const workers: FakeWorker[] = [];
const createObjectURL = vi.fn(() => 'blob:worker-script');
const revokeObjectURL = vi.fn();

class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  onmessageerror: ((event: MessageEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  constructor(public readonly url: string) {
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
  type: 'pdf'
});

const makePage = (uniqueId: string, fileId: string): PageItem => ({
  uniqueId,
  fileId,
  pageIndex: 0,
  thumb: '',
  rotation: 0
});

const resetStoreState = () => {
  usePdfStore.setState({
    files: [],
    pageOrder: [],
    selectedPageIds: [],
    currentPage: 1,
    worker: null,
    mergedUrl: null,
    extractedUrl: null,
    isSaving: false,
    isExtracting: false,
    history: { past: [], future: [] },
    toasts: []
  });
};

describe('PDF store lifecycle hardening', () => {
  beforeEach(() => {
    workers.length = 0;
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.stubGlobal('Worker', FakeWorker);
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    resetStoreState();
  });

  afterEach(() => {
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
      mergedUrl: 'blob:valid-output'
    });

    usePdfStore.getState().reorderFiles('a', 'missing');

    expect(usePdfStore.getState().mergedUrl).toBe('blob:valid-output');
    expect(revokeObjectURL).not.toHaveBeenCalledWith('blob:valid-output');
  });

  it('preserves a generated output when undo and redo have no available history', () => {
    usePdfStore.setState({
      mergedUrl: 'blob:valid-output',
      history: { past: [], future: [] }
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
      mergedUrl: 'blob:valid-output'
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
      history: { past: [[page]], future: [[page]] }
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
    const existingWorker = new FakeWorker('blob:existing-worker');
    usePdfStore.setState({
      worker: existingWorker as unknown as Worker,
      files: [makeFile('a', ['blob:thumb-a'])],
      mergedUrl: 'blob:merged-old',
      extractedUrl: 'blob:extract-old',
      currentPage: 3
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

  it('releases a thumbnail response for a file that no longer exists', () => {
    usePdfStore.getState().initWorker();
    const worker = workers[0];

    worker.onmessage?.({
      data: {
        type: 'THUMBNAIL_GENERATED',
        payload: { fileId: 'removed-file', pageIndex: 0, url: 'blob:stale-thumb' }
      }
    } as MessageEvent);

    expect(usePdfStore.getState().files).toEqual([]);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stale-thumb');
  });

  it('does not repopulate editor pages from a parsed response for a removed file', () => {
    usePdfStore.setState({ currentPage: 3 });
    usePdfStore.getState().initWorker();
    const worker = workers[0];

    worker.onmessage?.({
      data: {
        type: 'FILE_PARSED',
        payload: { fileId: 'removed-file', pageCount: 25 }
      }
    } as MessageEvent);

    expect(usePdfStore.getState().pageOrder).toEqual([]);
  });

  it('invalidates an existing generated output when page content changes', () => {
    const page = makePage('page-a', 'a');
    usePdfStore.setState({
      pageOrder: [page],
      mergedUrl: 'blob:generated-output'
    });

    usePdfStore.getState().rotatePage('page-a');

    const state = usePdfStore.getState();
    expect(state.mergedUrl).toBeNull();
    expect(state.pageOrder[0]?.rotation).toBe(90);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:generated-output');
  });

  it('does not dispatch a second save while a save is already active', () => {
    usePdfStore.getState().initWorker();
    const worker = workers[0];
    usePdfStore.setState({
      files: [makeFile('a')],
      pageOrder: [makePage('page-a', 'a')],
      isSaving: true
    });

    usePdfStore.getState().mergePages();

    expect(worker.postMessage).not.toHaveBeenCalled();
  });
});
