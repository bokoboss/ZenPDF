import { expect, test, type Download, type Page } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

async function makePdf(
  label: string,
  pages: Array<{ width: number; height: number }>,
): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  pages.forEach(({ width, height }, index) => {
    const page = pdf.addPage([width, height]);
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

async function uploadPdfBuffers(
  page: Page,
  files: Array<{ name: string; buffer: Buffer }>,
) {
  await page.locator('input[type="file"]').first().setInputFiles(
    files.map(({ name, buffer }) => ({
      name,
      mimeType: 'application/pdf',
      buffer,
    })),
  );
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  for (const file of files) {
    await expect(page.getByText(file.name)).toBeVisible();
  }
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
  (page as Page & { __zenPdfConsoleErrors?: string[] }).__zenPdfConsoleErrors = consoleErrors;
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

test.afterEach(async ({ page }) => {
  const errors = (page as Page & { __zenPdfConsoleErrors?: string[] }).__zenPdfConsoleErrors ?? [];
  const actionableErrors = errors.filter(message =>
    !message.includes('cdn.tailwindcss.com should not be used in production'),
  );
  expect(actionableErrors).toEqual([]);
});
