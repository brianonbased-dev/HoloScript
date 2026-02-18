import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceBundle } from '../ResourceBundle';
import type { BundleConfig, BundleEntry, StreamCallback } from '../ResourceBundle';

describe('ResourceBundle', () => {
  let rb: ResourceBundle;
  const config: BundleConfig = {
    id: 'bundle1',
    name: 'Test Bundle',
    priority: 10,
    maxSizeBytes: 1000,
    preload: true,
  };

  beforeEach(() => {
    rb = new ResourceBundle();
  });

  it('createBundle and getBundleCount', () => {
    rb.createBundle(config);
    expect(rb.getBundleCount()).toBe(1);
  });

  it('removeBundle', () => {
    rb.createBundle(config);
    rb.removeBundle('bundle1');
    expect(rb.getBundleCount()).toBe(0);
  });

  it('addEntry adds entry within size limit', () => {
    rb.createBundle(config);
    const ok = rb.addEntry('bundle1', { id: 'a', sizeBytes: 500, type: 'texture', loaded: false });
    expect(ok).toBe(true);
    expect(rb.getEntryCount('bundle1')).toBe(1);
  });

  it('addEntry rejects when over max size', () => {
    rb.createBundle(config);
    rb.addEntry('bundle1', { id: 'a', sizeBytes: 800, type: 'texture', loaded: false });
    const ok = rb.addEntry('bundle1', { id: 'b', sizeBytes: 300, type: 'texture', loaded: false });
    expect(ok).toBe(false);
    expect(rb.getEntryCount('bundle1')).toBe(1);
  });

  it('addEntry returns false for unknown bundle', () => {
    const ok = rb.addEntry('nope', { id: 'a', sizeBytes: 10, type: 'texture', loaded: false });
    expect(ok).toBe(false);
  });

  it('getBundleSize returns total bytes', () => {
    rb.createBundle(config);
    rb.addEntry('bundle1', { id: 'a', sizeBytes: 200, type: 'tex', loaded: false });
    rb.addEntry('bundle1', { id: 'b', sizeBytes: 300, type: 'tex', loaded: false });
    expect(rb.getBundleSize('bundle1')).toBe(500);
  });

  it('loadBundle marks entries as loaded', async () => {
    rb.createBundle(config);
    rb.addEntry('bundle1', { id: 'a', sizeBytes: 100, type: 'tex', loaded: false });
    rb.addEntry('bundle1', { id: 'b', sizeBytes: 100, type: 'tex', loaded: false });

    await rb.loadBundle('bundle1');

    expect(rb.getLoadedCount('bundle1')).toBe(2);
    expect(rb.isFullyLoaded('bundle1')).toBe(true);
  });

  it('onStream callback fires during load', async () => {
    const cb = vi.fn();
    rb.createBundle(config);
    rb.addEntry('bundle1', { id: 'a', sizeBytes: 100, type: 'tex', loaded: false });
    rb.onStream(cb);

    await rb.loadBundle('bundle1');

    expect(cb).toHaveBeenCalledWith('bundle1', 0, 1);
  });

  it('getLoadProgress returns 0..1 fraction', async () => {
    rb.createBundle(config);
    rb.addEntry('bundle1', { id: 'a', sizeBytes: 100, type: 'tex', loaded: false });
    rb.addEntry('bundle1', { id: 'b', sizeBytes: 100, type: 'tex', loaded: false });

    expect(rb.getLoadProgress('bundle1')).toBe(0);
    await rb.loadBundle('bundle1');
    expect(rb.getLoadProgress('bundle1')).toBe(1);
  });

  it('preloadAll loads bundles by priority', async () => {
    rb.createBundle({ id: 'low', name: 'Low', priority: 1, maxSizeBytes: 1000, preload: true });
    rb.createBundle({ id: 'high', name: 'High', priority: 10, maxSizeBytes: 1000, preload: true });
    rb.createBundle({ id: 'skip', name: 'Skip', priority: 5, maxSizeBytes: 1000, preload: false });
    rb.addEntry('low', { id: 'a', sizeBytes: 50, type: 'tex', loaded: false });
    rb.addEntry('high', { id: 'b', sizeBytes: 50, type: 'tex', loaded: false });
    rb.addEntry('skip', { id: 'c', sizeBytes: 50, type: 'tex', loaded: false });

    const loaded = await rb.preloadAll();

    expect(loaded).toContain('low');
    expect(loaded).toContain('high');
    expect(loaded).not.toContain('skip');
    expect(rb.isFullyLoaded('high')).toBe(true);
    expect(rb.isFullyLoaded('skip')).toBe(false);
  });
});
