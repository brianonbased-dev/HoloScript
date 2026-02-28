/**
 * Export Manager with Circuit Breaker Integration
 *
 * Unified export system that wraps all HoloScript compilers with circuit breaker protection.
 * Provides automatic fallback, monitoring, and graceful degradation for 25+ export targets.
 *
 * Features:
 * - Circuit breaker protection per target
 * - Automatic fallback to reference implementations
 * - Real-time metrics tracking
 * - Event emission for monitoring systems
 * - Batch export support
 * - AgentIdentity RBAC integration ready
 *
 * @version 1.0.0
 * @package @holoscript/core/compiler
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes';
import {
  CircuitBreaker,
  CircuitBreakerRegistry,
  CircuitState,
  type ExportTarget,
  type CircuitBreakerConfig,
  type CircuitMetrics,
  type CircuitResult,
} from './CircuitBreaker';
import {
  ReferenceExporterRegistry,
  type ExportResult as ReferenceExportResult,
} from './ReferenceExporters';

// Import all compilers
import { URDFCompiler } from './URDFCompiler';
import { SDFCompiler } from './SDFCompiler';
import { UnityCompiler } from './UnityCompiler';
import { UnrealCompiler } from './UnrealCompiler';
import { GodotCompiler } from './GodotCompiler';
import { WebGPUCompiler } from './WebGPUCompiler';
import { R3FCompiler } from './R3FCompiler';
import { BabylonCompiler } from './BabylonCompiler';
import { OpenXRCompiler } from './OpenXRCompiler';
import { VRChatCompiler } from './VRChatCompiler';
import { IOSCompiler } from './IOSCompiler';
import { AndroidCompiler } from './AndroidCompiler';
import { AndroidXRCompiler } from './AndroidXRCompiler';
import { VisionOSCompiler } from './VisionOSCompiler';
import { WASMCompiler } from './WASMCompiler';
import { DTDLCompiler } from './DTDLCompiler';
import { PlayCanvasCompiler } from './PlayCanvasCompiler';
import { VRRCompiler } from './VRRCompiler';
import { ARCompiler } from './ARCompiler';
import { MultiLayerCompiler } from './MultiLayerCompiler';
import { IncrementalCompiler } from './IncrementalCompiler';
import { StateCompiler } from './StateCompiler';
import { TraitCompositionCompiler } from './TraitCompositionCompiler';
import {
  CompilerStateMonitor,
  createCompilerStateMonitor,
  type MemoryAlert,
  type MemoryStats,
  type CompilerStateMonitorOptions,
} from './CompilerStateMonitor';

// =============================================================================
// TYPES
// =============================================================================

export interface ExportOptions {
  /** Enable circuit breaker (default: true) */
  useCircuitBreaker?: boolean;
  /** Use fallback on failure (default: true) */
  useFallback?: boolean;
  /** Throw errors instead of returning them (default: false) */
  throwOnError?: boolean;
  /** Custom circuit breaker config */
  circuitConfig?: Partial<CircuitBreakerConfig>;
  /** Target-specific compiler options */
  compilerOptions?: Record<string, any>;
  /** Enable memory monitoring (default: true) */
  useMemoryMonitoring?: boolean;
  /** Custom memory monitor config */
  memoryMonitorConfig?: CompilerStateMonitorOptions;
}

export interface ExportResult {
  target: ExportTarget;
  success: boolean;
  output?: string;
  error?: Error;
  usedFallback: boolean;
  circuitState: CircuitState;
  warnings: string[];
  metrics: CircuitMetrics;
  executionTime: number;
  /** Memory stats at completion (if memory monitoring enabled) */
  memoryStats?: MemoryStats;
}

export interface BatchExportResult {
  targets: ExportTarget[];
  results: ExportResult[];
  successCount: number;
  failureCount: number;
  fallbackCount: number;
  totalTime: number;
  aggregatedMetrics: ReturnType<CircuitBreakerRegistry['getAggregatedMetrics']>;
}

/**
 * Export event types for monitoring
 */
export type ExportEventType =
  | 'export:start'
  | 'export:success'
  | 'export:failure'
  | 'export:fallback'
  | 'circuit:open'
  | 'circuit:close'
  | 'circuit:half-open';

export interface ExportEvent {
  type: ExportEventType;
  target: ExportTarget;
  timestamp: number;
  data?: any;
}

export type ExportEventListener = (event: ExportEvent) => void;

// =============================================================================
// COMPILER FACTORY
// =============================================================================

/**
 * Factory for creating compiler instances
 */
class CompilerFactory {
  createCompiler(target: ExportTarget, options: Record<string, any> = {}): any {
    switch (target) {
      case 'urdf':
        return new URDFCompiler(options);
      case 'sdf':
        return new SDFCompiler(options);
      case 'unity':
        return new UnityCompiler(options);
      case 'unreal':
        return new UnrealCompiler(options);
      case 'godot':
        return new GodotCompiler(options);
      case 'webgpu':
        return new WebGPUCompiler(options);
      case 'r3f':
        return new R3FCompiler(options);
      case 'babylon':
        return new BabylonCompiler(options);
      case 'openxr':
        return new OpenXRCompiler(options);
      case 'vrchat':
        return new VRChatCompiler(options);
      case 'ios':
        return new IOSCompiler(options);
      case 'android':
        return new AndroidCompiler(options);
      case 'android-xr':
        return new AndroidXRCompiler(options);
      case 'visionos':
        return new VisionOSCompiler(options);
      case 'wasm':
        return new WASMCompiler(options);
      case 'dtdl':
        return new DTDLCompiler(options);
      case 'playcanvas':
        return new PlayCanvasCompiler(options);
      case 'vrr':
        return new VRRCompiler(options);
      case 'ar':
        return new ARCompiler(options);
      case 'multi-layer':
        return new MultiLayerCompiler(options);
      case 'incremental':
        return new IncrementalCompiler(options);
      case 'state':
        return new StateCompiler(options);
      case 'trait-composition':
        return new TraitCompositionCompiler(options);
      default:
        throw new Error(`Unknown export target: ${target}`);
    }
  }
}

// =============================================================================
// EXPORT MANAGER
// =============================================================================

/**
 * Main export manager with circuit breaker integration and memory monitoring
 */
export class ExportManager {
  private circuitRegistry: CircuitBreakerRegistry;
  private referenceRegistry: ReferenceExporterRegistry;
  private compilerFactory: CompilerFactory;
  private eventListeners: Map<ExportEventType, Set<ExportEventListener>> = new Map();
  private defaultOptions: Required<ExportOptions>;
  private memoryMonitor: CompilerStateMonitor | null = null;

  constructor(options: Partial<ExportOptions> = {}) {
    this.defaultOptions = {
      useCircuitBreaker: options.useCircuitBreaker ?? true,
      useFallback: options.useFallback ?? true,
      throwOnError: options.throwOnError ?? false,
      circuitConfig: options.circuitConfig ?? {},
      compilerOptions: options.compilerOptions ?? {},
      useMemoryMonitoring: options.useMemoryMonitoring ?? true,
      memoryMonitorConfig: options.memoryMonitorConfig ?? {},
    };

    this.circuitRegistry = new CircuitBreakerRegistry({
      ...this.defaultOptions.circuitConfig,
      onStateChange: (oldState, newState, target) => {
        this.emitEvent({
          type: `circuit:${newState.toLowerCase()}` as ExportEventType,
          target,
          timestamp: Date.now(),
          data: { oldState, newState },
        });
      },
      onError: (error, target) => {
        this.emitEvent({
          type: 'export:failure',
          target,
          timestamp: Date.now(),
          data: { error: error.message },
        });
      },
    });

    this.referenceRegistry = new ReferenceExporterRegistry();
    this.compilerFactory = new CompilerFactory();

    // Initialize memory monitor if enabled
    if (this.defaultOptions.useMemoryMonitoring) {
      this.memoryMonitor = createCompilerStateMonitor({
        enabled: true,
        ...this.defaultOptions.memoryMonitorConfig,
        onAlert: (alert: MemoryAlert) => {
          // Log memory alerts
          console.warn(
            `[ExportManager] Memory Alert [${alert.level}]: ${alert.message}`,
            alert.stats
          );

          // Call user-provided callback if exists
          if (this.defaultOptions.memoryMonitorConfig?.onAlert) {
            this.defaultOptions.memoryMonitorConfig.onAlert(alert);
          }
        },
      });
    }
  }

  /**
   * Get memory monitor instance
   */
  getMemoryMonitor(): CompilerStateMonitor | null {
    return this.memoryMonitor;
  }

  /**
   * Get current memory statistics
   */
  getMemoryStats(): MemoryStats | null {
    return this.memoryMonitor?.captureMemoryStats() ?? null;
  }

  /**
   * Dispose export manager and clean up resources
   */
  dispose(): void {
    this.memoryMonitor?.dispose();
    this.eventListeners.clear();
  }

  /**
   * Export composition to a single target
   */
  async export(
    target: ExportTarget,
    composition: HoloComposition,
    options: Partial<ExportOptions> = {}
  ): Promise<ExportResult> {
    const opts = { ...this.defaultOptions, ...options };
    const startTime = Date.now();

    this.emitEvent({
      type: 'export:start',
      target,
      timestamp: startTime,
      data: { composition: composition.name },
    });

    try {
      if (opts.useCircuitBreaker) {
        return await this.exportWithCircuitBreaker(target, composition, opts, startTime);
      } else {
        return await this.exportDirect(target, composition, opts, startTime);
      }
    } catch (error) {
      const result: ExportResult = {
        target,
        success: false,
        error: error as Error,
        usedFallback: false,
        circuitState: CircuitState.CLOSED,
        warnings: [(error as Error).message],
        metrics: this.circuitRegistry.getBreaker(target).getMetrics(),
        executionTime: Date.now() - startTime,
      };

      if (opts.throwOnError) {
        throw error;
      }

      return result;
    }
  }

  /**
   * Export composition to multiple targets in parallel
   */
  async batchExport(
    targets: ExportTarget[],
    composition: HoloComposition,
    options: Partial<ExportOptions> = {}
  ): Promise<BatchExportResult> {
    const startTime = Date.now();

    // Export all targets in parallel
    const results = await Promise.all(
      targets.map((target) => this.export(target, composition, options))
    );

    // Calculate statistics
    const successCount = results.filter((r) => r.success).length;
    const failureCount = results.filter((r) => !r.success).length;
    const fallbackCount = results.filter((r) => r.usedFallback).length;

    return {
      targets,
      results,
      successCount,
      failureCount,
      fallbackCount,
      totalTime: Date.now() - startTime,
      aggregatedMetrics: this.circuitRegistry.getAggregatedMetrics(),
    };
  }

  /**
   * Get circuit metrics for a target
   */
  getMetrics(target: ExportTarget): CircuitMetrics {
    return this.circuitRegistry.getBreaker(target).getMetrics();
  }

  /**
   * Get aggregated metrics for all targets
   */
  getAllMetrics(): ReturnType<CircuitBreakerRegistry['getAggregatedMetrics']> {
    return this.circuitRegistry.getAggregatedMetrics();
  }

  /**
   * Reset circuit breaker for a target
   */
  resetCircuit(target: ExportTarget): void {
    this.circuitRegistry.reset(target);
  }

  /**
   * Reset all circuit breakers
   */
  resetAllCircuits(): void {
    this.circuitRegistry.resetAll();
  }

  /**
   * Subscribe to export events
   */
  on(eventType: ExportEventType, listener: ExportEventListener): void {
    if (!this.eventListeners.has(eventType)) {
      this.eventListeners.set(eventType, new Set());
    }
    this.eventListeners.get(eventType)!.add(listener);
  }

  /**
   * Unsubscribe from export events
   */
  off(eventType: ExportEventType, listener: ExportEventListener): void {
    this.eventListeners.get(eventType)?.delete(listener);
  }

  /**
   * Get list of all supported export targets
   */
  getSupportedTargets(): ExportTarget[] {
    return [
      'urdf',
      'sdf',
      'unity',
      'unreal',
      'godot',
      'vrchat',
      'openxr',
      'android',
      'android-xr',
      'ios',
      'visionos',
      'ar',
      'babylon',
      'webgpu',
      'r3f',
      'wasm',
      'playcanvas',
      'usd',
      'usdz',
      'dtdl',
      'vrr',
      'multi-layer',
      'incremental',
      'state',
      'trait-composition',
    ];
  }

  /**
   * Check if target has reference exporter
   */
  hasReferenceExporter(target: ExportTarget): boolean {
    return this.referenceRegistry.hasExporter(target);
  }

  // ─── PRIVATE METHODS ────────────────────────────────────────────────────────

  private async exportWithCircuitBreaker(
    target: ExportTarget,
    composition: HoloComposition,
    options: Required<ExportOptions>,
    startTime: number
  ): Promise<ExportResult> {
    const breaker = this.circuitRegistry.getBreaker(target);

    // Update memory monitor with current AST
    if (this.memoryMonitor) {
      this.memoryMonitor.setAST(composition);
      this.memoryMonitor.checkMemoryStatus();
    }

    // Define main export operation
    const exportOperation = async () => {
      const compiler = this.compilerFactory.createCompiler(target, options.compilerOptions);

      // If compiler is IncrementalCompiler, attach memory monitor
      if (compiler instanceof IncrementalCompiler && this.memoryMonitor) {
        this.memoryMonitor.setIncrementalCompiler(compiler);
      }

      const output = await compiler.compile(composition);
      return output;
    };

    // Define fallback operation (if enabled)
    const fallbackOperation = options.useFallback
      ? async () => {
          const result = this.referenceRegistry.export(target, composition);
          if (!result) {
            throw new Error(`No reference exporter available for target: ${target}`);
          }
          this.emitEvent({
            type: 'export:fallback',
            target,
            timestamp: Date.now(),
          });
          return result.output;
        }
      : undefined;

    // Execute with circuit breaker
    const circuitResult = await breaker.execute(exportOperation, fallbackOperation);

    // Capture memory stats after compilation
    const memoryStats = this.memoryMonitor?.captureMemoryStats();

    const result: ExportResult = {
      target,
      success: circuitResult.success,
      output: circuitResult.data,
      error: circuitResult.error,
      usedFallback: circuitResult.usedFallback,
      circuitState: circuitResult.state,
      warnings: [],
      metrics: circuitResult.metrics,
      executionTime: Date.now() - startTime,
      memoryStats,
    };

    if (circuitResult.success) {
      this.emitEvent({
        type: 'export:success',
        target,
        timestamp: Date.now(),
        data: { usedFallback: circuitResult.usedFallback },
      });
    }

    return result;
  }

  private async exportDirect(
    target: ExportTarget,
    composition: HoloComposition,
    options: Required<ExportOptions>,
    startTime: number
  ): Promise<ExportResult> {
    try {
      // Update memory monitor with current AST
      if (this.memoryMonitor) {
        this.memoryMonitor.setAST(composition);
        this.memoryMonitor.checkMemoryStatus();
      }

      const compiler = this.compilerFactory.createCompiler(target, options.compilerOptions);

      // If compiler is IncrementalCompiler, attach memory monitor
      if (compiler instanceof IncrementalCompiler && this.memoryMonitor) {
        this.memoryMonitor.setIncrementalCompiler(compiler);
      }

      const output = await compiler.compile(composition);

      // Capture memory stats after compilation
      const memoryStats = this.memoryMonitor?.captureMemoryStats();

      const result: ExportResult = {
        target,
        success: true,
        output,
        usedFallback: false,
        circuitState: CircuitState.CLOSED,
        warnings: [],
        metrics: this.circuitRegistry.getBreaker(target).getMetrics(),
        executionTime: Date.now() - startTime,
        memoryStats,
      };

      this.emitEvent({
        type: 'export:success',
        target,
        timestamp: Date.now(),
      });

      return result;
    } catch (error) {
      // Try fallback if enabled
      if (options.useFallback) {
        const refResult = this.referenceRegistry.export(target, composition);
        if (refResult) {
          this.emitEvent({
            type: 'export:fallback',
            target,
            timestamp: Date.now(),
          });

          const memoryStats = this.memoryMonitor?.captureMemoryStats();

          return {
            target,
            success: true,
            output: refResult.output,
            usedFallback: true,
            circuitState: CircuitState.CLOSED,
            warnings: refResult.warnings,
            metrics: this.circuitRegistry.getBreaker(target).getMetrics(),
            executionTime: Date.now() - startTime,
            memoryStats,
          };
        }
      }

      throw error;
    }
  }

  private emitEvent(event: ExportEvent): void {
    const listeners = this.eventListeners.get(event.type);
    if (listeners) {
      for (const listener of listeners) {
        try {
          listener(event);
        } catch (error) {
          console.error(`Error in event listener for ${event.type}:`, error);
        }
      }
    }
  }
}

// =============================================================================
// SINGLETON INSTANCE
// =============================================================================

let globalExportManager: ExportManager | null = null;

/**
 * Get or create global export manager instance
 */
export function getExportManager(options?: Partial<ExportOptions>): ExportManager {
  if (!globalExportManager) {
    globalExportManager = new ExportManager(options);
  }
  return globalExportManager;
}

/**
 * Reset global export manager instance
 */
export function resetExportManager(): void {
  globalExportManager = null;
}

// =============================================================================
// CONVENIENCE EXPORTS
// =============================================================================

/**
 * Quick export function using global manager
 */
export async function exportComposition(
  target: ExportTarget,
  composition: HoloComposition,
  options?: Partial<ExportOptions>
): Promise<ExportResult> {
  return getExportManager().export(target, composition, options);
}

/**
 * Quick batch export function using global manager
 */
export async function batchExportComposition(
  targets: ExportTarget[],
  composition: HoloComposition,
  options?: Partial<ExportOptions>
): Promise<BatchExportResult> {
  return getExportManager().batchExport(targets, composition, options);
}

// =============================================================================
// EXPORTS
// =============================================================================

export default ExportManager;
