/**
 * Hololand Graphics Pipeline Service
 *
 * Core service for managing graphics rendering pipeline in Hololand.
 * Integrates HoloScript graphics traits with Hololand's rendering backend.
 *
 * Responsibilities:
 * - Material management and asset pipeline
 * - Light management and shadow mapping
 * - GPU memory optimization
 * - Performance monitoring and profiling
 * - Cross-platform optimization (mobile/VR/desktop)
 */

import type { GraphicsConfiguration } from '../HoloScriptPlusParser';
import type { MaterialTrait } from '../traits/MaterialTrait';

// ============================================================================
// GPU Memory Estimation
// ============================================================================

export interface GPUMemoryEstimate {
  textureMemory: number; // MB
  geometryMemory: number; // MB
  bufferMemory: number; // MB
  estimatedTotal: number; // MB
  budget: number; // MB (allocated limit)
  utilization: number; // percentage
}

// ============================================================================
// Material Asset Pipeline
// ============================================================================

export interface MaterialAsset {
  id: string;
  name: string;
  material: MaterialTrait;
  shaders: ShaderProgram[];
  textures: TextureAsset[];
  instances: number;
  gpuMemory: number;
  lastUsed: number;
}

export interface TextureAsset {
  id: string;
  path: string;
  format: 'RGBA8' | 'RGB565' | 'BC1' | 'BC3' | 'ASTC' | 'PVRTC';
  width: number;
  height: number;
  mipLevels: number;
  gpuMemory: number;
  loaded: boolean;
}

export interface ShaderProgram {
  id: string;
  name: string;
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, string>;
  compiled: boolean;
  compilationTime: number;
}

// ============================================================================
// Performance Metrics
// ============================================================================

export interface PerformanceMetrics {
  drawCalls: number;
  trianglesRendered: number;
  gpuFrameTime: number; // ms
  cpuFrameTime: number; // ms
  fps: number;
  gpuMemoryUsed: number; // MB
  textureBinds: number;
  shaderSwitches: number;
  batchCount: number;
}

// ============================================================================
// Platform Configuration
// ============================================================================

export type Platform = 'mobile' | 'vr' | 'desktop';

export interface PlatformConfig {
  platform: Platform;
  maxGPUMemory: number; // MB
  maxDrawCalls: number;
  maxTextureResolution: number;
  targetFPS: number;
  shadowQuality: 'none' | 'low' | 'medium' | 'high';
  textureCompression: 'none' | 'dxt' | 'astc' | 'basis';
  instancingEnabled: boolean;
  maxLights: number;
  maxShadowCasters: number;
}

// ============================================================================
// Hololand Graphics Pipeline Service
// ============================================================================

export class HololandGraphicsPipelineService {
  private materialCache: Map<string, MaterialAsset> = new Map();
  private textureCache: Map<string, TextureAsset> = new Map();
  private shaderCache: Map<string, ShaderProgram> = new Map();

  private platformConfig: PlatformConfig;
  private metrics: PerformanceMetrics;

  // private _memoryBudget: number = 512; // MB default - unused
  private memoryUsed: number = 0;

  constructor(platform: Platform = 'desktop') {
    this.platformConfig = this.getPlatformConfig(platform);
    this.metrics = this.initializeMetrics();
  }

  /**
   * Initialize graphics pipeline with configuration
   */
  initialize(config: GraphicsConfiguration): void {
    if (config.material) {
      this.initializeMaterials(config.material);
    }

    if (config.lighting) {
      this.initializeLighting(config.lighting);
    }

    if (config.rendering) {
      this.initializeRendering(config.rendering);
    }
  }

  /**
   * Initialize materials from configuration
   */
  private initializeMaterials(materialConfig: unknown): void {
    // Create material assets
    const material = this.createMaterialAsset(materialConfig);
    this.materialCache.set(material.id, material);

    // Pre-compile shaders
    material.shaders.forEach((shader) => {
      this.compileShader(shader);
    });

    // Load textures
    material.textures.forEach((texture) => {
      this.loadTexture(texture);
    });
  }

  /**
   * Initialize lighting from configuration
   */
  private initializeLighting(lightingConfig: unknown): void {
    // Configure shadow mapping
    // @ts-expect-error
    if (lightingConfig.shadows) {
      this.setupShadowMapping(lightingConfig);
    }

    // Configure global illumination
    // @ts-expect-error
    if (lightingConfig.globalIllumination) {
      // @ts-expect-error
      this.setupGlobalIllumination(lightingConfig.globalIllumination);
    }
  }

  /**
   * Initialize rendering from configuration
   */
  private initializeRendering(renderingConfig: unknown): void {
    // Apply quality preset
    // @ts-expect-error
    if (renderingConfig.quality) {
      // @ts-expect-error
      this.applyQualityPreset(renderingConfig.quality);
    }

    // Configure platform-specific settings
    // @ts-expect-error
    if (renderingConfig.platform) {
      // @ts-expect-error
      this.platformConfig = this.getPlatformConfig(renderingConfig.platform);
    }

    // Enable optimizations
    // @ts-expect-error
    if (renderingConfig.lod !== false) {
      this.enableLOD();
    }

    // @ts-expect-error
    if (renderingConfig.culling !== false) {
      this.enableCulling();
    }

    // @ts-expect-error
    if (renderingConfig.instancing !== false) {
      this.platformConfig.instancingEnabled = true;
    }
  }

  /**
   * Create material asset from configuration
   */
  private createMaterialAsset(config: unknown): MaterialAsset {
    const id = `mat_${Date.now()}_${Math.random()}`;

    const asset: MaterialAsset = {
      id,
      // @ts-expect-error
      name: config.name || 'Material',
      material: null! as MaterialTrait, // Would be actual MaterialTrait
      shaders: this.generateShaders(config),
      textures: this.loadTexturesFromConfig(config),
      instances: 0,
      gpuMemory: 0,
      lastUsed: Date.now(),
    };

    // Estimate GPU memory
    asset.gpuMemory = this.estimateMaterialMemory(asset);
    this.memoryUsed += asset.gpuMemory;

    return asset;
  }

  /**
   * Generate shaders from material configuration
   */
  private generateShaders(config: unknown): ShaderProgram[] {
    const shaders: ShaderProgram[] = [];

    // Generate PBR shader
    // @ts-expect-error
    if (config.type === 'pbr' || config.pbr) {
      shaders.push(this.generatePBRShader(config));
    }

    return shaders;
  }

  /**
   * Generate PBR shader program
   */
  private generatePBRShader(_config: unknown): ShaderProgram {
    const vertexShader = `
      #version 300 es
      precision highp float;

      in vec3 aPosition;
      in vec3 aNormal;
      in vec2 aTexCoord;
      in vec3 aTangent;

      uniform mat4 uMatrix;
      uniform mat4 uNormalMatrix;
      uniform mat4 uProjectionMatrix;

      out vec3 vPosition;
      out vec3 vNormal;
      out vec2 vTexCoord;
      out mat3 vTBN;

      void main() {
        vPosition = (uMatrix * vec4(aPosition, 1.0)).xyz;
        vNormal = normalize((uNormalMatrix * vec4(aNormal, 0.0)).xyz);
        vTexCoord = aTexCoord;

        vec3 T = normalize((uNormalMatrix * vec4(aTangent, 0.0)).xyz);
        vec3 B = cross(vNormal, T);
        vTBN = mat3(T, B, vNormal);

        gl_Position = uProjectionMatrix * uMatrix * vec4(aPosition, 1.0);
      }
    `;

    const fragmentShader = `
      #version 300 es
      precision highp float;

      in vec3 vPosition;
      in vec3 vNormal;
      in vec2 vTexCoord;
      in mat3 vTBN;

      uniform sampler2D uBaseColorMap;
      uniform sampler2D uNormalMap;
      uniform sampler2D uRoughnessMap;
      uniform sampler2D uMetallicMap;
      uniform sampler2D uAOMap;

      uniform vec3 uViewPos;
      uniform float uMetallic;
      uniform float uRoughness;

      out vec4 FragColor;

      const float PI = 3.14159265359;

      vec3 fresnelSchlick(float cosTheta, vec3 F0) {
        return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
      }

      void main() {
        vec3 baseColor = texture(uBaseColorMap, vTexCoord).rgb;
        vec3 normal = normalize(vTBN * (texture(uNormalMap, vTexCoord).rgb * 2.0 - 1.0));
        float roughness = texture(uRoughnessMap, vTexCoord).r;
        float metallic = texture(uMetallicMap, vTexCoord).r;
        float ao = texture(uAOMap, vTexCoord).r;

        vec3 N = normalize(normal);
        vec3 V = normalize(uViewPos - vPosition);

        vec3 F0 = vec3(0.04);
        F0 = mix(F0, baseColor, metallic);

        // Simplified lighting (full PBR in production)
        vec3 lightDir = normalize(vec3(0.5, 1.0, 0.5));
        float NdotL = max(dot(N, lightDir), 0.0);

        vec3 result = baseColor * NdotL * ao;

        // Tone mapping
        result = result / (result + vec3(1.0));
        result = pow(result, vec3(1.0 / 2.2));

        FragColor = vec4(result, 1.0);
      }
    `;

    return {
      id: `shader_pbr_${Date.now()}`,
      name: 'PBRShader',
      vertexShader,
      fragmentShader,
      uniforms: {
        uMatrix: 'mat4',
        uNormalMatrix: 'mat4',
        uProjectionMatrix: 'mat4',
        uViewPos: 'vec3',
        uMetallic: 'float',
        uRoughness: 'float',
        uBaseColorMap: 'sampler2D',
        uNormalMap: 'sampler2D',
        uRoughnessMap: 'sampler2D',
        uMetallicMap: 'sampler2D',
        uAOMap: 'sampler2D',
      },
      compiled: false,
      compilationTime: 0,
    };
  }

  /**
   * Load textures from configuration
   */
  private loadTexturesFromConfig(config: unknown): TextureAsset[] {
    const textures: TextureAsset[] = [];

    // @ts-expect-error
    if (config.textures) {
      // @ts-expect-error
      config.textures.forEach((tex: unknown) => {
        textures.push({
          id: `tex_${Date.now()}_${Math.random()}`,
          // @ts-expect-error
          path: tex.path,
          // @ts-expect-error
          format: this.selectTextureFormat(config.compression),
          width: 2048,
          height: 2048,
          mipLevels: 8,
          gpuMemory: this.estimateTextureMemory(
            2048,
            2048,
            // @ts-expect-error
            this.selectTextureFormat(config.compression)
          ),
          loaded: false,
        });
      });
    }

    return textures;
  }

  /**
   * Select appropriate texture format based on compression type
   */
  private selectTextureFormat(compression?: string): TextureAsset['format'] {
    switch (compression) {
      case 'dxt':
        return 'BC3';
      case 'astc':
        return 'ASTC';
      case 'basis':
        return 'PVRTC';
      default:
        return 'RGBA8';
    }
  }

  /**
   * Estimate texture memory usage
   */
  private estimateTextureMemory(
    width: number,
    height: number,
    format: TextureAsset['format']
  ): number {
    const pixels = width * height;
    let bytesPerPixel = 4; // RGBA8

    switch (format) {
      case 'RGB565':
        bytesPerPixel = 2;
        break;
      case 'BC1':
      case 'BC3':
      case 'ASTC':
        bytesPerPixel = 0.5; // Compressed
        break;
      case 'PVRTC':
        bytesPerPixel = 0.25; // Highly compressed
        break;
    }

    // Account for mipmaps (roughly 1.33x base size)
    return (pixels * bytesPerPixel * 1.33) / (1024 * 1024);
  }

  /**
   * Estimate material GPU memory
   */
  private estimateMaterialMemory(asset: MaterialAsset): number {
    let total = 0;

    // Shader memory (typically negligible, but count)
    total += 0.1; // 100KB per shader

    // Texture memory
    asset.textures.forEach((tex) => {
      total += tex.gpuMemory;
    });

    return total;
  }

  /**
   * Compile shader program
   */
  private compileShader(shader: ShaderProgram): void {
    const start = performance.now();

    // In real implementation, this would compile to WebGL/WebGPU
    // For now, just mark as compiled
    shader.compiled = true;
    shader.compilationTime = performance.now() - start;

    this.shaderCache.set(shader.id, shader);
  }

  /**
   * Load texture into GPU memory
   */
  private loadTexture(texture: TextureAsset): void {
    // In real implementation, this would load from disk/network
    // For now, just mark as loaded
    texture.loaded = true;
    this.textureCache.set(texture.id, texture);
  }

  /**
   * Setup shadow mapping
   */
  private setupShadowMapping(_config: unknown): void {
    // Configure shadow map resolution and filtering
    // const shadowQuality = this.platformConfig.shadowQuality;
    // const _shadowResolution = this.shadowResolutionForQuality(shadowQuality);
    // Create shadow map textures
    // This would allocate GPU memory for shadow maps
  }

  /**
   * Get shadow map resolution for quality level
   */
  // private shadowResolutionForQuality(quality: string): number {
  //   switch (quality) {
  //     case 'none':
  //       return 0;
  //     case 'low':
  //       return 512;
  //     case 'medium':
  //       return 1024;
  //     case 'high':
  //       return 2048;
  //     default:
  //       return 1024;
  //   }
  // }

  /**
   * Setup global illumination
   */
  private setupGlobalIllumination(__config: unknown): void {
    // Create light probes for indirect lighting
    // const _probeCount = __config.probes || 16;
    // Allocate GPU memory for probes
    // Each probe stores 6 faces of cubemap
  }

  /**
   * Apply quality preset
   */
  private applyQualityPreset(quality: string): void {
    switch (quality) {
      case 'low':
        this.platformConfig.maxTextureResolution = 512;
        this.platformConfig.shadowQuality = 'none';
        this.platformConfig.targetFPS = 30;
        break;

      case 'medium':
        this.platformConfig.maxTextureResolution = 1024;
        this.platformConfig.shadowQuality = 'low';
        this.platformConfig.targetFPS = 60;
        break;

      case 'high':
        this.platformConfig.maxTextureResolution = 2048;
        this.platformConfig.shadowQuality = 'medium';
        this.platformConfig.targetFPS = 60;
        break;

      case 'ultra':
        this.platformConfig.maxTextureResolution = 4096;
        this.platformConfig.shadowQuality = 'high';
        this.platformConfig.targetFPS = 120;
        break;
    }
  }

  /**
   * Enable LOD system
   */
  private enableLOD(): void {
    // Configure automatic LOD switching based on screen coverage
  }

  /**
   * Enable culling
   */
  private enableCulling(): void {
    // Enable frustum culling and occlusion culling
  }

  /**
   * Get platform-specific configuration
   */
  private getPlatformConfig(platform: Platform): PlatformConfig {
    switch (platform) {
      case 'mobile':
        return {
          platform: 'mobile',
          maxGPUMemory: 256,
          maxDrawCalls: 200,
          maxTextureResolution: 512,
          targetFPS: 30,
          shadowQuality: 'none',
          textureCompression: 'astc',
          instancingEnabled: true,
          maxLights: 2,
          maxShadowCasters: 0,
        };

      case 'vr':
        return {
          platform: 'vr',
          maxGPUMemory: 512,
          maxDrawCalls: 500,
          maxTextureResolution: 2048,
          targetFPS: 90,
          shadowQuality: 'low',
          textureCompression: 'basis',
          instancingEnabled: true,
          maxLights: 4,
          maxShadowCasters: 2,
        };

      case 'desktop':
        return {
          platform: 'desktop',
          maxGPUMemory: 2048,
          maxDrawCalls: 2000,
          maxTextureResolution: 4096,
          targetFPS: 120,
          shadowQuality: 'high',
          textureCompression: 'none',
          instancingEnabled: true,
          maxLights: 8,
          maxShadowCasters: 4,
        };
    }
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): PerformanceMetrics {
    return {
      drawCalls: 0,
      trianglesRendered: 0,
      gpuFrameTime: 0,
      cpuFrameTime: 0,
      fps: 60,
      gpuMemoryUsed: 0,
      textureBinds: 0,
      shaderSwitches: 0,
      batchCount: 0,
    };
  }

  /**
   * Get current GPU memory estimate
   */
  getGPUMemoryEstimate(): GPUMemoryEstimate {
    let textureMemory = 0;
    let geometryMemory = 0;
    const bufferMemory = 0;

    this.textureCache.forEach((tex) => {
      if (tex.loaded) {
        textureMemory += tex.gpuMemory;
      }
    });

    this.materialCache.forEach((mat) => {
      geometryMemory += mat.gpuMemory;
    });

    const total = textureMemory + geometryMemory + bufferMemory;

    return {
      textureMemory,
      geometryMemory,
      bufferMemory,
      estimatedTotal: total,
      budget: this.platformConfig.maxGPUMemory,
      utilization: (total / this.platformConfig.maxGPUMemory) * 100,
    };
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Set memory budget
   */
  setMemoryBudget(budget: number): void {
    // this._memoryBudget = budget; // field removed
    this.platformConfig.maxGPUMemory = budget;
  }

  /**
   * Optimize for specific platform
   */
  optimizePlatform(platform: Platform): void {
    this.platformConfig = this.getPlatformConfig(platform);
  }
}

export default HololandGraphicsPipelineService;
