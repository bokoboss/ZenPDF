import { expect, test, type Page } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { mkdir } from 'node:fs/promises';

const BASELINE_DIR = 'test-results/visual-baseline';
const EXPECTED_SYSTEM_FONT = 'ui-sans-serif, system-ui, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol", "Noto Color Emoji"';

async function computedStyle(page: Page, selector: string) {
  return page.locator(selector).evaluate(element => {
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return {
      fontFamily: style.fontFamily,
      fontWeight: style.fontWeight,
      fontSize: style.fontSize,
      lineHeight: style.lineHeight,
      letterSpacing: style.letterSpacing,
      backgroundColor: style.backgroundColor,
      borderRadius: style.borderRadius,
      rect: {
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      },
    };
  });
}

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

  expect(await computedStyle(page, 'body')).toMatchObject({
    fontFamily: EXPECTED_SYSTEM_FONT,
  });
  expect(await computedStyle(page, 'h1')).toMatchObject({
    fontFamily: EXPECTED_SYSTEM_FONT,
    fontWeight: '300',
    fontSize: '48px',
    lineHeight: '48px',
    letterSpacing: '-1.2px',
  });
  expect(await computedStyle(page, 'h1 + p')).toMatchObject({
    fontFamily: EXPECTED_SYSTEM_FONT,
    fontWeight: '300',
    fontSize: '18px',
    lineHeight: '29.25px',
  });
  expect(await computedStyle(page, 'nav > div:first-child span')).toMatchObject({
    fontFamily: EXPECTED_SYSTEM_FONT,
    fontWeight: '500',
    fontSize: '20px',
    lineHeight: '28px',
    letterSpacing: '-0.5px',
  });
  expect(await computedStyle(page, 'nav')).toMatchObject({
    rect: { width: 1440, height: 80 },
  });
  expect(await computedStyle(page, 'div.relative.w-full.max-w-xl')).toMatchObject({
    backgroundColor: 'rgba(255, 255, 255, 0.5)',
    borderRadius: '40px',
    rect: { width: 576, height: 320 },
  });
  const landingScreenshot = await page.screenshot({
    path: `${BASELINE_DIR}/landing-desktop.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(landingScreenshot).toMatchSnapshot('landing-desktop.png');
  }

  const fixture = await makeVisualFixture();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'ZenPDF_Visual_Fixture.pdf',
    mimeType: 'application/pdf',
    buffer: fixture,
  });
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByText('2 Pages')).toBeVisible({ timeout: 30_000 });
  const documentsScreenshot = await page.screenshot({
    path: `${BASELINE_DIR}/documents-desktop.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(documentsScreenshot).toMatchSnapshot('documents-desktop.png');
  }
  expect(await computedStyle(page, 'h2')).toMatchObject({
    fontFamily: EXPECTED_SYSTEM_FONT,
    fontWeight: '300',
    fontSize: '30px',
    lineHeight: '36px',
    letterSpacing: '-0.75px',
  });
  expect(await computedStyle(page, 'button:has-text("Quick Merge")')).toMatchObject({
    fontFamily: EXPECTED_SYSTEM_FONT,
    fontWeight: '500',
    fontSize: '18px',
    lineHeight: '28px',
    letterSpacing: 'normal',
    backgroundColor: 'rgb(255, 255, 255)',
    borderRadius: '16px',
  });

  expect(await computedStyle(page, 'button:has-text("Page Editor")')).toMatchObject({
    backgroundColor: 'rgb(246, 246, 244)',
  });
  await page.getByRole('button', { name: 'Page Editor' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Rotate page clockwise' })).toHaveCount(2);
  expect(await computedStyle(page, 'h2')).toMatchObject({
    fontFamily: EXPECTED_SYSTEM_FONT,
    fontWeight: '300',
    fontSize: '30px',
    lineHeight: '36px',
    letterSpacing: '-0.75px',
  });
  const editorScreenshot = await page.screenshot({
    path: `${BASELINE_DIR}/editor-desktop.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(editorScreenshot).toMatchSnapshot('editor-desktop.png');
  }

  // A full page reload creates a fresh in-memory workspace for the mobile baseline.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
  expect(await computedStyle(page, 'h1')).toMatchObject({
    fontFamily: EXPECTED_SYSTEM_FONT,
    fontWeight: '300',
    fontSize: '48px',
    lineHeight: '48px',
  });
  const mobileScreenshot = await page.screenshot({
    path: `${BASELINE_DIR}/landing-mobile.png`,
    fullPage: true,
  });
  if (process.env.CI) {
    await expect(mobileScreenshot).toMatchSnapshot('landing-mobile.png');
  }
});
