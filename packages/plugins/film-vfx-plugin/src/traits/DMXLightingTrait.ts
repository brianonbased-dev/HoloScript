import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface DMXLightingConfig { universe: number; channelStart: number; fixtureType: string; intensity: number }

export const dmxLightingHandler: TraitHandler<DMXLightingConfig> = {
  name: 'dmx_lighting',
  defaultConfig: { universe: 1, channelStart: 1, fixtureType: 'generic', intensity: 255 },
  onAttach(node: HSPlusNode, config: DMXLightingConfig, ctx: TraitContext): void {
    ctx.emit?.('dmx_lighting:attached', { nodeId: node.id, universe: config.universe, channelStart: config.channelStart });
  },
  onEvent(node: HSPlusNode, config: DMXLightingConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'dmx_lighting:set_intensity') {
      const intensity = Math.max(0, Math.min(255, Number(event.payload?.intensity ?? config.intensity)));
      config.intensity = intensity;
      ctx.emit?.('dmx_lighting:intensity_set', { nodeId: node.id, intensity });
    }
  },
};

export const DMX_LIGHTING_TRAIT = {
  name: 'dmx_lighting',
  category: 'film-vfx',
  description: 'Controls DMX fixture addressing and runtime lighting values.',
};
