/**
 * MCP Economy Tools — v5.8 "Live Economy"
 *
 * 3 tools: check_agent_budget, get_usage_summary, get_creator_earnings
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  AgentBudgetEnforcer,
  UsageMeter,
  CreatorRevenueAggregator,
} from '@holoscript/core';
import type {
  BudgetState,
  AgentUsageSummary,
  CreatorEarnings,
  UsagePeriod,
  RevenuePeriod,
} from '@holoscript/core';

// =============================================================================
// SINGLETONS
// =============================================================================

let budgetEnforcer: AgentBudgetEnforcer | null = null;
let usageMeter: UsageMeter | null = null;
let revenueAggregator: CreatorRevenueAggregator | null = null;

function getBudgetEnforcer(): AgentBudgetEnforcer {
  if (!budgetEnforcer) budgetEnforcer = new AgentBudgetEnforcer();
  return budgetEnforcer;
}

function getUsageMeter(): UsageMeter {
  if (!usageMeter) usageMeter = new UsageMeter();
  return usageMeter;
}

function getRevenueAggregator(): CreatorRevenueAggregator {
  if (!revenueAggregator) revenueAggregator = new CreatorRevenueAggregator();
  return revenueAggregator;
}

export function resetEconomySingletons(): void {
  budgetEnforcer = null;
  usageMeter = null;
  revenueAggregator = null;
}

// =============================================================================
// TOOL DEFINITIONS
// =============================================================================

export const economyTools: Tool[] = [
  {
    name: 'check_agent_budget',
    description: 'Check budget status for an agent. Returns spent, remaining, limit, enforcement mode, and circuit breaker state.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to check budget for' },
        amount: { type: 'number', description: 'Optional: check if this spend amount would be authorized' },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'get_usage_summary',
    description: 'Get usage summary for an agent or globally. Shows per-tool cost breakdown, free-tier status, and top tools.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID (omit for global summary)' },
        period: { type: 'string', enum: ['hourly', 'daily', 'monthly'], description: 'Aggregation period (default: monthly)' },
        topToolsLimit: { type: 'number', description: 'Number of top tools to return (default: 10)' },
      },
    },
  },
  {
    name: 'get_creator_earnings',
    description: 'Get earnings for a plugin creator. Shows revenue by plugin, platform fees, payout eligibility, and payout history.',
    inputSchema: {
      type: 'object',
      properties: {
        creatorId: { type: 'string', description: 'Creator ID to get earnings for' },
        period: { type: 'string', enum: ['daily', 'weekly', 'monthly', 'all-time'], description: 'Aggregation period (default: monthly)' },
      },
      required: ['creatorId'],
    },
  },
];

// =============================================================================
// HANDLER
// =============================================================================

export async function handleEconomyTool(
  name: string,
  args: Record<string, unknown>
): Promise<unknown> {
  switch (name) {
    case 'check_agent_budget':
      return handleCheckAgentBudget(args);
    case 'get_usage_summary':
      return handleGetUsageSummary(args);
    case 'get_creator_earnings':
      return handleGetCreatorEarnings(args);
    default:
      throw new Error(`Unknown economy tool: ${name}`);
  }
}

// =============================================================================
// IMPLEMENTATIONS
// =============================================================================

function handleCheckAgentBudget(args: Record<string, unknown>): {
  agentId: string;
  state: BudgetState | null;
  authorization?: { authorized: boolean; reason?: string; warning?: boolean; warningMessage?: string };
} {
  const agentId = args.agentId as string;
  const enforcer = getBudgetEnforcer();

  const state = enforcer.getState(agentId) ?? null;

  // If amount is provided, check authorization
  if (args.amount !== undefined) {
    const amount = args.amount as number;
    const auth = enforcer.authorize(agentId, amount);
    return {
      agentId,
      state: auth.state,
      authorization: {
        authorized: auth.authorized,
        reason: auth.reason,
        warning: auth.warning,
        warningMessage: auth.warningMessage,
      },
    };
  }

  return { agentId, state };
}

function handleGetUsageSummary(args: Record<string, unknown>): {
  agentId?: string;
  period: string;
  summary: {
    totalCalls: number;
    totalCost: number;
    freeTierCalls: number;
    paidCalls: number;
    paidCost: number;
  };
  topTools?: Array<{ toolId: string; calls: number; cost: number }>;
  freeTierRemaining?: number;
} {
  const meter = getUsageMeter();
  const period = (args.period as UsagePeriod) ?? 'monthly';
  const topToolsLimit = (args.topToolsLimit as number) ?? 10;
  const agentId = args.agentId as string | undefined;

  if (agentId) {
    const usage: AgentUsageSummary = meter.getAgentUsage(agentId, period);
    return {
      agentId,
      period,
      summary: {
        totalCalls: usage.total.totalCalls,
        totalCost: usage.total.totalCost,
        freeTierCalls: usage.total.freeTierCalls,
        paidCalls: usage.total.paidCalls,
        paidCost: usage.total.paidCost,
      },
      freeTierRemaining: usage.freeTierRemaining,
    };
  }

  // Global summary
  const global = meter.getGlobalUsage(period);
  const topTools = meter.getTopTools(period, topToolsLimit);

  return {
    period,
    summary: {
      totalCalls: global.totalCalls,
      totalCost: global.totalCost,
      freeTierCalls: global.freeTierCalls,
      paidCalls: global.paidCalls,
      paidCost: global.paidCost,
    },
    topTools,
  };
}

function handleGetCreatorEarnings(args: Record<string, unknown>): {
  creatorId: string;
  period: string;
  earnings: {
    totalGross: number;
    totalFees: number;
    totalNet: number;
    eventCount: number;
    byPlugin: Array<{ pluginId: string; grossAmount: number; netAmount: number; eventCount: number; uniquePayers: number }>;
  };
  payouts: Array<{ id: string; amount: number; status: string; paidAt: string }>;
  platformFeeRate: number;
} {
  const aggregator = getRevenueAggregator();
  const creatorId = args.creatorId as string;
  const period = (args.period as RevenuePeriod) ?? 'monthly';

  const earnings: CreatorEarnings = aggregator.getCreatorEarnings(creatorId, period);
  const payouts = aggregator.getCreatorPayouts(creatorId, period);

  const byPlugin = [...earnings.byPlugin.entries()].map(([pluginId, rev]) => ({
    pluginId,
    grossAmount: rev.grossAmount,
    netAmount: rev.netAmount,
    eventCount: rev.eventCount,
    uniquePayers: rev.uniquePayers.size,
  }));

  return {
    creatorId,
    period,
    earnings: {
      totalGross: earnings.totalGross,
      totalFees: earnings.totalFees,
      totalNet: earnings.totalNet,
      eventCount: earnings.eventCount,
      byPlugin,
    },
    payouts: payouts.map((p) => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      paidAt: p.paidAt,
    })),
    platformFeeRate: aggregator.getPlatformFeeRate(),
  };
}
