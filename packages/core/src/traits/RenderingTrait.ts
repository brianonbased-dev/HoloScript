/**
 * @holoscript/core Rendering Trait
 *
 * Enables GPU optimization directives, level of detail management,
 * and rendering performance tuning
 */

export type CullingMode = 'none' | 'back' | 'front' | 'both';
export type LodStrategy = 'automatic' | 'manual' | 'disabled';
export type GPUResourceTier = 'low' | 'medium' | 'high' | 'ultra';

/**
 * Level of Detail configuration
 */
export interface LODLevel {
  /** LOD level (0 = highest detail) */
  level: number;

  /** Screen-relative size threshold for this LOD */
  screenRelativeSize: number;

  /** Polygon reduction ratio (0-1) */
  polygonReduction?: number;

  /** Disable features at this LOD */
  disabledFeatures?: ('shadows' | 'normals' | 'specular' | 'animation')[];

  /** Texture resolution multiplier (0.25 = 1/4 resolution) */
  textureScale?: number;
}

/**
 * Culling configuration
 */
export interface CullingConfig {
  /** Face culling mode */
  mode: CullingMode;

  /** Frustum culling */
  frustum?: boolean;

  /** Occlusion culling */
  occlusion?: boolean;

  /** Occlusion query distance in units */
  occlusionDistance?: number;

  /** Hierarchical Z-buffer culling */
  hierarchicalZ?: boolean;
}

/**
 * Batching configuration
 */
export interface BatchingConfig {
  /** Static batching (for non-moving objects) */
  static?: boolean;

  /** Dynamic batching */
  dynamic?: boolean;

  /** Max batch size in vertices */
  maxBatchSize?: number;

  /** GPU instancing */
  instancing?: boolean;

  /** Instancing buffer size */
  maxInstanceCount?: number;
}

/**
 * Texture optimization
 */
export interface TextureOptimization {
  /** Enable texture streaming */
  streaming?: boolean;

  /** Streaming budget in MB */
  streamingBudget?: number;

  /** Virtual texture paging */
  virtualTexturing?: boolean;

  /** Texture compression */
  compression?: 'none' | 'dxt' | 'astc' | 'basis' | 'auto';

  /** Mipmap generation */
  mipmaps?: boolean;

  /** Max texture resolution */
  maxResolution?: 256 | 512 | 1024 | 2048 | 4096;
}

/**
 * Shader optimization
 */
export interface ShaderOptimization {
  /** Shader LOD bias */
  lodBias?: number;

  /** Use simplified shaders for distant objects */
  simplifiedShaders?: boolean;

  /** Compile shader variants for performance */
  variants?: {
    [key: string]: {
      enabled: boolean;
      cost?: 'low' | 'medium' | 'high';
    };
  };
}

/**
 * Rendering optimization hints
 */
export interface RenderingOptimization {
  /** LOD strategy */
  lodStrategy?: LodStrategy;

  /** LOD levels */
  lodLevels?: LODLevel[];

  /** Culling configuration */
  culling?: CullingConfig;

  /** Batching configuration */
  batching?: BatchingConfig;

  /** Texture optimization */
  textures?: TextureOptimization;

  /** Shader optimization */
  shaders?: ShaderOptimization;

  /** Target GPU tier */
  targetGPUTier?: GPUResourceTier;

  /** Fixed time-step rendering (for VR/AR) */
  fixedTimestep?: number;

  /** Enable adaptive quality */
  adaptiveQuality?: boolean;

  /** Target frame rate */
  targetFrameRate?: number;
}

/**
 * RenderingTrait - Manages GPU optimization and rendering performance
 */
export class RenderingTrait {
  private optimization: RenderingOptimization;

  constructor(config?: RenderingOptimization) {
    this.optimization = {
      lodStrategy: 'automatic',
      culling: {
        mode: 'back',
        frustum: true,
        occlusion: true,
      },
      batching: {
        static: true,
        dynamic: true,
        instancing: true,
        maxInstanceCount: 1000,
      },
      textures: {
        streaming: true,
        compression: 'auto',
        mipmaps: true,
        maxResolution: 2048,
      },
      shaders: {
        simplifiedShaders: true,
        lodBias: 0,
      },
      targetGPUTier: 'high',
      adaptiveQuality: true,
      targetFrameRate: 60,
      ...config,
    };
  }

  /**
   * Get rendering optimization config
   */
  public getOptimization(): RenderingOptimization {
    return JSON.parse(JSON.stringify(this.optimization));
  }

  /**
   * Update rendering configuration
   */
  public updateOptimization(updates: Partial<RenderingOptimization>): void {
    this.optimization = { ...this.optimization, ...updates };
  }

  /**
   * Setup LOD levels (3 levels is typical)
   */
  public setupLODLevels(strategy: LodStrategy = 'automatic'): void {
    const levels: LODLevel[] = [
      {
        level: 0,
        screenRelativeSize: 0.5,
        polygonReduction: 1.0,
        textureScale: 1.0,
      },
      {
        level: 1,
        screenRelativeSize: 0.25,
        polygonReduction: 0.6,
        disabledFeatures: ['specular'],
        textureScale: 0.5,
      },
      {
        level: 2,
        screenRelativeSize: 0.1,
        polygonReduction: 0.3,
        disabledFeatures: ['specular', 'normals'],
        textureScale: 0.25,
      },
    ];

    this.optimization.lodStrategy = strategy;
    this.optimization.lodLevels = levels;
  }

  /**
   * Get LOD levels
   */
  public getLODLevels(): LODLevel[] {
    return [...(this.optimization.lodLevels || [])];
  }

  /**
   * Configure culling
   */
  public setCulling(config: Partial<CullingConfig>): void {
    const defaultCulling: CullingConfig = { mode: 'back' };
    this.optimization.culling = {
      ...defaultCulling,
      ...this.optimization.culling,
      ...config,
    };
  }

  /**
   * Enable frustum culling
   */
  public setFrustumCulling(enabled: boolean): void {
    if (!this.optimization.culling) {
      this.optimization.culling = { mode: 'back' };
    }
    this.optimization.culling.frustum = enabled;
  }

  /**
   * Enable occlusion culling
   */
  public setOcclusionCulling(enabled: boolean, distance?: number): void {
    if (!this.optimization.culling) {
      this.optimization.culling = { mode: 'back' };
    }
    this.optimization.culling.occlusion = enabled;
    if (distance) {
      this.optimization.culling.occlusionDistance = distance;
    }
  }

  /**
   * Configure batching
   */
  public setBatching(config: Partial<BatchingConfig>): void {
    this.optimization.batching = {
      ...this.optimization.batching,
      ...config,
    };
  }

  /**
   * Enable GPU instancing
   */
  public setInstancing(enabled: boolean, maxInstances?: number): void {
    if (!this.optimization.batching) {
      this.optimization.batching = {};
    }
    this.optimization.batching.instancing = enabled;
    if (maxInstances) {
      this.optimization.batching.maxInstanceCount = maxInstances;
    }
  }

  /**
   * Configure texture optimization
   */
  public setTextureOptimization(config: Partial<TextureOptimization>): void {
    this.optimization.textures = {
      ...this.optimization.textures,
      ...config,
    };
  }

  /**
   * Enable texture streaming
   */
  public setTextureStreaming(enabled: boolean, budgetMB?: number): void {
    if (!this.optimization.textures) {
      this.optimization.textures = {};
    }
    this.optimization.textures.streaming = enabled;
    if (budgetMB) {
      this.optimization.textures.streamingBudget = budgetMB;
    }
  }

  /**
   * Set texture compression
   */
  public setTextureCompression(compression: 'none' | 'dxt' | 'astc' | 'basis' | 'auto'): void {
    if (!this.optimization.textures) {
      this.optimization.textures = {};
    }
    this.optimization.textures.compression = compression;
  }

  /**
   * Set max texture resolution
   */
  public setMaxTextureResolution(resolution: 256 | 512 | 1024 | 2048 | 4096): void {
    if (!this.optimization.textures) {
      this.optimization.textures = {};
    }
    this.optimization.textures.maxResolution = resolution;
  }

  /**
   * Configure shader optimization
   */
  public setShaderOptimization(config: Partial<ShaderOptimization>): void {
    this.optimization.shaders = {
      ...this.optimization.shaders,
      ...config,
    };
  }

  /**
   * Set target GPU tier
   */
  public setTargetGPUTier(tier: GPUResourceTier): void {
    this.optimization.targetGPUTier = tier;
  }

  /**
   * Enable adaptive quality (adjust based on frame rate)
   */
  public setAdaptiveQuality(enabled: boolean, targetFrameRate?: number): void {
    this.optimization.adaptiveQuality = enabled;
    if (targetFrameRate) {
      this.optimization.targetFrameRate = targetFrameRate;
    }
  }

  /**
   * Set fixed timestep for VR/AR
   */
  public setFixedTimestep(timestep: number): void {
    this.optimization.fixedTimestep = timestep;
  }

  /**
   * Get rendering preset for quality level
   */
  public getPresetForQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): RenderingOptimization {
    const presets: Record<string, Partial<RenderingOptimization>> = {
      low: {
        targetGPUTier: 'low',
        lodStrategy: 'automatic',
        culling: { mode: 'back', frustum: true, occlusion: false },
        batching: { instancing: true, maxInstanceCount: 500 },
        textures: {
          compression: 'astc',
          maxResolution: 512,
          streaming: true,
          streamingBudget: 128,
        },
        adaptiveQuality: true,
        targetFrameRate: 30,
      },
      medium: {
        targetGPUTier: 'medium',
        lodStrategy: 'automatic',
        culling: { mode: 'back', frustum: true, occlusion: true },
        batching: { instancing: true, maxInstanceCount: 1000 },
        textures: {
          compression: 'basis',
          maxResolution: 1024,
          streaming: true,
          streamingBudget: 256,
        },
        adaptiveQuality: true,
        targetFrameRate: 60,
      },
      high: {
        targetGPUTier: 'high',
        lodStrategy: 'automatic',
        culling: { mode: 'back', frustum: true, occlusion: true },
        batching: { instancing: true, maxInstanceCount: 2000 },
        textures: {
          compression: 'dxt',
          maxResolution: 2048,
          streaming: true,
          streamingBudget: 512,
        },
        adaptiveQuality: false,
        targetFrameRate: 60,
      },
      ultra: {
        targetGPUTier: 'ultra',
        lodStrategy: 'manual',
        culling: {
          mode: 'back',
          frustum: true,
          occlusion: true,
          hierarchicalZ: true,
        },
        batching: { instancing: true, maxInstanceCount: 5000 },
        textures: {
          compression: 'none',
          maxResolution: 4096,
          virtualTexturing: true,
          streaming: true,
          streamingBudget: 1024,
        },
        adaptiveQuality: false,
        targetFrameRate: 120,
      },
    };

    return { ...this.optimization, ...presets[quality] };
  }

  /**
   * Apply quality preset
   */
  public applyQualityPreset(quality: 'low' | 'medium' | 'high' | 'ultra'): void {
    const preset = this.getPresetForQuality(quality);
    this.optimization = preset;
  }

  /**
   * Estimate GPU memory usage
   */
  public estimateGPUMemory(): {
    textureMemory: number;
    vertexBuffers: number;
    estimatedTotal: number;
  } {
    let textureMemory = 0;
    let vertexBuffers = 0;

    // Estimate texture memory based on max resolution
    // Assuming RGBA format at 4 bytes per pixel
    const maxRes = this.optimization.textures?.maxResolution || 2048;
    textureMemory = (maxRes * maxRes * 4) / (1024 * 1024); // MB

    // Estimate based on instancing
    // Typical mesh: 10K vertices, position (12) + normal (12) + UV (8) + color (4) = 36 bytes
    const instanceCount = this.optimization.batching?.maxInstanceCount || 1000;
    const verticesPerMesh = 10000;
    vertexBuffers = ((verticesPerMesh * 36 * instanceCount) / (1024 * 1024)) * 0.1; // 10% for practical estimate

    return {
      textureMemory: Math.round(textureMemory),
      vertexBuffers: Math.max(1, Math.round(vertexBuffers)), // At least 1MB
      estimatedTotal: Math.round(textureMemory + Math.max(1, vertexBuffers)),
    };
  }

  /**
   * Get rendering statistics/info
   */
  public getInfo(): string {
    const tier = this.optimization.targetGPUTier;
    const lod = this.optimization.lodStrategy;
    const culling = this.optimization.culling?.mode;
    const instancing = this.optimization.batching?.instancing ? 'yes' : 'no';
    const memory = this.estimateGPUMemory();

    return (
      `Rendering: tier=${tier} | LOD=${lod} | culling=${culling} | instancing=${instancing} | ` +
      `memory=${memory.estimatedTotal}MB`
    );
  }

  /**
   * Optimize for VR/AR (fixed timestep, fast culling)
   */
  public optimizeForVRAR(targetFPS: number = 90): void {
    this.optimization.fixedTimestep = 1 / targetFPS;
    this.optimization.targetFrameRate = targetFPS;
    this.setOcclusionCulling(true, 50);
    this.setInstancing(true, 5000);
    this.setAdaptiveQuality(true, targetFPS);
  }

  /**
   * Optimize for mobile (lower resources)
   */
  public optimizeForMobile(): void {
    this.applyQualityPreset('low');
    this.setTextureCompression('astc');
    this.setInstancing(true, 256);
  }

  /**
   * Optimize for desktop (higher resources)
   */
  public optimizeForDesktop(): void {
    this.applyQualityPreset('ultra');
    this.setTextureCompression('none');
    this.setInstancing(true, 5000);
  }

  /**
   * Dispose and cleanup
   */
  public dispose(): void {
    // Cleanup if needed
  }
}

/**
 * HoloScript+ @rendering trait factory
 */
export function createRenderingTrait(config?: RenderingOptimization): RenderingTrait {
  return new RenderingTrait(config);
}

// ── Handler wrapper (auto-generated) ──
import type { TraitHandler } from './TraitTypes';

export const renderingHandler = {
  name: 'rendering',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    node.__renderingState = { active: true, config };
    ctx.emit('rendering_attached', { node });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    ctx.emit('rendering_detached', { node });
    delete node.__renderingState;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    if (event.type === 'rendering_configure') {
      Object.assign(node.__renderingState?.config ?? {}, event.payload ?? {});
      ctx.emit('rendering_configured', { node });
    }
  },
  onUpdate(_node: any, _config: any, _ctx: any, _dt: number): void {},
} as const satisfies TraitHandler;
