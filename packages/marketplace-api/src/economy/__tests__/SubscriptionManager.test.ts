/**
 * SubscriptionManager tests — v5.8 "Live Economy"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { SubscriptionManager } from '../SubscriptionManager';

describe('SubscriptionManager', () => {
  let manager: SubscriptionManager;

  beforeEach(() => {
    manager = new SubscriptionManager({
      gracePeriodDays: 3,
      maxFailedRenewals: 3,
    });

    // Register test plans
    manager.registerPlan({
      id: 'free',
      name: 'Free',
      description: 'Free tier',
      amount: 0,
      interval: 'monthly',
      trialDays: 0,
      features: ['basic'],
    });

    manager.registerPlan({
      id: 'pro',
      name: 'Pro',
      description: 'Pro tier',
      amount: 1000000, // $1.00
      interval: 'monthly',
      trialDays: 7,
      features: ['basic', 'advanced', 'priority-support'],
    });

    manager.registerPlan({
      id: 'enterprise',
      name: 'Enterprise',
      description: 'Enterprise tier',
      amount: 10000000, // $10.00
      interval: 'yearly',
      trialDays: 14,
      features: ['basic', 'advanced', 'priority-support', 'sla', 'custom-plugins'],
    });
  });

  // ===========================================================================
  // PLAN MANAGEMENT
  // ===========================================================================

  describe('plans', () => {
    it('lists registered plans', () => {
      const plans = manager.listPlans();
      expect(plans).toHaveLength(3);
    });

    it('retrieves plan by ID', () => {
      const plan = manager.getPlan('pro');
      expect(plan).toBeDefined();
      expect(plan!.name).toBe('Pro');
      expect(plan!.trialDays).toBe(7);
    });
  });

  // ===========================================================================
  // CREATE
  // ===========================================================================

  describe('create', () => {
    it('creates subscription with trial', () => {
      const sub = manager.create('user-1', 'pro');
      expect(sub.subscriberId).toBe('user-1');
      expect(sub.planId).toBe('pro');
      expect(sub.state).toBe('trial');
      expect(sub.inTrial).toBe(true);
      expect(sub.trialEnd).not.toBeNull();
      expect(sub.amount).toBe(1000000);
    });

    it('creates subscription without trial', () => {
      const sub = manager.create('user-1', 'free');
      expect(sub.state).toBe('active');
      expect(sub.inTrial).toBe(false);
      expect(sub.trialEnd).toBeNull();
    });

    it('throws for unknown plan', () => {
      expect(() => manager.create('user-1', 'unknown')).toThrow('not found');
    });

    it('stores metadata', () => {
      const sub = manager.create('user-1', 'pro', { source: 'promotion' });
      expect(sub.metadata).toEqual({ source: 'promotion' });
    });
  });

  // ===========================================================================
  // RENEW
  // ===========================================================================

  describe('renew', () => {
    it('renews active subscription', async () => {
      const sub = manager.create('user-1', 'free');
      manager.onRenewal(async () => true);

      const result = await manager.renew(sub.id);
      expect(result.success).toBe(true);
      expect(result.subscription.state).toBe('active');
    });

    it('enters grace period on failed renewal', async () => {
      const sub = manager.create('user-1', 'free');
      manager.onRenewal(async () => false);

      const result = await manager.renew(sub.id);
      expect(result.success).toBe(false);
      expect(result.subscription.state).toBe('past_due');
      expect(result.enteredGracePeriod).toBe(true);
      expect(result.subscription.gracePeriodEnd).not.toBeNull();
    });

    it('suspends after max failed renewals', async () => {
      const sub = manager.create('user-1', 'free');
      manager.onRenewal(async () => false);

      await manager.renew(sub.id);
      await manager.renew(sub.id);
      const result = await manager.renew(sub.id);

      expect(result.subscription.state).toBe('suspended');
      expect(result.subscription.failedRenewals).toBe(3);
    });

    it('rejects renewal of cancelled subscription', async () => {
      const sub = manager.create('user-1', 'free');
      manager.cancel(sub.id, true);

      const result = await manager.renew(sub.id);
      expect(result.success).toBe(false);
      expect(result.error).toContain('cancelled');
    });
  });

  // ===========================================================================
  // CANCEL
  // ===========================================================================

  describe('cancel', () => {
    it('cancels immediately', () => {
      const sub = manager.create('user-1', 'free');
      const cancelled = manager.cancel(sub.id, true);
      expect(cancelled.state).toBe('cancelled');
      expect(cancelled.cancelledAt).not.toBeNull();
    });

    it('schedules cancel at period end', () => {
      const sub = manager.create('user-1', 'free');
      const scheduled = manager.cancel(sub.id, false);
      expect(scheduled.state).toBe('active'); // Still active until period end
      expect(scheduled.cancelAtPeriodEnd).toBe(true);
    });

    it('throws when cancelling already cancelled', () => {
      const sub = manager.create('user-1', 'free');
      manager.cancel(sub.id, true);
      expect(() => manager.cancel(sub.id, true)).toThrow('already cancelled');
    });
  });

  // ===========================================================================
  // SUSPEND / REACTIVATE
  // ===========================================================================

  describe('suspend and reactivate', () => {
    it('suspends a subscription', () => {
      const sub = manager.create('user-1', 'free');
      const suspended = manager.suspend(sub.id);
      expect(suspended.state).toBe('suspended');
    });

    it('reactivates a suspended subscription', () => {
      const sub = manager.create('user-1', 'free');
      manager.suspend(sub.id);
      const reactivated = manager.reactivate(sub.id);
      expect(reactivated.state).toBe('active');
      expect(reactivated.failedRenewals).toBe(0);
    });

    it('reactivates a cancelled subscription', () => {
      const sub = manager.create('user-1', 'free');
      manager.cancel(sub.id, true);
      const reactivated = manager.reactivate(sub.id);
      expect(reactivated.state).toBe('active');
    });

    it('rejects reactivation of active subscription', () => {
      const sub = manager.create('user-1', 'free');
      expect(() => manager.reactivate(sub.id)).toThrow('Cannot reactivate');
    });
  });

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  describe('queries', () => {
    it('gets subscriber subscriptions', () => {
      manager.create('user-1', 'free');
      manager.create('user-1', 'pro');
      manager.create('user-2', 'free');

      const subs = manager.getSubscriberSubscriptions('user-1');
      expect(subs).toHaveLength(2);
    });

    it('filters by state', () => {
      manager.create('u1', 'free');
      const sub2 = manager.create('u2', 'free');
      manager.cancel(sub2.id, true);

      expect(manager.getByState('active')).toHaveLength(1);
      expect(manager.getByState('cancelled')).toHaveLength(1);
    });

    it('finds subscriptions in grace period', async () => {
      const sub = manager.create('u1', 'free');
      manager.onRenewal(async () => false);
      await manager.renew(sub.id);

      const inGrace = manager.getInGracePeriod();
      expect(inGrace).toHaveLength(1);
    });
  });

  // ===========================================================================
  // STATS
  // ===========================================================================

  describe('stats', () => {
    it('returns comprehensive stats', () => {
      manager.create('u1', 'free');
      manager.create('u2', 'pro');

      const stats = manager.getStats();
      expect(stats.total).toBe(2);
      expect(stats.planCount).toBe(3);
      // Pro trial still counts toward MRR
      expect(stats.totalMRR).toBeGreaterThan(0);
    });

    it('returns subscription count', () => {
      manager.create('u1', 'free');
      expect(manager.getSubscriptionCount()).toBe(1);
    });
  });
});
