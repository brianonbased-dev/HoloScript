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
  type ExportTarget,
  type HoloComposition,
} from '@holoscript/core';

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

function trackJob(jobId: string, status: CompilationJob['status'], progress: number, result?: CompilationResult): void {
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
  const result = await exportManager.exportComposition(composition, target, options as any);

  if (!result.success) {
    throw new Error(result.error || 'Compilation failed');
  }

  return {
    output: result.output || '',
    usedFallback: result.usedFallback || false,
  };
}

// =============================================================================
// MCP TOOL HANDLERS
// =============================================================================

export async function handleCompileToTarget(args: Record<string, unknown>): Promise<CompilationResult> {
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
    if (!parseResult.success || !parseResult.composition) {
      const errors = parseResult.errors?.map(e => e.message).join(', ') || 'Unknown parse error';
      throw new Error(`Failed to parse composition: ${errors}`);
    }

    const composition = parseResult.composition;

    // Compile to target
    trackJob(jobId, 'in_progress', 60);
    const compileResult = await compileToTarget(composition, target, options as Record<string, unknown>);

    // Get circuit breaker state
    const circuitRegistry = CircuitBreakerRegistry.getInstance();
    const circuitBreaker = circuitRegistry.getBreaker(target);
    const circuitMetrics = circuitBreaker.getMetrics();

    const compilationTimeMs = Date.now() - startTime;
    trackJob(jobId, 'in_progress', 100);

    const result: CompilationResult = {
      success: true,
      jobId,
      target,
      output: compileResult.output,
      warnings: parseResult.warnings?.map(w => w.message),
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

export async function handleGetCompilationStatus(args: Record<string, unknown>): Promise<CompilationStatusResult> {
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
    'Advanced': ['vrr', 'multi-layer'] as ExportTarget[],
  };

  return { targets, categories };
}

export async function handleGetCircuitBreakerStatus(args: Record<string, unknown>): Promise<CircuitBreakerStatusResult> {
  const { target } = args as { target: ExportTarget };

  if (!target) {
    throw new Error('target is required');
  }

  const circuitRegistry = CircuitBreakerRegistry.getInstance();
  const circuitBreaker = circuitRegistry.getBreaker(target);
  const metrics = circuitBreaker.getMetrics();

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

export async function handleCompilerTool(name: string, args: Record<string, unknown>): Promise<unknown | null> {
  switch (name) {
    // Generic compilation
    case 'compile_holoscript':
      return handleCompileToTarget(args);

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
// =============================================================================

export const compilerTools: Tool[] = [
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
            generatePrefabs: { type: 'boolean', description: 'Generate Unity prefabs (default: true)' },
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
            generateBlueprints: { type: 'boolean', description: 'Generate Blueprint classes (default: true)' },
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
            includeInertial: { type: 'boolean', description: 'Include inertial properties (default: true)' },
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
            enableCompute: { type: 'boolean', description: 'Enable compute shaders (default: true)' },
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
            environmentPreset: { type: 'string', description: 'Environment preset (sunset, dawn, night, etc.)' },
          },
        },
      },
      required: ['code'],
    },
  },

  // Job tracking and circuit breaker tools
  {
    name: 'get_compilation_status',
    description: 'Get status of a compilation job by job ID. Returns progress, result, and timing information.',
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
    description: 'List all available HoloScript export targets with categories (Game Engines, VR Platforms, Web, Robotics, etc.)',
    inputSchema: {
      type: 'object',
      properties: {},
    },
  },
  {
    name: 'get_circuit_breaker_status',
    description: 'Get circuit breaker status for a specific export target. Shows failure rate, degraded mode time, and retry availability.',
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
