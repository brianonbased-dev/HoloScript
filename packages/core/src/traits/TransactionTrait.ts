/**
 * TransactionTrait — x402-native economic action handler (H2 'transaction' family).
 *
 * Provides a ledger of economic actions (pay, transfer, stake, unstake) for a
 * node, with balance tracking, spend-limit enforcement, and receipt generation.
 * All arithmetic uses integer micro-units (avoid float drift on money).
 *
 * ## Design principles
 *
 *  - Pure value semantics: every operation returns a `TxReceipt` and does NOT
 *    call any network/chain API. The trait records intent and local ledger state;
 *    a plugin that wraps this in a real x402 call is free to do so.
 *  - Idempotency key: each action carries an optional `idempotencyKey`. Duplicate
 *    keys on the same node are rejected (returns `{ ok: false, reason: 'duplicate' }`).
 *  - Spend limits: per-action type caps (`payLimit`, `transferLimit`, `stakeLimit`)
 *    expressed in micro-units. Operations exceeding the limit are rejected without
 *    touching the ledger.
 *  - Stake escrow: staked amounts are held in a separate escrow balance, not
 *    deducted from the spendable balance. Unstake returns them to spendable.
 *
 * ## Micro-unit convention
 *
 * All amounts are integers in micro-units (e.g. 1 USD = 1_000_000 μUSD). The
 * `unit` field on the config is informational only; arithmetic never converts.
 *
 * ## Domain-neutrality
 *
 * No domain nouns appear here. The trait applies to x402 agent wallets,
 * HoloProtocol creator earnings, HoloMesh marketplace transactions, and any
 * closed-loop simulated economy.
 *
 * ## Trait usage
 *
 *   onAttach: initialises ledger from config.initialBalance.
 *   onEvent 'transaction.pay':      debit from balance → receipt.
 *   onEvent 'transaction.transfer': debit from balance → receipt.
 *   onEvent 'transaction.stake':    move from balance → escrow → receipt.
 *   onEvent 'transaction.unstake':  move from escrow → balance → receipt.
 *   onEvent 'transaction.deposit':  credit to balance → receipt.
 *   onEvent 'transaction.ledger':   write full ledger to node.__tx_ledger.
 */

import type { TraitHandler } from './TraitTypes';

// ── Receipt ───────────────────────────────────────────────────────────────────

/** Outcome of a single transaction action. */
export interface TxReceipt {
  /** Whether the action succeeded. */
  ok: boolean;
  /** Action type. */
  action: 'pay' | 'transfer' | 'stake' | 'unstake' | 'deposit';
  /** Amount in micro-units (always non-negative). */
  amount: number;
  /** Caller-supplied idempotency key, if any. */
  idempotencyKey?: string;
  /** Reason for rejection if ok=false. */
  reason?: 'insufficient_funds' | 'limit_exceeded' | 'negative_amount' | 'duplicate' | 'insufficient_escrow';
  /** Balance after the action (if ok=true). */
  balanceAfter?: number;
  /** Escrow balance after the action (if ok=true). */
  escrowAfter?: number;
}

/** A ledger entry — one committed receipt. */
export interface LedgerEntry extends TxReceipt {
  /** Sequential entry index (0-based). */
  index: number;
}

// ── Config ────────────────────────────────────────────────────────────────────

/** Spend limits by action type (micro-units). Zero = no limit. */
export interface SpendLimits {
  /** Max single pay amount. 0 = unlimited. Default: 0. */
  payLimit?: number;
  /** Max single transfer amount. 0 = unlimited. Default: 0. */
  transferLimit?: number;
  /** Max single stake amount. 0 = unlimited. Default: 0. */
  stakeLimit?: number;
}

/** Trait configuration. */
export interface TransactionConfig {
  /** Starting spendable balance in micro-units. Default: 0. */
  initialBalance?: number;
  /** Starting escrow balance in micro-units (rare; usually 0). Default: 0. */
  initialEscrow?: number;
  /** Currency/unit label (informational). Default: 'μUSD'. */
  unit?: string;
  /** Per-action spend limits. */
  limits?: SpendLimits;
}

// ── Event payloads ────────────────────────────────────────────────────────────

interface TxEventBase {
  /** Amount in micro-units. Must be a non-negative integer. */
  amount: number;
  /** Optional idempotency key; duplicate key on same node → rejected. */
  idempotencyKey?: string;
}

export interface PayRequest extends TxEventBase { type: 'transaction.pay'; }
export interface TransferRequest extends TxEventBase { type: 'transaction.transfer'; }
export interface StakeRequest extends TxEventBase { type: 'transaction.stake'; }
export interface UnstakeRequest extends TxEventBase { type: 'transaction.unstake'; }
export interface DepositRequest extends TxEventBase { type: 'transaction.deposit'; }

// ── Internal node state ───────────────────────────────────────────────────────

export interface TxNodeState {
  balance: number;
  escrow: number;
  ledger: LedgerEntry[];
  seenKeys: Set<string>;
}

function initState(config: TransactionConfig): TxNodeState {
  return {
    balance: config.initialBalance ?? 0,
    escrow: config.initialEscrow ?? 0,
    ledger: [],
    seenKeys: new Set(),
  };
}

// ── Core ledger logic ─────────────────────────────────────────────────────────

function getState(node: Record<string, unknown>, config: TransactionConfig): TxNodeState {
  if (!node.__tx_state) node.__tx_state = initState(config);
  return node.__tx_state as TxNodeState;
}

function validateAmount(amount: number): TxReceipt | null {
  if (!Number.isInteger(amount) || amount < 0) {
    return { ok: false, action: 'pay', amount, reason: 'negative_amount' };
  }
  return null;
}

function checkDuplicate(state: TxNodeState, key: string | undefined): boolean {
  if (!key) return false;
  if (state.seenKeys.has(key)) return true;
  state.seenKeys.add(key);
  return false;
}

function commit(state: TxNodeState, receipt: TxReceipt): void {
  state.ledger.push({ ...receipt, index: state.ledger.length });
}

// ── Public transaction functions ──────────────────────────────────────────────

/** Debit `amount` from balance (pay or transfer). */
export function debitBalance(
  state: TxNodeState,
  action: 'pay' | 'transfer',
  amount: number,
  limit: number,
  idempotencyKey?: string,
): TxReceipt {
  const amtErr = validateAmount(amount);
  if (amtErr) { const r = { ...amtErr, action }; commit(state, r); return r; }
  if (checkDuplicate(state, idempotencyKey)) {
    return { ok: false, action, amount, idempotencyKey, reason: 'duplicate' };
  }
  if (limit > 0 && amount > limit) {
    const r: TxReceipt = { ok: false, action, amount, idempotencyKey, reason: 'limit_exceeded' };
    commit(state, r); return r;
  }
  if (amount > state.balance) {
    const r: TxReceipt = { ok: false, action, amount, idempotencyKey, reason: 'insufficient_funds' };
    commit(state, r); return r;
  }
  state.balance -= amount;
  const r: TxReceipt = {
    ok: true, action, amount, idempotencyKey,
    balanceAfter: state.balance, escrowAfter: state.escrow,
  };
  commit(state, r); return r;
}

/** Move `amount` from balance → escrow. */
export function stakeBalance(
  state: TxNodeState,
  amount: number,
  limit: number,
  idempotencyKey?: string,
): TxReceipt {
  const amtErr = validateAmount(amount);
  if (amtErr) { const r = { ...amtErr, action: 'stake' as const }; commit(state, r); return r; }
  if (checkDuplicate(state, idempotencyKey)) {
    return { ok: false, action: 'stake', amount, idempotencyKey, reason: 'duplicate' };
  }
  if (limit > 0 && amount > limit) {
    const r: TxReceipt = { ok: false, action: 'stake', amount, idempotencyKey, reason: 'limit_exceeded' };
    commit(state, r); return r;
  }
  if (amount > state.balance) {
    const r: TxReceipt = { ok: false, action: 'stake', amount, idempotencyKey, reason: 'insufficient_funds' };
    commit(state, r); return r;
  }
  state.balance -= amount;
  state.escrow += amount;
  const r: TxReceipt = {
    ok: true, action: 'stake', amount, idempotencyKey,
    balanceAfter: state.balance, escrowAfter: state.escrow,
  };
  commit(state, r); return r;
}

/** Move `amount` from escrow → balance. */
export function unstakeBalance(
  state: TxNodeState,
  amount: number,
  idempotencyKey?: string,
): TxReceipt {
  const amtErr = validateAmount(amount);
  if (amtErr) { const r = { ...amtErr, action: 'unstake' as const }; commit(state, r); return r; }
  if (checkDuplicate(state, idempotencyKey)) {
    return { ok: false, action: 'unstake', amount, idempotencyKey, reason: 'duplicate' };
  }
  if (amount > state.escrow) {
    const r: TxReceipt = { ok: false, action: 'unstake', amount, idempotencyKey, reason: 'insufficient_escrow' };
    commit(state, r); return r;
  }
  state.escrow -= amount;
  state.balance += amount;
  const r: TxReceipt = {
    ok: true, action: 'unstake', amount, idempotencyKey,
    balanceAfter: state.balance, escrowAfter: state.escrow,
  };
  commit(state, r); return r;
}

/** Credit `amount` to balance. */
export function depositBalance(
  state: TxNodeState,
  amount: number,
  idempotencyKey?: string,
): TxReceipt {
  const amtErr = validateAmount(amount);
  if (amtErr) { const r = { ...amtErr, action: 'deposit' as const }; commit(state, r); return r; }
  if (checkDuplicate(state, idempotencyKey)) {
    return { ok: false, action: 'deposit', amount, idempotencyKey, reason: 'duplicate' };
  }
  state.balance += amount;
  const r: TxReceipt = {
    ok: true, action: 'deposit', amount, idempotencyKey,
    balanceAfter: state.balance, escrowAfter: state.escrow,
  };
  commit(state, r); return r;
}

// ── TraitHandler ───────────────────────────────────────────────────────────────

export const transactionHandler: TraitHandler<TransactionConfig> = {
  name: 'transaction',
  defaultConfig: {},

  onAttach(node, config) {
    const n = node as unknown as Record<string, unknown>;
    n.__tx_state = initState(config);
    n.__tx_last_receipt = null;
    n.__tx_ledger = null;
  },

  onEvent(node, config, _ctx, event) {
    const n = node as unknown as Record<string, unknown>;
    const state = getState(n, config);
    const limits = config.limits ?? {};

    if (event.type === 'transaction.pay') {
      const req = event as unknown as PayRequest;
      const r = debitBalance(state, 'pay', req.amount, limits.payLimit ?? 0, req.idempotencyKey);
      n.__tx_last_receipt = r;
      return;
    }
    if (event.type === 'transaction.transfer') {
      const req = event as unknown as TransferRequest;
      const r = debitBalance(state, 'transfer', req.amount, limits.transferLimit ?? 0, req.idempotencyKey);
      n.__tx_last_receipt = r;
      return;
    }
    if (event.type === 'transaction.stake') {
      const req = event as unknown as StakeRequest;
      const r = stakeBalance(state, req.amount, limits.stakeLimit ?? 0, req.idempotencyKey);
      n.__tx_last_receipt = r;
      return;
    }
    if (event.type === 'transaction.unstake') {
      const req = event as unknown as UnstakeRequest;
      const r = unstakeBalance(state, req.amount, req.idempotencyKey);
      n.__tx_last_receipt = r;
      return;
    }
    if (event.type === 'transaction.deposit') {
      const req = event as unknown as DepositRequest;
      const r = depositBalance(state, req.amount, req.idempotencyKey);
      n.__tx_last_receipt = r;
      return;
    }
    if (event.type === 'transaction.ledger') {
      n.__tx_ledger = [...state.ledger];
      return;
    }
  },
};
