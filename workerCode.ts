export const WORKER_CODE = `
if (typeof window === 'undefined') { self.window = self; }
if (typeof document === 'undefined') {
  self.document = {
    currentScript: null,
    createElement: (tagName) => {
      if (tagName === 'canvas') return new OffscreenCanvas(1, 1);
      return { getContext: () => ({}), style: {} };
    },
    createElementNS: () => ({ style: {} }),
    head: { appendChild: () => {}, removeChild: () => {} },
    body: { appendChild: () => {}, removeChild: () => {} },
    documentElement: { style: {} }
  };
}
if (typeof navigator === 'undefined') { self.navigator = { userAgent: 'worker' }; }

// Import libraries securely
try {
  importScripts('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.min.js');
  importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
  self.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
} catch (e) {
  self.postMessage({ type: 'ERROR', payload: 'Failed to load PDF libraries. Please check your internet connection.' });
}

self.onmessage = async (e) => {
  const { type, payload } = e.data;

  try {
    // Check if libraries are loaded
    if (!self.PDFLib || !self.pdfjsLib) {
       throw new Error('PDF libraries not initialized.');
    }

    if (type === 'PARSE_FILE') {
      const { file, fileId } = payload;

      if (file.type === 'image/jpeg' || file.type === 'image/png') {
        self.postMessage({ type: 'FILE_PARSED', payload: { fileId, pageCount: 1 } });
        self.postMessage({
          type: 'THUMBNAIL_GENERATED',
          payload: { fileId, pageIndex: 0, url: URL.createObjectURL(file) }
        });
        return;
      }

      const arrayBuffer = await file.arrayBuffer();
      const loadingTask = self.pdfjsLib.getDocument({
        data: arrayBuffer,
        disableAutoFetch: true,
        disableStream: true
      });
      const pdf = await loadingTask.promise;
      self.postMessage({ type: 'FILE_PARSED', payload: { fileId, pageCount: pdf.numPages } });

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const viewport = page.getViewport({ scale: 0.25 });
        const canvas = new OffscreenCanvas(viewport.width, viewport.height);
        const ctx = canvas.getContext('2d');
        await page.render({ canvasContext: ctx, viewport }).promise;
        const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
        self.postMessage({
          type: 'THUMBNAIL_GENERATED',
          payload: { fileId, pageIndex: i - 1, url: URL.createObjectURL(blob) }
        });
      }
    }
    
    // Unified Merge Logic
    if (type === 'MERGE_PAGES' || type === 'MERGE_PDFS') {
      const { files, pages, taskType } = payload;
      const { PDFDocument, degrees } = self.PDFLib;
      const mergedPdf = await PDFDocument.create();
      
      const pdfCache = {}; 
      const imageCache = {};

      const pagesToProcess = pages || []; 

      if (type === 'MERGE_PDFS') {
          // Quick Merge (All Files)
          for (const fileData of files) {
            if (fileData.file.type.startsWith('image/')) {
               const arrayBuffer = await fileData.file.arrayBuffer();
               let image;
               if (fileData.file.type === 'image/jpeg') image = await mergedPdf.embedJpg(arrayBuffer);
               else image = await mergedPdf.embedPng(arrayBuffer);
               const page = mergedPdf.addPage([image.width, image.height]);
               page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
            } else {
               const arrayBuffer = await fileData.file.arrayBuffer();
               const pdf = await PDFDocument.load(arrayBuffer);
               const copiedPages = await mergedPdf.copyPages(pdf, pdf.getPageIndices());
               copiedPages.forEach((page) => mergedPdf.addPage(page));
            }
          }
      } else {
          // Specific Page Merge/Extract
          for (const p of pagesToProcess) {
            const fileData = files.find(f => f.id === p.fileId);
            if (!fileData) continue;

            if (fileData.file.type.startsWith('image/')) {
                let image = imageCache[p.fileId];
                if (!image) {
                    const arrayBuffer = await fileData.file.arrayBuffer();
                    if (fileData.file.type === 'image/jpeg') image = await mergedPdf.embedJpg(arrayBuffer);
                    else image = await mergedPdf.embedPng(arrayBuffer);
                    imageCache[p.fileId] = image;
                }
                // Handle rotation for image
                let dims = { width: image.width, height: image.height };
                if (p.rotation === 90 || p.rotation === 270) {
                     dims = { width: image.height, height: image.width };
                }
                
                const page = mergedPdf.addPage([dims.width, dims.height]);
                
                // Draw image and rotate page
                page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
                page.setRotation(degrees(p.rotation));
            } else {
                let srcPdf = pdfCache[p.fileId];
                if (!srcPdf) {
                  const arrayBuffer = await fileData.file.arrayBuffer();
                  srcPdf = await PDFDocument.load(arrayBuffer);
                  pdfCache[p.fileId] = srcPdf;
                }
                const [copiedPage] = await mergedPdf.copyPages(srcPdf, [p.pageIndex]);
                if (p.rotation !== 0) {
                  const existingRotation = copiedPage.getRotation().angle;
                  copiedPage.setRotation(degrees(existingRotation + p.rotation));
                }
                mergedPdf.addPage(copiedPage);
            }
          }
      }

      const mergedBytes = await mergedPdf.save();
      const blob = new Blob([mergedBytes], { type: 'application/pdf' });
      self.postMessage({ type: 'MERGE_COMPLETE', payload: { url: URL.createObjectURL(blob), taskType } }); 
    }
  } catch (error) {
    console.error('Worker Inner Error:', error);
    self.postMessage({ type: 'ERROR', payload: error.message || 'Unknown processing error' });
  }
};
`;