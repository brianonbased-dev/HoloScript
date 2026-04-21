/**
 * @holoscript/snn-webgpu - Pipeline Factory
 *
 * Creates and caches WebGPU compute pipelines from WGSL shader sources.
 * Handles shader module compilation, bind group layout creation,
 * and pipeline caching for reuse across simulation steps.
 */

import type { GPUContext } from './gpu-context.js';

// Import shader sources as strings (bundled at build time via tsup)
import LIF_SHADER from './shaders/lif-neuron.wgsl?raw';
import SYNAPTIC_SHADER from './shaders/synaptic-weights.wgsl?raw';
import SPIKE_ENCODE_SHADER from './shaders/spike-encode.wgsl?raw';
import SPIKE_DECODE_SHADER from './shaders/spike-decode.wgsl?raw';
import TROPICAL_ACTIVATION_SHADER from './shaders/tropical-activation.wgsl?raw';
import TROPICAL_GRAPH_SHADER from './shaders/tropical-graph.wgsl?raw';
import LIF_LARGE_SCALE_SHADER from './shaders/lif-large-scale.wgsl?raw';

/** All available compute shader entry points. */
export type ShaderEntryPoint =
  // LIF neuron
  | 'lif_step'
  | 'lif_step_batch'
  // Synaptic
  | 'compute_synaptic_current'
  | 'compute_synaptic_current_tiled'
  | 'stdp_weight_update'
  // Encoding
  | 'encode_rate'
  | 'encode_temporal'
  | 'encode_delta'
  // Decoding
  | 'decode_rate'
  | 'decode_temporal'
  | 'decode_population'
  | 'decode_first_spike'
  // Tropical bridge
  | 'tropical_activate'
  // Tropical graph algebra
  | 'tropical_min_plus_gemm'
  | 'tropical_spmv'
  // Hierarchical large-scale
  | 'lif_step_partitioned'
  | 'synaptic_current_shared_tiled';

/** Shader source category. */
export type ShaderCategory =
  | 'lif'
  | 'synaptic'
  | 'encode'
  | 'decode'
  | 'tropical'
  | 'tropicalGraph'
  | 'largescale';

/** Mapping from category to WGSL source code. */
const SHADER_SOURCES: Record<ShaderCategory, string> = {
  lif: LIF_SHADER,
  synaptic: SYNAPTIC_SHADER,
  encode: SPIKE_ENCODE_SHADER,
  decode: SPIKE_DECODE_SHADER,
  tropical: TROPICAL_ACTIVATION_SHADER,
  tropicalGraph: TROPICAL_GRAPH_SHADER,
  largescale: LIF_LARGE_SCALE_SHADER,
};

/** Entry point to category mapping. */
const ENTRY_POINT_CATEGORY: Record<ShaderEntryPoint, ShaderCategory> = {
  lif_step: 'lif',
  lif_step_batch: 'lif',
  compute_synaptic_current: 'synaptic',
  compute_synaptic_current_tiled: 'synaptic',
  stdp_weight_update: 'synaptic',
  encode_rate: 'encode',
  encode_temporal: 'encode',
  encode_delta: 'encode',
  decode_rate: 'decode',
  decode_temporal: 'decode',
  decode_population: 'decode',
  decode_first_spike: 'decode',
  tropical_activate: 'tropical',
  tropical_min_plus_gemm: 'tropicalGraph',
  tropical_spmv: 'tropicalGraph',
  lif_step_partitioned: 'largescale',
  synaptic_current_shared_tiled: 'largescale',
};

/** Cached pipeline entry. */
interface PipelineCacheEntry {
  pipeline: GPUComputePipeline;
  module: GPUShaderModule;
  category: ShaderCategory;
  entryPoint: ShaderEntryPoint;
}

/**
 * Factory for creating and caching WebGPU compute pipelines.
 * Compiles each shader module once and caches pipelines per entry point.
 */
export class PipelineFactory {
  private ctx: GPUContext;
  private moduleCache: Map<ShaderCategory, GPUShaderModule> = new Map();
  private pipelineCache: Map<ShaderEntryPoint, PipelineCacheEntry> = new Map();
  /** Deduplicates in-flight async pipeline compilations for the same entry point. */
  private pendingAsync: Map<ShaderEntryPoint, Promise<GPUComputePipeline>> = new Map();

  constructor(ctx: GPUContext) {
    this.ctx = ctx;
  }

  /**
   * Get or create a shader module for a category.
   */
  getShaderModule(category: ShaderCategory): GPUShaderModule {
    let module = this.moduleCache.get(category);
    if (!module) {
      const source = SHADER_SOURCES[category];
      module = this.ctx.createShaderModule(source, `snn-${category}-shader`);
      this.moduleCache.set(category, module);
    }
    return module;
  }

  /**
   * Get or create a compute pipeline for a specific entry point.
   * Uses 'auto' layout by default - bind groups must match shader declarations.
   */
  getPipeline(entryPoint: ShaderEntryPoint): GPUComputePipeline {
    const cached = this.pipelineCache.get(entryPoint);
    if (cached) {
      return cached.pipeline;
    }

    const category = ENTRY_POINT_CATEGORY[entryPoint];
    const module = this.getShaderModule(category);
    const pipeline = this.ctx.createComputePipeline(
      module,
      entryPoint,
      'auto',
      `snn-pipeline-${entryPoint}`
    );

    this.pipelineCache.set(entryPoint, {
      pipeline,
      module,
      category,
      entryPoint,
    });

    return pipeline;
  }

  /**
   * Asynchronously get or create a compute pipeline for a specific entry point.
   * Avoids stalling the main thread during driver shader compilation.
   * Results are cached identically to getPipeline() — subsequent calls return from cache.
   * Concurrent calls for the same entry point share a single in-flight compilation.
   */
  async getPipelineAsync(entryPoint: ShaderEntryPoint): Promise<GPUComputePipeline> {
    const cached = this.pipelineCache.get(entryPoint);
    if (cached) {
      return cached.pipeline;
    }

    // Return in-flight promise if one already exists for this entry point
    const pending = this.pendingAsync.get(entryPoint);
    if (pending) {
      return pending;
    }

    const category = ENTRY_POINT_CATEGORY[entryPoint];
    const module = this.getShaderModule(category);

    const promise = this.ctx
      .createComputePipelineAsync(module, entryPoint, 'auto', `snn-pipeline-async-${entryPoint}`)
      .then(pipeline => {
        this.pipelineCache.set(entryPoint, { pipeline, module, category, entryPoint });
        this.pendingAsync.delete(entryPoint);
        return pipeline;
      });

    this.pendingAsync.set(entryPoint, promise);
    return promise;
  }

  /**
   * Warm up multiple pipelines in parallel using async compilation.
   * Call during scene/model load to precompile shaders before they are needed.
   * @param entryPoints - list of entry points to precompile; defaults to all available
   */
  async warmupAsync(entryPoints?: ShaderEntryPoint[]): Promise<void> {
    const targets = entryPoints ?? this.getAvailableEntryPoints();
    await Promise.all(targets.map(ep => this.getPipelineAsync(ep)));
  }

  /**
   * Retrieve compilation diagnostics (errors and warnings) for a shader module.
   * Surfaces WGSL compilation errors that are otherwise silent in some browsers.
   * @returns array of GPUCompilationMessage objects, or [] if not supported
   */
  async checkShaderCompilationErrors(category: ShaderCategory): Promise<GPUCompilationMessage[]> {
    const module = this.getShaderModule(category);
    if (typeof module.getCompilationInfo !== 'function') {
      return [];
    }
    const info = await module.getCompilationInfo();
    return Array.from(info.messages);
  }

  /**
   * Create a bind group for a pipeline and a set of buffers.
   */
  createBindGroup(
    entryPoint: ShaderEntryPoint,
    buffers: GPUBuffer[],
    label?: string
  ): GPUBindGroup {
    const pipeline = this.getPipeline(entryPoint);

    const entries: GPUBindGroupEntry[] = buffers.map((buffer, index) => ({
      binding: index,
      resource: { buffer },
    }));

    return this.ctx.device.createBindGroup({
      label: label ?? `bind-group-${entryPoint}`,
      layout: pipeline.getBindGroupLayout(0),
      entries,
    });
  }

  /**
   * Create a bind group using explicit binding index entries.
   * Use this overload when bindings are non-sequential (e.g., skipping unused bindings).
   */
  createBindGroupWithIndices(
    entryPoint: ShaderEntryPoint,
    buffers: GPUBuffer[],
    indices: number[],
    label?: string
  ): GPUBindGroup {
    const pipeline = this.getPipeline(entryPoint);

    const entries: GPUBindGroupEntry[] = buffers.map((buffer, index) => ({
      binding: indices[index],
      resource: { buffer },
    }));

    return this.ctx.device.createBindGroup({
      label: label ?? `bind-group-${entryPoint}`,
      layout: pipeline.getBindGroupLayout(0),
      entries,
    });
  }
  /**
   * Encode a compute dispatch command.
   */
  encodeDispatch(
    encoder: GPUCommandEncoder,
    entryPoint: ShaderEntryPoint,
    bindGroup: GPUBindGroup,
    workgroupCountX: number,
    workgroupCountY: number = 1,
    workgroupCountZ: number = 1
  ): void {
    const pipeline = this.getPipeline(entryPoint);
    const pass = encoder.beginComputePass({
      label: `compute-pass-${entryPoint}`,
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);
    pass.end();
  }

  /**
   * Get the raw WGSL source code for a shader category.
   * Useful for debugging or custom modifications.
   */
  getShaderSource(category: ShaderCategory): string {
    return SHADER_SOURCES[category];
  }

  /**
   * Get all available entry points.
   */
  getAvailableEntryPoints(): ShaderEntryPoint[] {
    return Object.keys(ENTRY_POINT_CATEGORY) as ShaderEntryPoint[];
  }

  /**
   * Clear all cached pipelines and modules.
   * Call before destroying the GPU context.
   */
  clearCache(): void {
    this.pipelineCache.clear();
    this.moduleCache.clear();
    this.pendingAsync.clear();
  }
}
