/** @kyc Trait — Know Your Customer verification. @trait kyc */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type KYCLevel = 'none' | 'basic' | 'enhanced' | 'full';
export type KYCStatus = 'pending' | 'verified' | 'rejected' | 'expired' | 'under_review';
export interface KYCConfig { level: KYCLevel; requiredDocuments: string[]; expiryDays: number; amlCheck: boolean; pepCheck: boolean; }

const defaultConfig: KYCConfig = { level: 'basic', requiredDocuments: ['government_id', 'proof_of_address'], expiryDays: 365, amlCheck: true, pepCheck: true };

export function createKYCHandler(): TraitHandler<KYCConfig> {
  return { name: 'kyc', defaultConfig,
    onAttach(n: HSPlusNode, _c: KYCConfig, ctx: TraitContext) { n.__kycState = { status: 'pending' as KYCStatus, documentsSubmitted: [] as string[], verifiedAt: null, riskScore: 0 }; ctx.emit?.('kyc:initiated'); },
    onDetach(n: HSPlusNode, _c: KYCConfig, ctx: TraitContext) { delete n.__kycState; ctx.emit?.('kyc:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: KYCConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__kycState as Record<string, unknown> | undefined; if (!s) return;
      if (e.type === 'kyc:submit_document') { (s.documentsSubmitted as string[]).push(e.payload?.documentType as string); const allSubmitted = c.requiredDocuments.every(d => (s.documentsSubmitted as string[]).includes(d)); if (allSubmitted) { s.status = 'under_review'; ctx.emit?.('kyc:review_started'); } }
      if (e.type === 'kyc:approve') { s.status = 'verified'; s.verifiedAt = Date.now(); ctx.emit?.('kyc:verified', { level: c.level }); }
      if (e.type === 'kyc:reject') { s.status = 'rejected'; ctx.emit?.('kyc:rejected', { reason: e.payload?.reason }); }
    },
  };
}
