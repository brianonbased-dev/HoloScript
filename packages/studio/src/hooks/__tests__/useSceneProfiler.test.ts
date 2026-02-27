// @vitest-environment jsdom

import { renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useSceneProfiler } from '../useSceneProfiler';
import { useSceneStore, useSceneGraphStore } from '@/lib/store';

vi.mock('@/lib/store', () => ({
  useSceneStore: vi.fn(),
  useSceneGraphStore: vi.fn(),
}));

describe('useSceneProfiler', () => {
  let mockNodes: any[];
  let mockCode: string;

  beforeEach(() => {
    mockNodes = [];
    mockCode = '';

    (useSceneGraphStore as any).mockImplementation((selector: any) => {
      const state = { nodes: mockNodes };
      return selector(state);
    });

    (useSceneStore as any).mockImplementation((selector: any) => {
      const state = { code: mockCode };
      return selector(state);
    });
  });

  describe('Initial State', () => {
    it('should return zero metrics for empty scene', () => {
      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.nodeCount).toBe(0);
      expect(result.current.meshCount).toBe(0);
      expect(result.current.lightCount).toBe(0);
      expect(result.current.audioCount).toBe(0);
      expect(result.current.particleCount).toBe(0);
    });

    it('should have zero trait coverage for empty scene', () => {
      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.traitCoverage).toBe(0);
    });

    it('should have Lightweight label for empty scene', () => {
      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.complexityLabel).toBe('Lightweight');
    });

    it('should suggest adding objects for empty scene', () => {
      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.findings).toContainEqual({
        severity: 'tip',
        message: 'Scene is nearly empty — start adding objects from the palette',
      });
    });
  });

  describe('Node Counting', () => {
    it('should count mesh nodes', () => {
      mockNodes = [
        { type: 'mesh', traits: [] },
        { type: 'mesh', traits: [] },
        { type: 'light', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.meshCount).toBe(2);
      expect(result.current.nodeCount).toBe(3);
    });

    it('should count light nodes', () => {
      mockNodes = [
        { type: 'light', traits: [] },
        { type: 'light', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.lightCount).toBe(2);
    });

    it('should count audio nodes', () => {
      mockNodes = [
        { type: 'audio', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.audioCount).toBe(1);
    });

    it('should count particles from code', () => {
      mockCode = '@particles()\n@particles()';

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.particleCount).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Trait Coverage', () => {
    it('should calculate trait coverage correctly', () => {
      mockNodes = [
        { type: 'mesh', traits: [{ name: 'material' }] },
        { type: 'mesh', traits: [{ name: 'physics' }] },
        { type: 'mesh', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.traitCoverage).toBeCloseTo(2 / 3, 2);
    });

    it('should count total traits', () => {
      mockNodes = [
        { type: 'mesh', traits: [{ name: 'a' }, { name: 'b' }] },
        { type: 'mesh', traits: [{ name: 'c' }] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.traitCount).toBe(3);
    });

    it('should handle nodes without traits array', () => {
      mockNodes = [
        { type: 'mesh' },
        { type: 'mesh', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.traitCount).toBe(0);
    });
  });

  describe('Draw Call Estimation', () => {
    it('should estimate draw calls for meshes', () => {
      mockNodes = [
        { type: 'mesh', traits: [] },
        { type: 'mesh', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.estimatedDrawCalls).toBe(2);
    });

    it('should apply higher weight for splats', () => {
      mockNodes = [
        { type: 'splat', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.estimatedDrawCalls).toBeGreaterThanOrEqual(4);
    });

    it('should multiply shadow lights by mesh count', () => {
      mockNodes = [
        { type: 'mesh', traits: [] },
        { type: 'mesh', traits: [] },
        { type: 'light', traits: [{ properties: { castShadow: true } }] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      // 2 meshes + 0.5 light + (1 shadow light * 2 meshes) = 4.5
      expect(result.current.estimatedDrawCalls).toBeGreaterThanOrEqual(4);
    });
  });

  describe('Complexity Scoring', () => {
    it('should return Lightweight for simple scenes', () => {
      mockNodes = [
        { type: 'mesh', traits: [] },
        { type: 'mesh', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.complexityLabel).toBe('Lightweight');
      expect(result.current.complexityScore).toBeLessThan(25);
    });

    it('should return Moderate for medium complexity', () => {
      mockNodes = Array.from({ length: 25 }, () => ({ type: 'mesh', traits: [] }));

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.complexityLabel).toBe('Moderate');
      expect(result.current.complexityScore).toBeGreaterThanOrEqual(25);
      expect(result.current.complexityScore).toBeLessThan(55);
    });

    it('should return Heavy for complex scenes', () => {
      mockNodes = Array.from({ length: 50 }, () => ({ type: 'mesh', traits: [] }));

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.complexityLabel).toBe('Heavy');
    });

    it('should cap complexity score at 100', () => {
      mockNodes = Array.from({ length: 200 }, () => ({ type: 'mesh', traits: [] }));

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.complexityScore).toBe(100);
    });
  });

  describe('Frame Budget', () => {
    it('should calculate frame budget percentage', () => {
      mockNodes = Array.from({ length: 50 }, () => ({ type: 'mesh', traits: [] }));

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.frameBudgetPercent).toBe(50);
    });

    it('should cap frame budget at 100%', () => {
      mockNodes = Array.from({ length: 200 }, () => ({ type: 'mesh', traits: [] }));

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.frameBudgetPercent).toBe(100);
    });
  });

  describe('Findings - Warnings', () => {
    it('should warn about excessive splats', () => {
      mockNodes = [
        { type: 'splat', traits: [] },
        { type: 'splat', traits: [] },
        { type: 'splat', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.findings).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('Gaussian splats'),
        })
      );
    });

    it('should warn about excessive shadow lights', () => {
      mockNodes = [
        { type: 'mesh', traits: [] },
        { type: 'light', traits: [{ properties: { castShadow: true } }] },
        { type: 'light', traits: [{ properties: { castShadow: true } }] },
        { type: 'light', traits: [{ properties: { castShadow: true } }] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.findings).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('shadow-casting lights'),
        })
      );
    });

    it('should warn about excessive particles', () => {
      mockCode = '@particles @particles @particles @particles';

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.findings).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          message: expect.stringContaining('particle systems'),
        })
      );
    });
  });

  describe('Findings - Errors', () => {
    it('should error on excessive node count', () => {
      mockNodes = Array.from({ length: 51 }, () => ({ type: 'mesh', traits: [] }));

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.findings).toContainEqual(
        expect.objectContaining({
          severity: 'error',
          message: expect.stringContaining('scene nodes'),
        })
      );
    });
  });

  describe('Findings - Tips', () => {
    it('should tip about low trait coverage', () => {
      mockNodes = [
        { type: 'mesh', traits: [] },
        { type: 'mesh', traits: [] },
        { type: 'mesh', traits: [] },
        { type: 'mesh', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.findings).toContainEqual(
        expect.objectContaining({
          severity: 'tip',
          message: expect.stringContaining('Low trait coverage'),
        })
      );
    });

    it('should tip about excessive lights', () => {
      mockNodes = [
        { type: 'light', traits: [] },
        { type: 'light', traits: [] },
        { type: 'light', traits: [] },
        { type: 'light', traits: [] },
        { type: 'light', traits: [] },
      ];

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.findings).toContainEqual(
        expect.objectContaining({
          severity: 'tip',
          message: expect.stringContaining('lights'),
        })
      );
    });
  });

  describe('Edge Cases', () => {
    it('should handle null code', () => {
      (useSceneStore as any).mockImplementation((selector: any) => {
        const state = { code: null };
        return selector(state);
      });

      const { result } = renderHook(() => useSceneProfiler());

      expect(result.current.particleCount).toBe(0);
    });

    it('should memoize when dependencies do not change', () => {
      mockNodes = [{ type: 'mesh', traits: [] }];

      const { result, rerender } = renderHook(() => useSceneProfiler());

      const firstResult = result.current;

      rerender();

      expect(result.current).toBe(firstResult);
    });
  });
});
