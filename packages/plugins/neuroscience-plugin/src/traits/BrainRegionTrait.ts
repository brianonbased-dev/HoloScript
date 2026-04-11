/**
 * @brain_region Trait — Neuroanatomical region definition
 * @trait brain_region
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type Hemisphere = 'left' | 'right' | 'bilateral';

export interface BrainRegionConfig {
  name: string;
  hemisphere: Hemisphere;
  brodmannArea?: number;
  cortexZone?: 'frontal' | 'parietal' | 'temporal' | 'occipital' | 'insular' | 'limbic' | 'cerebellar';
  volumeMm3?: number;
  activationLevel: number;
  connections: string[];
}

export interface BrainRegionState {
  currentActivation: number;
  peakActivation: number;
  lastUpdateMs: number;
}

const defaultConfig: BrainRegionConfig = { name: '', hemisphere: 'left', activationLevel: 0, connections: [] };

export function createBrainRegionHandler(): TraitHandler<BrainRegionConfig> {
  return {
    name: 'brain_region',
    defaultConfig,
    onAttach(node: HSPlusNode, config: BrainRegionConfig, ctx: TraitContext) {
      node.__brainRegionState = { currentActivation: config.activationLevel, peakActivation: config.activationLevel, lastUpdateMs: Date.now() };
      ctx.emit?.('brain_region:attached', { region: config.name, hemisphere: config.hemisphere });
    },
    onDetach(node: HSPlusNode, _c: BrainRegionConfig, ctx: TraitContext) { delete node.__brainRegionState; ctx.emit?.('brain_region:detached'); },
    onUpdate(node: HSPlusNode, _c: BrainRegionConfig, _ctx: TraitContext, delta: number) {
      const s = node.__brainRegionState as BrainRegionState | undefined;
      if (s) s.lastUpdateMs += delta;
    },
    onEvent(node: HSPlusNode, config: BrainRegionConfig, ctx: TraitContext, event: TraitEvent) {
      const s = node.__brainRegionState as BrainRegionState | undefined;
      if (!s) return;
      if (event.type === 'brain_region:stimulate') {
        const intensity = (event.payload?.intensity as number) ?? 0.5;
        s.currentActivation = Math.min(1, s.currentActivation + intensity);
        s.peakActivation = Math.max(s.peakActivation, s.currentActivation);
        ctx.emit?.('brain_region:activated', { region: config.name, level: s.currentActivation });
      }
    },
  };
}
