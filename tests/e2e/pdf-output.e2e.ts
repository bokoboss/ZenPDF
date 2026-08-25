import { expect, test, type Download, type Page } from '@playwright/test';
import { PDFDocument, degrees, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

interface UploadFixture {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

interface ZenPdfTestPage extends Page {
  __zenPdfConsoleErrors?: string[];
  __zenPdfAllowedConsoleErrorPatterns?: string[];
}

async function makePdf(
  label: string,
  pages: Array<{ width: number; height: number; rotation?: number }>,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pages.forEach(({ width, height, rotation = 0 }, index) => {
    const page = pdf.addPage([width, height]);
    if (rotation !== 0) page.setRotation(degrees(rotation));
    page.drawText(`${label}-${index + 1}`, {
      x: 24,
      y: height - 48,
      size: 18,
      color: rgb(0.1, 0.1, 0.1),
    });
  });
  return Buffer.from(await pdf.save());
}

async function downloadedPdf(download: Download): Promise<PDFDocument> {
  const path = await download.path();
  if (!path) throw new Error('Browser download did not produce a local path.');
  return PDFDocument.load(await readFile(path));
}

async function uploadFixtures(page: Page, files: UploadFixture[]) {
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  for (const file of files) {
    await expect(page.getByText(file.name)).toBeVisible();
  }
}

async function uploadPdfBuffers(
  page: Page,
  files: Array<{ name: string; buffer: Buffer }>,
) {
  await uploadFixtures(
    page,
    files.map(({ name, buffer }) => ({
      name,
      mimeType: 'application/pdf',
      buffer,
    })),
  );
}

function allowConsoleError(page: Page, pattern: string) {
  const zenPage = page as ZenPdfTestPage;
  zenPage.__zenPdfAllowedConsoleErrorPatterns = [
    ...(zenPage.__zenPdfAllowedConsoleErrorPatterns ?? []),
    pattern,
  ];
}

test.beforeEach(async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
  await expect(page.getByText('Find clarity in your documents.')).toBeVisible();

  // Preserve the error collector for assertions without adding application code.
  (page as ZenPdfTestPage).__zenPdfConsoleErrors = consoleErrors;
});

test('quick merge preserves file order and source page dimensions', async ({ page }) => {
  const alpha = await makePdf('alpha', [{ width: 210, height: 310 }]);
  const beta = await makePdf('beta', [{ width: 420, height: 520 }]);

  await uploadPdfBuffers(page, [
    { name: 'alpha.pdf', buffer: alpha },
    { name: 'beta.pdf', buffer: beta },
  ]);

  await page.getByRole('button', { name: 'Quick Merge' }).click();
  const downloadLink = page.getByRole('link', { name: 'Download PDF' });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const output = await downloadedPdf(await downloadPromise);

  expect(output.getPageCount()).toBe(2);
  const [first, second] = output.getPages();
  expect(first.getWidth()).toBeCloseTo(210, 1);
  expect(first.getHeight()).toBeCloseTo(310, 1);
  expect(second.getWidth()).toBeCloseTo(420, 1);
  expect(second.getHeight()).toBeCloseTo(520, 1);
});

test('quick merge supports a mixed PNG and PDF input set', async ({ page }) => {
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFElEQVR42mNkYGD4z8DAwMDAxAADAAANHQEDasKb6QAAAABJRU5ErkJggg==',
    'base64',
  );
  const pdf = await makePdf('mixed', [{ width: 240, height: 360 }]);

  await uploadFixtures(page, [
    { name: 'transparent.png', mimeType: 'image/png', buffer: transparentPng },
    { name: 'document.pdf', mimeType: 'application/pdf', buffer: pdf },
  ]);

  await page.getByRole('button', { name: 'Quick Merge' }).click();
  const downloadLink = page.getByRole('link', { name: 'Download PDF' });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const output = await downloadedPdf(await downloadPromise);

  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getWidth()).toBeCloseTo(2, 1);
  expect(output.getPage(0).getHeight()).toBeCloseTo(2, 1);
  expect(output.getPage(1).getWidth()).toBeCloseTo(240, 1);
  expect(output.getPage(1).getHeight()).toBeCloseTo(360, 1);
});

test('Thai filenames survive import and do not block PDF generation', async ({ page }) => {
  const source = await makePdf('thai-name', [{ width: 260, height: 360 }]);
  const filename = 'เอกสารทดสอบ-01.pdf';

  await uploadPdfBuffers(page, [{ name: filename, buffer: source }]);
  await expect(page.getByText(filename)).toBeVisible();

  await page.getByRole('button', { name: 'Quick Merge' }).click();
  const downloadLink = page.getByRole('link', { name: 'Download PDF' });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const output = await downloadedPdf(await downloadPromise);
  expect(output.getPageCount()).toBe(1);
});

test('page editor rotation is reflected in the generated PDF', async ({ page }) => {
  const source = await makePdf('rotate', [
    { width: 240, height: 360 },
    { width: 300, height: 400 },
  ]);

  await uploadPdfBuffers(page, [{ name: 'rotate.pdf', buffer: source }]);
  await expect(page.getByText('2 Pages')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Page Editor' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();

  const rotateButtons = page.getByRole('button', { name: 'Rotate page clockwise' });
  await expect(rotateButtons).toHaveCount(2);
  await rotateButtons.first().click({ force: true });

  await page.getByRole('button', { name: 'Save PDF' }).click();
  const downloadLink = page.getByRole('link', { name: 'Download' });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });

  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const output = await downloadedPdf(await downloadPromise);

  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getRotation().angle % 360).toBe(90);
  expect(output.getPage(1).getRotation().angle % 360).toBe(0);
});

test('editor rotation is additive to source-page rotation', async ({ page }) => {
  const source = await makePdf('source-rotation', [
    { width: 240, height: 360, rotation: 90 },
  ]);

  await uploadPdfBuffers(page, [{ name: 'source-rotation.pdf', buffer: source }]);
  await expect(page.getByText('1 Page')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Page Editor' }).click();

  await page.getByRole('button', { name: 'Rotate page clockwise' }).click({ force: true });
  await page.getByRole('button', { name: 'Save PDF' }).click();

  const downloadLink = page.getByRole('link', { name: 'Download' });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });
  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const output = await downloadedPdf(await downloadPromise);

  expect(output.getPageCount()).toBe(1);
  expect(output.getPage(0).getRotation().angle % 360).toBe(180);
});

test('extract downloads only selected pages', async ({ page }) => {
  const source = await makePdf('extract', [
    { width: 200, height: 300 },
    { width: 250, height: 350 },
    { width: 300, height: 400 },
  ]);

  await uploadPdfBuffers(page, [{ name: 'extract.pdf', buffer: source }]);
  await expect(page.getByText('3 Pages')).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: 'Page Editor' }).click();

  const selectButtons = page.getByRole('button', { name: 'Select page' });
  await expect(selectButtons).toHaveCount(3);
  await selectButtons.nth(1).click();

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Extract' }).click();
  const output = await downloadedPdf(await downloadPromise);

  expect(output.getPageCount()).toBe(1);
  expect(output.getPage(0).getWidth()).toBeCloseTo(250, 1);
  expect(output.getPage(0).getHeight()).toBeCloseTo(350, 1);
});

test('malformed PDF reports a recoverable error instead of crashing the app', async ({ page }) => {
  allowConsoleError(page, 'Worker Error: Invalid PDF structure.');
  const malformed = Buffer.from('%PDF-1.7\nthis is intentionally malformed\n%%EOF');

  await uploadPdfBuffers(page, [{ name: 'malformed.pdf', buffer: malformed }]);
  await expect(page.getByText(/^Error:/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Add File' })).toBeEnabled();
});

test.afterEach(async ({ page }) => {
  const zenPage = page as ZenPdfTestPage;
  const errors = zenPage.__zenPdfConsoleErrors ?? [];
  const allowedPatterns = zenPage.__zenPdfAllowedConsoleErrorPatterns ?? [];
  const actionableErrors = errors.filter(message => {
    if (message.includes('cdn.tailwindcss.com should not be used in production')) return false;
    return !allowedPatterns.some(pattern => message.includes(pattern));
  });
  expect(actionableErrors).toEqual([]);
});
