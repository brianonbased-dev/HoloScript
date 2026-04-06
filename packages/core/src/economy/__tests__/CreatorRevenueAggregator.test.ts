/**
 * CreatorRevenueAggregator tests — v5.8 "Live Economy"
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CreatorRevenueAggregator } from '@holoscript/framework/economy';

describe('CreatorRevenueAggregator', () => {
  let aggregator: CreatorRevenueAggregator;

  beforeEach(() => {
    aggregator = new CreatorRevenueAggregator({
      platformFeeRate: 0.15, // 15%
      minPayoutThreshold: 10000, // $0.01
    });
  });

  // ===========================================================================
  // RECORDING
  // ===========================================================================

  describe('recordRevenue', () => {
    it('records revenue with platform fee', () => {
      const event = aggregator.recordRevenue('creator-1', 'plugin-a', 10000, 'payer-1');
      expect(event.creatorId).toBe('creator-1');
      expect(event.grossAmount).toBe(10000);
      expect(event.platformFee).toBe(1500); // 15%
      expect(event.netAmount).toBe(8500);
      expect(event.payerId).toBe('payer-1');
    });

    it('tracks ledger entry reference', () => {
      const event = aggregator.recordRevenue(
        'creator-1',
        'plugin-a',
        5000,
        'payer-1',
        'ledger-123'
      );
      expect(event.ledgerEntryId).toBe('ledger-123');
    });
  });

  // ===========================================================================
  // AGGREGATION
  // ===========================================================================

  describe('getCreatorEarnings', () => {
    it('aggregates earnings by plugin', () => {
      aggregator.recordRevenue('creator-1', 'plugin-a', 10000, 'payer-1');
      aggregator.recordRevenue('creator-1', 'plugin-a', 5000, 'payer-2');
      aggregator.recordRevenue('creator-1', 'plugin-b', 20000, 'payer-1');

      const earnings = aggregator.getCreatorEarnings('creator-1', 'all-time');
      expect(earnings.totalGross).toBe(35000);
      expect(earnings.totalFees).toBe(5250);
      expect(earnings.totalNet).toBe(29750);
      expect(earnings.eventCount).toBe(3);
      expect(earnings.byPlugin.size).toBe(2);

      const pluginA = earnings.byPlugin.get('plugin-a')!;
      expect(pluginA.eventCount).toBe(2);
      expect(pluginA.uniquePayers.size).toBe(2);
    });

    it('returns zero for unknown creator', () => {
      const earnings = aggregator.getCreatorEarnings('nobody', 'all-time');
      expect(earnings.totalGross).toBe(0);
      expect(earnings.eventCount).toBe(0);
    });
  });

  describe('getTopCreators', () => {
    it('ranks creators by net revenue', () => {
      aggregator.recordRevenue('top-creator', 'p1', 100000, 'user-1');
      aggregator.recordRevenue('mid-creator', 'p2', 50000, 'user-1');
      aggregator.recordRevenue('low-creator', 'p3', 10000, 'user-1');

      const top = aggregator.getTopCreators('all-time', 3);
      expect(top).toHaveLength(3);
      expect(top[0].creatorId).toBe('top-creator');
      expect(top[2].creatorId).toBe('low-creator');
    });
  });

  describe('getPlatformRevenue', () => {
    it('sums platform fees', () => {
      aggregator.recordRevenue('c1', 'p1', 10000, 'u1');
      aggregator.recordRevenue('c2', 'p2', 20000, 'u1');

      const revenue = aggregator.getPlatformRevenue('all-time');
      expect(revenue.totalFees).toBe(4500); // 15% of 30000
      expect(revenue.totalGross).toBe(30000);
      expect(revenue.creatorCount).toBe(2);
    });
  });

  // ===========================================================================
  // PAYOUTS
  // ===========================================================================

  describe('payouts', () => {
    it('identifies payout-eligible creators', () => {
      aggregator.recordRevenue('eligible', 'p1', 100000, 'u1'); // Net: 85000 > threshold 10000
      aggregator.recordRevenue('not-eligible', 'p2', 100, 'u1'); // Net: 85 < threshold

      const eligible = aggregator.getPayoutEligible('all-time');
      expect(eligible).toHaveLength(1);
      expect(eligible[0].creatorId).toBe('eligible');
    });

    it('records and retrieves payouts', () => {
      aggregator.recordRevenue('c1', 'p1', 100000, 'u1');
      const payout = aggregator.recordPayout('c1', 85000, 'usdc_transfer', '0xabc');

      expect(payout.creatorId).toBe('c1');
      expect(payout.amount).toBe(85000);
      expect(payout.status).toBe('completed');
      expect(payout.transactionHash).toBe('0xabc');

      const payouts = aggregator.getCreatorPayouts('c1');
      expect(payouts).toHaveLength(1);
    });

    it('updates payout status', () => {
      const payout = aggregator.recordPayout('c1', 50000, 'batch_settlement');
      expect(payout.status).toBe('pending');

      const updated = aggregator.updatePayoutStatus(payout.id, 'completed', '0xdef');
      expect(updated).toBe(true);

      const all = aggregator.getAllPayouts();
      expect(all[0].status).toBe('completed');
      expect(all[0].transactionHash).toBe('0xdef');
    });
  });

  // ===========================================================================
  // CONFIGURATION
  // ===========================================================================

  describe('configuration', () => {
    it('gets and sets platform fee rate', () => {
      expect(aggregator.getPlatformFeeRate()).toBe(0.15);
      aggregator.setPlatformFeeRate(0.1);
      expect(aggregator.getPlatformFeeRate()).toBe(0.1);
    });

    it('rejects invalid fee rates', () => {
      expect(() => aggregator.setPlatformFeeRate(-0.1)).toThrow('between 0 and 1');
      expect(() => aggregator.setPlatformFeeRate(1.5)).toThrow('between 0 and 1');
    });
  });

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  describe('queries', () => {
    it('lists all creator IDs', () => {
      aggregator.recordRevenue('c1', 'p1', 100, 'u1');
      aggregator.recordRevenue('c2', 'p2', 100, 'u1');
      expect(aggregator.getCreatorIds()).toEqual(['c1', 'c2']);
    });
  });
});
