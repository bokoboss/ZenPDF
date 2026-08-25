import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfDomainError, toPdfDomainError } from '../errors';
import type { PdfOperationContext } from './parse';

export async function renderThumbnail(
  document: PDFDocumentProxy,
  pageNumber: number,
  context: PdfOperationContext,
): Promise<Blob> {
  if (context.isCancelled()) throw new PdfDomainError('TASK_CANCELLED', 'PDF task was cancelled.');

  let canvas: OffscreenCanvas | null = null;
  try {
    const page = await document.getPage(pageNumber);
    const viewport = page.getViewport({ scale: 0.25 });
    canvas = new OffscreenCanvas(Math.max(1, Math.ceil(viewport.width)), Math.max(1, Math.ceil(viewport.height)));
    const canvasContext = canvas.getContext('2d', { willReadFrequently: true });
    if (!canvasContext) throw new Error('Could not create a thumbnail canvas context');

    await page.render({
      canvas: canvas as unknown as HTMLCanvasElement,
      canvasContext: canvasContext as unknown as CanvasRenderingContext2D,
      viewport,
    }).promise;

    if (context.isCancelled()) throw new PdfDomainError('TASK_CANCELLED', 'PDF task was cancelled.');
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  } catch (error) {
    throw toPdfDomainError(error, 'PDF_RENDER_FAILED');
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export async function renderThumbnails(
  document: PDFDocumentProxy,
  pageCount: number,
  context: PdfOperationContext,
  onThumbnail: (pageIndex: number, blob: Blob) => void,
): Promise<void> {
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) {
    if (context.isCancelled()) throw new PdfDomainError('TASK_CANCELLED', 'PDF task was cancelled.');
    const blob = await renderThumbnail(document, pageIndex + 1, context);
    onThumbnail(pageIndex, blob);
    context.onProgress?.(pageIndex + 1, pageCount, 'thumbnail');
  }
}
