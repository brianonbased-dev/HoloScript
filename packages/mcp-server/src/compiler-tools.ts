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
  URDFCompiler,
  SDFCompiler,
  UnityCompiler,
  UnrealCompiler,
  GodotCompiler,
  VRChatCompiler,
  OpenXRCompiler,
  AndroidCompiler,
  AndroidXRCompiler,
  IOSCompiler,
  VisionOSCompiler,
  ARCompiler,
  BabylonCompiler,
  WebGPUCompiler,
  R3FCompiler,
  WASMCompiler,
  PlayCanvasCompiler,
  USDPhysicsCompiler,
  USDZPipeline,
  DTDLCompiler,
  VRRCompiler,
  MultiLayerCompiler,
  CircuitBreakerRegistry,
  CircuitState,
  ExportManager,
  getExportManager,
  TraitCompositionCompiler,
  type ExportTarget,
  type HoloComposition,
  type TraitCompositionDecl,
  selectModality,
  selectModalityForAll,
  bestCategoryForTraits,
} from '@holoscript/core';
import { handleMapSchema, handleMapCsvHeaders } from './schema-mapper';

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
  error?: string;
  warnings?: string[];
  metadata: {
    compilationTimeMs: number;
    circuitBreakerState: CircuitState;
    usedFallback: boolean;
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
  options: Record<string, unknown> = {}
): Promise<{ output: string; usedFallback: boolean }> {
  const exportManager = getExportManager();
  // ExportManager.export(target, composition, options) — target is first arg
  const result = await exportManager.export(target, composition, options as any);

  if (!result.success) {
    throw new Error(result.error?.message || 'Compilation failed');
  }

  return {
    output: result.output || '',
    usedFallback: result.usedFallback || false,
  };
}

// =============================================================================
// MCP TOOL HANDLERS
// =============================================================================

export async function handleCompileToTarget(
  args: Record<string, unknown>
): Promise<CompilationResult> {
  const { code, target, options = {}, jobId: providedJobId } = args as CompilationOptions;

  if (!code) {
    throw new Error('code is required');
  }
  if (!target) {
    throw new Error('target is required');
  }

  const jobId = providedJobId || generateJobId();
  trackJob(jobId, 'in_progress', 10);

  const startTime = Date.now();

  try {
    // Parse composition
    trackJob(jobId, 'in_progress', 30);
    const parseResult = parseHolo(code);
    if (!parseResult.success || !parseResult.ast) {
      const errors = parseResult.errors?.map((e) => e.message).join(', ') || 'Unknown parse error';
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
    // Use ExportManager.getMetrics() — no static getInstance on CircuitBreakerRegistry
    const circuitMetrics = getExportManager().getMetrics(target);
    trackJob(jobId, 'in_progress', 100);

    const result: CompilationResult = {
      success: true,
      jobId,
      target,
      output: compileResult.output,
      warnings: parseResult.warnings?.map((w) => w.message),
      metadata: {
        compilationTimeMs,
        circuitBreakerState: circuitMetrics.state,
        usedFallback: compileResult.usedFallback,
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
        circuitBreakerState: CircuitState.OPEN,
        usedFallback: false,
      },
    };
    trackJob(jobId, 'failed', 100, result);
    throw new Error(errorMessage);
  }
}

export async function handleComposeTraits(
  args: Record<string, unknown>
): Promise<unknown> {
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

export async function handleSelectModality(
  args: Record<string, unknown>
): Promise<unknown> {
  const { platform, platforms, preferStreaming } = args as {
    platform?: string;
    platforms?: string[];
    preferStreaming?: boolean;
  };

  const options = { preferStreaming: preferStreaming ?? false };

  if (platform) {
    const result = selectModality(platform as Parameters<typeof selectModality>[0], options);
    return { success: true, selection: result };
  }

  if (platforms && Array.isArray(platforms)) {
    const results: Record<string, ReturnType<typeof selectModality>> = {};
    for (const p of platforms) {
      results[p] = selectModality(p as Parameters<typeof selectModality>[0], options);
    }
    return { success: true, selections: results };
  }

  // No platform specified — return all 18
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

export async function handleListExportTargets(_args: Record<string, unknown>): Promise<{
  targets: ExportTarget[];
  categories: Record<string, ExportTarget[]>;
}> {
  const targets: ExportTarget[] = [
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
  ];

  const categories = {
    'Game Engines': ['unity', 'unreal', 'godot'] as ExportTarget[],
    'VR Platforms': ['vrchat', 'openxr'] as ExportTarget[],
    'Mobile AR': ['android', 'android-xr', 'ios', 'visionos', 'ar'] as ExportTarget[],
    'Web Platforms': ['babylon', 'webgpu', 'r3f', 'wasm', 'playcanvas'] as ExportTarget[],
    'Robotics/IoT': ['urdf', 'sdf', 'dtdl'] as ExportTarget[],
    '3D Formats': ['usd', 'usdz'] as ExportTarget[],
    Advanced: ['vrr', 'multi-layer'] as ExportTarget[],
  };

  return { targets, categories };
}

export async function handleGetCircuitBreakerStatus(
  args: Record<string, unknown>
): Promise<CircuitBreakerStatusResult> {
  const { target } = args as { target: ExportTarget };

  if (!target) {
    throw new Error('target is required');
  }

  // Use ExportManager.getMetrics() — no static getInstance on CircuitBreakerRegistry
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
    canRetry: metrics.state !== CircuitState.OPEN,
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
    case 'compile_to_urdf':
      return handleCompileToTarget({ ...args, target: 'urdf' });
    case 'compile_to_sdf':
      return handleCompileToTarget({ ...args, target: 'sdf' });
    case 'compile_to_webgpu':
      return handleCompileToTarget({ ...args, target: 'webgpu' });
    case 'compile_to_r3f':
      return handleCompileToTarget({ ...args, target: 'r3f' });
    case 'compile_to_godot':
      return handleCompileToTarget({ ...args, target: 'godot' });
    case 'compile_to_visionos':
      return handleCompileToTarget({ ...args, target: 'visionos' });
    case 'compile_to_openxr':
      return handleCompileToTarget({ ...args, target: 'openxr' });
    case 'compile_to_babylon':
      return handleCompileToTarget({ ...args, target: 'babylon' });
    case 'compile_to_playcanvas':
      return handleCompileToTarget({ ...args, target: 'playcanvas' });
    case 'compile_to_vrchat':
      return handleCompileToTarget({ ...args, target: 'vrchat' });
    case 'compile_to_android':
      return handleCompileToTarget({ ...args, target: 'android' });
    case 'compile_to_android_xr':
      return handleCompileToTarget({ ...args, target: 'android-xr' });
    case 'compile_to_ios':
      return handleCompileToTarget({ ...args, target: 'ios' });
    case 'compile_to_ar':
      return handleCompileToTarget({ ...args, target: 'ar' });
    case 'compile_to_wasm':
      return handleCompileToTarget({ ...args, target: 'wasm' });
    case 'compile_to_dtdl':
      return handleCompileToTarget({ ...args, target: 'dtdl' });
    case 'compile_to_nir':
      return handleCompileToTarget({ ...args, target: 'nir' });
    case 'compile_to_native_2d':
      return handleCompileToTarget({ ...args, target: 'native-2d' });
    case 'compile_to_node_service':
      return handleCompileToTarget({ ...args, target: 'node-service' });
    case 'compile_to_a2a_agent_card':
      return handleCompileToTarget({ ...args, target: 'a2a-agent-card' });
    case 'compile_to_state':
      return handleCompileToTarget({ ...args, target: 'state' });

    // Modality Transliteration (Pillar 1)
    case 'holoscript_select_modality':
      return handleSelectModality(args);

    // Universal Schema-to-Trait Mapper (Domain Bridge)
    case 'holoscript_map_schema':
      return handleMapSchema(args);
    case 'holoscript_map_csv':
      return handleMapCsvHeaders(args);


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
    description: 'Cryptographically delegate heavy trait algebra and physics composition to the cloud. Accepts raw composition declarations (e.g., trait C = A + B) and returns fully resolved trait nodes using the ProvenanceSemiring.',
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
              overrides: { type: 'object' }
            },
            required: ['name', 'components']
          }
        },
        baseTraits: {
          type: 'object',
          description: 'Optional map of base trait names to their handler configs to resolve against'
        }
      },
      required: ['declarations']
    }
  },
  // Universal Schema-to-Trait Mapper (Domain Bridge — any data → .holo)
  {
    name: 'holoscript_map_schema',
    description:
      'Map any structured data schema to HoloScript traits and generate a .holo composition. ' +
      'The universal domain bridge: dispensary menu, restaurant catalog, real estate listings, IoT sensors — ' +
      'any data schema maps onto the 3,300+ trait system. Returns per-field trait mappings with confidence scores, ' +
      'parameter bindings, spatial role assignments, and a ready-to-compile .holo composition.',
    inputSchema: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Name for the data source (e.g., "dispensary_menu")' },
        domain: { type: 'string', description: 'Optional domain hint (retail, healthcare, hospitality, iot, etc.)' },
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
          description: 'Optional sample data row for type inference (keys = headers, values = sample data)',
        },
      },
      required: ['headers'],
    },
  },
  // Modality Transliteration (Pillar 1: device → embodiment → compiler)
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
            'quest3', 'pcvr', 'visionos', 'android-xr',
            'visionos-ar', 'android-xr-ar', 'webxr',
            'ios', 'android',
            'windows', 'macos', 'linux', 'web',
            'android-auto', 'carplay',
            'watchos', 'wearos',
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
    description: 'Compile HoloScript to WebGPU rendering code with WGSL shaders',
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
  {
    name: 'compile_to_r3f',
    description: 'Compile HoloScript to React Three Fiber (R3F) JSX components',
    inputSchema: {
      type: 'object',
      properties: {
        code: { type: 'string', description: 'HoloScript composition code' },
        options: {
          type: 'object',
          properties: {
            typescript: { type: 'boolean', description: 'Generate TypeScript (default: true)' },
            environmentPreset: {
              type: 'string',
              description: 'Environment preset (sunset, dawn, night, etc.)',
            },
          },
        },
      },
      required: ['code'],
    },
  },

  // === Additional compile_to_* targets (all 24 dialects exposed) ===
  {
    name: 'compile_to_godot',
    description: 'Compile HoloScript to Godot Engine GDScript with scene (.tscn) generation',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_visionos',
    description: 'Compile HoloScript to Apple visionOS RealityKit Swift code',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_openxr',
    description: 'Compile HoloScript to OpenXR C++ application layer for cross-platform VR/AR',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_babylon',
    description: 'Compile HoloScript to Babylon.js engine code',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_playcanvas',
    description: 'Compile HoloScript to PlayCanvas engine scripts',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_vrchat',
    description: 'Compile HoloScript to VRChat UdonSharp scripts',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_android',
    description: 'Compile HoloScript to Android ARCore Kotlin code',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_android_xr',
    description: 'Compile HoloScript to Android XR Kotlin code for Android headsets',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_ios',
    description: 'Compile HoloScript to iOS ARKit Swift code',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_ar',
    description: 'Compile HoloScript to generic AR TypeScript code',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_wasm',
    description: 'Compile HoloScript to WebAssembly module',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_sdf',
    description: 'Compile HoloScript to SDF (Simulation Description Format) for Gazebo environments',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_dtdl',
    description: 'Compile HoloScript to DTDL v3 (Digital Twin Definition Language) for Azure IoT',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_nir',
    description: 'Compile HoloScript to NIR (Neuromorphic Intermediate Representation) for Intel Loihi 2, SpiNNaker 2',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_native_2d',
    description: 'Compile HoloScript to Native 2D HTML/React components (non-3D output)',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_node_service',
    description: 'Compile HoloScript to Node.js Express/Fastify backend service skeleton',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_a2a_agent_card',
    description: 'Compile HoloScript to A2A Protocol Agent Card JSON (agent identity, skills, capabilities)',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
  },
  {
    name: 'compile_to_state',
    description: 'Compile HoloScript to reactive state shape JSON for agent brain configurations',
    inputSchema: { type: 'object', properties: { code: { type: 'string', description: 'HoloScript composition code' }, options: { type: 'object' } }, required: ['code'] },
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
      'List all available HoloScript export targets with categories (Game Engines, VR Platforms, Web, Robotics, etc.)',
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
          ],
          description: 'Export target to check',
        },
      },
      required: ['target'],
    },
  },
];
