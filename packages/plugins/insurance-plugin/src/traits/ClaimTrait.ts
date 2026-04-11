/** @claim Trait — Insurance claim processing. @trait claim */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type ClaimStatus = 'filed' | 'under_review' | 'approved' | 'denied' | 'paid' | 'appealed' | 'closed';
export interface ClaimConfig { claimNumber: string; policyNumber: string; dateOfLoss: string; description: string; claimAmount: number; claimantName: string; }
export interface ClaimState { status: ClaimStatus; approvedAmount: number; adjusterAssigned: string | null; filedAt: number; }

const defaultConfig: ClaimConfig = { claimNumber: '', policyNumber: '', dateOfLoss: '', description: '', claimAmount: 0, claimantName: '' };

export function createClaimHandler(): TraitHandler<ClaimConfig> {
  return { name: 'claim', defaultConfig,
    onAttach(n: HSPlusNode, _c: ClaimConfig, ctx: TraitContext) { n.__claimState = { status: 'filed' as ClaimStatus, approvedAmount: 0, adjusterAssigned: null, filedAt: Date.now() }; ctx.emit?.('claim:filed'); },
    onDetach(n: HSPlusNode, _c: ClaimConfig, ctx: TraitContext) { delete n.__claimState; ctx.emit?.('claim:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: ClaimConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__claimState as ClaimState | undefined; if (!s) return;
      if (e.type === 'claim:assign_adjuster') { s.adjusterAssigned = (e.payload?.adjuster as string) ?? null; s.status = 'under_review'; ctx.emit?.('claim:reviewing', { adjuster: s.adjusterAssigned }); }
      if (e.type === 'claim:approve') { s.status = 'approved'; s.approvedAmount = (e.payload?.amount as number) ?? c.claimAmount; ctx.emit?.('claim:approved', { amount: s.approvedAmount }); }
      if (e.type === 'claim:deny') { s.status = 'denied'; ctx.emit?.('claim:denied', { reason: e.payload?.reason }); }
      if (e.type === 'claim:pay') { s.status = 'paid'; ctx.emit?.('claim:paid', { amount: s.approvedAmount }); }
    },
  };
}
