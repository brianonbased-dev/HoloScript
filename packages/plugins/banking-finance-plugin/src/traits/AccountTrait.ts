/** @account Trait — Financial account. @trait account */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './types';

export type AccountType = 'checking' | 'savings' | 'credit' | 'investment' | 'loan' | 'escrow';
export interface AccountConfig { accountNumber: string; accountType: AccountType; currency: string; balance: number; interestRate: number; ownerKycId: string; }
export interface AccountState { currentBalance: number; availableBalance: number; pendingTransactions: number; isFrozen: boolean; }

const defaultConfig: AccountConfig = { accountNumber: '', accountType: 'checking', currency: 'USD', balance: 0, interestRate: 0, ownerKycId: '' };

export function createAccountHandler(): TraitHandler<AccountConfig> {
  return { name: 'account', defaultConfig,
    onAttach(n: HSPlusNode, c: AccountConfig, ctx: TraitContext) { n.__acctState = { currentBalance: c.balance, availableBalance: c.balance, pendingTransactions: 0, isFrozen: false }; ctx.emit?.('account:opened', { type: c.accountType }); },
    onDetach(n: HSPlusNode, _c: AccountConfig, ctx: TraitContext) { delete n.__acctState; ctx.emit?.('account:closed'); },
    onUpdate() {},
    onEvent(n: HSPlusNode, _c: AccountConfig, ctx: TraitContext, e: TraitEvent) {
      const s = n.__acctState as AccountState | undefined; if (!s) return;
      if (s.isFrozen) { ctx.emit?.('account:frozen_rejection'); return; }
      if (e.type === 'account:credit') { const amt = e.payload?.amount as number; s.currentBalance += amt; s.availableBalance += amt; ctx.emit?.('account:credited', { amount: amt, balance: s.currentBalance }); }
      if (e.type === 'account:debit') { const amt = e.payload?.amount as number; if (s.availableBalance >= amt) { s.currentBalance -= amt; s.availableBalance -= amt; ctx.emit?.('account:debited', { amount: amt, balance: s.currentBalance }); } else { ctx.emit?.('account:insufficient_funds', { requested: amt, available: s.availableBalance }); } }
      if (e.type === 'account:freeze') { s.isFrozen = true; ctx.emit?.('account:frozen'); }
    },
  };
}
