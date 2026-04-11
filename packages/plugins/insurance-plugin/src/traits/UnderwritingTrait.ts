/** @underwriting Trait — Policy underwriting decision. @trait underwriting */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type UnderwritingDecision = 'approve' | 'approve_with_conditions' | 'refer' | 'decline';
export interface UnderwritingConfig { applicationId: string; riskScore: number; requestedCoverage: number; maxAutoCoverage: number; referralThreshold: number; declineThreshold: number; conditions: string[]; }
export interface UnderwritingState { decision: UnderwritingDecision | null; reviewedAt: number | null; underwriterId: string | null; }

const defaultConfig: UnderwritingConfig = { applicationId: '', riskScore: 0, requestedCoverage: 0, maxAutoCoverage: 500000, referralThreshold: 70, declineThreshold: 90, conditions: [] };

export function createUnderwritingHandler(): TraitHandler<UnderwritingConfig> {
  return { name: 'underwriting', defaultConfig,
    onAttach(n: HSPlusNode, _c: UnderwritingConfig, ctx: TraitContext) { n.__uwState = { decision: null, reviewedAt: null, underwriterId: null }; ctx.emit?.('underwriting:submitted'); },
    onDetach(n: HSPlusNode, _c: UnderwritingConfig, ctx: TraitContext) { delete n.__uwState; ctx.emit?.('underwriting:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: UnderwritingConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__uwState as UnderwritingState | undefined; if (!s) return;
      if (e.type === 'underwriting:auto_decide') {
        if (c.riskScore >= c.declineThreshold) s.decision = 'decline';
        else if (c.riskScore >= c.referralThreshold || c.requestedCoverage > c.maxAutoCoverage) s.decision = 'refer';
        else if (c.conditions.length > 0) s.decision = 'approve_with_conditions';
        else s.decision = 'approve';
        s.reviewedAt = Date.now();
        ctx.emit?.('underwriting:decided', { decision: s.decision, riskScore: c.riskScore });
      }
      if (e.type === 'underwriting:manual_decide') { s.decision = (e.payload?.decision as UnderwritingDecision) ?? 'refer'; s.underwriterId = (e.payload?.underwriterId as string) ?? null; s.reviewedAt = Date.now(); ctx.emit?.('underwriting:manual_decision', { decision: s.decision }); }
    },
  };
}
