import React from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertCircle, GripVertical, Loader2, Trash2 } from 'lucide-react';
import { PdfFile } from '../types';
import { cn } from '../utils';

interface SortableFileItemProps {
  file: PdfFile;
  onRemove: (id: string) => void;
}

export const SortableFileItem: React.FC<SortableFileItemProps> = ({ file, onRemove }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: file.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.8 : 1 };

  return (
    <div 
      ref={setNodeRef} 
      style={style} 
      data-file-card
      role="group"
      aria-label={file.status === 'error' ? `${file.name} — Couldn't read file` : file.name}
      className={cn(
        "flex items-center gap-5 p-4 pl-2 bg-white rounded-2xl border border-stone-100 shadow-sm group hover:border-stone-300 transition-all duration-200", 
        isDragging && "shadow-2xl ring-1 ring-stone-900/5 rotate-[1deg] scale-[1.02] z-50 border-transparent"
      )}
    >
      <div
        {...attributes}
        {...listeners}
        data-file-drag-handle
        aria-label={`Reorder ${file.name}`}
        className="cursor-grab active:cursor-grabbing p-2 text-stone-300 hover:text-stone-500 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:ring-offset-2 rounded-lg"
      >
        <GripVertical size={20} />
      </div>
      
      <div className="w-14 h-16 bg-stone-50 rounded-lg border border-stone-100 overflow-hidden flex-shrink-0 relative shadow-inner">
        {file.status === 'error' ? (
          <div className="w-full h-full flex flex-col items-center justify-center gap-1 bg-red-50 text-red-500" aria-hidden="true">
            <AlertCircle size={18} strokeWidth={1.5} />
            <span className="text-[8px] font-semibold uppercase tracking-wide">Error</span>
          </div>
        ) : file.thumbnails[0] ? (
          <img src={file.thumbnails[0]} alt={`${file.name} preview`} className="w-full h-full object-cover opacity-90 mix-blend-multiply" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-stone-300">
            <Loader2 className="animate-spin" size={16} />
          </div>
        )}
      </div>
      
      <div className="flex-1 min-w-0 py-1">
        <h4 title={file.name} className="font-medium text-stone-800 truncate text-lg tracking-tight">{file.name}</h4>
        <div className="flex items-center gap-3 mt-1.5">
           {file.type === 'image' ? (
             <span className="bg-stone-100 text-stone-500 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase">IMG</span>
           ) : (
             <span className="bg-stone-900 text-white px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase">PDF</span>
           )}
           {file.status === 'error' ? (
             <span className="text-xs text-red-700 font-medium" role="status">Couldn't read file</span>
           ) : (
             <span className="text-xs text-stone-400 font-medium">{file.pageCount > 0 ? `${file.pageCount} Page${file.pageCount > 1 ? 's' : ''}` : '...'}</span>
           )}
           <span className="text-stone-300 text-[10px]">•</span>
           <span className="text-xs text-stone-400 font-medium">{file.size}</span>
        </div>
      </div>
      
      <button
        type="button"
        onClick={() => onRemove(file.id)} 
        aria-label={`Remove ${file.name}`}
        className="p-3 mr-2 text-stone-300 hover:text-red-500 hover:bg-red-50 rounded-xl transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:ring-offset-2"
      >
        <Trash2 size={18} strokeWidth={1.5} />
      </button>
    </div>
  );
}
