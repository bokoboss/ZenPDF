import { expect, test, type Locator, type Page } from '@playwright/test';
import { PDFDocument } from 'pdf-lib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';

test.use({ hasTouch: true });

interface WindowMetrics {
  logicalPageCount: number;
  lightweightShellCount: number;
  mountedSortableCount: number;
  mountedThumbnailCount: number;
  visibleStartRow: number;
  visibleEndRow: number;
  overscanStartRow: number;
  overscanEndRow: number;
  columns: number;
  zoomLevel: number;
  thumbnailReadyCount: number;
  mountedSortableDomCount: number;
  mountedThumbnailDomCount: number;
  lightweightShellDomCount: number;
}

async function makeLargePdf(pageCount: number): Promise<Buffer> {
  const pdf = await PDFDocument.create();
  for (let index = 0; index < pageCount; index += 1) {
    const width = index === 0 ? 200 : index === 1 ? 220 : 300;
    const height = index === 0 ? 300 : index === 1 ? 320 : 400;
    pdf.addPage([width, height]);
  }
  return Buffer.from(await pdf.save({ useObjectStreams: true }));
}

function sortableCard(page: Page, pageIndex: number): Locator {
  return page.locator(`[data-page-card][data-page-index="${pageIndex}"]`);
}

async function logicalOrder(page: Page): Promise<number[]> {
  return page.locator('[data-page-id]').evaluateAll(elements => (
    elements.map(element => Number(element.getAttribute('data-page-index')))
  ));
}

async function readWindowMetrics(page: Page, grid: Locator): Promise<WindowMetrics> {
  const state = await grid.evaluate(element => {
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
  return {
    ...state,
    mountedSortableDomCount: await page.locator('[data-page-card]').count(),
    mountedThumbnailDomCount: await page.locator('[data-page-thumbnail-subtree]').count(),
    lightweightShellDomCount: await page.locator('[data-page-shell]').count(),
  };
}

async function waitForSortableCard(page: Page, pageIndex: number): Promise<Locator> {
  const scrolled = await page.evaluate(index => {
    const element = document.querySelector(`[data-page-id][data-page-index="${index}"]`);
    if (!element) return false;
    element.scrollIntoView({ block: 'center', inline: 'nearest' });
    return true;
  }, pageIndex);
  if (!scrolled) throw new Error(`Could not find logical page ${pageIndex}.`);
  const card = sortableCard(page, pageIndex);
  await expect(card).toBeVisible();
  return card;
}

async function visibleShellCount(page: Page): Promise<number> {
  return page.locator('[data-page-shell]').evaluateAll(elements => elements.filter(element => {
    const bounds = element.getBoundingClientRect();
    return bounds.bottom > 0 && bounds.top < window.innerHeight && bounds.right > 0 && bounds.left < window.innerWidth;
  }).length);
}

async function dispatchPointer(
  locator: Locator,
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  point: { x: number; y: number },
) {
  await locator.evaluate((element, event) => {
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
  }, { type, point });
}

async function dragWithMouseToPage(page: Page, sourceCard: Locator, targetIndex: number) {
  const sourceHandle = sourceCard.locator('[data-page-drag-handle]');
  await sourceHandle.scrollIntoViewIfNeeded();
  const sourceBox = await sourceHandle.boundingBox();
  if (!sourceBox) throw new Error('Could not measure the windowed mouse drag source.');
  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height * 0.75,
  };

  await page.mouse.move(sourcePoint.x, sourcePoint.y);
  await page.mouse.down();
  await page.mouse.move(sourcePoint.x + 12, sourcePoint.y, { steps: 2 });

  const targetCard = await waitForSortableCard(page, targetIndex);
  await expect(sourceCard).toHaveCount(1);
  const targetHandle = targetCard.locator('[data-page-drag-handle]');
  const targetBox = await targetHandle.boundingBox();
  if (!targetBox) throw new Error('Could not measure the windowed mouse drag target.');
  await page.mouse.move(
    targetBox.x + targetBox.width / 2,
    targetBox.y + targetBox.height / 2,
    { steps: 12 },
  );
  await page.mouse.up();
  await page.waitForTimeout(100);
}

async function dragWithTouchToPage(page: Page, sourceCard: Locator, targetIndex: number) {
  const sourceHandle = sourceCard.locator('[data-page-drag-handle]');
  await sourceHandle.scrollIntoViewIfNeeded();
  const sourceBox = await sourceHandle.boundingBox();
  if (!sourceBox) throw new Error('Could not measure the windowed touch drag source.');
  const sourcePoint = {
    x: sourceBox.x + sourceBox.width / 2,
    y: sourceBox.y + sourceBox.height * 0.75,
  };

  await dispatchPointer(sourceHandle, 'pointerdown', sourcePoint);
  await dispatchPointer(sourceHandle, 'pointermove', { x: sourcePoint.x + 12, y: sourcePoint.y });
  await page.waitForTimeout(50);
  const targetCard = await waitForSortableCard(page, targetIndex);
  await expect(sourceCard).toHaveCount(1);
  const targetHandle = targetCard.locator('[data-page-drag-handle]');
  const targetBox = await targetHandle.boundingBox();
  if (!targetBox) throw new Error('Could not measure the windowed touch drag target.');
  const targetPoint = {
    x: targetBox.x + targetBox.width / 2,
    y: targetBox.y + targetBox.height / 2,
  };
  await dispatchPointer(targetHandle, 'pointermove', targetPoint);
  await page.waitForTimeout(50);
  await dispatchPointer(targetHandle, 'pointerup', targetPoint);
  await page.waitForTimeout(100);
}

test('500-page editor windows sortable work while preserving global order and geometry', async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on('console', message => {
    if (message.type() === 'error') consoleErrors.push(message.text());
  });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'ZenPDF' })).toBeVisible();
  await page.locator('input[type="file"]').first().setInputFiles({
    name: 'windowed-sortables-fixture.pdf',
    mimeType: 'application/pdf',
    buffer: await makeLargePdf(500),
  });

  await expect(page.getByRole('heading', { name: 'Documents' })).toBeVisible();
  await expect(page.getByText('500 Pages')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Page Editor' })).toBeEnabled();
  await page.getByRole('button', { name: 'Page Editor' }).click();
  await expect(page.getByRole('heading', { name: 'Editor' })).toBeVisible();

  const grid = page.locator('[data-windowed-page-grid]');
  await expect(grid).toHaveAttribute('data-logical-page-count', '500');
  await expect(grid).toHaveAttribute('data-thumbnail-ready-count', /\d+/);
  const initial = await readWindowMetrics(page, grid);
  const initialMountedIndices = await page.locator('[data-page-card]').evaluateAll(elements => (
    elements.map(element => Number(element.getAttribute('data-page-index')))
  ));

  expect(initial.logicalPageCount).toBe(500);
  expect(initial.mountedSortableCount).toBe(initial.mountedSortableDomCount);
  expect(initial.mountedThumbnailCount).toBe(initial.mountedThumbnailDomCount);
  expect(initial.lightweightShellCount).toBe(initial.lightweightShellDomCount);
  expect(initial.lightweightShellCount + initial.mountedSortableCount).toBe(500);
  expect(initial.mountedSortableCount).toBeGreaterThan(0);
  expect(initial.mountedSortableCount).toBeLessThanOrEqual(50);
  expect(initial.mountedSortableCount).toBeLessThan(500);
  expect(initial.overscanStartRow).toBeLessThanOrEqual(initial.visibleStartRow);
  expect(initial.overscanEndRow).toBeGreaterThanOrEqual(initial.visibleEndRow);
  expect(await visibleShellCount(page)).toBe(0);
  await expect(page.locator('[data-page-shell] [data-page-thumbnail-subtree]')).toHaveCount(0);
  await expect(page.locator('[data-page-shell] button')).toHaveCount(0);

  const firstCard = await waitForSortableCard(page, 0);
  const firstControl = firstCard.locator('button[aria-label="Select page"]');
  await firstControl.click();
  await expect(firstCard.locator('button[aria-label="Deselect page"]')).toHaveAttribute('aria-pressed', 'true');
  await firstCard.locator('button[aria-label="Deselect page"]').click();
  const initialOrder = await logicalOrder(page);
  expect(initialOrder).toEqual(Array.from({ length: 500 }, (_, index) => index));

  const zoomOut = page.getByRole('button', { name: 'Zoom out' });
  const zoomIn = page.getByRole('button', { name: 'Zoom in' });
  await page.evaluate(() => window.scrollTo(0, 0));
  await zoomOut.click();
  await expect(grid).toHaveAttribute('data-window-zoom-level', '2');
  await zoomOut.click();
  await expect(grid).toHaveAttribute('data-window-zoom-level', '1');
  const zoomMetrics: Record<string, WindowMetrics> = {};
  const expectedColumns = [8, 6, 5, 4, 3];
  for (let zoomLevel = 1; zoomLevel <= 5; zoomLevel += 1) {
    if (zoomLevel > 1) {
      await zoomIn.click();
      await expect(grid).toHaveAttribute('data-window-zoom-level', String(zoomLevel));
    }
    const metrics = await readWindowMetrics(page, grid);
    expect(metrics.columns).toBe(expectedColumns[zoomLevel - 1]);
    expect(metrics.logicalPageCount).toBe(500);
    expect(metrics.mountedSortableCount).toBe(metrics.mountedSortableDomCount);
    expect(metrics.mountedThumbnailCount).toBe(metrics.mountedThumbnailDomCount);
    expect(metrics.mountedSortableCount).toBeLessThan(100);
    zoomMetrics[String(zoomLevel)] = metrics;
  }
  await zoomOut.click();
  await expect(grid).toHaveAttribute('data-window-zoom-level', '4');
  await zoomOut.click();
  await expect(grid).toHaveAttribute('data-window-zoom-level', '3');
  await page.evaluate(() => window.scrollTo(0, 0));
  await expect(grid).toHaveAttribute('data-window-columns', '5');

  const defaultScrollHeight = await page.evaluate(() => document.documentElement.scrollHeight);
  let expectedOrder = [...initialOrder];

  const adjacentSource = await waitForSortableCard(page, 0);
  await waitForSortableCard(page, 1);
  await dragWithMouseToPage(page, adjacentSource, 1);
  expectedOrder = [1, 0, ...expectedOrder.slice(2)];
  await expect.poll(() => logicalOrder(page)).toEqual(expectedOrder);

  const offscreenOrder = [...expectedOrder];
  await dragWithMouseToPage(page, await waitForSortableCard(page, 2), 100);
  const movedOffscreenOrder = await logicalOrder(page);
  expect(movedOffscreenOrder).not.toEqual(offscreenOrder);
  expect([...movedOffscreenOrder].sort((left, right) => left - right)).toEqual(
    [...offscreenOrder].sort((left, right) => left - right),
  );
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => logicalOrder(page)).toEqual(offscreenOrder);

  const multiFirst = await waitForSortableCard(page, 10);
  const multiLast = await waitForSortableCard(page, 12);
  await multiFirst.locator('button[aria-label="Select page"]').click();
  await multiLast.locator('button[aria-label="Select page"]').click({ modifiers: ['Shift'] });
  for (const pageIndex of [10, 11, 12]) {
    await expect((await waitForSortableCard(page, pageIndex)).locator('button[aria-label="Deselect page"]'))
      .toHaveAttribute('aria-pressed', 'true');
  }

  const orderBeforeGroupMove = [...expectedOrder];
  await dragWithMouseToPage(page, await waitForSortableCard(page, 10), 20);
  const groupOrder = await logicalOrder(page);
  const groupStart = groupOrder.indexOf(10);
  expect(groupOrder).not.toEqual(orderBeforeGroupMove);
  expect(groupOrder).toHaveLength(500);
  expect([...groupOrder].sort((left, right) => left - right)).toEqual(
    [...orderBeforeGroupMove].sort((left, right) => left - right),
  );
  expect(groupStart).toBeGreaterThan(orderBeforeGroupMove.indexOf(10));
  expect(groupOrder.slice(groupStart, groupStart + 3)).toEqual([10, 11, 12]);
  expectedOrder = groupOrder;
  for (const pageIndex of [10, 11, 12]) {
    await expect((await waitForSortableCard(page, pageIndex)).locator('button[aria-label="Deselect page"]'))
      .toHaveAttribute('aria-pressed', 'true');
  }
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => logicalOrder(page)).toEqual(orderBeforeGroupMove);
  await page.getByRole('button', { name: 'Redo' }).click();
  await expect.poll(() => logicalOrder(page)).toEqual(groupOrder);

  await page.getByRole('button', { name: 'None' }).click();
  const farCard = await waitForSortableCard(page, 499);
  const farMetrics = await readWindowMetrics(page, grid);
  const farMountedIndices = await page.locator('[data-page-card]').evaluateAll(elements => (
    elements.map(element => Number(element.getAttribute('data-page-index')))
  ));
  expect(farMetrics.logicalPageCount).toBe(500);
  expect(farMetrics.mountedSortableCount).toBe(farMetrics.mountedSortableDomCount);
  expect(farMetrics.mountedThumbnailCount).toBe(farMetrics.mountedThumbnailDomCount);
  expect(farMetrics.mountedSortableCount).toBeLessThan(100);
  expect(farMountedIndices).not.toEqual(initialMountedIndices);
  expect(farMountedIndices.some(index => initialMountedIndices.includes(index))).toBe(false);
  expect(await sortableCard(page, initialMountedIndices[0]).count()).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBe(defaultScrollHeight);
  expect(await visibleShellCount(page)).toBe(0);
  await expect(farCard.locator('button[aria-label="Select page"]')).toBeVisible();
  await farCard.locator('button[aria-label="Select page"]').click();
  await expect(farCard.locator('button[aria-label="Deselect page"]')).toHaveAttribute('aria-pressed', 'true');
  await farCard.locator('button[aria-label="Deselect page"]').click();

  await expect(grid).toHaveAttribute('data-thumbnail-ready-count', '500');
  await expect(page.locator('[data-page-card] [data-page-thumbnail-subtree] img'))
    .toHaveCount(farMetrics.mountedSortableDomCount);

  const farMouseOrder = [...expectedOrder];
  await dragWithMouseToPage(page, await waitForSortableCard(page, 480), 499);
  const movedFarMouseOrder = await logicalOrder(page);
  expect(movedFarMouseOrder).not.toEqual(farMouseOrder);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => logicalOrder(page)).toEqual(farMouseOrder);

  const farTouchOrder = [...expectedOrder];
  await dragWithTouchToPage(page, await waitForSortableCard(page, 490), 491);
  expect(await logicalOrder(page)).not.toEqual(farTouchOrder);
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => logicalOrder(page)).toEqual(farTouchOrder);

  const keyboardOrder = [...expectedOrder];
  const keyboardSource = await waitForSortableCard(page, 490);
  const keyboardHandle = keyboardSource.locator('[data-page-drag-handle]');
  await keyboardHandle.focus();
  await keyboardHandle.press('Space');
  await keyboardHandle.press('ArrowRight');
  await keyboardHandle.press('Space');
  await expect.poll(() => logicalOrder(page)).not.toEqual(keyboardOrder);
  await expect(keyboardHandle).toBeFocused();
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect.poll(() => logicalOrder(page)).toEqual(keyboardOrder);

  await page.setViewportSize({ width: 700, height: 900 });
  await expect(grid).toHaveAttribute('data-window-columns', '2');
  await expect(page.locator('[data-page-id]')).toHaveCount(500);
  await expect.poll(() => logicalOrder(page)).toEqual(expectedOrder);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await expect(grid).toHaveAttribute('data-window-columns', '5');
  await expect.poll(() => logicalOrder(page)).toEqual(expectedOrder);

  const rotatedCard = await waitForSortableCard(page, 2);
  await rotatedCard.locator('button[aria-label="Rotate page clockwise"]').click();
  await expect(rotatedCard.locator('img[alt="Page"]')).toHaveAttribute('style', /rotate\(90deg\)/);

  await mkdir('test-results/performance', { recursive: true });
  await writeFile(
    'test-results/performance/windowing-500-pages.json',
    `${JSON.stringify({
      pageCount: 500,
      viewport: { width: 1440, height: 1000 },
      initial,
      zoomMetrics,
      far: farMetrics,
      defaultScrollHeight,
      farScrollHeight: await page.evaluate(() => document.documentElement.scrollHeight),
    }, null, 2)}\n`,
    'utf8',
  );

  await page.getByRole('button', { name: 'Save PDF' }).click();
  await expect(page.getByRole('link', { name: 'Download' })).toBeVisible();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download' }).click();
  const download = await downloadPromise;
  const outputPath = await download.path();
  if (!outputPath) throw new Error('Windowed 500-page save did not produce a download.');
  const output = await PDFDocument.load(await readFile(outputPath));

  expect(output.getPageCount()).toBe(500);
  expect(output.getPage(0).getWidth()).toBeCloseTo(220, 1);
  expect(output.getPage(1).getWidth()).toBeCloseTo(200, 1);
  expect(output.getPage(2).getRotation().angle % 360).toBe(90);
  expect(consoleErrors).toEqual([]);
});
