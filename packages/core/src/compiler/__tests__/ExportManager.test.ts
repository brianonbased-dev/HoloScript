/**
 * ExportManager Test Suite
 *
 * Comprehensive unit tests for the ExportManager covering:
 * - Constructor defaults and configuration
 * - Single target export with circuit breaker
 * - Fallback to reference exporters on failure
 * - Batch export with mixed results
 * - Event listener registration, emission, and removal
 * - Memory monitoring integration
 * - Singleton lifecycle (getExportManager / resetExportManager)
 * - Convenience functions (exportComposition / batchExportComposition)
 * - Metrics retrieval and circuit reset
 * - Dispose cleanup
 *
 * @version 1.0.0
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  ExportManager,
  getExportManager,
  resetExportManager,
  exportComposition,
  batchExportComposition,
  type ExportOptions,
  type ExportResult,
  type ExportEvent,
  type ExportEventType,
} from '../ExportManager';
import { CircuitState, type ExportTarget, type CircuitMetrics } from '../CircuitBreaker';

// =============================================================================
// MOCKS — all mock variables must be declared with vi.hoisted() so they are
// available when vi.mock() factories execute (vi.mock is hoisted above imports)
// =============================================================================

const {
  mockDispose,
  mockCaptureMemoryStats,
  mockSetAST,
  mockCheckMemoryStatus,
  mockSetIncrementalCompiler,
  mockGetMetrics,
  mockExecute,
  mockGetBreaker,
  mockGetAggregatedMetrics,
  mockReset,
  mockResetAll,
  mockRefExport,
  mockHasExporter,
} = vi.hoisted(() => {
  const mockDispose = vi.fn();
  const mockCaptureMemoryStats = vi.fn().mockReturnValue({
    timestamp: Date.now(),
    heapUsed: 100_000,
    heapTotal: 200_000,
    external: 5_000,
    rss: 300_000,
    ramUtilization: 0.5,
    astSizeBytes: 10_000,
    astNodeCount: 500,
    symbolTableSizeBytes: 2_000,
    symbolTableEntryCount: 50,
  });
  const mockSetAST = vi.fn();
  const mockCheckMemoryStatus = vi.fn();
  const mockSetIncrementalCompiler = vi.fn();

  const mockGetMetrics = vi.fn().mockReturnValue({
    target: 'urdf',
    state: 'CLOSED',
    failureCount: 0,
    successCount: 0,
    totalRequests: 0,
    failedRequests: 0,
    successfulRequests: 0,
    lastFailureTime: null,
    lastSuccessTime: null,
    circuitOpenTime: null,
    circuitCloseTime: null,
    timeInDegradedMode: 0,
    failureRate: 0,
    fallbackInvocations: 0,
    lastError: null,
  });

  const mockExecute = vi.fn().mockResolvedValue({
    success: true,
    data: '<compiled output>',
    usedFallback: false,
    state: 'CLOSED',
    metrics: mockGetMetrics(),
  });

  const mockGetBreaker = vi.fn().mockReturnValue({
    execute: mockExecute,
    getMetrics: mockGetMetrics,
    getState: vi.fn().mockReturnValue('CLOSED'),
    reset: vi.fn(),
  });

  const mockGetAggregatedMetrics = vi.fn().mockReturnValue({
    totalTargets: 0,
    closedCircuits: 0,
    openCircuits: 0,
    halfOpenCircuits: 0,
    totalFailures: 0,
    totalSuccesses: 0,
    averageFailureRate: 0,
    targets: {},
  });

  const mockReset = vi.fn();
  const mockResetAll = vi.fn();
  const mockRefExport = vi.fn().mockReturnValue(null);
  const mockHasExporter = vi.fn().mockReturnValue(false);

  return {
    mockDispose,
    mockCaptureMemoryStats,
    mockSetAST,
    mockCheckMemoryStatus,
    mockSetIncrementalCompiler,
    mockGetMetrics,
    mockExecute,
    mockGetBreaker,
    mockGetAggregatedMetrics,
    mockReset,
    mockResetAll,
    mockRefExport,
    mockHasExporter,
  };
});

// Mock all compiler imports — use `function` (not arrow) so `new` works in CompilerFactory
vi.mock('../URDFCompiler', () => ({
  URDFCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../SDFCompiler', () => ({
  SDFCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../UnityCompiler', () => ({
  UnityCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../UnrealCompiler', () => ({
  UnrealCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../GodotCompiler', () => ({
  GodotCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../WebGPUCompiler', () => ({
  WebGPUCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../R3FCompiler', () => ({
  R3FCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../BabylonCompiler', () => ({
  BabylonCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../OpenXRCompiler', () => ({
  OpenXRCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../VRChatCompiler', () => ({
  VRChatCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../IOSCompiler', () => ({
  IOSCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../AndroidCompiler', () => ({
  AndroidCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../AndroidXRCompiler', () => ({
  AndroidXRCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../VisionOSCompiler', () => ({
  VisionOSCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../WASMCompiler', () => ({
  WASMCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../DTDLCompiler', () => ({
  DTDLCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../PlayCanvasCompiler', () => ({
  PlayCanvasCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../VRRCompiler', () => ({
  VRRCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../ARCompiler', () => ({
  ARCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../MultiLayerCompiler', () => ({
  MultiLayerCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../IncrementalCompiler', () => ({
  IncrementalCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../StateCompiler', () => ({
  StateCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../TraitCompositionCompiler', () => ({
  TraitCompositionCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));
vi.mock('../TSLCompiler', () => ({
  TSLCompiler: vi.fn().mockImplementation(function () {
    return { compile: vi.fn().mockResolvedValue('<compiled output>') };
  }),
}));

// Mock CompilerStateMonitor — use `function` (not arrow) so `new` works
vi.mock('../CompilerStateMonitor', () => ({
  CompilerStateMonitor: vi.fn().mockImplementation(function () {
    return {
      dispose: mockDispose,
      captureMemoryStats: mockCaptureMemoryStats,
      setAST: mockSetAST,
      checkMemoryStatus: mockCheckMemoryStatus,
      setIncrementalCompiler: mockSetIncrementalCompiler,
    };
  }),
  createCompilerStateMonitor: vi.fn().mockImplementation(function () {
    return {
      dispose: mockDispose,
      captureMemoryStats: mockCaptureMemoryStats,
      setAST: mockSetAST,
      checkMemoryStatus: mockCheckMemoryStatus,
      setIncrementalCompiler: mockSetIncrementalCompiler,
    };
  }),
}));

// Mock CircuitBreaker and Registry — use `function` (not arrow) so `new` works
vi.mock('../CircuitBreaker', () => ({
  CircuitState: {
    CLOSED: 'CLOSED',
    OPEN: 'OPEN',
    HALF_OPEN: 'HALF_OPEN',
  },
  CircuitBreaker: vi.fn(),
  CircuitBreakerRegistry: vi.fn().mockImplementation(function () {
    return {
      getBreaker: mockGetBreaker,
      getAggregatedMetrics: mockGetAggregatedMetrics,
      reset: mockReset,
      resetAll: mockResetAll,
    };
  }),
}));

// Mock ReferenceExporterRegistry — use `function` (not arrow) so `new` works
vi.mock('../ReferenceExporters', () => ({
  ReferenceExporterRegistry: vi.fn().mockImplementation(function () {
    return {
      export: mockRefExport,
      hasExporter: mockHasExporter,
    };
  }),
}));

// =============================================================================
// HELPERS
// =============================================================================

function createMockComposition(name = 'TestScene') {
  return {
    type: 'Composition' as const,
    name,
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('ExportManager', () => {
  let manager: ExportManager;
  const composition = createMockComposition();

  beforeEach(() => {
    vi.clearAllMocks();
    resetExportManager();
    manager = new ExportManager();
  });

  afterEach(() => {
    manager.dispose();
  });

  // ---------------------------------------------------------------------------
  // Constructor
  // ---------------------------------------------------------------------------

  describe('Constructor', () => {
    it('should create instance with default options', () => {
      const mgr = new ExportManager();
      expect(mgr).toBeDefined();
      expect(mgr.getMemoryMonitor()).toBeDefined();
      mgr.dispose();
    });

    it('should accept partial options and fill defaults', () => {
      const mgr = new ExportManager({ useCircuitBreaker: false, throwOnError: true });
      expect(mgr).toBeDefined();
      mgr.dispose();
    });

    it('should not create memory monitor when useMemoryMonitoring is false', () => {
      const mgr = new ExportManager({ useMemoryMonitoring: false });
      expect(mgr.getMemoryMonitor()).toBeNull();
      mgr.dispose();
    });

    it('should create memory monitor by default', () => {
      const mgr = new ExportManager();
      expect(mgr.getMemoryMonitor()).not.toBeNull();
      mgr.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // getSupportedTargets
  // ---------------------------------------------------------------------------

  describe('getSupportedTargets()', () => {
    it('should return all 25+ supported targets', () => {
      const targets = manager.getSupportedTargets();
      expect(targets.length).toBeGreaterThanOrEqual(25);
    });

    it('should include essential robotics targets', () => {
      const targets = manager.getSupportedTargets();
      expect(targets).toContain('urdf');
      expect(targets).toContain('sdf');
    });

    it('should include game engine targets', () => {
      const targets = manager.getSupportedTargets();
      expect(targets).toContain('unity');
      expect(targets).toContain('unreal');
      expect(targets).toContain('godot');
    });

    it('should include web targets', () => {
      const targets = manager.getSupportedTargets();
      expect(targets).toContain('webgpu');
      expect(targets).toContain('r3f');
      expect(targets).toContain('babylon');
      expect(targets).toContain('wasm');
    });

    it('should include XR/mobile targets', () => {
      const targets = manager.getSupportedTargets();
      expect(targets).toContain('openxr');
      expect(targets).toContain('vrchat');
      expect(targets).toContain('ios');
      expect(targets).toContain('android');
      expect(targets).toContain('android-xr');
      expect(targets).toContain('visionos');
      expect(targets).toContain('ar');
    });

    it('should include advanced compilation targets', () => {
      const targets = manager.getSupportedTargets();
      expect(targets).toContain('multi-layer');
      expect(targets).toContain('incremental');
      expect(targets).toContain('state');
      expect(targets).toContain('trait-composition');
      expect(targets).toContain('tsl');
    });
  });

  // ---------------------------------------------------------------------------
  // export() — success path with circuit breaker
  // ---------------------------------------------------------------------------

  describe('export() — success with circuit breaker', () => {
    it('should return successful ExportResult when compiler succeeds', async () => {
      const result = await manager.export('urdf', composition);

      expect(result.target).toBe('urdf');
      expect(result.success).toBe(true);
      expect(result.output).toBe('<compiled output>');
      expect(result.usedFallback).toBe(false);
      expect(result.circuitState).toBe(CircuitState.CLOSED);
      expect(result.warnings).toEqual([]);
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should include memory stats when monitoring is enabled', async () => {
      const result = await manager.export('urdf', composition);

      expect(result.memoryStats).toBeDefined();
      expect(result.memoryStats!.heapUsed).toBe(100_000);
    });

    it('should call memory monitor setAST and checkMemoryStatus', async () => {
      await manager.export('urdf', composition);

      expect(mockSetAST).toHaveBeenCalledWith(composition);
      expect(mockCheckMemoryStatus).toHaveBeenCalled();
    });

    it('should emit export:start event', async () => {
      const listener = vi.fn();
      manager.on('export:start', listener);

      await manager.export('urdf', composition);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as ExportEvent;
      expect(event.type).toBe('export:start');
      expect(event.target).toBe('urdf');
      expect(event.data.composition).toBe('TestScene');
    });

    it('should emit export:success event on success', async () => {
      const listener = vi.fn();
      manager.on('export:success', listener);

      await manager.export('urdf', composition);

      expect(listener).toHaveBeenCalledTimes(1);
      const event = listener.mock.calls[0][0] as ExportEvent;
      expect(event.type).toBe('export:success');
      expect(event.target).toBe('urdf');
    });

    it('should pass compiler options through to factory', async () => {
      await manager.export('urdf', composition, {
        compilerOptions: { pretty: true },
      });

      // The circuit breaker's execute was called, so the compiler was invoked
      expect(mockExecute).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // export() — without circuit breaker
  // ---------------------------------------------------------------------------

  describe('export() — without circuit breaker (direct)', () => {
    it('should compile directly when useCircuitBreaker is false', async () => {
      const result = await manager.export('urdf', composition, {
        useCircuitBreaker: false,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('<compiled output>');
      expect(result.usedFallback).toBe(false);
    });

    it('should include memory stats in direct export', async () => {
      const result = await manager.export('urdf', composition, {
        useCircuitBreaker: false,
      });

      expect(result.memoryStats).toBeDefined();
    });

    it('should try fallback on direct export failure when useFallback is true', async () => {
      const { URDFCompiler } = await import('../URDFCompiler');
      (URDFCompiler as any).mockImplementationOnce(() => ({
        compile: vi.fn().mockRejectedValue(new Error('Compiler crash')),
      }));
      mockRefExport.mockReturnValueOnce({
        target: 'urdf',
        output: '<fallback output>',
        format: 'xml',
        warnings: ['Fallback used'],
        usedFallback: true,
      });

      const result = await manager.export('urdf', composition, {
        useCircuitBreaker: false,
        useFallback: true,
      });

      expect(result.success).toBe(true);
      expect(result.output).toBe('<fallback output>');
      expect(result.usedFallback).toBe(true);
      expect(result.warnings).toContain('Fallback used');
    });

    it('should throw when direct export fails with no fallback and throwOnError', async () => {
      const { URDFCompiler } = await import('../URDFCompiler');
      (URDFCompiler as any).mockImplementationOnce(() => ({
        compile: vi.fn().mockRejectedValue(new Error('Compiler crash')),
      }));
      mockRefExport.mockReturnValueOnce(null);

      await expect(
        manager.export('urdf', composition, {
          useCircuitBreaker: false,
          useFallback: false,
          throwOnError: true,
        })
      ).rejects.toThrow('Compiler crash');
    });
  });

  // ---------------------------------------------------------------------------
  // export() — failure and fallback
  // ---------------------------------------------------------------------------

  describe('export() — failure and fallback', () => {
    it('should use fallback when circuit breaker reports failure with fallback', async () => {
      mockExecute.mockResolvedValueOnce({
        success: true,
        data: '<fallback output>',
        usedFallback: true,
        state: CircuitState.OPEN,
        metrics: mockGetMetrics(),
      });

      const result = await manager.export('urdf', composition);

      expect(result.success).toBe(true);
      expect(result.usedFallback).toBe(true);
    });

    it('should return error result when circuit breaker and fallback both fail', async () => {
      mockExecute.mockResolvedValueOnce({
        success: false,
        error: new Error('Both failed'),
        usedFallback: true,
        state: CircuitState.OPEN,
        metrics: mockGetMetrics(),
      });

      const result = await manager.export('urdf', composition);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Both failed');
    });

    it('should return error result without throwing when throwOnError is false', async () => {
      // Force an error from the top-level try/catch in export()
      mockGetBreaker.mockImplementationOnce(() => {
        throw new Error('Registry explosion');
      });

      const mgr = new ExportManager({ throwOnError: false });
      // Since getBreaker throws before execute is called, this is caught at the outer level
      // But note: the outer catch also calls getBreaker for metrics —
      // mockGetBreaker was restored so second call succeeds
      const result = await mgr.export('urdf', composition);

      expect(result.success).toBe(false);
      expect(result.error?.message).toBe('Registry explosion');
      mgr.dispose();
    });

    it('should throw when throwOnError is true and export fails at top level', async () => {
      mockGetBreaker.mockImplementationOnce(() => {
        throw new Error('Fatal error');
      });

      // Subsequent calls to getBreaker (in the catch block) should work normally
      const mgr = new ExportManager({ throwOnError: true });

      await expect(mgr.export('urdf', composition)).rejects.toThrow('Fatal error');
      mgr.dispose();
    });
  });

  // ---------------------------------------------------------------------------
  // batchExport()
  // ---------------------------------------------------------------------------

  describe('batchExport()', () => {
    it('should export to multiple targets in parallel', async () => {
      const targets: ExportTarget[] = ['urdf', 'sdf', 'unity'];
      const result = await manager.batchExport(targets, composition);

      expect(result.targets).toEqual(targets);
      expect(result.results).toHaveLength(3);
      expect(result.successCount).toBe(3);
      expect(result.failureCount).toBe(0);
      expect(result.fallbackCount).toBe(0);
      expect(result.totalTime).toBeGreaterThanOrEqual(0);
    });

    it('should count mixed success/failure results correctly', async () => {
      // First call succeeds, second fails, third uses fallback
      mockExecute
        .mockResolvedValueOnce({
          success: true,
          data: '<output1>',
          usedFallback: false,
          state: CircuitState.CLOSED,
          metrics: mockGetMetrics(),
        })
        .mockResolvedValueOnce({
          success: false,
          error: new Error('SDF failed'),
          usedFallback: false,
          state: CircuitState.OPEN,
          metrics: mockGetMetrics(),
        })
        .mockResolvedValueOnce({
          success: true,
          data: '<fallback>',
          usedFallback: true,
          state: CircuitState.HALF_OPEN,
          metrics: mockGetMetrics(),
        });

      const targets: ExportTarget[] = ['urdf', 'sdf', 'unity'];
      const result = await manager.batchExport(targets, composition);

      expect(result.successCount).toBe(2);
      expect(result.failureCount).toBe(1);
      expect(result.fallbackCount).toBe(1);
    });

    it('should include aggregated metrics', async () => {
      mockGetAggregatedMetrics.mockReturnValueOnce({
        totalTargets: 2,
        closedCircuits: 2,
        openCircuits: 0,
        halfOpenCircuits: 0,
        totalFailures: 0,
        totalSuccesses: 2,
        averageFailureRate: 0,
        targets: {},
      });

      const result = await manager.batchExport(['urdf', 'sdf'], composition);

      expect(result.aggregatedMetrics.totalTargets).toBe(2);
      expect(result.aggregatedMetrics.closedCircuits).toBe(2);
    });

    it('should handle empty target list', async () => {
      const result = await manager.batchExport([], composition);

      expect(result.targets).toEqual([]);
      expect(result.results).toHaveLength(0);
      expect(result.successCount).toBe(0);
      expect(result.failureCount).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // Event system: on(), off(), emitEvent()
  // ---------------------------------------------------------------------------

  describe('Event system', () => {
    it('should register and invoke a listener for export:start', async () => {
      const listener = vi.fn();
      manager.on('export:start', listener);

      await manager.export('urdf', composition);

      expect(listener).toHaveBeenCalledTimes(1);
    });

    it('should register multiple listeners for the same event type', async () => {
      const listener1 = vi.fn();
      const listener2 = vi.fn();
      manager.on('export:start', listener1);
      manager.on('export:start', listener2);

      await manager.export('urdf', composition);

      expect(listener1).toHaveBeenCalledTimes(1);
      expect(listener2).toHaveBeenCalledTimes(1);
    });

    it('should remove a listener with off()', async () => {
      const listener = vi.fn();
      manager.on('export:start', listener);
      manager.off('export:start', listener);

      await manager.export('urdf', composition);

      expect(listener).not.toHaveBeenCalled();
    });

    it('should not throw when removing listener that was never registered', () => {
      const listener = vi.fn();
      expect(() => manager.off('export:start', listener)).not.toThrow();
    });

    it('should pass correct event data to listeners', async () => {
      const events: ExportEvent[] = [];
      manager.on('export:start', (e) => events.push(e));
      manager.on('export:success', (e) => events.push(e));

      await manager.export('sdf', composition);

      const startEvent = events.find((e) => e.type === 'export:start');
      expect(startEvent).toBeDefined();
      expect(startEvent!.target).toBe('sdf');
      expect(startEvent!.timestamp).toBeGreaterThan(0);

      const successEvent = events.find((e) => e.type === 'export:success');
      expect(successEvent).toBeDefined();
      expect(successEvent!.target).toBe('sdf');
    });

    it('should not crash if a listener throws', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const badListener = vi.fn().mockImplementation(() => {
        throw new Error('listener error');
      });
      manager.on('export:start', badListener);

      // Should not throw
      await expect(manager.export('urdf', composition)).resolves.toBeDefined();

      errorSpy.mockRestore();
    });

    it('should support all event types', () => {
      const eventTypes: ExportEventType[] = [
        'export:start',
        'export:success',
        'export:failure',
        'export:fallback',
        'circuit:open',
        'circuit:close',
        'circuit:half-open',
      ];

      for (const type of eventTypes) {
        const listener = vi.fn();
        expect(() => manager.on(type, listener)).not.toThrow();
        expect(() => manager.off(type, listener)).not.toThrow();
      }
    });
  });

  // ---------------------------------------------------------------------------
  // dispose()
  // ---------------------------------------------------------------------------

  describe('dispose()', () => {
    it('should clear event listeners', async () => {
      const listener = vi.fn();
      manager.on('export:start', listener);

      manager.dispose();

      // After dispose, listeners should be cleared
      await manager.export('urdf', composition);
      expect(listener).not.toHaveBeenCalled();
    });

    it('should dispose memory monitor', () => {
      manager.dispose();
      expect(mockDispose).toHaveBeenCalled();
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        manager.dispose();
        manager.dispose();
      }).not.toThrow();
    });
  });

  // ---------------------------------------------------------------------------
  // getMetrics() / getAllMetrics()
  // ---------------------------------------------------------------------------

  describe('Metrics', () => {
    it('should return metrics for a specific target via getMetrics()', () => {
      const metrics = manager.getMetrics('urdf');
      expect(metrics).toBeDefined();
      expect(metrics.target).toBe('urdf');
      expect(metrics.state).toBe(CircuitState.CLOSED);
    });

    it('should return aggregated metrics via getAllMetrics()', () => {
      const metrics = manager.getAllMetrics();
      expect(metrics).toBeDefined();
      expect(metrics).toHaveProperty('totalTargets');
      expect(metrics).toHaveProperty('closedCircuits');
      expect(metrics).toHaveProperty('openCircuits');
    });
  });

  // ---------------------------------------------------------------------------
  // resetCircuit() / resetAllCircuits()
  // ---------------------------------------------------------------------------

  describe('Circuit reset', () => {
    it('should reset a specific circuit', () => {
      manager.resetCircuit('urdf');
      expect(mockReset).toHaveBeenCalledWith('urdf');
    });

    it('should reset all circuits', () => {
      manager.resetAllCircuits();
      expect(mockResetAll).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // hasReferenceExporter()
  // ---------------------------------------------------------------------------

  describe('hasReferenceExporter()', () => {
    it('should delegate to reference registry', () => {
      mockHasExporter.mockReturnValueOnce(true);
      expect(manager.hasReferenceExporter('urdf')).toBe(true);
      expect(mockHasExporter).toHaveBeenCalledWith('urdf');
    });

    it('should return false for targets without reference exporter', () => {
      mockHasExporter.mockReturnValueOnce(false);
      expect(manager.hasReferenceExporter('tsl')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // Memory monitoring
  // ---------------------------------------------------------------------------

  describe('Memory monitoring', () => {
    it('should return memory stats via getMemoryStats()', () => {
      const stats = manager.getMemoryStats();
      expect(stats).toBeDefined();
      expect(stats!.heapUsed).toBe(100_000);
      expect(stats!.ramUtilization).toBe(0.5);
    });

    it('should return null for memory stats when monitoring disabled', () => {
      const mgr = new ExportManager({ useMemoryMonitoring: false });
      expect(mgr.getMemoryStats()).toBeNull();
      mgr.dispose();
    });

    it('should return memory monitor instance via getMemoryMonitor()', () => {
      const monitor = manager.getMemoryMonitor();
      expect(monitor).toBeDefined();
      expect(monitor).not.toBeNull();
    });

    it('should include memoryStats in export result', async () => {
      const result = await manager.export('urdf', composition);
      expect(result.memoryStats).toBeDefined();
      expect(result.memoryStats!.astNodeCount).toBe(500);
    });
  });

  // ---------------------------------------------------------------------------
  // Singleton: getExportManager() / resetExportManager()
  // ---------------------------------------------------------------------------

  describe('Singleton', () => {
    beforeEach(() => {
      resetExportManager();
    });

    it('should return the same instance on repeated calls', () => {
      const a = getExportManager();
      const b = getExportManager();
      expect(a).toBe(b);
    });

    it('should return a new instance after resetExportManager()', () => {
      const a = getExportManager();
      resetExportManager();
      const b = getExportManager();
      expect(a).not.toBe(b);
    });

    it('should accept options on first creation', () => {
      const mgr = getExportManager({ throwOnError: true });
      expect(mgr).toBeDefined();
    });

    it('should ignore options on subsequent calls (singleton already exists)', () => {
      const a = getExportManager({ throwOnError: false });
      const b = getExportManager({ throwOnError: true });
      expect(a).toBe(b);
    });
  });

  // ---------------------------------------------------------------------------
  // Convenience functions
  // ---------------------------------------------------------------------------

  describe('Convenience functions', () => {
    beforeEach(() => {
      resetExportManager();
    });

    it('exportComposition() should delegate to global manager', async () => {
      const result = await exportComposition('urdf', composition);
      expect(result).toBeDefined();
      expect(result.target).toBe('urdf');
    });

    it('batchExportComposition() should delegate to global manager', async () => {
      const result = await batchExportComposition(['urdf', 'sdf'], composition);
      expect(result).toBeDefined();
      expect(result.targets).toEqual(['urdf', 'sdf']);
      expect(result.results).toHaveLength(2);
    });

    it('exportComposition() should accept options', async () => {
      const result = await exportComposition('urdf', composition, {
        useCircuitBreaker: false,
      });
      expect(result).toBeDefined();
    });
  });
});
