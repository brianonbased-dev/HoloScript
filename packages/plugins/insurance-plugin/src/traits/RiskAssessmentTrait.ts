/** @risk_assessment Trait — Actuarial risk scoring. @trait risk_assessment */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface RiskFactor { name: string; weight: number; value: number; maxValue: number; }
export interface RiskAssessmentConfig { factors: RiskFactor[]; baseRate: number; riskClass: 'preferred' | 'standard' | 'substandard' | 'declined'; maxRiskScore: number; }

const defaultConfig: RiskAssessmentConfig = { factors: [], baseRate: 100, riskClass: 'standard', maxRiskScore: 100 };

export function createRiskAssessmentHandler(): TraitHandler<RiskAssessmentConfig> {
  return { name: 'risk_assessment', defaultConfig,
    onAttach(n: HSPlusNode, c: RiskAssessmentConfig, ctx: TraitContext) {
      const score = c.factors.reduce((s, f) => s + (f.value / f.maxValue) * f.weight, 0);
      n.__riskAssessState = { riskScore: Math.min(c.maxRiskScore, score), adjustedPremium: c.baseRate * (1 + score / 100), isAcceptable: c.riskClass !== 'declined' };
      ctx.emit?.('risk_assessment:scored', { score, riskClass: c.riskClass });
    },
    onDetach(n: HSPlusNode, _c: RiskAssessmentConfig, ctx: TraitContext) { delete n.__riskAssessState; ctx.emit?.('risk_assessment:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: RiskAssessmentConfig, ctx: TraitContext, e: TraitEvent) {
      if (e.type === 'risk_assessment:recalculate') {
        const s = n.__riskAssessState as Record<string, unknown> | undefined; if (!s) return;
        const score = c.factors.reduce((sum, f) => sum + (f.value / f.maxValue) * f.weight, 0);
        s.riskScore = Math.min(c.maxRiskScore, score); s.adjustedPremium = c.baseRate * (1 + score / 100);
        ctx.emit?.('risk_assessment:updated', { score, premium: s.adjustedPremium });
      }
    },
  };
}
