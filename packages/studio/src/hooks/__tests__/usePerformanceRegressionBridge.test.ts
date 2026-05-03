// @vitest-environment jsdom

import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks (vi.hoisted for hoisted factory references) ────────────────────────

const { mockUsePerformanceRegression, mockUpdateNode, mockSetGeometricViewMode, mockSetGeometricPipelineTransitioning, mockEmit, mockNodes } = vi.hoisted(() => {
  const mockUsePerformanceRegression = vi.fn();
  const mockUpdateNode = vi.fn();
  const mockSetGeometricViewMode = vi.fn();
  const mockSetGeometricPipelineTransitioning = vi.fn();
  const mockEmit = vi.fn();
  const mockNodes: Array<{ id: string; type: string; assetMaturity?: string }> = [];
  return {
    mockUsePerformanceRegression,
    mockUpdateNode,
    mockSetGeometricViewMode,
    mockSetGeometricPipelineTransitioning,
    mockEmit,
    mockNodes,
  };
});

vi.mock('@holoscript/r3f-renderer', () => ({
  usePerformanceRegression: mockUsePerformanceRegression,
  ProgressiveLoader: vi.fn(() => null),
}));

vi.mock('@/lib/stores', () => ({
  useEditorStore: Object.assign(
    vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        setGeometricViewMode: mockSetGeometricViewMode,
        setGeometricPipelineTransitioning: mockSetGeometricPipelineTransitioning,
      })
    ),
    { getState: vi.fn() }
  ),
  useSceneGraphStore: Object.assign(
    vi.fn((selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        updateNode: mockUpdateNode,
        nodes: mockNodes,
      })
    ),
    {
      getState: vi.fn(() => ({
        nodes: mockNodes,
      })),
    }
  ),
  useSceneStore: vi.fn(() => ({})),
}));

vi.mock('@/hooks/useStudioBus', () => ({
  useStudioBus: () => ({ emit: mockEmit, on: vi.fn(), off: vi.fn() }),
}));

// ── Import after mocks ──────────────────────────────────────────────────────

import { usePerformanceRegressionBridge } from '../usePerformanceRegressionBridge';

// ── Helpers ──────────────────────────────────────────────────────────────────

function defaultPerfResult(overrides = {}) {
  return {
    isRegressed: false,
    avgFrameTimeMs: 5.0,
    regressionCount: 0,
    recoveryCount: 0,
    forceRegress: vi.fn(),
    forceRecover: vi.fn(),
    reset: vi.fn(),
    ...overrides,
  };
}

describe('usePerformanceRegressionBridge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockNodes.length = 0;
    mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());
  });

  describe('initial state', () => {
    it('should return perf result and bridge state when not regressed', () => {
      mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());

      const { result } = renderHook(() => usePerformanceRegressionBridge());

      expect(result.current.isRegressed).toBe(false);
      expect(result.current.avgFrameTimeMs).toBe(5.0);
      expect(result.current.isAutoRegressed).toBe(false);
      expect(result.current.regressedNodeCount).toBe(0);
    });

    it('should pass config options to usePerformanceRegression', () => {
      renderHook(() =>
        usePerformanceRegressionBridge({
          thresholdMs: 11.0,
          consecutiveFrames: 10,
          recoveryFrames: 60,
        })
      );

      expect(mockUsePerformanceRegression).toHaveBeenCalledWith(
        expect.objectContaining({
          thresholdMs: 11.0,
          consecutiveFrames: 10,
          recoveryFrames: 60,
        })
      );
    });
  });

  describe('regression behavior', () => {
    it('should batch-update all mesh nodes to draft maturity on regression', () => {
      mockNodes.push(
        { id: 'mesh-1', type: 'mesh', assetMaturity: 'mesh' },
        { id: 'mesh-2', type: 'mesh', assetMaturity: 'final' },
        { id: 'light-1', type: 'directionalLight' }
      );

      const onRegression = vi.fn();
      mockUsePerformanceRegression.mockImplementation((opts) => {
        // Simulate regression callback
        if (opts?.onRegression) {
          // Store for manual invocation
          onRegression.mockImplementation(() => opts.onRegression(true));
        }
        return defaultPerfResult();
      });

      renderHook(() => usePerformanceRegressionBridge());

      // Find the onRegression callback passed to usePerformanceRegression
      const callArgs = mockUsePerformanceRegression.mock.calls[0][0];
      expect(callArgs.onRegression).toBeDefined();

      // Simulate regression transition
      act(() => {
        callArgs.onRegression(true);
      });

      // Only mesh nodes should be updated to draft (not lights)
      expect(mockUpdateNode).toHaveBeenCalledTimes(2);
      expect(mockUpdateNode).toHaveBeenCalledWith('mesh-1', { assetMaturity: 'draft' });
      expect(mockUpdateNode).toHaveBeenCalledWith('mesh-2', { assetMaturity: 'draft' });
    });

    it('should set geometricViewMode to draft on regression when syncViewMode is true', () => {
      mockNodes.push({ id: 'mesh-1', type: 'mesh' });

      mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());

      renderHook(() =>
        usePerformanceRegressionBridge({ syncViewMode: true })
      );

      const callArgs = mockUsePerformanceRegression.mock.calls[0][0];

      act(() => {
        callArgs.onRegression(true);
      });

      expect(mockSetGeometricViewMode).toHaveBeenCalledWith('draft');
    });

    it('should NOT set geometricViewMode when syncViewMode is false', () => {
      mockNodes.push({ id: 'mesh-1', type: 'mesh' });

      mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());

      renderHook(() =>
        usePerformanceRegressionBridge({ syncViewMode: false })
      );

      const callArgs = mockUsePerformanceRegression.mock.calls[0][0];

      act(() => {
        callArgs.onRegression(true);
      });

      expect(mockSetGeometricViewMode).not.toHaveBeenCalled();
    });

    it('should emit performance:regress event on regression', () => {
      mockNodes.push({ id: 'mesh-1', type: 'mesh' });

      mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());

      renderHook(() => usePerformanceRegressionBridge());

      const callArgs = mockUsePerformanceRegression.mock.calls[0][0];

      act(() => {
        callArgs.onRegression(true);
      });

      expect(mockEmit).toHaveBeenCalledWith(
        'performance:regress',
        expect.objectContaining({
          nodeCount: 1,
          thresholdMs: 9.0,
        })
      );
    });
  });

  describe('recovery behavior', () => {
    it('should restore previous maturity levels on recovery', () => {
      // Set up nodes with known maturity levels
      mockNodes.push(
        { id: 'mesh-1', type: 'mesh', assetMaturity: 'mesh' },
        { id: 'mesh-2', type: 'mesh', assetMaturity: 'final' },
        { id: 'mesh-3', type: 'mesh' } // undefined maturity
      );

      mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());

      // debounceMs=0 allows immediate recovery after regression in tests
      renderHook(() => usePerformanceRegressionBridge({ debounceMs: 0 }));

      const callArgs = mockUsePerformanceRegression.mock.calls[0][0];

      // First: regress
      act(() => {
        callArgs.onRegression(true);
      });

      mockUpdateNode.mockClear();

      // Then: recover
      act(() => {
        callArgs.onRegression(false);
      });

      // mesh-1 → mesh (was 'mesh'), mesh-2 → final (was 'final'), mesh-3 → mesh (was undefined)
      expect(mockUpdateNode).toHaveBeenCalledWith('mesh-1', { assetMaturity: 'mesh' });
      expect(mockUpdateNode).toHaveBeenCalledWith('mesh-2', { assetMaturity: 'final' });
      expect(mockUpdateNode).toHaveBeenCalledWith('mesh-3', { assetMaturity: 'mesh' });
    });

    it('should set geometricViewMode to mesh on recovery', () => {
      mockNodes.push({ id: 'mesh-1', type: 'mesh', assetMaturity: 'mesh' });

      mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());

      // debounceMs=0 allows immediate recovery after regression in tests
      renderHook(() =>
        usePerformanceRegressionBridge({ syncViewMode: true, debounceMs: 0 })
      );

      const callArgs = mockUsePerformanceRegression.mock.calls[0][0];

      // Regress then recover
      act(() => {
        callArgs.onRegression(true);
      });
      act(() => {
        callArgs.onRegression(false);
      });

      // Should have been called with 'draft' during regression
      // and 'mesh' during recovery
      expect(mockSetGeometricViewMode).toHaveBeenCalledWith('draft');
      expect(mockSetGeometricViewMode).toHaveBeenCalledWith('mesh');
    });

    it('should emit performance:recover event on recovery', () => {
      mockNodes.push({ id: 'mesh-1', type: 'mesh', assetMaturity: 'mesh' });

      mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());

      // debounceMs=0 allows immediate recovery after regression in tests
      renderHook(() => usePerformanceRegressionBridge({ debounceMs: 0 }));

      const callArgs = mockUsePerformanceRegression.mock.calls[0][0];

      act(() => {
        callArgs.onRegression(true);
      });

      mockEmit.mockClear();

      act(() => {
        callArgs.onRegression(false);
      });

      expect(mockEmit).toHaveBeenCalledWith(
        'performance:recover',
        expect.objectContaining({
          nodeCount: 1,
          recoveryThresholdMs: 7.0,
        })
      );
    });
  });

  describe('debounce', () => {
    it('should debounce rapid regression/recovery toggles', () => {
      mockNodes.push({ id: 'mesh-1', type: 'mesh' });

      mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());

      renderHook(() =>
        usePerformanceRegressionBridge({ debounceMs: 500 })
      );

      const callArgs = mockUsePerformanceRegression.mock.calls[0][0];

      // First regression: should fire
      act(() => {
        callArgs.onRegression(true);
      });

      expect(mockUpdateNode).toHaveBeenCalledTimes(1);

      // Immediate second call: should be debounced
      act(() => {
        callArgs.onRegression(false);
      });

      // Should NOT have been called again (within debounce window)
      expect(mockUpdateNode).toHaveBeenCalledTimes(1);
    });
  });

  describe('skip non-mesh nodes', () => {
    it('should not regress lights, groups, or other non-mesh types', () => {
      mockNodes.push(
        { id: 'light-1', type: 'directionalLight' },
        { id: 'light-2', type: 'ambientLight' },
        { id: 'group-1', type: 'group' },
        { id: 'splat-1', type: 'splat' },
        { id: 'mesh-1', type: 'mesh', assetMaturity: 'mesh' }
      );

      mockUsePerformanceRegression.mockReturnValue(defaultPerfResult());

      renderHook(() => usePerformanceRegressionBridge());

      const callArgs = mockUsePerformanceRegression.mock.calls[0][0];

      act(() => {
        callArgs.onRegression(true);
      });

      // Only mesh-1 should be updated
      expect(mockUpdateNode).toHaveBeenCalledTimes(1);
      expect(mockUpdateNode).toHaveBeenCalledWith('mesh-1', { assetMaturity: 'draft' });
    });
  });
});