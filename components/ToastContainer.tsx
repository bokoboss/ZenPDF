import React from 'react';
import { CheckCircle2, AlertCircle, Info } from 'lucide-react';
import { usePdfStore } from '../store';
import { cn } from '../utils';

export function ToastContainer() {
  const toasts = usePdfStore(s => s.toasts);
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      {toasts.map(toast => (
        <div 
          key={toast.id} 
          className={cn(
            "pointer-events-auto flex items-center gap-3 px-5 py-3.5 rounded-2xl shadow-xl shadow-stone-200/50 border backdrop-blur-xl animate-in slide-in-from-right-10 fade-in duration-300 min-w-[300px]",
            toast.type === 'success' ? "bg-white/95 border-stone-200 text-stone-800" : 
            toast.type === 'error' ? "bg-red-50/95 border-red-100 text-red-800" : 
            "bg-stone-900/95 border-stone-800 text-white"
          )}
        >
          {toast.type === 'success' ? <CheckCircle2 size={20} className="text-stone-900" /> : 
           toast.type === 'error' ? <AlertCircle size={20} className="text-red-600" /> : 
           <Info size={20} className="text-stone-400" />}
          <span className="text-sm font-medium tracking-wide">{toast.message}</span>
        </div>
      ))}
    </div>
  );
}