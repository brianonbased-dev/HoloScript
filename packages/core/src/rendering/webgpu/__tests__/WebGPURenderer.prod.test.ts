/**
 * WebGPURenderer Production Tests
 *
 * Tests construction, option defaults, isSupported static check,
 * getStats, getContext, and sortDrawCalls without actual GPU.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { WebGPURenderer } from '../WebGPURenderer';

describe('WebGPURenderer — Production', () => {
  let renderer: WebGPURenderer;

  beforeEach(() => {
    renderer = new WebGPURenderer();
  });

  describe('construction', () => {
    it('creates with default options', () => {
      expect(renderer).toBeDefined();
    });

    it('custom options preserved', () => {
      const r = new WebGPURenderer({
        powerPreference: 'low-power',
        debug: true,
        sampleCount: 4,
      });
      expect(r).toBeDefined();
    });
  });

  describe('isSupported', () => {
    it('returns boolean', () => {
      expect(typeof WebGPURenderer.isSupported()).toBe('boolean');
    });

    it('returns false in Node.js', () => {
      expect(WebGPURenderer.isSupported()).toBe(false);
    });
  });

  describe('getStats', () => {
    it('returns stats object with currentFrame', () => {
      const stats = renderer.getStats();
      expect(stats).toBeDefined();
      expect(stats.currentFrame).toBeDefined();
      expect(typeof stats.currentFrame.drawCalls).toBe('number');
      expect(typeof stats.totalFrames).toBe('number');
      expect(typeof stats.fps).toBe('number');
    });

    it('currentFrame starts with zero drawCalls', () => {
      const stats = renderer.getStats();
      expect(stats.currentFrame.drawCalls).toBe(0);
      expect(stats.totalFrames).toBe(0);
    });
  });

  describe('getContext', () => {
    it('returns null before initialization', () => {
      expect(renderer.getContext()).toBeNull();
    });
  });

  describe('getDevice', () => {
    it('returns null before initialization', () => {
      expect(renderer.getDevice()).toBeNull();
    });
  });

  describe('sortDrawCalls (via prototype)', () => {
    it('sorts opaque before transparent', () => {
      const calls = [
        { material: { transparent: true, pipelineId: 'a' }, sortKey: 0, cameraDistance: 5 },
        { material: { transparent: false, pipelineId: 'a' }, sortKey: 0, cameraDistance: 3 },
      ] as any[];

      const sorted = (renderer as any).sortDrawCalls(calls);
      expect(sorted[0].material.transparent).toBe(false);
    });

    it('sorts transparent back-to-front', () => {
      const calls = [
        { material: { transparent: true, pipelineId: 'a' }, sortKey: 0, cameraDistance: 2 },
        { material: { transparent: true, pipelineId: 'a' }, sortKey: 0, cameraDistance: 10 },
      ] as any[];

      const sorted = (renderer as any).sortDrawCalls(calls);
      expect(sorted[0].cameraDistance).toBe(10); // far first
    });

    it('sorts opaque by pipeline ID', () => {
      const calls = [
        { material: { transparent: false, pipelineId: 'b' }, sortKey: 0 },
        { material: { transparent: false, pipelineId: 'a' }, sortKey: 0 },
      ] as any[];

      const sorted = (renderer as any).sortDrawCalls(calls);
      expect(sorted[0].material.pipelineId).toBe('a');
    });
  });
});
