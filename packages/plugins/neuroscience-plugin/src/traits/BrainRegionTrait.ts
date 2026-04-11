import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent, BrainHemisphere } from './types';

export interface BrainRegionConfig {
  regionId: string;
  label: string;
  hemisphere: BrainHemisphere;
  activation: number;
}

export const brainRegionHandler: TraitHandler<BrainRegionConfig> = {
  name: 'brain_region',
  defaultConfig: { regionId: '', label: '', hemisphere: 'left', activation: 0 },
  onAttach(node: HSPlusNode, config: BrainRegionConfig, ctx: TraitContext): void {
    ctx.emit?.('brain_region:attached', { nodeId: node.id, regionId: config.regionId, label: config.label });
  },
  onEvent(node: HSPlusNode, config: BrainRegionConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'brain_region:stimulate') {
      const delta = Number(event.payload?.delta ?? 0.1);
      config.activation = Math.max(0, Math.min(1, config.activation + delta));
      ctx.emit?.('brain_region:activation', { nodeId: node.id, regionId: config.regionId, activation: config.activation });
    }
  },
};

export const BRAIN_REGION_TRAIT = {
  name: 'brain_region',
  category: 'neuroscience',
  description: 'Represents a neuroanatomical region with activation dynamics.',
};
