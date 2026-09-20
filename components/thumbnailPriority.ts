import type { PageItem } from '../types';
import type { PageWindowRange } from './useWindowedPageRange';

function clampIndex(value: number, pageCount: number): number {
  return Math.max(0, Math.min(pageCount, value));
}

/**
 * Converts the editor's logical window into source-page priorities. The
 * visible range is intentionally emitted before the surrounding overscan, and
 * each source file keeps its own page-index order.
 */
export function thumbnailPriorityByFile(
  pageOrder: readonly PageItem[],
  range: PageWindowRange,
): Map<string, number[]> {
  const visibleStartIndex = clampIndex(range.visibleStartRow * range.columns, pageOrder.length);
  const visibleEndIndex = clampIndex((range.visibleEndRow + 1) * range.columns, pageOrder.length);
  const overscanStartIndex = clampIndex(range.startIndex, pageOrder.length);
  const overscanEndIndex = clampIndex(range.endIndex, pageOrder.length);
  const orderedPages = [
    ...pageOrder.slice(visibleStartIndex, visibleEndIndex),
    ...pageOrder.slice(overscanStartIndex, visibleStartIndex),
    ...pageOrder.slice(visibleEndIndex, overscanEndIndex),
  ];
  const result = new Map<string, number[]>();
  const seenByFile = new Map<string, Set<number>>();

  for (const page of orderedPages) {
    const seen = seenByFile.get(page.fileId) ?? new Set<number>();
    if (seen.has(page.pageIndex)) continue;
    seen.add(page.pageIndex);
    seenByFile.set(page.fileId, seen);
    const indexes = result.get(page.fileId) ?? [];
    indexes.push(page.pageIndex);
    result.set(page.fileId, indexes);
  }

  return result;
}
