/**
 * RuntimeProfiler Production Tests
 *
 * Frame timing, scopes, percentile, scope stats, control.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { RuntimeProfiler } from '../RuntimeProfiler';

describe('RuntimeProfiler — Production', () => {
  let rp: RuntimeProfiler;

  beforeEach(() => {
    rp = new RuntimeProfiler(100);
  });

  describe('frame lifecycle', () => {
    it('records frame', () => {
      rp.beginFrame();
      rp.endFrame();
      expect(rp.getFrameCount()).toBe(1);
    });

    it('frame has timing', () => {
      rp.beginFrame();
      rp.endFrame();
      const history = rp.getFrameHistory();
      expect(history[0].frameTime).toBeGreaterThanOrEqual(0);
      expect(history[0].fps).toBeGreaterThanOrEqual(0);
    });
  });

  describe('scopes', () => {
    it('records scope in frame', () => {
      rp.beginFrame();
      rp.beginScope('physics');
      rp.endScope();
      rp.endFrame();
      const frame = rp.getFrameHistory()[0];
      expect(frame.scopes).toHaveLength(1);
      expect(frame.scopes[0].name).toBe('physics');
    });

    it('nested scopes', () => {
      rp.beginFrame();
      rp.beginScope('update');
      rp.beginScope('collision');
      rp.endScope();
      rp.endScope();
      rp.endFrame();
      expect(rp.getFrameHistory()[0].scopes[0].children).toHaveLength(1);
    });
  });

  describe('stats', () => {
    it('getAverageFrameTime', () => {
      rp.beginFrame(); rp.endFrame();
      rp.beginFrame(); rp.endFrame();
      expect(rp.getAverageFrameTime()).toBeGreaterThanOrEqual(0);
    });

    it('getPercentile', () => {
      for (let i = 0; i < 10; i++) { rp.beginFrame(); rp.endFrame(); }
      expect(rp.getPercentile(95)).toBeGreaterThanOrEqual(0);
    });

    it('getAverageFPS', () => {
      rp.beginFrame(); rp.endFrame();
      rp.beginFrame(); rp.endFrame();
      expect(rp.getAverageFPS()).toBeGreaterThanOrEqual(0);
    });

    it('getScopeStats', () => {
      rp.beginFrame();
      rp.beginScope('render');
      rp.endScope();
      rp.beginScope('render');
      rp.endScope();
      rp.endFrame();
      const stats = rp.getScopeStats('render');
      expect(stats.count).toBe(2);
    });
  });

  describe('control', () => {
    it('setEnabled disables', () => {
      rp.setEnabled(false);
      expect(rp.isEnabled()).toBe(false);
      rp.beginFrame(); rp.endFrame();
      expect(rp.getFrameCount()).toBe(0);
    });

    it('clear resets', () => {
      rp.beginFrame(); rp.endFrame();
      rp.clear();
      expect(rp.getFrameCount()).toBe(0);
    });
  });
});
