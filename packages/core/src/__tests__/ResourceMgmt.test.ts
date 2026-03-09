import { describe, it, expect } from 'vitest';
import { ResourceLoader } from '../assets/ResourceLoader';
import { ResourceCache } from '../assets/ResourceCache';
import { ResourceBundle } from '../assets/ResourceBundle';

describe('Cycle 155: Resource Management', () => {
  // -------------------------------------------------------------------------
  // ResourceLoader
  // -------------------------------------------------------------------------

  it('should load resources in dependency order', async () => {
    const order: string[] = [];
    const loader = new ResourceLoader(async (req) => {
      order.push(req.id);
      return req.id;
    });

    loader.addRequest({ id: 'shader', url: '/s', type: 'shader', dependencies: [], priority: 1 });
    loader.addRequest({
      id: 'material',
      url: '/m',
      type: 'material',
      dependencies: ['shader'],
      priority: 1,
    });

    const results = await loader.loadAll();
    expect(order).toEqual(['shader', 'material']);
    expect(results.every((r) => r.status === 'loaded')).toBe(true);
  });

  it('should cancel and track progress', async () => {
    let progressCalls = 0;
    const loader = new ResourceLoader();
    loader.addRequest({ id: 'a', url: '/a', type: 'tex', dependencies: [], priority: 1 });
    loader.addRequest({ id: 'b', url: '/b', type: 'tex', dependencies: [], priority: 1 });
    loader.cancelRequest('b');
    loader.onProgress(() => progressCalls++);

    await loader.loadAll();
    expect(loader.getResult('b')?.status).toBe('cancelled');
    expect(progressCalls).toBe(1); // Only 'a' fires progress (b is cancelled)
  });

  // -------------------------------------------------------------------------
  // ResourceCache
  // -------------------------------------------------------------------------

  it('should evict LRU entries when over budget', () => {
    const cache = new ResourceCache<string>(100);

    cache.put('a', 'dataA', 60);
    cache.put('b', 'dataB', 60); // Evicts 'a' to make room

    expect(cache.has('a')).toBe(false);
    expect(cache.get('b')).toBe('dataB');
  });

  it('should skip referenced entries during eviction', () => {
    const cache = new ResourceCache<string>(100);

    cache.put('a', 'dataA', 60);
    cache.addRef('a'); // Protected

    cache.put('b', 'dataB', 60); // Can't evict 'a', so both entries exist if budget allows

    // 'a' is referenced so it should still exist
    expect(cache.has('a')).toBe(true);
    expect(cache.getRefCount('a')).toBe(1);
  });

  // -------------------------------------------------------------------------
  // ResourceBundle
  // -------------------------------------------------------------------------

  it('should pack entries and enforce max size', () => {
    const rb = new ResourceBundle();
    rb.createBundle({ id: 'b1', name: 'Bundle1', priority: 1, maxSizeBytes: 100, preload: false });

    expect(rb.addEntry('b1', { id: 'e1', sizeBytes: 60, type: 'tex', loaded: false })).toBe(true);
    expect(rb.addEntry('b1', { id: 'e2', sizeBytes: 60, type: 'tex', loaded: false })).toBe(false); // Over budget

    expect(rb.getEntryCount('b1')).toBe(1);
    expect(rb.getBundleSize('b1')).toBe(60);
  });

  it('should load bundles in chunks and track progress', async () => {
    const rb = new ResourceBundle();
    rb.createBundle({ id: 'b1', name: 'B', priority: 1, maxSizeBytes: 1000, preload: false });
    rb.addEntry('b1', { id: 'e1', sizeBytes: 10, type: 'tex', loaded: false });
    rb.addEntry('b1', { id: 'e2', sizeBytes: 10, type: 'tex', loaded: false });
    rb.addEntry('b1', { id: 'e3', sizeBytes: 10, type: 'tex', loaded: false });

    const chunks: number[] = [];
    rb.onStream((_bid, chunkIdx) => chunks.push(chunkIdx));

    await rb.loadBundle('b1', 2); // 2 per chunk = 2 chunks

    expect(rb.isFullyLoaded('b1')).toBe(true);
    expect(rb.getLoadProgress('b1')).toBe(1);
    expect(chunks).toEqual([0, 1]);
  });
});
