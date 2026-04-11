/** @transaction Trait — Financial transaction record. @trait transaction */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type TransactionType = 'deposit' | 'withdrawal' | 'transfer' | 'payment' | 'fee' | 'interest' | 'refund';
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'reversed' | 'held';
export interface TransactionConfig { type: TransactionType; amount: number; currency: string; fromAccount: string; toAccount: string; description: string; reference: string; }
export interface TransactionState { status: TransactionStatus; timestamp: number; settledAt: number | null; }

const defaultConfig: TransactionConfig = { type: 'transfer', amount: 0, currency: 'USD', fromAccount: '', toAccount: '', description: '', reference: '' };

export function createTransactionHandler(): TraitHandler<TransactionConfig> {
  return { name: 'transaction', defaultConfig,
    onAttach(n: HSPlusNode, c: TransactionConfig, ctx: TraitContext) { n.__txnState = { status: 'pending' as TransactionStatus, timestamp: Date.now(), settledAt: null }; ctx.emit?.('transaction:created', { type: c.type, amount: c.amount }); },
    onDetach(n: HSPlusNode, _c: TransactionConfig, ctx: TraitContext) { delete n.__txnState; ctx.emit?.('transaction:removed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, c: TransactionConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__txnState as TransactionState | undefined; if (!s) return;
      if (e.type === 'transaction:settle') { s.status = 'completed'; s.settledAt = Date.now(); ctx.emit?.('transaction:settled', { amount: c.amount, reference: c.reference }); }
      if (e.type === 'transaction:fail') { s.status = 'failed'; ctx.emit?.('transaction:failed', { reason: e.payload?.reason }); }
      if (e.type === 'transaction:reverse') { s.status = 'reversed'; ctx.emit?.('transaction:reversed', { amount: c.amount }); }
    },
  };
}
