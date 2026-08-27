import { expect, test, type Locator, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { readFile } from 'node:fs/promises';

test.use({ hasTouch: true });

async function makeLargePdf(pageCount: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const width = index === 0 ? 200 : index === 1 ? 220 : 300;
    const height = index === 0 ? 300 : index === 1 ? 320 : 400;
    pdf.addPage([width, height]);
  }
  return Buffer.from(await pdf.save());
}

async function pageIndices(page: Page): Promise<number[]> {
  return page.locator('[data-page-id]').evaluateAll(elements => (
    elements.map(element => Number(element.getAttribute('data-page-index')))
  ));
}

async function dragWithMouse(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error('Could not measure the large-grid drag source.');
  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height * 0.75,
  };

  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(sourcePoint.x + 12, sourcePoint.y, { steps: 2 });
  await target.scrollIntoViewIfNeeded();
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error('Could not measure the large-grid drag target.');
  await page.mouse.move(targetBox.x + targetBox.width / 2, targetBox.y + targetBox.height * 0.75, { steps: 12 });
  await page.mouse.up();
}

async function dragWithTouch(page: Page, source: Locator, target: Locator) {
  await source.scrollIntoViewIfNeeded();
  await target.scrollIntoViewIfNeeded();
  const sourceBox = await source.boundingBox();
  if (!sourceBox) throw new Error('Could not measure the large-grid touch source.');
  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height * 0.75,
  };
  const targetBox = await target.boundingBox();
  if (!targetBox) throw new Error('Could not measure the large-grid touch target.');
  const targetPoint = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height * 0.75,
  };
  const dispatchPointer = (locator: Locator, type: 'pointerdown' | 'pointermove' | 'pointerup', point: { x: number; y: number }) => (
    locator.evaluate((element, event) => {
      element.dispatchEvent(new PointerEvent(event.type, {
        bubbles: true,
        button: 0,
        buttons: event.type === 'pointerup' ? 0 : 1,
        clientX: event.point.x,
        clientY: event.point.y,
        isPrimary: true,
        pointerId: 1,
        pointerType: 'touch',
      }));
    }, { type, point })
  );

  await dispatchPointer(source, 'pointerdown', sourcePoint);
  await dispatchPointer(source, 'pointermove', { x: sourcePoint.x + 12, y: sourcePoint.y });
  await page.waitForTimeout(50);
  await dispatchPointer(target, 'pointermove', targetPoint);
  await page.waitForTimeout(50);
  await dispatchPointer(target, 'pointerup', targetPoint);
}

async function gridColumnCount(page: Page): Promise<number> {
  return page.locator('[data-page-id]').first().locator('xpath=..').evaluate(element => (
    getComputedStyle(element).gridTemplateColumns.split(' ').length
  ));
}

async function centerCardInViewport(card: Locator) {
  await card.evaluate(element => element.scrollIntoView({ block: 'center', inline: 'center' }));
}

test('large editor remains interactive and preserves output semantics', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'large-editor-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: await makeLargePdf(100),
  });

  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByText('100 Pages')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Page Editor' })).toBeEnabled();
  await page.getByRole('button', { name: 'Page Editor' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();

  const cards = page.locator('[data-page-id]');
  await expect(cards).toHaveCount(100);
  const pageControls = page.locator(
    'button[aria-label="Select page"], button[aria-label="Deselect page"]',
  );
  await expect(pageControls).toHaveCount(100);

  const firstCard = page.locator('[data-page-index="0"]');
  const firstControl = firstCard.locator('button[aria-label="Select page"]');
  await firstControl.click();
  await expect(firstCard.locator('button[aria-label="Deselect page"]')).toHaveAttribute('aria-pressed', 'true');
  await firstCard.locator('button[aria-label="Deselect page"]').click();

  const farCard = page.locator('[data-page-index="99"]');
  await farCard.scrollIntoViewIfNeeded();
  await expect(farCard).toBeVisible();
  const farControl = farCard.locator('button[aria-label="Select page"]');
  await farControl.click();
  await expect(farCard.locator('button[aria-label="Deselect page"]')).toHaveAttribute('aria-pressed', 'true');
  await farCard.locator('button[aria-label="Deselect page"]').click();

  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  await zoomOut.click();
  await expect.poll(() => gridColumnCount(page)).toBe(6);
  await zoomOut.click();
  await expect.poll(() => gridColumnCount(page)).toBe(8);
  await zoomIn.click();
  await expect.poll(() => gridColumnCount(page)).toBe(6);
  await zoomIn.click();
  await expect.poll(() => gridColumnCount(page)).toBe(5);
  await zoomIn.click();
  await expect.poll(() => gridColumnCount(page)).toBe(4);
  await zoomIn.click();
  await expect.poll(() => gridColumnCount(page)).toBe(3);
  await zoomOut.click();
  await expect.poll(() => gridColumnCount(page)).toBe(4);
  await zoomOut.click();
  await expect.poll(() => gridColumnCount(page)).toBe(5);

  await zoomOut.click();
  await expect.poll(() => gridColumnCount(page)).toBe(6);
  await zoomOut.click();
  await expect.poll(() => gridColumnCount(page)).toBe(8);
  const multiFirst = page.locator('[data-page-index="20"]');
  const multiLast = page.locator('[data-page-index="22"]');
  await multiFirst.locator('button[aria-label="Select page"]').click();
  await multiLast.locator('button[aria-label="Select page"]').click({ modifiers: ['Shift'] });
  for (const pageIndex of [20, 21, 22]) {
    await expect(page.locator(`[data-page-index="${pageIndex}"] button[aria-label="Deselect page"]`))
      .toHaveAttribute('aria-pressed', 'true');
  }

  const multiOrderBefore = await pageIndices(page);
  await dragWithMouse(
    page,
    page.locator('[data-page-index="20"] [data-page-drag-handle]'),
    page.locator('[data-page-index="28"] [data-page-drag-handle]'),
  );
  await expect.poll(() => pageIndices(page)).not.toEqual(multiOrderBefore);
  for (const pageIndex of [20, 21, 22]) {
    await expect(page.locator(`[data-page-index="${pageIndex}"] button[aria-label="Deselect page"]`))
      .toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => pageIndices(page)).toEqual(multiOrderBefore);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => pageIndices(page)).not.toEqual(multiOrderBefore);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => pageIndices(page)).toEqual(multiOrderBefore);
  await page.getByRole('button', { name: 'None' }).click();
  await zoomIn.click();
  await expect.poll(() => gridColumnCount(page)).toBe(6);
  await zoomIn.click();
  await expect.poll(() => gridColumnCount(page)).toBe(5);

  const mouseOrderBefore = await pageIndices(page);
  await dragWithMouse(
    page,
    page.locator('[data-page-index="0"] [data-page-drag-handle]'),
    page.locator('[data-page-index="1"] [data-page-drag-handle]'),
  );
  await expect.poll(() => pageIndices(page)).toEqual([
    mouseOrderBefore[1], mouseOrderBefore[0], ...mouseOrderBefore.slice(2),
  ]);

  const selectedAfterReorder = page.locator('[data-page-index="2"] button[aria-label="Select page"]');
  await selectedAfterReorder.click();
  await expect(page.locator('[data-page-index="2"] button[aria-label="Deselect page"]')).toHaveAttribute('aria-pressed', 'true');

  const keyboardOrderBefore = await pageIndices(page);
  const keyboardSource = page.locator('[data-page-index="3"] [data-page-drag-handle]');
  await keyboardSource.focus();
  await keyboardSource.press('Space');
  await keyboardSource.press('ArrowRight');
  await keyboardSource.press('Space');
  await expect.poll(() => pageIndices(page)).not.toEqual(keyboardOrderBefore);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => pageIndices(page)).toEqual(keyboardOrderBefore);

  const touchOrderBefore = await pageIndices(page);
  await dragWithTouch(
    page,
    page.locator('[data-page-index="6"] [data-page-drag-handle]'),
    page.locator('[data-page-index="7"] [data-page-drag-handle]'),
  );
  await expect.poll(() => pageIndices(page)).not.toEqual(touchOrderBefore);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => pageIndices(page)).toEqual(touchOrderBefore);

  await expect(page.locator('img[alt="Page"]')).toHaveCount(100);
  const rotatedCard = page.locator('[data-page-index="2"]');
  await centerCardInViewport(rotatedCard);
  await rotatedCard.locator('button[aria-label="Rotate page clockwise"]').click();
  await expect(rotatedCard.locator('img[alt="Page"]')).toHaveAttribute('style', /rotate\(90deg\)/);

  const removedCard = page.locator('[data-page-index="3"]');
  await centerCardInViewport(removedCard);
  await removedCard.locator('button[aria-label="Remove page"]').click();
  await expect(page.locator('[data-page-index="3"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.locator('[data-page-index="3"]')).toHaveCount(1);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect(page.locator('[data-page-index="3"]')).toHaveCount(0);
  await expect(page.locator('[data-page-index="2"] button[aria-label="Deselect page"]')).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Save PDF' }).click();
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  if (!outputPath) throw new Error('Large-document save did not produce a download.');
  const output = await PDFDocument.load(await readFile(outputPath));

  expect(output.getPageCount()).toBe(99);
  expect(output.getPage(0).getWidth()).toBeCloseTo(220, 1);
  expect(output.getPage(1).getWidth()).toBeCloseTo(200, 1);
  expect(output.getPage(2).getRotation().angle % 360).toBe(90);
  expect(consoleErrors).toEqual([]);
});
