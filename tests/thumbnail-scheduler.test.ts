import { describe, expect, it, vi } from 'vitest';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfDomainError } from '../src/pdf/errors';
import type { PdfOperationContext } from '../src/pdf/operations/parse';
import {
  createThumbnailScheduler,
  MAX_CONCURRENT_THUMBNAILS,
} from '../src/pdf/operations/thumbnails';

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(nextResolve => {
    resolve = nextResolve;
  });
  return { promise, resolve };
}

function context(isCancelled: () => boolean = () => false): PdfOperationContext {
  return {
    isCancelled,
    onProgress: vi.fn(),
  };
}

function fakeDocument(): PDFDocumentProxy {
  return {} as PDFDocumentProxy;
}

describe('thumbnail priority scheduler', () => {
  it('starts page zero first and never exceeds the configured concurrency', async () => {
    const started: number[] = [];
    const completed: number[] = [];
    const scheduler = createThumbnailScheduler(
      fakeDocument(),
      6,
      context(),
      pageIndex => {
        completed.push(pageIndex);
      },
      {
        renderPage: async pageIndex => {
          started.push(pageIndex);
          return new Blob([`page-${pageIndex}`]);
        },
      },
    );

    await scheduler.done;

    expect(started[0]).toBe(0);
    expect(started).toHaveLength(6);
    expect(new Set(started).size).toBe(6);
    expect(completed).toHaveLength(6);
    expect(new Set(completed).size).toBe(6);
    expect(scheduler.getMetrics().maxObservedConcurrency).toBeLessThanOrEqual(MAX_CONCURRENT_THUMBNAILS);
  });

  it('moves a new far priority ahead of queued background work and deduplicates invalid indexes', async () => {
    const started: number[] = [];
    const gates = new Map<number, ReturnType<typeof deferred<Blob>>>();
    const scheduler = createThumbnailScheduler(
      fakeDocument(),
      6,
      context(),
      () => undefined,
      {
        renderPage: pageIndex => {
          started.push(pageIndex);
          if (pageIndex < 2) {
            const gate = deferred<Blob>();
            gates.set(pageIndex, gate);
            return gate.promise;
          }
          return Promise.resolve(new Blob([`page-${pageIndex}`]));
        },
      },
    );

    await Promise.resolve();
    expect(started).toEqual([0, 1]);

    scheduler.setPriority([5, 5, -1, 2.5, 99]);
    gates.get(0)?.resolve(new Blob(['page-0']));
    gates.get(1)?.resolve(new Blob(['page-1']));
    await vi.waitFor(() => expect(started).toContain(5));

    expect(started.indexOf(5)).toBeLessThan(started.indexOf(2));

    await scheduler.done;
    expect(scheduler.getMetrics().reprioritizationCount).toBe(1);
  });

  it('treats a rendering cancellation as retryable scheduler control flow', async () => {
    let attempts = 0;
    const completed: number[] = [];
    const scheduler = createThumbnailScheduler(
      fakeDocument(),
      1,
      context(),
      pageIndex => completed.push(pageIndex),
      {
        renderPage: async () => {
          if (attempts++ === 0) throw { name: 'RenderingCancelledException' };
          return new Blob(['page-0']);
        },
      },
    );

    await scheduler.done;

    expect(completed).toEqual([0]);
    expect(scheduler.getMetrics().renderCancellationCount).toBe(1);
  });

  it('waits for active renders to settle before whole-task cancellation completes', async () => {
    const gates = new Map<number, ReturnType<typeof deferred<Blob>>>();
    const started: number[] = [];
    const scheduler = createThumbnailScheduler(
      fakeDocument(),
      4,
      context(),
      () => undefined,
      {
        renderPage: pageIndex => {
          started.push(pageIndex);
          const gate = deferred<Blob>();
          gates.set(pageIndex, gate);
          return gate.promise;
        },
      },
    );

    await Promise.resolve();
    const cancellation = scheduler.cancel();
    await Promise.resolve();
    expect(started).toEqual([0, 1]);
    expect(scheduler.getMetrics().maxObservedConcurrency).toBe(2);

    gates.get(0)?.resolve(new Blob(['page-0']));
    gates.get(1)?.resolve(new Blob(['page-1']));
    await cancellation;
    await expect(scheduler.done).rejects.toMatchObject(
      new PdfDomainError('TASK_CANCELLED', 'PDF task was cancelled.'),
    );
    expect(started).toEqual([0, 1]);
    expect(scheduler.getMetrics().activeCount).toBe(0);
  });

  it('waits for another active render before reporting a fatal page failure', async () => {
    const secondPage = deferred<Blob>();
    let secondPageStarted = false;
    const scheduler = createThumbnailScheduler(
      fakeDocument(),
      3,
      context(),
      () => undefined,
      {
        renderPage: async pageIndex => {
          if (pageIndex === 0) throw new Error('render failed');
          if (pageIndex === 1) {
            secondPageStarted = true;
            return secondPage.promise;
          }
          return new Blob([`page-${pageIndex}`]);
        },
      },
    );

    await vi.waitFor(() => expect(secondPageStarted).toBe(true));
    let settled = false;
    void scheduler.done.catch(() => { settled = true; });
    await Promise.resolve();
    expect(settled).toBe(false);

    secondPage.resolve(new Blob(['page-1']));
    await expect(scheduler.done).rejects.toMatchObject({ code: 'PDF_RENDER_FAILED' });
    expect(scheduler.getMetrics().activeCount).toBe(0);
  });
});
