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
  await expect(page.getByRole('button', { name: 'Select page' })).toHaveCount(pageCount);
  const editorReadyAt = performance.now();

  await expect(page.locator('img[alt="Page"]')).toHaveCount(pageCount);
  const thumbnailsReadyAt = performance.now();

  const metrics = {
    pageCount,
    sourceBytes: source.byteLength,
    parseMs: Math.round(parsedAt - startedAt),
    editorReadyMs: Math.round(editorReadyAt - startedAt),
    allThumbnailsMs: Math.round(thumbnailsReadyAt - startedAt),
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

  expect(consoleErrors).toEqual([]);
});
