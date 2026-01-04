import React, { useRef, useState } from 'react';
import { Layers, UploadCloud, Check } from 'lucide-react';
import { usePdfStore } from '../store';
import { cn } from '../utils';

export function UploadPage() {
  const addFiles = usePdfStore(s => s.addFiles);
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isDropped, setIsDropped] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(true); };
  const handleDragLeave = (e: React.DragEvent) => { e.preventDefault(); setIsDragOver(false); };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    if (e.dataTransfer.files) {
        const allowed = ['application/pdf', 'image/jpeg', 'image/png'];
        const files = Array.from(e.dataTransfer.files).filter((f: File) => allowed.includes(f.type));
        if (files.length > 0) {
            setIsDropped(true);
            await new Promise(resolve => setTimeout(resolve, 800)); // Gentle delay
            addFiles(files);
            setIsDropped(false);
        }
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] p-6 animate-in fade-in duration-700">
      <div className="text-center mb-12">
        <div className="inline-flex items-center justify-center w-20 h-20 bg-white rounded-3xl mb-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] ring-1 ring-stone-900/5">
            <Layers size={40} strokeWidth={1} className="text-stone-800" />
        </div>
        <h1 className="text-5xl font-light text-stone-900 mb-4 tracking-tight">ZenPDF</h1>
        <p className="text-stone-500 text-lg max-w-md mx-auto font-light leading-relaxed">
          Find clarity in your documents. <br/>Merge, organize, and refine with ease.
        </p>
      </div>
      
      <div 
        onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }} 
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop} 
        onClick={() => inputRef.current?.click()} 
        className={cn(
            "relative w-full max-w-xl h-80 rounded-[2.5rem] border border-dashed flex flex-col items-center justify-center cursor-pointer overflow-hidden transition-all duration-500 ease-out group", 
            isDragOver 
              ? "border-stone-400 bg-stone-50 scale-[1.02] shadow-2xl shadow-stone-200/50" 
              : "border-stone-200 bg-white/50 hover:bg-white hover:border-stone-300 hover:shadow-xl hover:shadow-stone-200/30",
            isDropped && "border-stone-900 bg-stone-50 scale-100"
        )}
      >
        <div className={cn(
          "w-16 h-16 rounded-2xl flex items-center justify-center transition-all duration-500 relative z-10",
          isDragOver ? "bg-stone-900 text-white shadow-xl scale-110" : "bg-stone-100 text-stone-400 group-hover:bg-stone-900 group-hover:text-white group-hover:scale-110",
          isDropped && "bg-stone-900 text-white scale-100"
        )}>
            {isDropped ? <Check size={24} className="animate-in zoom-in duration-300" /> : <UploadCloud size={24} strokeWidth={1.5} />}
        </div>
        
        <h3 className={cn("text-lg font-medium mt-8 transition-colors duration-300", isDropped ? "text-stone-900" : "text-stone-700")}>
            {isDropped ? "Processing..." : "Upload Documents"}
        </h3>
        
        <p className={cn("text-sm mt-2 font-light transition-colors duration-300", isDropped ? "text-stone-500" : "text-stone-400")}>
            Drag & drop or click to browse
        </p>

        <input type="file" multiple accept=".pdf, .jpg, .jpeg, .png" ref={inputRef} className="hidden" onChange={(e) => { if (e.target.files) addFiles(Array.from(e.target.files)) }} />
      </div>

      <div className="mt-16 flex flex-col items-center gap-8">
        <div className="flex items-center gap-6 opacity-60 hover:opacity-100 transition-opacity duration-300">
          <span className="text-xs font-medium text-stone-400 uppercase tracking-widest">Client-side Only • Secure • Fast</span>
        </div>
        
        <p className="text-[10px] uppercase tracking-[0.3em] text-stone-300 font-semibold hover:text-stone-500 transition-colors duration-500 cursor-default select-none">
           Crafted by BOSSKUNG
        </p>
      </div>
    </div>
  );
}