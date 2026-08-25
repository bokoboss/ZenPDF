import { arrayMove } from '@dnd-kit/sortable';
import { create } from 'zustand';
import { generateId } from './utils';
import type { PageItem, PdfFile, Toast } from './types';
import { PdfDomainError } from './src/pdf/errors';
import type { WorkerResponse } from './src/pdf/protocol';
import { PdfWorkerClient } from './src/pdf/workerClient';
import {
  EXTRACTED_OUTPUT_OWNER,
  MERGED_OUTPUT_OWNER,
  ResourceRegistry,
  thumbnailOwner,
} from './src/pdf/resources';

export const pdfResourceRegistry = new ResourceRegistry();

interface PdfStore {
  files: PdfFile[];
  pageOrder: PageItem[];
  selectedPageIds: string[];
  currentPage: number;
  worker: Worker | null;
  workerClient: PdfWorkerClient | null;
  sessionId: string | null;
  parseTaskIds: Record<string, string>;
  saveTaskId: string | null;
  extractTaskId: string | null;
  mergedUrl: string | null;
  extractedUrl: string | null;
  isSaving: boolean;
  isExtracting: boolean;
  history: { past: PageItem[][]; future: PageItem[][] };
  toasts: Toast[];

  initWorker: () => void;
  restartWorker: () => void;
  resetAll: () => void;
  addFiles: (newFiles: File[]) => void;
  removeFile: (id: string) => void;
  reorderFiles: (activeId: string, overId: string) => void;
  setPage: (page: number) => void;
  updateFileStatus: (id: string, updates: Partial<PdfFile>) => void;
  addThumbnail: (id: string, index: number, url: string) => void;

  initPageEditor: () => void;
  reorderPages: (activeId: string, overId: string) => void;
  moveSelectedPages: (activeId: string, overId: string) => void;
  rotatePage: (uniqueId: string) => void;
  removePage: (uniqueId: string) => void;

  togglePageSelection: (uniqueId: string) => void;
  setPageSelection: (ids: string[]) => void;
  selectAllPages: () => void;
  deselectAllPages: () => void;
  rotateSelectedPages: () => void;
  removeSelectedPages: () => void;
  extractSelectedPages: () => void;

  undo: () => void;
  redo: () => void;

  mergeFiles: () => void;
  mergePages: () => void;
  setMergedUrl: (url: string | null) => void;

  addToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  removeToast: (id: string) => void;
}

function thumbnailUrls(files: PdfFile[]): string[] {
  return files.flatMap(file => file.thumbnails);
}

export const usePdfStore = create<PdfStore>((set, get) => {
  const releaseMergedOutput = () => {
    const { mergedUrl } = get();
    pdfResourceRegistry.release(MERGED_OUTPUT_OWNER, [mergedUrl]);
    set({ mergedUrl: null });
  };

  const releaseExtractedOutput = () => {
    const { extractedUrl } = get();
    pdfResourceRegistry.release(EXTRACTED_OUTPUT_OWNER, [extractedUrl]);
    set({ extractedUrl: null });
  };

  const invalidateMergedOutput = () => {
    const { workerClient, saveTaskId } = get();
    if (saveTaskId) workerClient?.cancel(saveTaskId);
    releaseMergedOutput();
    set({ isSaving: false, saveTaskId: null });
  };

  const failParseFiles = (fileIds: Iterable<string>) => {
    const failedFileIds = new Set(fileIds);
    const current = get();
    const failedFiles = current.files.filter(file => failedFileIds.has(file.id));
    const removedPageIds = new Set(
      current.pageOrder
        .filter(page => failedFileIds.has(page.fileId))
        .map(page => page.uniqueId),
    );

    failedFiles.forEach(file => pdfResourceRegistry.releaseFile(file.id, file.thumbnails));
    set(state => ({
      files: state.files.map(file => failedFileIds.has(file.id)
        ? { ...file, pageCount: 0, thumbnails: [], status: 'error' as const }
        : file),
      pageOrder: state.pageOrder.filter(page => !failedFileIds.has(page.fileId)),
      selectedPageIds: state.selectedPageIds.filter(id => !removedPageIds.has(id)),
      parseTaskIds: Object.fromEntries(
        Object.entries(state.parseTaskIds).filter(([id]) => !failedFileIds.has(id)),
      ),
    }));
  };

  const handleWorkerResponse = (client: PdfWorkerClient, response: WorkerResponse) => {
    const state = get();
    if (state.workerClient !== client || state.sessionId !== response.sessionId) return;

    switch (response.type) {
      case 'FILE_PARSED': {
        const { fileId, pageCount } = response.payload;
        if (get().parseTaskIds[fileId] !== response.taskId) return;
        if (!get().files.some(file => file.id === fileId)) return;

        set(current => {
          const updatedFiles = current.files.map(file => (
            file.id === fileId
              ? { ...file, pageCount, thumbnails: new Array(pageCount).fill('') }
              : file
          ));
          let newPageOrder = current.pageOrder;
          if (current.currentPage === 3 && !current.pageOrder.some(page => page.fileId === fileId)) {
            const newItems: PageItem[] = [];
            for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
              newItems.push({ uniqueId: generateId(), fileId, pageIndex, thumb: '', rotation: 0 });
            }
            newPageOrder = [...current.pageOrder, ...newItems];
          }
          return { files: updatedFiles, pageOrder: newPageOrder };
        });
        break;
      }

      case 'THUMBNAIL_GENERATED': {
        const { fileId, pageIndex, blob } = response.payload;
        const targetFile = get().files.find(file => file.id === fileId);
        if (
          get().parseTaskIds[fileId] !== response.taskId ||
          !targetFile ||
          pageIndex < 0 ||
          pageIndex >= targetFile.pageCount
        ) return;

        const url = pdfResourceRegistry.create(thumbnailOwner(fileId, pageIndex), blob);
        set(current => ({
          files: current.files.map(file => {
            if (file.id !== fileId) return file;
            const thumbnails = [...file.thumbnails];
            thumbnails[pageIndex] = url;
            return { ...file, thumbnails, status: 'ready' as const };
          }),
          pageOrder: current.pageOrder.map(page => (
            page.fileId === fileId && page.pageIndex === pageIndex
              ? { ...page, thumb: url }
              : page
          )),
        }));
        break;
      }

      case 'TASK_COMPLETED': {
        if (response.payload.operation !== 'parse') return;
        const fileId = Object.entries(get().parseTaskIds)
          .find(([, taskId]) => taskId === response.taskId)?.[0];
        if (!fileId || !get().files.some(file => file.id === fileId)) return;
        set(current => ({
          files: current.files.map(file => file.id === fileId
            ? { ...file, status: 'ready' as const }
            : file),
          parseTaskIds: Object.fromEntries(
            Object.entries(current.parseTaskIds).filter(([id]) => id !== fileId),
          ),
        }));
        break;
      }

      case 'OUTPUT_READY': {
        const { operation, blob } = response.payload;
        if (operation === 'extract') {
          if (get().extractTaskId !== response.taskId) return;
          const url = pdfResourceRegistry.create(EXTRACTED_OUTPUT_OWNER, blob);
          set({ extractedUrl: url, isExtracting: false, extractTaskId: null });
          get().addToast('Extraction complete!', 'success');
        } else {
          if (get().saveTaskId !== response.taskId) return;
          const url = pdfResourceRegistry.create(MERGED_OUTPUT_OWNER, blob);
          set({ mergedUrl: url, isSaving: false, saveTaskId: null });
          get().addToast('File ready!', 'success');
        }
        break;
      }

      case 'TASK_CANCELLED': {
        const parseFileId = Object.entries(get().parseTaskIds)
          .find(([, taskId]) => taskId === response.taskId)?.[0];
        if (parseFileId) {
          set(current => ({
            parseTaskIds: Object.fromEntries(
              Object.entries(current.parseTaskIds).filter(([id]) => id !== parseFileId),
            ),
          }));
        }
        if (get().saveTaskId === response.taskId) set({ isSaving: false, saveTaskId: null });
        if (get().extractTaskId === response.taskId) set({ isExtracting: false, extractTaskId: null });
        break;
      }

      case 'TASK_ERROR': {
        const parseFileId = Object.entries(get().parseTaskIds)
          .find(([, taskId]) => taskId === response.taskId)?.[0];
        if (parseFileId) {
          failParseFiles([parseFileId]);
          get().addToast(`Error: ${response.payload.userMessage}`, 'error');
        } else if (get().saveTaskId === response.taskId) {
          set({ isSaving: false, saveTaskId: null });
          get().addToast(`Error: ${response.payload.userMessage}`, 'error');
        } else if (get().extractTaskId === response.taskId) {
          set({ isExtracting: false, extractTaskId: null });
          get().addToast(`Error: ${response.payload.userMessage}`, 'error');
        }
        break;
      }

      case 'TASK_PROGRESS':
        break;
    }
  };

  const handleWorkerError = (client: PdfWorkerClient, error: PdfDomainError) => {
    if (get().workerClient !== client) return;
    const activeParseFileIds = Object.keys(get().parseTaskIds);
    failParseFiles(activeParseFileIds);
    set({
      parseTaskIds: {},
      isSaving: false,
      isExtracting: false,
      saveTaskId: null,
      extractTaskId: null,
    });
    get().addToast(error.userMessage, 'error');
  };

  const initialState: Omit<PdfStore, 'initWorker' | 'restartWorker' | 'resetAll' | 'addFiles' | 'removeFile' | 'reorderFiles' | 'setPage' | 'updateFileStatus' | 'addThumbnail' | 'initPageEditor' | 'reorderPages' | 'moveSelectedPages' | 'rotatePage' | 'removePage' | 'togglePageSelection' | 'setPageSelection' | 'selectAllPages' | 'deselectAllPages' | 'rotateSelectedPages' | 'removeSelectedPages' | 'extractSelectedPages' | 'undo' | 'redo' | 'mergeFiles' | 'mergePages' | 'setMergedUrl' | 'addToast' | 'removeToast'> = {
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
  };

  return {
    ...initialState,

    initWorker: () => {
      if (get().workerClient) return;
      let client: PdfWorkerClient | null = null;
      try {
        client = new PdfWorkerClient({
          onResponse: response => {
            if (client) handleWorkerResponse(client, response);
          },
          onError: error => {
            if (client) handleWorkerError(client, error);
          },
          onRestart: (worker, sessionId) => {
            if (client && get().workerClient === client) {
              set({
                worker,
                sessionId,
                parseTaskIds: {},
                saveTaskId: null,
                extractTaskId: null,
                isSaving: false,
                isExtracting: false,
              });
            }
          },
        });
        set({ workerClient: client, worker: client.worker, sessionId: client.sessionId });
      } catch (error) {
        const domainError = error instanceof PdfDomainError
          ? error
          : new PdfDomainError('WORKER_INITIALIZATION_FAILED', 'Could not start the PDF engine.', error);
        get().addToast(domainError.userMessage, 'error');
      }
    },

    restartWorker: () => {
      const client = get().workerClient;
      if (client) {
        client.restart();
        return;
      }
      set({ worker: null });
      get().initWorker();
    },

    resetAll: () => {
      const state = get();
      state.workerClient?.dispose();
      if (!state.workerClient) state.worker?.terminate();
      pdfResourceRegistry.releaseAll([
        ...thumbnailUrls(state.files),
        state.mergedUrl,
        state.extractedUrl,
      ]);
      set({
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
      });
      get().initWorker();
      get().addToast('Reset complete', 'info');
    },

    addToast: (message, type = 'info') => {
      const id = generateId();
      set(state => ({ toasts: [...state.toasts, { id, message, type }] }));
      setTimeout(() => get().removeToast(id), 4000);
    },

    removeToast: id => set(state => ({ toasts: state.toasts.filter(toast => toast.id !== id) })),

    undo: () => {
      const { history } = get();
      if (history.past.length === 0) return;
      invalidateMergedOutput();
      set(state => {
        const previous = state.history.past[state.history.past.length - 1];
        const validSelection = state.selectedPageIds.filter(id => previous.some(page => page.uniqueId === id));
        return {
          pageOrder: previous,
          selectedPageIds: validSelection,
          history: { past: state.history.past.slice(0, -1), future: [state.pageOrder, ...state.history.future] },
        };
      });
      get().addToast('Undo', 'info');
    },

    redo: () => {
      const { history } = get();
      if (history.future.length === 0) return;
      invalidateMergedOutput();
      set(state => {
        const next = state.history.future[0];
        const validSelection = state.selectedPageIds.filter(id => next.some(page => page.uniqueId === id));
        return {
          pageOrder: next,
          selectedPageIds: validSelection,
          history: { past: [...state.history.past, state.pageOrder], future: state.history.future.slice(1) },
        };
      });
      get().addToast('Redo', 'info');
    },

    addFiles: newFiles => {
      if (newFiles.length === 0) return;
      if (!get().workerClient) get().initWorker();
      const client = get().workerClient;
      if (!client) return;

      invalidateMergedOutput();
      const newEntries: PdfFile[] = newFiles.map(file => ({
        id: generateId(),
        file,
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(2)} MB`,
        pageCount: 0,
        thumbnails: [],
        status: 'processing',
        type: file.type.startsWith('image/') ? 'image' : 'pdf',
      }));
      set(state => {
        const changes: Partial<PdfStore> = {
          files: [...state.files, ...newEntries],
          currentPage: state.currentPage === 1 ? 2 : state.currentPage,
          mergedUrl: null,
        };
        if (state.currentPage === 3) {
          changes.history = { past: [...state.history.past, state.pageOrder], future: [] };
        }
        return changes;
      });

      const parseTaskIds: Record<string, string> = {};
      for (const entry of newEntries) {
        parseTaskIds[entry.id] = client.parseFile(entry.id, entry.file).taskId;
      }
      set(state => ({ parseTaskIds: { ...state.parseTaskIds, ...parseTaskIds } }));
      get().addToast(`${newEntries.length} files added`, 'success');
    },

    removeFile: id => {
      const file = get().files.find(item => item.id === id);
      if (!file) return;
      const { workerClient, parseTaskIds, extractTaskId } = get();
      const parseTaskId = parseTaskIds[id];
      if (parseTaskId) workerClient?.cancel(parseTaskId);
      if (extractTaskId) workerClient?.cancel(extractTaskId);
      invalidateMergedOutput();
      pdfResourceRegistry.releaseFile(id, file.thumbnails);

      set(state => {
        const removedPageIds = new Set(
          state.pageOrder.filter(page => page.fileId === id).map(page => page.uniqueId),
        );
        return {
          files: state.files.filter(item => item.id !== id),
          pageOrder: state.pageOrder.filter(page => page.fileId !== id),
          selectedPageIds: state.selectedPageIds.filter(pageId => !removedPageIds.has(pageId)),
          parseTaskIds: Object.fromEntries(Object.entries(state.parseTaskIds).filter(([fileId]) => fileId !== id)),
          isExtracting: extractTaskId ? false : state.isExtracting,
          extractTaskId: extractTaskId ? null : state.extractTaskId,
          history: { past: [], future: [] },
        };
      });
    },

    reorderFiles: (activeId, overId) => {
      const state = get();
      const oldIndex = state.files.findIndex(file => file.id === activeId);
      const newIndex = state.files.findIndex(file => file.id === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      invalidateMergedOutput();
      set(current => ({ files: arrayMove(current.files, oldIndex, newIndex) }));
    },

    setPage: page => {
      if (page === get().currentPage) return;
      invalidateMergedOutput();
      set({ currentPage: page });
    },

    updateFileStatus: (id, updates) => set(state => ({
      files: state.files.map(file => file.id === id ? { ...file, ...updates } : file),
    })),

    addThumbnail: (id, index, url) => {
      const targetFile = get().files.find(file => file.id === id);
      if (!targetFile) {
        pdfResourceRegistry.release(thumbnailOwner(id, index), [url]);
        return;
      }
      const owner = thumbnailOwner(id, index);
      pdfResourceRegistry.release(owner, [targetFile.thumbnails[index]]);
      if (url) pdfResourceRegistry.adopt(owner, url);
      set(state => ({
        files: state.files.map(file => {
          if (file.id !== id) return file;
          const thumbnails = [...file.thumbnails];
          thumbnails[index] = url;
          return { ...file, thumbnails, status: 'ready' as const };
        }),
      }));
    },

    initPageEditor: () => {
      const { files } = get();
      if (files.length === 0) return;
      invalidateMergedOutput();
      const pages: PageItem[] = [];
      files.forEach(file => file.thumbnails.forEach((thumb, pageIndex) => {
        pages.push({ uniqueId: generateId(), fileId: file.id, pageIndex, thumb, rotation: 0 });
      }));
      set({ pageOrder: pages, selectedPageIds: [], currentPage: 3, history: { past: [], future: [] } });
    },

    reorderPages: (activeId, overId) => {
      const state = get();
      const oldIndex = state.pageOrder.findIndex(page => page.uniqueId === activeId);
      const newIndex = state.pageOrder.findIndex(page => page.uniqueId === overId);
      if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;
      invalidateMergedOutput();
      set(current => ({
        history: { past: [...current.history.past, current.pageOrder], future: [] },
        pageOrder: arrayMove(current.pageOrder, oldIndex, newIndex),
      }));
    },

    moveSelectedPages: (activeId, overId) => {
      const state = get();
      const activeIndex = state.pageOrder.findIndex(page => page.uniqueId === activeId);
      const overIndex = state.pageOrder.findIndex(page => page.uniqueId === overId);
      if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return;
      if (state.selectedPageIds.includes(overId)) return;
      const selectedIds = new Set(state.selectedPageIds);
      const itemsToMove = state.pageOrder.filter(page => selectedIds.has(page.uniqueId));
      if (itemsToMove.length === 0) return;
      const itemsStaying = state.pageOrder.filter(page => !selectedIds.has(page.uniqueId));
      let insertAtIndex = itemsStaying.findIndex(page => page.uniqueId === overId);
      if (insertAtIndex === -1) return;
      if (activeIndex < overIndex) insertAtIndex += 1;
      invalidateMergedOutput();
      const newOrder = [...itemsStaying];
      newOrder.splice(insertAtIndex, 0, ...itemsToMove);
      set(current => ({
        history: { past: [...current.history.past, current.pageOrder], future: [] },
        pageOrder: newOrder,
      }));
    },

    rotatePage: uniqueId => {
      if (!get().pageOrder.some(page => page.uniqueId === uniqueId)) return;
      invalidateMergedOutput();
      set(current => ({
        history: { past: [...current.history.past, current.pageOrder], future: [] },
        pageOrder: current.pageOrder.map(page => page.uniqueId === uniqueId
          ? { ...page, rotation: (page.rotation + 90) % 360 }
          : page),
      }));
    },

    removePage: uniqueId => {
      if (!get().pageOrder.some(page => page.uniqueId === uniqueId)) return;
      invalidateMergedOutput();
      set(current => ({
        history: { past: [...current.history.past, current.pageOrder], future: [] },
        pageOrder: current.pageOrder.filter(page => page.uniqueId !== uniqueId),
        selectedPageIds: current.selectedPageIds.filter(id => id !== uniqueId),
      }));
    },

    rotateSelectedPages: () => {
      const selectedIds = new Set(get().selectedPageIds);
      if (selectedIds.size === 0) return;
      invalidateMergedOutput();
      set(current => ({
        history: { past: [...current.history.past, current.pageOrder], future: [] },
        pageOrder: current.pageOrder.map(page => selectedIds.has(page.uniqueId)
          ? { ...page, rotation: (page.rotation + 90) % 360 }
          : page),
      }));
      get().addToast('Rotated selected pages', 'success');
    },

    removeSelectedPages: () => {
      const selectedIds = new Set(get().selectedPageIds);
      if (selectedIds.size === 0) return;
      invalidateMergedOutput();
      set(current => ({
        history: { past: [...current.history.past, current.pageOrder], future: [] },
        pageOrder: current.pageOrder.filter(page => !selectedIds.has(page.uniqueId)),
        selectedPageIds: [],
      }));
      get().addToast('Removed selected pages', 'success');
    },

    togglePageSelection: uniqueId => set(state => {
      const isSelected = state.selectedPageIds.includes(uniqueId);
      return {
        selectedPageIds: isSelected
          ? state.selectedPageIds.filter(id => id !== uniqueId)
          : [...state.selectedPageIds, uniqueId],
      };
    }),

    setPageSelection: ids => set({ selectedPageIds: ids }),
    selectAllPages: () => set(state => ({ selectedPageIds: state.pageOrder.map(page => page.uniqueId) })),
    deselectAllPages: () => set({ selectedPageIds: [] }),

    extractSelectedPages: () => {
      const { workerClient, files, pageOrder, selectedPageIds, isExtracting } = get();
      if (!workerClient || selectedPageIds.length === 0 || isExtracting) return;
      const selectedIds = new Set(selectedPageIds);
      const pagesToExtract = pageOrder
        .filter(page => selectedIds.has(page.uniqueId))
        .map(({ uniqueId, fileId, pageIndex, rotation }) => ({ uniqueId, fileId, pageIndex, rotation }));
      if (pagesToExtract.length === 0) return;
      releaseExtractedOutput();
      const task = workerClient.extractPages(
        files.map(file => ({ id: file.id, file: file.file })),
        pagesToExtract,
      );
      set({ isExtracting: true, extractTaskId: task.taskId });
      get().addToast('Extracting pages...', 'info');
    },

    mergeFiles: () => {
      const { workerClient, files, isSaving } = get();
      if (!workerClient || files.length === 0 || isSaving) return;
      invalidateMergedOutput();
      const task = workerClient.mergeFiles(files.map(file => ({ id: file.id, file: file.file })));
      set({ isSaving: true, saveTaskId: task.taskId });
    },

    mergePages: () => {
      const { workerClient, files, pageOrder, isSaving } = get();
      if (!workerClient || pageOrder.length === 0 || isSaving) return;
      invalidateMergedOutput();
      const pages = pageOrder.map(({ uniqueId, fileId, pageIndex, rotation }) => ({ uniqueId, fileId, pageIndex, rotation }));
      const task = workerClient.mergePages(
        files.map(file => ({ id: file.id, file: file.file })),
        pages,
      );
      set({ isSaving: true, saveTaskId: task.taskId });
    },

    setMergedUrl: url => {
      const previousUrl = get().mergedUrl;
      if (previousUrl === url) return;
      pdfResourceRegistry.release(MERGED_OUTPUT_OWNER, [previousUrl]);
      if (url) pdfResourceRegistry.adopt(MERGED_OUTPUT_OWNER, url);
      set({ mergedUrl: url });
    },
  };
});
