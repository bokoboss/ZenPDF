import { expect, test, type Locator, type Page } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import {
  makeRasterScannedPdf,
  makeVectorTextHeavyPdf,
} from '../fixtures/realContentFixtures';

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

interface FixtureDefinition {
  name: string;
  pageCount: number;
  create: () => Promise<Buffer>;
}

const fixtures: FixtureDefinition[] = [
  { name: 'vector-text-heavy', pageCount: 120, create: () => makeVectorTextHeavyPdf(120) },
  { name: 'raster-scanned-like', pageCount: 100, create: () => makeRasterScannedPdf(100) },
];

function pageCard(page: Page, pageIndex: number): Locator {
  return page.locator(`[data-page-card][data-page-index="${pageIndex}"]`);
}

async function schedulingState(grid: Locator): Promise<SchedulingState> {
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

function windowIndexes(state: SchedulingState, pageCount: number): Set<number> {
  const indexes = new Set<number>();
  for (let row = state.overscanStartRow; row <= state.overscanEndRow; row += 1) {
    for (let column = 0; column < state.columns; column += 1) {
      const pageIndex = row * state.columns + column;
      if (pageIndex < pageCount) indexes.add(pageIndex);
    }
  }
  return indexes;
}

async function waitForReadyIndexes(page: Page, expected: Set<number>): Promise<SchedulingState> {
  const grid = page.locator('[data-windowed-page-grid]');
  await expect.poll(async () => {
    const state = await schedulingState(grid);
    return [...expected].every(index => state.readyIndexes.includes(index));
  }, { timeout: 120_000 }).toBe(true);
  return schedulingState(grid);
}

test.describe('Phase 2B real-content performance', () => {
  test.skip(
    process.env.ZENPDF_PHASE_2B_PERF !== '1',
    'Set ZENPDF_PHASE_2B_PERF=1 to run the rendering-heavy qualification fixtures.',
  );

  for (const fixture of fixtures) {
    test(`records ${fixture.name} viewport-priority scheduling`, async ({ page }) => {
      const source = await fixture.create();
      const consoleErrors: string[] = [];
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      const startedAt = performance.now();

      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
      await page.locator('input[type="file"]').first().setInputFiles({
        name: `${fixture.name}.pdf`,
        mimeType: 'application/pdf',
        buffer: source,
      });
      await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
      await expect(page.getByText(`${fixture.pageCount} Pages`)).toBeVisible({ timeout: 60_000 });
      const parsedAt = performance.now();

      await page.getByRole('button', { name: 'Page Editor' }).click();
      await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
      await expect(page.locator('[data-page-id]')).toHaveCount(fixture.pageCount);
      const grid = page.locator('[data-windowed-page-grid]');
      const editorShellState = await schedulingState(grid);
      const editorShellReadyAt = performance.now();
      expect(editorShellState.readyCount).toBeLessThan(fixture.pageCount);

      await expect(page.locator('[data-page-card] img[alt="Page"]').first()).toBeVisible({ timeout: 120_000 });
      const firstVisibleThumbnailAt = performance.now();
      const firstCardControl = page.locator('[data-page-card]').first().locator(
        'button[aria-label="Select page"], button[aria-label="Deselect page"]',
      );
      const firstCardInteractionStartedAt = performance.now();
      await firstCardControl.click();
      await expect(firstCardControl).toHaveAttribute('aria-pressed', 'true');
      const firstCardUsableAt = performance.now();
      const initialPriorityIndexes = windowIndexes(editorShellState, fixture.pageCount);
      const initialPriorityState = await waitForReadyIndexes(page, initialPriorityIndexes);
      const initialPriorityWindowCompleteAt = performance.now();
      expect(initialPriorityState.readyCount).toBeLessThan(fixture.pageCount);

      const backgroundBeforeInitialPriorityCompletion = initialPriorityState.readyIndexes
        .filter(index => !initialPriorityIndexes.has(index)).length;
      const readyBeforeFarJump = new Set(initialPriorityState.readyIndexes);
      const farJumpStartedAt = performance.now();
      await page.locator(`[data-page-id][data-page-index="${fixture.pageCount - 1}"]`).scrollIntoViewIfNeeded();
      const farCard = pageCard(page, fixture.pageCount - 1);
      await expect(farCard).toBeVisible({ timeout: 60_000 });
      const farState = await waitForReadyIndexes(page, new Set([fixture.pageCount - 1]));
      const farFirstThumbnailAt = performance.now();
      const farPriorityIndexes = windowIndexes(farState, fixture.pageCount);
      const staleBeforeFarResponse = farState.readyIndexes
        .filter(index => !readyBeforeFarJump.has(index) && !farPriorityIndexes.has(index));
      await waitForReadyIndexes(page, farPriorityIndexes);
      const farPriorityWindowCompleteAt = performance.now();

      const farInteractionStartedAt = performance.now();
      await farCard.locator('button[aria-label="Select page"]').click();
      await expect(farCard.locator('button[aria-label="Deselect page"]')).toHaveAttribute('aria-pressed', 'true');
      const farInteractionAt = performance.now();

      await expect(grid).toHaveAttribute('data-thumbnail-ready-count', String(fixture.pageCount), { timeout: 120_000 });
      const allThumbnailsAt = performance.now();
      const finalState = await schedulingState(grid);

      const metrics = {
        fixture: fixture.name,
        pageCount: fixture.pageCount,
        sourceBytes: source.byteLength,
        parseMs: Math.round(parsedAt - startedAt),
        editorShellReadyMs: Math.round(editorShellReadyAt - startedAt),
        firstCardUsableMs: Math.round(firstCardUsableAt - startedAt),
        firstVisibleThumbnailMs: Math.round(firstVisibleThumbnailAt - startedAt),
        editorReadyMs: Math.round(editorShellReadyAt - startedAt),
        allThumbnailsMs: Math.round(allThumbnailsAt - startedAt),
        initialPriorityFirstThumbnailMs: Math.round(firstVisibleThumbnailAt - editorShellReadyAt),
        initialPriorityWindowCompleteMs: Math.round(initialPriorityWindowCompleteAt - editorShellReadyAt),
        backgroundThumbnailsBeforeInitialPriorityCompletion: backgroundBeforeInitialPriorityCompletion,
        farJumpAtMs: Math.round(farJumpStartedAt - startedAt),
        farPriorityFirstThumbnailMs: Math.round(farFirstThumbnailAt - farJumpStartedAt),
        farPriorityWindowCompleteMs: Math.round(farPriorityWindowCompleteAt - farJumpStartedAt),
        staleBeforeFarResponse,
        firstCardInteractionMs: Math.round(firstCardUsableAt - firstCardInteractionStartedAt),
        farCardInteractionMs: Math.round(farInteractionAt - farInteractionStartedAt),
        configuredMaxConcurrency: finalState.configuredConcurrency,
        maxObservedConcurrency: finalState.maxObservedConcurrency,
        duplicateSuccessfulRenders: finalState.duplicateSuccessfulRenders,
        reprioritizationCount: finalState.reprioritizationCount,
        renderCancellationCount: finalState.renderCancellationCount,
        thumbnailReadyCountAtEditorShell: editorShellState.readyCount,
        userAgent: await page.evaluate(() => navigator.userAgent),
        measuredAt: new Date().toISOString(),
      };

      await mkdir('test-results/performance', { recursive: true });
      await writeFile(
        `test-results/performance/phase2b-${fixture.name}.json`,
        `${JSON.stringify(metrics, null, 2)}\n`,
        'utf8',
      );
      console.log(`ZENPDF_PHASE2B_PERFORMANCE ${JSON.stringify(metrics)}`);

      expect(metrics.initialPriorityWindowCompleteMs).toBeLessThan(metrics.allThumbnailsMs);
      expect(metrics.staleBeforeFarResponse.length).toBeLessThan(farPriorityIndexes.size);
      expect(metrics.farPriorityWindowCompleteMs).toBeLessThan(metrics.allThumbnailsMs - metrics.farJumpAtMs);
      expect(metrics.configuredMaxConcurrency).toBe(2);
      expect(metrics.maxObservedConcurrency).toBeLessThanOrEqual(metrics.configuredMaxConcurrency);
      expect(metrics.duplicateSuccessfulRenders).toBe(0);
      expect(metrics.farCardInteractionMs).toBeLessThan(500);
      expect(consoleErrors).toEqual([]);
    });
  }
});
