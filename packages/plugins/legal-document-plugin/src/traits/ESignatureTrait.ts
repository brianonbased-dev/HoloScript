/** @e_signature Trait — Electronic signature collection. @trait e_signature */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export interface Signer { id: string; name: string; email: string; role: string; signedAt: number | null; ipAddress?: string; }
export interface ESignatureConfig { documentId: string; signers: Signer[]; requireOrder: boolean; expirationDays: number; reminderIntervalDays: number; }
export interface ESignatureState { signedCount: number; pendingCount: number; isComplete: boolean; envelopeId: string; }

const defaultConfig: ESignatureConfig = { documentId: '', signers: [], requireOrder: false, expirationDays: 30, reminderIntervalDays: 3 };

export function createESignatureHandler(): TraitHandler<ESignatureConfig> {
  return { name: 'e_signature', defaultConfig,
    onAttach(n: HSPlusNode, c: ESignatureConfig, ctx: TraitContext) { n.__esigState = { signedCount: 0, pendingCount: c.signers.length, isComplete: false, envelopeId: `env_${Date.now()}` }; ctx.emit?.('esig:envelope_created', { signers: c.signers.length }); },
    onDetach(n: HSPlusNode, _c: ESignatureConfig, ctx: TraitContext) { delete n.__esigState; ctx.emit?.('esig:voided'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: ESignatureConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__esigState as ESignatureState | undefined; if (!s) return;
      if (e.type === 'esig:sign') {
        const signerId = e.payload?.signerId as string;
        const signer = c.signers.find(sg => sg.id === signerId);
        if (signer && !signer.signedAt) { signer.signedAt = Date.now(); s.signedCount++; s.pendingCount--;
          ctx.emit?.('esig:signed', { signer: signer.name, remaining: s.pendingCount });
          if (s.pendingCount === 0) { s.isComplete = true; ctx.emit?.('esig:completed', { envelopeId: s.envelopeId }); }
        }
      }
    },
  };
}
