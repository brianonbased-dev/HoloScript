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
 * - Gaussian primitive budget warnings per platform (W.034)
 *
 * @version 1.1.0
 * @package @holoscript/core/compiler
 */

import type { HoloComposition } from '../parser/HoloCompositionTypes';
import {
  CircuitBreakerRegistry,
  CircuitState,
  type ExportTarget,
  type CircuitBreakerConfig,
  type CircuitMetrics,
} from './CircuitBreaker';
import { ReferenceExporterRegistry } from './ReferenceExporters';

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
import { TSLCompiler } from './TSLCompiler';
import { A2AAgentCardCompiler } from './A2AAgentCardCompiler';
import { NIRCompiler } from './NIRCompiler';
import { OpenXRSpatialEntitiesCompiler } from './OpenXRSpatialEntitiesCompiler';
import { PhoneSleeveVRCompiler } from './PhoneSleeveVRCompiler';
import {
  CompilerStateMonitor,
  createCompilerStateMonitor,
  type MemoryAlert,
  type MemoryStats,
  type CompilerStateMonitorOptions,
} from './CompilerStateMonitor';
import {
  GaussianBudgetAnalyzer,
  type GaussianPlatform,
  type GaussianBudgetAnalysis,
} from './GaussianBudgetAnalyzer';
import { CompilerDocumentationGenerator } from './CompilerDocumentationGenerator';
import {
  generateSemanticSceneGraphObject,
  type JsonLdSceneGraph,
} from './SemanticSceneGraph';

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Passed to heterogeneous compiler constructors
  compilerOptions?: Record<string, any>;
  /** Enable memory monitoring (default: true) */
  useMemoryMonitoring?: boolean;
  /** Custom memory monitor config */
  memoryMonitorConfig?: CompilerStateMonitorOptions;
  /**
   * Enable Gaussian primitive budget analysis (default: true).
   * When enabled, compositions containing gaussian_splat traits are checked
   * against platform-specific budgets and warnings are emitted.
   */
  enableGaussianBudgetWarnings?: boolean;
  /**
   * Custom Gaussian budget overrides per platform.
   * Allows callers to set stricter or looser budgets than the defaults.
   */
  gaussianBudgetOverrides?: Partial<Record<GaussianPlatform, number>>;
  /**
   * Generate triple-output documentation (llms.txt, .well-known/mcp, markdown).
   * When enabled, each compilation will produce additional documentation outputs.
   * @default false
   */
  generateDocs?: boolean;
  /**
   * Agent identity token for RBAC integration
   */
  agentToken?: string;
  /**
   * Documentation generator options (service URL, version, etc.)
   * Only used if generateDocs is true.
   */
  docsOptions?: {
    serviceUrl?: string;
    serviceVersion?: string;
    maxLlmsTxtTokens?: number;
    includeTraitDocs?: boolean;
    includeExamples?: boolean;
    mcpTransportType?: string;
    contactRepository?: string;
    contactDocumentation?: string;
  };
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
  /** Gaussian primitive budget analysis (if budget warnings enabled and composition has gaussian_splat traits) */
  gaussianBudgetAnalysis?: GaussianBudgetAnalysis;
  /**
   * Triple-output documentation bundle (if generateDocs enabled)
   * Contains llms.txt, .well-known/mcp server card, and markdown documentation
   */
  documentation?: {
    llmsTxt: string;
    wellKnownMcp: Record<string, unknown>;
    markdownDocs: string;
  };
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
  data?: unknown;
}

export type ExportEventListener = (event: ExportEvent) => void;

// =============================================================================
// COMPILER FACTORY
// =============================================================================

/**
 * Factory for creating compiler instances
 */
class CompilerFactory {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Compilers are heterogeneous (4 don't implement ICompiler); full interface unification tracked separately
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
        return new VRRCompiler(options as unknown as ConstructorParameters<typeof VRRCompiler>[0]);
      case 'ar':
        return new ARCompiler(options as unknown as ConstructorParameters<typeof ARCompiler>[0]);
      case 'multi-layer':
        return new MultiLayerCompiler(options as unknown as ConstructorParameters<typeof MultiLayerCompiler>[0]);
      case 'incremental':
        return new IncrementalCompiler(options as unknown as ConstructorParameters<typeof IncrementalCompiler>[0]);
      case 'state':
        return new StateCompiler();
      case 'trait-composition':
        return new TraitCompositionCompiler(options as unknown as ConstructorParameters<typeof TraitCompositionCompiler>[0]);
      case 'tsl':
        return new TSLCompiler(options);
      case 'a2a-agent-card':
        return new A2AAgentCardCompiler(options);
      case 'nir':
        return new NIRCompiler(options);
      case 'openxr-spatial-entities':
        return new OpenXRSpatialEntitiesCompiler(options);
      case 'phone-sleeve-vr':
        return new PhoneSleeveVRCompiler(options);
      default:
        throw new Error(`Unknown export target: ${target}`);
    }
  }
}

// =============================================================================
// GAUSSIAN BUDGET: TARGET-TO-PLATFORM MAPPING
// =============================================================================

/**
 * Maps export targets to the Gaussian platform(s) they should be validated against.
 *
 * Some targets map to a single platform (e.g., 'visionos' -> ['visionos']),
 * while others map to multiple platforms when the output could run on
 * different hardware (e.g., 'openxr' runs on both Quest 3 and Desktop VR).
 *
 * Targets that have no Gaussian rendering concern (e.g., 'urdf', 'sdf', 'dtdl')
 * are not listed and will skip budget analysis.
 */
const EXPORT_TARGET_TO_GAUSSIAN_PLATFORMS: Partial<Record<ExportTarget, GaussianPlatform[]>> = {
  // VR targets
  vrchat: ['quest3', 'desktop_vr'],
  openxr: ['quest3', 'desktop_vr'],
  'openxr-spatial-entities': ['quest3', 'desktop_vr'],
  vrr: ['quest3', 'desktop_vr'],

  // Mobile VR
  'android-xr': ['quest3'],
  'phone-sleeve-vr': ['mobile_ar' as GaussianPlatform],

  // Desktop/Browser rendering
  webgpu: ['webgpu'],
  babylon: ['webgpu', 'desktop_vr'],
  r3f: ['webgpu'],
  playcanvas: ['webgpu'],
  wasm: ['webgpu'],

  // Native VR/AR platforms
  visionos: ['visionos'],
  unity: ['quest3', 'desktop_vr', 'visionos'],
  unreal: ['quest3', 'desktop_vr'],
  godot: ['quest3', 'desktop_vr'],

  // Mobile AR
  ar: ['mobile_ar'],
  android: ['mobile_ar'],
  ios: ['mobile_ar', 'visionos'],
};

// =============================================================================
// EXPORT MANAGER
// =============================================================================

/**
 * Main export manager with circuit breaker integration, memory monitoring,
 * and Gaussian primitive budget warnings (W.034).
 */
export class ExportManager {
  private circuitRegistry: CircuitBreakerRegistry;
  private referenceRegistry: ReferenceExporterRegistry;
  private compilerFactory: CompilerFactory;
  private eventListeners: Map<ExportEventType, Set<ExportEventListener>> = new Map();
  private defaultOptions: Required<ExportOptions>;
  private memoryMonitor: CompilerStateMonitor | null = null;
  /** V11: Content hash per backend to skip unchanged recompilations */
  private lastCompositionHash: Map<string, string> = new Map();

  constructor(options: Partial<ExportOptions> = {}) {
    this.defaultOptions = {
      useCircuitBreaker: options.useCircuitBreaker ?? true,
      useFallback: options.useFallback ?? true,
      throwOnError: options.throwOnError ?? false,
      circuitConfig: options.circuitConfig ?? {},
      compilerOptions: options.compilerOptions ?? {},
      useMemoryMonitoring: options.useMemoryMonitoring ?? true,
      memoryMonitorConfig: options.memoryMonitorConfig ?? {},
      enableGaussianBudgetWarnings: options.enableGaussianBudgetWarnings ?? true,
      gaussianBudgetOverrides: options.gaussianBudgetOverrides ?? {},
      generateDocs: options.generateDocs ?? false,
      docsOptions: options.docsOptions ?? {},
      agentToken: options.agentToken ?? '',
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
    this.lastCompositionHash.clear();
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
   * V11: Compute a stable content hash for a composition.
   * Used to detect when a backend's input hasn't changed.
   */
  private computeCompositionHash(composition: HoloComposition): string {
    const objects =
      composition.objects?.map((o) => o.name).sort().join(',') || '';
    const traitCount =
      composition.objects?.reduce(
        (sum, o) => sum + (o.traits?.length || 0),
        0
      ) || 0;
    return `${composition.name}:${objects}:${traitCount}:${JSON.stringify(composition).length}`;
  }

  /**
   * Export composition to multiple targets in parallel.
   * V11: Skips backends whose last compilation matches the current composition.
   */
  async batchExport(
    targets: ExportTarget[],
    composition: HoloComposition,
    options: Partial<ExportOptions> = {}
  ): Promise<BatchExportResult> {
    const startTime = Date.now();
    const currentHash = this.computeCompositionHash(composition);

    // V11: Skip backends whose last compilation matches current composition
    const forceRecompile = options.compilerOptions?.forceRecompile;
    const needsCompile = forceRecompile
      ? targets
      : targets.filter(
          (t) => this.lastCompositionHash.get(t) !== currentHash
        );

    // Export only changed targets in parallel
    const results = await Promise.all(
      needsCompile.map((target) => this.export(target, composition, options))
    );

    // Update hash cache for successful compilations
    for (const result of results) {
      if (result.success) {
        this.lastCompositionHash.set(result.target, currentHash);
      }
    }

    // Calculate statistics (skipped backends count as successes)
    const skippedCount = targets.length - needsCompile.length;
    const successCount = results.filter((r) => r.success).length + skippedCount;
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
      'tsl',
      'a2a-agent-card',
      'nir',
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

    // Generate SSG once and cache for this compilation pass
    const sceneGraph = generateSemanticSceneGraphObject(composition);

    // Define main export operation
    const exportOperation = async () => {
      const compiler = this.compilerFactory.createCompiler(target, options.compilerOptions);

      // If compiler is IncrementalCompiler, attach memory monitor
      if (compiler instanceof IncrementalCompiler && this.memoryMonitor) {
        this.memoryMonitor.setIncrementalCompiler(compiler);
      }

      // R3FCompiler has compileComposition() for HoloComposition input.
      // Its compile() method expects HSPlusAST. Other compilers use compile() directly.
      const asRecord = compiler as Record<string, unknown>;
      if (typeof asRecord['compileComposition'] === 'function') {
        const compileFn = asRecord['compileComposition'] as (comp: unknown, token?: string, path?: string, ssg?: JsonLdSceneGraph) => unknown;
        const output = await compileFn.call(compiler, composition, options.agentToken, undefined, sceneGraph);
        return output;
      }
      const output = await compiler.compile(composition, undefined as unknown as string, undefined, sceneGraph);
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

    // Run Gaussian budget analysis (W.034)
    const budgetResult = this.analyzeGaussianBudget(target, composition, options);

    // Generate documentation if enabled
    let documentation: ExportResult['documentation'] | undefined;
    if (options.generateDocs && circuitResult.success && circuitResult.data) {
      const docGen = new CompilerDocumentationGenerator(options.docsOptions);
      const outputStr =
        typeof circuitResult.data === 'string'
          ? circuitResult.data
          : JSON.stringify(circuitResult.data);
      const tripleOutput = docGen.generate(composition, target, outputStr);
      documentation = {
        llmsTxt: tripleOutput.llmsTxt,
        wellKnownMcp: tripleOutput.wellKnownMcp as unknown as Record<string, unknown>,
        markdownDocs: tripleOutput.markdownDocs,
      };
    }

    const result: ExportResult = {
      target,
      success: circuitResult.success,
      output: circuitResult.data as string | undefined,
      error: circuitResult.error,
      usedFallback: circuitResult.usedFallback,
      circuitState: circuitResult.state,
      warnings: budgetResult?.warningMessages ?? [],
      metrics: circuitResult.metrics,
      executionTime: Date.now() - startTime,
      memoryStats,
      gaussianBudgetAnalysis: budgetResult?.analysis,
      documentation,
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

      // Run Gaussian budget analysis (W.034)
      const budgetResult = this.analyzeGaussianBudget(target, composition, options);

      // Generate documentation if enabled
      let documentation: ExportResult['documentation'] | undefined;
      if (options.generateDocs && output) {
        const docGen = new CompilerDocumentationGenerator(options.docsOptions);
        const outputStr = typeof output === 'string' ? output : JSON.stringify(output);
        const tripleOutput = docGen.generate(composition, target, outputStr);
        documentation = {
          llmsTxt: tripleOutput.llmsTxt,
          wellKnownMcp: tripleOutput.wellKnownMcp as unknown as Record<string, unknown>,
          markdownDocs: tripleOutput.markdownDocs,
        };
      }

      const result: ExportResult = {
        target,
        success: true,
        output,
        usedFallback: false,
        circuitState: CircuitState.CLOSED,
        warnings: budgetResult?.warningMessages ?? [],
        metrics: this.circuitRegistry.getBreaker(target).getMetrics(),
        executionTime: Date.now() - startTime,
        memoryStats,
        gaussianBudgetAnalysis: budgetResult?.analysis,
        documentation,
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

          // Run Gaussian budget analysis even on fallback path (W.034)
          const budgetResult = this.analyzeGaussianBudget(target, composition, options);

          return {
            target,
            success: true,
            output: refResult.output,
            usedFallback: true,
            circuitState: CircuitState.CLOSED,
            warnings: [...refResult.warnings, ...(budgetResult?.warningMessages ?? [])],
            metrics: this.circuitRegistry.getBreaker(target).getMetrics(),
            executionTime: Date.now() - startTime,
            memoryStats,
            gaussianBudgetAnalysis: budgetResult?.analysis,
          };
        }
      }

      throw error;
    }
  }

  /**
   * Run Gaussian primitive budget analysis for the given target and composition.
   *
   * Determines the relevant platform(s) for the export target, runs the
   * GaussianBudgetAnalyzer, and returns the analysis result along with
   * formatted warning strings suitable for the ExportResult.warnings array.
   *
   * Returns null if:
   * - Gaussian budget warnings are disabled
   * - The target has no Gaussian-relevant platforms
   * - The composition has no gaussian_splat traits
   */
  private analyzeGaussianBudget(
    target: ExportTarget,
    composition: HoloComposition,
    options: Required<ExportOptions>
  ): { analysis: GaussianBudgetAnalysis; warningMessages: string[] } | null {
    if (!options.enableGaussianBudgetWarnings) return null;

    // Determine which platforms this target should be validated against
    const platforms = EXPORT_TARGET_TO_GAUSSIAN_PLATFORMS[target];
    if (!platforms || platforms.length === 0) return null;

    const analyzer = new GaussianBudgetAnalyzer({
      platforms,
      budgetOverrides: options.gaussianBudgetOverrides as
        | Partial<Record<GaussianPlatform, number>>
        | undefined,
      includeInfoMessages: false,
    });

    const analysis = analyzer.analyze(composition);

    // No gaussian_splat traits found — skip
    if (analysis.totalGaussians === 0) return null;

    // Format warnings as strings for the warnings array
    const warningMessages = analysis.warnings
      .filter((w) => w.severity === 'warning' || w.severity === 'critical')
      .map((w) => {
        const prefix =
          w.severity === 'critical' ? '[GAUSSIAN BUDGET EXCEEDED]' : '[GAUSSIAN BUDGET WARNING]';
        return `${prefix} ${w.message}${w.suggestion ? ' Suggestion: ' + w.suggestion : ''}`;
      });

    return { analysis, warningMessages };
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
