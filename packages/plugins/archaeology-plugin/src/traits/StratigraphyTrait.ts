import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './types';

export interface StratigraphyLayer {
  order: number;
  name: string;
  period: string;
  thicknessM: number;
}

export interface StratigraphyConfig {
  layers: StratigraphyLayer[];
  totalDepthM: number;
  siteId: string;
  analysisStatus: 'pending' | 'in_progress' | 'complete';
}

const handler: TraitHandler<StratigraphyConfig> = {
  name: 'stratigraphy',
  defaultConfig: {
    layers: [],
    totalDepthM: 0,
    siteId: '',
    analysisStatus: 'pending',
  },
  onEvent(_node: HSPlusNode, config: StratigraphyConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'stratigraphy:add_layer') {
      const layer = event.payload as unknown as StratigraphyLayer;
      config.layers.push(layer);
      config.layers.sort((a, b) => a.order - b.order);
      config.totalDepthM = config.layers.reduce((sum, l) => sum + l.thicknessM, 0);
      ctx.emit?.('layer_added', { order: layer.order, period: layer.period, totalDepth: config.totalDepthM });
    } else if (event.type === 'stratigraphy:start_analysis') {
      config.analysisStatus = 'in_progress';
      ctx.emit?.('analysis_started', { siteId: config.siteId, layerCount: config.layers.length });
    } else if (event.type === 'stratigraphy:complete_analysis') {
      config.analysisStatus = 'complete';
      ctx.emit?.('analysis_complete', { siteId: config.siteId, totalDepth: config.totalDepthM });
    }
  },
};

export const StratigraphyTrait = handler;
