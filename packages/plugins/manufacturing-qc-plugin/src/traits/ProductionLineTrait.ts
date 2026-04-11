/** @production_line Trait — Assembly line management. @trait production_line */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface Station { id: string; name: string; cycleTimeS: number; status: 'running' | 'idle' | 'maintenance' | 'error'; }
export interface ProductionLineConfig { stations: Station[]; targetUnitsPerHour: number; shiftDurationH: number; product: string; }
export interface ProductionLineState { unitsProduced: number; currentThroughput: number; bottleneckStation: string | null; isRunning: boolean; }

const defaultConfig: ProductionLineConfig = { stations: [], targetUnitsPerHour: 60, shiftDurationH: 8, product: '' };

export function createProductionLineHandler(): TraitHandler<ProductionLineConfig> {
  return { name: 'production_line', defaultConfig,
    onAttach(n: HSPlusNode, c: ProductionLineConfig, ctx: TraitContext) { n.__lineState = { unitsProduced: 0, currentThroughput: 0, bottleneckStation: null, isRunning: false }; ctx.emit?.('line:created', { stations: c.stations.length }); },
    onDetach(n: HSPlusNode, _c: ProductionLineConfig, ctx: TraitContext) { delete n.__lineState; ctx.emit?.('line:shutdown'); },
    onUpdate(n: HSPlusNode, c: ProductionLineConfig, ctx: TraitContext, delta: number) {
      const s = n.__lineState as ProductionLineState | undefined; if (!s?.isRunning) return;
      s.unitsProduced += (c.targetUnitsPerHour / 3600) * (delta / 1000);
      const slowest = c.stations.reduce((a, b) => a.cycleTimeS > b.cycleTimeS ? a : b, c.stations[0]);
      s.bottleneckStation = slowest?.id ?? null;
    },
    onEvent(n: HSPlusNode, _c: ProductionLineConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__lineState as ProductionLineState | undefined; if (!s) return;
      if (e.type === 'line:start') { s.isRunning = true; ctx.emit?.('line:started'); }
      if (e.type === 'line:stop') { s.isRunning = false; ctx.emit?.('line:stopped', { produced: s.unitsProduced }); }
    },
  };
}
