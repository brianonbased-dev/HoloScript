/** @nerf Trait — Neural Radiance Field rendering. @trait nerf */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type NeRFMethod = 'instant_ngp' | 'nerfacto' | 'tensorf' | 'mip_nerf' | 'zip_nerf';
export interface NeRFConfig { method: NeRFMethod; resolution: number; nearPlane: number; farPlane: number; samplesPerRay: number; batchSize: number; enableDeformation: boolean; }

const defaultConfig: NeRFConfig = { method: 'instant_ngp', resolution: 512, nearPlane: 0.01, farPlane: 100, samplesPerRay: 64, batchSize: 4096, enableDeformation: false };

export function createNeRFHandler(): TraitHandler<NeRFConfig> {
  return { name: 'nerf', defaultConfig,
    onAttach(n: HSPlusNode, c: NeRFConfig, ctx: TraitContext) { n.__nerfState = { isRendering: false, fps: 0, trainStep: 0, psnr: 0 }; ctx.emit?.('nerf:loaded', { method: c.method }); },
    onDetach(n: HSPlusNode, _c: NeRFConfig, ctx: TraitContext) { delete n.__nerfState; ctx.emit?.('nerf:unloaded'); },
    onUpdate(n: HSPlusNode, _c: NeRFConfig, _ctx: TraitContext, _d: number) { const s = n.__nerfState as Record<string, unknown> | undefined; if (s?.isRendering) { (s.trainStep as number)++; } },
    onEvent(n: HSPlusNode, _c: NeRFConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__nerfState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'nerf:render') { s.isRendering = true; ctx.emit?.('nerf:rendering'); }
      if (e.type === 'nerf:stop') { s.isRendering = false; ctx.emit?.('nerf:stopped', { steps: s.trainStep }); }
    },
  };
}
