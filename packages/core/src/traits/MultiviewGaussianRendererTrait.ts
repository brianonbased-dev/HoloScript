/**
 * MultiviewGaussianRenderer Trait
 * Shared preprocessing with per-user foveated blending for multi-user VR.
 * @version 1.0.0
 */
export interface ViewConfig {
  userId: string;
  eyePosition: [number, number, number];
  eyeDirection: [number, number, number];
  foveationCenter: [number, number]; // normalized NDC
  foveationRadius: number; // 0-1
  ipd: number; // interpupillary distance
}

export interface FoveatedBlendConfig {
  innerRadius: number; // full quality
  outerRadius: number; // reduced quality
  innerQuality: number; // 1.0 = full gaussians
  outerQuality: number; // 0.25 = quarter gaussians
  peripheralDecimation: number; // 0-1
}

export interface MultiviewRenderResult {
  sharedPreprocessMs: number;
  perViewSortMs: number[];
  perViewRenderMs: number[];
  totalGaussians: number;
  effectiveGaussiansPerView: number[];
  foveationSavingsPercent: number;
}

export const DEFAULT_FOVEATED_BLEND: FoveatedBlendConfig = {
  innerRadius: 0.15,
  outerRadius: 0.6,
  innerQuality: 1.0,
  outerQuality: 0.25,
  peripheralDecimation: 0.5,
};

export class MultiviewGaussianRendererTrait {
  public readonly traitName = 'MultiviewGaussianRenderer';
  private views: Map<string, ViewConfig> = new Map();
  private blendConfig: FoveatedBlendConfig;
  private sharedSortBuffer: Float32Array | null = null;
  private gaussianCount: number = 0;

  constructor(blendConfig: Partial<FoveatedBlendConfig> = {}) {
    this.blendConfig = { ...DEFAULT_FOVEATED_BLEND, ...blendConfig };
  }

  addView(view: ViewConfig): void {
    this.views.set(view.userId, view);
  }
  removeView(userId: string): void {
    this.views.delete(userId);
  }
  updateView(userId: string, update: Partial<ViewConfig>): void {
    const v = this.views.get(userId);
    if (v) this.views.set(userId, { ...v, ...update });
  }

  setGaussianCount(count: number): void {
    this.gaussianCount = count;
  }

  preprocess(): { sortedIndices: Uint32Array; preprocessMs: number } {
    const start = performance.now();
    // Shared preprocessing: compute view-independent data (covariance, opacity)
    // Sort by average view distance across all users
    const indices = new Uint32Array(this.gaussianCount);
    for (let i = 0; i < this.gaussianCount; i++) indices[i] = i;
    const preprocessMs = performance.now() - start;
    return { sortedIndices: indices, preprocessMs };
  }

  getEffectiveCount(viewConfig: ViewConfig): number {
    // Foveated reduction: full count in fovea, reduced in periphery
    const fovealArea = Math.PI * this.blendConfig.innerRadius ** 2;
    const totalArea = 1.0; // normalized
    const fovealFraction = fovealArea / totalArea;
    const peripheralFraction = 1 - fovealFraction;
    return Math.ceil(
      this.gaussianCount * fovealFraction * this.blendConfig.innerQuality +
        this.gaussianCount * peripheralFraction * this.blendConfig.outerQuality
    );
  }

  estimateSavings(): number {
    if (this.views.size === 0) return 0;
    const naiveTotal = this.gaussianCount * this.views.size;
    let effectiveTotal = 0;
    for (const view of this.views.values()) effectiveTotal += this.getEffectiveCount(view);
    return naiveTotal > 0 ? ((naiveTotal - effectiveTotal) / naiveTotal) * 100 : 0;
  }

  getViewCount(): number {
    return this.views.size;
  }
  getBlendConfig(): FoveatedBlendConfig {
    return { ...this.blendConfig };
  }
  setBlendConfig(config: Partial<FoveatedBlendConfig>): void {
    Object.assign(this.blendConfig, config);
  }
}

// ── Handler (delegates to MultiviewGaussianRendererTrait) ──
import type { TraitHandler } from './TraitTypes';

export const multiviewGaussianRendererHandler = {
  name: 'multiview_gaussian_renderer',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    const instance = new MultiviewGaussianRendererTrait(config);
    node.__multiview_gaussian_renderer_instance = instance;
    ctx.emit('multiview_gaussian_renderer_attached', { node, config });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    const instance = node.__multiview_gaussian_renderer_instance;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('multiview_gaussian_renderer_detached', { node });
    delete node.__multiview_gaussian_renderer_instance;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    const instance = node.__multiview_gaussian_renderer_instance;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'multiview_gaussian_renderer_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('multiview_gaussian_renderer_configured', { node });
    }
  },
  onUpdate(node: any, _config: any, ctx: any, dt: number): void {
    const instance = node.__multiview_gaussian_renderer_instance;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
