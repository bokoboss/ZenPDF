import {
  getDocument,
  type PDFDocumentLoadingTask,
  type PDFDocumentProxy,
} from 'pdfjs-dist';
import { PdfDomainError, toPdfDomainError } from '../errors';

export interface PdfOperationContext {
  isCancelled: () => boolean;
  onProgress?: (completed: number, total: number, phase: 'parse' | 'thumbnail' | 'write') => void;
  registerCleanup?: (cleanup: () => void | Promise<void>) => void;
}

export class OffscreenCanvasFactory {
  constructor(_options?: { enableHWA?: boolean }) {}

  create(width: number, height: number) {
    if (width <= 0 || height <= 0) throw new Error('Invalid canvas size');
    const canvas = new OffscreenCanvas(Math.ceil(width), Math.ceil(height));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Could not create a 2D canvas context');
    return { canvas, context };
  }

  reset(canvasAndContext: { canvas: OffscreenCanvas | null }, width: number, height: number): void {
    if (!canvasAndContext.canvas || width <= 0 || height <= 0) throw new Error('Invalid canvas');
    canvasAndContext.canvas.width = Math.ceil(width);
    canvasAndContext.canvas.height = Math.ceil(height);
  }

  destroy(canvasAndContext: { canvas: OffscreenCanvas | null; context?: unknown }): void {
    if (!canvasAndContext.canvas) return;
    canvasAndContext.canvas.width = 0;
    canvasAndContext.canvas.height = 0;
    canvasAndContext.canvas = null;
    canvasAndContext.context = null;
  }
}

/**
 * PDF.js normally creates SVG filters through a DOM document. Thumbnails only
 * need the base no-op behavior, which keeps the display layer worker-safe.
 */
export class OffscreenFilterFactory {
  constructor(_options?: { docId?: string; ownerDocument?: unknown }) {}

  addFilter(_maps: unknown): string { return 'none'; }
  addHCMFilter(_fgColor: unknown, _bgColor: unknown): string { return 'none'; }
  addAlphaFilter(_map: unknown): string { return 'none'; }
  addLuminosityFilter(_map: unknown): string { return 'none'; }
  addKnockoutFilter(_alpha = 0): string { return 'none'; }
  addHighlightHCMFilter(
    _filterName: unknown,
    _fgColor: unknown,
    _bgColor: unknown,
    _newFgColor: unknown,
    _newBgColor: unknown,
  ): string { return 'none'; }
  addSelectionHCMFilter(_fgColor: unknown, _bgColor: unknown): string { return 'none'; }
  addSelectionFilter(): string { return 'none'; }
  createSelectionStyle(_pageColors?: unknown): null { return null; }
  destroy(_keepHCM = false): void {}
}

function ensureNotCancelled(context: PdfOperationContext): void {
  if (context.isCancelled()) throw new PdfDomainError('TASK_CANCELLED', 'PDF task was cancelled.');
}

export async function loadPdfDocument(
  file: File,
  context: PdfOperationContext,
): Promise<PDFDocumentProxy> {
  ensureNotCancelled(context);
  let loadingTask: PDFDocumentLoadingTask | undefined;
  try {
    const data = new Uint8Array(await file.arrayBuffer());
    ensureNotCancelled(context);

    loadingTask = getDocument({
      data,
      disableAutoFetch: true,
      disableStream: true,
      disableRange: true,
      isOffscreenCanvasSupported: true,
      isImageDecoderSupported: false,
      disableFontFace: true,
      useSystemFonts: false,
      useWasm: false,
      CanvasFactory: OffscreenCanvasFactory,
      FilterFactory: OffscreenFilterFactory,
    });
    context.registerCleanup?.(() => loadingTask?.destroy());
    loadingTask.onProgress = ({ loaded, total }: { loaded: number; total: number }) => {
      context.onProgress?.(loaded, total || loaded, 'parse');
    };

    const document = await loadingTask.promise;
    ensureNotCancelled(context);
    return document;
  } catch (error) {
    await loadingTask?.destroy().catch(() => undefined);
    throw toPdfDomainError(error, 'PDF_PARSE_FAILED');
  }
}
