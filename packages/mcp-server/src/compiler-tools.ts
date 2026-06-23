/**
 * HoloScript MCP Compiler Tools
 *
 * Exposes all 18+ HoloScript compilation targets via Model Context Protocol.
 * Enables AI agents to compile HoloScript to any platform with circuit breaker protection,
 * streaming progress, and comprehensive error reporting.
 *
 * Features:
 * - 18+ export targets (Unity, Unreal, URDF, SDF, WebGPU, WASM, R3F, etc.)
 * - Circuit breaker pattern per target
 * - Streaming compilation progress via JSON streaming
 * - Job status tracking with unique job IDs
 * - Comprehensive error messages with suggestions
 * - Export manager integration for batch operations
 * - AgentIdentity RBAC integration (Phase 1)
 *
 * @version 1.0.0
 * @package @holoscript/mcp-server
 */

import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  parseHolo,
  CircuitState,
  getExportManager,
  TraitCompositionCompiler,
  type ExportTarget,
  type ExportOptions,
  type HoloComposition,
  type TraitCompositionDecl,
  selectModality,
  selectModalityForAll,
  compileHealthcareBlock,
  compileRoboticsBlock,
  compileIoTBlock,
  compileEducationBlock,
  compileMusicBlock,
  generateROS2LaunchFile,
  generateControllersYaml,
} from '@holoscript/core';
import { handleMapSchema, handleMapCsvHeaders } from './schema-mapper';
import { handleAuditNumbers, auditTools } from './audit-tools';
import { handleFetchStructure, alphafoldTools } from './alphafold-tools';
import { generateWebGPUBrowserTemplate } from './renderer';
import {
  targetSovereignty,
  DialectRegistry,
  registerBuiltinDialects,
  absorbFMU,
  streamWorldTiles,
} from '@holoscript/core/compiler';

// Initialize ExportManager singleton with memory monitoring disabled.
// Railway containers have constrained RAM ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â the default monitoring loop
// triggers critical alerts at 91% utilization and causes OOM SIGTERMs.
getExportManager({ useMemoryMonitoring: false });

registerBuiltinDialects();

// Dialects that are internal/meta and should not be surfaced as user-facing export targets.
const _INTERNAL_DIALECT_NAMES = new Set([
  'domain-block', 'multi-layer', 'incremental', 'mcp-config',
  // Registered in DialectRegistry but not yet wired to a compiler-tools switch case:
  'threejs', 'nextjs-api',
]);

// ExportManager targets not yet migrated to DialectRegistry -- surfaced via legacy path.
const _LEGACY_EXPORT_TARGETS = [
  'usd', 'usdz', 'fmu', '3dgs', '3dtiles', 'canvas2d-game', 'code-editor',
  'character-webgpu', // authored .holo character -> CharacterDrawSpec (sovereign); compiles via the generic compile tool
] as const;

// =============================================================================
// TYPES
// =============================================================================

export interface CompilationOptions {
  /** Composition source code (.holo format) */
  code: string;
  /** Export target platform */
  target: ExportTarget;
  /** Optional configuration per compiler */
  options?: Record<string, unknown>;
  /** Enable streaming progress updates */
  stream?: boolean;
  /** Job ID for tracking (auto-generated if not provided) */
  jobId?: string;
}

export interface CompilationResult {
  success: boolean;
  jobId: string;
  target: ExportTarget;
  output?: string;
  /**
   * For sovereign (`webgpu`) compile targets: a self-contained HTML page that
   * boots the native WebGPU renderer with the compiled WGSL output embedded.
   * Absent for bridge targets (Unity, R3F, Babylon, …) — those require a
   * third-party runtime to render.
   */
  previewHtml?: string;
  error?: string;
  warnings?: string[];
  /**
   * TOP-LEVEL signal (additive) that `output` is a DEGRADED reference substitute
   * produced because the real compiler threw — NOT a true compile. `success` may
   * still be `true` for non-empty fallbacks, so any consumer that relies on the
   * output being a real compile MUST check `degraded` first. Mirrors the buried
   * `metadata.usedFallback` but is unmissable at the top level.
   */
  degraded?: boolean;
  metadata: {
    compilationTimeMs: number;
    circuitBreakerState: CircuitState;
    usedFallback: boolean;
    /** Mirror of top-level `degraded` for callers that read metadata. */
    degraded?: boolean;
    outputSizeBytes?: number;
  };
}

export interface CompilationStatusResult {
  jobId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number; // 0-100
  result?: CompilationResult;
  startedAt: number;
  completedAt?: number;
}

export interface CircuitBreakerStatusResult {
  target: ExportTarget;
  state: CircuitState;
  failureCount: number;
  successCount: number;
  totalRequests: number;
  failureRate: number;
  lastError: string | null;
  timeInDegradedMode: number;
  canRetry: boolean;
}

// =============================================================================
// COMPILATION JOB TRACKING
// =============================================================================

interface CompilationJob {
  jobId: string;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
  progress: number;
  result?: CompilationResult;
  startedAt: number;
  completedAt?: number;
}

const compilationJobs = new Map<string, CompilationJob>();

function generateJobId(): string {
  return `compile_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const EXPORT_OPTION_KEYS = new Set([
  'useCircuitBreaker',
  'useFallback',
  'throwOnError',
  'circuitConfig',
  'compilerOptions',
  'useMemoryMonitoring',
  'memoryMonitorConfig',
  'enableGaussianBudgetWarnings',
  'gaussianBudgetOverrides',
  'generateDocs',
  'docsOptions',
  'agentToken',
]);

function toExportOptions(options: Record<string, unknown>): Partial<ExportOptions> {
  const exportOptions: Record<string, unknown> = {};
  const compilerOptions: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(options)) {
    if (EXPORT_OPTION_KEYS.has(key)) {
      exportOptions[key] = value;
    } else {
      compilerOptions[key] = value;
    }
  }

  const nestedCompilerOptions = isRecord(exportOptions['compilerOptions'])
    ? exportOptions['compilerOptions']
    : {};
  const mergedCompilerOptions = { ...compilerOptions, ...nestedCompilerOptions };
  if (Object.keys(mergedCompilerOptions).length > 0) {
    exportOptions['compilerOptions'] = mergedCompilerOptions;
  }

  return exportOptions as Partial<ExportOptions>;
}

function normalizeTargetOptions(
  target: ExportTarget,
  options: Partial<ExportOptions>
): Partial<ExportOptions> {
  if ((target as unknown as string) !== 'vrchat') {
    return options;
  }

  const rawOptions = options as Partial<ExportOptions> & Record<string, unknown>;
  const hasOutputFormat = Object.prototype.hasOwnProperty.call(rawOptions, 'outputFormat');
  const hasUseUdonSharp = Object.prototype.hasOwnProperty.call(rawOptions, 'useUdonSharp');
  if (!hasOutputFormat && !hasUseUdonSharp) {
    return options;
  }

  const { outputFormat, useUdonSharp, ...rest } = rawOptions;
  const compilerOptions = isRecord(rawOptions.compilerOptions)
    ? { ...rawOptions.compilerOptions }
    : {};

  if (hasOutputFormat) {
    compilerOptions.outputFormat = outputFormat;
  }
  if (hasUseUdonSharp) {
    compilerOptions.useUdonSharp = useUdonSharp;
  }

  return {
    ...rest,
    compilerOptions,
  };
}

function trackJob(
  jobId: string,
  status: CompilationJob['status'],
  progress: number,
  result?: CompilationResult
): void {
  const job = compilationJobs.get(jobId);
  if (job) {
    job.status = status;
    job.progress = progress;
    if (result) job.result = result;
    if (status === 'completed' || status === 'failed') {
      job.completedAt = Date.now();
    }
  } else {
    compilationJobs.set(jobId, {
      jobId,
      status,
      progress,
      result,
      startedAt: Date.now(),
      ...(status === 'completed' || status === 'failed' ? { completedAt: Date.now() } : {}),
    });
  }
}

// =============================================================================
// COMPILER DISPATCH
// =============================================================================

async function compileToTarget(
  composition: HoloComposition,
  target: ExportTarget,
  options: Partial<ExportOptions> = {}
): Promise<{
  output: string;
  usedFallback: boolean;
  degraded: boolean;
  warnings: string[];
}> {
  const exportManager = getExportManager();
  const exportOptions = toExportOptions(options as Record<string, unknown>);
  // ExportManager.export(target, composition, options) ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â target is first arg
  const result = await exportManager.export(
    target,
    composition,
    normalizeTargetOptions(target, exportOptions)
  );

  if (!result.success) {
    throw new Error(result.error?.message || 'Compilation failed');
  }

  const rawOutput = (result as { output?: unknown }).output;
  const output =
    typeof rawOutput === 'string'
      ? rawOutput
      : rawOutput == null
        ? ''
        : JSON.stringify(rawOutput, null, 2);

  return {
    output,
    usedFallback: result.usedFallback || false,
    degraded: result.degraded || false,
    warnings: result.warnings || [],
  };
}

// =============================================================================
// MCP TOOL HANDLERS
// =============================================================================

export async function handleCompileToTarget(
  args: Record<string, unknown>
): Promise<CompilationResult> {
  const {
    code,
    target,
    options = {},
    jobId: providedJobId,
  } = args as {
    code?: string;
    target?: ExportTarget;
    options?: Record<string, unknown>;
    jobId?: string;
  };

  if (!code) {
    throw new Error(
      'code is required: pass the HoloScript source (.hs/.hsplus/.holo) to compile as the "code" field.'
    );
  }
  if (!target) {
    throw new Error(
      'target is required: call the list_export_targets tool to see valid compile targets (e.g. unity, unreal, webgpu, gltf, ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦), then pass one as "target".'
    );
  }

  const jobId = providedJobId || generateJobId();
  trackJob(jobId, 'in_progress', 10);

  const startTime = Date.now();

  try {
    // Parse composition
    trackJob(jobId, 'in_progress', 30);
    const parseResult = parseHolo(code);
    if (!parseResult.success || !parseResult.ast) {
      const errors =
        parseResult.errors?.map((e: any) => e.message).join(', ') || 'Unknown parse error';
      throw new Error(`Failed to parse composition: ${errors}`);
    }

    const composition = parseResult.ast;

    // Compile to target
    trackJob(jobId, 'in_progress', 60);
    const compileResult = await compileToTarget(
      composition,
      target,
      options as Record<string, unknown>
    );

    const compilationTimeMs = Date.now() - startTime;
    // Use ExportManager.getMetrics() ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no static getInstance on CircuitBreakerRegistry
    const circuitMetrics = getExportManager().getMetrics(target);
    trackJob(jobId, 'in_progress', 100);

    // For sovereign (webgpu) target: embed compiled output in a self-contained
    // HTML page that boots the native WebGPU renderer — no Three.js / R3F bridge.
    const previewHtml =
      target === 'webgpu' && compileResult.output
        ? generateWebGPUBrowserTemplate(
            compileResult.output,
            (composition as HoloComposition).name
              ? String((composition as HoloComposition).name)
              : 'HoloScript Scene'
          )
        : undefined;

    // Merge parse warnings with the compiler's degraded/fallback warnings so the
    // "non-equivalent reference substitute" reason is visible at the top level,
    // not buried only inside ExportManager.
    const mergedWarnings = [
      ...(parseResult.warnings?.map((w: any) => w.message) ?? []),
      ...compileResult.warnings,
    ];

    const result: CompilationResult = {
      success: true,
      jobId,
      target,
      output: compileResult.output,
      ...(previewHtml !== undefined && { previewHtml }),
      warnings: mergedWarnings.length > 0 ? mergedWarnings : undefined,
      degraded: compileResult.degraded,
      metadata: {
        compilationTimeMs,
        circuitBreakerState: circuitMetrics.state,
        usedFallback: compileResult.usedFallback,
        degraded: compileResult.degraded,
        outputSizeBytes: compileResult.output.length,
      },
    };

    trackJob(jobId, 'completed', 100, result);
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const result: CompilationResult = {
      success: false,
      jobId,
      target,
      error: errorMessage,
      metadata: {
        compilationTimeMs: Date.now() - startTime,
        circuitBreakerState: 'open' as any,
        usedFallback: false,
      },
    };
    trackJob(jobId, 'failed', 100, result);
    throw new Error(errorMessage);
  }
}

export async function handleStreamWorldTiles(args: Record<string, unknown>): Promise<{
  success: true;
  target: '3dtiles';
  manifestUrl: string;
  streamId: string;
  tileset: unknown;
  manifest: unknown;
  files: Record<string, string>;
  metadata: {
    tileCount: number;
    lodLevels: string[];
    outputSizeBytes: number;
  };
}> {
  const { code, options = {} } = args as {
    code?: string;
    options?: Record<string, unknown>;
  };

  if (!code) {
    throw new Error(
      'code is required: pass the HoloScript source with @gaussian_splat data as the "code" field.'
    );
  }

  const parseResult = parseHolo(code);
  if (!parseResult.success || !parseResult.ast) {
    const errors =
      parseResult.errors?.map((e: any) => e.message).join(', ') || 'Unknown parse error';
    throw new Error(`Failed to parse composition: ${errors}`);
  }

  const stream = streamWorldTiles(parseResult.ast, options as Parameters<typeof streamWorldTiles>[1]);
  return {
    ...stream,
    metadata: {
      tileCount: stream.manifest.tiles.length,
      lodLevels: stream.manifest.stream.lodLevels,
      outputSizeBytes: JSON.stringify(stream.files).length,
    },
  };
}

export async function handleComposeTraits(args: Record<string, unknown>): Promise<unknown> {
  const { declarations, baseTraits = {} } = args as {
    declarations: TraitCompositionDecl[];
    baseTraits?: Record<string, { defaultConfig?: Record<string, unknown>; conflicts?: string[] }>;
  };

  if (!declarations || !Array.isArray(declarations)) {
    throw new Error('declarations array is required');
  }

  const compiler = new TraitCompositionCompiler();

  const getHandler = (name: string) => {
    if (baseTraits[name]) {
      return baseTraits[name];
    }
    // For pure architectural resolution, if a trait isn't provided,
    // we assume an empty config instead of crashing, or expect the client to provide all dependencies.
    return { defaultConfig: {}, conflicts: [] };
  };

  try {
    const results = compiler.compile(declarations, getHandler);
    return { success: true, composedTraits: results };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

export async function handleCompileMCPConfig(args: Record<string, unknown>): Promise<unknown> {
  try {
    const code = args.code as string;
    if (!code) return { error: 'Missing required field: code' };

    const target = (args.target as string) || 'generic';
    const envValues = (args.envValues as Record<string, string>) || {};

    const { parseHolo } = await import('@holoscript/core');
    const { MCPConfigCompiler } = await import('@holoscript/core/compiler');

    const composition = parseHolo(code);
    const compiler = new MCPConfigCompiler({
      target: target as 'claude' | 'vscode' | 'cursor' | 'antigravity' | 'generic',
      envValues,
    });

    const output = compiler.compile(composition, 'mcp-config-token');

    return {
      success: true,
      target,
      config: JSON.parse(output),
      raw: output,
    };
  } catch (err) {
    return {
      error: `MCP config compilation failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

export async function handleSelectModality(args: Record<string, unknown>): Promise<unknown> {
  const { platform, platforms, preferStreaming } = args as {
    platform?: string;
    platforms?: string[];
    preferStreaming?: boolean;
  };

  const options = { preferStreaming: preferStreaming ?? false };

  if (platform) {
    const result = selectModality(platform, options);
    return { success: true, selection: result };
  }

  if (platforms && Array.isArray(platforms)) {
    const results: Record<string, ReturnType<typeof selectModality>> = {};
    for (const p of platforms) {
      results[p] = selectModality(p, options);
    }
    return { success: true, selections: results };
  }

  // No platform specified ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â return all 18
  const all = selectModalityForAll(options);
  const selections: Record<string, ReturnType<typeof selectModality>> = {};
  for (const [p, sel] of all) {
    selections[p] = sel;
  }
  return { success: true, selections };
}

export async function handleGetCompilationStatus(
  args: Record<string, unknown>
): Promise<CompilationStatusResult> {
  const { jobId } = args as { jobId: string };

  if (!jobId) {
    throw new Error('jobId is required');
  }

  const job = compilationJobs.get(jobId);
  if (!job) {
    throw new Error(`Job not found: ${jobId}`);
  }

  return {
    jobId: job.jobId,
    status: job.status,
    progress: job.progress,
    result: job.result,
    startedAt: job.startedAt,
    completedAt: job.completedAt,
  };
}

// =============================================================================
// QASM HANDLER
// =============================================================================

/**
 * compile_to_qasm ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â HoloScript ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ OpenQASM 3.0
 *
 * Parses the provided HoloScript source, finds the first @quantumCircuit
 * (or @quantum_circuit) trait node, and returns a QASMOutput JSON object.
 *
 * Uses a dynamic import of @holoscript/core/compiler (matching the pattern of
 * handleCompileMCPConfig) so this file can be type-checked before the core
 * dist is rebuilt.
 */
export async function handleCompileToQasm(args: Record<string, unknown>): Promise<unknown> {
  const { source } = args as { source?: string };

  if (!source || typeof source !== 'string' || source.trim().length === 0) {
    return { error: 'Missing required field: source (HoloScript source string)' };
  }

  try {
    const parseResult = parseHolo(source);
    if (!parseResult.success || !parseResult.ast) {
      const errors =
        (parseResult.errors as Array<{ message: string }> | undefined)
          ?.map((e) => e.message)
          .join(', ') ?? 'Unknown parse error';
      return { error: `Failed to parse HoloScript source: ${errors}` };
    }

    const composition = parseResult.ast as HoloComposition;

    const { QuantumCircuitCompiler } = await import('@holoscript/core/compiler');
    const compiler = new QuantumCircuitCompiler();
    const output = compiler.compile(composition);

    return output;
  } catch (err: unknown) {
    return {
      error: `compile_to_qasm failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Generic handler for domain block compilation */
async function handleDomainBlock(
  args: Record<string, unknown>,
  compileFn: (block: any) => unknown,
  domain: string
): Promise<unknown> {
  const { properties, code } = args as { properties?: Record<string, unknown>; code?: string };

  if (code) {
    // Parse .holo code to extract domain block
    try {
      const parsed = parseHolo(code);
      const block = parsed.domainBlocks?.find((b: any) => b.domain === domain || b.name === domain);
      if (!block) return { success: false, error: `No ${domain} {} block found in composition` };
      return { success: true, domain, compiled: compileFn(block) };
    } catch (e) {
      return {
        success: false,
        error: `Parse error: ${e instanceof Error ? e.message : String(e)}`,
      };
    }
  }

  if (properties) {
    // Direct property object ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â wrap as HoloDomainBlock
    const block = { type: 'DomainBlock', name: domain, domain, properties };
    return { success: true, domain, compiled: compileFn(block) };
  }

  return {
    success: false,
    error: `Provide "code" (.holo with ${domain} {} block) or "properties" (direct property map)`,
  };
}

export async function handleListExportTargets(_args: Record<string, unknown>): Promise<{
  targets: ExportTarget[];
  categories: Record<string, ExportTarget[]>;
  sovereignty: Record<string, 'sovereign' | 'bridge' | 'mode'>;
}> {
  const dialectNames = DialectRegistry.names().filter(
    (n) => !_INTERNAL_DIALECT_NAMES.has(n),
  );
  const legacyNames = Array.from(_LEGACY_EXPORT_TARGETS).filter(
    (n) => !dialectNames.includes(n),
  );
  const targets = [...dialectNames, ...legacyNames] as unknown as ExportTarget[];

  const categories: Record<string, ExportTarget[]> = {
    'Game Engines': ['unity', 'unreal', 'pcg-graph', 'godot', 'canvas2d-game'] as unknown as ExportTarget[],
    'VR Platforms': ['vrchat', 'openxr'] as unknown as ExportTarget[],
    'Mobile AR': ['android', 'android-xr', 'ios', 'visionos'] as unknown as ExportTarget[],
    // ar, babylon, r3f, playcanvas, vrr retired as apex-poison 2026-06-17
    'Web Platforms': ['webgpu', 'character-webgpu', 'wasm'] as unknown as ExportTarget[],
    'Robotics/IoT': ['urdf', 'sdf', 'dtdl'] as unknown as ExportTarget[],
    '3D Formats': ['usd', 'usdz', 'fmu', '3dgs', '3dtiles'] as unknown as ExportTarget[],
    'Studio Tools': ['code-editor'] as unknown as ExportTarget[],
    'AI/MCP': [
      'a2a-agent-card',
      'agent-inference',
      'daimon-seed',
      'mcp-server',
    ] as unknown as ExportTarget[],
  };

  const sovereignty: Record<string, 'sovereign' | 'bridge' | 'mode'> = {};
  for (const t of targets) {
    sovereignty[t] = targetSovereignty(t);
  }

  return { targets, categories, sovereignty };
}

export async function handleGetCircuitBreakerStatus(
  args: Record<string, unknown>
): Promise<CircuitBreakerStatusResult> {
  const { target } = args as { target: ExportTarget };

  if (!target) {
    throw new Error('target is required');
  }

  // Use ExportManager.getMetrics() ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â no static getInstance on CircuitBreakerRegistry
  const metrics = getExportManager().getMetrics(target);

  return {
    target,
    state: metrics.state,
    failureCount: metrics.failureCount,
    successCount: metrics.successCount,
    totalRequests: metrics.totalRequests,
    failureRate: metrics.failureRate,
    lastError: metrics.lastError,
    timeInDegradedMode: metrics.timeInDegradedMode,
    canRetry: metrics.state !== 'open',
  };
}

// =============================================================================
// HANDLER DISPATCHER
// =============================================================================

export async function handleCompilerTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown | null> {
  switch (name) {
    // Generic compilation
    case 'compile_holoscript':
      return handleCompileToTarget(args);

    // Proof-of-Play / Thin Client Delegation Tool
    case 'holoscript_compose_traits':
      return handleComposeTraits(args);

    // Convenience tools for popular targets
    case 'compile_to_unity':
      return handleCompileToTarget({ ...args, target: 'unity' });
    case 'compile_to_unreal':
      return handleCompileToTarget({ ...args, target: 'unreal' });
    case 'compile_to_pcg_graph':
      return handleCompileToTarget({ ...args, target: 'pcg-graph' });
    case 'compile_to_urdf':
      return handleCompileToTarget({ ...args, target: 'urdf' });
    case 'compile_to_sdf':
      return handleCompileToTarget({ ...args, target: 'sdf' });
    case 'compile_to_ros2_deploy': {
      const {
        code,
        packageName = 'holoscript_robot',
        options = {},
      } = args as {
        code: string;
        packageName?: string;
        options?: {
          useSimTime?: boolean;
          rviz?: boolean;
          gazebo?: boolean;
          controllers?: string[];
        };
      };
      const urdfResult = await handleCompileToTarget({ code, target: 'urdf', options });
      const urdfContent = urdfResult.output ?? '';
      if (!urdfResult.success || !urdfContent) {
        throw new Error(
          `URDF compilation failed for ROS 2 bundle: ${urdfResult.error ?? 'empty output'}`
        );
      }
      const urdfFilename = `${packageName}.urdf`;
      const launchFile = generateROS2LaunchFile(packageName, urdfFilename, options);
      const controllersYaml = generateControllersYaml(packageName, options.controllers ?? []);
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { urdf: urdfContent, launchFile, controllersYaml, packageName, urdfFilename },
              null,
              2
            ),
          },
        ],
      };
    }
    case 'compile_to_webgpu':
      return handleCompileToTarget({ ...args, target: 'webgpu' });
    // compile_to_r3f — retired (apex-poison, 2026-06-17)
    case 'compile_to_godot':
      return handleCompileToTarget({ ...args, target: 'godot' });
    case 'compile_to_visionos':
      return handleCompileToTarget({ ...args, target: 'visionos' });
    case 'compile_to_openxr':
      return handleCompileToTarget({ ...args, target: 'openxr' });
    // compile_to_babylon, compile_to_playcanvas — retired (apex-poison, 2026-06-17)
    case 'compile_to_vrchat':
      return handleCompileToTarget({ ...args, target: 'vrchat' });
    case 'compile_to_android':
      return handleCompileToTarget({ ...args, target: 'android' });
    case 'compile_to_android_xr':
      return handleCompileToTarget({ ...args, target: 'android-xr' });
    case 'compile_to_quest':
      return handleCompileToTarget({ ...args, target: 'quest' });
    case 'compile_to_ios':
      return handleCompileToTarget({ ...args, target: 'ios' });
    // compile_to_ar — retired (apex-poison, 2026-06-17)
    case 'compile_to_wasm':
      return handleCompileToTarget({ ...args, target: 'wasm' });
    case 'compile_to_character_webgpu':
      return handleCompileToTarget({ ...args, target: 'character-webgpu' });
    case 'compile_to_usd':
      return handleCompileToTarget({ ...args, target: 'usd' });
    case 'compile_to_usdz':
      return handleCompileToTarget({ ...args, target: 'usdz' });
    case 'compile_to_fmu':
      return handleCompileToTarget({ ...args, target: 'fmu' });
    case 'absorb_fmu':
      return absorbFMU(args as Parameters<typeof absorbFMU>[0]);
    case 'compile_to_dtdl':
      return handleCompileToTarget({ ...args, target: 'dtdl' });
    // compile_to_vrr — retired (apex-poison, 2026-06-17)
    case 'compile_to_multi_layer':
      return handleCompileToTarget({ ...args, target: 'multi-layer' });
    case 'compile_to_nir':
      return handleCompileToTarget({ ...args, target: 'nir' });
    // compile_to_native_2d — retired (apex-poison, 2026-06-17)
    case 'compile_to_canvas2d_game':
      return handleCompileToTarget({ ...args, target: 'canvas2d-game' });
    case 'compile_to_node_service':
      return handleCompileToTarget({ ...args, target: 'node-service' });
    case 'compile_to_a2a_agent_card':
      return handleCompileToTarget({ ...args, target: 'a2a-agent-card' });
    case 'compile_to_agent_inference':
      return handleCompileToTarget({ ...args, target: 'agent-inference' });
    case 'compile_to_daimon_seed':
      return handleCompileToTarget({ ...args, target: 'daimon-seed' });
    case 'compile_to_state':
      return handleCompileToTarget({ ...args, target: 'state' });
    case 'compile_to_3dgs':
      return handleCompileToTarget({ ...args, target: '3dgs' });
    case 'compile_to_3dtiles':
      return handleCompileToTarget({ ...args, target: '3dtiles' });
    case 'stream_world_tiles':
      return handleStreamWorldTiles(args);
    case 'compile_to_gaussian_train':
      return handleCompileToTarget({ ...args, target: 'gaussian-train' });
    case 'compile_to_code_editor':
      return handleCompileToTarget({ ...args, target: 'code-editor' });

    case 'compile_to_svg':
      return handleCompileToTarget({ ...args, target: 'svg' });
    case 'compile_to_holob':
      return handleCompileToTarget({ ...args, target: 'holob' });
    case 'compile_to_openapi':
      return handleCompileToTarget({ ...args, target: 'openapi' });
    case 'compile_to_onnx':
      return handleCompileToTarget({ ...args, target: 'onnx' });
    case 'compile_to_flutter':
      return handleCompileToTarget({ ...args, target: 'flutter' });
    case 'compile_to_stl_export':
      return handleCompileToTarget({ ...args, target: 'stl-export' });
    case 'compile_to_lens_studio':
      return handleCompileToTarget({ ...args, target: 'lens-studio' });
    case 'compile_to_colyseus':
      return handleCompileToTarget({ ...args, target: 'colyseus' });
    case 'compile_to_ai_glasses':
      return handleCompileToTarget({ ...args, target: 'ai-glasses' });
    case 'compile_to_scm':
      return handleCompileToTarget({ ...args, target: 'scm' });
    case 'compile_to_nft_marketplace':
      return handleCompileToTarget({ ...args, target: 'nft-marketplace' });
    case 'compile_to_tsl':
      return handleCompileToTarget({ ...args, target: 'tsl' });
    // compile_to_phone_sleeve_vr — retired (apex-poison, 2026-06-17)
    case 'compile_to_openxr_spatial_entities':
      return handleCompileToTarget({ ...args, target: 'openxr-spatial-entities' });
    case 'compile_to_edge':
      return handleCompileToTarget({ ...args, target: 'edge' });
    case 'compile_to_bot_swarm':
      return handleCompileToTarget({ ...args, target: 'bot-swarm' });
    case 'compile_to_dungeon_instance':
      return handleCompileToTarget({ ...args, target: 'dungeon-instance' });
    case 'compile_to_world_shard':
      return handleCompileToTarget({ ...args, target: 'world-shard' });

    case 'compile_to_mcp_config':
      return handleCompileMCPConfig(args);

    case 'compile_to_mcp_server':
      return handleCompileToTarget({ ...args, target: 'mcp-server' });

    // Modality Transliteration (Pillar 1)
    case 'holoscript_select_modality':
      return handleSelectModality(args);

    // Universal Schema-to-Trait Mapper (Domain Bridge)
    case 'holoscript_map_schema':
      return handleMapSchema(args);
    case 'holoscript_map_csv':
      return handleMapCsvHeaders(args);

    // Domain Block Compilers (top 5 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â exposed from DomainBlockCompilerMixin)
    case 'holoscript_compile_healthcare':
      return handleDomainBlock(args, compileHealthcareBlock, 'healthcare');
    case 'holoscript_compile_robotics':
      return handleDomainBlock(args, compileRoboticsBlock, 'robotics');
    case 'holoscript_compile_iot':
      return handleDomainBlock(args, compileIoTBlock, 'iot');
    case 'holoscript_compile_education':
      return handleDomainBlock(args, compileEducationBlock, 'education');
    case 'holoscript_compile_music':
      return handleDomainBlock(args, compileMusicBlock, 'music');

    // Audit
    case 'holoscript_audit_numbers':
      return handleAuditNumbers(args);

    // AlphaFold ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â drug-discovery flagship Stage 5 (see docs/strategy/drug-discovery-flagship.md)
    case 'alphafold_fetch_structure':
      return handleFetchStructure(args);

    // Quantum circuit compilation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â HoloScript ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ OpenQASM 3.0
    case 'compile_to_qasm':
      return handleCompileToQasm(args);

    // Status and metadata tools
    case 'get_compilation_status':
      return handleGetCompilationStatus(args);
    case 'list_export_targets':
      return handleListExportTargets(args);
    case 'get_circuit_breaker_status':
      return handleGetCircuitBreakerStatus(args);

    // Not a compiler tool
    default:
      return null;
  }
}

// =============================================================================
// MCP TOOL DEFINITIONS
export const compilerTools: Tool[] = [
  // Trait Composition (Unlocks Pillar 3 Thin-Client Delegation)
  {
    name: 'holoscript_compose_traits',
    description:
      'Cryptographically delegate heavy trait algebra and physics composition to the cloud. Accepts raw composition declarations (e.g., trait C = A + B) and returns fully resolved trait nodes using the ProvenanceSemiring.',
    inputSchema: {
      type: 'object',
      properties: {
        declarations: {
          type: 'array',
          description: 'Array of trait composition declarations',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              components: { type: 'array', items: { type: 'string' } },
              overrides: { type: 'object' },
            },
            required: ['name', 'components'],
          },
        },
        baseTraits: {
          type: 'object',
          description:
            'Optional map of base trait names to their handler configs to resolve against',
        },
      },
      required: ['declarations'],
    },
  },
  // Domain Block Compilers (5 of 21 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â from DomainBlockCompilerMixin, 4,614 LOC)
  ...(['healthcare', 'robotics', 'iot', 'education', 'music'] as const).map((domain) => ({
    name: `holoscript_compile_${domain}` as string,
    description:
      `Compile a ${domain} domain block from .holo code or raw properties. ` +
      `Part of 21 domain-specific code generators in DomainBlockCompilerMixin. ` +
      `Accepts either "code" (full .holo with ${domain} {} block) or "properties" (direct property map).`,
    inputSchema: {
      type: 'object' as const,
      properties: {
        code: {
          type: 'string',
          description: `.holo source containing a ${domain} {} domain block`,
        },
        properties: {
          type: 'object',
          description: `Direct property map for ${domain} compilation`,
        },
      },
    },
  })),
  // Universal Schema-to-Trait Mapper (Domain Bridge ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â any data ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ .holo)
  {
    name: 'holoscript_map_schema',
    description:
      'Map any structured data schema to HoloScript traits and generate a .holo composition. ' +
      'The universal domain bridge: dispensary menu, restaurant catalog, real estate listings, IoT sensors ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ' +
      'any data schema maps onto the 3,300+ trait system. Returns per-field trait mappings with confidence scores, ' +
      'parameter bindings, spatial role assignments, and a ready-to-compile .holo composition.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the data source (e.g., "dispensary_menu")' },
        domain: {
          type: 'string',
          description: 'Optional domain hint (retail, healthcare, hospitality, iot, etc.)',
        },
        description: { type: 'string', description: 'What this data represents' },
        fields: {
          type: 'array',
          description: 'Schema fields to map',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Field name (e.g., "thc_percent")' },
              type: { type: 'string', enum: ['string', 'number', 'boolean', 'array', 'object'] },
              description: { type: 'string' },
              example: { description: 'Example value for type inference' },
            },
            required: ['name', 'type'],
          },
        },
        schema: {
          type: 'object',
          description: 'Alternative: provide a full DataSchema object directly',
        },
      },
    },
  },
  {
    name: 'holoscript_map_csv',
    description:
      'Map CSV headers to HoloScript traits. Provide column headers and optionally a sample row ' +
      'for type inference. Returns the same trait mappings and .holo composition as holoscript_map_schema.',
    inputSchema: {
      type: 'object',
      properties: {
        headers: {
          type: 'array',
          items: { type: 'string' },
          description: 'CSV column headers',
        },
        name: { type: 'string', description: 'Name for the data source' },
        domain: { type: 'string', description: 'Optional domain hint' },
        description: { type: 'string' },
        sample_row: {
          type: 'object',
          description:
            'Optional sample data row for type inference (keys = headers, values = sample data)',
        },
      },
      required: ['headers'],
    },
  },
  // Modality Transliteration (Pillar 1: device ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ embodiment ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ compiler)
  {
    name: 'holoscript_select_modality',
    description:
      'Auto-select the optimal output modality for a device platform. ' +
      'Given a platform target (quest3, ios, android-auto, etc.), returns the embodiment type ' +
      '(FullAvatar, UI2D, VoiceOnly, GlassOverlay), the ExportTarget to compile to, ' +
      'whether the device can render spatially, and whether neural streaming is recommended. ' +
      'Transliteration, not degradation: a phone gets Native 2D UI, not a broken 3D box.',
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          description: 'Single platform target',
          enum: [
            'quest3',
            'pcvr',
            'visionos',
            'android-xr',
            'visionos-ar',
            'android-xr-ar',
            'webxr',
            'ios',
            'android',
            'windows',
            'macos',
            'linux',
            'web',
            'android-auto',
            'carplay',
            'watchos',
            'wearos',
          ],
        },
        platforms: {
          type: 'array',
          description: 'Multiple platform targets (returns selection for each)',
          items: { type: 'string' },
        },
        preferStreaming: {
          type: 'boolean',
          description: 'Prefer neural streaming over local rendering when device lacks spatial GPU',
        },
      },
    },
  },
  // Generic compilation tool (supports all targets)
  {
    name: 'compile_holoscript',
    description:
      'Compile HoloScript composition to any export target (Unity, Unreal, URDF, SDF, WebGPU, WASM, etc.). ' +
      'Returns compiled output with circuit breaker protection and comprehensive error reporting. ' +
      'Supports 18+ export targets across game engines, VR platforms, mobile AR, web, robotics, and 3D formats.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript composition source code (.holo format)',
        },
        target: {
          type: 'string',
          enum: [
            'urdf',
            'sdf',
            'unity',
            'unreal',
            'pcg-graph',
            'godot',
            'vrchat',
            'openxr',
            'android',
            'android-xr',
            'ios',
            'visionos',
            // 'ar' — retired apex-poison 2026-06-17
            // 'babylon' — retired apex-poison 2026-06-17
            'webgpu',
            // 'r3f' — retired apex-poison 2026-06-17
            'wasm',
            // 'playcanvas' — retired apex-poison 2026-06-17
            'usd',
            'usdz',
            'fmu',
            'dtdl',
            // 'vrr' — retired apex-poison 2026-06-17
            'mcp-server',
            'state',
            'a2a-agent-card',
            'nir',
            // 'native-2d' — retired apex-poison 2026-06-17
            'node-service',
            '3dgs',
            '3dtiles',
            'canvas2d-game',
            'code-editor',
          ],
          description: 'Target platform to compile to',
        },
        options: {
          type: 'object',
          description: 'Optional compiler-specific configuration',
        },
        stream: {
          type: 'boolean',
          description: 'Enable streaming progress updates (for long-running compilations)',
        },
        jobId: {
          type: 'string',
          description: 'Optional job ID for tracking (auto-generated if not provided)',
        },
      },
      required: ['code', 'target'],
    },
  },

  // Convenience tools for popular targets
  {
    name: 'compile_to_unity',
    description: 'Compile HoloScript to Unity Engine C# scripts with prefab generation',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: {
          type: 'object',
          properties: {
            namespace: { type: 'string', description: 'C# namespace (default: HoloScript)' },
            generatePrefabs: {
              type: 'boolean',
              description: 'Generate Unity prefabs (default: true)',
            },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_unreal',
    description: 'Compile HoloScript to Unreal Engine C++ code with Blueprint support',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: {
          type: 'object',
          properties: {
            generateBlueprints: {
              type: 'boolean',
              description: 'Generate Blueprint classes (default: true)',
            },
            targetVersion: { type: 'string', description: 'Unreal Engine version (default: 5.3)' },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_pcg_graph',
    description:
      'Compile HoloScript procedural domain blocks to an Unreal PCG XML graph with typed spatial-operator ports and a GPU evaluation plan.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code with procedural blocks' },
        options: {
          type: 'object',
          properties: {
            gpuEvaluation: {
              type: 'boolean',
              description: 'Enable GPU spatial-operator evaluation hints',
            },
            seed: { type: 'number', description: 'Deterministic scatter seed override' },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_urdf',
    description: 'Compile HoloScript to URDF (Unified Robot Description Format) for ROS 2 / Gazebo',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: {
          type: 'object',
          properties: {
            robotName: { type: 'string', description: 'Robot name (default: holoscript_robot)' },
            includeInertial: {
              type: 'boolean',
              description: 'Include inertial properties (default: true)',
            },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_webgpu',
    description:
      'Compile HoloScript to WebGPU rendering code with WGSL shaders. ' +
      'SOVEREIGN TARGET — uses the native WebGPURenderer, not Three.js/R3F/Babylon. ' +
      'The result includes a `previewHtml` field: a self-contained HTML page that boots ' +
      'the sovereign GPU renderer directly in the browser with no third-party engine dependency. ' +
      'To serve it, POST {code} to /api/compile/webgpu-preview on the MCP server, or use ' +
      '/scene/:id?renderer=webgpu to re-render a stored scene via the sovereign path.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: {
          type: 'object',
          properties: {
            enableCompute: {
              type: 'boolean',
              description: 'Enable compute shaders (default: true)',
            },
            msaa: { type: 'number', description: 'MSAA sample count (default: 4)' },
          },
        },
      },
      required: ['code'],
    },
  },
  // compile_to_r3f — retired (apex-poison, 2026-06-17)

  // === Additional compile_to_* targets ===
  {
    name: 'compile_to_godot',
    description: 'Compile HoloScript to Godot Engine GDScript with scene (.tscn) generation',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_visionos',
    description: 'Compile HoloScript to Apple visionOS RealityKit Swift code',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_openxr',
    description: 'Compile HoloScript to OpenXR C++ application layer for cross-platform VR/AR',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  // compile_to_babylon, compile_to_playcanvas — retired (apex-poison, 2026-06-17)
  {
    name: 'compile_to_vrchat',
    description:
      'Compile HoloScript to VRChat SDK3. Current implementation emits legacy UdonSharp C#; Byte/Udon output is gated on the artifact contract.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: {
          type: 'object',
          properties: {
            outputFormat: {
              type: 'string',
              enum: ['udonsharp-csharp', 'udon-assembly', 'udon-bytecode'],
              description:
                'VRChat artifact family. Only udonsharp-csharp is currently implemented; Byte/Udon formats fail fast until the artifact contract is confirmed.',
            },
            useUdonSharp: {
              type: 'boolean',
              description:
                'Legacy alias for UdonSharp C# output. false maps to the gated Byte/Udon target family.',
            },
          },
          additionalProperties: true,
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_android',
    description: 'Compile HoloScript to Android ARCore Kotlin code',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_android_xr',
    description: 'Compile HoloScript to Android XR Kotlin code for Android headsets',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_quest',
    description:
      'Compile HoloScript to a complete native Meta Quest 3/3S app project (Horizon OS): Camera2 ' +
      'passthrough camera, ZXing QR decode, the ovrweb://webtask Quest Browser intent, and a ' +
      'signed-APK Gradle project. Distinct from compile_to_android_xr (which targets Google ' +
      'Android XR / Jetpack XR). Returns the full file set for the app project.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_ios',
    description: 'Compile HoloScript to iOS ARKit Swift code',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  // compile_to_ar — retired (apex-poison, 2026-06-17)
  {
    name: 'compile_to_wasm',
    description: 'Compile HoloScript to WebAssembly module',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_character_webgpu',
    description:
      'Compile an authored .holo CHARACTER composition to a native-WebGPU CharacterDrawSpec ' +
      'bundle (skinned mesh + joint palette + skin/hair/eye material groups) run by renderCharacter. ' +
      'Sovereign target; replaces the placeholder-cube fallthrough for character bodies.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript .holo character composition code' },
        options: { type: 'object', description: 'Optional { entityId } override' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_usd',
    description: 'Compile HoloScript to USD / USDA physics scene format',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_usdz',
    description: 'Compile HoloScript to USDZ package data for AR viewers',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_sdf',
    description:
      'Compile HoloScript to Gazebo SDF (Simulation Description Format) XML; not signed-distance-field ray marching',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  // compile_to_vrr — retired (apex-poison, 2026-06-17)
  {
    name: 'compile_to_multi_layer',
    description: 'Compile HoloScript to a multi-layer VR / VRR / AR bundle',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_ros2_deploy',
    description:
      'Compile HoloScript to a ROS 2 deployment bundle: URDF + Python launch file + controllers YAML (MoveIt 2 / ros2_control)',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        packageName: {
          type: 'string',
          description: 'ROS 2 package name (default: holoscript_robot)',
        },
        options: {
          type: 'object',
          properties: {
            useSimTime: { type: 'boolean' },
            rviz: { type: 'boolean' },
            gazebo: { type: 'boolean' },
            controllers: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_fmu',
    description:
      'Compile HoloScript to an FMI 3.0 FMU source bundle with CoSimulation/ModelExchange declarations and CAEL coupling provenance',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: {
          type: 'object',
          properties: {
            mode: {
              type: 'string',
              enum: ['co-simulation', 'model-exchange', 'both'],
              description: 'FMU mode to emit (default: both)',
            },
            modelIdentifier: { type: 'string', description: 'Optional FMI modelIdentifier' },
            includeSourceBundle: { type: 'boolean' },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'absorb_fmu',
    description:
      'Import FMI 3.0 modelDescription.xml or a HoloScript FMU manifest into a composable @fmu wrapper composition',
    inputSchema: {
      type: 'object',
      properties: {
        modelDescriptionXml: { type: 'string', description: 'Raw FMI modelDescription.xml' },
        manifest: { type: 'object', description: 'Optional HoloScript FMU manifest' },
        source: { type: 'string', description: 'FMU file/source URI' },
        name: { type: 'string', description: 'Optional wrapper object name' },
      },
    },
  },
  {
    name: 'compile_to_dtdl',
    description: 'Compile HoloScript to DTDL v3 (Digital Twin Definition Language) for Azure IoT',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_nir',
    description:
      'Compile HoloScript to NIR (Neuromorphic Intermediate Representation) for Intel Loihi 2, SpiNNaker 2',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  // compile_to_native_2d — retired (apex-poison, 2026-06-17)
  {
    name: 'compile_to_code_editor',
    description:
      'Compile a HoloScript composition annotated with @code_editor traits into a ' +
      'CodeMirror 6 configuration bundle (JSON). Used by Studio to load editor ' +
      'config from holoscript-editor.hs at runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript source (.hs/.holo) with @code_editor traits',
        },
        options: {
          type: 'object',
          description: 'Compiler options: indent (number), strictTraits (boolean)',
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_canvas2d_game',
    description:
      'Compile HoloScript to a self-contained, offline, playable retro 2D CANVAS GAME ' +
      '(HTML5 canvas, fixed-timestep loop, physics/collision, WebAudio, score, START/WIN/LOSE). ' +
      'Gameplay is derived from traits: @controllable=player, @grabbable=collectible, ' +
      '@collidable=hazard, @dialogue=goal, environment.gravity=physics, spatial_group origins=tiers. ' +
      'Unlike compile_to_native_2d (DOM/UI), this emits an actual game runtime.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code (.hs/.hsplus/.holo)' },
        options: {
          type: 'object',
          description: 'Compiler options',
          properties: {
            timeLimit: { type: 'number', description: 'Seconds on the game timer (default 70)' },
            title: {
              type: 'string',
              description: 'Game title / banner (defaults to composition name)',
            },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_node_service',
    description:
      'Compile HoloScript to Node.js Express/Fastify backend service. ' +
      'Supports @connector(name) for external services, @env(VAR) for env validation, ' +
      '@deploy(railway) for deployment config. Generates: routes, middleware, env config, ' +
      'connector init/shutdown, railway.json, Dockerfile, package.json.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'HoloScript composition code with @service, @connector, @env, @deploy traits',
        },
        options: {
          type: 'object',
          description: 'Compiler options',
          properties: {
            framework: {
              type: 'string',
              enum: ['express', 'fastify'],
              description: 'Target framework (default: express)',
            },
            port: { type: 'number', description: 'Base port (default: 3000)' },
            typescript: { type: 'boolean', description: 'Generate TypeScript (default: true)' },
            includeDocker: { type: 'boolean', description: 'Include Dockerfile (default: true)' },
            nodeVersion: {
              type: 'string',
              enum: ['18', '20', '22'],
              description: 'Node.js target (default: 20)',
            },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_a2a_agent_card',
    description:
      'Compile HoloScript to A2A Protocol Agent Card JSON (agent identity, skills, capabilities)',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_agent_inference',
    description:
      'Compile a HoloScript or HSPlus agent brain into a runnable inference project (agent script, tools, config, README)',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript / HSPlus agent brain source code' },
        options: {
          type: 'object',
          properties: {
            language: {
              type: 'string',
              enum: ['typescript', 'python'],
              description: 'Generated agent language (default: typescript)',
            },
            defaultProvider: {
              type: 'string',
              enum: ['anthropic', 'openai', 'local', 'ollama', 'custom'],
              description: 'Default model provider when no @model trait is present',
            },
            defaultModel: { type: 'string', description: 'Default model name' },
            defaultTemperature: { type: 'number', description: 'Default sampling temperature' },
            defaultMaxTokens: { type: 'number', description: 'Default max token budget' },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_daimon_seed',
    description:
      'Compile HoloScript to portable DaimonSeed IR: field priors, shared ContentPolicyGate JSON-Logic thresholds, provenance/emergence refs, export-fidelity custody semantics, and no serialized soul/runtime observation path.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description: 'HoloScript / HSPlus source to compile into a DaimonSeed recipe',
        },
        options: {
          type: 'object',
          properties: {
            seedId: {
              type: 'string',
              description: 'Optional deterministic seed identifier override',
            },
            domainSpecHash: {
              type: 'string',
              description: 'Optional domain-spec hash override',
            },
            provenanceChainRef: {
              type: 'string',
              description: 'T1 provenance-chain receipt reference',
            },
            emergenceContractRef: {
              type: 'string',
              description: 'T4 emergence contract reference',
            },
            noiseFloorRef: {
              type: 'string',
              description: 'Receipt/reference for reproducibility noise floor',
            },
            fieldPriors: {
              type: 'object',
              description: 'Tensor prior metadata: tensorSchema, shape, dtype, weightsRef',
            },
            thresholdFn: {
              type: 'object',
              description: 'JSON-Logic predicate evaluated by the shared ContentPolicyGate runtime',
            },
            thresholdFacts: {
              type: 'object',
              description: 'Facts used for threshold preview evaluation',
            },
            initialWeights: {
              type: 'object',
              description: 'Optional trait-vocabulary initial weights',
            },
          },
        },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_state',
    description: 'Compile HoloScript to reactive state shape JSON for agent brain configurations',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: { type: 'object' },
      },
      required: ['code'],
    },
  },
  {
    name: 'compile_to_3dgs',
    description:
      'Compile HoloScript to glTF 2.0 with KHR_gaussian_splatting extension. ' +
      'Accepts @gaussian_splat trait with positions/scales/rotations/colors/opacities, ' +
      'or raw point-cloud positions+colors (auto-computes covariance per splat). ' +
      'Output formats: glb (single binary) or gltf (JSON + .bin).',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: {
          type: 'object',
          properties: {
            format: {
              type: 'string',
              enum: ['glb', 'gltf'],
              description: 'Output format (default: glb)',
            },
            colorSpace: {
              type: 'string',
              enum: ['srgb_rec709_display', 'lin_rec709_display'],
              description: 'Color space for Gaussian colors (default: srgb_rec709_display)',
            },
            shDegree: {
              type: 'number',
              description: 'Maximum spherical-harmonics degree 0-3 (default: 0)',
            },
          },
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'compile_to_3dtiles',
    description:
      'Compile HoloScript Gaussian splats to a 3D Tiles 1.1 source bundle. ' +
      'Partitions @gaussian_splat data into spatial tile footprints, emits ' +
      'coarse/medium/fine LOD GLB payloads, tileset.json, stream-manifest.json, ' +
      'and CAEL per-tile provenance.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code with @gaussian_splat data' },
        options: {
          type: 'object',
          properties: {
            tileSizeMeters: {
              type: 'number',
              description: 'Spatial footprint size for each tile in meters (default: 50)',
            },
            lodLevels: {
              type: 'array',
              items: { type: 'string', enum: ['coarse', 'medium', 'fine'] },
              description: 'LOD levels to emit (default: coarse, medium, fine)',
            },
            streamBaseUrl: {
              type: 'string',
              description: 'Base URL used to derive the stream manifest URL',
            },
            streamId: {
              type: 'string',
              description: 'Stable stream id; generated from the composition hash when omitted',
            },
          },
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'stream_world_tiles',
    description:
      'Return a streamable 3D Tiles manifest for a HoloScript world. Emits a manifest URL, ' +
      'tileset.json, base64 GLB tile payload files, and CAEL tile provenance.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code with @gaussian_splat data' },
        options: {
          type: 'object',
          properties: {
            tileSizeMeters: {
              type: 'number',
              description: 'Spatial footprint size for each tile in meters (default: 50)',
            },
            streamBaseUrl: {
              type: 'string',
              description: 'Base URL used to derive the stream manifest URL',
            },
            streamId: {
              type: 'string',
              description: 'Stable stream id; generated from the composition hash when omitted',
            },
          },
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'compile_to_gaussian_train',
    description:
      'Compile a @gaussian_train trait into a SOVEREIGN 3D Gaussian Splat training job. ' +
      'The sovereign backend (default) runs the native differentiable trainer (GaussianTrainer3D + ' +
      'GaussianTrainer2D + Adam, gradient-checked) on our own GPU/CPU path — $0, no third-party ' +
      'runtime, no RENDER tokens (vs the legacy remote backend → api.rendernetwork.com). Emits a ' +
      'JSON GaussianTrainJob (executor + dataset refs + hyperparameters). Invalid configs throw at ' +
      'compile time. Distinct from compile_to_3dgs, which is a KHR_gaussian_splatting glTF BRIDGE.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code carrying a @gaussian_train trait' },
        options: {
          type: 'object',
          properties: {
            defaultBackend: {
              type: 'string',
              enum: ['sovereign', 'remote'],
              description: 'Backend when the trait omits it (default: sovereign — the native trainer)',
            },
          },
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'compile_to_edge',
    description:
      'Compile HoloScript to a self-contained deployment bundle for any Ollama-capable edge device ' +
      '(Jetson Orin/Nano/NX, Raspberry Pi 5, The Unit, any Linux ARM64/x86 node). ' +
      'DEFAULT runtime "agentrunner": emits holoscript_agent.service (systemd unit running the ' +
      'canonical TS AgentRunner — full gate stack: artifact-grounding, reflect, CAEL chain, ' +
      'content-hashed/signed hardware receipts, native cognitive verbs), setup.sh, manifest.json. ' +
      'LEGACY runtime "python" (deprecated, gate-less): emits agent.py (Ollama loop), monitor.py, ' +
      'setup.sh, holoscript_agent.service, manifest.json. ' +
      'Trait-conditional: ros2 colcon bridge (@ros2_actuation); tensorrt_loader.py (python only). ' +
      'Jetson flags set by @jetson, @tegrastats traits.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code (.hs/.hsplus/.holo)' },
        options: {
          type: 'object',
          description: 'EdgeCompiler options',
          properties: {
            ollamaUrl: {
              type: 'string',
              description: 'Ollama base URL on the target device (default: http://localhost:11434)',
            },
            model: {
              type: 'string',
              description: 'Ollama model name (default: qwen3:4b)',
            },
            platform: {
              type: 'string',
              enum: ['linux-arm64', 'linux-x86_64'],
              description: 'Target platform (default: linux-arm64)',
            },
            remotePath: {
              type: 'string',
              description: 'Deploy path on target device (default: /opt/holoscript)',
            },
            serviceUser: {
              type: 'string',
              description: 'systemd service user (default: holoscript)',
            },
            runtime: {
              type: 'string',
              enum: ['agentrunner', 'python'],
              description:
                'Edge runtime the unit runs. "agentrunner" (DEFAULT) = canonical TS AgentRunner ' +
                '(full gate stack). "python" = deprecated, gate-less standalone agent.',
            },
          },
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'compile_to_bot_swarm',
    description:
      'Compile an MMO composition to an in-process load + balance test harness for the ' +
      'Colyseus server emitted by compile_to_colyseus. Emits a TypeScript module exporting ' +
      'runBotSwarm(RoomClass, opts) — spawns a swarm of bot players against the real generated ' +
      'Room and drives the authoritative action loop (legal moves, speedhack attempts, ability ' +
      'spam), returning a BalanceReport (tick budget, anti-cheat rejections, receipts). Plus ' +
      'assertBalance(report) gated by the @balance_test envelope. Runs entirely in-process — the ' +
      'verification layer + game-balance CI seed for the authoritative server.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript MMO composition (.holo)' },
        options: {
          type: 'object',
          description: 'BotSwarmCompiler options',
          properties: {
            bots: { type: 'number', description: 'Default bot count baked into the harness (default: 24)' },
            ticks: { type: 'number', description: 'Default tick count (default: 100)' },
            speedhackRatio: {
              type: 'number',
              description: 'Fraction of moves that attempt a speedhack teleport (default: 0.15)',
            },
          },
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'compile_to_dungeon_instance',
    description:
      'Compile dungeon_instance blocks into a server-authoritative instance pool (P2.6). Emits a ' +
      'TypeScript module exporting DUNGEON_REGISTRY + a DungeonInstancePool class: per-party ' +
      'instanced content (dungeon/raid) spun up on demand, capped at max_instances, released on a ' +
      'reset timer. Completion emits a receipt sealed against the dungeon + instance + party. Each ' +
      "dungeon's completion_quest is compile-validated against the composition's declared quests — " +
      'an undeclared quest is a compile error (typed-predicate guarantee). RoomClass-agnostic.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript MMO composition (.holo) with dungeon_instance blocks' },
      },
      required: ['code'],
    },
  },

  {
    name: 'compile_to_world_shard',
    description:
      'Compile world_shard blocks into a server-authoritative shard router + multi-room bootstrap ' +
      '(P2.5). A single world is partitioned into AABB shards, each hosted as its own Colyseus room. ' +
      'Emits SHARD_REGISTRY + shardForPosition() + a ShardRouter class (route / requestHandoff / ' +
      'createShardServers). Cross-shard handoff is RECEIPT-SEALED and validated — the target must be ' +
      'a declared NEIGHBOR of the origin and the position inside its bounds (anti-teleport). Each ' +
      "shard's neighbors are compile-validated against declared shards. Same-machine multi-room.",
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript MMO composition (.holo) with world_shard blocks' },
      },
      required: ['code'],
    },
  },

  {
    name: 'compile_to_mcp_config',
    description:
      'Compile .holo MCP server connection definitions to IDE-specific client config JSON. ' +
      'This emits mcpServers connection entries, not an MCP server manifest with tools or resources. ' +
      'One source, multiple outputs: claude (${VAR}), vscode (${env:VAR}), ' +
      'cursor (${VAR}), antigravity (literal key injection), generic.',
    inputSchema: {
      type: 'object',
      properties: {
        code: {
          type: 'string',
          description:
            'HoloScript with MCP client connection server objects using @connector and @env traits. ' +
            'Example: server my_server { @connector(holoscript, transport: "http") url: "https://mcp.holoscript.net/mcp" @env(HOLOSCRIPT_API_KEY, header: "Authorization: Bearer") }',
        },
        target: {
          type: 'string',
          enum: ['claude', 'vscode', 'cursor', 'antigravity', 'generic'],
          description: 'Target IDE format (default: generic)',
        },
        envValues: {
          type: 'object',
          description:
            'Key-value map of env var values for literal injection (required for antigravity target). ' +
            'Example: {"HOLOSCRIPT_API_KEY": "USNo/..."}',
        },
      },
      required: ['code'],
    },
  },

  {
    name: 'compile_to_mcp_server',
    description:
      'Compile a HoloScript trait/brain composition into a standalone MCP server TypeScript module. ' +
      'Walks the composition for llm_agent, goal_oriented, rag_knowledge, agent_memory, and tool traits ' +
      'and emits: TOOLS[] definition, HoloMCPRuntimeAdapter interface, registerAdapter(), ' +
      'verifyContractWiring(), handleToolCall(), and governance metadata. ' +
      'The output is a self-contained .mcp-server.ts file — no external HoloScript imports at runtime. ' +
      'Usage: define objects with @llm_agent or @tool traits, compile to get a ready-to-wire MCP module.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code with agent/tool traits' },
        options: {
          type: 'object',
          properties: {
            serverName: { type: 'string', description: 'MCP server name (default: holoscript-mcp)' },
            serverVersion: { type: 'string', description: 'Server version string (default: 1.0.0)' },
          },
        },
      },
      required: ['code'],
    },
  },

  // Quantum Circuit Compilation ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â HoloScript ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ OpenQASM 3.0 (D.056 BUILD step)
  {
    name: 'compile_to_qasm',
    description:
      'Compile HoloScript source to OpenQASM 3.0 quantum circuit. ' +
      'Walks the composition for the first @quantumCircuit (or @quantum_circuit) trait node and ' +
      'emits a fully-formed OpenQASM 3.0 string plus rich metadata (numQubits, numClbits, ' +
      'estimatedDepth, circuitType, recommendedBackend, warnings, molecule, weightMatrix). ' +
      'Supported circuit families: vqe (hardware-efficient VQE ansatz), qaoa (Max-Cut QAOA), ' +
      'stub (1-qubit when no quantum trait is found). ' +
      'Jordan-Wigner / sto-3g qubit mapping: HÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢2q, C/N/O/FÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢10q, othersÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢18q.',
    inputSchema: {
      type: 'object',
      properties: {
        source: {
          type: 'string',
          description:
            'HoloScript source code containing a @quantumCircuit or @quantum_circuit trait. ' +
            'Example: ' +
            'object N2 { @quantumCircuit(molecule: [{symbol:"N",x:0,y:0,z:0},{symbol:"N",x:0,y:0,z:1.0975}], circuitType: "vqe", ansatzDepth: 2) }',
        },
      },
      required: ['source'],
    },
  },

  // SVG vector graphics — SOVEREIGN TARGET
  {
    name: 'compile_to_svg',
    description:
      'Compile HoloScript to SVG vector graphics. SOVEREIGN TARGET — pure SVG output, no third-party engine. ' +
      'Useful for diagrams, HoloMap exports, data visualization panels, and 2D schematic generation.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            viewBox: { type: 'string', description: 'SVG viewBox attribute (e.g. "0 0 800 600").' },
            includeGrid: { type: 'boolean', description: 'Overlay a grid guide in the output SVG.' },
          },
        },
      },
      required: ['code'],
    },
  },

  // HoloBytecode — SOVEREIGN TARGET
  {
    name: 'compile_to_holob',
    description:
      'Compile HoloScript to HoloBytecode for the HoloVM native ECS executor. ' +
      'SOVEREIGN TARGET — the bytecode runs directly on the HoloVM at 60-90Hz with no third-party engine dependency.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            optimizationLevel: { type: 'number', description: 'Bytecode optimization level (0 = none, 1 = basic, 2 = full).' },
          },
        },
      },
      required: ['code'],
    },
  },

  // OpenAPI 3.1 spec
  {
    name: 'compile_to_openapi',
    description:
      'Compile HoloScript node service definitions to OpenAPI 3.1 spec (JSON). ' +
      'Bridge to REST API tooling, Swagger UI, client SDK generators.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'yaml'], description: 'Output format (default: json).' },
            title: { type: 'string', description: 'API title for the OpenAPI info block.' },
          },
        },
      },
      required: ['code'],
    },
  },

  // ONNX model descriptor
  {
    name: 'compile_to_onnx',
    description:
      'Compile HoloScript brain compositions to ONNX model descriptor JSON. ' +
      'Bridge to ONNX Runtime, fleet inference, and Brittney training pipelines.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            opsetVersion: { type: 'number', description: 'ONNX opset version (default: 17).' },
          },
        },
      },
      required: ['code'],
    },
  },

  // Flutter/Dart widget code
  {
    name: 'compile_to_flutter',
    description:
      'Compile HoloScript to Flutter/Dart widget code. ' +
      "Bridge to Flutter's iOS/Android/desktop/web runtime.",
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            packageName: { type: 'string', description: 'Dart package name for the generated widget.' },
            stateful: { type: 'boolean', description: 'Emit a StatefulWidget instead of StatelessWidget.' },
          },
        },
      },
      required: ['code'],
    },
  },

  // STL export for 3D printing
  {
    name: 'compile_to_stl_export',
    description:
      'Compile HoloScript to STL (Standard Tessellation Language) ASCII format for 3D printing. ' +
      'Bridge to physical-world fabrication — digital twin → physical twin.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            scale: { type: 'number', description: 'Uniform scale factor applied to all geometry (default: 1.0).' },
            mergeObjects: { type: 'boolean', description: 'Merge all objects into a single STL solid.' },
          },
        },
      },
      required: ['code'],
    },
  },

  // Snapchat Lens Studio AR
  {
    name: 'compile_to_lens_studio',
    description:
      "Compile HoloScript to Snapchat Lens Studio AR lens format. Bridge to Snapchat's AR distribution platform (700M+ users).",
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            apiVersion: { type: 'string', description: 'Lens Studio API version string (e.g. "5.0").' },
          },
        },
      },
      required: ['code'],
    },
  },

  // Colyseus multiplayer server
  {
    name: 'compile_to_colyseus',
    description:
      'Compile HoloScript to Colyseus multiplayer game server room code (TypeScript). ' +
      'Bridge to authoritative MMO/multiplayer backend. Key for AAA game compilation.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            roomName: { type: 'string', description: 'Colyseus room class name.' },
            tickRate: { type: 'number', description: 'Server tick rate in Hz (default: 20).' },
            maxClients: { type: 'number', description: 'Maximum concurrent clients per room instance.' },
          },
        },
      },
      required: ['code'],
    },
  },

  // Android XR AI Glasses
  {
    name: 'compile_to_ai_glasses',
    description:
      'Compile HoloScript to Android XR AI Glasses (Kotlin Compose Glimmer) for Samsung Galaxy XR, Warby Parker, Gentle Monster. ' +
      'Bridge to transparent HUD overlay displays.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            fovDegrees: { type: 'number', description: 'Horizontal field-of-view in degrees for the target glasses display.' },
          },
        },
      },
      required: ['code'],
    },
  },

  // Structural Causal Model DAG
  {
    name: 'compile_to_scm',
    description:
      'Compile HoloScript to Structural Causal Model DAG JSON for ML causal inference. ' +
      'Bridge to do-calculus, intervention analysis, and causal ML pipelines.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            modelName: { type: 'string', description: 'Name for the root causal model node.' },
            privacyMask: { type: 'boolean', description: 'Mask variable names in the output DAG.' },
          },
        },
      },
      required: ['code'],
    },
  },

  // Solidity ERC-1155 NFT marketplace
  {
    name: 'compile_to_nft_marketplace',
    description:
      'Compile HoloScript to Solidity ERC-1155 smart contracts with lazy minting, ERC-2981 royalties, and multi-chain deployment scripts.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: {
          type: 'object',
          properties: {
            chain: { type: 'string', description: 'Target chain identifier (e.g. "ethereum", "polygon", "base").' },
            royaltyBps: { type: 'number', description: 'ERC-2981 royalty in basis points (e.g. 500 = 5%).' },
          },
        },
      },
      required: ['code'],
    },
  },

  // Trait Shader Language — SOVEREIGN
  {
    name: 'compile_to_tsl',
    description:
      'Compile HoloScript to Trait Shader Language (TSL) — SOVEREIGN — native trait-to-shader codegen running on HoloScript\'s WebGPU path.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: { type: 'object', properties: {} },
      },
      required: ['code'],
    },
  },

  // compile_to_phone_sleeve_vr — retired (apex-poison, 2026-06-17)

  // OpenXR Spatial Entity persistence
  {
    name: 'compile_to_openxr_spatial_entities',
    description:
      'Compile HoloScript to OpenXR Spatial Entity persistence format using XR_FB_spatial_entity_storage extension. ' +
      'Bridge to persistent AR anchors on Quest 3 and OpenXR runtimes.',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript source code.' },
        options: { type: 'object', properties: {} },
      },
      required: ['code'],
    },
  },

  // Job tracking and circuit breaker tools
  {
    name: 'get_compilation_status',
    description:
      'Get status of a compilation job by job ID. Returns progress, result, and timing information.',
    inputSchema: {
      type: 'object',
      properties: {
        jobId: {
          type: 'string',
          description: 'Job ID returned from compile_holoscript',
        },
      },
      required: ['jobId'],
    },
  },
  {
    name: 'list_export_targets',
    description:
      'List all available HoloScript export targets with categories (Game Engines, VR Platforms, Web, Robotics, etc.) and sovereignty classification per target (sovereign = native HoloScript runtime/renderer; bridge = emits to third-party engine; mode = compile orchestrator).',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_circuit_breaker_status',
    description:
      'Get circuit breaker status for a specific export target. Shows failure rate, degraded mode time, and retry availability.',
    inputSchema: {
      type: 'object',
      properties: {
        target: {
          type: 'string',
          enum: [
            'urdf',
            'sdf',
            'unity',
            'unreal',
            'pcg-graph',
            'godot',
            'vrchat',
            'openxr',
            'android',
            'android-xr',
            'ios',
            'visionos',
            // 'ar', 'babylon', 'r3f', 'playcanvas', 'vrr' — retired apex-poison 2026-06-17
            'webgpu',
            'wasm',
            'usd',
            'usdz',
            'fmu',
            'dtdl',
            'multi-layer',
            '3dgs',
            '3dtiles',
            'daimon-seed',
          ],
          description: 'Export target to check',
        },
      },
      required: ['target'],
    },
  },
  // Audit tools (automated number consistency)
  ...auditTools,
  ...alphafoldTools,
];
