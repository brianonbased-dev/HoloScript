import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResourceLoader, type ResourceRequest } from '../assets/ResourceLoader';

// =============================================================================
// C291 — Resource Loader
// =============================================================================

function req(id: string, deps: string[] = [], priority = 0): ResourceRequest {
  return { id, url: `/${id}.bin`, type: 'mesh', dependencies: deps, priority };
}

describe('ResourceLoader', () => {
  let loader: ResourceLoader;
  beforeEach(() => {
    loader = new ResourceLoader();
  });

  it('loads a single resource', async () => {
    loader.addRequest(req('a'));
    const results = await loader.loadAll();
    expect(results).toHaveLength(1);
    expect(results[0].status).toBe('loaded');
  });

  it('loads resources in dependency order', async () => {
    const order: string[] = [];
    const rl = new ResourceLoader(async (r) => {
      order.push(r.id);
      return r.id;
    });
    rl.addRequest(req('b', ['a']));
    rl.addRequest(req('a'));
    await rl.loadAll();
    expect(order.indexOf('a')).toBeLessThan(order.indexOf('b'));
  });

  it('fails resource when dependency failed', async () => {
    const rl = new ResourceLoader(async (r) => {
      if (r.id === 'a') throw new Error('boom');
      return r.id;
    });
    rl.addRequest(req('a'));
    rl.addRequest(req('b', ['a']));
    const results = await rl.loadAll();
    const bResult = results.find((r) => r.id === 'b');
    expect(bResult?.status).toBe('error');
    expect(bResult?.error).toBe('dependency failed');
  });

  it('cancels a request', async () => {
    loader.addRequest(req('a'));
    loader.cancelRequest('a');
    const results = await loader.loadAll();
    expect(results[0].status).toBe('cancelled');
  });

  it('reports progress via callback', async () => {
    const progress = vi.fn();
    loader.onProgress(progress);
    loader.addRequest(req('a'));
    loader.addRequest(req('b'));
    await loader.loadAll();
    expect(progress).toHaveBeenCalledTimes(2);
  });

  it('handles loader errors gracefully', async () => {
    const rl = new ResourceLoader(async () => {
      throw new Error('network');
    });
    rl.addRequest(req('x'));
    const results = await rl.loadAll();
    expect(results[0].status).toBe('error');
    expect(results[0].error).toBe('network');
  });

  it('getResult returns result after load', async () => {
    loader.addRequest(req('a'));
    await loader.loadAll();
    expect(loader.getResult('a')?.status).toBe('loaded');
  });

  it('getRequestCount reports correct count', () => {
    loader.addRequest(req('a'));
    loader.addRequest(req('b'));
    expect(loader.getRequestCount()).toBe(2);
  });

  it('getLoadedCount reports loaded resources', async () => {
    loader.addRequest(req('a'));
    loader.addRequest(req('b'));
    await loader.loadAll();
    expect(loader.getLoadedCount()).toBe(2);
  });

  it('higher priority resources appear earlier in order', async () => {
    const order: string[] = [];
    const rl = new ResourceLoader(async (r) => {
      order.push(r.id);
      return r.id;
    });
    rl.addRequest({ ...req('low'), priority: 1 });
    rl.addRequest({ ...req('high'), priority: 10 });
    await rl.loadAll();
    expect(order.indexOf('high')).toBeLessThan(order.indexOf('low'));
  });

  it('loadTimeMs is non-negative', async () => {
    loader.addRequest(req('a'));
    const results = await loader.loadAll();
    expect(results[0].loadTimeMs).toBeGreaterThanOrEqual(0);
  });
});
