/**
 * EconomyPrimitivesTrait — v5.0
 *
 * In-scene economic system for agent compute credits, bounties,
 * and microtransactions. Integrates with MultiAgentTrait task
 * delegation for bounty auto-assignment.
 *
 * Core Mechanics:
 *  1. Compute Credits — agents earn by completing tasks, spend on
 *     inference/rendering. Prevents runaway GPU usage.
 *  2. Bounties — post tasks with escrow → agents compete → winner paid.
 *  3. Microtransactions — per-item payments between agents.
 *  4. Subscriptions — recurring credit allocations.
 *
 * Events:
 *  economy:account_created    { agentId, initialBalance }
 *  economy:credit_earned      { agentId, amount, reason, newBalance }
 *  economy:credit_spent       { agentId, amount, reason, newBalance }
 *  economy:bounty_posted      { bountyId, reward, description }
 *  economy:bounty_claimed     { bountyId, claimantId }
 *  economy:bounty_completed   { bountyId, winnerId, reward }
 *  economy:bounty_expired     { bountyId }
 *  economy:transaction        { txId, from, to, amount, item }
 *  economy:insufficient_funds { agentId, amount, balance }
 *
 * @version 5.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

export interface CreditAccount {
  agentId: string;
  balance: number;
  totalEarned: number;
  totalSpent: number;
  spendLimit: number; // Max credits per period
  spendThisPeriod: number; // Credits spent in current period
  periodStartMs: number; // When current spend period started
  periodDurationMs: number; // Spend limit reset interval
  transactions: Transaction[];
}

export interface Transaction {
  id: string;
  type: 'earn' | 'spend' | 'transfer' | 'escrow_lock' | 'escrow_release';
  amount: number;
  fromAgent: string;
  toAgent: string;
  reason: string;
  timestamp: number;
}

export type BountyStatus = 'open' | 'claimed' | 'completed' | 'expired' | 'cancelled';

export interface Bounty {
  id: string;
  posterId: string;
  reward: number;
  description: string;
  requiredCapabilities: string[];
  status: BountyStatus;
  claimantId: string | null;
  escrowLocked: number;
  deadline: number; // Unix timestamp
  createdAt: number;
  completedAt: number | null;
  result: unknown | null;
  maxClaimants: number;
}

export interface Subscription {
  id: string;
  subscriberAgent: string;
  providerAgent: string;
  creditPerPeriod: number;
  periodMs: number;
  lastChargeAt: number;
  active: boolean;
}

// =============================================================================
// CONFIG & STATE
// =============================================================================

export interface EconomyConfig {
  /** Initial credit balance for new agents */
  initial_balance: number;
  /** Default spend limit per period (0 = unlimited) */
  default_spend_limit: number;
  /** Spend limit reset period (ms) */
  spend_limit_period: number;
  /** Max transaction history per account */
  max_transaction_history: number;
  /** Default bounty deadline (ms from creation, 0 = no deadline) */
  default_bounty_deadline: number;
  /** Max open bounties per agent */
  max_bounties_per_agent: number;
  /** Enable automatic escrow */
  escrow_enabled: boolean;
  /** Credit earned per task completion (base rate) */
  task_completion_reward: number;
}

export interface EconomyState {
  accounts: Map<string, CreditAccount>;
  bounties: Map<string, Bounty>;
  subscriptions: Map<string, Subscription>;
  txCounter: number;
  bountyCounter: number;
  subCounter: number;
}

// =============================================================================
// HELPERS
// =============================================================================

function generateTxId(state: EconomyState): string {
  return `tx_${Date.now()}_${state.txCounter++}`;
}

function generateBountyId(state: EconomyState): string {
  return `bounty_${Date.now()}_${state.bountyCounter++}`;
}

function generateSubId(state: EconomyState): string {
  return `sub_${Date.now()}_${state.subCounter++}`;
}

function getOrCreateAccount(
  state: EconomyState,
  agentId: string,
  config: EconomyConfig,
  context: any
): CreditAccount {
  let account = state.accounts.get(agentId);
  if (!account) {
    account = {
      agentId,
      balance: config.initial_balance,
      totalEarned: config.initial_balance,
      totalSpent: 0,
      spendLimit: config.default_spend_limit,
      spendThisPeriod: 0,
      periodStartMs: Date.now(),
      periodDurationMs: config.spend_limit_period,
      transactions: [],
    };
    state.accounts.set(agentId, account);
    context.emit?.('economy:account_created', {
      agentId,
      initialBalance: config.initial_balance,
    });
  }
  return account;
}

function addTransaction(account: CreditAccount, tx: Transaction, maxHistory: number): void {
  account.transactions.push(tx);
  if (account.transactions.length > maxHistory) {
    account.transactions = account.transactions.slice(-maxHistory);
  }
}

function resetSpendPeriodIfNeeded(account: CreditAccount): void {
  if (account.periodDurationMs > 0) {
    const elapsed = Date.now() - account.periodStartMs;
    if (elapsed >= account.periodDurationMs) {
      account.spendThisPeriod = 0;
      account.periodStartMs = Date.now();
    }
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export const economyPrimitivesHandler: TraitHandler<EconomyConfig> = {
  name: 'economy',

  defaultConfig: {
    initial_balance: 100,
    default_spend_limit: 0,
    spend_limit_period: 3600000, // 1 hour
    max_transaction_history: 200,
    default_bounty_deadline: 300000, // 5 minutes
    max_bounties_per_agent: 10,
    escrow_enabled: true,
    task_completion_reward: 10,
  },

  // ===========================================================================
  // onAttach
  // ===========================================================================
  onAttach(node: any, _config: EconomyConfig, context: any): void {
    const state: EconomyState = {
      accounts: new Map(),
      bounties: new Map(),
      subscriptions: new Map(),
      txCounter: 0,
      bountyCounter: 0,
      subCounter: 0,
    };
    node.__economyState = state;
    context.emit?.('economy:ready', { timestamp: Date.now() });
  },

  // ===========================================================================
  // onDetach
  // ===========================================================================
  onDetach(node: any, _config: EconomyConfig, context: any): void {
    const state: EconomyState | undefined = node.__economyState;
    if (state) {
      // Cancel all open bounties
      for (const bounty of state.bounties.values()) {
        if (bounty.status === 'open' || bounty.status === 'claimed') {
          bounty.status = 'cancelled';
        }
      }
      context.emit?.('economy:shutdown', {
        accounts: state.accounts.size,
        bounties: state.bounties.size,
      });
    }
    delete node.__economyState;
  },

  // ===========================================================================
  // onUpdate — expire bounties, charge subscriptions
  // ===========================================================================
  onUpdate(node: any, config: EconomyConfig, context: any, _delta: number): void {
    const state: EconomyState | undefined = node.__economyState;
    if (!state) return;

    const now = Date.now();

    // Expire bounties past deadline
    for (const [id, bounty] of state.bounties) {
      if (
        bounty.deadline > 0 &&
        now > bounty.deadline &&
        (bounty.status === 'open' || bounty.status === 'claimed')
      ) {
        bounty.status = 'expired';

        // Release escrow back to poster
        if (config.escrow_enabled && bounty.escrowLocked > 0) {
          const poster = state.accounts.get(bounty.posterId);
          if (poster) {
            poster.balance += bounty.escrowLocked;
            addTransaction(
              poster,
              {
                id: generateTxId(state),
                type: 'escrow_release',
                amount: bounty.escrowLocked,
                fromAgent: '__escrow__',
                toAgent: bounty.posterId,
                reason: `Bounty ${id} expired`,
                timestamp: now,
              },
              config.max_transaction_history
            );
          }
          bounty.escrowLocked = 0;
        }

        context.emit?.('economy:bounty_expired', { bountyId: id });
      }
    }

    // Charge subscriptions
    for (const sub of state.subscriptions.values()) {
      if (!sub.active) continue;
      if (now - sub.lastChargeAt >= sub.periodMs) {
        const subscriber = state.accounts.get(sub.subscriberAgent);
        const provider = state.accounts.get(sub.providerAgent);
        if (subscriber && provider && subscriber.balance >= sub.creditPerPeriod) {
          subscriber.balance -= sub.creditPerPeriod;
          subscriber.totalSpent += sub.creditPerPeriod;
          provider.balance += sub.creditPerPeriod;
          provider.totalEarned += sub.creditPerPeriod;
          sub.lastChargeAt = now;
        } else if (subscriber && subscriber.balance < sub.creditPerPeriod) {
          sub.active = false;
          context.emit?.('economy:subscription_suspended', {
            subscriptionId: sub.id,
            reason: 'insufficient_funds',
          });
        }
      }
    }
  },

  // ===========================================================================
  // onEvent
  // ===========================================================================
  onEvent(node: any, config: EconomyConfig, context: any, event: any): void {
    const state: EconomyState | undefined = node.__economyState;
    if (!state) return;

    const eventType = typeof event === 'string' ? event : event.type;
    const payload = (event as any)?.payload ?? event;

    switch (eventType) {
      // ─── Credit operations ─────────────────────────────────────────────
      case 'economy:earn': {
        const account = getOrCreateAccount(state, payload.agentId, config, context);
        const amount = Math.max(0, Number(payload.amount) || config.task_completion_reward);
        account.balance += amount;
        account.totalEarned += amount;

        addTransaction(
          account,
          {
            id: generateTxId(state),
            type: 'earn',
            amount,
            fromAgent: '__system__',
            toAgent: payload.agentId,
            reason: payload.reason ?? 'task_completion',
            timestamp: Date.now(),
          },
          config.max_transaction_history
        );

        context.emit?.('economy:credit_earned', {
          agentId: payload.agentId,
          amount,
          reason: payload.reason ?? 'task_completion',
          newBalance: account.balance,
        });
        break;
      }

      case 'economy:spend': {
        const account = getOrCreateAccount(state, payload.agentId, config, context);
        const amount = Math.max(0, Number(payload.amount) || 0);

        resetSpendPeriodIfNeeded(account);

        // Check spend limit
        if (account.spendLimit > 0 && account.spendThisPeriod + amount > account.spendLimit) {
          context.emit?.('economy:spend_limit_exceeded', {
            agentId: payload.agentId,
            amount,
            limit: account.spendLimit,
            spentThisPeriod: account.spendThisPeriod,
          });
          break;
        }

        if (account.balance < amount) {
          context.emit?.('economy:insufficient_funds', {
            agentId: payload.agentId,
            amount,
            balance: account.balance,
          });
          break;
        }

        account.balance -= amount;
        account.totalSpent += amount;
        account.spendThisPeriod += amount;

        addTransaction(
          account,
          {
            id: generateTxId(state),
            type: 'spend',
            amount,
            fromAgent: payload.agentId,
            toAgent: payload.target ?? '__system__',
            reason: payload.reason ?? 'inference',
            timestamp: Date.now(),
          },
          config.max_transaction_history
        );

        context.emit?.('economy:credit_spent', {
          agentId: payload.agentId,
          amount,
          reason: payload.reason ?? 'inference',
          newBalance: account.balance,
        });
        break;
      }

      case 'economy:transfer': {
        const from = getOrCreateAccount(state, payload.from, config, context);
        const to = getOrCreateAccount(state, payload.to, config, context);
        const amount = Math.max(0, Number(payload.amount) || 0);

        if (from.balance < amount) {
          context.emit?.('economy:insufficient_funds', {
            agentId: payload.from,
            amount,
            balance: from.balance,
          });
          break;
        }

        from.balance -= amount;
        from.totalSpent += amount;
        to.balance += amount;
        to.totalEarned += amount;

        const txId = generateTxId(state);
        const tx: Transaction = {
          id: txId,
          type: 'transfer',
          amount,
          fromAgent: payload.from,
          toAgent: payload.to,
          reason: payload.reason ?? 'transfer',
          timestamp: Date.now(),
        };
        addTransaction(from, tx, config.max_transaction_history);
        addTransaction(to, tx, config.max_transaction_history);

        context.emit?.('economy:transaction', {
          txId,
          from: payload.from,
          to: payload.to,
          amount,
          item: payload.item ?? null,
        });
        break;
      }

      // ─── Bounty operations ─────────────────────────────────────────────
      case 'economy:post_bounty': {
        const poster = getOrCreateAccount(state, payload.posterId, config, context);
        const reward = Math.max(1, Number(payload.reward) || 0);

        // Check max bounties
        let openCount = 0;
        for (const b of state.bounties.values()) {
          if (b.posterId === payload.posterId && (b.status === 'open' || b.status === 'claimed'))
            openCount++;
        }
        if (openCount >= config.max_bounties_per_agent) break;

        // Escrow lock
        if (config.escrow_enabled) {
          if (poster.balance < reward) {
            context.emit?.('economy:insufficient_funds', {
              agentId: payload.posterId,
              amount: reward,
              balance: poster.balance,
            });
            break;
          }
          poster.balance -= reward;
          addTransaction(
            poster,
            {
              id: generateTxId(state),
              type: 'escrow_lock',
              amount: reward,
              fromAgent: payload.posterId,
              toAgent: '__escrow__',
              reason: 'bounty_escrow',
              timestamp: Date.now(),
            },
            config.max_transaction_history
          );
        }

        const bountyId = generateBountyId(state);
        const bounty: Bounty = {
          id: bountyId,
          posterId: payload.posterId,
          reward,
          description: payload.description ?? '',
          requiredCapabilities: payload.requiredCapabilities ?? [],
          status: 'open',
          claimantId: null,
          escrowLocked: config.escrow_enabled ? reward : 0,
          deadline:
            payload.deadline ??
            (config.default_bounty_deadline > 0 ? Date.now() + config.default_bounty_deadline : 0),
          createdAt: Date.now(),
          completedAt: null,
          result: null,
          maxClaimants: payload.maxClaimants ?? 1,
        };
        state.bounties.set(bountyId, bounty);

        context.emit?.('economy:bounty_posted', {
          bountyId,
          reward,
          description: bounty.description,
          requiredCapabilities: bounty.requiredCapabilities,
        });
        break;
      }

      case 'economy:claim_bounty': {
        const bounty = state.bounties.get(payload.bountyId);
        if (!bounty || bounty.status !== 'open') break;

        bounty.status = 'claimed';
        bounty.claimantId = payload.claimantId;

        context.emit?.('economy:bounty_claimed', {
          bountyId: payload.bountyId,
          claimantId: payload.claimantId,
        });
        break;
      }

      case 'economy:complete_bounty': {
        const bounty = state.bounties.get(payload.bountyId);
        if (!bounty || bounty.status !== 'claimed') break;

        bounty.status = 'completed';
        bounty.completedAt = Date.now();
        bounty.result = payload.result ?? null;

        // Release escrow to winner
        if (bounty.escrowLocked > 0) {
          const winner = getOrCreateAccount(state, bounty.claimantId!, config, context);
          winner.balance += bounty.escrowLocked;
          winner.totalEarned += bounty.escrowLocked;

          addTransaction(
            winner,
            {
              id: generateTxId(state),
              type: 'escrow_release',
              amount: bounty.escrowLocked,
              fromAgent: '__escrow__',
              toAgent: bounty.claimantId!,
              reason: `Bounty ${payload.bountyId} completed`,
              timestamp: Date.now(),
            },
            config.max_transaction_history
          );

          bounty.escrowLocked = 0;
        }

        context.emit?.('economy:bounty_completed', {
          bountyId: payload.bountyId,
          winnerId: bounty.claimantId,
          reward: bounty.reward,
        });
        break;
      }

      // ─── Query operations ──────────────────────────────────────────────
      case 'economy:get_balance': {
        const account = getOrCreateAccount(state, payload.agentId, config, context);
        context.emit?.('economy:balance', {
          agentId: payload.agentId,
          balance: account.balance,
          totalEarned: account.totalEarned,
          totalSpent: account.totalSpent,
        });
        break;
      }

      case 'economy:get_bounties': {
        const status = payload?.status as BountyStatus | undefined;
        const bounties: Bounty[] = [];
        for (const b of state.bounties.values()) {
          if (!status || b.status === status) bounties.push(b);
        }
        context.emit?.('economy:bounties_list', {
          bounties,
          total: bounties.length,
        });
        break;
      }
    }
  },
};

export default economyPrimitivesHandler;
