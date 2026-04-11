/** @policy Trait — Insurance policy management. @trait policy */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type PolicyType = 'life' | 'health' | 'auto' | 'home' | 'commercial' | 'liability' | 'cyber';
export type PolicyStatus = 'quoted' | 'bound' | 'active' | 'lapsed' | 'cancelled' | 'expired';
export interface PolicyConfig { policyNumber: string; type: PolicyType; insuredName: string; premium: number; coverageAmount: number; deductible: number; effectiveDate: string; expirationDate: string; }
export interface PolicyState { status: PolicyStatus; claimCount: number; totalPaidClaims: number; remainingCoverage: number; }

const defaultConfig: PolicyConfig = { policyNumber: '', type: 'auto', insuredName: '', premium: 0, coverageAmount: 0, deductible: 0, effectiveDate: '', expirationDate: '' };

export function createPolicyHandler(): TraitHandler<PolicyConfig> {
  return { name: 'policy', defaultConfig,
    onAttach(n: HSPlusNode, c: PolicyConfig, ctx: TraitContext) { n.__policyState = { status: 'active' as PolicyStatus, claimCount: 0, totalPaidClaims: 0, remainingCoverage: c.coverageAmount }; ctx.emit?.('policy:bound', { type: c.type, coverage: c.coverageAmount }); },
    onDetach(n: HSPlusNode, _c: PolicyConfig, ctx: TraitContext) { delete n.__policyState; ctx.emit?.('policy:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: PolicyConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__policyState as PolicyState | undefined; if (!s) return;
      if (e.type === 'policy:cancel') { s.status = 'cancelled'; ctx.emit?.('policy:cancelled'); }
      if (e.type === 'policy:renew') { s.status = 'active'; ctx.emit?.('policy:renewed'); }
    },
  };
}
