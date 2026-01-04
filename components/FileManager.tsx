import React from 'react';
import { 
  DndContext, 
  closestCenter, 
  KeyboardSensor, 
  PointerSensor, 
  useSensor, 
  useSensors 
} from '@dnd-kit/core';
import { 
  SortableContext, 
  sortableKeyboardCoordinates, 
  verticalListSortingStrategy 
} from '@dnd-kit/sortable';
import { Download, Zap, Grid, Loader2, Plus } from 'lucide-react';
import { usePdfStore } from '../store';
import { SortableFileItem } from './SortableFileItem';

export function FileManager() {
  const { files, reorderFiles, removeFile, initPageEditor, mergeFiles, isSaving, mergedUrl, addFiles } = usePdfStore();
  const sensors = useSensors(useSensor(PointerSensor), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  return (
    <div className="max-w-3xl mx-auto p-6 animate-in slide-in-from-bottom-8 duration-700">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h2 className="text-3xl font-light text-stone-900 tracking-tight">Documents</h2>
          <p className="text-stone-500 mt-1 text-sm">Drag to reorder your files</p>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => document.getElementById('add-more')?.click()} 
            className="group flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-2xl hover:bg-stone-50 hover:border-stone-300 transition-all shadow-sm"
          >
            <Plus size={16} className="text-stone-400 group-hover:text-stone-600 transition-colors" />
            Add File
          </button>
          <input id="add-more" type="file" multiple accept=".pdf, .jpg, .jpeg, .png" className="hidden" onChange={(e) => e.target.files && addFiles(Array.from(e.target.files))} />
        </div>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => { if (e.active.id !== e.over?.id) reorderFiles(e.active.id as string, e.over!.id as string); }}>
        <SortableContext items={files.map(f => f.id)} strategy={verticalListSortingStrategy}>
          <div className="space-y-4 mb-12">
            {files.map(file => <SortableFileItem key={file.id} file={file} onRemove={removeFile} />)}
            {files.length === 0 && (
              <div className="flex flex-col items-center justify-center py-20 text-stone-400 bg-white/50 rounded-3xl border border-dashed border-stone-200">
                <p>No documents yet.</p>
              </div>
            )}
          </div>
        </SortableContext>
      </DndContext>

      <div className="pt-6 border-t border-stone-100">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {mergedUrl ? (
             <a 
                href={mergedUrl} 
                download={`ZenPDF_Merged_${Date.now()}.pdf`} 
                className="w-full py-4 bg-stone-900 text-white rounded-2xl font-medium text-lg hover:bg-stone-800 active:scale-[0.99] transition-all flex items-center justify-center gap-3 shadow-xl shadow-stone-200"
             >
                <Download size={20} strokeWidth={1.5} /> Download PDF
             </a>
          ) : (
             <button 
                onClick={mergeFiles} 
                disabled={files.length === 0 || isSaving} 
                className="w-full py-4 bg-white border border-stone-200 text-stone-700 rounded-2xl font-medium text-lg hover:bg-stone-50 hover:border-stone-300 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3 shadow-sm hover:shadow-md"
             >
                {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Zap size={20} strokeWidth={1.5} className="text-stone-400" />} 
                Quick Merge
             </button>
          )}
          
          <button 
            onClick={initPageEditor} 
            disabled={files.length === 0 || isSaving} 
            className="w-full py-4 bg-stone-100 text-stone-900 rounded-2xl font-medium text-lg hover:bg-stone-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
          >
            <Grid size={20} strokeWidth={1.5} /> 
            Page Editor
          </button>
        </div>
      </div>
    </div>
  );
}