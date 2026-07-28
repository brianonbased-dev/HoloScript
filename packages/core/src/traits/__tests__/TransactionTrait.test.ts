import { describe, it, expect, beforeEach } from 'vitest';
import {
  debitBalance,
  stakeBalance,
  unstakeBalance,
  depositBalance,
  transactionHandler,
  type TxNodeState,
  type TxReceipt,
  type LedgerEntry,
} from '../TransactionTrait';

// ── helpers ───────────────────────────────────────────────────────────────────

function freshState(balance = 0, escrow = 0): TxNodeState {
  return { balance, escrow, ledger: [], seenKeys: new Set() };
}

// ── debitBalance ──────────────────────────────────────────────────────────────

describe('debitBalance – pay', () => {
  it('deducts amount from balance', () => {
    const s = freshState(1000);
    const r = debitBalance(s, 'pay', 300, 0);
    expect(r.ok).toBe(true);
    expect(r.balanceAfter).toBe(700);
    expect(s.balance).toBe(700);
  });

  it('full balance deduction → balance=0', () => {
    const s = freshState(500);
    const r = debitBalance(s, 'pay', 500, 0);
    expect(r.ok).toBe(true);
    expect(r.balanceAfter).toBe(0);
  });

  it('rejects when balance insufficient', () => {
    const s = freshState(100);
    const r = debitBalance(s, 'pay', 200, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient_funds');
    expect(s.balance).toBe(100); // unchanged
  });

  it('rejects when limit exceeded', () => {
    const s = freshState(10_000);
    const r = debitBalance(s, 'pay', 600, 500);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('limit_exceeded');
    expect(s.balance).toBe(10_000);
  });

  it('limit=0 means unlimited', () => {
    const s = freshState(5_000_000);
    const r = debitBalance(s, 'pay', 4_000_000, 0);
    expect(r.ok).toBe(true);
  });

  it('rejects negative amount', () => {
    const s = freshState(1000);
    const r = debitBalance(s, 'pay', -50, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('negative_amount');
  });

  it('idempotency key blocks duplicate', () => {
    const s = freshState(1000);
    debitBalance(s, 'pay', 100, 0, 'txn-1');
    const r2 = debitBalance(s, 'pay', 100, 0, 'txn-1');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('duplicate');
    expect(s.balance).toBe(900); // only first deducted
  });

  it('different idempotency keys both succeed', () => {
    const s = freshState(1000);
    debitBalance(s, 'pay', 100, 0, 'a');
    const r = debitBalance(s, 'pay', 100, 0, 'b');
    expect(r.ok).toBe(true);
    expect(s.balance).toBe(800);
  });

  it('commits to ledger', () => {
    const s = freshState(500);
    debitBalance(s, 'pay', 50, 0);
    expect(s.ledger).toHaveLength(1);
    expect(s.ledger[0].index).toBe(0);
    expect(s.ledger[0].action).toBe('pay');
  });
});

describe('debitBalance – transfer', () => {
  it('action field is "transfer"', () => {
    const s = freshState(200);
    const r = debitBalance(s, 'transfer', 100, 0);
    expect(r.action).toBe('transfer');
  });

  it('respects transferLimit', () => {
    const s = freshState(10_000);
    const r = debitBalance(s, 'transfer', 2000, 1000);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('limit_exceeded');
  });
});

// ── stakeBalance ──────────────────────────────────────────────────────────────

describe('stakeBalance', () => {
  it('moves amount from balance to escrow', () => {
    const s = freshState(1000, 0);
    const r = stakeBalance(s, 300, 0);
    expect(r.ok).toBe(true);
    expect(s.balance).toBe(700);
    expect(s.escrow).toBe(300);
    expect(r.balanceAfter).toBe(700);
    expect(r.escrowAfter).toBe(300);
  });

  it('rejects when balance insufficient', () => {
    const s = freshState(100);
    const r = stakeBalance(s, 200, 0);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient_funds');
  });

  it('respects stakeLimit', () => {
    const s = freshState(5000);
    const r = stakeBalance(s, 2000, 1000);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('limit_exceeded');
  });

  it('idempotency key blocks duplicate stake', () => {
    const s = freshState(1000);
    stakeBalance(s, 200, 0, 'stake-1');
    const r2 = stakeBalance(s, 200, 0, 'stake-1');
    expect(r2.ok).toBe(false);
    expect(r2.reason).toBe('duplicate');
    expect(s.escrow).toBe(200); // only first
  });
});

// ── unstakeBalance ────────────────────────────────────────────────────────────

describe('unstakeBalance', () => {
  it('returns escrow to balance', () => {
    const s = freshState(0, 500);
    const r = unstakeBalance(s, 300);
    expect(r.ok).toBe(true);
    expect(s.escrow).toBe(200);
    expect(s.balance).toBe(300);
  });

  it('rejects when insufficient escrow', () => {
    const s = freshState(0, 100);
    const r = unstakeBalance(s, 200);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('insufficient_escrow');
  });

  it('stake → unstake round-trip', () => {
    const s = freshState(1000);
    stakeBalance(s, 400, 0);
    unstakeBalance(s, 400);
    expect(s.balance).toBe(1000);
    expect(s.escrow).toBe(0);
  });
});

// ── depositBalance ────────────────────────────────────────────────────────────

describe('depositBalance', () => {
  it('credits balance', () => {
    const s = freshState(100);
    const r = depositBalance(s, 500);
    expect(r.ok).toBe(true);
    expect(s.balance).toBe(600);
    expect(r.balanceAfter).toBe(600);
  });

  it('rejects negative deposit', () => {
    const s = freshState(0);
    const r = depositBalance(s, -1);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('negative_amount');
  });

  it('zero deposit succeeds (no-op)', () => {
    const s = freshState(50);
    const r = depositBalance(s, 0);
    expect(r.ok).toBe(true);
    expect(s.balance).toBe(50);
  });
});

// ── Ledger integrity ──────────────────────────────────────────────────────────

describe('ledger indexing', () => {
  it('indices are sequential across mixed operations', () => {
    const s = freshState(1000);
    depositBalance(s, 500);
    debitBalance(s, 'pay', 100, 0);
    stakeBalance(s, 200, 0);
    unstakeBalance(s, 100);
    expect(s.ledger.map((e) => e.index)).toEqual([0, 1, 2, 3]);
  });

  it('failed operations also commit to ledger', () => {
    const s = freshState(10);
    debitBalance(s, 'pay', 100, 0); // fails
    expect(s.ledger).toHaveLength(1);
    expect(s.ledger[0].ok).toBe(false);
  });
});

// ── TraitHandler ──────────────────────────────────────────────────────────────

function makeNode(): Record<string, unknown> {
  return {};
}

const cfg = { initialBalance: 10_000 };

describe('transactionHandler.onAttach', () => {
  it('initialises state with configured balance', () => {
    const node = makeNode();
    transactionHandler.onAttach!(node as never, cfg, {} as never);
    const state = node.__tx_state as TxNodeState;
    expect(state.balance).toBe(10_000);
    expect(state.escrow).toBe(0);
    expect(node.__tx_last_receipt).toBeNull();
  });
});

describe('transactionHandler.onEvent – pay', () => {
  let node: Record<string, unknown>;
  beforeEach(() => {
    node = makeNode();
    transactionHandler.onAttach!(node as never, cfg, {} as never);
  });

  it('pay deducts balance and writes receipt', () => {
    transactionHandler.onEvent!(
      node as never,
      cfg,
      {} as never,
      { type: 'transaction.pay', amount: 1000 } as never
    );
    const r = node.__tx_last_receipt as TxReceipt;
    expect(r.ok).toBe(true);
    expect(r.action).toBe('pay');
    expect(r.balanceAfter).toBe(9000);
  });

  it('pay rejects with limit from config', () => {
    const c = { initialBalance: 50_000, limits: { payLimit: 500 } };
    const n = makeNode();
    transactionHandler.onAttach!(n as never, c, {} as never);
    transactionHandler.onEvent!(
      n as never,
      c,
      {} as never,
      { type: 'transaction.pay', amount: 1000 } as never
    );
    const r = n.__tx_last_receipt as TxReceipt;
    expect(r.ok).toBe(false);
    expect(r.reason).toBe('limit_exceeded');
  });
});

describe('transactionHandler.onEvent – transfer', () => {
  it('transfer succeeds within balance', () => {
    const node = makeNode();
    transactionHandler.onAttach!(node as never, cfg, {} as never);
    transactionHandler.onEvent!(
      node as never,
      cfg,
      {} as never,
      { type: 'transaction.transfer', amount: 3000 } as never
    );
    const r = node.__tx_last_receipt as TxReceipt;
    expect(r.ok).toBe(true);
    expect(r.action).toBe('transfer');
    expect(r.balanceAfter).toBe(7000);
  });
});

describe('transactionHandler.onEvent – stake / unstake', () => {
  it('stake moves to escrow', () => {
    const node = makeNode();
    transactionHandler.onAttach!(node as never, cfg, {} as never);
    transactionHandler.onEvent!(
      node as never,
      cfg,
      {} as never,
      { type: 'transaction.stake', amount: 2000 } as never
    );
    const r = node.__tx_last_receipt as TxReceipt;
    expect(r.ok).toBe(true);
    expect(r.balanceAfter).toBe(8000);
    expect(r.escrowAfter).toBe(2000);
  });

  it('unstake returns to balance', () => {
    const node = makeNode();
    transactionHandler.onAttach!(node as never, cfg, {} as never);
    transactionHandler.onEvent!(
      node as never,
      cfg,
      {} as never,
      { type: 'transaction.stake', amount: 2000 } as never
    );
    transactionHandler.onEvent!(
      node as never,
      cfg,
      {} as never,
      { type: 'transaction.unstake', amount: 1000 } as never
    );
    const r = node.__tx_last_receipt as TxReceipt;
    expect(r.ok).toBe(true);
    expect(r.escrowAfter).toBe(1000);
    expect(r.balanceAfter).toBe(9000);
  });
});

describe('transactionHandler.onEvent – deposit', () => {
  it('credits balance', () => {
    const node = makeNode();
    transactionHandler.onAttach!(node as never, { initialBalance: 0 }, {} as never);
    transactionHandler.onEvent!(
      node as never,
      { initialBalance: 0 },
      {} as never,
      { type: 'transaction.deposit', amount: 5000 } as never
    );
    const r = node.__tx_last_receipt as TxReceipt;
    expect(r.ok).toBe(true);
    expect(r.balanceAfter).toBe(5000);
  });
});

describe('transactionHandler.onEvent – ledger', () => {
  it('writes ledger snapshot to node', () => {
    const node = makeNode();
    transactionHandler.onAttach!(node as never, cfg, {} as never);
    transactionHandler.onEvent!(
      node as never,
      cfg,
      {} as never,
      { type: 'transaction.pay', amount: 100 } as never
    );
    transactionHandler.onEvent!(
      node as never,
      cfg,
      {} as never,
      { type: 'transaction.ledger' } as never
    );
    const ledger = node.__tx_ledger as LedgerEntry[];
    expect(Array.isArray(ledger)).toBe(true);
    expect(ledger).toHaveLength(1);
    expect(ledger[0].action).toBe('pay');
  });
});

describe('transactionHandler.onEvent – unknown', () => {
  it('does not throw', () => {
    const node = makeNode();
    transactionHandler.onAttach!(node as never, cfg, {} as never);
    expect(() =>
      transactionHandler.onEvent!(
        node as never,
        cfg,
        {} as never,
        { type: 'transaction.unknown' } as never
      )
    ).not.toThrow();
  });
});
