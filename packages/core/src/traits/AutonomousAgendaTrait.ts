/**
 * AutonomousAgendaTrait
 *
 * Daily-loop daemon for agents (HoloMesh teammates, HoloLand NPCs, and
 * uaa2-orchestrated services). Manages a rolling agenda of actions,
 * enforces a cost ceiling, and emits tick events on a configurable cadence.
 *
 * Shared substrate with packages/holoscript-agent/ — the trait layer
 * provides the schedule/cost/budget primitives; the agent runtime provides
 * the LLM-based action selection.
 *
 * CI gates:
 * - daily-loop tick test (tick fires at expected cadence)
 * - cost-ceiling test ($0.50/NPC/day default, $5/agent/day headless per D.031)
 *
 * @version 0.1.0-skeleton
 */

import type { TraitHandler, TraitContext, TraitEvent, HSPlusNode } from './TraitTypes';
import { extractPayload } from './TraitTypes';
import type { Pillar, PillarContext, PillarSlice } from './pillar/PillarRegistry';

// =============================================================================
// TYPES
// =============================================================================

export interface AgendaItem {
  id: string;
  title: string;
  priority: number; // 1 = highest
  estimatedCostUsd: number;
  deadlineMs?: number;
  completedAt?: number;
}

export interface AutonomousAgendaConfig {
  /** Identity tag: 'npc', 'teammate', 'service', 'item' */
  agent_class: 'npc' | 'teammate' | 'service' | 'item';
  /** Tick interval in milliseconds. Default: 60_000 (1 min). */
  tick_interval_ms: number;
  /** Daily spend cap in USD. */
  daily_budget_usd: number;
  /** Max actions that can be proposed per tick. */
  max_actions_per_tick: number;
  /** Max actions that can be executed per day. */
  max_actions_per_day: number;
  /** If true, ticks are suspended when cost ceiling is hit. */
  pause_on_ceiling: boolean;
}

export interface AutonomousAgendaState {
  items: AgendaItem[];
  lastTick: number;
  actionsToday: number;
  spentToday: number;
  dayBoundary: number; // timestamp of the current day's 00:00 UTC
  paused: boolean;
  pauseReason: string | null;
}

function getState(node: HSPlusNode): AutonomousAgendaState | undefined {
  return node.__autonomousAgendaState as AutonomousAgendaState | undefined;
}

function startOfDayUtc(now: number): number {
  const d = new Date(now);
  d.setUTCHours(0, 0, 0, 0);
  return d.getTime();
}

function resetDayBoundary(state: AutonomousAgendaState, now: number): void {
  const newBoundary = startOfDayUtc(now);
  if (newBoundary > state.dayBoundary) {
    state.actionsToday = 0;
    state.spentToday = 0;
    state.dayBoundary = newBoundary;
    state.paused = false;
    state.pauseReason = null;
  }
}

// =============================================================================
// HANDLER
// =============================================================================

export const autonomousAgendaHandler: TraitHandler<AutonomousAgendaConfig> = {
  name: 'autonomous_agenda',

  defaultConfig: {
    agent_class: 'npc',
    tick_interval_ms: 60_000,
    daily_budget_usd: 0.5,
    max_actions_per_tick: 3,
    max_actions_per_day: 50,
    pause_on_ceiling: true,
  },

  onAttach(node, config, context) {
    const now = Date.now();
    const state: AutonomousAgendaState = {
      items: [],
      lastTick: now,
      actionsToday: 0,
      spentToday: 0,
      dayBoundary: startOfDayUtc(now),
      paused: false,
      pauseReason: null,
    };
    node.__autonomousAgendaState = state;

    context.emit?.('autonomous_agenda_ready', {
      node,
      agentClass: config.agent_class,
      dailyBudgetUsd: config.daily_budget_usd,
      tickIntervalMs: config.tick_interval_ms,
    });

    // PSF-3 WIRE (D.040): register AutonomousAgenda as Pillar axis (behavioral + structural)
    const autonomousAgendaPillar: Pillar = {
      id: 'autonomous_agenda',
      domain: 'agent',
      axis_vocabulary: ['action_priority', 'budget_pressure'] as const,
      generate(ctx: PillarContext): PillarSlice {
        const meta = (ctx.metadata || {}) as Record<string, number>;
        return {
          axis_1_id: 'action_priority',
          axis_2_id: 'budget_pressure',
          pos_1: meta.action_priority ?? 0.6,
          pos_2: meta.budget_pressure ?? 0.3,
          pillar_id: this.id,
          pillar_domain: this.domain,
        };
      },
    };
    context.emit?.('pillar:register', { pillar: autonomousAgendaPillar });
  },

  onDetach(node) {
    delete node.__autonomousAgendaState;
  },

  onUpdate(node, config, context) {
    const state = getState(node);
    if (!state) return;

    const now = Date.now();
    resetDayBoundary(state, now);

    if (state.paused && config.pause_on_ceiling) return;

    if (now - state.lastTick < config.tick_interval_ms) return;
    state.lastTick = now;

    // Cost-ceiling check BEFORE proposing actions
    if (state.spentToday >= config.daily_budget_usd || state.actionsToday >= config.max_actions_per_day) {
      if (config.pause_on_ceiling) {
        state.paused = true;
        state.pauseReason = 'daily_budget_or_action_ceiling';
      }
      context.emit?.('agenda_cost_ceiling_breach', {
        node,
        spentToday: state.spentToday,
        actionsToday: state.actionsToday,
        dailyBudgetUsd: config.daily_budget_usd,
        maxActionsPerDay: config.max_actions_per_day,
      });
      return;
    }

    context.emit?.('agenda_tick', {
      node,
      agentClass: config.agent_class,
      itemsPending: state.items.filter((i) => !i.completedAt).length,
      actionsToday: state.actionsToday,
      spentToday: state.spentToday,
      remainingBudget: Math.max(0, config.daily_budget_usd - state.spentToday),
    });
  },

  onEvent(node, config, context, event) {
    const state = getState(node);
    if (!state) return;

    if (event.type === 'agenda_add_item') {
      const payload = extractPayload(event);
      const item: AgendaItem = {
        id: String(payload.id ?? `item_${Date.now()}`),
        title: String(payload.title ?? 'Untitled'),
        priority: typeof payload.priority === 'number' ? payload.priority : 5,
        estimatedCostUsd: typeof payload.estimatedCostUsd === 'number' ? payload.estimatedCostUsd : 0,
        deadlineMs: typeof payload.deadlineMs === 'number' ? payload.deadlineMs : undefined,
      };
      state.items.push(item);
      state.items.sort((a, b) => a.priority - b.priority);

      context.emit?.('agenda_item_added', {
        node,
        item,
        pendingCount: state.items.filter((i) => !i.completedAt).length,
      });
      return;
    }

    if (event.type === 'agenda_complete_item') {
      const payload = extractPayload(event);
      const itemId = String(payload.itemId ?? '');
      const item = state.items.find((i) => i.id === itemId);
      if (item) {
        item.completedAt = Date.now();
        state.actionsToday += 1;
        state.spentToday += item.estimatedCostUsd;
      }
      context.emit?.('agenda_item_completed', {
        node,
        itemId,
        actionsToday: state.actionsToday,
        spentToday: state.spentToday,
      });
      return;
    }

    if (event.type === 'agenda_resume') {
      resetDayBoundary(state, Date.now());
      state.paused = false;
      state.pauseReason = null;
      context.emit?.('agenda_resumed', { node });
      return;
    }

    if (event.type === 'agenda_query') {
      context.emit?.('agenda_state', {
        queryId: extractPayload(event).queryId,
        node,
        items: state.items.map((i) => ({ ...i })),
        actionsToday: state.actionsToday,
        spentToday: state.spentToday,
        paused: state.paused,
        pauseReason: state.pauseReason,
      });
      return;
    }
  },
};

export default autonomousAgendaHandler;
