/**
 * event-system.test.ts — unit tests for the 5-stage event dispatch system.
 *
 * Exercises: onEvent, offEvent, emit (5 stages), forwardToTraits,
 * triggerUIEvent.  Logger is mocked so stage-4 error logging can be
 * verified without side-effects.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  onEvent,
  offEvent,
  emit,
  forwardToTraits,
  triggerUIEvent,
} from '../event-system.js';
import type { EventSystemContext } from '../event-system.js';
import type {
  AgentRuntime,
  EventHandler,
  HoloScriptValue,
  TraitHandler,
  UIElementState,
  VRTraitName,
} from '../../types.js';

vi.mock('../../logger.js', () => ({
  logger: {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  },
}));

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<EventSystemContext> = {}): EventSystemContext {
  return {
    eventHandlers: new Map(),
    agentRuntimes: new Map(),
    variables: new Map(),
    traitHandlers: new Map(),
    uiElements: new Map(),
    getCurrentScale: vi.fn(() => 1),
    globalBusEmit: vi.fn(async () => {}),
    sendStateMachineEvent: vi.fn(),
    ...overrides,
  };
}

function makeAgent(): AgentRuntime {
  return {
    onEvent: vi.fn(async () => {}),
  } as unknown as AgentRuntime;
}

// ─── onEvent ─────────────────────────────────────────────────────────────────

describe('onEvent', () => {
  it('registers a handler for an event', () => {
    const ctx = makeCtx();
    const handler: EventHandler = vi.fn(async () => {});
    onEvent('click', handler, ctx);
    expect(ctx.eventHandlers.get('click')).toContain(handler);
  });

  it('appends multiple handlers for the same event', () => {
    const ctx = makeCtx();
    const h1: EventHandler = vi.fn(async () => {});
    const h2: EventHandler = vi.fn(async () => {});
    onEvent('click', h1, ctx);
    onEvent('click', h2, ctx);
    const handlers = ctx.eventHandlers.get('click');
    expect(handlers).toHaveLength(2);
    expect(handlers).toContain(h1);
    expect(handlers).toContain(h2);
  });

  it('registers handlers for different events independently', () => {
    const ctx = makeCtx();
    const h1: EventHandler = vi.fn(async () => {});
    const h2: EventHandler = vi.fn(async () => {});
    onEvent('click', h1, ctx);
    onEvent('hover', h2, ctx);
    expect(ctx.eventHandlers.get('click')).toContain(h1);
    expect(ctx.eventHandlers.get('hover')).toContain(h2);
  });
});

// ─── offEvent ────────────────────────────────────────────────────────────────

describe('offEvent', () => {
  it('removes a specific handler', () => {
    const ctx = makeCtx();
    const h1: EventHandler = vi.fn(async () => {});
    const h2: EventHandler = vi.fn(async () => {});
    onEvent('click', h1, ctx);
    onEvent('click', h2, ctx);
    offEvent('click', h1, ctx);
    const handlers = ctx.eventHandlers.get('click');
    expect(handlers).not.toContain(h1);
    expect(handlers).toContain(h2);
  });

  it('removes all handlers when no handler arg given', () => {
    const ctx = makeCtx();
    const h1: EventHandler = vi.fn(async () => {});
    const h2: EventHandler = vi.fn(async () => {});
    onEvent('click', h1, ctx);
    onEvent('click', h2, ctx);
    offEvent('click', undefined, ctx);
    expect(ctx.eventHandlers.has('click')).toBe(false);
  });

  it('does nothing for a non-existent event', () => {
    const ctx = makeCtx();
    expect(() => offEvent('unknown', undefined, ctx)).not.toThrow();
  });
});

// ─── emit – stage 1: dotted routing ──────────────────────────────────────────

describe('emit – stage 1: dotted routing', () => {
  it('routes to the agent named in the prefix', async () => {
    const ctx = makeCtx();
    const agent = makeAgent();
    ctx.agentRuntimes.set('myAgent', agent);
    await emit('myAgent.click', { msg: 'hello' }, ctx);
    expect(agent.onEvent).toHaveBeenCalledWith('click', { msg: 'hello' });
  });

  it('forwards to orb traits when target is an orb variable', async () => {
    const ctx = makeCtx();
    const handler = {
      onEvent: vi.fn(async () => {}),
    } as unknown as TraitHandler<Record<string, unknown>>;
    ctx.traitHandlers.set('testTrait' as VRTraitName, handler);
    const orb = {
      __type: 'orb',
      directives: [{ type: 'trait', name: 'testTrait', config: {} }],
    };
    ctx.variables.set('myOrb', orb as unknown as HoloScriptValue);
    await emit('myOrb.grab', {}, ctx);
    expect(handler.onEvent).toHaveBeenCalled();
  });

  it('does not call agent.onEvent when event has no dot', async () => {
    const ctx = makeCtx();
    const agent = makeAgent();
    ctx.agentRuntimes.set('myAgent', agent);
    // Agents still receive broadcast (stage 2), but not via stage 1 routing
    await emit('simpleEvent', {}, ctx);
    // stage 2 broadcast will still call it once
    expect(agent.onEvent).toHaveBeenCalledTimes(1);
    // stage 1 would have been a second call — verify count is exactly 1
  });
});

// ─── emit – stage 2: agent broadcast ─────────────────────────────────────────

describe('emit – stage 2: agent broadcast', () => {
  it('broadcasts to all registered agent runtimes', async () => {
    const ctx = makeCtx();
    const agent1 = makeAgent();
    const agent2 = makeAgent();
    ctx.agentRuntimes.set('a1', agent1);
    ctx.agentRuntimes.set('a2', agent2);
    await emit('testEvent', {}, ctx);
    expect(agent1.onEvent).toHaveBeenCalledWith('testEvent', {});
    expect(agent2.onEvent).toHaveBeenCalledWith('testEvent', {});
  });
});

// ─── emit – stage 3: orb broadcast ───────────────────────────────────────────

describe('emit – stage 3: orb broadcast', () => {
  it('forwards event to all orb trait handlers', async () => {
    const ctx = makeCtx();
    const handler = {
      onEvent: vi.fn(async () => {}),
    } as unknown as TraitHandler<Record<string, unknown>>;
    ctx.traitHandlers.set('grabTrait' as VRTraitName, handler);
    const orb = {
      __type: 'orb',
      directives: [{ type: 'trait', name: 'grabTrait', config: {} }],
    };
    ctx.variables.set('orb1', orb as unknown as HoloScriptValue);
    await emit('grab', {}, ctx);
    expect(handler.onEvent).toHaveBeenCalled();
  });

  it('skips non-orb variables in broadcast', async () => {
    const ctx = makeCtx();
    const handler = {
      onEvent: vi.fn(async () => {}),
    } as unknown as TraitHandler<Record<string, unknown>>;
    ctx.traitHandlers.set('t' as VRTraitName, handler);
    ctx.variables.set('notAnOrb', { __type: 'string', value: 'foo' } as unknown as HoloScriptValue);
    await emit('grab', {}, ctx);
    expect(handler.onEvent).not.toHaveBeenCalled();
  });
});

// ─── emit – stage 4: local handlers ──────────────────────────────────────────

describe('emit – stage 4: local handlers', () => {
  it('calls registered event handlers with the data', async () => {
    const ctx = makeCtx();
    const handler: EventHandler = vi.fn(async () => {});
    onEvent('click', handler, ctx);
    await emit('click', { x: 1 }, ctx);
    expect(handler).toHaveBeenCalledWith({ x: 1 });
  });

  it('calls multiple handlers for the same event', async () => {
    const ctx = makeCtx();
    const h1: EventHandler = vi.fn(async () => {});
    const h2: EventHandler = vi.fn(async () => {});
    onEvent('click', h1, ctx);
    onEvent('click', h2, ctx);
    await emit('click', {}, ctx);
    expect(h1).toHaveBeenCalled();
    expect(h2).toHaveBeenCalled();
  });

  it('continues dispatch even if one handler throws', async () => {
    const { logger } = await import('../../logger.js');
    const ctx = makeCtx();
    const h1: EventHandler = vi.fn(async () => { throw new Error('boom'); });
    const h2: EventHandler = vi.fn(async () => {});
    onEvent('click', h1, ctx);
    onEvent('click', h2, ctx);
    await expect(emit('click', {}, ctx)).resolves.not.toThrow();
    expect(h2).toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });
});

// ─── emit – stage 5: global bus + state machine ──────────────────────────────

describe('emit – stage 5: global bus and state machine', () => {
  it('always calls globalBusEmit', async () => {
    const ctx = makeCtx();
    await emit('anyEvent', {}, ctx);
    expect(ctx.globalBusEmit).toHaveBeenCalledWith('anyEvent', {});
  });

  it('calls sendStateMachineEvent when data has an id', async () => {
    const ctx = makeCtx();
    await emit('transition', { id: 'sm1' }, ctx);
    expect(ctx.sendStateMachineEvent).toHaveBeenCalledWith('sm1', 'transition');
  });

  it('does not call sendStateMachineEvent when data has no id', async () => {
    const ctx = makeCtx();
    await emit('transition', { value: 42 }, ctx);
    expect(ctx.sendStateMachineEvent).not.toHaveBeenCalled();
  });

  it('does not call sendStateMachineEvent when data is null', async () => {
    const ctx = makeCtx();
    await emit('event', null, ctx);
    expect(ctx.sendStateMachineEvent).not.toHaveBeenCalled();
  });
});

// ─── forwardToTraits ──────────────────────────────────────────────────────────

describe('forwardToTraits', () => {
  it('returns without error for an orb with no directives', async () => {
    const ctx = makeCtx();
    await expect(forwardToTraits({}, 'click', {}, ctx)).resolves.not.toThrow();
  });

  it('skips non-trait directives', async () => {
    const ctx = makeCtx();
    const handler = {
      onEvent: vi.fn(async () => {}),
    } as unknown as TraitHandler<Record<string, unknown>>;
    ctx.traitHandlers.set('myTrait' as VRTraitName, handler);
    const orb = {
      directives: [{ type: 'physics', name: 'myTrait' }],
    };
    await forwardToTraits(orb, 'click', {}, ctx);
    expect(handler.onEvent).not.toHaveBeenCalled();
  });

  it('calls onEvent on matching trait handler', async () => {
    const ctx = makeCtx();
    const handler = {
      onEvent: vi.fn(async () => {}),
    } as unknown as TraitHandler<Record<string, unknown>>;
    ctx.traitHandlers.set('grabTrait' as VRTraitName, handler);
    const orb = {
      directives: [{ type: 'trait', name: 'grabTrait', config: { threshold: 5 } }],
    };
    await forwardToTraits(orb, 'grab', { force: 1 }, ctx);
    expect(handler.onEvent).toHaveBeenCalled();
  });

  it('skips trait with no registered handler', async () => {
    const ctx = makeCtx();
    const orb = {
      directives: [{ type: 'trait', name: 'unknownTrait', config: {} }],
    };
    await expect(forwardToTraits(orb, 'click', {}, ctx)).resolves.not.toThrow();
  });

  it('skips trait handler that has no onEvent method', async () => {
    const ctx = makeCtx();
    ctx.traitHandlers.set('noEventTrait' as VRTraitName, {} as TraitHandler<Record<string, unknown>>);
    const orb = {
      directives: [{ type: 'trait', name: 'noEventTrait', config: {} }],
    };
    await expect(forwardToTraits(orb, 'click', {}, ctx)).resolves.not.toThrow();
  });
});

// ─── triggerUIEvent ───────────────────────────────────────────────────────────

describe('triggerUIEvent', () => {
  it('warns when the element is not found', async () => {
    const { logger } = await import('../../logger.js');
    const ctx = makeCtx();
    await triggerUIEvent('unknownEl', 'click', {}, ctx);
    expect(logger.warn).toHaveBeenCalledWith('UI element not found', { elementName: 'unknownEl' });
  });

  it('does not emit when the element is not found', async () => {
    const ctx = makeCtx();
    await triggerUIEvent('unknownEl', 'click', {}, ctx);
    expect(ctx.globalBusEmit).not.toHaveBeenCalled();
  });

  it('updates element.value on a change event with defined data', async () => {
    const ctx = makeCtx();
    const el: UIElementState = { value: 'old' as HoloScriptValue } as UIElementState;
    ctx.uiElements.set('input1', el);
    await triggerUIEvent('input1', 'change', 'newValue', ctx);
    expect(el.value).toBe('newValue');
  });

  it('does not update element.value when eventType is not change', async () => {
    const ctx = makeCtx();
    const el: UIElementState = { value: 'old' as HoloScriptValue } as UIElementState;
    ctx.uiElements.set('btn1', el);
    await triggerUIEvent('btn1', 'click', 'newValue', ctx);
    expect(el.value).toBe('old');
  });

  it('emits a dotted element.eventType event', async () => {
    const ctx = makeCtx();
    ctx.uiElements.set('input1', { value: '' as HoloScriptValue } as UIElementState);
    const handler: EventHandler = vi.fn(async () => {});
    onEvent('input1.change', handler, ctx);
    await triggerUIEvent('input1', 'change', 'hello', ctx);
    expect(handler).toHaveBeenCalled();
  });
});
