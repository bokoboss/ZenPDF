import { expect, test, type Download, type Locator, type Page } from '@playwright/test';
import { PDFDocument, rgb } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

interface UploadFixture {
  name: string;
  mimeType: string;
  buffer: Buffer;
}

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

async function uploadFiles(page: Page, files: UploadFixture[]) {
  await page.locator('input[type="file"]').first().setInputFiles(files);
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  for (const file of files) {
    await expect(page.getByText(file.name)).toBeVisible();
    await expect(page.getByRole('button', { name: `Reorder ${file.name}` })).toHaveCount(1);
    await expect(page.getByRole('button', { name: `Remove ${file.name}` })).toHaveCount(1);
  }
}

async function enterEditor(page: Page, files: UploadFixture[]) {
  await uploadFiles(page, files);
  await expect(page.getByRole('button', { name: 'Page Editor' })).toBeEnabled();
  await page.getByRole('button', { name: 'Page Editor' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();
}

async function dragWithMouse(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error('Could not measure the drag source.');
  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height * 0.7,
  };

  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(sourcePoint.x + 12, sourcePoint.y, { steps: 2 });
  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error('Could not measure the drag target.');
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.7, { steps: 8 });
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
});

test('landing upload and header controls are keyboard-operable', async ({ page }) => {
  const upload = page.getByRole('button', { name: 'Upload documents' });
  await upload.focus();
  await expect(upload).toBeFocused();

  const enterChooser = page.waitForEvent('filechooser');
  await upload.press('Enter');
  await enterChooser;

  const spaceChooser = page.waitForEvent('filechooser');
  await upload.press('Space');
  await spaceChooser;

  const clickChooser = page.waitForEvent('filechooser');
  await upload.click();
  const chooser = await clickChooser;
  await chooser.setFiles({
    name: 'header.pdf',
    mimeType: 'application/pdf',
    buffer: await makePdf('header', [{ width: 200, height: 300 }]),
  });
  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  const brand = page.getByRole('button', { name: 'ZenPDF home' });
  await brand.focus();
  await brand.press('Enter');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
});

test('editor controls expose names, selection count, provenance, and output positions', async ({ page }) => {
  const alpha = await makePdf('alpha', [
    { width: 200, height: 300 },
    { width: 220, height: 320 },
  ]);
  const beta = await makePdf('beta', [
    { width: 400, height: 500 },
    { width: 420, height: 520 },
  ]);

  await enterEditor(page, [
    { name: 'Alpha.pdf', mimeType: 'application/pdf', buffer: alpha },
    { name: 'Beta.pdf', mimeType: 'application/pdf', buffer: beta },
  ]);

  for (const name of [
    'Back to documents',
    'Undo',
    'Redo',
    'Extract selected pages',
    'Rotate selected pages',
    'Delete selected pages',
    'Zoom out',
    'Zoom in',
    'Add files',
    'Save PDF',
  ]) {
    await expect(page.getByRole('button', { name })).toHaveCount(1);
  }

  const cards = page.locator('[data-page-card]');
  await expect(cards).toHaveCount(4);
  await expect(page.locator('[data-page-card][data-output-position="1"]')).toContainText('Alpha.pdf');
  await expect(page.locator('[data-page-card][data-output-position="2"]')).toContainText('Alpha.pdf');
  await expect(page.locator('[data-page-card][data-output-position="3"]')).toContainText('Beta.pdf');
  await expect(page.locator('[data-page-card][data-output-position="4"]')).toContainText('Beta.pdf');
  await expect(page.locator('[data-page-card][data-page-index="0"]').filter({ hasText: 'Beta.pdf' })).toContainText(/p\.1/);
  await expect(page.getByRole('group', { name: 'Output page 1, source Alpha.pdf page 1' })).toBeVisible();

  const firstSelect = cards.first().getByRole('button', { name: 'Select page' });
  await firstSelect.click();
  await expect(page.getByRole('status', { name: '1 selected' })).toBeVisible();
  await expect(cards.nth(1).getByRole('button', { name: 'Select page' })).toBeVisible();
  await cards.nth(1).getByRole('button', { name: 'Select page' }).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('status', { name: '2 selected' })).toBeVisible();

  const betaFirst = cards.filter({ hasText: /Beta\.pdf[\s\S]*p\.1/ });
  await dragWithMouse(page, betaFirst.locator('[data-page-drag-handle]'), cards.first().locator('[data-page-drag-handle]'));
  await expect(page.locator('[data-page-card][data-output-position="1"]')).toContainText(/Beta\.pdf/);
  await expect(page.locator('[data-page-card][data-output-position="1"]')).toHaveAttribute('data-page-index', '0');

  await page.getByRole('button', { name: 'None' }).click();
  await expect(page.getByRole('status', { name: '2 selected' })).toBeHidden();
  await expect(page.locator('[data-page-card] button[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Extract selected pages' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Rotate selected pages' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete selected pages' })).toBeDisabled();

  const alphaPage1 = page.getByRole('group', { name: /source Alpha\.pdf page 1/ });
  const alphaPage2 = page.getByRole('group', { name: /source Alpha\.pdf page 2/ });
  await alphaPage2.getByRole('button', { name: 'Select page' }).click();
  await expect(page.getByRole('status', { name: '1 selected' })).toBeVisible();
  await expect(alphaPage2.getByRole('button', { name: 'Deselect page' })).toHaveAttribute('aria-pressed', 'true');
  await expect(alphaPage1.getByRole('button', { name: 'Select page' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Delete selected pages' }).click();
  await expect(page.locator('[data-page-card]')).toHaveCount(3);
  await expect(alphaPage1).toBeVisible();
  await expect(alphaPage2).toHaveCount(0);
  await expect(page.locator('[data-page-card][data-output-position="1"]')).toContainText(/Beta\.pdf/);
  await expect(page.locator('[data-page-card][data-output-position="2"]')).toContainText(/Alpha\.pdf/);
  await expect(page.locator('[data-page-card][data-output-position="3"]')).toContainText(/Beta\.pdf/);

  await page.getByRole('button', { name: 'Save PDF' }).click();
  const downloadLink = page.getByRole('link', { name: 'Download' });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });
  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const output = await downloadedPdf(await downloadPromise);
  expect(output.getPageCount()).toBe(3);
  expect(output.getPage(0).getWidth()).toBeCloseTo(400, 1);
  expect(output.getPage(1).getWidth()).toBeCloseTo(200, 1);
  expect(output.getPage(2).getWidth()).toBeCloseTo(420, 1);
});


test('None clears selection inside the post-drag pointer lifecycle', async ({ page }) => {
  const source = await makePdf('selection-lifecycle', [
    { width: 200, height: 300 },
    { width: 220, height: 320 },
    { width: 240, height: 340 },
    { width: 260, height: 360 },
  ]);

  await enterEditor(page, [{ name: 'selection-lifecycle.pdf', mimeType: 'application/pdf', buffer: source }]);

  const cards = page.locator('[data-page-card]');
  await cards.nth(0).getByRole('button', { name: 'Select page' }).click();
  await cards.nth(1).getByRole('button', { name: 'Select page' }).click({ modifiers: ['Shift'] });
  await expect(page.getByRole('status', { name: '2 selected' })).toBeVisible();

  const noneButton = page.getByRole('button', { name: 'None' });
  await noneButton.dispatchEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    pointerId: 98,
    pointerType: 'mouse',
    isPrimary: true,
    button: 0,
    buttons: 0,
  });
  await expect(page.getByRole('status', { name: '2 selected' })).toBeVisible();

  await noneButton.dispatchEvent('pointerdown', {
    bubbles: true,
    cancelable: true,
    pointerId: 97,
    pointerType: 'mouse',
    isPrimary: true,
    button: 2,
    buttons: 2,
  });
  await noneButton.dispatchEvent('pointerup', {
    bubbles: true,
    cancelable: true,
    pointerId: 97,
    pointerType: 'mouse',
    isPrimary: true,
    button: 2,
    buttons: 0,
  });
  await expect(page.getByRole('status', { name: '2 selected' })).toBeVisible();

  await page.evaluate(() => {
    const noneButton = Array.from(document.querySelectorAll<HTMLButtonElement>('button'))
      .find(button => button.textContent?.trim() === 'None');
    if (!noneButton) throw new Error('None button not found.');

    const activateNone = () => {
      queueMicrotask(() => {
        noneButton.dispatchEvent(new PointerEvent('pointerdown', {
          bubbles: true,
          cancelable: true,
          pointerId: 99,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 1,
        }));
        noneButton.dispatchEvent(new PointerEvent('pointerup', {
          bubbles: true,
          cancelable: true,
          pointerId: 99,
          pointerType: 'mouse',
          isPrimary: true,
          button: 0,
          buttons: 0,
        }));
        noneButton.click();
      });
    };

    window.addEventListener('pointerup', activateNone, { once: true });
  });

  await dragWithMouse(
    page,
    cards.nth(3).locator('[data-page-drag-handle]'),
    cards.nth(0).locator('[data-page-drag-handle]'),
  );

  await expect(page.getByRole('status', { name: '2 selected' })).toBeHidden();
  await expect(page.locator('[data-page-card] button[aria-pressed="true"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Extract selected pages' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Rotate selected pages' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Delete selected pages' })).toBeDisabled();
});

test('routine success toast is polite and does not steal focus', async ({ page }) => {
  const source = await makePdf('toast', [{ width: 200, height: 300 }]);
  await enterEditor(page, [{ name: 'toast.pdf', mimeType: 'application/pdf', buffer: source }]);

  await page.getByRole('button', { name: 'Select page' }).click();
  const rotateSelected = page.getByRole('button', { name: 'Rotate selected pages' });
  await rotateSelected.focus();
  await rotateSelected.click();

  const successToast = page.locator('[role="status"]').filter({ hasText: 'Rotated selected pages' });
  await expect(successToast).toBeVisible();
  await expect(successToast).toHaveAttribute('aria-live', 'polite');
  await expect(rotateSelected).toBeFocused();
});

test('per-page deletion preserves focus on a neighboring page control', async ({ page }) => {
  const source = await makePdf('focus', [
    { width: 200, height: 300 },
    { width: 220, height: 320 },
  ]);
  await enterEditor(page, [{ name: 'focus.pdf', mimeType: 'application/pdf', buffer: source }]);

  const firstCard = page.locator('[data-page-card]').first();
  await firstCard.getByRole('button', { name: 'Remove page' }).focus();
  await firstCard.getByRole('button', { name: 'Remove page' }).press('Enter');

  await expect(page.locator('[data-page-card]')).toHaveCount(1);
  await expect(page.locator('[data-page-card] [data-page-focus-control]')).toBeFocused();
  await expect(page.evaluate(() => document.activeElement?.tagName)).not.toBe('BODY');
});

test('start-over dialog traps focus and restores it to its trigger', async ({ page }) => {
  const source = await makePdf('modal', [{ width: 200, height: 300 }]);
  await uploadFiles(page, [{ name: 'modal.pdf', mimeType: 'application/pdf', buffer: source }]);

  const trigger = page.getByRole('button', { name: 'Start Over' });
  await trigger.focus();
  await trigger.press('Enter');

  const dialog = page.getByRole('dialog', { name: 'Start Over?' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Confirm Reset' })).toBeFocused();
  await page.keyboard.press('Tab');
  await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(dialog.getByRole('button', { name: 'Confirm Reset' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('failed files are visible, non-loading, and block merge/editor until removed', async ({ page }) => {
  const good = await makePdf('good', [{ width: 200, height: 300 }]);
  const malformed = Buffer.from('%PDF-1.7\nthis is intentionally malformed\n%%EOF');
  const activeElementBeforeError = await page.evaluate(() => document.activeElement?.tagName);

  await uploadFiles(page, [
    { name: 'good.pdf', mimeType: 'application/pdf', buffer: good },
    { name: 'malformed.pdf', mimeType: 'application/pdf', buffer: malformed },
  ]);

  const failedCard = page.locator('[data-file-card]').filter({ hasText: 'malformed.pdf' });
  await expect(failedCard).toContainText("Couldn't read file", { timeout: 30_000 });
  await expect(failedCard.locator('.animate-spin')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Quick Merge' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Page Editor' })).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveAttribute('aria-live', 'assertive');
  expect(await page.evaluate(() => document.activeElement?.tagName)).toBe(activeElementBeforeError);

  await failedCard.getByRole('button', { name: 'Remove malformed.pdf' }).click();
  await expect(page.getByText('good.pdf')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Page Editor' })).toBeEnabled();
});

test('editor Save ignores an unrelated failed added file', async ({ page }) => {
  const good = await makePdf('editor-good', [
    { width: 200, height: 300 },
    { width: 220, height: 320 },
  ]);
  const malformed = Buffer.from('%PDF-1.7\nthis is intentionally malformed\n%%EOF');

  await enterEditor(page, [{ name: 'editor-good.pdf', mimeType: 'application/pdf', buffer: good }]);
  await expect(page.locator('[data-page-card]')).toHaveCount(2);

  await page.locator('#add-file-editor').setInputFiles({
    name: 'malformed.pdf',
    mimeType: 'application/pdf',
    buffer: malformed,
  });

  await expect(page.getByRole('alert')).toContainText(/malformed|couldn't|read|error/i, { timeout: 30_000 });
  await expect(page.locator('[data-page-card]')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Save PDF' })).toBeEnabled();

  await page.getByRole('button', { name: 'Save PDF' }).click();
  const downloadLink = page.getByRole('link', { name: 'Download' });
  await expect(downloadLink).toBeVisible({ timeout: 30_000 });
  const downloadPromise = page.waitForEvent('download');
  await downloadLink.click();
  const output = await downloadedPdf(await downloadPromise);
  expect(output.getPageCount()).toBe(2);
  expect(output.getPage(0).getWidth()).toBeCloseTo(200, 1);
  expect(output.getPage(1).getWidth()).toBeCloseTo(220, 1);
});

for (const viewport of [
  { width: 390, height: 844 },
  { width: 360, height: 800 },
]) {
  test.describe(`touch viewport ${viewport.width}x${viewport.height}`, () => {
    test.use({ hasTouch: true, viewport });

    test('toolbar remains reachable', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const source = await makePdf('touch', [
      { width: 200, height: 300 },
      { width: 220, height: 320 },
      { width: 240, height: 340 },
    ]);
    await enterEditor(page, [{ name: 'touch.pdf', mimeType: 'application/pdf', buffer: source }]);

    const firstCard = page.locator('[data-page-card]').first();
    await firstCard.getByRole('button', { name: 'Select page' }).tap();
    await expect(page.getByRole('status', { name: '1 selected' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Extract selected pages' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Rotate selected pages' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Delete selected pages' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Add files' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Save PDF' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom out' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Zoom in' })).toBeVisible();

    await page.getByRole('button', { name: 'Rotate selected pages' }).tap();
    await page.getByRole('button', { name: 'Delete selected pages' }).tap();
    await expect(page.getByRole('status', { name: '1 selected' })).toBeHidden();
    await page.getByRole('button', { name: 'Undo' }).tap();
    await expect(page.getByRole('status', { name: '1 selected' })).toBeHidden();

    await page.getByRole('button', { name: 'Save PDF' }).tap();
    await expect(page.getByRole('link', { name: 'Download' })).toBeVisible({ timeout: 30_000 });

    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(viewport.width + 1);
    });
  });
}
