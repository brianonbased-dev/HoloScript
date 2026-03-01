/**
 * PostProcessEffect.ts
 *
 * Base class for post-processing effects and built-in effect implementations.
 * All effects compile to WebGPU compute/render pipelines.
 *
 * @module render/postprocess
 */

import {
  PostProcessEffectType,
  EffectParams,
  IEffectRenderContext,
  IBloomParams,
  IToneMapParams,
  IFXAAParams,
  IVignetteParams,
  IFilmGrainParams,
  ISharpenParams,
  IChromaticAberrationParams,
  ICausticsParams,
  ISSRParams,
  ISSAOParams,
  ISSGIParams,
  UNIFORM_SIZES,
  getDefaultParams,
} from './PostProcessTypes';
import {
  FULLSCREEN_VERTEX_SHADER,
  BLOOM_SHADER,
  TONEMAP_SHADER,
  FXAA_SHADER,
  VIGNETTE_SHADER,
  FILM_GRAIN_SHADER,
  SHARPEN_SHADER,
  CHROMATIC_ABERRATION_SHADER,
  DOF_SHADER as _DOF_SHADER,
  SSAO_SHADER,
  FOG_SHADER as _FOG_SHADER,
  MOTION_BLUR_SHADER as _MOTION_BLUR_SHADER,
  COLOR_GRADE_SHADER as _COLOR_GRADE_SHADER,
  CAUSTICS_SHADER,
  SSR_SHADER,
  SSGI_SHADER,
} from './PostProcessShaders';

/**
 * Abstract base class for all post-processing effects
 */
export abstract class PostProcessEffect {
  public readonly type: PostProcessEffectType;
  public readonly name: string;
  protected params: EffectParams;
  protected pipeline: GPURenderPipeline | null = null;
  protected uniformBuffer: GPUBuffer | null = null;
  protected bindGroup: GPUBindGroup | null = null;
  protected sampler: GPUSampler | null = null;
  protected _initialized: boolean = false;

  constructor(type: PostProcessEffectType, name?: string, params?: Partial<EffectParams>) {
    this.type = type;
    this.name = name ?? type;
    this.params = { ...getDefaultParams(type), ...params } as EffectParams;
  }

  /**
   * Check if effect is enabled
   */
  public get enabled(): boolean {
    return this.params.enabled;
  }

  /**
   * Enable/disable effect
   */
  public set enabled(value: boolean) {
    this.params.enabled = value;
  }

  /**
   * Get effect intensity
   */
  public get intensity(): number {
    return this.params.intensity;
  }

  /**
   * Set effect intensity
   */
  public set intensity(value: number) {
    this.params.intensity = Math.max(0, value);
  }

  /**
   * Get current parameters
   */
  public getParams<T extends EffectParams>(): T {
    return this.params as T;
  }

  /**
   * Update parameters
   */
  public setParams(params: Partial<EffectParams>): void {
    this.params = { ...this.params, ...params };
  }

  /**
   * Check if effect is initialized
   */
  public get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Initialize GPU resources
   */
  public async initialize(device: GPUDevice): Promise<void> {
    if (this._initialized) return;

    // Create uniform buffer
    const uniformSize = UNIFORM_SIZES[this.type];
    this.uniformBuffer = device.createBuffer({
      size: uniformSize,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      label: `${this.name}_uniforms`,
    });

    // Create sampler
    this.sampler = device.createSampler({
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
      label: `${this.name}_sampler`,
    });

    // Create pipeline (implemented by subclasses)
    await this.createPipeline(device);

    this._initialized = true;
  }

  /**
   * Create render/compute pipeline - override in subclasses
   */
  protected abstract createPipeline(device: GPUDevice): Promise<void>;

  /**
   * Update uniform buffer with current parameters
   */
  protected abstract updateUniforms(
    device: GPUDevice,
    frameData: { time: number; deltaTime: number }
  ): void;

  /**
   * Render the effect
   */
  public abstract render(context: IEffectRenderContext): void;

  /**
   * Dispose GPU resources
   */
  public dispose(): void {
    this.uniformBuffer?.destroy();
    this.uniformBuffer = null;
    this.pipeline = null;
    this.bindGroup = null;
    this.sampler = null;
    this._initialized = false;
  }
}

/**
 * Bloom effect - adds glow to bright areas
 */
export class BloomEffect extends PostProcessEffect {
  private downsamplePipelines: GPURenderPipeline[] = [];
  private upsamplePipelines: GPURenderPipeline[] = [];
  private mipViews: GPUTextureView[] = [];
  private mipTexture: GPUTexture | null = null;

  constructor(params?: Partial<IBloomParams>) {
    super('bloom', 'Bloom', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'bloom_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'bloom_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    const shaderModule = device.createShaderModule({
      label: 'bloom_shader',
      code: FULLSCREEN_VERTEX_SHADER + BLOOM_SHADER,
    });

    // Main bloom pipeline (threshold + final composite)
    this.pipeline = device.createRenderPipeline({
      label: 'bloom_pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_bloom',
        targets: [{ format: 'rgba16float' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as IBloomParams;
    const data = new Float32Array([
      p.intensity,
      p.threshold,
      p.softThreshold,
      p.radius,
      p.iterations,
      p.anamorphic,
      p.highQuality ? 1.0 : 0.0,
      0.0, // padding
      frameData.time,
      frameData.deltaTime,
      0.0,
      0.0, // padding
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;

    this.updateUniforms(context.device, context.frameData);

    // Create bind group for this frame
    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }

  public override dispose(): void {
    super.dispose();
    this.mipTexture?.destroy();
    this.mipTexture = null;
    this.mipViews = [];
    this.downsamplePipelines = [];
    this.upsamplePipelines = [];
  }
}

/**
 * Tone mapping effect - converts HDR to LDR
 */
export class ToneMapEffect extends PostProcessEffect {
  constructor(params?: Partial<IToneMapParams>) {
    super('tonemap', 'Tone Mapping', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'tonemap_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'tonemap_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    const shaderModule = device.createShaderModule({
      label: 'tonemap_shader',
      code: FULLSCREEN_VERTEX_SHADER + TONEMAP_SHADER,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'tonemap_pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_tonemap',
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    _frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as IToneMapParams;

    // Map operator to integer
    const operatorMap: Record<string, number> = {
      none: 0,
      reinhard: 1,
      reinhardLum: 2,
      aces: 3,
      acesApprox: 4,
      filmic: 5,
      uncharted2: 6,
      uchimura: 7,
      lottes: 8,
      khronos: 9,
    };

    const data = new Float32Array([
      operatorMap[p.operator] ?? 3,
      p.exposure,
      p.gamma,
      p.whitePoint,
      p.contrast,
      p.saturation,
      p.intensity,
      0.0, // padding
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;

    this.updateUniforms(context.device, context.frameData);

    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * FXAA anti-aliasing effect
 */
export class FXAAEffect extends PostProcessEffect {
  constructor(params?: Partial<IFXAAParams>) {
    super('fxaa', 'FXAA', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'fxaa_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'fxaa_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    const shaderModule = device.createShaderModule({
      label: 'fxaa_shader',
      code: FULLSCREEN_VERTEX_SHADER + FXAA_SHADER,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'fxaa_pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_fxaa',
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    _frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as IFXAAParams;

    const qualityMap: Record<string, number> = { low: 0, medium: 1, high: 2, ultra: 3 };

    const data = new Float32Array([
      qualityMap[p.quality] ?? 2,
      p.edgeThreshold,
      p.edgeThresholdMin,
      p.intensity,
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;

    this.updateUniforms(context.device, context.frameData);

    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * Vignette effect - darkens edges of screen
 */
export class VignetteEffect extends PostProcessEffect {
  constructor(params?: Partial<IVignetteParams>) {
    super('vignette', 'Vignette', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'vignette_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'vignette_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    const shaderModule = device.createShaderModule({
      label: 'vignette_shader',
      code: FULLSCREEN_VERTEX_SHADER + VIGNETTE_SHADER,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'vignette_pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_vignette',
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    _frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as IVignetteParams;

    const data = new Float32Array([
      p.intensity,
      p.roundness,
      p.smoothness,
      0.0, // padding
      p.color[0],
      p.color[1],
      p.color[2],
      1.0,
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;

    this.updateUniforms(context.device, context.frameData);

    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * Film grain effect
 */
export class FilmGrainEffect extends PostProcessEffect {
  constructor(params?: Partial<IFilmGrainParams>) {
    super('filmGrain', 'Film Grain', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'filmgrain_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'filmgrain_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    const shaderModule = device.createShaderModule({
      label: 'filmgrain_shader',
      code: FULLSCREEN_VERTEX_SHADER + FILM_GRAIN_SHADER,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'filmgrain_pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_filmgrain',
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as IFilmGrainParams;

    const data = new Float32Array([
      p.intensity,
      p.size,
      p.luminanceContribution,
      p.animated ? frameData.time : 0,
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;

    this.updateUniforms(context.device, context.frameData);

    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * Sharpen effect
 */
export class SharpenEffect extends PostProcessEffect {
  constructor(params?: Partial<ISharpenParams>) {
    super('sharpen', 'Sharpen', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'sharpen_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'sharpen_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    const shaderModule = device.createShaderModule({
      label: 'sharpen_shader',
      code: FULLSCREEN_VERTEX_SHADER + SHARPEN_SHADER,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'sharpen_pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_sharpen',
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    _frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as ISharpenParams;

    const data = new Float32Array([
      p.intensity,
      p.amount,
      p.threshold,
      0.0, // padding
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;

    this.updateUniforms(context.device, context.frameData);

    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * Chromatic aberration effect
 */
export class ChromaticAberrationEffect extends PostProcessEffect {
  constructor(params?: Partial<IChromaticAberrationParams>) {
    super('chromaticAberration', 'Chromatic Aberration', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'chromatic_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });

    const pipelineLayout = device.createPipelineLayout({
      label: 'chromatic_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });

    const shaderModule = device.createShaderModule({
      label: 'chromatic_shader',
      code: FULLSCREEN_VERTEX_SHADER + CHROMATIC_ABERRATION_SHADER,
    });

    this.pipeline = device.createRenderPipeline({
      label: 'chromatic_pipeline',
      layout: pipelineLayout,
      vertex: {
        module: shaderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_chromatic',
        targets: [{ format: 'rgba8unorm' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    _frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as IChromaticAberrationParams;

    const data = new Float32Array([
      p.intensity,
      p.radial ? 1.0 : 0.0,
      0.0,
      0.0, // padding
      p.redOffset[0],
      p.redOffset[1],
      p.greenOffset[0],
      p.greenOffset[1],
      p.blueOffset[0],
      p.blueOffset[1],
      0.0,
      0.0, // padding
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;

    this.updateUniforms(context.device, context.frameData);

    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });

    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });

    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * Caustics overlay effect — underwater refracted light patterns
 */
export class CausticsEffect extends PostProcessEffect {
  constructor(params?: Partial<ICausticsParams>) {
    super('caustics', 'Caustics', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'caustics_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      label: 'caustics_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });
    const shaderModule = device.createShaderModule({
      label: 'caustics_shader',
      code: FULLSCREEN_VERTEX_SHADER + CAUSTICS_SHADER,
    });
    this.pipeline = device.createRenderPipeline({
      label: 'caustics_pipeline',
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_caustics',
        targets: [{ format: 'rgba16float' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as ICausticsParams;
    const data = new Float32Array([
      p.intensity,
      p.scale,
      p.speed,
      p.depthFade,
      p.color[0],
      p.color[1],
      p.color[2],
      p.waterLevel,
      frameData.time,
      p.dispersion ?? 0,
      p.foamIntensity ?? 0,
      p.shadowStrength ?? 0,
      0.0,
      0.0,
      0.0,
      0.0,
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;
    this.updateUniforms(context.device, context.frameData);
    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * Screen-Space Reflections (SSR) effect
 */
export class SSREffect extends PostProcessEffect {
  constructor(params?: Partial<ISSRParams>) {
    super('ssr', 'SSR', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'ssr_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      label: 'ssr_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });
    const shaderModule = device.createShaderModule({
      label: 'ssr_shader',
      code: FULLSCREEN_VERTEX_SHADER + SSR_SHADER,
    });
    this.pipeline = device.createRenderPipeline({
      label: 'ssr_pipeline',
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_ssr',
        targets: [{ format: 'rgba16float' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    _frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as ISSRParams;
    const data = new Float32Array([
      p.intensity,
      p.maxSteps,
      p.stepSize,
      p.thickness,
      p.roughnessFade,
      p.edgeFade,
      p.roughnessBlur ?? 0,
      p.fresnelStrength ?? 0,
      0.0,
      0.0,
      0.0,
      0.0,
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;
    this.updateUniforms(context.device, context.frameData);
    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * Screen-Space Ambient Occlusion (SSAO) effect
 */
export class SSAOEffect extends PostProcessEffect {
  constructor(params?: Partial<ISSAOParams>) {
    super('ssao', 'SSAO', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'ssao_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      label: 'ssao_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });
    const shaderModule = device.createShaderModule({
      label: 'ssao_shader',
      code: FULLSCREEN_VERTEX_SHADER + SSAO_SHADER,
    });
    this.pipeline = device.createRenderPipeline({
      label: 'ssao_pipeline',
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_ssao',
        targets: [{ format: 'rgba16float' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    _frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as ISSAOParams;
    const modeVal = (p.mode ?? 'hemisphere') === 'hbao' ? 1.0 : 0.0;
    const data = new Float32Array([
      p.intensity,
      p.radius,
      p.bias,
      p.samples,
      p.power,
      p.falloff,
      0.0,
      0.0,
      modeVal,
      p.bentNormals ? 1.0 : 0.0,
      p.spatialDenoise ? 1.0 : 0.0,
      0.0,
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;
    this.updateUniforms(context.device, context.frameData);
    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * Screen-Space Global Illumination (SSGI) effect
 */
export class SSGIEffect extends PostProcessEffect {
  constructor(params?: Partial<ISSGIParams>) {
    super('ssgi', 'SSGI', params);
  }

  protected async createPipeline(device: GPUDevice): Promise<void> {
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'ssgi_bind_group_layout',
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const pipelineLayout = device.createPipelineLayout({
      label: 'ssgi_pipeline_layout',
      bindGroupLayouts: [bindGroupLayout],
    });
    const shaderModule = device.createShaderModule({
      label: 'ssgi_shader',
      code: FULLSCREEN_VERTEX_SHADER + SSGI_SHADER,
    });
    this.pipeline = device.createRenderPipeline({
      label: 'ssgi_pipeline',
      layout: pipelineLayout,
      vertex: { module: shaderModule, entryPoint: 'vs_main' },
      fragment: {
        module: shaderModule,
        entryPoint: 'fs_ssgi',
        targets: [{ format: 'rgba16float' }],
      },
      primitive: { topology: 'triangle-list' },
    });
  }

  protected updateUniforms(
    device: GPUDevice,
    _frameData: { time: number; deltaTime: number }
  ): void {
    if (!this.uniformBuffer) return;
    const p = this.params as ISSGIParams;
    const data = new Float32Array([
      p.intensity,
      p.radius,
      p.samples,
      p.bounceIntensity,
      p.falloff,
      p.temporalBlend ?? 0,
      p.spatialDenoise ? 1.0 : 0.0,
      p.multiBounce ?? 0,
      0.0,
      0.0,
      0.0,
      0.0,
    ]);
    device.queue.writeBuffer(this.uniformBuffer, 0, data);
  }

  public render(context: IEffectRenderContext): void {
    if (!this.enabled || !this.pipeline || !this.uniformBuffer || !this.sampler) return;
    this.updateUniforms(context.device, context.frameData);
    const bindGroup = context.device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: this.sampler },
        { binding: 1, resource: context.input.view },
        { binding: 2, resource: { buffer: this.uniformBuffer } },
      ],
    });
    const passEncoder = context.commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: context.output.view,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }
}

/**
 * Factory function to create effects by type
 */
export function createEffect(
  type: PostProcessEffectType,
  params?: Partial<EffectParams>
): PostProcessEffect {
  switch (type) {
    case 'bloom':
      return new BloomEffect(params as Partial<IBloomParams>);
    case 'tonemap':
      return new ToneMapEffect(params as Partial<IToneMapParams>);
    case 'fxaa':
      return new FXAAEffect(params as Partial<IFXAAParams>);
    case 'vignette':
      return new VignetteEffect(params as Partial<IVignetteParams>);
    case 'filmGrain':
      return new FilmGrainEffect(params as Partial<IFilmGrainParams>);
    case 'sharpen':
      return new SharpenEffect(params as Partial<ISharpenParams>);
    case 'chromaticAberration':
      return new ChromaticAberrationEffect(params as Partial<IChromaticAberrationParams>);
    case 'caustics':
      return new CausticsEffect(params as Partial<ICausticsParams>);
    case 'ssr':
      return new SSREffect(params as Partial<ISSRParams>);
    case 'ssao':
      return new SSAOEffect(params as Partial<ISSAOParams>);
    case 'ssgi':
      return new SSGIEffect(params as Partial<ISSGIParams>);
    default:
      throw new Error(`Unknown effect type: ${type}`);
  }
}
