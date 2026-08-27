import { useLayoutEffect, useState, type RefObject } from 'react';

export interface PageWindowRange {
  startIndex: number;
  endIndex: number;
  visibleStartRow: number;
  visibleEndRow: number;
  overscanStartRow: number;
  overscanEndRow: number;
  columns: number;
}

const OVERSCAN_ROWS = 3;
const INITIAL_PAGE_LIMIT = 50;

function initialRange(pageCount: number): PageWindowRange {
  return {
    startIndex: 0,
    endIndex: Math.min(pageCount, INITIAL_PAGE_LIMIT),
    visibleStartRow: 0,
    visibleEndRow: 0,
    overscanStartRow: 0,
    overscanEndRow: 0,
    columns: 1,
  };
}

function sameRange(left: PageWindowRange, right: PageWindowRange): boolean {
  return (
    left.startIndex === right.startIndex &&
    left.endIndex === right.endIndex &&
    left.visibleStartRow === right.visibleStartRow &&
    left.visibleEndRow === right.visibleEndRow &&
    left.overscanStartRow === right.overscanStartRow &&
    left.overscanEndRow === right.overscanEndRow &&
    left.columns === right.columns
  );
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function measureRange(grid: HTMLElement | null, pageCount: number): PageWindowRange | null {
  if (!grid || pageCount === 0 || grid.children.length === 0) return null;

  const children = Array.from(grid.children) as HTMLElement[];
  const first = children[0];
  const firstRowTop = first.offsetTop;
  let columns = 0;
  while (columns < children.length && children[columns].offsetTop === firstRowTop) {
    columns += 1;
  }
  columns = Math.max(1, columns);

  const rowGap = Number.parseFloat(getComputedStyle(grid).rowGap) || 0;
  const nextRow = children[columns];
  const rowPitch = Math.max(
    1,
    nextRow
      ? nextRow.offsetTop - firstRowTop
      : first.offsetHeight + rowGap,
  );
  const maxRow = Math.max(0, Math.ceil(pageCount / columns) - 1);
  const gridTop = grid.getBoundingClientRect().top + window.scrollY;
  const viewportTop = window.scrollY;
  const viewportBottom = viewportTop + window.innerHeight;
  const visibleStartRow = clamp(
    Math.floor((viewportTop - gridTop) / rowPitch),
    0,
    maxRow,
  );
  const visibleEndRow = clamp(
    Math.max(
      visibleStartRow,
      Math.ceil((viewportBottom - gridTop) / rowPitch) - 1,
    ),
    visibleStartRow,
    maxRow,
  );
  const overscanStartRow = Math.max(0, visibleStartRow - OVERSCAN_ROWS);
  const overscanEndRow = Math.min(maxRow, visibleEndRow + OVERSCAN_ROWS);

  return {
    startIndex: overscanStartRow * columns,
    endIndex: Math.min(pageCount, (overscanEndRow + 1) * columns),
    visibleStartRow,
    visibleEndRow,
    overscanStartRow,
    overscanEndRow,
    columns,
  };
}

export function useWindowedPageRange(
  gridRef: RefObject<HTMLDivElement | null>,
  pageCount: number,
  zoomLevel: number,
): PageWindowRange {
  const [range, setRange] = useState(() => initialRange(pageCount));

  useLayoutEffect(() => {
    let frame = 0;

    const updateRange = () => {
      const measured = measureRange(gridRef.current, pageCount);
      if (!measured) return;
      setRange(previous => sameRange(previous, measured) ? previous : measured);
    };

    const scheduleUpdate = () => {
      if (frame !== 0) return;
      frame = window.requestAnimationFrame(() => {
        frame = 0;
        updateRange();
      });
    };

    updateRange();
    window.addEventListener('scroll', scheduleUpdate, { passive: true });
    window.addEventListener('resize', scheduleUpdate);
    const observer = typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(scheduleUpdate);
    if (gridRef.current) observer?.observe(gridRef.current);

    return () => {
      window.removeEventListener('scroll', scheduleUpdate);
      window.removeEventListener('resize', scheduleUpdate);
      observer?.disconnect();
      if (frame !== 0) window.cancelAnimationFrame(frame);
    };
  }, [gridRef, pageCount, zoomLevel]);

  return range;
}
