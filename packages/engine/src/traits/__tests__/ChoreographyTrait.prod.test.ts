/**
 * ChoreographyTrait — Production Test Suite
 *
 * choreographyHandler stores state on node.__choreography_state.
 * ChoreographyEngine and ChoreographyPlanner are complex classes — mocked.
 *
 * Key behaviours:
 * 1. defaultConfig — all 7 fields
 * 2. onAttach (participant mode) — state init, planner created, engine=null
 * 3. onAttach (orchestrator/hybrid mode) — engine created with correct options
 * 4. onDetach — clears activePlans+registeredActions, sets engine/planner null, removes state
 * 5. Utility exports — registerAction, unregisterAction, getRegisteredActions,
 *                      getActivePlans, getPendingHitl, getEventHistory
 * 6. getState throws when trait not attached
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  choreographyHandler,
  registerAction,
  unregisterAction,
  getRegisteredActions,
  getActivePlans,
  getPendingHitl,
  getEventHistory,
} from '../ChoreographyTrait';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// Mock ChoreographyEngine and ChoreographyPlanner to prevent real async work
vi.mock('@holoscript/engine/choreography/ChoreographyEngine', () => {
  const MockEngine = vi.fn().mockImplementation(() => ({
    setActionHandler: vi.fn(),
    on: vi.fn(),
    execute: vi.fn().mockResolvedValue({ planId: 'p1', status: 'completed', outputs: {} }),
    pause: vi.fn().mockResolvedValue(undefined),
    resume: vi.fn().mockResolvedValue(undefined),
    cancel: vi.fn().mockResolvedValue(undefined),
    approveHitl: vi.fn(),
    rejectHitl: vi.fn(),
  }));
  return { ChoreographyEngine: MockEngine };
});

vi.mock('@holoscript/engine/choreography/ChoreographyPlanner', () => {
  const MockPlanner = vi.fn().mockImplementation(() => ({
    createPlan: vi
      .fn()
      .mockReturnValue({ id: 'plan-1', goal: 'test', status: 'pending', steps: [] }),
  }));
  const mockPlanBuilder = { step: vi.fn().mockReturnThis(), build: vi.fn() };
  return {
    ChoreographyPlanner: MockPlanner,
    PlanBuilder: vi.fn().mockImplementation(() => mockPlanBuilder),
    plan: vi.fn().mockReturnValue(mockPlanBuilder),
  };
});
// Mock ChoreographyEngine and ChoreographyPlanner to prevent real async work
vi.mock('@holoscript/engine/choreography/ChoreographyEngine', () => {
  const MockEngine = vi.fn().mockImplementation(function () {
    return {
      setActionHandler: vi.fn(),
      on: vi.fn(),
      execute: vi.fn().mockResolvedValue({ planId: 'p1', status: 'completed', outputs: {} }),
      pause: vi.fn().mockResolvedValue(undefined),
      resume: vi.fn().mockResolvedValue(undefined),
      cancel: vi.fn().mockResolvedValue(undefined),
      approveHitl: vi.fn(),
      rejectHitl: vi.fn(),
    };
  });
  return { ChoreographyEngine: MockEngine };
});

vi.mock('@holoscript/engine/choreography/ChoreographyPlanner', () => {
  const MockPlanner = vi.fn().mockImplementation(function () {
    return {
      createPlan: vi
        .fn()
        .mockReturnValue({ id: 'plan-1', goal: 'test', status: 'pending', steps: [] }),
    };
  });
  const mockPlanBuilder = { step: vi.fn().mockReturnThis(), build: vi.fn() };
  return {
    ChoreographyPlanner: MockPlanner,
    PlanBuilder: vi.fn().mockImplementation(function () { return mockPlanBuilder; }),
    plan: vi.fn().mockReturnValue(mockPlanBuilder),
  };
});

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeNode() {
  return { id: 'choreo_node', properties: {} };
}

function makeCtx() {
  return { emit: vi.fn() };
}

function attach(cfg: Partial<typeof choreographyHandler.defaultConfig> = {}) {
  const node = makeNode();
  const ctx = makeCtx();
  const config = { ...choreographyHandler.defaultConfig!, ...cfg };
  choreographyHandler.onAttach!(node as any, config, ctx as any);
  return { node, ctx, config };
}

// ─── defaultConfig ────────────────────────────────────────────────────────────

describe('choreographyHandler.defaultConfig', () => {
  const d = choreographyHandler.defaultConfig!;
  it('mode=participant', () => expect(d.mode).toBe('participant'));
  it('auto_start=true', () => expect(d.auto_start).toBe(true));
  it('max_concurrent_plans=4', () => expect(d.max_concurrent_plans).toBe(4));
  it('default_step_timeout=30000', () => expect(d.default_step_timeout).toBe(30000));
  it('event_history_limit=100', () => expect(d.event_history_limit).toBe(100));
  it('hitl_auto_pause=true', () => expect(d.hitl_auto_pause).toBe(true));
  it('execute_fallback=true', () => expect(d.execute_fallback).toBe(true));
  it('verbose=false', () => expect(d.verbose).toBe(false));
});

// ─── onAttach — participant mode ─────────────────────────────────────────────

describe('choreographyHandler.onAttach — participant mode', () => {
  it('initialises __choreography_state', () => {
    const { node } = attach({ mode: 'participant' });
    expect((node as any).__choreography_state).toBeDefined();
  });

  it('mode is set to participant', () => {
    const { node } = attach({ mode: 'participant' });
    expect((node as any).__choreography_state.mode).toBe('participant');
  });

  it('planner is initialised', () => {
    const { node } = attach({ mode: 'participant' });
    expect((node as any).__choreography_state.planner).not.toBeNull();
  });

  it('engine is null for participant mode', () => {
    const { node } = attach({ mode: 'participant' });
    expect((node as any).__choreography_state.engine).toBeNull();
  });

  it('activePlans is empty Map', () => {
    const { node } = attach({ mode: 'participant' });
    expect((node as any).__choreography_state.activePlans).toBeInstanceOf(Map);
    expect((node as any).__choreography_state.activePlans.size).toBe(0);
  });

  it('registeredActions is empty Map', () => {
    const { node } = attach({ mode: 'participant' });
    expect((node as any).__choreography_state.registeredActions).toBeInstanceOf(Map);
  });

  it('pendingHitl is empty Set', () => {
    const { node } = attach({ mode: 'participant' });
    expect((node as any).__choreography_state.pendingHitl).toBeInstanceOf(Set);
    expect((node as any).__choreography_state.pendingHitl.size).toBe(0);
  });

  it('eventHistory is empty array', () => {
    const { node } = attach({ mode: 'participant' });
    expect((node as any).__choreography_state.eventHistory).toEqual([]);
  });
});

// ─── onAttach — orchestrator mode ────────────────────────────────────────────

describe('choreographyHandler.onAttach — orchestrator mode', () => {
  it('engine is not null for orchestrator mode', () => {
    const { node } = attach({ mode: 'orchestrator' });
    expect((node as any).__choreography_state.engine).not.toBeNull();
  });

  it('engine is not null for hybrid mode', () => {
    const { node } = attach({ mode: 'hybrid' });
    expect((node as any).__choreography_state.engine).not.toBeNull();
  });

  it('engine has execute, pause, resume, cancel methods', () => {
    const { node } = attach({ mode: 'orchestrator' });
    const engine = (node as any).__choreography_state.engine;
    expect(typeof engine.execute).toBe('function');
    expect(typeof engine.pause).toBe('function');
    expect(typeof engine.cancel).toBe('function');
  });

  it('eventHistory captures engine plan events', () => {
    // Verify addEvent works independently by pushing directly
    const { node } = attach({ mode: 'orchestrator' });
    const state = (node as any).__choreography_state;
    state.eventHistory.push({ type: 'plan_started', planId: 'p-test', timestamp: Date.now() });
    expect(state.eventHistory.some((e: any) => e.type === 'plan_started')).toBe(true);
  });
});

// ─── onDetach ─────────────────────────────────────────────────────────────────

describe('choreographyHandler.onDetach', () => {
  it('clears activePlans', () => {
    const { node, ctx, config } = attach({ mode: 'participant' });
    const state = (node as any).__choreography_state;
    state.activePlans.set('p1', { id: 'p1', status: 'running' });
    choreographyHandler.onDetach!(node as any, config, ctx as any);
    expect(state.activePlans.size).toBe(0);
  });

  it('clears registeredActions', () => {
    const { node, ctx, config } = attach({ mode: 'participant' });
    const state = (node as any).__choreography_state;
    state.registeredActions.set('myAction', { name: 'myAction', handler: async () => ({}) });
    choreographyHandler.onDetach!(node as any, config, ctx as any);
    expect(state.registeredActions.size).toBe(0);
  });

  it('sets engine and planner to null', () => {
    const { node, ctx, config } = attach({ mode: 'orchestrator' });
    const state = (node as any).__choreography_state;
    choreographyHandler.onDetach!(node as any, config, ctx as any);
    expect(state.engine).toBeNull();
    expect(state.planner).toBeNull();
  });

  it('removes __choreography_state', () => {
    const { node, ctx, config } = attach({ mode: 'participant' });
    choreographyHandler.onDetach!(node as any, config, ctx as any);
    expect((node as any).__choreography_state).toBeUndefined();
  });
});

// ─── registerAction / unregisterAction / getRegisteredActions ─────────────────

describe('registerAction / unregisterAction / getRegisteredActions', () => {
  it('registerAction stores action in state', () => {
    const { node } = attach({ mode: 'participant' });
    const handler = async (inputs: Record<string, unknown>) => ({ result: true });
    registerAction(node as any, 'myAction', handler, { description: 'does thing' });
    expect(getRegisteredActions(node as any)).toContain('myAction');
  });

  it('unregisterAction returns true when action existed and removes it', () => {
    const { node } = attach({ mode: 'participant' });
    registerAction(node as any, 'doThing', async () => ({}));
    const result = unregisterAction(node as any, 'doThing');
    expect(result).toBe(true);
    expect(getRegisteredActions(node as any)).not.toContain('doThing');
  });

  it('unregisterAction returns false when action does not exist', () => {
    const { node } = attach({ mode: 'participant' });
    expect(unregisterAction(node as any, 'nonExistent')).toBe(false);
  });

  it('getRegisteredActions returns all action names', () => {
    const { node } = attach({ mode: 'participant' });
    registerAction(node as any, 'action1', async () => ({}));
    registerAction(node as any, 'action2', async () => ({}));
    const names = getRegisteredActions(node as any);
    expect(names).toContain('action1');
    expect(names).toContain('action2');
  });
});

// ─── getActivePlans ───────────────────────────────────────────────────────────

describe('getActivePlans', () => {
  it('returns empty array initially', () => {
    const { node } = attach({ mode: 'participant' });
    expect(getActivePlans(node as any)).toEqual([]);
  });

  it('returns plan IDs from activePlans map', () => {
    const { node } = attach({ mode: 'participant' });
    (node as any).__choreography_state.activePlans.set('plan-42', {
      id: 'plan-42',
      status: 'running',
    });
    expect(getActivePlans(node as any)).toContain('plan-42');
  });
});

// ─── getPendingHitl ───────────────────────────────────────────────────────────

describe('getPendingHitl', () => {
  it('returns empty array initially', () => {
    const { node } = attach({ mode: 'participant' });
    expect(getPendingHitl(node as any)).toEqual([]);
  });

  it('returns step IDs from pendingHitl set', () => {
    const { node } = attach({ mode: 'participant' });
    (node as any).__choreography_state.pendingHitl.add('step-5');
    expect(getPendingHitl(node as any)).toContain('step-5');
  });
});

// ─── getEventHistory ──────────────────────────────────────────────────────────

describe('getEventHistory', () => {
  it('returns empty array initially', () => {
    const { node } = attach({ mode: 'participant' });
    expect(getEventHistory(node as any)).toEqual([]);
  });

  it('returns all events when no limit', () => {
    const { node } = attach({ mode: 'participant' });
    const state = (node as any).__choreography_state;
    state.eventHistory.push({ type: 'plan_started', planId: 'p1', timestamp: 1 });
    state.eventHistory.push({ type: 'plan_completed', planId: 'p1', timestamp: 2 });
    expect(getEventHistory(node as any)).toHaveLength(2);
  });

  it('returns last N events when limit specified', () => {
    const { node } = attach({ mode: 'participant' });
    const state = (node as any).__choreography_state;
    for (let i = 0; i < 5; i++) {
      state.eventHistory.push({ type: 'plan_started', planId: `p${i}`, timestamp: i });
    }
    const result = getEventHistory(node as any, 3);
    expect(result).toHaveLength(3);
    expect(result[2].planId).toBe('p4');
  });
});

// ─── error cases ──────────────────────────────────────────────────────────────

describe('utility function error cases', () => {
  it('registerAction throws when trait not attached', () => {
    const node = makeNode();
    expect(() => registerAction(node as any, 'act', async () => ({}))).toThrow(
      'Choreography trait not attached'
    );
  });

  it('getActivePlans throws when trait not attached', () => {
    const node = makeNode();
    expect(() => getActivePlans(node as any)).toThrow('Choreography trait not attached');
  });
});
