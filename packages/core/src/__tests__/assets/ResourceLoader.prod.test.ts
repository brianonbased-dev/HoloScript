/**
 * ResourceLoader Production Tests
 *
 * Covers: addRequest/getRequestCount, cancelRequest (status='cancelled'),
 * loadAll (topological dependency order, loads in priority desc, cancelled
 * entries get cancelled status, failed deps produce error status, progress
 * callbacks fired), getResult, getLoadedCount.
 */

import { describe, it, expect, vi } from 'vitest';
import { ResourceLoader } from '../../assets/ResourceLoader';
import type { ResourceRequest } from '../../assets/ResourceLoader';

// ── helpers ───────────────────────────────────────────────────────────────────

function mkReq(id: string, deps: string[] = [], priority = 0): ResourceRequest {
  return { id, url: `/${id}`, type: 'texture', dependencies: deps, priority };
}

function mockLoader(overrides: Record<string, unknown> = {}) {
  return async (req: ResourceRequest) => {
    if (req.id in overrides) {
      const val = overrides[req.id];
      if (val instanceof Error) throw val;
      return val;
    }
    return { id: req.id };
  };
}

// ── addRequest / getRequestCount ────────────────────────────────────────────────

describe('ResourceLoader — addRequest / getRequestCount', () => {

  it('getRequestCount is 0 on fresh loader', () => {
    expect(new ResourceLoader().getRequestCount()).toBe(0);
  });

  it('addRequest increments count', () => {
    const rl = new ResourceLoader();
    rl.addRequest(mkReq('a'));
    rl.addRequest(mkReq('b'));
    expect(rl.getRequestCount()).toBe(2);
  });
});

// ── cancelRequest ──────────────────────────────────────────────────────────────

describe('ResourceLoader — cancelRequest', () => {

  it('cancelled request has status=cancelled after loadAll', async () => {
    const rl = new ResourceLoader(async () => ({}));
    rl.addRequest(mkReq('a'));
    rl.cancelRequest('a');
    await rl.loadAll();
    expect(rl.getResult('a')?.status).toBe('cancelled');
  });

  it('cancelled request contributes 0 to getLoadedCount', async () => {
    const rl = new ResourceLoader(async () => ({}));
    rl.addRequest(mkReq('a'));
    rl.cancelRequest('a');
    await rl.loadAll();
    expect(rl.getLoadedCount()).toBe(0);
  });
});

// ── loadAll — basic operation ──────────────────────────────────────────────────

describe('ResourceLoader — loadAll', () => {

  it('returns results for all requests', async () => {
    const rl = new ResourceLoader(async () => ({}));
    rl.addRequest(mkReq('a'));
    rl.addRequest(mkReq('b'));
    const results = await rl.loadAll();
    expect(results).toHaveLength(2);
  });

  it('successfully loaded request has status=loaded', async () => {
    const rl = new ResourceLoader(async () => ({ data: 42 }));
    rl.addRequest(mkReq('x'));
    await rl.loadAll();
    expect(rl.getResult('x')?.status).toBe('loaded');
  });

  it('loader error produces status=error', async () => {
    const rl = new ResourceLoader(async () => { throw new Error('oops'); });
    rl.addRequest(mkReq('fail'));
    await rl.loadAll();
    const result = rl.getResult('fail');
    expect(result?.status).toBe('error');
    expect(result?.error).toContain('oops');
  });

  it('failed dependency causes dependent to have status=error', async () => {
    const rl = new ResourceLoader(async (req) => {
      if (req.id === 'dep') throw new Error('dep failed');
      return {};
    });
    rl.addRequest(mkReq('dep'));
    rl.addRequest(mkReq('child', ['dep']));
    await rl.loadAll();
    expect(rl.getResult('dep')?.status).toBe('error');
    expect(rl.getResult('child')?.status).toBe('error');
  });

  it('dependencies are loaded before dependents (topo order)', async () => {
    const order: string[] = [];
    const rl = new ResourceLoader(async (req) => { order.push(req.id); return {}; });
    rl.addRequest(mkReq('parent', ['dep']));
    rl.addRequest(mkReq('dep', []));
    await rl.loadAll();
    expect(order.indexOf('dep')).toBeLessThan(order.indexOf('parent'));
  });

  it('higher priority request loads first (when no deps)', async () => {
    const order: string[] = [];
    const rl = new ResourceLoader(async (req) => { order.push(req.id); return {}; });
    rl.addRequest(mkReq('low', [], 1));
    rl.addRequest(mkReq('high', [], 10));
    await rl.loadAll();
    // 'high' (priority 10) should appear before 'low' (priority 1) in sorted order
    expect(order.indexOf('high')).toBeLessThanOrEqual(order.indexOf('low'));
  });
});

// ── onProgress ────────────────────────────────────────────────────────────────

describe('ResourceLoader — onProgress', () => {

  it('progress callback is called for each loaded request', async () => {
    const rl = new ResourceLoader(async () => ({}));
    rl.addRequest(mkReq('a'));
    rl.addRequest(mkReq('b'));
    const calls: [number, number][] = [];
    rl.onProgress((loaded, total) => calls.push([loaded, total]));
    await rl.loadAll();
    expect(calls).toHaveLength(2);
    expect(calls[1][0]).toBe(2); // loaded = 2 on last call
    expect(calls[0][1]).toBe(2); // total = 2
  });

  it('progress callback receives currentId', async () => {
    const rl = new ResourceLoader(async () => ({}));
    rl.addRequest(mkReq('myAsset'));
    const ids: string[] = [];
    rl.onProgress((_l, _t, id) => ids.push(id));
    await rl.loadAll();
    expect(ids).toContain('myAsset');
  });
});

// ── getResult / getLoadedCount ────────────────────────────────────────────────

describe('ResourceLoader — getResult / getLoadedCount', () => {

  it('getResult returns undefined before loadAll', () => {
    const rl = new ResourceLoader();
    rl.addRequest(mkReq('a'));
    expect(rl.getResult('a')).toBeUndefined();
  });

  it('getLoadedCount counts only status=loaded', async () => {
    const rl = new ResourceLoader(async (req) => {
      if (req.id === 'fail') throw new Error();
      return {};
    });
    rl.addRequest(mkReq('ok'));
    rl.addRequest(mkReq('fail'));
    await rl.loadAll();
    expect(rl.getLoadedCount()).toBe(1);
  });

  it('loadTimeMs is a non-negative number for loaded resource', async () => {
    const rl = new ResourceLoader(async () => ({}));
    rl.addRequest(mkReq('t'));
    await rl.loadAll();
    expect(rl.getResult('t')?.loadTimeMs).toBeGreaterThanOrEqual(0);
  });
});
