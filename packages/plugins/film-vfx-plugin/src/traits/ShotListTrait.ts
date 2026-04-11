import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface ShotListConfig { shotId: string; scene: string; take: number; status: 'planned' | 'ready' | 'shot' }

export const shotListHandler: TraitHandler<ShotListConfig> = {
  name: 'shot_list',
  defaultConfig: { shotId: '', scene: '', take: 1, status: 'planned' },
  onAttach(node: HSPlusNode, config: ShotListConfig, ctx: TraitContext): void {
    ctx.emit?.('shot_list:attached', { nodeId: node.id, shotId: config.shotId, scene: config.scene });
  },
  onEvent(node: HSPlusNode, config: ShotListConfig, ctx: TraitContext, event: TraitEvent): void {
    if (event.type === 'shot_list:mark_shot') {
      config.status = 'shot';
      ctx.emit?.('shot_list:shot', { nodeId: node.id, shotId: config.shotId, take: config.take });
    }
  },
};

export const SHOT_LIST_TRAIT = {
  name: 'shot_list',
  category: 'film-vfx',
  description: 'Tracks shot planning, readiness, and completion status.',
};
