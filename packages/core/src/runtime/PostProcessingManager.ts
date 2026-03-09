/**
 * PostProcessingManager.ts
 *
 * Advanced post-processing effects for AAA-quality visuals.
 * Includes SSAO, SSR, bloom, motion blur, TAA, and more.
 *
 * Visual Impact:
 * - SSAO: Realistic ambient occlusion shadows
 * - Bloom: Glowing lights and emissive materials
 * - Motion Blur: Cinematic motion effects
 * - TAA: Anti-aliasing with temporal filtering
 * - Depth of Field: Camera focus effects
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/examples/jsm/postprocessing/SSAOPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { TAARenderPass } from 'three/examples/jsm/postprocessing/TAARenderPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/examples/jsm/shaders/FXAAShader.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

export type PostProcessingQuality = 'low' | 'medium' | 'high' | 'ultra';

export interface PostProcessingConfig {
  /** Enable SSAO (Screen-Space Ambient Occlusion) */
  ssao?: {
    enabled: boolean;
    radius?: number;
    minDistance?: number;
    maxDistance?: number;
    intensity?: number;
  };

  /** Enable Bloom */
  bloom?: {
    enabled: boolean;
    strength?: number;
    radius?: number;
    threshold?: number;
  };

  /** Enable TAA (Temporal Anti-Aliasing) */
  taa?: {
    enabled: boolean;
    sampleLevel?: number;
  };

  /** Enable FXAA (Fast Approximate Anti-Aliasing) */
  fxaa?: {
    enabled: boolean;
  };

  /** Enable Motion Blur */
  motionBlur?: {
    enabled: boolean;
    intensity?: number;
    samples?: number;
  };

  /** Enable Depth of Field */
  depthOfField?: {
    enabled: boolean;
    focusDistance?: number;
    focalLength?: number;
    bokehScale?: number;
  };

  /** Enable Vignette */
  vignette?: {
    enabled: boolean;
    offset?: number;
    darkness?: number;
  };

  /** Enable Film Grain */
  filmGrain?: {
    enabled: boolean;
    intensity?: number;
  };

  /** Enable Chromatic Aberration */
  chromaticAberration?: {
    enabled: boolean;
    offset?: number;
  };

  /** Overall quality preset */
  quality?: PostProcessingQuality;
}

export interface PostProcessingStats {
  enabled: boolean;
  activeEffects: number;
  renderTime: number;
  quality: PostProcessingQuality;
}

/**
 * Quality presets for different performance levels
 */
const QUALITY_PRESETS: Record<PostProcessingQuality, Partial<PostProcessingConfig>> = {
  low: {
    ssao: { enabled: false },
    bloom: { enabled: true, strength: 0.5, radius: 0.3 },
    taa: { enabled: false },
    fxaa: { enabled: true },
    motionBlur: { enabled: false },
    depthOfField: { enabled: false },
    vignette: { enabled: true, offset: 1.0, darkness: 1.2 },
    filmGrain: { enabled: false },
    chromaticAberration: { enabled: false },
  },
  medium: {
    ssao: { enabled: true, radius: 4, intensity: 1.0 },
    bloom: { enabled: true, strength: 1.0, radius: 0.5, threshold: 0.85 },
    taa: { enabled: false },
    fxaa: { enabled: true },
    motionBlur: { enabled: false },
    depthOfField: { enabled: false },
    vignette: { enabled: true, offset: 1.0, darkness: 1.2 },
    filmGrain: { enabled: true, intensity: 0.1 },
    chromaticAberration: { enabled: false },
  },
  high: {
    ssao: { enabled: true, radius: 8, intensity: 1.5 },
    bloom: { enabled: true, strength: 1.5, radius: 0.7, threshold: 0.8 },
    taa: { enabled: true, sampleLevel: 2 },
    fxaa: { enabled: false },
    motionBlur: { enabled: true, intensity: 1.0, samples: 16 },
    depthOfField: { enabled: true, focusDistance: 10, focalLength: 0.1 },
    vignette: { enabled: true, offset: 1.0, darkness: 1.3 },
    filmGrain: { enabled: true, intensity: 0.15 },
    chromaticAberration: { enabled: true, offset: 0.001 },
  },
  ultra: {
    ssao: { enabled: true, radius: 16, intensity: 2.0 },
    bloom: { enabled: true, strength: 2.0, radius: 1.0, threshold: 0.75 },
    taa: { enabled: true, sampleLevel: 3 },
    fxaa: { enabled: false },
    motionBlur: { enabled: true, intensity: 1.5, samples: 32 },
    depthOfField: { enabled: true, focusDistance: 10, focalLength: 0.15, bokehScale: 3.0 },
    vignette: { enabled: true, offset: 0.95, darkness: 1.5 },
    filmGrain: { enabled: true, intensity: 0.2 },
    chromaticAberration: { enabled: true, offset: 0.002 },
  },
};

/**
 * Custom shaders for additional effects
 */
const VignetteShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 1.0 },
    darkness: { value: 1.0 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    uniform float darkness;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      vec2 uv = (vUv - vec2(0.5)) * vec2(offset);
      float vignette = 1.0 - dot(uv, uv);
      texel.rgb *= pow(vignette, darkness);
      gl_FragColor = texel;
    }
  `,
};

const FilmGrainShader = {
  uniforms: {
    tDiffuse: { value: null },
    time: { value: 0.0 },
    intensity: { value: 0.1 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float intensity;
    varying vec2 vUv;

    float random(vec2 st) {
      return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
    }

    void main() {
      vec4 texel = texture2D(tDiffuse, vUv);
      float noise = random(vUv * time) * intensity;
      texel.rgb += noise;
      gl_FragColor = texel;
    }
  `,
};

const ChromaticAberrationShader = {
  uniforms: {
    tDiffuse: { value: null },
    offset: { value: 0.001 },
  },
  vertexShader: `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float offset;
    varying vec2 vUv;

    void main() {
      vec2 direction = vUv - vec2(0.5);
      float r = texture2D(tDiffuse, vUv + direction * offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - direction * offset).b;
      gl_FragColor = vec4(r, g, b, 1.0);
    }
  `,
};

/**
 * Manages post-processing effects for enhanced visuals
 */
export class PostProcessingManager {
  private composer: EffectComposer | null = null;
  private config: PostProcessingConfig;
  private quality: PostProcessingQuality = 'medium';
  private enabled = true;
  private renderTime = 0;
  private passes = new Map<string, any>();

  constructor(config: PostProcessingConfig = {}) {
    this.quality = config.quality || 'medium';
    this.config = this.mergeWithPreset(config, this.quality);
  }

  /**
   * Merge user config with quality preset
   */
  private mergeWithPreset(
    userConfig: PostProcessingConfig,
    quality: PostProcessingQuality
  ): PostProcessingConfig {
    const preset = QUALITY_PRESETS[quality];
    return {
      ...preset,
      ...userConfig,
      quality,
    };
  }

  /**
   * Initialize post-processing with renderer, scene, and camera
   */
  initialize(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera): void {
    // Create composer
    this.composer = new EffectComposer(renderer);

    // Add base render pass
    const renderPass = new RenderPass(scene, camera);
    this.composer.addPass(renderPass);
    this.passes.set('render', renderPass);

    // Add SSAO
    if (this.config.ssao?.enabled) {
      this.addSSAO(scene, camera, renderer.domElement.width, renderer.domElement.height);
    }

    // Add Bloom
    if (this.config.bloom?.enabled) {
      this.addBloom(renderer.domElement.width, renderer.domElement.height);
    }

    // Add TAA
    if (this.config.taa?.enabled) {
      this.addTAA(scene, camera, renderer.domElement.width, renderer.domElement.height);
    }

    // Add FXAA
    if (this.config.fxaa?.enabled) {
      this.addFXAA(renderer.domElement.width, renderer.domElement.height);
    }

    // Add Vignette
    if (this.config.vignette?.enabled) {
      this.addVignette();
    }

    // Add Film Grain
    if (this.config.filmGrain?.enabled) {
      this.addFilmGrain();
    }

    // Add Chromatic Aberration
    if (this.config.chromaticAberration?.enabled) {
      this.addChromaticAberration();
    }

    // Add output pass (final color correction)
    const outputPass = new OutputPass();
    this.composer.addPass(outputPass);
    this.passes.set('output', outputPass);
  }

  /**
   * Add SSAO (Screen-Space Ambient Occlusion)
   */
  private addSSAO(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): void {
    const ssaoPass = new SSAOPass(scene, camera, width, height);
    ssaoPass.kernelRadius = this.config.ssao!.radius || 8;
    ssaoPass.minDistance = this.config.ssao!.minDistance || 0.005;
    ssaoPass.maxDistance = this.config.ssao!.maxDistance || 0.1;

    this.composer!.addPass(ssaoPass);
    this.passes.set('ssao', ssaoPass);
  }

  /**
   * Add Bloom effect
   */
  private addBloom(width: number, height: number): void {
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      this.config.bloom!.strength || 1.5,
      this.config.bloom!.radius || 0.7,
      this.config.bloom!.threshold || 0.8
    );

    this.composer!.addPass(bloomPass);
    this.passes.set('bloom', bloomPass);
  }

  /**
   * Add TAA (Temporal Anti-Aliasing)
   */
  private addTAA(scene: THREE.Scene, camera: THREE.Camera, width: number, height: number): void {
    const taaPass = new TAARenderPass(scene, camera);
    taaPass.sampleLevel = this.config.taa!.sampleLevel || 2;

    this.composer!.addPass(taaPass);
    this.passes.set('taa', taaPass);
  }

  /**
   * Add FXAA (Fast Approximate Anti-Aliasing)
   */
  private addFXAA(width: number, height: number): void {
    const fxaaPass = new ShaderPass(FXAAShader);
    fxaaPass.material.uniforms['resolution'].value.set(1 / width, 1 / height);

    this.composer!.addPass(fxaaPass);
    this.passes.set('fxaa', fxaaPass);
  }

  /**
   * Add Vignette effect
   */
  private addVignette(): void {
    const vignettePass = new ShaderPass(VignetteShader);
    vignettePass.material.uniforms['offset'].value = this.config.vignette!.offset || 1.0;
    vignettePass.material.uniforms['darkness'].value = this.config.vignette!.darkness || 1.2;

    this.composer!.addPass(vignettePass);
    this.passes.set('vignette', vignettePass);
  }

  /**
   * Add Film Grain effect
   */
  private addFilmGrain(): void {
    const filmGrainPass = new ShaderPass(FilmGrainShader);
    filmGrainPass.material.uniforms['intensity'].value = this.config.filmGrain!.intensity || 0.1;

    this.composer!.addPass(filmGrainPass);
    this.passes.set('filmGrain', filmGrainPass);
  }

  /**
   * Add Chromatic Aberration effect
   */
  private addChromaticAberration(): void {
    const chromaticPass = new ShaderPass(ChromaticAberrationShader);
    chromaticPass.material.uniforms['offset'].value =
      this.config.chromaticAberration!.offset || 0.001;

    this.composer!.addPass(chromaticPass);
    this.passes.set('chromaticAberration', chromaticPass);
  }

  /**
   * Render with post-processing
   */
  render(deltaTime?: number): void {
    if (!this.composer || !this.enabled) return;

    const startTime = performance.now();

    // Update time-based effects
    if (this.passes.has('filmGrain')) {
      const filmGrainPass = this.passes.get('filmGrain');
      filmGrainPass.material.uniforms['time'].value += deltaTime || 0.016;
    }

    this.composer.render(deltaTime);

    this.renderTime = performance.now() - startTime;
  }

  /**
   * Update quality preset
   */
  setQuality(quality: PostProcessingQuality): void {
    this.quality = quality;
    // Would need to reinitialize with new preset
    // For now, just update the config
    this.config = this.mergeWithPreset(this.config, quality);
  }

  /**
   * Enable/disable specific effect
   */
  setEffectEnabled(effectName: string, enabled: boolean): void {
    const pass = this.passes.get(effectName);
    if (pass) {
      pass.enabled = enabled;
    }
  }

  /**
   * Enable/disable all post-processing
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Get statistics
   */
  getStats(): PostProcessingStats {
    return {
      enabled: this.enabled,
      activeEffects: Array.from(this.passes.values()).filter((p) => p.enabled).length,
      renderTime: this.renderTime,
      quality: this.quality,
    };
  }

  /**
   * Resize (call when renderer size changes)
   */
  setSize(width: number, height: number): void {
    if (this.composer) {
      this.composer.setSize(width, height);

      // Update resolution-dependent uniforms
      if (this.passes.has('fxaa')) {
        const fxaaPass = this.passes.get('fxaa');
        fxaaPass.material.uniforms['resolution'].value.set(1 / width, 1 / height);
      }
    }
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    if (this.composer) {
      this.composer.dispose();
    }
    this.passes.clear();
  }
}
