/**
 * SubscriptionManager — Recurring subscription lifecycle management
 *
 * Manages subscription states: create → renew → cancel → suspend → reactivate.
 * Supports trial periods, grace periods on failed renewal, and links to
 * X402PaymentGateway for recurring authorization.
 *
 * Part of HoloScript v5.8 "Live Economy".
 *
 * @version 1.0.0
 */

import type { TelemetryCollector } from '../debug/TelemetryCollector';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Subscription lifecycle state.
 */
export type SubscriptionState =
  | 'trial'
  | 'active'
  | 'past_due'
  | 'suspended'
  | 'cancelled'
  | 'expired';

/**
 * Billing interval.
 */
export type BillingInterval = 'daily' | 'weekly' | 'monthly' | 'yearly';

/**
 * A subscription record.
 */
export interface Subscription {
  /** Unique subscription ID */
  id: string;
  /** Subscriber (agent or user) ID */
  subscriberId: string;
  /** Plan ID */
  planId: string;
  /** Current state */
  state: SubscriptionState;
  /** Billing amount per period (USDC base units, 6 decimals) */
  amount: number;
  /** Billing interval */
  interval: BillingInterval;
  /** When the subscription was created (ISO 8601) */
  createdAt: string;
  /** Current period start (ISO 8601) */
  currentPeriodStart: string;
  /** Current period end (ISO 8601) */
  currentPeriodEnd: string;
  /** Trial end date (ISO 8601, null if no trial) */
  trialEnd: string | null;
  /** Whether currently in trial */
  inTrial: boolean;
  /** Number of failed renewal attempts */
  failedRenewals: number;
  /** Grace period end (ISO 8601, null if not in grace period) */
  gracePeriodEnd: string | null;
  /** When cancelled (ISO 8601, null if not cancelled) */
  cancelledAt: string | null;
  /** Cancel at period end (vs immediate) */
  cancelAtPeriodEnd: boolean;
  /** Metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Subscription plan definition.
 */
export interface SubscriptionPlan {
  /** Plan ID */
  id: string;
  /** Plan name */
  name: string;
  /** Plan description */
  description: string;
  /** Billing amount per period (USDC base units) */
  amount: number;
  /** Billing interval */
  interval: BillingInterval;
  /** Trial duration in days (0 = no trial) */
  trialDays: number;
  /** Features included */
  features: string[];
}

/**
 * SubscriptionManager configuration.
 */
export interface SubscriptionManagerConfig {
  /** Grace period duration in days (default: 3) */
  gracePeriodDays?: number;
  /** Maximum failed renewals before suspension (default: 3) */
  maxFailedRenewals?: number;
  /** Telemetry collector */
  telemetry?: TelemetryCollector;
}

/**
 * Renewal result.
 */
export interface RenewalResult {
  /** Whether renewal succeeded */
  success: boolean;
  /** Updated subscription */
  subscription: Subscription;
  /** Error message if failed */
  error?: string;
  /** Whether grace period was entered */
  enteredGracePeriod?: boolean;
}

// =============================================================================
// SUBSCRIPTION MANAGER
// =============================================================================

export class SubscriptionManager {
  private config: Required<Omit<SubscriptionManagerConfig, 'telemetry'>> & { telemetry?: TelemetryCollector };
  private subscriptions: Map<string, Subscription> = new Map();
  private plans: Map<string, SubscriptionPlan> = new Map();
  private renewalCallback?: (subscriptionId: string, amount: number) => Promise<boolean>;
  private subCounter = 0;

  constructor(config?: SubscriptionManagerConfig) {
    this.config = {
      gracePeriodDays: config?.gracePeriodDays ?? 3,
      maxFailedRenewals: config?.maxFailedRenewals ?? 3,
      telemetry: config?.telemetry,
    };
  }

  // ===========================================================================
  // PLAN MANAGEMENT
  // ===========================================================================

  /**
   * Register a subscription plan.
   */
  registerPlan(plan: SubscriptionPlan): void {
    this.plans.set(plan.id, { ...plan });
  }

  /**
   * Get a plan by ID.
   */
  getPlan(planId: string): SubscriptionPlan | undefined {
    return this.plans.get(planId);
  }

  /**
   * List all plans.
   */
  listPlans(): SubscriptionPlan[] {
    return [...this.plans.values()];
  }

  // ===========================================================================
  // LIFECYCLE: CREATE
  // ===========================================================================

  /**
   * Create a new subscription.
   */
  create(
    subscriberId: string,
    planId: string,
    metadata?: Record<string, unknown>
  ): Subscription {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan "${planId}" not found`);
    }

    const id = `sub-${++this.subCounter}`;
    const now = new Date();
    const hasTrial = plan.trialDays > 0;
    const trialEnd = hasTrial
      ? new Date(now.getTime() + plan.trialDays * 86400_000).toISOString()
      : null;

    const periodEnd = this.computePeriodEnd(now, plan.interval);

    const subscription: Subscription = {
      id,
      subscriberId,
      planId,
      state: hasTrial ? 'trial' : 'active',
      amount: plan.amount,
      interval: plan.interval,
      createdAt: now.toISOString(),
      currentPeriodStart: now.toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      trialEnd,
      inTrial: hasTrial,
      failedRenewals: 0,
      gracePeriodEnd: null,
      cancelledAt: null,
      cancelAtPeriodEnd: false,
      metadata,
    };

    this.subscriptions.set(id, subscription);
    this.emitTelemetry('subscription_created', {
      subscriptionId: id,
      subscriberId,
      planId,
      state: subscription.state,
    });

    return subscription;
  }

  // ===========================================================================
  // LIFECYCLE: RENEW
  // ===========================================================================

  /**
   * Attempt to renew a subscription.
   */
  async renew(subscriptionId: string): Promise<RenewalResult> {
    const sub = this.requireSubscription(subscriptionId);

    if (sub.state === 'cancelled' || sub.state === 'expired') {
      return {
        success: false,
        subscription: sub,
        error: `Cannot renew ${sub.state} subscription`,
      };
    }

    // Check if trial just ended
    if (sub.inTrial && sub.trialEnd) {
      const trialEndMs = new Date(sub.trialEnd).getTime();
      if (Date.now() >= trialEndMs) {
        sub.inTrial = false;
        sub.state = 'active';
      }
    }

    // Attempt payment
    let paymentSuccess = true;
    if (this.renewalCallback) {
      try {
        paymentSuccess = await this.renewalCallback(subscriptionId, sub.amount);
      } catch {
        paymentSuccess = false;
      }
    }

    if (paymentSuccess) {
      // Successful renewal
      const now = new Date();
      sub.currentPeriodStart = now.toISOString();
      sub.currentPeriodEnd = this.computePeriodEnd(now, sub.interval).toISOString();
      sub.state = 'active';
      sub.failedRenewals = 0;
      sub.gracePeriodEnd = null;

      // Check if set to cancel at period end
      if (sub.cancelAtPeriodEnd) {
        sub.state = 'cancelled';
        sub.cancelledAt = now.toISOString();
        sub.cancelAtPeriodEnd = false;
        this.emitTelemetry('subscription_cancelled_at_period_end', { subscriptionId });
        return { success: true, subscription: sub };
      }

      this.emitTelemetry('subscription_renewed', { subscriptionId });
      return { success: true, subscription: sub };
    }

    // Failed renewal
    sub.failedRenewals++;

    if (sub.failedRenewals >= this.config.maxFailedRenewals) {
      sub.state = 'suspended';
      this.emitTelemetry('subscription_suspended', {
        subscriptionId,
        failedRenewals: sub.failedRenewals,
      });
      return {
        success: false,
        subscription: sub,
        error: `Subscription suspended after ${sub.failedRenewals} failed renewals`,
      };
    }

    // Enter grace period
    sub.state = 'past_due';
    const gracePeriodEnd = new Date(
      Date.now() + this.config.gracePeriodDays * 86400_000
    ).toISOString();
    sub.gracePeriodEnd = gracePeriodEnd;

    this.emitTelemetry('subscription_renewal_failed', {
      subscriptionId,
      failedRenewals: sub.failedRenewals,
      gracePeriodEnd,
    });

    return {
      success: false,
      subscription: sub,
      error: `Renewal failed (attempt ${sub.failedRenewals}/${this.config.maxFailedRenewals})`,
      enteredGracePeriod: true,
    };
  }

  // ===========================================================================
  // LIFECYCLE: CANCEL
  // ===========================================================================

  /**
   * Cancel a subscription.
   * @param immediate If true, cancel immediately; otherwise cancel at period end.
   */
  cancel(subscriptionId: string, immediate = false): Subscription {
    const sub = this.requireSubscription(subscriptionId);

    if (sub.state === 'cancelled' || sub.state === 'expired') {
      throw new Error(`Subscription already ${sub.state}`);
    }

    if (immediate) {
      sub.state = 'cancelled';
      sub.cancelledAt = new Date().toISOString();
      sub.cancelAtPeriodEnd = false;
    } else {
      sub.cancelAtPeriodEnd = true;
    }

    this.emitTelemetry('subscription_cancel_requested', {
      subscriptionId,
      immediate,
    });

    return sub;
  }

  // ===========================================================================
  // LIFECYCLE: SUSPEND / REACTIVATE
  // ===========================================================================

  /**
   * Suspend a subscription (e.g., after payment failures).
   */
  suspend(subscriptionId: string): Subscription {
    const sub = this.requireSubscription(subscriptionId);
    sub.state = 'suspended';
    this.emitTelemetry('subscription_suspended', { subscriptionId });
    return sub;
  }

  /**
   * Reactivate a suspended or cancelled subscription.
   */
  reactivate(subscriptionId: string): Subscription {
    const sub = this.requireSubscription(subscriptionId);

    if (sub.state !== 'suspended' && sub.state !== 'cancelled' && sub.state !== 'past_due') {
      throw new Error(`Cannot reactivate subscription in state: ${sub.state}`);
    }

    const now = new Date();
    sub.state = 'active';
    sub.failedRenewals = 0;
    sub.gracePeriodEnd = null;
    sub.cancelledAt = null;
    sub.cancelAtPeriodEnd = false;
    sub.currentPeriodStart = now.toISOString();
    sub.currentPeriodEnd = this.computePeriodEnd(now, sub.interval).toISOString();

    this.emitTelemetry('subscription_reactivated', { subscriptionId });
    return sub;
  }

  // ===========================================================================
  // RENEWAL CALLBACK
  // ===========================================================================

  /**
   * Set callback for renewal payment processing.
   * Should return true if payment succeeded.
   */
  onRenewal(callback: (subscriptionId: string, amount: number) => Promise<boolean>): void {
    this.renewalCallback = callback;
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get a subscription by ID.
   */
  getSubscription(id: string): Subscription | undefined {
    return this.subscriptions.get(id);
  }

  /**
   * Get all subscriptions for a subscriber.
   */
  getSubscriberSubscriptions(subscriberId: string): Subscription[] {
    return [...this.subscriptions.values()].filter(
      (s) => s.subscriberId === subscriberId
    );
  }

  /**
   * Get subscriptions by state.
   */
  getByState(state: SubscriptionState): Subscription[] {
    return [...this.subscriptions.values()].filter((s) => s.state === state);
  }

  /**
   * Get subscriptions due for renewal.
   */
  getDueForRenewal(): Subscription[] {
    const now = Date.now();
    return [...this.subscriptions.values()].filter((s) => {
      if (s.state === 'cancelled' || s.state === 'expired' || s.state === 'suspended') {
        return false;
      }
      return new Date(s.currentPeriodEnd).getTime() <= now;
    });
  }

  /**
   * Get subscriptions in grace period.
   */
  getInGracePeriod(): Subscription[] {
    return [...this.subscriptions.values()].filter(
      (s) => s.state === 'past_due' && s.gracePeriodEnd !== null
    );
  }

  /**
   * Check if grace period has expired for past_due subscriptions.
   */
  processExpiredGracePeriods(): Subscription[] {
    const now = Date.now();
    const expired: Subscription[] = [];

    for (const sub of this.subscriptions.values()) {
      if (sub.state === 'past_due' && sub.gracePeriodEnd) {
        if (new Date(sub.gracePeriodEnd).getTime() <= now) {
          sub.state = 'suspended';
          sub.gracePeriodEnd = null;
          expired.push(sub);
          this.emitTelemetry('subscription_grace_expired', { subscriptionId: sub.id });
        }
      }
    }

    return expired;
  }

  /**
   * Get stats.
   */
  getStats(): {
    total: number;
    byState: Record<string, number>;
    totalMRR: number; // Monthly Recurring Revenue (USDC base units)
    planCount: number;
  } {
    const byState: Record<string, number> = {};
    let totalMRR = 0;

    for (const sub of this.subscriptions.values()) {
      byState[sub.state] = (byState[sub.state] || 0) + 1;

      if (sub.state === 'active' || sub.state === 'trial') {
        totalMRR += this.normalizeToMonthly(sub.amount, sub.interval);
      }
    }

    return {
      total: this.subscriptions.size,
      byState,
      totalMRR,
      planCount: this.plans.size,
    };
  }

  /**
   * Total subscription count.
   */
  getSubscriptionCount(): number {
    return this.subscriptions.size;
  }

  // ===========================================================================
  // INTERNALS
  // ===========================================================================

  private requireSubscription(id: string): Subscription {
    const sub = this.subscriptions.get(id);
    if (!sub) throw new Error(`Subscription "${id}" not found`);
    return sub;
  }

  private computePeriodEnd(start: Date, interval: BillingInterval): Date {
    const end = new Date(start);
    switch (interval) {
      case 'daily':
        end.setDate(end.getDate() + 1);
        break;
      case 'weekly':
        end.setDate(end.getDate() + 7);
        break;
      case 'monthly':
        end.setMonth(end.getMonth() + 1);
        break;
      case 'yearly':
        end.setFullYear(end.getFullYear() + 1);
        break;
    }
    return end;
  }

  private normalizeToMonthly(amount: number, interval: BillingInterval): number {
    switch (interval) {
      case 'daily': return amount * 30;
      case 'weekly': return amount * 4;
      case 'monthly': return amount;
      case 'yearly': return Math.floor(amount / 12);
    }
  }

  private emitTelemetry(type: string, data?: Record<string, unknown>): void {
    this.config.telemetry?.record({
      type,
      severity: type.includes('failed') || type.includes('suspended') ? 'warning' : 'info',
      agentId: 'subscription-manager',
      data,
    });
  }
}
