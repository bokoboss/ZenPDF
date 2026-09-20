import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfDomainError, toPdfDomainError } from '../errors';
import type { PdfOperationContext } from './parse';

export const MAX_CONCURRENT_THUMBNAILS = 2;

export interface ThumbnailSchedulerMetrics {
  configuredMaxConcurrency: number;
  maxObservedConcurrency: number;
  activeCount: number;
  completedPageIndexes: number[];
  duplicateSuccessfulRenders: number;
  reprioritizationCount: number;
  renderCancellationCount: number;
  backgroundCompletedBeforeInitialPriorityCompletion: number;
}

export type ThumbnailPageRenderer = (
  pageIndex: number,
  context: PdfOperationContext,
) => Promise<Blob>;

export interface ThumbnailSchedulerOptions {
  maxConcurrency?: number;
  renderPage?: ThumbnailPageRenderer;
}

export interface ThumbnailScheduler {
  readonly done: Promise<void>;
  setPriority(orderedPageIndexes: readonly number[]): void;
  cancel(): Promise<void>;
  getMetrics(): ThumbnailSchedulerMetrics;
}

function cancelledError(): PdfDomainError {
  return new PdfDomainError('TASK_CANCELLED', 'PDF task was cancelled.');
}

export function isRenderingCancelledException(error: unknown): boolean {
  return Boolean(
    error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name?: unknown }).name === 'RenderingCancelledException',
  );
}

function normalizePriority(pageIndexes: readonly number[], pageCount: number): number[] {
  const seen = new Set<number>();
  const result: number[] = [];
  for (const pageIndex of pageIndexes) {
    if (
      !Number.isInteger(pageIndex) ||
      pageIndex < 0 ||
      pageIndex >= pageCount ||
      seen.has(pageIndex)
    ) continue;
    seen.add(pageIndex);
    result.push(pageIndex);
  }
  return result;
}

export async function renderThumbnail(
  document: PDFDocumentProxy,
  pageNumber: number,
  context: PdfOperationContext,
): Promise<Blob> {
  if (context.isCancelled()) throw cancelledError();

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

    if (context.isCancelled()) throw cancelledError();
    return await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
  } catch (error) {
    // PDF.js uses this exception when a RenderTask is cancelled. Keep it
    // distinguishable so the scheduler can retry the page instead of
    // converting scheduler control flow into a document failure.
    if (isRenderingCancelledException(error)) throw error;
    throw toPdfDomainError(error, 'PDF_RENDER_FAILED');
  } finally {
    if (canvas) {
      canvas.width = 0;
      canvas.height = 0;
    }
  }
}

export function createThumbnailScheduler(
  document: PDFDocumentProxy,
  pageCount: number,
  context: PdfOperationContext,
  onThumbnail: (pageIndex: number, blob: Blob) => void,
  options: ThumbnailSchedulerOptions = {},
): ThumbnailScheduler {
  const configuredMaxConcurrency = Math.max(
    1,
    Math.floor(options.maxConcurrency ?? MAX_CONCURRENT_THUMBNAILS),
  );
  const renderPage = options.renderPage ?? (
    (pageIndex, renderContext) => renderThumbnail(document, pageIndex + 1, renderContext)
  );
  const queued = new Set<number>();
  for (let pageIndex = 0; pageIndex < pageCount; pageIndex += 1) queued.add(pageIndex);

  const priorityQueue: number[] = pageCount > 0 ? [0] : [];
  let backgroundQueue = Array.from(queued).filter(pageIndex => pageIndex !== 0);
  let currentPriority = pageCount > 0 ? [0] : [];
  let prioritySignature = currentPriority.join(',');
  const completed = new Set<number>();
  const inFlight = new Set<number>();
  const cancellationAttempts = new Map<number, number>();

  let activeCount = 0;
  let cancelRequested = false;
  let failure: PdfDomainError | null = null;
  let settled = false;
  let resolveDone!: () => void;
  let rejectDone!: (error: PdfDomainError) => void;
  const done = new Promise<void>((resolve, reject) => {
    resolveDone = resolve;
    rejectDone = reject;
  });
  let cancellationCompletion: Promise<void> | null = null;
  let resolveCancellation: (() => void) | null = null;

  const metrics: ThumbnailSchedulerMetrics = {
    configuredMaxConcurrency,
    maxObservedConcurrency: 0,
    activeCount: 0,
    completedPageIndexes: [],
    duplicateSuccessfulRenders: 0,
    reprioritizationCount: 0,
    renderCancellationCount: 0,
    backgroundCompletedBeforeInitialPriorityCompletion: 0,
  };

  const initialPriority = new Set(currentPriority);
  let initialPriorityComplete = initialPriority.size === 0;

  const settleIfReady = () => {
    if (activeCount !== 0) return;

    if (!settled) {
      if (failure) {
        settled = true;
        rejectDone(failure);
      } else if (cancelRequested || context.isCancelled()) {
        settled = true;
        rejectDone(cancelledError());
      } else if (completed.size === pageCount) {
        settled = true;
        resolveDone();
      }
    }

    if (cancelRequested && resolveCancellation) {
      const resolve = resolveCancellation;
      resolveCancellation = null;
      resolve();
    }
  };

  const requestCancel = () => {
    if (settled || cancelRequested) return;
    cancelRequested = true;
    queued.clear();
    priorityQueue.length = 0;
    backgroundQueue = [];
    settleIfReady();
  };

  const fail = (error: unknown) => {
    if (failure || cancelRequested) return;
    failure = error instanceof PdfDomainError
      ? error
      : toPdfDomainError(error, 'PDF_RENDER_FAILED');
    queued.clear();
    priorityQueue.length = 0;
    backgroundQueue = [];
  };

  const takeNextPage = (): number | undefined => {
    while (priorityQueue.length > 0) {
      const pageIndex = priorityQueue.shift();
      if (pageIndex !== undefined && queued.has(pageIndex)) return pageIndex;
    }
    while (backgroundQueue.length > 0) {
      const pageIndex = backgroundQueue.shift();
      if (pageIndex !== undefined && queued.has(pageIndex)) return pageIndex;
    }
    return undefined;
  };

  const requeuePage = (pageIndex: number) => {
    queued.add(pageIndex);
    if (currentPriority.includes(pageIndex)) priorityQueue.push(pageIndex);
    else backgroundQueue.push(pageIndex);
  };

  const runPage = async (pageIndex: number): Promise<void> => {
    try {
      const blob = await renderPage(pageIndex, context);
      if (cancelRequested || failure || context.isCancelled()) return;
      if (completed.has(pageIndex)) {
        metrics.duplicateSuccessfulRenders += 1;
        return;
      }

      completed.add(pageIndex);
      metrics.completedPageIndexes.push(pageIndex);
      onThumbnail(pageIndex, blob);
      context.onProgress?.(completed.size, pageCount, 'thumbnail', {
        pageIndex,
        inFlight: activeCount,
        configuredMaxConcurrency: metrics.configuredMaxConcurrency,
        maxObservedConcurrency: metrics.maxObservedConcurrency,
        duplicateSuccessfulRenders: metrics.duplicateSuccessfulRenders,
        reprioritizationCount: metrics.reprioritizationCount,
        renderCancellationCount: metrics.renderCancellationCount,
      });

      if (!initialPriorityComplete && initialPriority.has(pageIndex)) {
        initialPriorityComplete = [...initialPriority].every(index => completed.has(index));
      } else if (!initialPriorityComplete && !initialPriority.has(pageIndex)) {
        metrics.backgroundCompletedBeforeInitialPriorityCompletion += 1;
      }
    } catch (error) {
      if (isRenderingCancelledException(error)) {
        metrics.renderCancellationCount += 1;
        const attempts = (cancellationAttempts.get(pageIndex) ?? 0) + 1;
        cancellationAttempts.set(pageIndex, attempts);
        if (cancelRequested || context.isCancelled()) {
          requestCancel();
        } else if (attempts === 1) {
          requeuePage(pageIndex);
        } else {
          fail(new PdfDomainError(
            'PDF_RENDER_FAILED',
            `Thumbnail rendering was cancelled repeatedly for page ${pageIndex}.`,
            error,
          ));
        }
      } else if (cancelRequested || context.isCancelled() || (
        error instanceof PdfDomainError && error.code === 'TASK_CANCELLED'
      )) {
        requestCancel();
      } else {
        fail(error);
      }
    }
  };

  const pump = () => {
    if (failure || cancelRequested || settled) {
      settleIfReady();
      return;
    }
    if (context.isCancelled()) {
      requestCancel();
      return;
    }

    while (activeCount < configuredMaxConcurrency) {
      const pageIndex = takeNextPage();
      if (pageIndex === undefined) break;
      queued.delete(pageIndex);
      inFlight.add(pageIndex);
      activeCount += 1;
      metrics.activeCount = activeCount;
      metrics.maxObservedConcurrency = Math.max(metrics.maxObservedConcurrency, activeCount);

      const renderPromise = runPage(pageIndex);
      void renderPromise.finally(() => {
        inFlight.delete(pageIndex);
        activeCount -= 1;
        metrics.activeCount = activeCount;
        if (failure || cancelRequested || context.isCancelled()) settleIfReady();
        else if (completed.size === pageCount && activeCount === 0) settleIfReady();
        else pump();
      });
    }

    if (activeCount === 0) settleIfReady();
  };

  const scheduler: ThumbnailScheduler = {
    done,
    setPriority: orderedPageIndexes => {
      if (settled || cancelRequested || failure) return;
      const nextPriority = normalizePriority(orderedPageIndexes, pageCount);
      const nextSignature = nextPriority.join(',');
      if (nextSignature === prioritySignature) return;

      prioritySignature = nextSignature;
      currentPriority = nextPriority;
      metrics.reprioritizationCount += 1;
      priorityQueue.length = 0;
      for (const pageIndex of currentPriority) {
        if (queued.has(pageIndex)) priorityQueue.push(pageIndex);
      }
      const nextPrioritySet = new Set(currentPriority);
      backgroundQueue = [...queued]
        .filter(pageIndex => !nextPrioritySet.has(pageIndex))
        .sort((left, right) => left - right);
      pump();
    },
    cancel: () => {
      if (settled || cancelRequested) return cancellationCompletion ?? Promise.resolve();
      cancellationCompletion = new Promise<void>(resolve => {
        resolveCancellation = resolve;
      });
      requestCancel();
      return cancellationCompletion;
    },
    getMetrics: () => ({
      ...metrics,
      completedPageIndexes: [...metrics.completedPageIndexes],
    }),
  };

  pump();
  return scheduler;
}

export async function renderThumbnails(
  document: PDFDocumentProxy,
  pageCount: number,
  context: PdfOperationContext,
  onThumbnail: (pageIndex: number, blob: Blob) => void,
): Promise<void> {
  const scheduler = createThumbnailScheduler(document, pageCount, context, onThumbnail);
  await scheduler.done;
}
