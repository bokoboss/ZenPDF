import React, { useEffect, useRef, useState } from 'react';
import { Layers, AlertCircle } from 'lucide-react';
import { usePdfStore } from './store';
import { Stepper } from './components/Stepper';
import { UploadPage } from './components/UploadPage';
import { FileManager } from './components/FileManager';
import { PageEditor } from './components/PageEditor';
import { ToastContainer } from './components/ToastContainer';

export default function App() {
  const { currentPage, initWorker, setPage, resetAll } = usePdfStore(); 
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const resetCancelRef = useRef<HTMLButtonElement>(null);
  const resetDialogRef = useRef<HTMLDivElement>(null);
  const appContentRef = useRef<HTMLDivElement>(null);

  useEffect(() => { initWorker(); }, [initWorker]);

  useEffect(() => {
    const appContent = appContentRef.current;
    if (!appContent) return;
    if (showResetConfirm) appContent.setAttribute('inert', '');
    else appContent.removeAttribute('inert');
  }, [showResetConfirm]);

  useEffect(() => {
    if (!showResetConfirm) return;
    const trigger = resetTriggerRef.current;
    const focusFrame = window.requestAnimationFrame(() => resetCancelRef.current?.focus());

    return () => {
      window.cancelAnimationFrame(focusFrame);
      if (trigger?.isConnected) {
        window.requestAnimationFrame(() => trigger.focus());
      }
    };
  }, [showResetConfirm]);

  const handleResetDialogKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      setShowResetConfirm(false);
      return;
    }
    if (event.key !== 'Tab') return;

    const dialog = resetDialogRef.current;
    if (!dialog) return;
    const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(
      'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
    ));
    if (focusable.length === 0) {
      event.preventDefault();
      dialog.focus();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCF8] font-sans text-stone-800 selection:bg-stone-200 pb-20">
      <div ref={appContentRef} aria-hidden={showResetConfirm ? true : undefined}>
        {/* 1. Zen Header */}
        <nav className="sticky top-0 z-50 bg-[#FDFCF8]/80 backdrop-blur-xl border-b border-stone-200/50 shadow-sm px-6 h-20 flex items-center justify-between transition-all duration-500">
          <button
            type="button"
            onClick={() => setPage(1)}
            aria-label="ZenPDF home"
            className="flex items-center gap-3 cursor-pointer group bg-transparent border-0 p-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:ring-offset-4 rounded-2xl"
          >
          <div className="w-10 h-10 bg-stone-900 rounded-xl flex items-center justify-center text-white shadow-lg shadow-stone-300 group-hover:scale-105 transition-transform duration-300">
            <Layers size={20} strokeWidth={1.5} />
          </div>
          <span className="font-medium text-xl tracking-tight text-stone-900 group-hover:text-stone-600 transition-colors">ZenPDF</span>
          </button>
        
          <div className="hidden md:block absolute left-1/2 -translate-x-1/2">
              <Stepper current={currentPage} />
          </div>

          {currentPage > 1 && (
            <button
              ref={resetTriggerRef}
              type="button"
              onClick={() => setShowResetConfirm(true)}
              aria-haspopup="dialog"
              className="text-sm font-medium text-stone-400 hover:text-red-600 px-4 py-2 rounded-full hover:bg-stone-100 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:ring-offset-2"
            >
              Start Over
            </button>
          )}
        </nav>
      
        <main className="container mx-auto pt-4">
          {currentPage === 1 && <UploadPage />}
          {currentPage === 2 && <FileManager />}
          {currentPage === 3 && <PageEditor />}
        </main>

        <ToastContainer />
      </div>

      {/* Confirmation Modal */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-stone-900/20 backdrop-blur-sm animate-in fade-in duration-300">
          <div
            ref={resetDialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="start-over-title"
            tabIndex={-1}
            onKeyDown={handleResetDialogKeyDown}
            className="bg-white rounded-3xl shadow-2xl max-w-sm w-full p-8 animate-in zoom-in-95 duration-300 border border-white/50 ring-1 ring-stone-900/5"
          >
            <div className="flex flex-col items-center text-center gap-4 mb-8">
              <div className="w-14 h-14 bg-stone-50 rounded-full flex items-center justify-center text-stone-400 mb-2 ring-1 ring-stone-100"><AlertCircle size={28} strokeWidth={1.5} /></div>
              <div>
                <h3 id="start-over-title" className="text-xl font-semibold text-stone-900">Start Over?</h3>
                <p className="text-stone-500 mt-2 text-sm leading-relaxed">This will clear your current workspace. Unsaved changes will be lost.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <button ref={resetCancelRef} type="button" onClick={() => setShowResetConfirm(false)} className="flex-1 py-3 text-stone-600 font-medium hover:bg-stone-50 rounded-2xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:ring-offset-2">Cancel</button>
              <button type="button" onClick={() => { resetAll(); setShowResetConfirm(false); }} className="flex-1 py-3 bg-stone-900 text-white font-medium hover:bg-stone-800 rounded-2xl shadow-lg shadow-stone-200 transition-all active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-800 focus-visible:ring-offset-2">Confirm Reset</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
