import { test, expect } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { mkdir, writeFile } from 'node:fs/promises';

const pageCount = Number(process.env.ZENPDF_PERF_PAGES ?? '100');

async function makeLargePdf(count: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let i = 0; i < count; i += 1) {
    pdf.addPage([595, 842]);
  }
  return Buffer.from(await pdf.save({ useObjectStreams: true }));
}

async function readWindowMetrics(grid: import('@playwright/test').Locator) {
  return grid.evaluate(element => {
    const value = (name: string) => Number(element.getAttribute(name));
    return {
      logicalPageCount: value('data-logical-page-count'),
      lightweightShellCount: value('data-lightweight-shell-count'),
      mountedSortableCount: value('data-mounted-sortable-count'),
      mountedThumbnailCount: value('data-mounted-thumbnail-count'),
      visibleStartRow: value('data-window-visible-start-row'),
      visibleEndRow: value('data-window-visible-end-row'),
      overscanStartRow: value('data-window-overscan-start-row'),
      overscanEndRow: value('data-window-overscan-end-row'),
      columns: value('data-window-columns'),
      zoomLevel: value('data-window-zoom-level'),
      thumbnailReadyCount: value('data-thumbnail-ready-count'),
    };
  });
}

test(`records a ${pageCount}-page import and thumbnail baseline`, async ({ page }) => {
  const source = await makeLargePdf(pageCount);
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();

  const startedAt = performance.now();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: `performance-${pageCount}.pdf`,
    mimeType: 'application/pdf',
    buffer: source,
  });

  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByText(`${pageCount} Page${pageCount === 1 ? '' : 's'}`)).toBeVisible();
  const parsedAt = performance.now();

  await page.getByRole('button', { name: 'Page Editor' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save PDF' })).toBeEnabled();
  const grid = page.locator('[data-windowed-page-grid]');
  await expect(grid).toHaveAttribute('data-logical-page-count', String(pageCount));
  await expect(grid).toHaveAttribute('data-thumbnail-ready-count', /\d+/);
  const editorShellWindow = await readWindowMetrics(grid);
  const editorShellReadyAt = performance.now();

  const firstCard = page.locator('[data-page-card]').first();
  const firstCardControl = firstCard.locator(
    'button[aria-label="Select page"], button[aria-label="Deselect page"]',
  );
  await expect(firstCardControl).toBeVisible();
  const firstCardInteractionStarted = performance.now();
  await firstCardControl.click();
  await expect(firstCardControl).toHaveAttribute('aria-pressed', 'true');
  const firstCardUsableAt = performance.now();

  const firstVisibleThumbnail = page.locator('img[alt="Page"]').first();
  await expect(firstVisibleThumbnail).toBeVisible();
  const firstVisibleThumbnailAt = performance.now();

  await expect(page.locator('[data-page-id]')).toHaveCount(pageCount);
  const editorReadyAt = performance.now();

  let thumbnailsReadyAt = editorShellReadyAt;
  if (editorShellWindow.thumbnailReadyCount < pageCount) {
    await expect(grid).toHaveAttribute('data-thumbnail-ready-count', String(pageCount));
    thumbnailsReadyAt = performance.now();
  }
  const farPage = page.locator(`[data-page-index="${pageCount - 1}"]`).first();
  await farPage.scrollIntoViewIfNeeded();
  const farCard = page.locator(`[data-page-card][data-page-index="${pageCount - 1}"]`);
  await expect(farCard).toBeVisible();
  const farCardControl = farCard.locator(
    'button[aria-label="Select page"], button[aria-label="Deselect page"]',
  );
  await expect(farCardControl).toBeVisible();
  const farCardInteractionStarted = performance.now();
  await farCardControl.click();
  await expect(farCardControl).toHaveAttribute('aria-pressed', 'true');
  const farCardUsableAt = performance.now();

  const metrics = {
    pageCount,
    sourceBytes: source.byteLength,
    parseMs: Math.round(parsedAt - startedAt),
    editorReadyMs: Math.round(editorReadyAt - startedAt),
    allThumbnailsMs: Math.round(thumbnailsReadyAt - startedAt),
    editorShellReadyMs: Math.round(editorShellReadyAt - startedAt),
    firstCardUsableMs: Math.round(firstCardUsableAt - startedAt),
    firstVisibleThumbnailMs: Math.round(firstVisibleThumbnailAt - startedAt),
    firstCardInteractionMs: Math.round(firstCardUsableAt - firstCardInteractionStarted),
    farCardInteractionMs: Math.round(farCardUsableAt - farCardInteractionStarted),
    thumbnailReadyCountAtEditorShell: editorShellWindow.thumbnailReadyCount,
    lightweightShellCountAtEditorShell: editorShellWindow.lightweightShellCount,
    mountedSortableCountAtEditorShell: editorShellWindow.mountedSortableCount,
    mountedThumbnailCountAtEditorShell: editorShellWindow.mountedThumbnailCount,
    visibleStartRowAtEditorShell: editorShellWindow.visibleStartRow,
    visibleEndRowAtEditorShell: editorShellWindow.visibleEndRow,
    overscanStartRowAtEditorShell: editorShellWindow.overscanStartRow,
    overscanEndRowAtEditorShell: editorShellWindow.overscanEndRow,
    columnsAtEditorShell: editorShellWindow.columns,
    zoomLevelAtEditorShell: editorShellWindow.zoomLevel,
    windowAtFarRange: await readWindowMetrics(grid),
    userAgent: await page.evaluate(() => navigator.userAgent),
    measuredAt: new Date().toISOString(),
  };

  await mkdir('test-results/performance', { recursive: true });
  await writeFile(
    `test-results/performance/${pageCount}-pages.json`,
    `${JSON.stringify(metrics, null, 2)}\n`,
    'utf8',
  );

  console.log(`ZENPDF_PERFORMANCE ${JSON.stringify(metrics)}`);

  expect(metrics.firstCardInteractionMs).toBeLessThan(2_000);
  expect(metrics.farCardInteractionMs).toBeLessThan(2_000);
  expect(consoleErrors).toEqual([]);
});
