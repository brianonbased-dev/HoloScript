/**
 * Tests for identity/token-ledger.ts — Phase 5 (task_1776806224288_m5jg).
 *
 * Covers:
 *   - Credit/debit operations
 *   - Balance tracking
 *   - Insufficient balance rejection
 *   - Stripe payment processing + dedup
 *   - Admin grant/revoke
 *   - Serialization/deserialization
 *   - Edge cases (zero balance, negative floor, idempotency)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  creditTokens,
  debitTokens,
  getBalance,
  getBalanceInfo,
  getLedgerHistory,
  processStripePayment,
  hasSufficientBalance,
  authorizeAndDebit,
  grantTokens,
  revokeTokens,
  serializeLedger,
  deserializeLedger,
  InsufficientBalanceError,
  InvalidAmountError,
  _resetLedger,
  _userCount,
  _totalEntryCount,
  type StripePaymentEvent,
} from '../token-ledger';

const USER_A = 'agent_test_a';
const USER_B = 'agent_test_b';

beforeEach(() => {
  _resetLedger();
});

// ── Credit operations ─────────────────────────────────────────────────────────

describe('creditTokens', () => {
  it('credits tokens to a new user', () => {
    const result = creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    expect(result.balanceBefore).toBe(0);
    expect(result.balanceAfter).toBe(100);
    expect(result.entry.type).toBe('credit');
    expect(result.entry.amount).toBe(100);
    expect(result.entry.source).toBe('stripe_payment');
  });

  it('accumulates credits across multiple operations', () => {
    creditTokens(USER_A, 50, 'stripe_payment', 'stripe_evt_001');
    const result = creditTokens(USER_A, 30, 'admin_grant', 'grant_001');
    expect(result.balanceBefore).toBe(50);
    expect(result.balanceAfter).toBe(80);
  });

  it('is idempotent on reference', () => {
    const first = creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    const second = creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    expect(first.entry.id).toBe(second.entry.id);
    expect(getBalance(USER_A)).toBe(100); // Not 200
  });

  it('allows same amount with different reference', () => {
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_002');
    expect(getBalance(USER_A)).toBe(200);
  });

  it('rejects zero or negative amounts', () => {
    expect(() => creditTokens(USER_A, 0, 'admin_grant', 'bad')).toThrow(InvalidAmountError);
    expect(() => creditTokens(USER_A, -10, 'admin_grant', 'bad')).toThrow(InvalidAmountError);
  });

  it('preserves metadata', () => {
    const result = creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001', {
      stripeId: 'ch_abc123',
      plan: 'pro',
    });
    expect(result.entry.metadata).toEqual({
      stripeId: 'ch_abc123',
      plan: 'pro',
    });
  });
});

// ── Debit operations ──────────────────────────────────────────────────────────

describe('debitTokens', () => {
  beforeEach(() => {
    creditTokens(USER_A, 200, 'stripe_payment', 'stripe_evt_init');
  });

  it('debits tokens from a user with sufficient balance', () => {
    const result = debitTokens(USER_A, 50, 'operation_debit', 'op_compile_001');
    expect(result.balanceBefore).toBe(200);
    expect(result.balanceAfter).toBe(150);
    expect(result.entry.type).toBe('debit');
    expect(result.entry.amount).toBe(50);
  });

  it('allows debiting the full balance', () => {
    const result = debitTokens(USER_A, 200, 'operation_debit', 'op_full_001');
    expect(result.balanceAfter).toBe(0);
  });

  it('rejects debit exceeding balance', () => {
    expect(() => debitTokens(USER_A, 201, 'operation_debit', 'op_excess')).toThrow(
      InsufficientBalanceError
    );
    const err = new InsufficientBalanceError(USER_A, 201, 200);
    expect(err.requested).toBe(201);
    expect(err.available).toBe(200);
  });

  it('rejects zero or negative debit amounts', () => {
    expect(() => debitTokens(USER_A, 0, 'operation_debit', 'bad')).toThrow(InvalidAmountError);
    expect(() => debitTokens(USER_A, -5, 'operation_debit', 'bad')).toThrow(InvalidAmountError);
  });

  it('does not change balance on failed debit', () => {
    try {
      debitTokens(USER_A, 999, 'operation_debit', 'op_fail');
    } catch {
      // Expected
    }
    expect(getBalance(USER_A)).toBe(200);
  });
});

// ── Balance queries ──────────────────────────────────────────────────────────

describe('getBalance / getBalanceInfo', () => {
  it('returns 0 for unknown users', () => {
    expect(getBalance('nonexistent')).toBe(0);
  });

  it('returns balance info with metadata', () => {
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    const info = getBalanceInfo(USER_A);
    expect(info.userId).toBe(USER_A);
    expect(info.balance).toBe(100);
    expect(info.entryCount).toBe(1);
  });

  it('caches balance and invalidates on mutation', () => {
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    expect(getBalance(USER_A)).toBe(100);
    debitTokens(USER_A, 30, 'operation_debit', 'op_001');
    expect(getBalance(USER_A)).toBe(70);
  });
});

// ── Ledger history ──────────────────────────────────────────────────────────

describe('getLedgerHistory', () => {
  it('returns empty array for unknown users', () => {
    const history = getLedgerHistory('nonexistent');
    expect(history).toEqual([]);
  });

  it('returns entries in reverse chronological order', () => {
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    debitTokens(USER_A, 30, 'operation_debit', 'op_001');
    creditTokens(USER_A, 50, 'promotion_credit', 'promo_001');

    const history = getLedgerHistory(USER_A);
    expect(history).toHaveLength(3);
    // Newest first
    expect(history[0].source).toBe('promotion_credit');
    expect(history[1].source).toBe('operation_debit');
    expect(history[2].source).toBe('stripe_payment');
  });

  it('filters by type', () => {
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    debitTokens(USER_A, 30, 'operation_debit', 'op_001');

    const credits = getLedgerHistory(USER_A, { type: 'credit' });
    const debits = getLedgerHistory(USER_A, { type: 'debit' });
    expect(credits).toHaveLength(1);
    expect(debits).toHaveLength(1);
  });

  it('respects limit and offset', () => {
    for (let i = 0; i < 5; i++) {
      creditTokens(USER_A, 10, 'stripe_payment', `stripe_evt_${i}`);
    }

    const page1 = getLedgerHistory(USER_A, { limit: 2, offset: 0 });
    const page2 = getLedgerHistory(USER_A, { limit: 2, offset: 2 });
    expect(page1).toHaveLength(2);
    expect(page2).toHaveLength(2);
    // No overlap
    expect(page1[0].id).not.toBe(page2[0].id);
  });
});

// ── Stripe payment processing ──────────────────────────────────────────────

describe('processStripePayment', () => {
  it('credits tokens from a valid Stripe event', () => {
    const event: StripePaymentEvent = {
      type: 'checkout.session.completed',
      id: 'evt_stripe_001',
      userId: USER_A,
      tokenAmount: 500,
      stripeId: 'cs_test_123',
      stripeTimestamp: new Date().toISOString(),
    };

    const result = processStripePayment(event);
    expect(result).not.toBeNull();
    expect(result!.balanceAfter).toBe(500);
    expect(result!.entry.source).toBe('stripe_payment');
    expect(result!.entry.metadata?.stripeId).toBe('cs_test_123');
  });

  it('deduplicates identical Stripe events', () => {
    const event: StripePaymentEvent = {
      type: 'checkout.session.completed',
      id: 'evt_stripe_001',
      userId: USER_A,
      tokenAmount: 500,
      stripeId: 'cs_test_123',
      stripeTimestamp: new Date().toISOString(),
    };

    const first = processStripePayment(event);
    const second = processStripePayment(event);
    expect(first).not.toBeNull();
    expect(second).toBeNull(); // Deduped
    expect(getBalance(USER_A)).toBe(500); // Not 1000
  });

  it('processes different Stripe events for the same user', () => {
    const event1: StripePaymentEvent = {
      type: 'checkout.session.completed',
      id: 'evt_stripe_001',
      userId: USER_A,
      tokenAmount: 100,
      stripeId: 'cs_test_001',
      stripeTimestamp: new Date().toISOString(),
    };
    const event2: StripePaymentEvent = {
      type: 'invoice.paid',
      id: 'evt_stripe_002',
      userId: USER_A,
      tokenAmount: 200,
      stripeId: 'in_test_002',
      stripeTimestamp: new Date().toISOString(),
    };

    processStripePayment(event1);
    processStripePayment(event2);
    expect(getBalance(USER_A)).toBe(300);
  });
});

// ── authorizeAndDebit ──────────────────────────────────────────────────────

describe('authorizeAndDebit', () => {
  it('authorizes and debits atomically', () => {
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    const result = authorizeAndDebit(USER_A, 25, 'compile_holo');
    expect(result.balanceAfter).toBe(75);
  });

  it('rejects when balance insufficient', () => {
    creditTokens(USER_A, 10, 'stripe_payment', 'stripe_evt_001');
    expect(() => authorizeAndDebit(USER_A, 25, 'compile_holo')).toThrow(InsufficientBalanceError);
  });
});

// ── Admin operations ──────────────────────────────────────────────────────

describe('grantTokens', () => {
  it('grants tokens as admin', () => {
    const result = grantTokens(USER_A, 1000, 'admin_001', 'welcome_bonus');
    expect(result.balanceAfter).toBe(1000);
    expect(result.entry.source).toBe('admin_grant');
    expect(result.entry.metadata?.adminId).toBe('admin_001');
  });
});

describe('revokeTokens', () => {
  it('revokes tokens from a user with sufficient balance', () => {
    creditTokens(USER_A, 200, 'stripe_payment', 'stripe_evt_001');
    const result = revokeTokens(USER_A, 50, 'admin_001', 'abuse');
    expect(result.balanceAfter).toBe(150);
  });

  it('handles revocation exceeding balance by flooring at 0', () => {
    creditTokens(USER_A, 50, 'stripe_payment', 'stripe_evt_001');
    const result = revokeTokens(USER_A, 100, 'admin_001', 'correction');
    // Should floor at 0, not go negative
    expect(getBalance(USER_A)).toBe(0);
  });

  it('handles revocation when balance is already 0', () => {
    const result = revokeTokens(USER_A, 50, 'admin_001', 'zero_balance_revoke');
    expect(getBalance(USER_A)).toBe(0);
  });
});

// ── hasSufficientBalance ──────────────────────────────────────────────────

describe('hasSufficientBalance', () => {
  it('returns true when balance is sufficient', () => {
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    expect(hasSufficientBalance(USER_A, 50)).toBe(true);
    expect(hasSufficientBalance(USER_A, 100)).toBe(true);
  });

  it('returns false when balance is insufficient', () => {
    creditTokens(USER_A, 50, 'stripe_payment', 'stripe_evt_001');
    expect(hasSufficientBalance(USER_A, 51)).toBe(false);
  });

  it('returns false for unknown users', () => {
    expect(hasSufficientBalance('nonexistent', 1)).toBe(false);
  });
});

// ── Serialization ──────────────────────────────────────────────────────────

describe('serialize / deserialize', () => {
  it('round-trips ledger state', () => {
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    debitTokens(USER_A, 30, 'operation_debit', 'op_001');
    creditTokens(USER_B, 200, 'admin_grant', 'grant_001');

    const serialized = serializeLedger();
    expect(serialized.version).toBe(1);
    expect(serialized.entries).toHaveProperty(USER_A);
    expect(serialized.entries).toHaveProperty(USER_B);

    _resetLedger();
    expect(getBalance(USER_A)).toBe(0);

    deserializeLedger(serialized);
    expect(getBalance(USER_A)).toBe(70);
    expect(getBalance(USER_B)).toBe(200);
  });

  it('preserves Stripe dedup state across round-trip', () => {
    const event: StripePaymentEvent = {
      type: 'checkout.session.completed',
      id: 'evt_dedup_test',
      userId: USER_A,
      tokenAmount: 100,
      stripeId: 'cs_dedup',
      stripeTimestamp: new Date().toISOString(),
    };

    processStripePayment(event);
    const serialized = serializeLedger();

    _resetLedger();
    deserializeLedger(serialized);

    // Same event should be deduplicated after restore
    const result = processStripePayment(event);
    expect(result).toBeNull();
  });

  it('prunes expired dedup entries on deserialize', () => {
    const event: StripePaymentEvent = {
      type: 'checkout.session.completed',
      id: 'evt_old',
      userId: USER_A,
      tokenAmount: 100,
      stripeId: 'cs_old',
      stripeTimestamp: new Date().toISOString(),
    };

    processStripePayment(event);
    const serialized = serializeLedger();

    // Manually age the dedup timestamp beyond the window
    const oldTimestamp = Date.now() - 73 * 60 * 60 * 1000; // 73 hours ago
    if (serialized.stripeDedup) {
      for (let i = 0; i < serialized.stripeDedup.length; i++) {
        serialized.stripeDedup[i][1] = oldTimestamp;
      }
    }

    _resetLedger();
    deserializeLedger(serialized);

    // Expired entry should have been pruned — the event should process again
    const result = processStripePayment(event);
    expect(result).not.toBeNull();
  });
});

// ── Edge cases ──────────────────────────────────────────────────────────────

describe('edge cases', () => {
  it('handles rapid successive credits and debits', () => {
    for (let i = 0; i < 100; i++) {
      creditTokens(USER_A, 10, 'stripe_payment', `batch_credit_${i}`);
    }
    expect(getBalance(USER_A)).toBe(1000);

    for (let i = 0; i < 50; i++) {
      debitTokens(USER_A, 5, 'operation_debit', `batch_debit_${i}`);
    }
    expect(getBalance(USER_A)).toBe(750);
  });

  it('maintains balance consistency across multiple users', () => {
    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_a');
    creditTokens(USER_B, 200, 'stripe_payment', 'stripe_b');
    debitTokens(USER_A, 30, 'operation_debit', 'op_a');

    expect(getBalance(USER_A)).toBe(70);
    expect(getBalance(USER_B)).toBe(200);
    expect(_userCount()).toBe(2);
    expect(_totalEntryCount()).toBe(3);
  });

  it('never allows negative balance through normal debit', () => {
    creditTokens(USER_A, 10, 'stripe_payment', 'stripe_small');
    expect(() => debitTokens(USER_A, 11, 'operation_debit', 'op_excess')).toThrow(
      InsufficientBalanceError
    );
    expect(getBalance(USER_A)).toBe(10);
  });

  it('entry IDs are unique', () => {
    const ids = new Set<string>();
    for (let i = 0; i < 100; i++) {
      const result = creditTokens(USER_A, 1, 'stripe_payment', `uniqueness_${i}`);
      ids.add(result.entry.id);
    }
    expect(ids.size).toBe(100);
  });

  it('balanceInfo lastUpdated reflects last entry', () => {
    const info0 = getBalanceInfo(USER_A);
    expect(info0.entryCount).toBe(0);

    creditTokens(USER_A, 100, 'stripe_payment', 'stripe_evt_001');
    const info1 = getBalanceInfo(USER_A);
    expect(info1.entryCount).toBe(1);

    debitTokens(USER_A, 10, 'operation_debit', 'op_001');
    const info2 = getBalanceInfo(USER_A);
    expect(info2.entryCount).toBe(2);
    // lastUpdated should reflect the debit entry (newer or equal ms)
    expect(info2.lastUpdated >= info1.lastUpdated).toBe(true);
  });
});