/** @fabric_simulation Trait — Cloth physics simulation. @trait fabric_simulation */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type FabricType = 'woven' | 'knit' | 'denim' | 'silk' | 'leather' | 'synthetic' | 'lace' | 'tulle';
export interface FabricSimulationConfig { fabricType: FabricType; stiffness: number; elasticity: number; drapeCoefficient: number; windResistance: number; gravityScale: number; collisionMargin: number; vertexCount: number; }

const defaultConfig: FabricSimulationConfig = { fabricType: 'woven', stiffness: 0.5, elasticity: 0.3, drapeCoefficient: 0.7, windResistance: 0.2, gravityScale: 1.0, collisionMargin: 0.01, vertexCount: 1000 };

export function createFabricSimulationHandler(): TraitHandler<FabricSimulationConfig> {
  return { name: 'fabric_simulation', defaultConfig,
    onAttach(n: HSPlusNode, c: FabricSimulationConfig, ctx: TraitContext) { n.__fabricState = { isSimulating: false, frameCount: 0, settledPercent: 0 }; ctx.emit?.('fabric:initialized', { type: c.fabricType, vertices: c.vertexCount }); },
    onDetach(n: HSPlusNode, _c: FabricSimulationConfig, ctx: TraitContext) { delete n.__fabricState; ctx.emit?.('fabric:destroyed'); },
    onUpdate(n: HSPlusNode, c: FabricSimulationConfig, ctx: TraitContext, _d: number) {
      const s = n.__fabricState as Record<string, unknown> | undefined; if (!s || !s.isSimulating) return;
      (s.frameCount as number)++;
      s.settledPercent = Math.min(100, (s.frameCount as number) * c.drapeCoefficient);
      if ((s.settledPercent as number) >= 100) { s.isSimulating = false; ctx.emit?.('fabric:settled'); }
    },
    onEvent(n: HSPlusNode, _c: FabricSimulationConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__fabricState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'fabric:start') { s.isSimulating = true; s.frameCount = 0; s.settledPercent = 0; ctx.emit?.('fabric:simulating'); }
      if (e.type === 'fabric:apply_wind') { ctx.emit?.('fabric:wind_applied', { force: e.payload?.force }); }
    },
  };
}
