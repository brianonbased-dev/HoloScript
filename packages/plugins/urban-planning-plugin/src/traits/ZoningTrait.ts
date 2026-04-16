/** @zoning Trait — Land use zoning classification. @trait zoning */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ZoneType = 'residential' | 'commercial' | 'industrial' | 'mixed_use' | 'agricultural' | 'recreational' | 'institutional' | 'conservation';
export type DensityClass = 'low' | 'medium' | 'high' | 'very_high';
export interface ZoningConfig { zoneType: ZoneType; density: DensityClass; maxHeightM: number; floorAreaRatio: number; setbackM: number; lotCoveragePercent: number; parkingRequirement: number; }
export interface ZoningState { currentUsage: ZoneType; complianceScore: number; violations: string[]; }

const defaultConfig: ZoningConfig = { zoneType: 'residential', density: 'medium', maxHeightM: 15, floorAreaRatio: 2.0, setbackM: 5, lotCoveragePercent: 60, parkingRequirement: 1.5 };

export function createZoningHandler(): TraitHandler<ZoningConfig> {
  return { name: 'zoning', defaultConfig,
    onAttach(n: HSPlusNode, c: ZoningConfig, ctx: TraitContext) { n.__zoningState = { currentUsage: c.zoneType, complianceScore: 100, violations: [] }; ctx.emit?.('zoning:classified', { type: c.zoneType, density: c.density }); },
    onDetach(n: HSPlusNode, _c: ZoningConfig, ctx: TraitContext) { delete n.__zoningState; ctx.emit?.('zoning:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: ZoningConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__zoningState as ZoningState | undefined; if (!s) return;
      if (e.type === 'urban_planning:economy_sim_tick') {
        const nested = e.payload?.parcels;
        const top = (e as TraitEvent & { parcels?: unknown }).parcels;
        const raw = nested !== undefined && nested !== null ? nested : top;
        const parcels = Math.max(0, Math.floor(Number(raw ?? 0)));
        ctx.emit?.('urban_planning:economy_tick', { parcels, density: c.density });
        return;
      }
      if (e.type === 'zoning:check_compliance') {
        const height = e.payload?.buildingHeightM as number ?? 0;
        s.violations = [];
        if (height > c.maxHeightM) s.violations.push(`Height ${height}m exceeds max ${c.maxHeightM}m`);
        s.complianceScore = s.violations.length === 0 ? 100 : Math.max(0, 100 - s.violations.length * 25);
        ctx.emit?.('zoning:compliance_result', { score: s.complianceScore, violations: s.violations });
      }
    },
  };
}
