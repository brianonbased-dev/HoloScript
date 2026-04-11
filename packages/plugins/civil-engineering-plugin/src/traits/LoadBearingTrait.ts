/** @load_bearing Trait — Load path and capacity tracking. @trait load_bearing */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type LoadType = 'dead' | 'live' | 'wind' | 'seismic' | 'snow' | 'impact' | 'thermal';
export interface LoadCase { id: string; type: LoadType; magnitudeKN: number; direction: [number, number, number]; combinationFactor: number; }
export interface LoadBearingConfig { capacityKN: number; loadCases: LoadCase[]; redundancyFactor: number; }
export interface LoadBearingState { totalAppliedKN: number; remainingCapacityKN: number; criticalLoadCase: string | null; isOverloaded: boolean; }

const defaultConfig: LoadBearingConfig = { capacityKN: 100, loadCases: [], redundancyFactor: 1.0 };

export function createLoadBearingHandler(): TraitHandler<LoadBearingConfig> {
  return { name: 'load_bearing', defaultConfig,
    onAttach(n: HSPlusNode, c: LoadBearingConfig, ctx: TraitContext) {
      const total = c.loadCases.reduce((sum, lc) => sum + lc.magnitudeKN * lc.combinationFactor, 0);
      n.__loadState = { totalAppliedKN: total, remainingCapacityKN: c.capacityKN - total, criticalLoadCase: null, isOverloaded: total > c.capacityKN };
      ctx.emit?.('load:assessed', { total, capacity: c.capacityKN });
    },
    onDetach(n: HSPlusNode, _c: LoadBearingConfig, ctx: TraitContext) { delete n.__loadState; ctx.emit?.('load:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: LoadBearingConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__loadState as LoadBearingState | undefined; if (!s) return;
      if (e.type === 'load:add') { const kn = (e.payload?.magnitudeKN as number) ?? 0; s.totalAppliedKN += kn; s.remainingCapacityKN = c.capacityKN - s.totalAppliedKN; s.isOverloaded = s.totalAppliedKN > c.capacityKN; if (s.isOverloaded) ctx.emit?.('load:overloaded', { applied: s.totalAppliedKN, capacity: c.capacityKN }); }
    },
  };
}
