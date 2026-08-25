import { create } from 'zustand';
import { arrayMove } from '@dnd-kit/sortable';
import { WORKER_CODE } from './workerCode';
import { generateId } from './utils';
import { PdfFile, PageItem, Toast } from './types';

const revokeObjectUrl = (url: string | null | undefined) => {
  if (url) URL.revokeObjectURL(url);
};

interface PdfStore {
  files: PdfFile[];
  pageOrder: PageItem[];
  selectedPageIds: string[];
  currentPage: number;
  worker: Worker | null;
  mergedUrl: string | null;
  extractedUrl: string | null;
  isSaving: boolean;
  isExtracting: boolean;
  history: { past: PageItem[][]; future: PageItem[][]; };
  toasts: Toast[];
  
  initWorker: () => void;
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

export const usePdfStore = create<PdfStore>((set, get) => ({
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
  toasts: [],

  initWorker: () => {
    if (get().worker) return;
    const blob = new Blob([WORKER_CODE], { type: 'application/javascript' });
    const workerUrl = URL.createObjectURL(blob);
    const worker = new Worker(workerUrl);
    URL.revokeObjectURL(workerUrl);
    
    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      switch (type) {
        case 'FILE_PARSED': {
          if (!get().files.some(file => file.id === payload.fileId)) return;

          set(state => {
            const updatedFiles = state.files.map(f => 
              f.id === payload.fileId 
                ? { ...f, pageCount: payload.pageCount, thumbnails: new Array(payload.pageCount).fill('') }
                : f
            );
            let newPageOrder = state.pageOrder;
            if (state.currentPage === 3) {
               const newItems: PageItem[] = [];
               for(let i = 0; i < payload.pageCount; i++) {
                 newItems.push({ uniqueId: generateId(), fileId: payload.fileId, pageIndex: i, thumb: '', rotation: 0 });
               }
               newPageOrder = [...state.pageOrder, ...newItems];
            }
            return { files: updatedFiles, pageOrder: newPageOrder };
          });
          break;
        }
        case 'THUMBNAIL_GENERATED': {
          const targetFile = get().files.find(file => file.id === payload.fileId);
          if (!targetFile) {
            revokeObjectUrl(payload.url);
            return;
          }

          const previousUrl = targetFile.thumbnails[payload.pageIndex];
          if (previousUrl && previousUrl !== payload.url) revokeObjectUrl(previousUrl);

          set(state => {
             const updatedFiles = state.files.map(f => {
               if (f.id !== payload.fileId) return f;
               const newThumbs = [...f.thumbnails];
               newThumbs[payload.pageIndex] = payload.url;
               return { ...f, thumbnails: newThumbs, status: 'ready' as const };
             });
             const updatedPageOrder = state.pageOrder.map(p => {
                if (p.fileId === payload.fileId && p.pageIndex === payload.pageIndex) return { ...p, thumb: payload.url };
                return p;
             });
             return { files: updatedFiles, pageOrder: updatedPageOrder };
          });
          break;
        }
        case 'MERGE_COMPLETE':
          if (payload.taskType === 'extract') {
             revokeObjectUrl(get().extractedUrl);
             set({ extractedUrl: payload.url, isExtracting: false });
             get().addToast('Extraction complete!', 'success');
          } else {
             revokeObjectUrl(get().mergedUrl);
             set({ mergedUrl: payload.url, isSaving: false });
             get().addToast('File ready!', 'success');
          }
          break;
        case 'ERROR':
          console.error('Worker Error:', payload);
          set({ isSaving: false, isExtracting: false });
          get().addToast(`Error: ${payload}`, 'error');
          break;
      }
    };

    worker.onerror = (event) => {
      console.error('Worker Runtime Error:', event.message);
      set({ isSaving: false, isExtracting: false });
      get().addToast('PDF worker failed. Start over to reset the workspace.', 'error');
    };

    worker.onmessageerror = () => {
      set({ isSaving: false, isExtracting: false });
      get().addToast('Could not read a response from the PDF worker.', 'error');
    };

    set({ worker });
  },

  addToast: (message, type = 'info') => {
    const id = generateId();
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 4000);
  },

  removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  resetAll: () => {
    const { files, mergedUrl, extractedUrl, worker } = get();
    worker?.terminate();
    files.forEach(f => f.thumbnails.forEach(revokeObjectUrl));
    revokeObjectUrl(mergedUrl);
    revokeObjectUrl(extractedUrl);

    set({
      files: [],
      pageOrder: [],
      selectedPageIds: [],
      currentPage: 1,
      worker: null,
      mergedUrl: null,
      extractedUrl: null,
      isSaving: false,
      isExtracting: false,
      history: { past: [], future: [] }
    });
    get().initWorker();
    get().addToast('Reset complete', 'info');
  },

  undo: () => {
    const { history, mergedUrl } = get();
    if (history.past.length === 0) return;
    revokeObjectUrl(mergedUrl);

    set(state => {
      const previous = state.history.past[state.history.past.length - 1];
      const newPast = state.history.past.slice(0, state.history.past.length - 1);
      get().addToast('Undo', 'info');
      
      const validSelection = state.selectedPageIds.filter(id => previous.some(p => p.uniqueId === id));

      return { 
        pageOrder: previous, 
        selectedPageIds: validSelection,
        mergedUrl: null, 
        history: { past: newPast, future: [state.pageOrder, ...state.history.future] } 
      };
    });
  },

  redo: () => {
    const { history, mergedUrl } = get();
    if (history.future.length === 0) return;
    revokeObjectUrl(mergedUrl);

    set(state => {
      const next = state.history.future[0];
      const newFuture = state.history.future.slice(1);
      get().addToast('Redo', 'info');
      
      const validSelection = state.selectedPageIds.filter(id => next.some(p => p.uniqueId === id));

      return { 
        pageOrder: next, 
        selectedPageIds: validSelection,
        mergedUrl: null,
        history: { past: [...state.history.past, state.pageOrder], future: newFuture } 
      };
    });
  },

  addFiles: (newFiles) => {
    if (newFiles.length === 0) return;
    if (!get().worker) get().initWorker();
    const worker = get().worker;
    revokeObjectUrl(get().mergedUrl);

    const newEntries: PdfFile[] = newFiles.map(f => ({
      id: generateId(),
      file: f,
      name: f.name,
      size: (f.size / 1024 / 1024).toFixed(2) + ' MB',
      pageCount: 0,
      thumbnails: [],
      status: 'processing',
      type: f.type.startsWith('image/') ? 'image' : 'pdf'
    }));
    set(state => {
      const changes: Partial<PdfStore> = { 
          files: [...state.files, ...newEntries], 
          currentPage: state.currentPage === 1 ? 2 : state.currentPage,
          mergedUrl: null
      };
      if (state.currentPage === 3) changes.history = { past: [...state.history.past, state.pageOrder], future: [] };
      return changes;
    });
    newEntries.forEach(entry => worker?.postMessage({ type: 'PARSE_FILE', payload: { file: entry.file, fileId: entry.id } }));
    get().addToast(`${newEntries.length} files added`, 'success');
  },

  removeFile: (id) => {
    const file = get().files.find(f => f.id === id);
    if (!file) return;

    file.thumbnails.forEach(revokeObjectUrl);
    revokeObjectUrl(get().mergedUrl);

    set(state => {
      const removedPageIds = new Set(
        state.pageOrder.filter(page => page.fileId === id).map(page => page.uniqueId)
      );
      return {
        files: state.files.filter(f => f.id !== id),
        pageOrder: state.pageOrder.filter(page => page.fileId !== id),
        selectedPageIds: state.selectedPageIds.filter(pageId => !removedPageIds.has(pageId)),
        mergedUrl: null,
        history: { past: [], future: [] }
      };
    });
  },
  
  reorderFiles: (activeId, overId) => {
    const state = get();
    const oldIndex = state.files.findIndex(f => f.id === activeId);
    const newIndex = state.files.findIndex(f => f.id === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    revokeObjectUrl(state.mergedUrl);
    set(current => ({
      files: arrayMove(current.files, oldIndex, newIndex),
      mergedUrl: null
    }));
  },
  
  setPage: (page) => {
    const { currentPage, mergedUrl } = get();
    if (page === currentPage) return;
    revokeObjectUrl(mergedUrl);
    set({ currentPage: page, mergedUrl: null });
  },

  updateFileStatus: (id, updates) => set(state => ({ files: state.files.map(f => f.id === id ? { ...f, ...updates } : f) })),

  addThumbnail: (id, index, url) => {
    const targetFile = get().files.find(file => file.id === id);
    if (!targetFile) {
      revokeObjectUrl(url);
      return;
    }

    const previousUrl = targetFile.thumbnails[index];
    if (previousUrl && previousUrl !== url) revokeObjectUrl(previousUrl);
    set(state => ({ files: state.files.map(f => { if (f.id !== id) return f; const newThumbs = [...f.thumbnails]; newThumbs[index] = url; return { ...f, thumbnails: newThumbs, status: 'ready' }; }) }));
  },
  
  initPageEditor: () => {
    const { files, mergedUrl } = get();
    if (files.length === 0) return;

    revokeObjectUrl(mergedUrl);
    const pages: PageItem[] = [];
    files.forEach(file => {
      file.thumbnails.forEach((thumb, index) => {
        pages.push({ uniqueId: generateId(), fileId: file.id, pageIndex: index, thumb: thumb, rotation: 0 });
      });
    });
    set({ pageOrder: pages, selectedPageIds: [], currentPage: 3, mergedUrl: null, history: { past: [], future: [] } });
  },

  reorderPages: (activeId, overId) => {
    const state = get();
    const oldIndex = state.pageOrder.findIndex(p => p.uniqueId === activeId);
    const newIndex = state.pageOrder.findIndex(p => p.uniqueId === overId);
    if (oldIndex === -1 || newIndex === -1 || oldIndex === newIndex) return;

    revokeObjectUrl(state.mergedUrl);
    set(current => ({ 
      history: { past: [...current.history.past, current.pageOrder], future: [] }, 
      pageOrder: arrayMove(current.pageOrder, oldIndex, newIndex),
      mergedUrl: null 
    }));
  },

  moveSelectedPages: (activeId, overId) => {
    const state = get();
    const activeIndex = state.pageOrder.findIndex(p => p.uniqueId === activeId);
    const overIndex = state.pageOrder.findIndex(p => p.uniqueId === overId);
    if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return;
    if (state.selectedPageIds.includes(overId)) return;

    const selectedIds = new Set(state.selectedPageIds);
    const itemsToMove = state.pageOrder.filter(p => selectedIds.has(p.uniqueId));
    if (itemsToMove.length === 0) return;

    const itemsStaying = state.pageOrder.filter(p => !selectedIds.has(p.uniqueId));
    let insertAtIndex = itemsStaying.findIndex(p => p.uniqueId === overId);
    if (insertAtIndex === -1) return;
    if (activeIndex < overIndex) insertAtIndex += 1;

    revokeObjectUrl(state.mergedUrl);
    const newOrder = [...itemsStaying];
    newOrder.splice(insertAtIndex, 0, ...itemsToMove);
    set(current => ({ 
      history: { past: [...current.history.past, current.pageOrder], future: [] }, 
      pageOrder: newOrder,
      mergedUrl: null 
    }));
  },

  rotatePage: (uniqueId) => {
    const state = get();
    if (!state.pageOrder.some(page => page.uniqueId === uniqueId)) return;

    revokeObjectUrl(state.mergedUrl);
    set(current => ({ 
      history: { past: [...current.history.past, current.pageOrder], future: [] },
      pageOrder: current.pageOrder.map(p => p.uniqueId === uniqueId ? { ...p, rotation: (p.rotation + 90) % 360 } : p),
      mergedUrl: null 
    }));
  },

  removePage: (uniqueId) => {
    const state = get();
    if (!state.pageOrder.some(page => page.uniqueId === uniqueId)) return;

    revokeObjectUrl(state.mergedUrl);
    set(current => ({ 
      history: { past: [...current.history.past, current.pageOrder], future: [] },
      pageOrder: current.pageOrder.filter(p => p.uniqueId !== uniqueId), 
      selectedPageIds: current.selectedPageIds.filter(id => id !== uniqueId),
      mergedUrl: null 
    }));
  },
  
  rotateSelectedPages: () => {
    const state = get();
    if (state.selectedPageIds.length === 0) return;

    revokeObjectUrl(state.mergedUrl);
    const selectedIds = new Set(state.selectedPageIds);
    set(current => ({ 
      history: { past: [...current.history.past, current.pageOrder], future: [] },
      pageOrder: current.pageOrder.map(p => selectedIds.has(p.uniqueId) ? { ...p, rotation: (p.rotation + 90) % 360 } : p),
      mergedUrl: null 
    }));
    get().addToast('Rotated selected pages', 'success');
  },
  
  removeSelectedPages: () => {
    const state = get();
    if (state.selectedPageIds.length === 0) return;

    revokeObjectUrl(state.mergedUrl);
    const selectedIds = new Set(state.selectedPageIds);
    set(current => ({ 
      history: { past: [...current.history.past, current.pageOrder], future: [] },
      pageOrder: current.pageOrder.filter(p => !selectedIds.has(p.uniqueId)), 
      selectedPageIds: [],
      mergedUrl: null 
    }));
    get().addToast('Removed selected pages', 'success');
  },

  togglePageSelection: (uniqueId) => set(state => { 
    const isSelected = state.selectedPageIds.includes(uniqueId); 
    return { selectedPageIds: isSelected ? state.selectedPageIds.filter(id => id !== uniqueId) : [...state.selectedPageIds, uniqueId] }; 
  }),
  
  setPageSelection: (ids) => set({ selectedPageIds: ids }),

  selectAllPages: () => set(state => ({ selectedPageIds: state.pageOrder.map(p => p.uniqueId) })),
  deselectAllPages: () => set({ selectedPageIds: [] }),
  
  extractSelectedPages: () => {
    const { worker, files, pageOrder, selectedPageIds } = get();
    if (!worker || selectedPageIds.length === 0 || get().isExtracting) return;
    const selectedIds = new Set(selectedPageIds);
    const pagesToExtract = pageOrder.filter(p => selectedIds.has(p.uniqueId));
    
    set({ isExtracting: true }); 
    worker.postMessage({ 
        type: 'MERGE_PAGES', 
        payload: { 
            files: files.map(f => ({ id: f.id, file: f.file })), 
            pages: pagesToExtract,
            taskType: 'extract' 
        } 
    });
    get().addToast('Extracting pages...', 'info');
  },

  mergeFiles: () => { 
      const { worker, files, isSaving } = get(); 
      if (!worker || files.length === 0 || isSaving) return;
      revokeObjectUrl(get().mergedUrl);
      set({ isSaving: true, mergedUrl: null }); 
      worker.postMessage({ type: 'MERGE_PDFS', payload: { files: files.map(f => ({ id: f.id, file: f.file })), taskType: 'save' } }); 
  },
  
  mergePages: () => { 
      const { worker, files, pageOrder, isSaving } = get(); 
      if (!worker || pageOrder.length === 0 || isSaving) return;
      revokeObjectUrl(get().mergedUrl);
      set({ isSaving: true, mergedUrl: null }); 
      worker.postMessage({ type: 'MERGE_PAGES', payload: { files: files.map(f => ({ id: f.id, file: f.file })), pages: pageOrder, taskType: 'save' } }); 
  },
  
  setMergedUrl: (url) => {
    const previousUrl = get().mergedUrl;
    if (previousUrl && previousUrl !== url) revokeObjectUrl(previousUrl);
    set({ mergedUrl: url });
  }
}));
