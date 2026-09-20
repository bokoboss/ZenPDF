import { expect, test, type Locator, type Page } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { mkdir } from 'node:fs/promises';

const SCREENSHOT_DIR = 'test-results/visual-baseline';

async function makePdf(label: string, pageCount: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const page = pdf.addPage([240 + index * 20, 360 + index * 20]);
    page.drawText(`${label}-${index + 1}`, {
      x: 24,
      y: page.getHeight() - 48,
      size: 18,
      color: rgb(0.1, 0.1, 0.1),
    });
  }
  return Buffer.from(await pdf.save());
}

async function enterEditor(page: Page, files: Array<{ name: string; buffer: Buffer }>) {
  await page.locator('input[type="file"]').first().setInputFiles(files.map(file => ({
    ...file,
    mimeType: 'application/pdf',
  })));
  await expect(page.getByRole('button', { name: 'Page Editor' })).toBeEnabled();
  await page.getByRole('button', { name: 'Page Editor' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
}

async function dragWithMouse(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  const targetBox = await target.boundingBox();
  if (!sourceBox || !targetBox) throw new Error('Could not measure visual fixture drag controls.');
  await page.mouse.move(sourceBox.x + sourceBox.width / 2, sourceBox.y + sourceBox.height * 0.7);
  await page.mouse.down();
  await page.mouse.move(sourceBox.x + sourceBox.width / 2 + 12, sourceBox.y + sourceBox.height * 0.7, { steps: 2 });
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.7, { steps: 8 });
  await page.mouse.up();
}

test('capture Phase 3 desktop provenance state', async ({ page }) => {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
  await enterEditor(page, [
    { name: 'Alpha.pdf', buffer: await makePdf('alpha', 2) },
    { name: 'Beta.pdf', buffer: await makePdf('beta', 2) },
  ]);

  const cards = page.locator('[data-page-card]');
  await dragWithMouse(
    page,
    cards.filter({ hasText: /Beta\.pdf[\s\S]*p\.1/ }).locator('[data-page-drag-handle]'),
    cards.first().locator('[data-page-drag-handle]'),
  );
  await expect(page.locator('[data-page-card][data-output-position="1"]')).toContainText('Beta.pdf');
  await page.screenshot({ path: `${SCREENSHOT_DIR}/phase3-desktop-provenance.png`, fullPage: true });
});

test.describe('capture Phase 3 mobile selected state', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  test('selected page and count toolbar', async ({ page }) => {
    await mkdir(SCREENSHOT_DIR, { recursive: true });
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
    await enterEditor(page, [{ name: 'Mobile.pdf', buffer: await makePdf('mobile', 2) }]);
    await page.locator('[data-page-card]').first().getByRole('button', { name: 'Select page' }).tap();
    await expect(page.getByRole('status', { name: '1 selected' })).toBeVisible();
    await page.screenshot({ path: `${SCREENSHOT_DIR}/phase3-mobile-selected-count.png`, fullPage: true });
  });
});

test('capture Phase 3 document error state', async ({ page }) => {
  await mkdir(SCREENSHOT_DIR, { recursive: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles([
    { name: 'Good.pdf', mimeType: 'application/pdf', buffer: await makePdf('good', 1) },
    { name: 'Malformed.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.7\nmalformed\n%%EOF') },
  ]);
  const errorCard = page.locator('[data-file-card]').filter({ hasText: 'Malformed.pdf' });
  await expect(errorCard).toContainText("Couldn't read file", { timeout: 30_000 });
  await page.screenshot({ path: `${SCREENSHOT_DIR}/phase3-documents-error.png`, fullPage: true });
});
