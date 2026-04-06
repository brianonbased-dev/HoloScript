/**
 * MCP Economy Tools — v5.8 "Live Economy" + v6.1 "Unified Budget"
 *
 * 6 tools:
 *   v5.8: check_agent_budget, get_usage_summary, get_creator_earnings
 *   v6.1: optimize_scene_budget, validate_marketplace_pricing, get_unified_budget_state
 */

import { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  AgentBudgetEnforcer,
  UsageMeter,
  CreatorRevenueAggregator,
  UnifiedBudgetOptimizer,
  DEFAULT_COST_FLOOR,
} from '@holoscript/framework/economy';
import type {
  BudgetState,
  AgentUsageSummary,
  CreatorEarnings,
  UsagePeriod,
  RevenuePeriod,
  UnifiedOptimizerConfig,
  TraitAllocation,
  UnifiedBudgetState,
} from '@holoscript/framework/economy';
import type { ResourceUsageNode } from '@holoscript/framework/economy';

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
    description:
      'Check budget status for an agent. Returns spent, remaining, limit, enforcement mode, and circuit breaker state.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID to check budget for' },
        amount: {
          type: 'number',
          description: 'Optional: check if this spend amount would be authorized',
        },
      },
      required: ['agentId'],
    },
  },
  {
    name: 'get_usage_summary',
    description:
      'Get usage summary for an agent or globally. Shows per-tool cost breakdown, free-tier status, and top tools.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent ID (omit for global summary)' },
        period: {
          type: 'string',
          enum: ['hourly', 'daily', 'monthly'],
          description: 'Aggregation period (default: monthly)',
        },
        topToolsLimit: {
          type: 'number',
          description: 'Number of top tools to return (default: 10)',
        },
      },
    },
  },
  {
    name: 'get_creator_earnings',
    description:
      'Get earnings for a plugin creator. Shows revenue by plugin, platform fees, payout eligibility, and payout history.',
    inputSchema: {
      type: 'object',
      properties: {
        creatorId: { type: 'string', description: 'Creator ID to get earnings for' },
        period: {
          type: 'string',
          enum: ['daily', 'weekly', 'monthly', 'all-time'],
          description: 'Aggregation period (default: monthly)',
        },
      },
      required: ['creatorId'],
    },
  },

  // ── Unified Budget Tools (v6.1) ──

  {
    name: 'optimize_scene_budget',
    description:
      "Run equimarginal allocation on a scene's traits against a platform budget. Returns which traits to include, LOD levels, and what to shed — sorted by value/cost ratio so the most efficient traits survive.",
    inputSchema: {
      type: 'object',
      properties: {
        platform: {
          type: 'string',
          enum: ['quest3', 'desktop-vr', 'webgpu', 'mobile-ar'],
          description: 'Target platform for resource limits',
        },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Object name (e.g., "Player", "Tree")' },
              traits: {
                type: 'array',
                items: { type: 'string' },
                description: 'Trait names (e.g., ["@mesh", "@particle"])',
              },
              count: { type: 'number', description: 'Instance count (default: 1)' },
              calls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Built-in function calls (e.g., ["spawn", "playSound"])',
              },
            },
            required: ['name', 'traits'],
          },
          description: 'Scene objects with their traits and instance counts',
        },
        maxLOD: { type: 'number', description: 'Maximum LOD level to consider (default: 4)' },
        economicBudget: {
          type: 'number',
          description: 'Economic budget in USDC base units (optional)',
        },
        economicSpent: {
          type: 'number',
          description: 'Economic spend so far in USDC base units (optional)',
        },
      },
      required: ['platform', 'nodes'],
    },
  },
  {
    name: 'validate_marketplace_pricing',
    description:
      'Validate that a marketplace trait listing price meets the resource cost floor. Prevents economic denial-of-rendering attacks where a cheap trait consumes massive GPU resources.',
    inputSchema: {
      type: 'object',
      properties: {
        traitName: { type: 'string', description: 'Trait name to validate (e.g., "@gaussian")' },
        listPrice: {
          type: 'number',
          description: 'Proposed listing price in USDC base units (6 decimals, so 1000000 = $1.00)',
        },
        instanceCount: { type: 'number', description: 'Expected instance count (default: 1)' },
        platform: {
          type: 'string',
          enum: ['quest3', 'desktop-vr', 'webgpu', 'mobile-ar'],
          description: 'Target platform (default: quest3)',
        },
      },
      required: ['traitName', 'listPrice'],
    },
  },
  {
    name: 'get_unified_budget_state',
    description:
      'Get a unified view of budget pressure across economy + rendering for an agent. Returns economic pressure, resource pressure per category, suggested LOD, and shed candidates.',
    inputSchema: {
      type: 'object',
      properties: {
        agentId: { type: 'string', description: 'Agent identifier' },
        platform: {
          type: 'string',
          enum: ['quest3', 'desktop-vr', 'webgpu', 'mobile-ar'],
          description: 'Target platform (default: quest3)',
        },
        nodes: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', description: 'Object name' },
              traits: { type: 'array', items: { type: 'string' }, description: 'Trait names' },
              count: { type: 'number', description: 'Instance count (default: 1)' },
              calls: {
                type: 'array',
                items: { type: 'string' },
                description: 'Built-in function calls',
              },
            },
            required: ['name', 'traits'],
          },
          description: 'Scene objects with their traits',
        },
        economicBudget: { type: 'number', description: 'Economic budget in USDC base units' },
        economicSpent: { type: 'number', description: 'Economic spend so far in USDC base units' },
      },
      required: ['agentId'],
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
    case 'optimize_scene_budget':
      return handleOptimizeSceneBudget(args);
    case 'validate_marketplace_pricing':
      return handleValidateMarketplacePricing(args);
    case 'get_unified_budget_state':
      return handleGetUnifiedBudgetState(args);
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
  authorization?: {
    authorized: boolean;
    reason?: string;
    warning?: boolean;
    warningMessage?: string;
  };
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
    byPlugin: Array<{
      pluginId: string;
      grossAmount: number;
      netAmount: number;
      eventCount: number;
      uniquePayers: number;
    }>;
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
    payouts: payouts.map((p: any) => ({
      id: p.id,
      amount: p.amount,
      status: p.status,
      paidAt: p.paidAt,
    })),
    platformFeeRate: aggregator.getPlatformFeeRate(),
  };
}

// =============================================================================
// UNIFIED BUDGET TOOLS (v6.1)
// =============================================================================

function parseNodes(raw: unknown): ResourceUsageNode[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((n: Record<string, unknown>) => ({
    name: (n.name as string) || 'unnamed',
    traits: Array.isArray(n.traits) ? (n.traits as string[]) : [],
    count: typeof n.count === 'number' ? n.count : 1,
    calls: Array.isArray(n.calls) ? (n.calls as string[]) : [],
  }));
}

function handleOptimizeSceneBudget(args: Record<string, unknown>): {
  platform: string;
  allocations: TraitAllocation[];
  summary: {
    totalTraits: number;
    includedTraits: number;
    excludedTraits: number;
    degradedTraits: number;
  };
} {
  const platform = (args.platform as string) || 'quest3';
  const nodes = parseNodes(args.nodes);
  const maxLOD = typeof args.maxLOD === 'number' ? args.maxLOD : 4;

  const config: UnifiedOptimizerConfig = {
    platform,
    costFloor: DEFAULT_COST_FLOOR,
    economicBudget: typeof args.economicBudget === 'number' ? args.economicBudget : undefined,
    economicSpent: typeof args.economicSpent === 'number' ? args.economicSpent : undefined,
  };

  const optimizer = new UnifiedBudgetOptimizer(config);
  const allocations = optimizer.allocate(nodes, maxLOD);

  const included = allocations.filter((a: any) => a.included);
  const excluded = allocations.filter((a: any) => !a.included);
  const degraded = included.filter((a: any) => a.lodLevel > 0);

  return {
    platform,
    allocations,
    summary: {
      totalTraits: allocations.length,
      includedTraits: included.length,
      excludedTraits: excluded.length,
      degradedTraits: degraded.length,
    },
  };
}

function handleValidateMarketplacePricing(args: Record<string, unknown>): {
  traitName: string;
  listPrice: number;
  instanceCount: number;
  valid: boolean;
  floor: number;
  deficit: number;
  message: string;
  costBreakdown: {
    baseFee: number;
    resourceCost: number;
  };
} {
  const traitName = args.traitName as string;
  const listPrice = args.listPrice as number;
  const instanceCount = typeof args.instanceCount === 'number' ? args.instanceCount : 1;
  const platform = (args.platform as string) || 'quest3';

  const optimizer = new UnifiedBudgetOptimizer({
    platform,
    costFloor: DEFAULT_COST_FLOOR,
  });

  const result = optimizer.validateMarketplacePrice(traitName, listPrice, instanceCount);
  const baseFee = DEFAULT_COST_FLOOR.baseFee;

  return {
    traitName,
    listPrice,
    instanceCount,
    valid: result.valid,
    floor: result.floor,
    deficit: result.deficit,
    message: result.message,
    costBreakdown: {
      baseFee,
      resourceCost: result.floor - baseFee,
    },
  };
}

function handleGetUnifiedBudgetState(args: Record<string, unknown>): UnifiedBudgetState {
  const agentId = args.agentId as string;
  const platform = (args.platform as string) || 'quest3';
  const nodes = parseNodes(args.nodes);
  const economicBudget = typeof args.economicBudget === 'number' ? args.economicBudget : undefined;
  const economicSpent = typeof args.economicSpent === 'number' ? args.economicSpent : undefined;

  const optimizer = new UnifiedBudgetOptimizer({
    platform,
    costFloor: DEFAULT_COST_FLOOR,
    economicBudget,
    economicSpent,
  });

  return optimizer.getUnifiedState(agentId, nodes, economicSpent, economicBudget);
}
