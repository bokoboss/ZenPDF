import { create } from 'zustand';
import { arrayMove } from '@dnd-kit/sortable';
import { WORKER_CODE } from './workerCode';
import { generateId } from './utils';
import { PdfFile, PageItem, Toast } from './types';

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
    const worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = (e) => {
      const { type, payload } = e.data;
      switch (type) {
        case 'FILE_PARSED':
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
        case 'THUMBNAIL_GENERATED':
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
        case 'MERGE_COMPLETE':
          if (payload.taskType === 'extract') {
             // Revoke old extracted URL if exists
             const oldUrl = get().extractedUrl;
             if (oldUrl) URL.revokeObjectURL(oldUrl);
             
             set({ extractedUrl: payload.url, isExtracting: false });
             get().addToast('Extraction complete!', 'success');
          } else {
             // Revoke old merged URL if exists
             const oldUrl = get().mergedUrl;
             if (oldUrl) URL.revokeObjectURL(oldUrl);

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
    set({ worker });
  },

  addToast: (message, type = 'info') => {
    const id = generateId();
    set(state => ({ toasts: [...state.toasts, { id, message, type }] }));
    setTimeout(() => get().removeToast(id), 4000);
  },

  removeToast: (id) => set(state => ({ toasts: state.toasts.filter(t => t.id !== id) })),

  resetAll: () => {
    // Memory Cleanup
    const { files, mergedUrl, extractedUrl } = get();
    files.forEach(f => f.thumbnails.forEach(url => { if(url) URL.revokeObjectURL(url); }));
    if (mergedUrl) URL.revokeObjectURL(mergedUrl);
    if (extractedUrl) URL.revokeObjectURL(extractedUrl);

    set({ files: [], pageOrder: [], selectedPageIds: [], currentPage: 1, mergedUrl: null, extractedUrl: null, isSaving: false, isExtracting: false, history: { past: [], future: [] } });
    get().addToast('Reset complete', 'info');
  },

  undo: () => set(state => {
    if (state.history.past.length === 0) return {};
    const previous = state.history.past[state.history.past.length - 1];
    const newPast = state.history.past.slice(0, state.history.past.length - 1);
    get().addToast('Undo', 'info');
    
    // Restore selection only if items still exist
    const validSelection = state.selectedPageIds.filter(id => previous.some(p => p.uniqueId === id));

    return { 
      pageOrder: previous, 
      selectedPageIds: validSelection,
      mergedUrl: null, 
      history: { past: newPast, future: [state.pageOrder, ...state.history.future] } 
    };
  }),

  redo: () => set(state => {
    if (state.history.future.length === 0) return {};
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
  }),

  addFiles: (newFiles) => {
    const worker = get().worker;
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
      // Memory Cleanup for specific file
      const file = get().files.find(f => f.id === id);
      if (file) {
          file.thumbnails.forEach(url => { if(url) URL.revokeObjectURL(url); });
      }
      set(state => ({ files: state.files.filter(f => f.id !== id), mergedUrl: null }));
  },
  
  reorderFiles: (activeId, overId) => set(state => {
    const oldIndex = state.files.findIndex(f => f.id === activeId);
    const newIndex = state.files.findIndex(f => f.id === overId);
    return { files: arrayMove(state.files, oldIndex, newIndex), mergedUrl: null };
  }),
  
  setPage: (page) => set({ currentPage: page, mergedUrl: null }),
  updateFileStatus: (id, updates) => set(state => ({ files: state.files.map(f => f.id === id ? { ...f, ...updates } : f) })),
  addThumbnail: (id, index, url) => set(state => ({ files: state.files.map(f => { if (f.id !== id) return f; const newThumbs = [...f.thumbnails]; newThumbs[index] = url; return { ...f, thumbnails: newThumbs, status: 'ready' }; }) })),
  
  initPageEditor: () => {
    const { files } = get();
    const pages: PageItem[] = [];
    files.forEach(file => {
      file.thumbnails.forEach((thumb, index) => {
        pages.push({ uniqueId: generateId(), fileId: file.id, pageIndex: index, thumb: thumb, rotation: 0 });
      });
    });
    set({ pageOrder: pages, selectedPageIds: [], currentPage: 3, mergedUrl: null, history: { past: [], future: [] } });
  },

  reorderPages: (activeId, overId) => set(state => {
    const oldIndex = state.pageOrder.findIndex(p => p.uniqueId === activeId);
    const newIndex = state.pageOrder.findIndex(p => p.uniqueId === overId);
    return { 
        history: { past: [...state.history.past, state.pageOrder], future: [] }, 
        pageOrder: arrayMove(state.pageOrder, oldIndex, newIndex),
        mergedUrl: null 
    };
  }),

  moveSelectedPages: (activeId, overId) => set(state => {
    const activeIndex = state.pageOrder.findIndex(p => p.uniqueId === activeId);
    const overIndex = state.pageOrder.findIndex(p => p.uniqueId === overId);
    if (activeIndex === -1 || overIndex === -1 || activeIndex === overIndex) return {};
    if (state.selectedPageIds.includes(overId)) return {};
    const itemsToMove = state.pageOrder.filter(p => state.selectedPageIds.includes(p.uniqueId));
    const itemsStaying = state.pageOrder.filter(p => !state.selectedPageIds.includes(p.uniqueId));
    let insertAtIndex = itemsStaying.findIndex(p => p.uniqueId === overId);
    if (activeIndex < overIndex) { insertAtIndex += 1; }
    const newOrder = [...itemsStaying];
    newOrder.splice(insertAtIndex, 0, ...itemsToMove);
    return { 
        history: { past: [...state.history.past, state.pageOrder], future: [] }, 
        pageOrder: newOrder,
        mergedUrl: null 
    };
  }),

  rotatePage: (uniqueId) => set(state => ({ 
    history: { past: [...state.history.past, state.pageOrder], future: [] },
    pageOrder: state.pageOrder.map(p => p.uniqueId === uniqueId ? { ...p, rotation: (p.rotation + 90) % 360 } : p),
    mergedUrl: null 
  })),

  removePage: (uniqueId) => set(state => ({ 
    history: { past: [...state.history.past, state.pageOrder], future: [] },
    pageOrder: state.pageOrder.filter(p => p.uniqueId !== uniqueId), 
    selectedPageIds: state.selectedPageIds.filter(id => id !== uniqueId),
    mergedUrl: null 
  })),
  
  rotateSelectedPages: () => {
    set(state => ({ 
        history: { past: [...state.history.past, state.pageOrder], future: [] },
        pageOrder: state.pageOrder.map(p => state.selectedPageIds.includes(p.uniqueId) ? { ...p, rotation: (p.rotation + 90) % 360 } : p),
        mergedUrl: null 
    }));
    get().addToast('Rotated selected pages', 'success');
  },
  
  removeSelectedPages: () => {
    set(state => ({ 
        history: { past: [...state.history.past, state.pageOrder], future: [] },
        pageOrder: state.pageOrder.filter(p => !state.selectedPageIds.includes(p.uniqueId)), 
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
    if (!worker || selectedPageIds.length === 0) return;
    const pagesToExtract = pageOrder.filter(p => selectedPageIds.includes(p.uniqueId));
    
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
      const { worker, files } = get(); 
      if (!worker || files.length === 0) return; 
      set({ isSaving: true, mergedUrl: null }); 
      worker.postMessage({ type: 'MERGE_PDFS', payload: { files: files.map(f => ({ id: f.id, file: f.file })), taskType: 'save' } }); 
  },
  
  mergePages: () => { 
      const { worker, files, pageOrder } = get(); 
      if (!worker || pageOrder.length === 0) return; 
      set({ isSaving: true, mergedUrl: null }); 
      worker.postMessage({ type: 'MERGE_PAGES', payload: { files: files.map(f => ({ id: f.id, file: f.file })), pages: pageOrder, taskType: 'save' } }); 
  },
  
  setMergedUrl: (url) => set({ mergedUrl: url })
}));