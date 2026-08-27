import React, { memo } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Check, RotateCw, X } from 'lucide-react';
import { PageItem } from '../types';
import { cn } from '../utils';
import { SkeletonPage } from './SkeletonPage';
import { usePdfStore } from '../store';

interface SortablePageGridItemProps {
  page: PageItem;
  isSelected?: boolean;
  onToggleSelect?: (id: string, e: React.MouseEvent) => void;
  onRotate?: (id: string) => void;
  onRemove?: (id: string) => void;
  isOverlay?: boolean;
}

interface PageGridShellProps {
  page: PageItem;
  isSelected?: boolean;
}

const PageThumbnail = memo(function PageThumbnail({ fileId, pageIndex, rotation }: { fileId: string; pageIndex: number; rotation: number }) {
  const thumbnail = usePdfStore(state => (
    state.files.find(file => file.id === fileId)?.thumbnails[pageIndex] ?? ''
  ));

  return thumbnail ? (
    <img
      src={thumbnail}
      alt="Page"
      className="w-full h-full object-contain transition-transform duration-300 shadow-sm"
      style={{ transform: `rotate(${rotation}deg)` }}
    />
  ) : <SkeletonPage />;
});

export const PageGridShell = memo(function PageGridShell({ page, isSelected = false }: PageGridShellProps) {
  return (
    <div
      data-page-shell
      data-page-index={page.pageIndex}
      data-page-id={page.uniqueId}
      aria-hidden="true"
      className={cn(
        "relative group aspect-[3/4] bg-white rounded-2xl border overflow-hidden",
        isSelected
          ? "border-stone-800 ring-2 ring-stone-800 shadow-xl scale-[1.02] z-10"
          : "border-stone-100",
      )}
    >
      <div className="w-full h-full p-3 flex flex-col items-center justify-center">
        <div className="w-full h-full bg-slate-100 flex items-center justify-center rounded-lg" data-page-placeholder>
          <div className="w-8 h-8 bg-slate-200 rounded-full" />
        </div>
      </div>

      <div className="absolute bottom-3 right-3 pointer-events-none">
        <span className="text-[10px] font-bold text-stone-500 bg-stone-100/80 px-2 py-1 rounded-md backdrop-blur-sm border border-stone-200/50">
          {page.pageIndex + 1}
        </span>
      </div>
    </div>
  );
});

export const SortablePageGridItem = memo(function SortablePageGridItem({ page, isSelected, onToggleSelect, onRotate, onRemove, isOverlay = false }: SortablePageGridItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: page.uniqueId });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.3 : 1 };

  if (isOverlay) {
    return (
      <div className={cn("relative aspect-[3/4] bg-white rounded-2xl border-2 border-stone-800 shadow-2xl overflow-hidden cursor-grabbing scale-105")}>
        <div className="w-full h-full p-3 flex flex-col items-center justify-center">
          <PageThumbnail fileId={page.fileId} pageIndex={page.pageIndex} rotation={page.rotation} />
        </div>
      </div>
    );
  }

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      data-page-card
      data-page-index={page.pageIndex}
      data-page-id={page.uniqueId}
      className={cn(
        "relative group aspect-[3/4] bg-white rounded-2xl border transition-all duration-300 ease-out overflow-hidden", 
        isSelected 
          ? "border-stone-800 ring-2 ring-stone-800 shadow-xl scale-[1.02] z-10" 
          : "border-stone-100 hover:border-stone-300 hover:shadow-lg hover:-translate-y-1"
      )}
    >
      <div {...attributes} {...listeners} data-page-drag-handle className="absolute inset-0 cursor-grab active:cursor-grabbing z-10" onClick={(e) => onToggleSelect?.(page.uniqueId, e)} />
      
      {/* Checkbox */}
      <button 
        onPointerDown={(e) => e.stopPropagation()} 
        onClick={(e) => { e.stopPropagation(); onToggleSelect?.(page.uniqueId, e); }} 
        aria-label={isSelected ? 'Deselect page' : 'Select page'}
        aria-pressed={Boolean(isSelected)}
        className={cn(
          "absolute top-3 left-3 z-30 w-6 h-6 rounded-lg flex items-center justify-center transition-all duration-200 shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:ring-offset-2",
          isSelected 
            ? "bg-stone-900 text-white" 
            : "bg-white/90 text-transparent border border-stone-200 hover:border-stone-400"
        )}
      >
        <Check size={14} strokeWidth={3} />
      </button>

      {/* Hover / keyboard-focus actions */}
      <div className="absolute top-3 right-3 z-30 flex gap-2 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 group-focus-within:translate-y-0">
        <button 
          onPointerDown={(e) => e.stopPropagation()} 
          onClick={(e) => { e.stopPropagation(); onRotate?.(page.uniqueId); }} 
          aria-label="Rotate page clockwise"
          title="Rotate page"
          className="p-1.5 bg-white/90 shadow-sm rounded-lg text-stone-600 hover:text-stone-900 hover:bg-stone-100 border border-stone-100/50 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800"
        >
          <RotateCw size={14} strokeWidth={2} />
        </button>
        <button 
          onPointerDown={(e) => e.stopPropagation()} 
          onClick={(e) => { e.stopPropagation(); onRemove?.(page.uniqueId); }} 
          aria-label="Remove page"
          title="Remove page"
          className="p-1.5 bg-white/90 shadow-sm rounded-lg text-stone-400 hover:text-red-600 hover:bg-red-50 border border-stone-100/50 backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800"
        >
          <X size={14} strokeWidth={2} />
        </button>
      </div>

      <div data-page-thumbnail-subtree className="content-visibility-auto w-full h-full p-3 flex flex-col items-center justify-center">
        <PageThumbnail fileId={page.fileId} pageIndex={page.pageIndex} rotation={page.rotation} />
      </div>

      {/* Page Number Badge */}
      <div className="absolute bottom-3 right-3 pointer-events-none">
        <span className="text-[10px] font-bold text-stone-500 bg-stone-100/80 px-2 py-1 rounded-md backdrop-blur-sm border border-stone-200/50">
            {page.pageIndex + 1}
        </span>
      </div>
    </div>
  );
});
