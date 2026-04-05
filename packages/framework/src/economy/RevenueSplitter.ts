/**
 * RevenueSplitter — Deterministic revenue splitting using bigint arithmetic.
 *
 * Splits revenue among multiple recipients with exact-sum invariant:
 * sum(shares) === total (no rounding leakage).
 *
 * Moved from core into framework as part of FW-0.6.
 *
 * @module economy/RevenueSplitter
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SplitRecipient {
  /** Unique recipient ID (agent, creator, platform) */
  id: string;
  /** Basis points (1/10000) — e.g., 5000 = 50% */
  basisPoints: number;
}

export interface SplitResult {
  /** Individual shares keyed by recipient ID */
  shares: Map<string, bigint>;
  /** Total input amount */
  total: bigint;
  /** Any dust (remainder) allocated to the first recipient */
  dust: bigint;
  /** Human-readable breakdown */
  breakdown: SplitBreakdownEntry[];
}

export interface SplitBreakdownEntry {
  recipientId: string;
  basisPoints: number;
  amount: bigint;
  percentage: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Total basis points (100%) */
const TOTAL_BASIS_POINTS = 10_000;

// =============================================================================
// REVENUE SPLITTER
// =============================================================================

export class RevenueSplitter {
  private recipients: SplitRecipient[];

  /**
   * Create a revenue splitter.
   *
   * @param recipients — Array of recipients with basis points.
   *   Basis points must sum to exactly 10000 (100%).
   * @throws Error if basis points don't sum to 10000 or any are negative.
   */
  constructor(recipients: SplitRecipient[]) {
    if (recipients.length === 0) {
      throw new Error('At least one recipient is required');
    }

    const sum = recipients.reduce((acc, r) => acc + r.basisPoints, 0);
    if (sum !== TOTAL_BASIS_POINTS) {
      throw new Error(
        `Basis points must sum to ${TOTAL_BASIS_POINTS} (got ${sum})`
      );
    }

    for (const r of recipients) {
      if (r.basisPoints < 0) {
        throw new Error(`Negative basis points for "${r.id}": ${r.basisPoints}`);
      }
    }

    // Check for duplicate IDs
    const ids = new Set(recipients.map(r => r.id));
    if (ids.size !== recipients.length) {
      throw new Error('Duplicate recipient IDs');
    }

    this.recipients = [...recipients];
  }

  /**
   * Split an amount among recipients.
   *
   * Uses bigint arithmetic for exact splitting.
   * Dust (remainder from integer division) goes to the first recipient.
   *
   * @param totalAmount — Total amount to split (in base units, e.g., USDC 6 decimals)
   * @returns SplitResult with exact shares summing to totalAmount
   */
  split(totalAmount: bigint): SplitResult {
    if (totalAmount < 0n) {
      throw new Error('Cannot split negative amount');
    }

    const shares = new Map<string, bigint>();
    const breakdown: SplitBreakdownEntry[] = [];
    let allocated = 0n;

    for (const recipient of this.recipients) {
      const share = (totalAmount * BigInt(recipient.basisPoints)) / BigInt(TOTAL_BASIS_POINTS);
      shares.set(recipient.id, share);
      allocated += share;
      breakdown.push({
        recipientId: recipient.id,
        basisPoints: recipient.basisPoints,
        amount: share,
        percentage: `${(recipient.basisPoints / 100).toFixed(2)}%`,
      });
    }

    // Allocate dust to first recipient (sum invariant)
    const dust = totalAmount - allocated;
    if (dust > 0n) {
      const firstId = this.recipients[0].id;
      const current = shares.get(firstId)!;
      shares.set(firstId, current + dust);
      breakdown[0].amount = current + dust;
    }

    return { shares, total: totalAmount, dust, breakdown };
  }

  /**
   * Split a numeric amount (convenience wrapper).
   * Converts to bigint internally.
   */
  splitNumeric(totalAmount: number): SplitResult {
    return this.split(BigInt(Math.floor(totalAmount)));
  }

  /**
   * Get the configured recipients.
   */
  getRecipients(): readonly SplitRecipient[] {
    return this.recipients;
  }

  /**
   * Validate that a split result sums correctly.
   */
  static validate(result: SplitResult): boolean {
    let sum = 0n;
    for (const amount of result.shares.values()) {
      sum += amount;
    }
    return sum === result.total;
  }
}
