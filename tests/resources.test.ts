import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResourceRegistry, discardWorkerResponseResources } from '../src/pdf/resources';

describe('ResourceRegistry', () => {
  let createObjectUrlCount = 0;
  const createObjectURL = vi.fn(() => `blob:owned-${++createObjectUrlCount}`);
  const revokeObjectURL = vi.fn();
  const NativeURL = globalThis.URL;

  beforeEach(() => {
    vi.clearAllMocks();
    createObjectUrlCount = 0;
    const TestURL = class extends NativeURL {};
    TestURL.createObjectURL = createObjectURL;
    TestURL.revokeObjectURL = revokeObjectURL;
    vi.stubGlobal('URL', TestURL);
  });

  afterEach(() => vi.unstubAllGlobals());

  it('replaces owned URLs and revokes the previous resource first', () => {
    const registry = new ResourceRegistry();
    const first = registry.create('thumb:a:0', new Blob(['first']));
    const second = registry.create('thumb:a:0', new Blob(['second']));

    expect(first).toBe('blob:owned-1');
    expect(second).toBe('blob:owned-2');
    expect(revokeObjectURL).toHaveBeenCalledWith(first);
    expect(registry.ownedUrlCount()).toBe(1);
  });

  it('releases every resource owned by a file or session', () => {
    const registry = new ResourceRegistry();
    registry.create('file:a:thumbnail:0', new Blob(['a']));
    registry.create('file:a:thumbnail:1', new Blob(['b']));
    registry.create('file:b:thumbnail:0', new Blob(['c']));
    registry.create('output:merged', new Blob(['d']));

    registry.releaseFile('a');
    expect(registry.ownedUrlCount()).toBe(2);
    registry.releaseAll();
    expect(registry.ownedUrlCount()).toBe(0);
    expect(revokeObjectURL).toHaveBeenCalledTimes(4);
  });

  it('releases stale URLs received in an ignored response', () => {
    discardWorkerResponseResources({ payload: { url: 'blob:stale', urls: ['blob:stale-2'] } });

    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stale');
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:stale-2');
  });
});
