import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { autonomousAgendaHandler } from '../AutonomousAgendaTrait';
import {
  createMockContext,
  createMockNode,
  attachTrait,
  sendEvent,
  getLastEvent,
  getEventCount,
  updateTrait,
} from './traitTestHelpers';

describe('AutonomousAgendaTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-11T00:00:00.000Z'));
    node = createMockNode('agenda-1');
    ctx = createMockContext();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits ready with budget and class', () => {
    attachTrait(autonomousAgendaHandler, node, { agent_class: 'teammate', daily_budget_usd: 5 }, ctx);
    const ev = getLastEvent(ctx, 'autonomous_agenda_ready');
    expect(ev.agentClass).toBe('teammate');
    expect(ev.dailyBudgetUsd).toBe(5);
  });

  it('fires tick on update after interval elapsed', () => {
    attachTrait(autonomousAgendaHandler, node, { tick_interval_ms: 1000 }, ctx);
    vi.advanceTimersByTime(500);
    updateTrait(autonomousAgendaHandler, node, { tick_interval_ms: 1000 }, ctx, 0.5);
    expect(getEventCount(ctx, 'agenda_tick')).toBe(0);

    vi.advanceTimersByTime(600);
    updateTrait(autonomousAgendaHandler, node, { tick_interval_ms: 1000 }, ctx, 0.6);
    expect(getEventCount(ctx, 'agenda_tick')).toBe(1);
  });

  it('pauses and emits ceiling breach when budget exceeded', () => {
    const cfg = {
      daily_budget_usd: 1,
      pause_on_ceiling: true,
      tick_interval_ms: 500,
    };
    attachTrait(autonomousAgendaHandler, node, cfg, ctx);
    sendEvent(autonomousAgendaHandler, node, cfg, ctx, {
      type: 'agenda_add_item',
      id: 'i1',
      title: 'Research',
      estimatedCostUsd: 1.5,
    });
    sendEvent(autonomousAgendaHandler, node, cfg, ctx, {
      type: 'agenda_complete_item',
      itemId: 'i1',
    });

    vi.advanceTimersByTime(600);
    updateTrait(autonomousAgendaHandler, node, cfg, ctx, 0.6);

    expect(getEventCount(ctx, 'agenda_cost_ceiling_breach')).toBe(1);
    const ev = getLastEvent(ctx, 'agenda_cost_ceiling_breach');
    expect(ev.spentToday).toBeGreaterThanOrEqual(1);
  });

  it('adds and completes items, tracking counts', () => {
    attachTrait(autonomousAgendaHandler, node, {}, ctx);
    sendEvent(autonomousAgendaHandler, node, {}, ctx, {
      type: 'agenda_add_item',
      id: 'a1',
      title: 'Task A',
      priority: 2,
    });
    sendEvent(autonomousAgendaHandler, node, {}, ctx, {
      type: 'agenda_add_item',
      id: 'a2',
      title: 'Task B',
      priority: 1,
    });
    sendEvent(autonomousAgendaHandler, node, {}, ctx, {
      type: 'agenda_complete_item',
      itemId: 'a2',
    });

    const ev = getLastEvent(ctx, 'agenda_item_completed');
    expect(ev.actionsToday).toBe(1);

    sendEvent(autonomousAgendaHandler, node, {}, ctx, {
      type: 'agenda_query',
      queryId: 'q1',
    });
    const state = getLastEvent(ctx, 'agenda_state');
    expect(state.items).toHaveLength(2);
    expect(state.items[0].completedAt).toBeDefined();
  });
});
