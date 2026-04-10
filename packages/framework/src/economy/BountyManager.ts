/**
 * Bounty Manager — Task-based incentive system for agent teams.
 *
 * Creates, claims, and settles bounties tied to board tasks.
 * Integrates with X402Facilitator for on-chain or in-memory payouts.
 *
 * FW-0.6
 */

import type { X402Facilitator, MicroPaymentLedger } from './x402-facilitator';

// ── Types ──

export type BountyCurrency = 'USDC' | 'credits';
export type BountyStatus = 'open' | 'claimed' | 'completed' | 'expired' | 'disputed';

export interface BountyReward {
  amount: number;
  currency: BountyCurrency;
}

export interface Bounty {
  id: string;
  taskId: string;
  reward: BountyReward;
  status: BountyStatus;
  createdBy: string;
  claimedBy?: string;
  completedAt?: string;
  deadline?: number;
  createdAt: string;
}

export interface ClaimResult {
  success: boolean;
  bountyId: string;
  error?: string;
}

export interface CompletionProof {
  commitHash?: string;
  summary: string;
  /** Arbitrary evidence (test output, URLs, etc.) */
  evidence?: string[];
}

export interface PayoutResult {
  success: boolean;
  bountyId: string;
  amount: number;
  currency: BountyCurrency;
  /** Settlement method used (ledger for credits/micro, on-chain for larger USDC) */
  settlement: 'ledger' | 'on_chain';
  error?: string;
}

export interface BountyManagerConfig {
  /** Optional X402Facilitator for USDC payouts. Without it, only credits work. */
  facilitator?: X402Facilitator;
  /** Optional MicroPaymentLedger for credit-based or micro USDC payouts. */
  ledger?: MicroPaymentLedger;
  /** Default deadline in ms from creation (default: 7 days). */
  defaultDeadlineMs?: number;
}

// ── Manager ──

export class BountyManager {
  private bounties: Map<string, Bounty> = new Map();
  private nextId = 1;
  private config: BountyManagerConfig;

  constructor(config: BountyManagerConfig = {}) {
    this.config = config;
  }

  /** Create a bounty for a board task. */
  createBounty(taskId: string, reward: BountyReward, createdBy: string, deadline?: number): Bounty {
    if (reward.amount <= 0) throw new Error('Bounty reward must be positive');

    const id = `bounty_${String(this.nextId++).padStart(4, '0')}`;
    const now = Date.now();

    const bounty: Bounty = {
      id,
      taskId,
      reward,
      status: 'open',
      createdBy,
      createdAt: new Date().toISOString(),
      deadline:
        deadline ??
        (this.config.defaultDeadlineMs ? now + this.config.defaultDeadlineMs : undefined),
    };

    this.bounties.set(id, bounty);
    return bounty;
  }

  /** Claim an open bounty. */
  claimBounty(bountyId: string, agentId: string): ClaimResult {
    const bounty = this.bounties.get(bountyId);
    if (!bounty) return { success: false, bountyId, error: 'Bounty not found' };
    if (bounty.status !== 'open')
      return { success: false, bountyId, error: `Bounty is ${bounty.status}, not open` };

    // Check deadline
    if (bounty.deadline && Date.now() > bounty.deadline) {
      bounty.status = 'expired';
      return { success: false, bountyId, error: 'Bounty has expired' };
    }

    bounty.status = 'claimed';
    bounty.claimedBy = agentId;
    return { success: true, bountyId };
  }

  /** Complete a bounty with proof of work and trigger payout. */
  completeBounty(bountyId: string, proof: CompletionProof): PayoutResult {
    const bounty = this.bounties.get(bountyId);
    if (!bounty)
      return {
        success: false,
        bountyId,
        amount: 0,
        currency: 'credits',
        settlement: 'ledger',
        error: 'Bounty not found',
      };
    if (bounty.status !== 'claimed')
      return {
        success: false,
        bountyId,
        amount: 0,
        currency: bounty.reward.currency,
        settlement: 'ledger',
        error: `Bounty is ${bounty.status}, not claimed`,
      };

    if (!proof.summary || proof.summary.trim().length === 0) {
      return {
        success: false,
        bountyId,
        amount: 0,
        currency: bounty.reward.currency,
        settlement: 'ledger',
        error: 'Completion proof requires a summary',
      };
    }

    bounty.status = 'completed';
    bounty.completedAt = new Date().toISOString();

    // Determine settlement method
    const settlement: 'ledger' | 'on_chain' =
      bounty.reward.currency === 'credits'
        ? 'ledger'
        : bounty.reward.amount < 0.1
          ? 'ledger'
          : 'on_chain';

    return {
      success: true,
      bountyId,
      amount: bounty.reward.amount,
      currency: bounty.reward.currency,
      settlement,
    };
  }

  /** Get a bounty by ID. */
  getBounty(bountyId: string): Bounty | undefined {
    return this.bounties.get(bountyId);
  }

  /** List bounties, optionally filtered by status. */
  list(status?: BountyStatus): Bounty[] {
    const all = Array.from(this.bounties.values());
    if (!status) return all;
    return all.filter((b) => b.status === status);
  }

  /** List bounties for a specific task. */
  byTask(taskId: string): Bounty[] {
    return Array.from(this.bounties.values()).filter((b) => b.taskId === taskId);
  }

  /** Expire bounties past their deadline. Returns count expired. */
  expireStale(): number {
    const now = Date.now();
    let count = 0;
    for (const bounty of this.bounties.values()) {
      if (bounty.deadline && now > bounty.deadline && bounty.status === 'open') {
        bounty.status = 'expired';
        count++;
      }
    }
    return count;
  }

  /** Total open bounty value in a given currency. */
  totalOpen(currency?: BountyCurrency): number {
    return this.list('open')
      .filter((b) => !currency || b.reward.currency === currency)
      .reduce((sum, b) => sum + b.reward.amount, 0);
  }
}
