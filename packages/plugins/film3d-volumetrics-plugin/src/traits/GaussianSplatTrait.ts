/** @gaussian_splat Trait — 3D Gaussian Splatting rendering. @trait gaussian_splat */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface GaussianSplatConfig { splatCount: number; shDegree: number; sortMethod: 'radix' | 'bitonic' | 'cpu'; enableAntialiasing: boolean; opacityThreshold: number; maxSplatSize: number; lodLevels: number; }

const defaultConfig: GaussianSplatConfig = { splatCount: 0, shDegree: 3, sortMethod: 'radix', enableAntialiasing: true, opacityThreshold: 0.005, maxSplatSize: 0.1, lodLevels: 4 };

export function createGaussianSplatHandler(): TraitHandler<GaussianSplatConfig> {
  return { name: 'gaussian_splat', defaultConfig,
    onAttach(n: HSPlusNode, c: GaussianSplatConfig, ctx: TraitContext) { n.__gsplatState = { loaded: false, visibleSplats: 0, sortTimeMs: 0, lodLevel: 0 }; ctx.emit?.('gsplat:initialized', { count: c.splatCount, sort: c.sortMethod }); },
    onDetach(n: HSPlusNode, _c: GaussianSplatConfig, ctx: TraitContext) { delete n.__gsplatState; ctx.emit?.('gsplat:disposed'); },
    onUpdate(n: HSPlusNode, _c: GaussianSplatConfig, ctx: TraitContext, _d: number) {
      const s = n.__gsplatState as Record<string, unknown> | undefined;
      if (s?.loaded) ctx.emit?.('gsplat:frame', { visible: s.visibleSplats, sortMs: s.sortTimeMs });
    },
    onEvent(n: HSPlusNode, _c: GaussianSplatConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__gsplatState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'gsplat:load') { s.loaded = true; ctx.emit?.('gsplat:loaded'); }
      if (e.type === 'gsplat:set_lod') { s.lodLevel = e.payload?.level; ctx.emit?.('gsplat:lod_changed', { level: s.lodLevel }); }
    },
  };
}
