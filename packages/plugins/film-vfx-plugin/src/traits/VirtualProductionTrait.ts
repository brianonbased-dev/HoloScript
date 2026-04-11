import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface VirtualProductionConfig { stageId: string; ledWall: boolean; cameraTracking: boolean; syncFrameRate: number }

export const virtualProductionHandler: TraitHandler<VirtualProductionConfig> = {
  name: 'virtual_production',
  defaultConfig: { stageId: '', ledWall: true, cameraTracking: true, syncFrameRate: 24 },
  onAttach(node: HSPlusNode, config: VirtualProductionConfig, ctx: TraitContext): void {
    ctx.emit?.('virtual_production:attached', {
      nodeId: node.id,
      stageId: config.stageId,
      ledWall: config.ledWall,
      cameraTracking: config.cameraTracking,
    });
  },
  onEvent(node: HSPlusNode, config: VirtualProductionConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'virtual_production:sync') {
      const fps = Number(event.payload?.syncFrameRate ?? config.syncFrameRate);
      config.syncFrameRate = fps;
      ctx.emit?.('virtual_production:synced', { nodeId: node.id, stageId: config.stageId, syncFrameRate: fps });
    }
  },
};

export const VIRTUAL_PRODUCTION_TRAIT = {
  name: 'virtual_production',
  category: 'film-vfx',
  description: 'Virtual production stage controls (LED wall, camera tracking, sync).',
};
