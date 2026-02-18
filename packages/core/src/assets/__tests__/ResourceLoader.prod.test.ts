/**
 * ResourceLoader Production Tests
 *
 * Async resource loading: add/cancel requests, dependency ordering,
 * loadAll with progress, dependency failure propagation, and cancellation.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResourceLoader, type ResourceRequest } from '../ResourceLoader';

function makeReq(id: string, deps: string[] = [], priority = 1): ResourceRequest {
  return { id, url: `/assets/${id}`, type: 'mesh', dependencies: deps, priority };
}

describe('ResourceLoader — Production', () => {
  let loader: ResourceLoader;

  beforeEach(() => {
    vi.clearAllMocks();
    loader = new ResourceLoader(async (req) => ({ loaded: true, url: req.url }));
  });

  describe('request management', () => {
    it('adds requests', () => {
      loader.addRequest(makeReq('a'));
      loader.addRequest(makeReq('b'));
      expect(loader.getRequestCount()).toBe(2);
    });
  });

  describe('loadAll', () => {
    it('loads all resources', async () => {
      loader.addRequest(makeReq('a'));
      loader.addRequest(makeReq('b'));
      const results = await loader.loadAll();

      expect(results.length).toBe(2);
      expect(results.every(r => r.status === 'loaded')).toBe(true);
      expect(loader.getLoadedCount()).toBe(2);
    });

    it('respects dependency order', async () => {
      const order: string[] = [];
      const orderedLoader = new ResourceLoader(async (req) => {
        order.push(req.id);
        return {};
      });

      orderedLoader.addRequest(makeReq('child', ['parent']));
      orderedLoader.addRequest(makeReq('parent'));
      await orderedLoader.loadAll();

      expect(order.indexOf('parent')).toBeLessThan(order.indexOf('child'));
    });

    it('propagates dependency failure', async () => {
      const failLoader = new ResourceLoader(async (req) => {
        if (req.id === 'dep') throw new Error('network error');
        return {};
      });

      failLoader.addRequest(makeReq('dep'));
      failLoader.addRequest(makeReq('child', ['dep']));
      const results = await failLoader.loadAll();

      const depResult = results.find(r => r.id === 'dep');
      const childResult = results.find(r => r.id === 'child');
      expect(depResult?.status).toBe('error');
      expect(childResult?.status).toBe('error');
      expect(childResult?.error).toBe('dependency failed');
    });

    it('handles cancelled requests', async () => {
      loader.addRequest(makeReq('a'));
      loader.addRequest(makeReq('b'));
      loader.cancelRequest('a');

      const results = await loader.loadAll();
      const aResult = results.find(r => r.id === 'a');
      expect(aResult?.status).toBe('cancelled');
    });

    it('fires progress callback', async () => {
      const progress = vi.fn();
      loader.addRequest(makeReq('x'));
      loader.onProgress(progress);

      await loader.loadAll();

      expect(progress).toHaveBeenCalledWith(1, 1, 'x');
    });
  });

  describe('queries', () => {
    it('getResult returns loaded result', async () => {
      loader.addRequest(makeReq('r1'));
      await loader.loadAll();
      expect(loader.getResult('r1')?.status).toBe('loaded');
    });

    it('getResult returns undefined before load', () => {
      expect(loader.getResult('nope')).toBeUndefined();
    });
  });
});
