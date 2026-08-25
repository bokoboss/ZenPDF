import { expect, test } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { mkdir } from 'node:fs/promises';

const BASELINE_DIR = 'test-results/visual-baseline';

async function makeVisualFixture(): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < 2; index += 1) {
    const page = pdf.addPage(index === 0 ? [420, 595] : [595, 420]);
    page.drawText(`ZenPDF visual fixture ${index + 1}`, {
      x: 36,
      y: page.getHeight() - 60,
      size: 20,
      color: rgb(0.12, 0.12, 0.12),
    });
  }
  return Buffer.from(await pdf.save());
}

test('capture protected ZenPDF visual baseline', async ({ page }) => {
  await mkdir(BASELINE_DIR, { recursive: true });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
  await page.screenshot({
    path: `${BASELINE_DIR}/landing-desktop.png`,
    fullPage: true,
  });

  const fixture = await makeVisualFixture();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'ZenPDF_Visual_Fixture.pdf',
    mimeType: 'application/pdf',
    buffer: fixture,
  });
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByText('2 Pages')).toBeVisible({ timeout: 30_000 });
  await page.screenshot({
    path: `${BASELINE_DIR}/documents-desktop.png`,
    fullPage: true,
  });

  await page.getByRole('button', { name: 'Page Editor' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rotate page clockwise' })).toHaveCount(2);
  await page.screenshot({
    path: `${BASELINE_DIR}/editor-desktop.png`,
    fullPage: true,
  });

  // A full page reload creates a fresh in-memory workspace for the mobile baseline.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
  await page.screenshot({
    path: `${BASELINE_DIR}/landing-mobile.png`,
    fullPage: true,
  });
});
