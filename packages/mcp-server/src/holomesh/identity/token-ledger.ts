/**
 * Tier 2 Token-Balance Ledger — Phase 5 (task_1776806224288_m5jg).
 *
 * Wallet-as-ledger for paid compute tokens. Stripe webhook confirms payment →
 * backend credits user's wallet balance with N tokens. User invokes HoloScript
 * operation → server signs with user's custodial wallet → operation decrements
 * balance. Balance=0 → operations refused until topped up.
 *
 * Token balance is server-side accounting, not on-chain. On-chain anchoring
 * (S.ANC-style) happens on major operations only — not every token spend.
 *
 * Spec: research/2026-04-21_seat-wallets-adr.md §"Token seeding", §"User-facing
 * flow" steps 3-4.
 *
 * @module holomesh/identity/token-ledger
 */

import * as crypto from 'crypto';

// ── Types ───────────────────────────────────────────────────────────────────

/** A single ledger entry — immutable after creation. */
export interface TokenLedgerEntry {
  /** Unique ID: `tle_<sha256(userId|type|timestamp|nonce)[:12]` */
  id: string;
  /** User ID (HoloMesh agentId or future OAuth subject). */
  userId: string;
  /** Credit (tokens added) or debit (tokens consumed). */
  type: 'credit' | 'debit';
  /** Number of tokens. Always positive; sign is in `type`. */
  amount: number;
  /** Running balance after this entry was applied. */
  balanceAfter: number;
  /** ISO 8601 timestamp. */
  timestamp: string;
  /** Source that triggered this entry. */
  source: TokenSource;
  /** Human-readable reference for audit trail. */
  reference: string;
  /** Optional metadata (Stripe charge ID, operation name, etc.). */
  metadata?: Record<string, unknown>;
}

/** Sources that can create a ledger entry. */
export type TokenSource =
  | 'stripe_payment'       // Stripe webhook → credit
  | 'admin_grant'          // Founder/admin manual grant → credit
  | 'admin_revoke'         // Founder/admin manual revoke → debit
  | 'operation_debit'      // HoloScript operation → debit
  | 'promotion_credit'     // Sign-up bonus, campaign → credit
  | 'refund'               // Stripe refund or admin reversal → credit
  | 'adjustment';          // General correction (credit or debit)

/** Balance inquiry result. */
export interface TokenBalance {
  userId: string;
  balance: number;
  lastUpdated: string;
  entryCount: number;
}

/** Result of a credit or debit operation. */
export interface TokenOperationResult {
  entry: TokenLedgerEntry;
  balanceBefore: number;
  balanceAfter: number;
}

/** Stripe webhook event we accept for payment confirmation. */
export interface StripePaymentEvent {
  /** Stripe event type. */
  type: 'checkout.session.completed' | 'invoice.paid' | 'payment_intent.succeeded';
  /** Stripe object ID. */
  id: string;
  /** Associated user ID — from metadata or customer lookup. */
  userId: string;
  /** Number of tokens to credit. */
  tokenAmount: number;
  /** Stripe charge/payment intent ID for audit trail. */
  stripeId: string;
  /** ISO 8601 when Stripe recorded the event. */
  stripeTimestamp: string;
  /** Raw event payload for forensic audit. */
  raw?: unknown;
}

// ── Errors ──────────────────────────────────────────────────────────────────

export class InsufficientBalanceError extends Error {
  constructor(
    public readonly userId: string,
    public readonly requested: number,
    public readonly available: number
  ) {
    super(
      `Insufficient token balance for ${userId}: requested ${requested}, available ${available}`
    );
    this.name = 'InsufficientBalanceError';
  }
}

export class DuplicateEntryError extends Error {
  constructor(public readonly entryId: string) {
    super(`Duplicate ledger entry: ${entryId}`);
    this.name = 'DuplicateEntryError';
  }
}

export class InvalidAmountError extends Error {
  constructor(amount: number, reason: string) {
    super(`Invalid token amount ${amount}: ${reason}`);
    this.name = 'InvalidAmountError';
  }
}

// ── Ledger ───────────────────────────────────────────────────────────────────

/** Set of entry IDs that have been applied — used for dedup. */
const appliedEntries = new Set<string>();

/** Per-user ledger: userId → sorted array of entries (oldest first). */
const userLedgers = new Map<string, TokenLedgerEntry[]>();

/** Per-user cached balance (derived from ledger; invalidated on mutation). */
const balanceCache = new Map<string, number>();

/** Dedup window for Stripe events — prevents double-credit on webhook retry. */
const stripeEventDedup = new Map<string, number>(); // stripeEventId → timestamp

/** Max dedup window in ms (72 hours — Stripe recommends 24h, we're generous). */
const DEDUP_WINDOW_MS = 72 * 60 * 60 * 1000;

// ── Internal helpers ─────────────────────────────────────────────────────────

/** Generate a unique entry ID. */
function generateEntryId(userId: string, type: string, timestamp: string): string {
  const nonce = crypto.randomBytes(8).toString('hex');
  const hash = crypto
    .createHash('sha256')
    .update(`${userId}|${type}|${timestamp}|${nonce}`)
    .digest('hex')
    .slice(0, 12);
  return `tle_${hash}`;
}

/** Get the ledger for a user, creating it if absent. */
function getLedger(userId: string): TokenLedgerEntry[] {
  let ledger = userLedgers.get(userId);
  if (!ledger) {
    ledger = [];
    userLedgers.set(userId, ledger);
  }
  return ledger;
}

/** Recompute balance from the full ledger. Used to validate cache. */
function recomputeBalance(userId: string): number {
  const ledger = getLedger(userId);
  let balance = 0;
  for (const entry of ledger) {
    if (entry.type === 'credit') {
      balance += entry.amount;
    } else {
      balance -= entry.amount;
    }
  }
  return Math.max(0, balance); // Floor at 0 — never negative
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Credit tokens to a user's balance. Used for:
 *   - Stripe webhook payment confirmation (source: stripe_payment)
 *   - Admin grants (source: admin_grant)
 *   - Promotions (source: promotion_credit)
 *   - Refunds (source: refund)
 *
 * Idempotent on reference — if an entry with the same reference already
 * exists, returns the existing entry without creating a duplicate.
 */
export function creditTokens(
  userId: string,
  amount: number,
  source: TokenSource,
  reference: string,
  metadata?: Record<string, unknown>,
  timestamp: string = new Date().toISOString()
): TokenOperationResult {
  if (amount <= 0) {
    throw new InvalidAmountError(amount, 'credit amount must be positive');
  }

  // Idempotency: if an entry with this reference already exists for this user,
  // return it without creating a duplicate. This is the primary Stripe dedup
  // mechanism — webhook retries carry the same event ID as reference.
  const ledger = getLedger(userId);
  const existing = ledger.find((e) => e.reference === reference);
  if (existing) {
    return {
      entry: existing,
      balanceBefore: existing.balanceAfter - existing.amount,
      balanceAfter: existing.balanceAfter,
    };
  }

  const balanceBefore = getBalance(userId);
  const balanceAfter = balanceBefore + amount;
  const entry: TokenLedgerEntry = {
    id: generateEntryId(userId, 'credit', timestamp),
    userId,
    type: 'credit',
    amount,
    balanceAfter,
    timestamp,
    source,
    reference,
    metadata,
  };

  ledger.push(entry);
  balanceCache.set(userId, balanceAfter);

  return { entry, balanceBefore, balanceAfter };
}

/**
 * Debit tokens from a user's balance. Used for:
 *   - HoloScript operations (source: operation_debit)
 *   - Admin revocations (source: admin_revoke)
 *   - Adjustments (source: adjustment)
 *
 * Throws InsufficientBalanceError if balance < amount.
 */
export function debitTokens(
  userId: string,
  amount: number,
  source: TokenSource,
  reference: string,
  metadata?: Record<string, unknown>,
  timestamp: string = new Date().toISOString()
): TokenOperationResult {
  if (amount <= 0) {
    throw new InvalidAmountError(amount, 'debit amount must be positive');
  }

  const balanceBefore = getBalance(userId);
  if (balanceBefore < amount) {
    throw new InsufficientBalanceError(userId, amount, balanceBefore);
  }

  const balanceAfter = balanceBefore - amount;
  const ledger = getLedger(userId);
  const entry: TokenLedgerEntry = {
    id: generateEntryId(userId, 'debit', timestamp),
    userId,
    type: 'debit',
    amount,
    balanceAfter,
    timestamp,
    source,
    reference,
    metadata,
  };

  ledger.push(entry);
  balanceCache.set(userId, balanceAfter);

  return { entry, balanceBefore, balanceAfter };
}

/**
 * Get the current token balance for a user. Returns 0 for unknown users
 * (new users start with zero balance; must be credited via Stripe or admin).
 */
export function getBalance(userId: string): number {
  const cached = balanceCache.get(userId);
  if (cached !== undefined) {
    return cached;
  }
  const balance = recomputeBalance(userId);
  balanceCache.set(userId, balance);
  return balance;
}

/**
 * Get the full balance info for a user (balance + metadata).
 */
export function getBalanceInfo(userId: string): TokenBalance {
  const ledger = getLedger(userId);
  const balance = getBalance(userId);
  const lastEntry = ledger.length > 0 ? ledger[ledger.length - 1] : undefined;
  return {
    userId,
    balance,
    lastUpdated: lastEntry?.timestamp ?? new Date().toISOString(),
    entryCount: ledger.length,
  };
}

/**
 * Get the ledger history for a user, optionally filtered.
 * Returns entries newest-first (reverse chronological).
 */
export function getLedgerHistory(
  userId: string,
  options?: { limit?: number; offset?: number; type?: 'credit' | 'debit' }
): TokenLedgerEntry[] {
  let entries = getLedger(userId);

  if (options?.type) {
    entries = entries.filter((e) => e.type === options.type);
  }

  // Reverse for newest-first
  const reversed = [...entries].reverse();

  const offset = options?.offset ?? 0;
  const limit = options?.limit ?? 100;

  return reversed.slice(offset, offset + limit);
}

/**
 * Process a Stripe payment event. Deduplicates by Stripe event ID.
 *
 * This is the primary entry point for the Stripe webhook handler. It:
 * 1. Checks the dedup window for this Stripe event ID
 * 2. Credits tokens to the user's balance
 * 3. Records the Stripe event for audit
 *
 * Returns the operation result, or null if the event was already processed
 * (within the dedup window).
 */
export function processStripePayment(event: StripePaymentEvent): TokenOperationResult | null {
  const now = Date.now();

  // Dedup check — Stripe retries webhooks, so we must be idempotent
  const lastSeen = stripeEventDedup.get(event.id);
  if (lastSeen !== undefined && now - lastSeen < DEDUP_WINDOW_MS) {
    // Already processed within the dedup window — skip
    return null;
  }

  // Record the event for dedup
  stripeEventDedup.set(event.id, now);

  // Credit the tokens
  const result = creditTokens(
    event.userId,
    event.tokenAmount,
    'stripe_payment',
    `stripe_${event.id}`,
    {
      stripeId: event.stripeId,
      stripeType: event.type,
      stripeTimestamp: event.stripeTimestamp,
      ...(event.raw ? { rawEvent: event.raw } : {}),
    }
  );

  return result;
}

/**
 * Check whether a user has sufficient balance for an operation.
 * Returns true if balance >= amount, false otherwise.
 * Does NOT debit — use debitTokens() for that.
 */
export function hasSufficientBalance(userId: string, amount: number): boolean {
  return getBalance(userId) >= amount;
}

/**
 * Authorize a token spend for an operation. This is a combined
 * check-and-reserve: it verifies sufficient balance and debits atomically.
 *
 * Throws InsufficientBalanceError if balance < amount.
 * Returns the operation result on success.
 */
export function authorizeAndDebit(
  userId: string,
  amount: number,
  operationName: string,
  metadata?: Record<string, unknown>
): TokenOperationResult {
  return debitTokens(
    userId,
    amount,
    'operation_debit',
    `op_${operationName}_${Date.now()}`,
    { operation: operationName, ...metadata }
  );
}

// ── Admin operations ──────────────────────────────────────────────────────────

/**
 * Grant tokens to a user (admin operation). Founder or admin key required
 * at the route layer — this function doesn't enforce auth, only the ledger.
 */
export function grantTokens(
  userId: string,
  amount: number,
  adminId: string,
  reason: string
): TokenOperationResult {
  return creditTokens(userId, amount, 'admin_grant', `admin_grant_${adminId}_${Date.now()}`, {
    adminId,
    reason,
  });
}

/**
 * Revoke tokens from a user (admin operation). Unlike a debit (which requires
 * sufficient balance), a revocation can take balance negative if needed for
 * correction purposes. Admin revocations are always allowed.
 *
 * If balance would go negative, it's floored at 0 and the difference is logged
 * in metadata as `writeOff`.
 */
export function revokeTokens(
  userId: string,
  amount: number,
  adminId: string,
  reason: string
): TokenOperationResult {
  if (amount <= 0) {
    throw new InvalidAmountError(amount, 'revoke amount must be positive');
  }

  const balanceBefore = getBalance(userId);
  const writeOff = amount > balanceBefore ? amount - balanceBefore : 0;
  const balanceAfter = Math.max(0, balanceBefore - amount);
  const actualDebit = amount - writeOff;

  // If the full amount can't be debited (balance too low), debit what we can
  // and record the write-off
  if (actualDebit === 0) {
    // Balance is already 0 — nothing to revoke, but still record the attempt
    const entry: TokenLedgerEntry = {
      id: generateEntryId(userId, 'debit', new Date().toISOString()),
      userId,
      type: 'debit',
      amount: 0, // No actual debit
      balanceAfter: 0,
      timestamp: new Date().toISOString(),
      source: 'admin_revoke',
      reference: `admin_revoke_${adminId}_${Date.now()}`,
      metadata: {
        requestedAmount: amount,
        writeOff,
        adminId,
        reason,
        note: 'Balance was 0; revocation recorded as write-off',
      },
    };
    getLedger(userId).push(entry);
    return { entry, balanceBefore: 0, balanceAfter: 0 };
  }

  // Debit the available amount
  const result = debitTokens(
    userId,
    actualDebit,
    'admin_revoke',
    `admin_revoke_${adminId}_${Date.now()}`,
    {
      requestedAmount: amount,
      writeOff,
      adminId,
      reason,
    }
  );

  return result;
}

// ── Persistence ──────────────────────────────────────────────────────────────

/** Serialize the entire ledger state for persistence. */
export function serializeLedger(): {
  version: number;
  entries: Record<string, TokenLedgerEntry[]>;
  stripeDedup: Array<[string, number]>;
  savedAt: string;
} {
  return {
    version: 1,
    entries: Object.fromEntries(userLedgers.entries()),
    stripeDedup: Array.from(stripeEventDedup.entries()),
    savedAt: new Date().toISOString(),
  };
}

/** Restore ledger state from persisted data. */
export function deserializeLedger(data: {
  version: number;
  entries: Record<string, TokenLedgerEntry[]>;
  stripeDedup?: Array<[string, number]>;
}): void {
  userLedgers.clear();
  balanceCache.clear();

  for (const [userId, entries] of Object.entries(data.entries)) {
    userLedgers.set(userId, entries);
    // Recompute and cache the balance
    balanceCache.set(userId, recomputeBalance(userId));
  }

  // Restore Stripe dedup window
  stripeEventDedup.clear();
  if (data.stripeDedup) {
    for (const [eventId, ts] of data.stripeDedup) {
      stripeEventDedup.set(eventId, ts);
    }
  }

  // Prune expired dedup entries
  const now = Date.now();
  for (const [eventId, ts] of stripeEventDedup.entries()) {
    if (now - ts > DEDUP_WINDOW_MS) {
      stripeEventDedup.delete(eventId);
    }
  }
}

// ── Test helpers ─────────────────────────────────────────────────────────────

/** Reset all ledger state. Test-only. */
export function _resetLedger(): void {
  userLedgers.clear();
  balanceCache.clear();
  appliedEntries.clear();
  stripeEventDedup.clear();
}

/** Get the number of users with ledgers. Test-only. */
export function _userCount(): number {
  return userLedgers.size;
}

/** Get the total number of entries across all users. Test-only. */
export function _totalEntryCount(): number {
  let count = 0;
  for (const ledger of userLedgers.values()) {
    count += ledger.length;
  }
  return count;
}