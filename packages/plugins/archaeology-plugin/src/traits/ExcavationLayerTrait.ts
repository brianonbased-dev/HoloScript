import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './types';

export interface ExcavationLayerConfig {
  depth: number;
  period: string;
  material: 'soil' | 'rock' | 'sediment' | 'ash' | 'debris';
  gridRef: string;
  status: 'pending' | 'active' | 'completed' | 'sealed';
}

const handler: TraitHandler<ExcavationLayerConfig> = {
  name: 'excavation_layer',
  defaultConfig: {
    depth: 0,
    period: 'unknown',
    material: 'soil',
    gridRef: 'A1',
    status: 'pending',
  },
  onEvent(_node: HSPlusNode, config: ExcavationLayerConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'excavation_layer:start') {
      config.status = 'active';
      ctx.emit?.('layer_excavation_started', { depth: config.depth, period: config.period });
    } else if (event.type === 'excavation_layer:complete') {
      config.status = 'completed';
      ctx.emit?.('layer_excavation_completed', { depth: config.depth, material: config.material });
    } else if (event.type === 'excavation_layer:set_depth') {
      config.depth = (event.payload as { depth: number }).depth;
    } else if (event.type === 'excavation_layer:seal') {
      config.status = 'sealed';
      ctx.emit?.('layer_sealed', { gridRef: config.gridRef, depth: config.depth });
    }
  },
};

export const ExcavationLayerTrait = handler;
