import React, { useEffect, useState } from 'react';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  TouchSensor, 
  MouseSensor, 
  useSensor, 
  useSensors,
  DragOverlay,
  DragStartEvent,
  DragEndEvent
} from '@dnd-kit/core';
import { 
  SortableContext, 
  sortableKeyboardCoordinates, 
  rectSortingStrategy
} from '@dnd-kit/sortable';
import { 
  ArrowLeft, Loader2, Undo2, Redo2, Scissors, RotateCw, Trash2, 
  ZoomOut, ZoomIn, Plus, Download, Save, CheckSquare, Square
} from 'lucide-react';
import { usePdfStore } from '../store';
import { SortablePageGridItem } from './SortablePageGridItem';
import { cn } from '../utils';

export function PageEditor() {
  const { pageOrder, selectedPageIds, history, undo, redo, reorderPages, moveSelectedPages, rotatePage, removePage, togglePageSelection, setPageSelection, selectAllPages, deselectAllPages, rotateSelectedPages, removeSelectedPages, extractSelectedPages, mergePages, isSaving, isExtracting, mergedUrl, extractedUrl, setPage, addFiles } = usePdfStore();
  const [activeId, setActiveId] = useState<string | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [zoomLevel, setZoomLevel] = useState(3);
  
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(MouseSensor, { activationConstraint: { distance: 10 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  useEffect(() => {
    if (extractedUrl) {
        const link = document.createElement('a');
        link.href = extractedUrl;
        link.download = `ZenPDF_Extract_${Date.now()}.pdf`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    }
  }, [extractedUrl]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
      const cmdOrCtrl = isMac ? e.metaKey : e.ctrlKey;
      const key = e.key.toLowerCase();
      const code = e.code;

      if (cmdOrCtrl && (key === 'z' || code === 'KeyZ')) {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      
      if (cmdOrCtrl && (key === 'y' || code === 'KeyY') && !e.shiftKey) {
        e.preventDefault();
        redo();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  const handlePageSelect = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && lastSelectedId) {
      const start = pageOrder.findIndex(p => p.uniqueId === lastSelectedId);
      const end = pageOrder.findIndex(p => p.uniqueId === id);
      
      if (start !== -1 && end !== -1) {
        const min = Math.min(start, end);
        const max = Math.max(start, end);
        const rangeIds = pageOrder.slice(min, max + 1).map(p => p.uniqueId);
        const newSelection = Array.from(new Set([...selectedPageIds, ...rangeIds]));
        setPageSelection(newSelection);
      }
    } else {
      togglePageSelection(id);
      setLastSelectedId(id);
    }
  };

  const handleDragStart = (event: DragStartEvent) => { setActiveId(event.active.id as string); };
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    if (!over) return;
    if (selectedPageIds.includes(active.id as string)) {
      if (active.id !== over.id) moveSelectedPages(active.id as string, over.id as string);
    } else {
      if (active.id !== over.id) reorderPages(active.id as string, over.id as string);
    }
  };

  const activeItem = activeId ? pageOrder.find(p => p.uniqueId === activeId) : null;
  const dragCount = activeId && selectedPageIds.includes(activeId) ? selectedPageIds.length : 1;
  const canUndo = history.past.length > 0;
  const canRedo = history.future.length > 0;

  const getGridClass = () => {
    switch(zoomLevel) {
      case 1: return "grid-cols-4 md:grid-cols-6 lg:grid-cols-8";
      case 2: return "grid-cols-3 md:grid-cols-5 lg:grid-cols-6";
      case 3: return "grid-cols-2 md:grid-cols-4 lg:grid-cols-5";
      case 4: return "grid-cols-2 md:grid-cols-3 lg:grid-cols-4";
      case 5: return "grid-cols-1 md:grid-cols-2 lg:grid-cols-3";
      default: return "grid-cols-2 md:grid-cols-4 lg:grid-cols-5";
    }
  };

  return (
    <div className="w-full max-w-[1800px] mx-auto p-4 md:p-8 animate-in slide-in-from-right-8 duration-700">
      
      <div className="flex items-center justify-between mb-8 px-2">
        <div className="flex items-center gap-6">
          <button 
            onClick={() => setPage(2)} 
            className="w-10 h-10 flex items-center justify-center rounded-full bg-white border border-stone-200 text-stone-500 hover:text-stone-900 hover:border-stone-300 transition-all shadow-sm"
            title="Back to Files"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h2 className="text-3xl font-light text-stone-900 tracking-tight">Editor</h2>
            <p className="text-stone-500 text-sm mt-0.5">{pageOrder.length} pages</p>
          </div>
        </div>
      </div>

      <div className="sticky top-24 z-40 bg-white/90 backdrop-blur-2xl border border-stone-200/50 shadow-xl shadow-stone-200/30 rounded-[2rem] px-3 py-3 mb-10 flex flex-wrap items-center justify-between gap-4 transition-all">
         <div className="flex items-center gap-2 pl-3">
            <button onClick={selectAllPages} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-stone-500 hover:bg-stone-100 rounded-xl transition-colors">
              <CheckSquare size={16} /> All
            </button>
            <button onClick={deselectAllPages} disabled={selectedPageIds.length === 0} className="flex items-center gap-2 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-stone-400 hover:text-stone-600 hover:bg-stone-50 rounded-xl transition-colors disabled:opacity-30">
              <Square size={16} /> None
            </button>
            <div className="h-6 w-px bg-stone-200 mx-2"></div>
            <div className="flex items-center gap-1">
               <button onClick={undo} disabled={!canUndo} className="p-2 hover:bg-stone-100 rounded-xl text-stone-600 disabled:opacity-30 transition-colors"><Undo2 size={18} strokeWidth={1.5} /></button>
               <button onClick={redo} disabled={!canRedo} className="p-2 hover:bg-stone-100 rounded-xl text-stone-600 disabled:opacity-30 transition-colors"><Redo2 size={18} strokeWidth={1.5} /></button>
            </div>
            
            <div className="h-6 w-px bg-stone-200 mx-2"></div>
            <div className="flex items-center gap-2">
                <button 
                    onClick={extractSelectedPages} 
                    disabled={selectedPageIds.length === 0 || isExtracting} 
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-xl transition-all disabled:opacity-40 disabled:hover:bg-stone-50"
                    title="Extract selected pages"
                >
                    {isExtracting ? <Loader2 size={16} className="animate-spin" /> : <Scissors size={16} strokeWidth={1.5} />}
                    <span className="hidden sm:inline">Extract</span>
                </button>
                <button 
                    onClick={rotateSelectedPages} 
                    disabled={selectedPageIds.length === 0} 
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-stone-700 bg-stone-50 hover:bg-stone-100 rounded-xl transition-all disabled:opacity-40 disabled:hover:bg-stone-50"
                    title="Rotate selected pages"
                >
                    <RotateCw size={16} strokeWidth={1.5} />
                    <span className="hidden sm:inline">Rotate</span>
                </button>
                <button 
                    onClick={removeSelectedPages} 
                    disabled={selectedPageIds.length === 0} 
                    className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-red-600 bg-red-50 hover:bg-red-100 rounded-xl transition-all disabled:opacity-40 disabled:hover:bg-red-50 disabled:text-stone-400"
                    title="Delete selected pages"
                >
                    <Trash2 size={16} strokeWidth={1.5} />
                    <span className="hidden sm:inline">Delete</span>
                </button>
            </div>
         </div>

         <div className="flex items-center gap-4 pr-2">
            <div className="flex items-center gap-2 bg-stone-100/80 p-1.5 rounded-full border border-stone-200/50">
                <button onClick={() => setZoomLevel(z => Math.max(1, z - 1))} className="w-7 h-7 flex items-center justify-center hover:bg-white rounded-full text-stone-500 shadow-sm transition-all"><ZoomOut size={14} /></button>
                <div className="w-16 h-1 bg-stone-200 rounded-full overflow-hidden">
                    <div className="h-full bg-stone-800 transition-all duration-300" style={{ width: `${zoomLevel * 20}%` }}></div>
                </div>
                <button onClick={() => setZoomLevel(z => Math.min(5, z + 1))} className="w-7 h-7 flex items-center justify-center hover:bg-white rounded-full text-stone-500 shadow-sm transition-all"><ZoomIn size={14} /></button>
            </div>
            
            <button onClick={() => document.getElementById('add-file-editor')?.click()} className="w-10 h-10 flex items-center justify-center bg-white text-stone-600 border border-stone-200 rounded-full hover:bg-stone-50 hover:border-stone-300 transition-all shadow-sm">
                <Plus size={20} strokeWidth={1.5} />
            </button>
            <input id="add-file-editor" type="file" multiple accept=".pdf, .jpg, .jpeg, .png" className="hidden" onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))} />

            {/* SAVE BUTTON */}
            {mergedUrl ? (
                <a 
                    href={mergedUrl} 
                    download={`ZenPDF_Merged_${Date.now()}.pdf`}
                    className="px-6 py-2.5 bg-stone-900 text-white hover:bg-stone-800 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg shadow-stone-300 animate-in fade-in active:scale-95 transition-all"
                >
                    <Download size={16} /> Download
                </a>
            ) : (
                <button 
                    onClick={mergePages} 
                    disabled={isSaving || pageOrder.length === 0}
                    className="px-6 py-2.5 bg-stone-900 text-white hover:bg-stone-800 rounded-full text-sm font-medium flex items-center gap-2 shadow-lg shadow-stone-300 disabled:opacity-50 disabled:cursor-not-allowed active:scale-95 transition-all"
                >
                    {isSaving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />} 
                    Save PDF
                </button>
            )}
         </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <SortableContext items={pageOrder.map(p => p.uniqueId)} strategy={rectSortingStrategy}>
          <div className={cn("grid gap-6 pb-32 transition-all duration-500 ease-out", getGridClass())}>
            {pageOrder.map(page => (
              <SortablePageGridItem 
                key={page.uniqueId} 
                page={page} 
                isSelected={selectedPageIds.includes(page.uniqueId)} 
                onToggleSelect={handlePageSelect} 
                onRotate={rotatePage} 
                onRemove={removePage} 
              />
            ))}
          </div>
        </SortableContext>
        <DragOverlay>
          {activeItem ? (<div className="relative"><SortablePageGridItem page={activeItem} isOverlay />{dragCount > 1 && (<div className="absolute -top-3 -right-3 bg-stone-900 text-white text-xs font-bold w-8 h-8 flex items-center justify-center rounded-full shadow-xl border-2 border-white z-50">{dragCount}</div>)}</div>) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}