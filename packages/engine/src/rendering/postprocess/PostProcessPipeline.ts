/**
 * PostProcessPipeline.ts
 *
 * Manages a chain of post-processing effects, handling render targets
 * and ping-pong buffering for efficient GPU processing.
 *
 * @module render/postprocess
 */

import {
  PostProcessEffectType,
  IEffectConfig,
  IPostProcessPipelineConfig,
  IRenderTarget,
  IFrameData,
  IEffectRenderContext,
  EffectParams,
} from './PostProcessTypes';
import { PostProcessEffect, createEffect } from './PostProcessEffect';

/**
 * Default pipeline configuration
 */
export const DEFAULT_PIPELINE_CONFIG: IPostProcessPipelineConfig = {
  hdrEnabled: true,
  hdrFormat: 'rgba16float',
  ldrFormat: 'rgba8unorm',
  msaaSamples: 1,
  effects: [],
  autoResize: true,
};

/**
 * Post-processing pipeline manager
 */
export class PostProcessPipeline {
  private device: GPUDevice | null = null;
  private config: IPostProcessPipelineConfig;
  private effects: PostProcessEffect[] = [];
  private renderTargets: Map<string, IRenderTarget> = new Map();
  private pingPongTargets: [IRenderTarget | null, IRenderTarget | null] = [null, null];
  private currentWidth: number = 0;
  private currentHeight: number = 0;
  private _initialized: boolean = false;
  private frameCount: number = 0;

  constructor(config?: Partial<IPostProcessPipelineConfig>) {
    this.config = { ...DEFAULT_PIPELINE_CONFIG, ...config };
  }

  /**
   * Check if pipeline is initialized
   */
  public get initialized(): boolean {
    return this._initialized;
  }

  /**
   * Get current configuration
   */
  public getConfig(): IPostProcessPipelineConfig {
    return { ...this.config };
  }

  /**
   * Get list of active effects
   */
  public getEffects(): PostProcessEffect[] {
    return [...this.effects];
  }

  /**
   * Get effect by name
   */
  public getEffect(name: string): PostProcessEffect | undefined {
    return this.effects.find((e) => e.name === name);
  }

  /**
   * Get effect by type
   */
  public getEffectByType(type: PostProcessEffectType): PostProcessEffect | undefined {
    return this.effects.find((e) => e.type === type);
  }

  /**
   * Initialize the pipeline with GPU device
   */
  public async initialize(device: GPUDevice, width: number, height: number): Promise<void> {
    if (this._initialized && this.device === device) {
      if (width !== this.currentWidth || height !== this.currentHeight) {
        await this.resize(width, height);
      }
      return;
    }

    this.device = device;
    this.currentWidth = width;
    this.currentHeight = height;

    // Create render targets
    await this.createRenderTargets();

    // Create effects from config
    for (const effectConfig of this.config.effects) {
      await this.addEffect(effectConfig);
    }

    this._initialized = true;
  }

  /**
   * Create or recreate render targets
   */
  private async createRenderTargets(): Promise<void> {
    if (!this.device) return;

    // Dispose existing targets
    this.disposeRenderTargets();

    const format = this.config.hdrEnabled ? this.config.hdrFormat : this.config.ldrFormat;

    // Create ping-pong buffers for effect chain
    for (let i = 0; i < 2; i++) {
      const texture = this.device.createTexture({
        size: { width: this.currentWidth, height: this.currentHeight },
        format: format as GPUTextureFormat,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
        label: `postprocess_pingpong_${i}`,
      });

      this.pingPongTargets[i] = {
        id: `pingpong_${i}`,
        texture,
        view: texture.createView(),
        config: {
          width: this.currentWidth,
          height: this.currentHeight,
          format: format as GPUTextureFormat,
        },
      };
    }
  }

  /**
   * Dispose render targets
   */
  private disposeRenderTargets(): void {
    for (const target of this.renderTargets.values()) {
      target.texture.destroy();
    }
    this.renderTargets.clear();

    for (const target of this.pingPongTargets) {
      target?.texture.destroy();
    }
    this.pingPongTargets = [null, null];
  }

  /**
   * Resize render targets
   */
  public async resize(width: number, height: number): Promise<void> {
    if (width === this.currentWidth && height === this.currentHeight) return;

    this.currentWidth = width;
    this.currentHeight = height;

    await this.createRenderTargets();
  }

  /**
   * Add an effect to the pipeline
   */
  public async addEffect(config: IEffectConfig): Promise<PostProcessEffect> {
    const effect = createEffect(config.type, config.params);

    if (config.name) {
      (effect as unknown as { name: string }).name = config.name;
    }

    if (this.device) {
      await effect.initialize(this.device);
    }

    // Insert at specified order or append
    if (config.order !== undefined && config.order < this.effects.length) {
      this.effects.splice(config.order, 0, effect);
    } else {
      this.effects.push(effect);
    }

    return effect;
  }

  /**
   * Remove an effect from the pipeline
   */
  public removeEffect(nameOrType: string | PostProcessEffectType): boolean {
    const index = this.effects.findIndex((e) => e.name === nameOrType || e.type === nameOrType);

    if (index === -1) return false;

    const effect = this.effects[index];
    effect.dispose();
    this.effects.splice(index, 1);

    return true;
  }

  /**
   * Reorder effects
   */
  public reorderEffects(order: string[]): void {
    const newEffects: PostProcessEffect[] = [];

    for (const name of order) {
      const effect = this.effects.find((e) => e.name === name);
      if (effect) {
        newEffects.push(effect);
      }
    }

    // Add any effects not in the order list
    for (const effect of this.effects) {
      if (!order.includes(effect.name)) {
        newEffects.push(effect);
      }
    }

    this.effects = newEffects;
  }

  /**
   * Update effect parameters
   */
  public updateEffectParams(
    nameOrType: string | PostProcessEffectType,
    params: Partial<EffectParams>
  ): boolean {
    const effect = this.effects.find((e) => e.name === nameOrType || e.type === nameOrType);

    if (!effect) return false;

    effect.setParams(params);
    return true;
  }

  /**
   * Enable/disable an effect
   */
  public setEffectEnabled(nameOrType: string | PostProcessEffectType, enabled: boolean): boolean {
    const effect = this.effects.find((e) => e.name === nameOrType || e.type === nameOrType);

    if (!effect) return false;

    effect.enabled = enabled;
    return true;
  }

  /**
   * Execute the post-processing pipeline
   *
   * @param commandEncoder GPU command encoder
   * @param inputView Input texture view (scene render)
   * @param outputView Output texture view (swap chain)
   * @param frameData Frame timing and camera data
   */
  public render(
    commandEncoder: GPUCommandEncoder,
    inputView: GPUTextureView,
    outputView: GPUTextureView,
    frameData: Partial<IFrameData> = {}
  ): void {
    if (!this._initialized || !this.device) {
      console.warn('PostProcessPipeline not initialized');
      return;
    }

    const enabledEffects = this.effects.filter((e) => e.enabled);

    // If no effects, just copy input to output
    if (enabledEffects.length === 0) {
      this.copyTexture(commandEncoder, inputView, outputView);
      return;
    }

    // Build frame data
    const fullFrameData: IFrameData = {
      time: frameData.time ?? performance.now() / 1000,
      deltaTime: frameData.deltaTime ?? 1 / 60,
      frameCount: this.frameCount++,
      resolution: [this.currentWidth, this.currentHeight],
      nearPlane: frameData.nearPlane ?? 0.1,
      farPlane: frameData.farPlane ?? 1000,
      cameraPosition: frameData.cameraPosition,
      viewMatrix: frameData.viewMatrix,
      projectionMatrix: frameData.projectionMatrix,
      prevViewMatrix: frameData.prevViewMatrix,
      jitter: frameData.jitter,
    };

    // Set up ping-pong rendering
    let currentInput = this.pingPongTargets[0]!;
    let currentOutput = this.pingPongTargets[1]!;
    let pingPongIndex = 0;

    // Copy scene to first ping-pong buffer
    this.copyToTarget(commandEncoder, inputView, currentInput);

    // Process each effect
    for (let i = 0; i < enabledEffects.length; i++) {
      const effect = enabledEffects[i];
      const isLast = i === enabledEffects.length - 1;

      // Last effect outputs to final target
      const output = isLast ? this.createTempTarget(outputView) : currentOutput;

      const context: IEffectRenderContext = {
        device: this.device,
        commandEncoder,
        frameData: fullFrameData,
        input: currentInput,
        output,
      };

      effect.render(context);

      // Swap ping-pong buffers
      if (!isLast) {
        pingPongIndex = 1 - pingPongIndex;
        currentInput = currentOutput;
        currentOutput = this.pingPongTargets[pingPongIndex]!;
      }
    }
  }

  /**
   * Create temporary render target wrapper for output view
   */
  private createTempTarget(view: GPUTextureView): IRenderTarget {
    return {
      id: 'output',
      texture: null as unknown as GPUTexture, // Not needed for output
      view,
      config: {
        width: this.currentWidth,
        height: this.currentHeight,
        format: this.config.ldrFormat as GPUTextureFormat,
      },
    };
  }

  /**
   * Copy texture using a blit pass
   */
  private copyTexture(
    commandEncoder: GPUCommandEncoder,
    source: GPUTextureView,
    dest: GPUTextureView
  ): void {
    // Simple copy - in production, use copyTextureToTexture
    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: dest,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 1 },
        },
      ],
    });
    passEncoder.end();
  }

  /**
   * Copy input view to a render target
   */
  private copyToTarget(
    commandEncoder: GPUCommandEncoder,
    source: GPUTextureView,
    target: IRenderTarget
  ): void {
    this.copyTexture(commandEncoder, source, target.view);
  }

  /**
   * Create a preset pipeline configuration
   */
  public static createPreset(
    preset: 'minimal' | 'standard' | 'cinematic' | 'performance'
  ): Partial<IPostProcessPipelineConfig> {
    switch (preset) {
      case 'minimal':
        return {
          hdrEnabled: false,
          effects: [
            {
              type: 'fxaa',
              params: {
                enabled: true,
                intensity: 1.0,
                quality: 'medium',
                edgeThreshold: 0.166,
                edgeThresholdMin: 0.0833,
              },
            },
          ],
        };

      case 'standard':
        return {
          hdrEnabled: true,
          effects: [
            {
              type: 'bloom',
              params: {
                enabled: true,
                intensity: 0.5,
                threshold: 1.0,
                softThreshold: 0.5,
                radius: 4,
                iterations: 5,
                anamorphic: 0,
                highQuality: false,
              },
            },
            {
              type: 'tonemap',
              params: {
                enabled: true,
                intensity: 1.0,
                operator: 'aces',
                exposure: 1.0,
                gamma: 2.2,
                whitePoint: 1.0,
                contrast: 1.0,
                saturation: 1.0,
              },
            },
            {
              type: 'fxaa',
              params: {
                enabled: true,
                intensity: 1.0,
                quality: 'high',
                edgeThreshold: 0.166,
                edgeThresholdMin: 0.0833,
              },
            },
          ],
        };

      case 'cinematic':
        return {
          hdrEnabled: true,
          effects: [
            {
              type: 'bloom',
              params: {
                enabled: true,
                intensity: 0.8,
                threshold: 0.8,
                softThreshold: 0.5,
                radius: 6,
                iterations: 6,
                anamorphic: 0.2,
                highQuality: true,
              },
            },
            {
              type: 'tonemap',
              params: {
                enabled: true,
                intensity: 1.0,
                operator: 'aces',
                exposure: 1.1,
                gamma: 2.2,
                whitePoint: 1.0,
                contrast: 1.05,
                saturation: 1.1,
              },
            },
            {
              type: 'vignette',
              params: {
                enabled: true,
                intensity: 0.3,
                roundness: 1.2,
                smoothness: 0.4,
                color: [0, 0, 0],
              },
            },
            {
              type: 'filmGrain',
              params: {
                enabled: true,
                intensity: 0.05,
                size: 1.5,
                luminanceContribution: 0.8,
                animated: true,
              },
            },
            {
              type: 'fxaa',
              params: {
                enabled: true,
                intensity: 1.0,
                quality: 'ultra',
                edgeThreshold: 0.125,
                edgeThresholdMin: 0.0625,
              },
            },
          ],
        };

      case 'performance':
        return {
          hdrEnabled: false,
          msaaSamples: 1,
          effects: [
            {
              type: 'tonemap',
              params: {
                enabled: true,
                intensity: 1.0,
                operator: 'reinhardLum',
                exposure: 1.0,
                gamma: 2.2,
                whitePoint: 1.0,
                contrast: 1.0,
                saturation: 1.0,
              },
            },
          ],
        };
    }
  }

  /**
   * Dispose all resources
   */
  public dispose(): void {
    // Dispose effects
    for (const effect of this.effects) {
      effect.dispose();
    }
    this.effects = [];

    // Dispose render targets
    this.disposeRenderTargets();

    this.device = null;
    this._initialized = false;
  }

  /**
   * Get performance statistics
   */
  public getStats(): {
    effectCount: number;
    enabledEffects: number;
    renderTargetCount: number;
    estimatedMemoryMB: number;
  } {
    const bytesPerPixel = this.config.hdrEnabled ? 8 : 4; // RGBA16F vs RGBA8
    const pixelCount = this.currentWidth * this.currentHeight;
    const renderTargetMemory =
      (this.pingPongTargets.filter((t) => t !== null).length + this.renderTargets.size) *
      pixelCount *
      bytesPerPixel;

    return {
      effectCount: this.effects.length,
      enabledEffects: this.effects.filter((e) => e.enabled).length,
      renderTargetCount: this.renderTargets.size + 2,
      estimatedMemoryMB: renderTargetMemory / (1024 * 1024),
    };
  }
}

/**
 * Create a post-processing pipeline with common presets
 */
export function createPostProcessPipeline(
  preset?: 'minimal' | 'standard' | 'cinematic' | 'performance',
  customConfig?: Partial<IPostProcessPipelineConfig>
): PostProcessPipeline {
  const presetConfig = preset ? PostProcessPipeline.createPreset(preset) : {};
  return new PostProcessPipeline({ ...presetConfig, ...customConfig });
}

/**
 * Quick helper to create a standard HDR pipeline
 */
export function createHDRPipeline(): PostProcessPipeline {
  return createPostProcessPipeline('standard');
}

/**
 * Quick helper to create a minimal LDR pipeline
 */
export function createLDRPipeline(): PostProcessPipeline {
  return createPostProcessPipeline('minimal');
}
