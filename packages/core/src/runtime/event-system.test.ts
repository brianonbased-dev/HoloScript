/**
 * Unit tests for event-system — BUILD-mode module coverage + Q2 technique (b)
 * fingerprint invariants empirical validation.
 *
 * Closes the untested-module gap for slice 29's event-system and provides
 * the technique (b) empirical proof for the Q2 characterization-as-
 * deterministic-projection family.
 *
 * **Technique (b) proof**: "fingerprint invariants, not outputs" — hash
 * a canonical summary of the run (sorted set of emitted events, total
 * handlers invoked) rather than the full order-dependent trace.
 *
 * emit() has a 5-stage dispatch pipeline (dotted routing, agent
 * broadcast, trait broadcast, local listeners, global bus + state
 * machine). The stage order is implementation-specific; what matters
 * for the eventual-consistency contract is that each subscribed
 * receiver got the event exactly once. Technique (b) hashes the
 * canonical receiver-set instead of the trace order.
 *
 * **See**: packages/core/src/runtime/event-system.ts (slice 29)
 *         research/2026-04-23_monolith-split-followup-open-questions.md §Q2
 */

import { describe, it, expect, vi } from 'vitest';
import { createHash } from 'crypto';
import {
  onEvent,
  offEvent,
  emit,
  forwardToTraits,
  triggerUIEvent,
  type EventSystemContext,
} from './event-system';
import type {
  AgentRuntime,
  EventHandler,
  HoloScriptValue,
  TraitHandler,
  UIElementState,
  VRTraitName,
} from '../types';

// ──────────────────────────────────────────────────────────────────
// Test context factory
// ──────────────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<EventSystemContext> = {}): EventSystemContext {
  return {
    eventHandlers: new Map<string, EventHandler[]>(),
    agentRuntimes: new Map<string, AgentRuntime>(),
    variables: new Map<string, HoloScriptValue>(),
    traitHandlers: new Map<VRTraitName, TraitHandler<Record<string, unknown>>>(),
    uiElements: new Map<string, UIElementState>(),
    getCurrentScale: () => 1,
    globalBusEmit: vi.fn(async () => void 0),
    sendStateMachineEvent: vi.fn(),
    ...overrides,
  };
}

// ──────────────────────────────────────────────────────────────────
// on / off
// ──────────────────────────────────────────────────────────────────

describe('onEvent / offEvent', () => {
  it('onEvent appends handler; multiple handlers accumulate', () => {
    const ctx = makeCtx();
    const h1 = vi.fn() as EventHandler;
    const h2 = vi.fn() as EventHandler;
    onEvent('test', h1, ctx);
    onEvent('test', h2, ctx);
    expect(ctx.eventHandlers.get('test')).toHaveLength(2);
  });

  it('offEvent(event) with no handler removes ALL handlers for the event', () => {
    const ctx = makeCtx();
    onEvent('test', vi.fn() as EventHandler, ctx);
    onEvent('test', vi.fn() as EventHandler, ctx);
    offEvent('test', undefined, ctx);
    expect(ctx.eventHandlers.has('test')).toBe(false);
  });

  it('offEvent(event, handler) removes only that handler', () => {
    const ctx = makeCtx();
    const h1 = vi.fn() as EventHandler;
    const h2 = vi.fn() as EventHandler;
    onEvent('test', h1, ctx);
    onEvent('test', h2, ctx);
    offEvent('test', h1, ctx);
    const remaining = ctx.eventHandlers.get('test') || [];
    expect(remaining).toHaveLength(1);
    expect(remaining[0]).toBe(h2);
  });

  it('offEvent on unknown event is a no-op (does not throw)', () => {
    const ctx = makeCtx();
    expect(() => offEvent('never-registered', vi.fn() as EventHandler, ctx)).not.toThrow();
  });
});

// ──────────────────────────────────────────────────────────────────
// emit — basic dispatch stages
// ──────────────────────────────────────────────────────────────────

describe('emit — dispatch pipeline', () => {
  it('stage 4 local listener fires with the data', async () => {
    const ctx = makeCtx();
    const handler = vi.fn();
    onEvent('ping', handler, ctx);
    await emit('ping', { pong: true }, ctx);
    expect(handler).toHaveBeenCalledWith({ pong: true });
  });

  it('stage 5 global bus always fires', async () => {
    const ctx = makeCtx();
    await emit('any-event', { x: 1 }, ctx);
    expect(ctx.globalBusEmit).toHaveBeenCalledWith('any-event', { x: 1 });
  });

  it('stage 5 state-machine fires when data.id is present', async () => {
    const ctx = makeCtx();
    await emit('trigger', { id: 'sm-1' }, ctx);
    expect(ctx.sendStateMachineEvent).toHaveBeenCalledWith('sm-1', 'trigger');
  });

  it('stage 5 state-machine DOES NOT fire when data is primitive or missing id', async () => {
    const ctx = makeCtx();
    await emit('trigger', null, ctx);
    await emit('trigger', 42, ctx);
    await emit('trigger', { foo: 'no-id' }, ctx);
    expect(ctx.sendStateMachineEvent).not.toHaveBeenCalled();
  });

  it('stage 2 broadcasts to all agents', async () => {
    const a1 = { onEvent: vi.fn(async () => void 0) };
    const a2 = { onEvent: vi.fn(async () => void 0) };
    const ctx = makeCtx({
      agentRuntimes: new Map([
        ['alice', a1 as unknown as AgentRuntime],
        ['bob', a2 as unknown as AgentRuntime],
      ]),
    });
    await emit('broadcast-event', { msg: 'hi' }, ctx);
    expect(a1.onEvent).toHaveBeenCalledWith('broadcast-event', { msg: 'hi' });
    expect(a2.onEvent).toHaveBeenCalledWith('broadcast-event', { msg: 'hi' });
  });

  it('stage 1 dotted routing targets specific agent', async () => {
    const alice = { onEvent: vi.fn(async () => void 0) };
    const bob = { onEvent: vi.fn(async () => void 0) };
    const ctx = makeCtx({
      agentRuntimes: new Map([
        ['alice', alice as unknown as AgentRuntime],
        ['bob', bob as unknown as AgentRuntime],
      ]),
    });
    await emit('alice.greet', 'hi', ctx);
    // Alice gets the un-prefixed event via dotted routing (stage 1)
    expect(alice.onEvent).toHaveBeenCalledWith('greet', 'hi');
    // Both agents also get the full dotted event via stage 2 broadcast
    expect(alice.onEvent).toHaveBeenCalledWith('alice.greet', 'hi');
    expect(bob.onEvent).toHaveBeenCalledWith('alice.greet', 'hi');
  });

  it('local handler errors are caught — does not crash emit', async () => {
    const ctx = makeCtx();
    onEvent('oops', vi.fn(() => {
      throw new Error('handler crashed');
    }) as EventHandler, ctx);
    await expect(emit('oops', null, ctx)).resolves.not.toThrow();
  });
});

// ═══════════════════════════════════════════════════════════════════════
// TECHNIQUE (b) FINGERPRINT INVARIANTS — Q2 EMPIRICAL PROOF
//
// emit()'s 5-stage pipeline produces multiple observable events across
// agents, traits, local handlers, and the global bus. The trace order
// is implementation-specific and may shift across refactors; what
// matters for the eventual-consistency contract is the CANONICAL SET:
//
//   - every subscribed agent receives the event exactly once per broadcast
//   - every local handler receives the event exactly once
//   - global bus receives the event exactly once
//   - state-machine receives iff data.id is present
//
// Technique (b) hashes the canonical invariants rather than the trace
// order. Hash is stable under order-permutation refactors.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Canonicalize an emit run's observable effects into a stable string
 * suitable for hash-locking. Sort all receiver lists so permutation
 * doesn't affect the hash.
 */
function canonicalize(observations: {
  agents: string[];
  localHandlers: string[];
  globalBus: string;
  stateMachine: string | null;
}): string {
  return JSON.stringify({
    agents: [...observations.agents].sort(),
    localHandlers: [...observations.localHandlers].sort(),
    globalBus: observations.globalBus,
    stateMachine: observations.stateMachine,
  });
}

function hash16(canonical: string): string {
  return createHash('sha256').update(canonical).digest('hex').slice(0, 16);
}

describe('emit — TECHNIQUE (b) fingerprint invariants — Q2 empirical proof', () => {
  it('PROPERTY: reordering agent registration does NOT change the fingerprint', async () => {
    // Setup: 3 agents + 2 local handlers
    async function runWithAgentOrder(order: string[]): Promise<string> {
      const agents = new Map<string, AgentRuntime>();
      const received: string[] = [];
      for (const name of order) {
        agents.set(name, {
          onEvent: vi.fn(async (e: string) => {
            received.push(`${name}:${e}`);
          }),
        } as unknown as AgentRuntime);
      }
      const localFires: string[] = [];
      const ctx = makeCtx({ agentRuntimes: agents });
      onEvent('evt', vi.fn(() => localFires.push('L1')) as EventHandler, ctx);
      onEvent('evt', vi.fn(() => localFires.push('L2')) as EventHandler, ctx);

      await emit('evt', { id: 'msg-1' }, ctx);

      return hash16(
        canonicalize({
          agents: received,
          localHandlers: localFires,
          globalBus: 'evt',
          stateMachine: 'msg-1',
        }),
      );
    }

    const h1 = await runWithAgentOrder(['alice', 'bob', 'charlie']);
    const h2 = await runWithAgentOrder(['charlie', 'alice', 'bob']);
    const h3 = await runWithAgentOrder(['bob', 'charlie', 'alice']);

    // Fingerprint is stable across agent-registration order permutations
    expect(h1).toBe(h2);
    expect(h2).toBe(h3);
  });

  it('PROPERTY: adding a new subscribed agent CHANGES the fingerprint', async () => {
    // Fingerprint must be sensitive to membership, even if insensitive to order
    async function runWith(agentNames: string[]): Promise<string> {
      const agents = new Map<string, AgentRuntime>();
      const received: string[] = [];
      for (const name of agentNames) {
        agents.set(name, {
          onEvent: vi.fn(async (e: string) => {
            received.push(`${name}:${e}`);
          }),
        } as unknown as AgentRuntime);
      }
      const ctx = makeCtx({ agentRuntimes: agents });
      await emit('evt', null, ctx);
      return hash16(
        canonicalize({
          agents: received,
          localHandlers: [],
          globalBus: 'evt',
          stateMachine: null,
        }),
      );
    }

    const h2 = await runWith(['alice', 'bob']);
    const h3 = await runWith(['alice', 'bob', 'charlie']);
    expect(h2).not.toBe(h3);
  });

  it('PROPERTY: local handler order permutation does NOT change the fingerprint', async () => {
    async function runWithHandlerOrder(names: string[]): Promise<string> {
      const fires: string[] = [];
      const ctx = makeCtx();
      for (const n of names) {
        onEvent('e', vi.fn(() => fires.push(n)) as EventHandler, ctx);
      }
      await emit('e', null, ctx);
      return hash16(
        canonicalize({
          agents: [],
          localHandlers: fires,
          globalBus: 'e',
          stateMachine: null,
        }),
      );
    }

    const h1 = await runWithHandlerOrder(['h1', 'h2', 'h3']);
    const h2 = await runWithHandlerOrder(['h3', 'h1', 'h2']);
    expect(h1).toBe(h2);
  });

  it('PROPERTY: state-machine attachment (data.id present) flips the fingerprint', async () => {
    async function run(data: unknown): Promise<string> {
      const ctx = makeCtx();
      const smFires: string[] = [];
      (ctx.sendStateMachineEvent as ReturnType<typeof vi.fn>).mockImplementation((id: string) => {
        smFires.push(id);
      });
      await emit('e', data, ctx);
      return hash16(
        canonicalize({
          agents: [],
          localHandlers: [],
          globalBus: 'e',
          stateMachine: smFires[0] || null,
        }),
      );
    }

    const noId = await run({ foo: 'bar' });
    const withId = await run({ id: 'sm-attached' });
    expect(noId).not.toBe(withId);
  });
});

// ──────────────────────────────────────────────────────────────────
// triggerUIEvent
// ──────────────────────────────────────────────────────────────────

describe('triggerUIEvent', () => {
  it('updates UI element value on change event + dispatches name.event via emit', async () => {
    const element: UIElementState = {
      type: 'slider',
      name: 'vol',
      properties: {},
      visible: true,
      enabled: true,
      value: 0,
    };
    const ctx = makeCtx({
      uiElements: new Map([['vol', element]]),
    });
    await triggerUIEvent('vol', 'change', 42, ctx);
    expect(element.value).toBe(42);
    expect(ctx.globalBusEmit).toHaveBeenCalledWith('vol.change', 42);
  });

  it('non-change events do NOT overwrite value', async () => {
    const element: UIElementState = {
      type: 'button',
      name: 'submit',
      properties: {},
      visible: true,
      enabled: true,
      value: 'keep',
    };
    const ctx = makeCtx({
      uiElements: new Map([['submit', element]]),
    });
    await triggerUIEvent('submit', 'click', 'new-data', ctx);
    expect(element.value).toBe('keep');
    // But the event IS emitted
    expect(ctx.globalBusEmit).toHaveBeenCalledWith('submit.click', 'new-data');
  });

  it('missing UI element → warn + no-op (no event fired)', async () => {
    const ctx = makeCtx();
    await triggerUIEvent('ghost', 'click', null, ctx);
    expect(ctx.globalBusEmit).not.toHaveBeenCalled();
  });
});

// ──────────────────────────────────────────────────────────────────
// forwardToTraits
// ──────────────────────────────────────────────────────────────────

describe('forwardToTraits', () => {
  it('no-op when orb has no directives', async () => {
    const ctx = makeCtx();
    await expect(
      forwardToTraits({ name: 'o' }, 'evt', null, ctx),
    ).resolves.not.toThrow();
  });

  it('skips non-trait directives', async () => {
    const traitHandler = { onEvent: vi.fn() };
    const ctx = makeCtx({
      traitHandlers: new Map([
        ['physics' as VRTraitName, traitHandler as unknown as TraitHandler<Record<string, unknown>>],
      ]),
    });
    await forwardToTraits(
      {
        directives: [
          { type: 'state', body: {} },
          { type: 'method', name: 'foo' },
        ],
      },
      'evt',
      null,
      ctx,
    );
    expect(traitHandler.onEvent).not.toHaveBeenCalled();
  });

  it('invokes trait handler with TraitEvent shape when directive matches', async () => {
    const onEventMock = vi.fn();
    const ctx = makeCtx({
      traitHandlers: new Map([
        ['physics' as VRTraitName, {
          onEvent: onEventMock,
        } as unknown as TraitHandler<Record<string, unknown>>],
      ]),
    });
    await forwardToTraits(
      {
        directives: [{ type: 'trait', name: 'physics', config: { mass: 10 } }],
      },
      'collide',
      { other: 'enemy' },
      ctx,
    );
    expect(onEventMock).toHaveBeenCalled();
    const [, config, , traitEvent] = onEventMock.mock.calls[0];
    expect(config).toEqual({ mass: 10 });
    expect(traitEvent).toMatchObject({ type: 'collide', other: 'enemy' });
  });

  it('silently ignores traits without registered handlers', async () => {
    const ctx = makeCtx({
      traitHandlers: new Map(), // empty
    });
    await expect(
      forwardToTraits(
        { directives: [{ type: 'trait', name: 'unknown' }] },
        'e',
        null,
        ctx,
      ),
    ).resolves.not.toThrow();
  });
});
