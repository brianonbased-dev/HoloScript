/** @risk_model Trait — Financial risk assessment. @trait risk_model */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type RiskCategory = 'market' | 'credit' | 'operational' | 'liquidity' | 'regulatory';
export interface RiskModelConfig { category: RiskCategory; varConfidenceLevel: number; timeHorizonDays: number; stressScenarios: string[]; maxExposure: number; }
export interface RiskModelState { currentVaR: number; stressTestResults: Record<string, number>; riskScore: number; breachCount: number; }

const defaultConfig: RiskModelConfig = { category: 'market', varConfidenceLevel: 0.99, timeHorizonDays: 1, stressScenarios: ['crash_2008', 'covid_2020', 'rate_hike'], maxExposure: 1000000 };

export function createRiskModelHandler(): TraitHandler<RiskModelConfig> {
  return { name: 'risk_model', defaultConfig,
    onAttach(n: HSPlusNode, _c: RiskModelConfig, ctx: TraitContext) { n.__riskState = { currentVaR: 0, stressTestResults: {}, riskScore: 0, breachCount: 0 }; ctx.emit?.('risk:model_loaded'); },
    onDetach(n: HSPlusNode, _c: RiskModelConfig, ctx: TraitContext) { delete n.__riskState; ctx.emit?.('risk:model_removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: RiskModelConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__riskState as RiskModelState | undefined; if (!s) return;
      if (e.type === 'risk:calculate_var') { s.currentVaR = (e.payload?.portfolioValue as number ?? 0) * (1 - c.varConfidenceLevel) * Math.sqrt(c.timeHorizonDays); ctx.emit?.('risk:var_calculated', { var: s.currentVaR }); if (s.currentVaR > c.maxExposure) { s.breachCount++; ctx.emit?.('risk:breach', { var: s.currentVaR, limit: c.maxExposure }); } }
      if (e.type === 'risk:stress_test') { for (const scenario of c.stressScenarios) { s.stressTestResults[scenario] = Math.random() * c.maxExposure * 0.3; } ctx.emit?.('risk:stress_complete', { results: s.stressTestResults }); }
    },
  };
}
