/** @material_fatigue Trait — Fatigue life estimation. @trait material_fatigue */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface MaterialFatigueConfig { sNcurveSlope: number; enduranceLimitMPa: number; designLifeCycles: number; stressRatio: number; surfaceFinishFactor: number; }
export interface MaterialFatigueState { accumulatedCycles: number; damageFraction: number; remainingLifePercent: number; isFailed: boolean; }

const defaultConfig: MaterialFatigueConfig = { sNcurveSlope: -0.1, enduranceLimitMPa: 200, designLifeCycles: 1e6, stressRatio: -1, surfaceFinishFactor: 0.9 };

export function createMaterialFatigueHandler(): TraitHandler<MaterialFatigueConfig> {
  return { name: 'material_fatigue', defaultConfig,
    onAttach(n: HSPlusNode, _c: MaterialFatigueConfig, ctx: TraitContext) { n.__fatigueState = { accumulatedCycles: 0, damageFraction: 0, remainingLifePercent: 100, isFailed: false }; ctx.emit?.('fatigue:monitoring_started'); },
    onDetach(n: HSPlusNode, _c: MaterialFatigueConfig, ctx: TraitContext) { delete n.__fatigueState; ctx.emit?.('fatigue:monitoring_stopped'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: MaterialFatigueConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__fatigueState as MaterialFatigueState | undefined; if (!s || s.isFailed) return;
      if (e.type === 'fatigue:add_cycles') {
        const cycles = (e.payload?.cycles as number) ?? 0;
        const stressMPa = (e.payload?.stressAmplitudeMPa as number) ?? 0;
        s.accumulatedCycles += cycles;
        const nf = stressMPa > c.enduranceLimitMPa ? Math.pow(stressMPa / c.enduranceLimitMPa, 1 / c.sNcurveSlope) * c.designLifeCycles : Infinity;
        s.damageFraction += cycles / nf;
        s.remainingLifePercent = Math.max(0, (1 - s.damageFraction) * 100);
        if (s.damageFraction >= 1) { s.isFailed = true; ctx.emit?.('fatigue:failure', { cycles: s.accumulatedCycles }); }
        else ctx.emit?.('fatigue:updated', { damage: s.damageFraction, remaining: s.remainingLifePercent });
      }
    },
  };
}
