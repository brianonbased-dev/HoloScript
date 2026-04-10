/**
 * CreatorRevenueAggregator — Earnings tracking and revenue sharing
 *
 * Tracks earnings by creator, plugin, and time period from LedgerEntry records.
 * Calculates revenue shares and maintains payout history.
 *
 * Part of HoloScript v5.8 "Live Economy".
 *
 * @version 1.0.0
 */

import type { TelemetryCollector } from './_core-stubs';

// =============================================================================
// TYPES
// =============================================================================

/**
 * A revenue event from a tool call or resource access.
 */
export interface RevenueEvent {
  /** Unique event ID */
  id: string;
  /** Creator who earned revenue */
  creatorId: string;
  /** Plugin or tool that generated the revenue */
  pluginId: string;
  /** Gross amount in USDC base units (6 decimals) */
  grossAmount: number;
  /** Platform fee in USDC base units */
  platformFee: number;
  /** Net amount (grossAmount - platformFee) */
  netAmount: number;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Payer (agent or user) */
  payerId: string;
  /** Related ledger entry ID */
  ledgerEntryId?: string;
}

/**
 * Aggregated earnings for a creator.
 */
export interface CreatorEarnings {
  /** Creator ID */
  creatorId: string;
  /** Total gross revenue (USDC base units) */
  totalGross: number;
  /** Total platform fees (USDC base units) */
  totalFees: number;
  /** Total net revenue (USDC base units) */
  totalNet: number;
  /** Revenue by plugin */
  byPlugin: Map<string, PluginRevenue>;
  /** Number of revenue events */
  eventCount: number;
  /** Period start (ISO 8601) */
  periodStart: string;
  /** Period end (ISO 8601) */
  periodEnd: string;
}

/**
 * Revenue breakdown for a specific plugin.
 */
export interface PluginRevenue {
  /** Plugin ID */
  pluginId: string;
  /** Gross revenue */
  grossAmount: number;
  /** Platform fee */
  platformFee: number;
  /** Net revenue */
  netAmount: number;
  /** Number of revenue events */
  eventCount: number;
  /** Unique payers */
  uniquePayers: Set<string>;
}

/**
 * Payout record.
 */
export interface PayoutRecord {
  /** Payout ID */
  id: string;
  /** Creator ID */
  creatorId: string;
  /** Amount paid out (USDC base units) */
  amount: number;
  /** Payout method */
  method: 'usdc_transfer' | 'batch_settlement' | 'manual';
  /** Transaction hash (if on-chain) */
  transactionHash?: string;
  /** Payout timestamp (ISO 8601) */
  paidAt: string;
  /** Status */
  status: 'pending' | 'completed' | 'failed';
  /** Period this payout covers */
  periodStart: string;
  periodEnd: string;
}

/**
 * Revenue aggregation period.
 */
export type RevenuePeriod = 'daily' | 'weekly' | 'monthly' | 'all-time';

/**
 * Revenue aggregator configuration.
 */
export interface RevenueAggregatorConfig {
  /** Platform fee rate (0-1, e.g. 0.15 = 15%) */
  platformFeeRate?: number;
  /** Minimum payout threshold (USDC base units, default: 5_000_000 = $5.00) */
  minPayoutThreshold?: number;
  /** Maximum events to retain per creator */
  maxEventsPerCreator?: number;
  /** Telemetry collector */
  telemetry?: TelemetryCollector;
}

// =============================================================================
// CREATOR REVENUE AGGREGATOR
// =============================================================================

export class CreatorRevenueAggregator {
  private config: Required<Omit<RevenueAggregatorConfig, 'telemetry'>> & {
    telemetry?: TelemetryCollector;
  };
  private events: Map<string, RevenueEvent[]> = new Map();
  private payouts: PayoutRecord[] = [];
  private eventCounter = 0;

  constructor(config?: RevenueAggregatorConfig) {
    this.config = {
      platformFeeRate: config?.platformFeeRate ?? 0.15,
      minPayoutThreshold: config?.minPayoutThreshold ?? 5_000_000,
      maxEventsPerCreator: config?.maxEventsPerCreator ?? 10000,
      telemetry: config?.telemetry,
    };
  }

  // ===========================================================================
  // RECORDING
  // ===========================================================================

  /**
   * Record a revenue event.
   */
  recordRevenue(
    creatorId: string,
    pluginId: string,
    grossAmount: number,
    payerId: string,
    ledgerEntryId?: string
  ): RevenueEvent {
    const platformFee = Math.floor(grossAmount * this.config.platformFeeRate);
    const netAmount = grossAmount - platformFee;

    const event: RevenueEvent = {
      id: `rev-${++this.eventCounter}`,
      creatorId,
      pluginId,
      grossAmount,
      platformFee,
      netAmount,
      timestamp: Date.now(),
      payerId,
      ledgerEntryId,
    };

    const creatorEvents = this.events.get(creatorId) ?? [];
    creatorEvents.push(event);

    // Trim if too many
    if (creatorEvents.length > this.config.maxEventsPerCreator) {
      creatorEvents.splice(0, creatorEvents.length - this.config.maxEventsPerCreator);
    }

    this.events.set(creatorId, creatorEvents);

    this.emitTelemetry('revenue_recorded', {
      creatorId,
      pluginId,
      grossAmount,
      netAmount,
      payerId,
    });

    return event;
  }

  // ===========================================================================
  // AGGREGATION
  // ===========================================================================

  /**
   * Get earnings for a specific creator.
   */
  getCreatorEarnings(creatorId: string, period: RevenuePeriod = 'monthly'): CreatorEarnings {
    const events = this.events.get(creatorId) ?? [];
    const { start, end } = this.getPeriodBounds(period);
    const filtered = events.filter((e) => e.timestamp >= start && e.timestamp < end);

    const byPlugin = new Map<string, PluginRevenue>();
    let totalGross = 0;
    let totalFees = 0;
    let totalNet = 0;

    for (const event of filtered) {
      totalGross += event.grossAmount;
      totalFees += event.platformFee;
      totalNet += event.netAmount;

      let pluginRev = byPlugin.get(event.pluginId);
      if (!pluginRev) {
        pluginRev = {
          pluginId: event.pluginId,
          grossAmount: 0,
          platformFee: 0,
          netAmount: 0,
          eventCount: 0,
          uniquePayers: new Set(),
        };
        byPlugin.set(event.pluginId, pluginRev);
      }

      pluginRev.grossAmount += event.grossAmount;
      pluginRev.platformFee += event.platformFee;
      pluginRev.netAmount += event.netAmount;
      pluginRev.eventCount++;
      pluginRev.uniquePayers.add(event.payerId);
    }

    return {
      creatorId,
      totalGross,
      totalFees,
      totalNet,
      byPlugin,
      eventCount: filtered.length,
      periodStart: new Date(start).toISOString(),
      periodEnd: new Date(end).toISOString(),
    };
  }

  /**
   * Get top creators by revenue.
   */
  getTopCreators(
    period: RevenuePeriod = 'monthly',
    limit = 10
  ): Array<{ creatorId: string; totalNet: number; eventCount: number }> {
    const results: Array<{ creatorId: string; totalNet: number; eventCount: number }> = [];

    for (const creatorId of this.events.keys()) {
      const earnings = this.getCreatorEarnings(creatorId, period);
      results.push({
        creatorId,
        totalNet: earnings.totalNet,
        eventCount: earnings.eventCount,
      });
    }

    return results.sort((a, b) => b.totalNet - a.totalNet).slice(0, limit);
  }

  /**
   * Get platform revenue (total fees collected).
   */
  getPlatformRevenue(period: RevenuePeriod = 'monthly'): {
    totalFees: number;
    totalGross: number;
    creatorCount: number;
  } {
    let totalFees = 0;
    let totalGross = 0;
    let creatorCount = 0;

    for (const creatorId of this.events.keys()) {
      const earnings = this.getCreatorEarnings(creatorId, period);
      if (earnings.eventCount > 0) {
        totalFees += earnings.totalFees;
        totalGross += earnings.totalGross;
        creatorCount++;
      }
    }

    return { totalFees, totalGross, creatorCount };
  }

  // ===========================================================================
  // PAYOUTS
  // ===========================================================================

  /**
   * Get creators eligible for payout (net earnings >= threshold).
   */
  getPayoutEligible(
    period: RevenuePeriod = 'monthly'
  ): Array<{ creatorId: string; amount: number }> {
    const eligible: Array<{ creatorId: string; amount: number }> = [];

    for (const creatorId of this.events.keys()) {
      const earnings = this.getCreatorEarnings(creatorId, period);
      const previousPayouts = this.getCreatorPayouts(creatorId, period);
      const alreadyPaid = previousPayouts.reduce(
        (sum, p) => sum + (p.status === 'completed' ? p.amount : 0),
        0
      );
      const unpaid = earnings.totalNet - alreadyPaid;

      if (unpaid >= this.config.minPayoutThreshold) {
        eligible.push({ creatorId, amount: unpaid });
      }
    }

    return eligible.sort((a, b) => b.amount - a.amount);
  }

  /**
   * Record a payout to a creator.
   */
  recordPayout(
    creatorId: string,
    amount: number,
    method: PayoutRecord['method'],
    transactionHash?: string
  ): PayoutRecord {
    const now = new Date();
    const { start, end } = this.getPeriodBounds('monthly');

    const record: PayoutRecord = {
      id: `payout-${Date.now()}-${creatorId}`,
      creatorId,
      amount,
      method,
      transactionHash,
      paidAt: now.toISOString(),
      status: transactionHash ? 'completed' : 'pending',
      periodStart: new Date(start).toISOString(),
      periodEnd: new Date(end).toISOString(),
    };

    this.payouts.push(record);

    this.emitTelemetry('payout_recorded', {
      creatorId,
      amount,
      method,
      status: record.status,
    });

    return record;
  }

  /**
   * Update payout status.
   */
  updatePayoutStatus(
    payoutId: string,
    status: PayoutRecord['status'],
    transactionHash?: string
  ): boolean {
    const payout = this.payouts.find((p) => p.id === payoutId);
    if (!payout) return false;

    payout.status = status;
    if (transactionHash) {
      payout.transactionHash = transactionHash;
    }

    return true;
  }

  /**
   * Get payouts for a creator.
   */
  getCreatorPayouts(creatorId: string, period?: RevenuePeriod): PayoutRecord[] {
    let filtered = this.payouts.filter((p) => p.creatorId === creatorId);
    if (period) {
      const { start, end } = this.getPeriodBounds(period);
      filtered = filtered.filter((p) => {
        const paidAt = new Date(p.paidAt).getTime();
        return paidAt >= start && paidAt < end;
      });
    }
    return filtered;
  }

  /**
   * Get all payouts.
   */
  getAllPayouts(): PayoutRecord[] {
    return [...this.payouts];
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get all tracked creator IDs.
   */
  getCreatorIds(): string[] {
    return [...this.events.keys()];
  }

  /**
   * Get platform fee rate.
   */
  getPlatformFeeRate(): number {
    return this.config.platformFeeRate;
  }

  /**
   * Set platform fee rate.
   */
  setPlatformFeeRate(rate: number): void {
    if (rate < 0 || rate > 1) throw new Error('Fee rate must be between 0 and 1');
    this.config.platformFeeRate = rate;
  }

  // ===========================================================================
  // INTERNALS
  // ===========================================================================

  private getPeriodBounds(period: RevenuePeriod): { start: number; end: number } {
    const now = new Date();
    switch (period) {
      case 'daily': {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { start: start.getTime(), end: start.getTime() + 86400_000 };
      }
      case 'weekly': {
        const dayOfWeek = now.getDay();
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
        return { start: start.getTime(), end: start.getTime() + 7 * 86400_000 };
      }
      case 'monthly': {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return { start: start.getTime(), end: end.getTime() };
      }
      case 'all-time':
        return { start: 0, end: Date.now() + 86400_000 };
    }
  }

  private emitTelemetry(type: string, data?: Record<string, unknown>): void {
    this.config.telemetry?.record({
      type,
      severity: 'info',
      agentId: 'creator-revenue',
      data,
    });
  }
}
