/**
 * Live Preview Service
 *
 * Hot reload shader compilation with error recovery, performance monitoring,
 * and WebGPU shader module creation.
 *
 * Features:
 * - Detect changes → recompile → update material
 * - Compilation caching to avoid redundant recompilation
 * - Error recovery with fallback to last valid shader
 * - Performance monitoring (compilation time, FPS tracking)
 * - WebGPU shader module creation
 */

import { ShaderGraph } from '@/lib/shaderGraph';
import type { ICompiledShader } from '@/lib/shaderGraph';
import { logger } from '@/lib/logger';
import { translateGraphToWGSL } from '@/core/rendering/WGSLTranslator';
import type { GNode, GEdge } from '@/lib/nodeGraphStore';

type compileShaderGraph = (
  graph: ShaderGraph,
  opts: { target: string; optimize: boolean; debug: boolean }
) => ICompiledShader;

// ── Vertex shader (passthrough) ────────────────────────────────────────────
// Mirrors the VertexInput / VertexOutput structs emitted by WGSLTranslator so
// the vertex stage and fragment stage share the same interface.
const VERTEX_WGSL = `
struct VertexInput {
  @location(0) position: vec3f,
  @location(1) uv: vec2f,
  @location(2) normal: vec3f,
};

struct VertexOutput {
  @builtin(position) position: vec4f,
  @location(0) vUv: vec2f,
  @location(1) vNormal: vec3f,
};

@vertex
fn main(in: VertexInput) -> VertexOutput {
  var out: VertexOutput;
  out.position = vec4f(in.position, 1.0);
  out.vUv = in.uv;
  out.vNormal = in.normal;
  return out;
}
`.trim();

// ── ShaderGraph → WGSLTranslator adapter ─────────────────────────────────────

/** Map legacy NODE_REGISTRY names to WGSLTranslator node types. */
function mapShaderNodeType(type: string): string {
  const map: Record<string, string> = {
    constant_float: 'float',
    constant_color: 'ColorConstant',
    constant_vec3: 'vec3',
    add: 'AddNode',
    multiply: 'MultiplyNode',
    texture2d: 'Texture2D',
    output_surface: 'PBROutput',
    noise: 'NoiseNode',
  };
  return map[type] ?? type;
}

/** Map port names where ShaderGraph and WGSLTranslator differ. */
function mapTargetPort(port: string, targetNodeType?: string): string {
  if (targetNodeType === 'output_surface' && port === 'baseColor') {
    return 'albedo';
  }
  return port;
}

/** Convert ShaderGraph (IShaderNode / IShaderConnection) to WGSLTranslator inputs. */
function adaptShaderGraphToWGSL(
  graph: ShaderGraph
): { nodes: GNode[]; edges: GEdge[] } {
  const nodes: GNode[] = Array.from(graph.nodes.values()).map((n) => {
    const mappedType = mapShaderNodeType(n.type);
    return {
      id: n.id,
      type: mappedType,
      position: n.position,
      data: { ...n.properties, type: mappedType },
    } as GNode;
  });

  const edges: GEdge[] = graph.connections.map((c) => {
    const targetNode = graph.nodes.get(c.toNodeId);
    return {
      id: c.id,
      source: c.fromNodeId,
      target: c.toNodeId,
      sourceHandle: c.fromPort,
      targetHandle: mapTargetPort(c.toPort, targetNode?.type),
    } as GEdge;
  });

  return { nodes, edges };
}

/** Parse uniform buffer fields and texture bindings from generated WGSL. */
function extractUniformsFromWGSL(wgsl: string): {
  uniforms: ICompiledShader['uniforms'];
  textures: string[];
} {
  const uniforms: ICompiledShader['uniforms'] = [];
  const textures: string[] = [];

  // Texture bindings: @group(0) @binding(N) var uTexture_X: texture_2d<f32>;
  const textureRegex = /@group\(0\) @binding\(\d+\) var (uTexture_[a-zA-Z0-9_]+): texture_2d<f32>;/g;
  let match: RegExpExecArray | null;
  while ((match = textureRegex.exec(wgsl)) !== null) {
    textures.push(match[1]);
  }

  // Uniform struct fields
  const uniformStructRegex = /struct Uniforms \{([^}]+)\}/;
  const structMatch = uniformStructRegex.exec(wgsl);
  if (structMatch) {
    const body = structMatch[1];
    const fieldRegex = /(\w+):\s*(\w+),/g;
    let fieldMatch: RegExpExecArray | null;
    while ((fieldMatch = fieldRegex.exec(body)) !== null) {
      const name = fieldMatch[1].trim();
      const type = fieldMatch[2].trim();
      if (name.startsWith('_pad')) continue;
      // Map WGSL types to the names expected by LivePreviewService
      const mappedType =
        type === 'f32'
          ? 'float'
          : type === 'mat4x4'
          ? 'mat4'
          : type.startsWith('vec')
          ? type.replace('f', '') // vec2f → vec2, vec3f → vec3, vec4f → vec4
          : type;
      uniforms.push({ name, type: mappedType });
    }
  }

  return { uniforms, textures };
}

// ── Real graph compiler ──────────────────────────────────────────────────────

const compileShaderGraph: compileShaderGraph = (graph, _opts) => {
  const nodes = Array.from(graph.nodes.values());
  const hasOutput = nodes.some((n) => n.type === 'output_surface');

  if (!hasOutput && nodes.length > 0) {
    return {
      vertexCode: '',
      fragmentCode: '',
      uniforms: [],
      textures: [],
      warnings: [],
      errors: ['Shader graph has no output node'],
    };
  }

  try {
    const { nodes: gNodes, edges: gEdges } = adaptShaderGraphToWGSL(graph);
    const result = translateGraphToWGSL(gNodes, gEdges);

    if (!result.ok || !result.wgsl) {
      return {
        vertexCode: '',
        fragmentCode: '',
        uniforms: [],
        textures: [],
        warnings: [],
        errors: result.errors ?? ['WGSL compilation failed'],
      };
    }

    const { uniforms, textures } = extractUniformsFromWGSL(result.wgsl);

    return {
      vertexCode: VERTEX_WGSL,
      fragmentCode: result.wgsl,
      uniforms,
      textures,
      warnings: [],
      errors: [],
    };
  } catch (error) {
    return {
      vertexCode: '',
      fragmentCode: '',
      uniforms: [],
      textures: [],
      warnings: [],
      errors: [error instanceof Error ? error.message : String(error)],
    };
  }
};

// ============================================================================
// Types
// ============================================================================

/**
 * Preview mesh configuration
 */
export interface PreviewMeshConfig {
  geometry: 'sphere' | 'cube' | 'plane' | 'torus' | 'cylinder' | 'custom';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  customGeometry?: any; // GPUBuffer — requires WebGPU lib
  rotation?: { x: number; y: number; z: number };
  scale?: number;
}

/**
 * Compilation result with performance metrics
 */
export interface CompilationResult {
  success: boolean;
  shader?: ICompiledShader;
  error?: string;
  warnings: string[];
  compilationTime: number; // milliseconds
  timestamp: number;
}

/**
 * Performance metrics
 */
export interface PerformanceMetrics {
  fps: number;
  avgCompilationTime: number;
  totalCompilations: number;
  cacheHits: number;
  cacheMisses: number;
  lastCompilation: number;
}

/**
 * Material instance for preview
 */

export interface MaterialInstance {
  shaderModule?: any; // GPUShaderModule
  pipeline?: any; // GPURenderPipeline
  bindGroups: any[]; // GPUBindGroup[]
  uniforms: Map<string, Float32Array | Uint32Array>;
  textures: Map<string, any>; // GPUTexture
}

/**
 * Live preview change event
 */
export interface PreviewChangeEvent {
  type: 'compiled' | 'error' | 'recovered' | 'mesh_updated';
  result?: CompilationResult;
  mesh?: PreviewMeshConfig;
}

// ============================================================================
// Live Preview Service
// ============================================================================

export class LivePreviewService {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private device: any = null; // GPUDevice
  private currentGraph: ShaderGraph | null = null;
  private currentCompilation: CompilationResult | null = null;
  private lastValidCompilation: CompilationResult | null = null;
  private materialInstance: MaterialInstance | null = null;
  private compilationCache: Map<string, CompilationResult> = new Map();
  private metrics: PerformanceMetrics = {
    fps: 0,
    avgCompilationTime: 0,
    totalCompilations: 0,
    cacheHits: 0,
    cacheMisses: 0,
    lastCompilation: 0,
  };
  private fpsHistory: number[] = [];
  private lastFrameTime = 0;
  private changeListeners: Set<(event: PreviewChangeEvent) => void> = new Set();
  private previewMesh: PreviewMeshConfig = { geometry: 'sphere', scale: 1 };

  /**
   * Initialize WebGPU device
   */
  async initialize(device?: GPUDevice): Promise<void> {
    if (device) {
      this.device = device;
      return;
    }

    const gpu = (navigator as unknown as { gpu?: GPU }).gpu;
    if (!gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }

    const adapter = await gpu.requestAdapter();
    if (!adapter) {
      throw new Error('Failed to get WebGPU adapter');
    }

    this.device = await adapter.requestDevice();
  }

  /**
   * Set the current shader graph for preview
   */
  setGraph(graph: ShaderGraph): void {
    this.currentGraph = graph;
    // Note: callers must explicitly call recompile() after setGraph()
    // to trigger compilation. Auto-recompile creates race conditions.
  }

  /**
   * Trigger recompilation
   */
  async recompile(): Promise<CompilationResult> {
    if (!this.currentGraph) {
      throw new Error('No graph set for preview');
    }

    const startTime = performance.now();

    // Check cache
    const cacheKey = this.computeCacheKey(this.currentGraph);
    const cached = this.compilationCache.get(cacheKey);

    if (cached) {
      this.metrics.cacheHits++;
      this.currentCompilation = cached;
      this.notifyListeners({ type: 'compiled', result: cached });
      return cached;
    }

    this.metrics.cacheMisses++;

    try {
      // Compile shader graph
      const shader = compileShaderGraph(this.currentGraph, {
        target: 'wgsl',
        optimize: true,
        debug: false,
      });

      const compilationTime = performance.now() - startTime;

      const result: CompilationResult = {
        success: shader.errors.length === 0,
        shader,
        warnings: shader.warnings,
        compilationTime,
        timestamp: Date.now(),
      };

      if (result.success) {
        // Update metrics
        this.metrics.totalCompilations++;
        this.metrics.avgCompilationTime =
          (this.metrics.avgCompilationTime * (this.metrics.totalCompilations - 1) +
            compilationTime) /
          this.metrics.totalCompilations;
        this.metrics.lastCompilation = Date.now();

        // Cache result
        this.compilationCache.set(cacheKey, result);

        // Keep cache size manageable
        if (this.compilationCache.size > 50) {
          const firstKey = this.compilationCache.keys().next().value as string;
          this.compilationCache.delete(firstKey);
        }

        // Save as last valid compilation
        this.lastValidCompilation = result;
        this.currentCompilation = result;

        // Update material instance
        await this.updateMaterialInstance(shader);

        this.notifyListeners({ type: 'compiled', result });
      } else {
        result.error = shader.errors.join('\n');
        this.currentCompilation = result;
        this.notifyListeners({ type: 'error', result });

        // Attempt recovery with last valid shader
        if (this.lastValidCompilation) {
          await this.recoverFromError();
        }
      }

      return result;
    } catch (error) {
      const compilationTime = performance.now() - startTime;

      const result: CompilationResult = {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        warnings: [],
        compilationTime,
        timestamp: Date.now(),
      };

      this.currentCompilation = result;
      this.notifyListeners({ type: 'error', result });

      // Attempt recovery
      if (this.lastValidCompilation) {
        await this.recoverFromError();
      }

      return result;
    }
  }

  /**
   * Recover from compilation error using last valid shader
   */
  private async recoverFromError(): Promise<void> {
    if (!this.lastValidCompilation || !this.lastValidCompilation.shader) {
      return;
    }

    logger.warn('Recovering from shader compilation error with last valid shader');

    await this.updateMaterialInstance(this.lastValidCompilation.shader);

    this.notifyListeners({
      type: 'recovered',
      result: this.lastValidCompilation,
    });
  }

  /**
   * Update material instance with compiled shader
   */
  private async updateMaterialInstance(shader: ICompiledShader): Promise<void> {
    // In environments without WebGPU (test, non-WebGPU browsers), skip silently
    if (!this.device) {
      return;
    }

    try {
      // Create shader modules
      const vertexModule = this.device.createShaderModule({
        label: 'Vertex Shader',
        code: shader.vertexCode,
      });

      const fragmentModule = this.device.createShaderModule({
        label: 'Fragment Shader',
        code: shader.fragmentCode,
      });

      // Check for compilation errors
      const vertexInfo = await vertexModule.getCompilationInfo();
      const fragmentInfo = await fragmentModule.getCompilationInfo();

      const hasErrors =
        vertexInfo.messages.some((m: { type: string }) => m.type === 'error') ||
        fragmentInfo.messages.some((m: { type: string }) => m.type === 'error');

      if (hasErrors) {
        logger.error('Shader compilation errors:', {
          vertex: vertexInfo.messages,
          fragment: fragmentInfo.messages,
        });
        throw new Error('Shader module compilation failed');
      }

      // Create uniforms
      const uniforms = new Map<string, Float32Array | Uint32Array>();
      for (const uniform of shader.uniforms) {
        const size = this.getUniformSize(uniform.type);
        const array =
          uniform.type.startsWith('i') || uniform.type === 'int'
            ? new Uint32Array(size)
            : new Float32Array(size);

        if (uniform.defaultValue !== undefined) {
          if (Array.isArray(uniform.defaultValue)) {
            array.set(uniform.defaultValue);
          } else {
            array[0] = uniform.defaultValue;
          }
        }

        uniforms.set(uniform.name, array);
      }

      // Initialize material instance
      this.materialInstance = {
        shaderModule: fragmentModule,
        bindGroups: [],
        uniforms,
        textures: new Map(),
      };

      // DEFERRED(SHADER-001): WebGPU pipeline + bind groups require render context from canvas.
      // Blocked until shader integration Sprint provides GPURenderPassEncoder access.
    } catch (error) {
      logger.error('Failed to update material instance:', error);
      throw error;
    }
  }

  /**
   * Get uniform buffer size for a shader data type
   */
  private getUniformSize(type: string): number {
    const sizes: Record<string, number> = {
      float: 1,
      vec2: 2,
      vec3: 3,
      vec4: 4,
      mat2: 4,
      mat3: 9,
      mat4: 16,
      int: 1,
      ivec2: 2,
      ivec3: 3,
      ivec4: 4,
    };
    return sizes[type] ?? 1;
  }

  /**
   * Compute cache key for shader graph
   */
  private computeCacheKey(graph: ShaderGraph): string {
    const serialized = graph.toJSON();
    return JSON.stringify({
      nodes: serialized.nodes.map((n) => ({
        type: n.type,
        props: n.properties,
      })),
      connections: serialized.connections,
    });
  }

  /**
   * Update preview mesh configuration
   */
  setPreviewMesh(config: Partial<PreviewMeshConfig>): void {
    this.previewMesh = { ...this.previewMesh, ...config };
    this.notifyListeners({ type: 'mesh_updated', mesh: this.previewMesh });
  }

  /**
   * Get preview mesh configuration
   */
  getPreviewMesh(): PreviewMeshConfig {
    return { ...this.previewMesh };
  }

  /**
   * Update FPS tracking
   */
  updateFPS(): void {
    const now = performance.now();
    if (this.lastFrameTime > 0) {
      const deltaTime = now - this.lastFrameTime;
      const fps = 1000 / deltaTime;
      this.fpsHistory.push(fps);

      // Keep only last 60 frames
      if (this.fpsHistory.length > 60) {
        this.fpsHistory.shift();
      }

      // Calculate average FPS
      this.metrics.fps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
    }
    this.lastFrameTime = now;
  }

  /**
   * Get performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current compilation result
   */
  getCurrentCompilation(): CompilationResult | null {
    return this.currentCompilation;
  }

  /**
   * Get last valid compilation
   */
  getLastValidCompilation(): CompilationResult | null {
    return this.lastValidCompilation;
  }

  /**
   * Get material instance
   */
  getMaterialInstance(): MaterialInstance | null {
    return this.materialInstance;
  }

  /**
   * Clear compilation cache
   */
  clearCache(): void {
    this.compilationCache.clear();
    this.metrics.cacheHits = 0;
    this.metrics.cacheMisses = 0;
  }

  /**
   * Add change listener
   */
  onChange(listener: (event: PreviewChangeEvent) => void): () => void {
    this.changeListeners.add(listener);
    return () => this.changeListeners.delete(listener);
  }

  /**
   * Notify all listeners of a change
   */
  private notifyListeners(event: PreviewChangeEvent): void {
    this.changeListeners.forEach((listener) => {
      try {
        listener(event);
      } catch (error) {
        logger.error('Error in preview change listener:', error);
      }
    });
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      fps: 0,
      avgCompilationTime: 0,
      totalCompilations: 0,
      cacheHits: 0,
      cacheMisses: 0,
      lastCompilation: 0,
    };
    this.fpsHistory = [];
  }

  /**
   * Cleanup resources
   */
  dispose(): void {
    this.changeListeners.clear();
    this.compilationCache.clear();
    this.materialInstance = null;
    this.currentGraph = null;
    this.fpsHistory = [];
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

let instance: LivePreviewService | null = null;

/**
 * Get singleton instance of LivePreviewService
 */
export function getLivePreviewService(): LivePreviewService {
  if (!instance) {
    instance = new LivePreviewService();
  }
  return instance;
}
