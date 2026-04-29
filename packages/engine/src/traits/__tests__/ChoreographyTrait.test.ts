import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createMockNode, createMockContext, attachTrait } from './traitTestHelpers';

// Mock choreography barrel import used by ChoreographyTrait
vi.mock('@holoscript/engine/choreography', () => ({
  ChoreographyEngine: class MockChoreographyEngine {
    constructor() {}
    setActionHandler = vi.fn();
    on = vi.fn();
    execute = vi.fn().mockResolvedValue({ planId: 'p1', status: 'completed' });
    cancel = vi.fn().mockResolvedValue(undefined);
    pause = vi.fn().mockResolvedValue(undefined);
    resume = vi.fn().mockResolvedValue(undefined);
    approveHitl = vi.fn();
    rejectHitl = vi.fn();
  },
  ChoreographyPlanner: class MockChoreographyPlanner {
    createPlan = vi.fn((opts: any) => ({
      id: 'plan-1',
      goal: opts.goal,
      steps: opts.steps || [],
      status: 'pending',
    }));
  },
  PlanBuilder: class {},
  plan: vi.fn((goal: string) => ({ goal, steps: [] })),
}));

import {
  choreographyHandler,
  registerAction,
  unregisterAction,
  getRegisteredActions,
  getActivePlans,
  getPendingHitl,
  getEventHistory,
} from '../ChoreographyTrait';

describe('ChoreographyTrait', () => {
  let node: Record<string, unknown>;
  let ctx: ReturnType<typeof createMockContext>;
  const cfg = {
    mode: 'orchestrator' as const,
    auto_start: true,
    max_concurrent_plans: 4,
    default_step_timeout: 30000,
    event_history_limit: 100,
    hitl_auto_pause: true,
    execute_fallback: true,
    verbose: false,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    node = createMockNode('choreographer');
    ctx = createMockContext();
    attachTrait(choreographyHandler, node, cfg, ctx);
  });

  it('initializes state with engine for orchestrator mode', () => {
    const s = (node as any).__choreography_state;
    expect(s).toBeDefined();
    expect(s.mode).toBe('orchestrator');
    expect(s.engine).not.toBeNull();
    expect(s.planner).not.toBeNull();
  });

  it('does not create engine in participant mode', () => {
    const pNode = createMockNode('participant');
    attachTrait(choreographyHandler, pNode, { ...cfg, mode: 'participant' as const }, ctx);
    const s = (pNode as any).__choreography_state;
    expect(s.engine).toBeNull();
  });

  it('sets up action handler on engine for orchestrator', () => {
    const s = (node as any).__choreography_state;
    expect(s.engine.setActionHandler).toHaveBeenCalled();
  });

  it('subscribes to engine events for orchestrator', () => {
    const s = (node as any).__choreography_state;
    expect(s.engine.on).toHaveBeenCalledWith('plan:started', expect.any(Function));
    expect(s.engine.on).toHaveBeenCalledWith('plan:completed', expect.any(Function));
    expect(s.engine.on).toHaveBeenCalledWith('hitl:required', expect.any(Function));
  });

  it('cleans up on detach', () => {
    choreographyHandler.onDetach?.(node as any, cfg as any, ctx as any);
    expect((node as any).__choreography_state).toBeUndefined();
  });

  it('registers and retrieves actions', () => {
    const handler = vi.fn().mockResolvedValue({ result: 'ok' });
    registerAction(node as any, 'doSomething', handler, { description: 'test action' });
    const actions = getRegisteredActions(node as any);
    expect(actions).toContain('doSomething');
  });

  it('unregisters actions', () => {
    const handler = vi.fn().mockResolvedValue({});
    registerAction(node as any, 'tempAction', handler);
    expect(unregisterAction(node as any, 'tempAction')).toBe(true);
    expect(getRegisteredActions(node as any)).not.toContain('tempAction');
  });

  it('returns empty active plans initially', () => {
    expect(getActivePlans(node as any)).toEqual([]);
  });

  it('returns empty pending HITL initially', () => {
    expect(getPendingHitl(node as any)).toEqual([]);
  });

  it('returns empty event history initially', () => {
    expect(getEventHistory(node as any)).toEqual([]);
  });

  it('has correct handler name', () => {
    expect(choreographyHandler.name).toBe('choreography');
  });
});
