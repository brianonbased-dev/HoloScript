/**
 * UsageMeter — Per-tool-call cost tracking and aggregation
 *
 * Tracks usage across agents, tools, and time periods.
 * Supports free-tier allowances and paid overage tracking.
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
 * Aggregation period for usage data.
 */
export type UsagePeriod = 'hourly' | 'daily' | 'monthly';

/**
 * A single usage event.
 */
export interface UsageEvent {
  /** Unique event ID */
  id: string;
  /** Agent that made the call */
  agentId: string;
  /** Tool that was called */
  toolId: string;
  /** Cost in USDC base units (6 decimals) */
  cost: number;
  /** Timestamp (ms since epoch) */
  timestamp: number;
  /** Whether this falls under free tier */
  freeTier: boolean;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Aggregated usage for a specific dimension.
 */
export interface UsageAggregate {
  /** Total number of calls */
  totalCalls: number;
  /** Total cost in USDC base units */
  totalCost: number;
  /** Free-tier calls */
  freeTierCalls: number;
  /** Free-tier cost (not charged) */
  freeTierCost: number;
  /** Paid calls */
  paidCalls: number;
  /** Paid cost (actually charged) */
  paidCost: number;
  /** Period start (ISO 8601) */
  periodStart: string;
  /** Period end (ISO 8601) */
  periodEnd: string;
}

/**
 * Usage summary for an agent.
 */
export interface AgentUsageSummary {
  /** Agent ID */
  agentId: string;
  /** Per-tool usage breakdown */
  byTool: Map<string, UsageAggregate>;
  /** Total across all tools */
  total: UsageAggregate;
  /** Free-tier remaining allowance */
  freeTierRemaining: number;
}

/**
 * Free-tier configuration.
 */
export interface FreeTierConfig {
  /** Monthly free-tier allowance in USDC base units */
  monthlyAllowance: number;
  /** Per-tool overrides */
  toolOverrides?: Record<string, number>;
}

/**
 * UsageMeter configuration.
 */
export interface UsageMeterConfig {
  /** Free-tier configuration */
  freeTier?: FreeTierConfig;
  /** Default cost per tool call (USDC base units) */
  defaultToolCost?: number;
  /** Per-tool cost overrides */
  toolCosts?: Record<string, number>;
  /** Maximum events to retain per agent */
  maxEventsPerAgent?: number;
  /** Telemetry collector */
  telemetry?: TelemetryCollector;
}

// =============================================================================
// USAGE METER
// =============================================================================

export class UsageMeter {
  private config: Required<Omit<UsageMeterConfig, 'telemetry' | 'freeTier' | 'toolCosts'>> & {
    telemetry?: TelemetryCollector;
    freeTier: FreeTierConfig;
    toolCosts: Record<string, number>;
  };

  /** All usage events keyed by agentId */
  private events: Map<string, UsageEvent[]> = new Map();

  /** Free-tier consumption per agent (monthly, USDC base units) */
  private freeTierUsed: Map<string, number> = new Map();

  /** Current month key for free-tier reset */
  private currentMonthKey: string;

  private eventCounter = 0;

  constructor(config?: UsageMeterConfig) {
    this.config = {
      freeTier: config?.freeTier ?? { monthlyAllowance: 500_000 }, // $0.50 free
      defaultToolCost: config?.defaultToolCost ?? 100, // $0.0001
      toolCosts: config?.toolCosts ?? {},
      maxEventsPerAgent: config?.maxEventsPerAgent ?? 10000,
      telemetry: config?.telemetry,
    };
    this.currentMonthKey = this.getMonthKey(Date.now());
  }

  // ===========================================================================
  // RECORDING
  // ===========================================================================

  /**
   * Record a tool call usage event.
   */
  recordUsage(agentId: string, toolId: string, metadata?: Record<string, unknown>): UsageEvent {
    // Reset free-tier if month changed
    this.checkMonthReset();

    const cost = this.getToolCost(toolId);
    const freeTierUsed = this.freeTierUsed.get(agentId) ?? 0;
    const freeTierRemaining = Math.max(0, this.config.freeTier.monthlyAllowance - freeTierUsed);
    const isFreeTier = cost <= freeTierRemaining;

    if (isFreeTier) {
      this.freeTierUsed.set(agentId, freeTierUsed + cost);
    }

    const event: UsageEvent = {
      id: `usage-${++this.eventCounter}`,
      agentId,
      toolId,
      cost,
      timestamp: Date.now(),
      freeTier: isFreeTier,
      metadata,
    };

    // Store event
    const agentEvents = this.events.get(agentId) ?? [];
    agentEvents.push(event);

    // Trim if too many
    if (agentEvents.length > this.config.maxEventsPerAgent) {
      agentEvents.splice(0, agentEvents.length - this.config.maxEventsPerAgent);
    }

    this.events.set(agentId, agentEvents);

    this.emitTelemetry('usage_recorded', {
      agentId,
      toolId,
      cost,
      freeTier: isFreeTier,
    });

    return event;
  }

  // ===========================================================================
  // COST LOOKUP
  // ===========================================================================

  /**
   * Get the cost for a specific tool.
   */
  getToolCost(toolId: string): number {
    // Check tool-specific override first
    if (this.config.toolCosts[toolId] !== undefined) {
      return this.config.toolCosts[toolId];
    }
    // Check free-tier tool overrides
    if (this.config.freeTier.toolOverrides?.[toolId] !== undefined) {
      return this.config.freeTier.toolOverrides[toolId];
    }
    return this.config.defaultToolCost;
  }

  /**
   * Set cost for a specific tool.
   */
  setToolCost(toolId: string, cost: number): void {
    this.config.toolCosts[toolId] = cost;
  }

  // ===========================================================================
  // AGGREGATION
  // ===========================================================================

  /**
   * Get usage summary for an agent within a time period.
   */
  getAgentUsage(agentId: string, period: UsagePeriod = 'monthly'): AgentUsageSummary {
    const events = this.events.get(agentId) ?? [];
    const { start, end } = this.getPeriodBounds(period);
    const filtered = events.filter((e) => e.timestamp >= start && e.timestamp < end);

    const byTool = new Map<string, UsageAggregate>();

    const totalAgg: UsageAggregate = {
      totalCalls: 0,
      totalCost: 0,
      freeTierCalls: 0,
      freeTierCost: 0,
      paidCalls: 0,
      paidCost: 0,
      periodStart: new Date(start).toISOString(),
      periodEnd: new Date(end).toISOString(),
    };

    for (const event of filtered) {
      // Per-tool aggregate
      let toolAgg = byTool.get(event.toolId);
      if (!toolAgg) {
        toolAgg = {
          totalCalls: 0,
          totalCost: 0,
          freeTierCalls: 0,
          freeTierCost: 0,
          paidCalls: 0,
          paidCost: 0,
          periodStart: new Date(start).toISOString(),
          periodEnd: new Date(end).toISOString(),
        };
        byTool.set(event.toolId, toolAgg);
      }

      toolAgg.totalCalls++;
      toolAgg.totalCost += event.cost;
      totalAgg.totalCalls++;
      totalAgg.totalCost += event.cost;

      if (event.freeTier) {
        toolAgg.freeTierCalls++;
        toolAgg.freeTierCost += event.cost;
        totalAgg.freeTierCalls++;
        totalAgg.freeTierCost += event.cost;
      } else {
        toolAgg.paidCalls++;
        toolAgg.paidCost += event.cost;
        totalAgg.paidCalls++;
        totalAgg.paidCost += event.cost;
      }
    }

    const freeTierUsed = this.freeTierUsed.get(agentId) ?? 0;
    const freeTierRemaining = Math.max(0, this.config.freeTier.monthlyAllowance - freeTierUsed);

    return {
      agentId,
      byTool,
      total: totalAgg,
      freeTierRemaining,
    };
  }

  /**
   * Get aggregated usage across all agents for a period.
   */
  getGlobalUsage(period: UsagePeriod = 'monthly'): UsageAggregate {
    const { start, end } = this.getPeriodBounds(period);
    const agg: UsageAggregate = {
      totalCalls: 0,
      totalCost: 0,
      freeTierCalls: 0,
      freeTierCost: 0,
      paidCalls: 0,
      paidCost: 0,
      periodStart: new Date(start).toISOString(),
      periodEnd: new Date(end).toISOString(),
    };

    for (const events of this.events.values()) {
      for (const event of events) {
        if (event.timestamp >= start && event.timestamp < end) {
          agg.totalCalls++;
          agg.totalCost += event.cost;
          if (event.freeTier) {
            agg.freeTierCalls++;
            agg.freeTierCost += event.cost;
          } else {
            agg.paidCalls++;
            agg.paidCost += event.cost;
          }
        }
      }
    }

    return agg;
  }

  /**
   * Get top tools by usage cost.
   */
  getTopTools(
    period: UsagePeriod = 'monthly',
    limit = 10
  ): Array<{ toolId: string; calls: number; cost: number }> {
    const { start, end } = this.getPeriodBounds(period);
    const toolMap = new Map<string, { calls: number; cost: number }>();

    for (const events of this.events.values()) {
      for (const event of events) {
        if (event.timestamp >= start && event.timestamp < end) {
          const existing = toolMap.get(event.toolId) ?? { calls: 0, cost: 0 };
          existing.calls++;
          existing.cost += event.cost;
          toolMap.set(event.toolId, existing);
        }
      }
    }

    return [...toolMap.entries()]
      .map(([toolId, data]) => ({ toolId, ...data }))
      .sort((a, b) => b.cost - a.cost)
      .slice(0, limit);
  }

  // ===========================================================================
  // FREE TIER
  // ===========================================================================

  /**
   * Get free-tier remaining for an agent.
   */
  getFreeTierRemaining(agentId: string): number {
    this.checkMonthReset();
    const used = this.freeTierUsed.get(agentId) ?? 0;
    return Math.max(0, this.config.freeTier.monthlyAllowance - used);
  }

  /**
   * Check if an agent has exceeded their free tier.
   */
  isOverFreeTier(agentId: string): boolean {
    return this.getFreeTierRemaining(agentId) === 0;
  }

  // ===========================================================================
  // QUERIES
  // ===========================================================================

  /**
   * Get all tracked agent IDs.
   */
  getTrackedAgents(): string[] {
    return [...this.events.keys()];
  }

  /**
   * Get raw events for an agent.
   */
  getEvents(agentId: string): UsageEvent[] {
    return [...(this.events.get(agentId) ?? [])];
  }

  /**
   * Get total number of recorded events.
   */
  getTotalEventCount(): number {
    let total = 0;
    for (const events of this.events.values()) {
      total += events.length;
    }
    return total;
  }

  // ===========================================================================
  // INTERNALS
  // ===========================================================================

  private getMonthKey(timestamp: number): string {
    const d = new Date(timestamp);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  }

  private checkMonthReset(): void {
    const currentKey = this.getMonthKey(Date.now());
    if (currentKey !== this.currentMonthKey) {
      this.freeTierUsed.clear();
      this.currentMonthKey = currentKey;
    }
  }

  private getPeriodBounds(period: UsagePeriod): { start: number; end: number } {
    const now = new Date();
    let start: Date;

    switch (period) {
      case 'hourly':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), now.getHours());
        return { start: start.getTime(), end: start.getTime() + 3600_000 };
      case 'daily':
        start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        return { start: start.getTime(), end: start.getTime() + 86400_000 };
      case 'monthly':
        start = new Date(now.getFullYear(), now.getMonth(), 1);
        const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        return { start: start.getTime(), end: nextMonth.getTime() };
    }
  }

  private emitTelemetry(type: string, data?: Record<string, unknown>): void {
    this.config.telemetry?.record({
      type,
      severity: 'info',
      agentId: 'usage-meter',
      data,
    });
  }
}
