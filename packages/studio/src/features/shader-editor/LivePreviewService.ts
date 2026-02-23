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

import { ShaderGraph } from '@holoscript/core/shader/graph/ShaderGraph';
import { ShaderGraphCompiler, compileShaderGraph } from '@holoscript/core/shader/graph/ShaderGraphCompiler';
import type { ICompiledShader } from '@holoscript/core/shader/graph/ShaderGraphTypes';

// ============================================================================
// Types
// ============================================================================

/**
 * Preview mesh configuration
 */
export interface PreviewMeshConfig {
  geometry: 'sphere' | 'cube' | 'plane' | 'torus' | 'cylinder' | 'custom';
  customGeometry?: GPUBuffer;
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
  shaderModule?: GPUShaderModule;
  pipeline?: GPURenderPipeline;
  bindGroups: GPUBindGroup[];
  uniforms: Map<string, Float32Array | Uint32Array>;
  textures: Map<string, GPUTexture>;
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
  private device: GPUDevice | null = null;
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

    if (!navigator.gpu) {
      throw new Error('WebGPU is not supported in this browser');
    }

    const adapter = await navigator.gpu.requestAdapter();
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
    this.recompile();
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
          const firstKey = this.compilationCache.keys().next().value;
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

    console.warn('Recovering from shader compilation error with last valid shader');

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
    if (!this.device) {
      throw new Error('WebGPU device not initialized');
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
        vertexInfo.messages.some((m) => m.type === 'error') ||
        fragmentInfo.messages.some((m) => m.type === 'error');

      if (hasErrors) {
        console.error('Shader compilation errors:', {
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

      // TODO: Create pipeline and bind groups based on shader requirements
      // This would be done in a full implementation with access to the render context
    } catch (error) {
      console.error('Failed to update material instance:', error);
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
      this.metrics.fps =
        this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;
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
        console.error('Error in preview change listener:', error);
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
