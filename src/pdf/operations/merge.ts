import { PDFDocument, degrees, type PDFImage, type PDFPage } from 'pdf-lib';
import { PdfDomainError, toPdfDomainError } from '../errors';
import type { WorkerFileInput, WorkerPageInput } from '../protocol';
import type { PdfOperationContext } from './parse';

function normalizedRotation(rotation: number): number {
  return ((rotation % 360) + 360) % 360;
}

function fileKind(file: File): 'pdf' | 'png' | 'jpeg' {
  const type = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (type === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (type === 'image/png' || name.endsWith('.png')) return 'png';
  if (type === 'image/jpeg' || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'jpeg';
  throw new PdfDomainError('UNSUPPORTED_FILE_TYPE', `Unsupported file type: ${file.type || file.name}`);
}

function ensureNotCancelled(context: PdfOperationContext): void {
  if (context.isCancelled()) throw new PdfDomainError('TASK_CANCELLED', 'PDF task was cancelled.');
}

async function embedImage(document: PDFDocument, file: File): Promise<PDFImage> {
  const data = await file.arrayBuffer();
  return fileKind(file) === 'jpeg' ? document.embedJpg(data) : document.embedPng(data);
}

function addImagePage(document: PDFDocument, image: PDFImage, rotation = 0): PDFPage {
  const normalized = normalizedRotation(rotation);
  const isQuarterTurn = normalized === 90 || normalized === 270;
  const width = isQuarterTurn ? image.height : image.width;
  const height = isQuarterTurn ? image.width : image.height;
  const page = document.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width: image.width, height: image.height });
  if (normalized !== 0) page.setRotation(degrees(normalized));
  return page;
}

async function saveDocument(document: PDFDocument, context: PdfOperationContext): Promise<Blob> {
  ensureNotCancelled(context);
  const bytes = await document.save();
  ensureNotCancelled(context);
  context.onProgress?.(1, 1, 'write');
  return new Blob([bytes], { type: 'application/pdf' });
}

export async function mergeFiles(
  files: WorkerFileInput[],
  context: PdfOperationContext,
): Promise<Blob> {
  try {
    const document = await PDFDocument.create();
    for (const fileData of files) {
      ensureNotCancelled(context);
      const kind = fileKind(fileData.file);
      if (kind === 'pdf') {
        const source = await PDFDocument.load(await fileData.file.arrayBuffer());
        const pages = await document.copyPages(source, source.getPageIndices());
        pages.forEach(page => document.addPage(page));
      } else {
        addImagePage(document, await embedImage(document, fileData.file));
      }
    }
    return await saveDocument(document, context);
  } catch (error) {
    throw toPdfDomainError(error, 'PDF_WRITE_FAILED');
  }
}

async function mergePageSequence(
  files: WorkerFileInput[],
  pages: WorkerPageInput[],
  context: PdfOperationContext,
): Promise<Blob> {
  const document = await PDFDocument.create();
  const fileById = new Map(files.map(file => [file.id, file]));
  const pdfCache = new Map<string, PDFDocument>();
  const imageCache = new Map<string, PDFImage>();

  for (const pageInput of pages) {
    ensureNotCancelled(context);
    const fileData = fileById.get(pageInput.fileId);
    if (!fileData) continue;

    const kind = fileKind(fileData.file);
    if (kind === 'pdf') {
      let source = pdfCache.get(fileData.id);
      if (!source) {
        source = await PDFDocument.load(await fileData.file.arrayBuffer());
        pdfCache.set(fileData.id, source);
      }
      const [page] = await document.copyPages(source, [pageInput.pageIndex]);
      if (pageInput.rotation !== 0) {
        const sourceRotation = page.getRotation().angle;
        page.setRotation(degrees(normalizedRotation(sourceRotation + pageInput.rotation)));
      }
      document.addPage(page);
    } else {
      let image = imageCache.get(fileData.id);
      if (!image) {
        image = await embedImage(document, fileData.file);
        imageCache.set(fileData.id, image);
      }
      addImagePage(document, image, pageInput.rotation);
    }
  }

  return saveDocument(document, context);
}

export async function mergePages(
  files: WorkerFileInput[],
  pages: WorkerPageInput[],
  context: PdfOperationContext,
): Promise<Blob> {
  try {
    return await mergePageSequence(files, pages, context);
  } catch (error) {
    throw toPdfDomainError(error, 'PDF_WRITE_FAILED');
  }
}

export async function extractPages(
  files: WorkerFileInput[],
  pages: WorkerPageInput[],
  context: PdfOperationContext,
): Promise<Blob> {
  return mergePages(files, pages, context);
}
