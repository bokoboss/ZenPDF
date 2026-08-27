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
  const editorShellReadyAt = performance.now();
  const thumbnailCountAtEditorShell = await page.locator('img[alt="Page"]').count();

  const firstCard = page.locator('[data-page-id]').first();
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

  const pageSelectionControls = page.locator(
    'button[aria-label="Select page"], button[aria-label="Deselect page"]',
  );
  await expect(pageSelectionControls).toHaveCount(pageCount);
  const editorReadyAt = performance.now();

  let thumbnailsReadyAt = editorShellReadyAt;
  if (thumbnailCountAtEditorShell < pageCount) {
    await expect(page.locator('img[alt="Page"]')).toHaveCount(pageCount);
    thumbnailsReadyAt = performance.now();
  }
  const farCard = page.locator('[data-page-id]').nth(pageCount - 1);
  await farCard.scrollIntoViewIfNeeded();
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
    thumbnailCountAtEditorShell,
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
