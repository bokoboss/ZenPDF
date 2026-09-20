import { expect, test, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';
import { makeVectorTextHeavyPdf } from '../fixtures/realContentFixtures';

interface SchedulingState {
  readyCount: number;
  readyIndexes: number[];
  visibleStartRow: number;
  visibleEndRow: number;
  overscanStartRow: number;
  overscanEndRow: number;
  columns: number;
  configuredConcurrency: number;
  maxObservedConcurrency: number;
  duplicateSuccessfulRenders: number;
  reprioritizationCount: number;
  renderCancellationCount: number;
}

async function schedulingState(grid: import('@playwright/test').Locator): Promise<SchedulingState> {
  return grid.evaluate(element => {
    const numberAttribute = (name: string) => Number(element.getAttribute(name));
    const readyIndexes = (element.getAttribute('data-thumbnail-ready-pages') ?? '')
      .split(',')
      .filter(Boolean)
      .map(value => Number(value.slice(value.lastIndexOf(':') + 1)))
      .filter(Number.isInteger);
    return {
      readyCount: numberAttribute('data-thumbnail-ready-count'),
      readyIndexes,
      visibleStartRow: numberAttribute('data-window-visible-start-row'),
      visibleEndRow: numberAttribute('data-window-visible-end-row'),
      overscanStartRow: numberAttribute('data-window-overscan-start-row'),
      overscanEndRow: numberAttribute('data-window-overscan-end-row'),
      columns: numberAttribute('data-window-columns'),
      configuredConcurrency: numberAttribute('data-thumbnail-configured-concurrency'),
      maxObservedConcurrency: numberAttribute('data-thumbnail-max-observed-concurrency'),
      duplicateSuccessfulRenders: numberAttribute('data-thumbnail-duplicate-successful-renders'),
      reprioritizationCount: numberAttribute('data-thumbnail-reprioritization-count'),
      renderCancellationCount: numberAttribute('data-thumbnail-render-cancellation-count'),
    };
  });
}

function windowIndexes(state: SchedulingState, pageCount = Number.POSITIVE_INFINITY): Set<number> {
  const indexes = new Set<number>();
  for (let row = state.overscanStartRow; row <= state.overscanEndRow; row += 1) {
    for (let column = 0; column < state.columns; column += 1) {
      const pageIndex = row * state.columns + column;
      if (pageIndex < pageCount) indexes.add(pageIndex);
    }
  }
  return indexes;
}

async function waitForReadyIndexes(
  page: Page,
  expectedIndexes: Set<number>,
): Promise<SchedulingState> {
  const grid = page.locator('[data-windowed-page-grid]');
  await expect.poll(async () => {
    const state = await schedulingState(grid);
    return [...expectedIndexes].every(index => state.readyIndexes.includes(index));
  }, { timeout: 60_000 }).toBe(true);
  return schedulingState(grid);
}

test('prioritizes initial and far real-content ranges while rendering in the background', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  const pageCount = 120;
  const source = await makeVectorTextHeavyPdf(pageCount);
  const startedAt = performance.now();

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'vector-text-heavy.pdf',
    mimeType: 'application/pdf',
    buffer: source,
  });

  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByText(`${pageCount} Pages`)).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Page Editor' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();

  const grid = page.locator('[data-windowed-page-grid]');
  const shellState = await schedulingState(grid);
  expect(shellState.readyCount).toBeLessThan(pageCount);
  const initialPriorityIndexes = windowIndexes(shellState);
  await expect(page.locator('[data-page-card] img[alt="Page"]').first()).toBeVisible({ timeout: 60_000 });
  const firstVisibleThumbnailMs = Math.round(performance.now() - startedAt);
  const initialWindowState = await waitForReadyIndexes(page, initialPriorityIndexes);
  const initialPriorityWindowCompleteMs = Math.round(performance.now() - startedAt);
  expect(initialWindowState.readyCount).toBeLessThan(pageCount);

  const readyBeforeFarJump = new Set(initialWindowState.readyIndexes);
  const farJumpStartedAt = performance.now();
  const farJumpAtMs = Math.round(farJumpStartedAt - startedAt);
  await page.locator(`[data-page-id][data-page-index="${pageCount - 1}"]`).scrollIntoViewIfNeeded();
  const farCard = page.locator(`[data-page-card][data-page-index="${pageCount - 1}"]`);
  await expect(farCard).toBeVisible({ timeout: 30_000 });
  const farState = await waitForReadyIndexes(page, new Set([pageCount - 1]));
  const farPriorityFirstThumbnailMs = Math.round(performance.now() - farJumpStartedAt);
  const farPriorityIndexes = windowIndexes(farState, pageCount);
  const newlyReadyAfterFarJump = farState.readyIndexes.filter(index => !readyBeforeFarJump.has(index));
  const staleBeforeFarResponse = newlyReadyAfterFarJump.filter(index => !farPriorityIndexes.has(index));

  expect(farState.readyIndexes).toContain(pageCount - 1);
  expect(staleBeforeFarResponse.length).toBeLessThan(farPriorityIndexes.size);
  expect(farPriorityFirstThumbnailMs).toBeLessThan(1_500);

  const farPriorityWindowState = await waitForReadyIndexes(page, farPriorityIndexes);
  const farPriorityWindowCompleteMs = Math.round(performance.now() - farJumpStartedAt);
  expect(farPriorityWindowState.readyCount).toBeLessThan(pageCount);

  await expect(grid).toHaveAttribute('data-thumbnail-ready-count', String(pageCount), { timeout: 120_000 });
  const allThumbnailsMs = Math.round(performance.now() - startedAt);
  expect(initialPriorityWindowCompleteMs).toBeLessThan(allThumbnailsMs);
  const finalSchedulingState = await schedulingState(grid);
  expect(finalSchedulingState.configuredConcurrency).toBe(2);
  expect(finalSchedulingState.maxObservedConcurrency).toBeLessThanOrEqual(finalSchedulingState.configuredConcurrency);
  expect(finalSchedulingState.duplicateSuccessfulRenders).toBe(0);
  expect(finalSchedulingState.reprioritizationCount).toBeGreaterThan(0);

  await farCard.locator('button[aria-label="Select page"]').click();
  await expect(farCard.locator('button[aria-label="Deselect page"]')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Save PDF' }).click();
  const downloadLink = page.getByRole('link', { name: 'Download' });
  await expect(downloadLink).toBeVisible({ timeout: 60_000 });
  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  if (!outputPath) throw new Error('Phase 2B scheduling save did not produce a download.');
  const output = await PDFDocument.load(await readFile(outputPath));
  expect(output.getPageCount()).toBe(pageCount);
  expect(consoleErrors).toEqual([]);

  console.log(`ZENPDF_PHASE2B_SCHEDULING ${JSON.stringify({
    pageCount,
    sourceBytes: source.byteLength,
    firstVisibleThumbnailMs,
    initialPriorityWindowCompleteMs,
    farJumpAtMs,
    farPriorityFirstThumbnailMs,
    farPriorityWindowCompleteMs,
    allThumbnailsMs,
    staleBeforeFarResponse,
    maxConfiguredConcurrency: finalSchedulingState.configuredConcurrency,
    maxObservedConcurrency: finalSchedulingState.maxObservedConcurrency,
    duplicateSuccessfulRenders: finalSchedulingState.duplicateSuccessfulRenders,
    reprioritizationCount: finalSchedulingState.reprioritizationCount,
    renderCancellationCount: finalSchedulingState.renderCancellationCount,
    measuredAt: new Date().toISOString(),
  })}`);
});
