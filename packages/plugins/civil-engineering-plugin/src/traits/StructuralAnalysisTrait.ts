/** @structural_analysis Trait — Finite element structural analysis. @trait structural_analysis */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type StructureType = 'beam' | 'column' | 'slab' | 'truss' | 'frame' | 'shell' | 'foundation';
export type MaterialType = 'steel' | 'concrete' | 'timber' | 'masonry' | 'composite' | 'aluminum';
export interface StructuralAnalysisConfig { structureType: StructureType; material: MaterialType; yieldStrengthMPa: number; elasticModulusGPa: number; safetyFactor: number; loadCasesCount: number; }
export interface StructuralAnalysisState { maxStressMPa: number; maxDeflectionMm: number; utilizationRatio: number; isPasssing: boolean; }

const defaultConfig: StructuralAnalysisConfig = { structureType: 'beam', material: 'steel', yieldStrengthMPa: 250, elasticModulusGPa: 200, safetyFactor: 1.5, loadCasesCount: 1 };

export function createStructuralAnalysisHandler(): TraitHandler<StructuralAnalysisConfig> {
  return { name: 'structural_analysis', defaultConfig,
    onAttach(n: HSPlusNode, _c: StructuralAnalysisConfig, ctx: TraitContext) { n.__structState = { maxStressMPa: 0, maxDeflectionMm: 0, utilizationRatio: 0, isPasssing: true }; ctx.emit?.('structural:ready'); },
    onDetach(n: HSPlusNode, _c: StructuralAnalysisConfig, ctx: TraitContext) { delete n.__structState; ctx.emit?.('structural:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: StructuralAnalysisConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__structState as StructuralAnalysisState | undefined; if (!s) return;
      if (e.type === 'structural:analyze') {
        const loadKN = (e.payload?.loadKN as number) ?? 0;
        const spanM = (e.payload?.spanM as number) ?? 1;
        s.maxStressMPa = (loadKN * 1000 * spanM) / (0.001 * c.elasticModulusGPa * 1e9) * 1e6;
        s.utilizationRatio = s.maxStressMPa / (c.yieldStrengthMPa / c.safetyFactor);
        s.isPasssing = s.utilizationRatio <= 1.0;
        ctx.emit?.('structural:result', { stress: s.maxStressMPa, utilization: s.utilizationRatio, pass: s.isPasssing });
      }
    },
  };
}
