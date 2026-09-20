import { describe, expect, it } from 'vitest';
import type { PageItem } from '../types';
import { thumbnailPriorityByFile } from '../components/thumbnailPriority';

function page(uniqueId: string, fileId: string, pageIndex: number): PageItem {
  return { uniqueId, fileId, pageIndex, rotation: 0 };
}

describe('editor thumbnail priority derivation', () => {
  it('orders visible pages before overscan and groups source indexes by file', () => {
    const pageOrder = [
      page('a-3', 'a', 3),
      page('b-7', 'b', 7),
      page('a-1', 'a', 1),
      page('b-2', 'b', 2),
      page('a-0', 'a', 0),
      page('b-4', 'b', 4),
    ];

    const priorities = thumbnailPriorityByFile(pageOrder, {
      startIndex: 1,
      endIndex: 6,
      visibleStartRow: 1,
      visibleEndRow: 1,
      overscanStartRow: 0,
      overscanEndRow: 2,
      columns: 2,
    });

    expect(priorities.get('a')).toEqual([1, 0]);
    expect(priorities.get('b')).toEqual([2, 7, 4]);
  });

  it('deduplicates a source page when the logical order contains it twice', () => {
    const priorities = thumbnailPriorityByFile([
      page('a-0-first', 'a', 0),
      page('a-0-second', 'a', 0),
      page('a-1', 'a', 1),
    ], {
      startIndex: 0,
      endIndex: 3,
      visibleStartRow: 0,
      visibleEndRow: 0,
      overscanStartRow: 0,
      overscanEndRow: 1,
      columns: 1,
    });

    expect(priorities.get('a')).toEqual([0, 1]);
  });
});
