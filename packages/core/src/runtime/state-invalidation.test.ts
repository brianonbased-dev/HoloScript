/**
 * Tests for the state-invalidation registry — the `persistent_expired` consumer.
 *
 * Failing-if-broken contract (the gap this closes): before this wiring, a
 * PersistentTrait TTL expiry emitted `persistent_expired` into the void. These
 * tests assert a consumer now OBSERVES that expiry. The decisive assertions:
 *   - a key that expired through the real trait+event-system chain IS recorded;
 *   - a key that did NOT expire is NOT recorded (no false invalidation).
 * Both fail against the pre-wiring code where nothing listens.
 *
 * **See**: packages/core/src/runtime/state-invalidation.ts, board task
 *          task_1779744793932_tfmr.
 */

import { describe, it, expect, vi } from 'vitest';
import { emit, type EventSystemContext } from './event-system';
import {
  StateInvalidationRegistry,
  attachStateInvalidationConsumer,
  makeStateInvalidationHandler,
} from './state-invalidation';
import { persistentHandler } from '../traits/PersistentTrait';
import type {
  AgentRuntime,
  EventHandler,
  HoloScriptValue,
  TraitHandler,
  UIElementState,
  VRTraitName,
} from '../types';
import type { TraitContext } from '../traits/TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

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

/** A TraitContext whose emit threads back through the event-system, mirroring
 *  the real runtime's forwardToTraits binding. */
function traitCtxFor(ctx: EventSystemContext): TraitContext {
  return {
    emit: async (e: string, p: HoloScriptValue) => await emit(e, p, ctx),
    getScaleMultiplier: () => ctx.getCurrentScale() || 1,
  } as unknown as TraitContext;
}

let keySeq = 0;
const uniqueKey = (label: string) => `inval-test-${label}-${Date.now()}-${keySeq++}`;

describe('StateInvalidationRegistry', () => {
  it('records, queries, and read-and-clears via consume()', () => {
    const reg = new StateInvalidationRegistry();
    expect(reg.wasInvalidated('k')).toBe(false);
    reg.record('k', 'orb-9');
    expect(reg.wasInvalidated('k')).toBe(true);
    expect(reg.get('k')?.nodeId).toBe('orb-9');
    const rec = reg.consume('k');
    expect(rec?.key).toBe('k');
    // consume acknowledges → no longer outstanding
    expect(reg.wasInvalidated('k')).toBe(false);
  });

  it('ignores empty/invalid keys', () => {
    const reg = new StateInvalidationRegistry();
    reg.record('');
    expect(reg.size).toBe(0);
  });
});

describe('makeStateInvalidationHandler', () => {
  it('records key + nodeId from a persistent_expired payload', () => {
    const reg = new StateInvalidationRegistry();
    const handler = makeStateInvalidationHandler(reg);
    handler({ key: 'kx', node: { id: 'n1' } } as unknown as HoloScriptValue);
    expect(reg.wasInvalidated('kx')).toBe(true);
    expect(reg.get('kx')?.nodeId).toBe('n1');
  });

  it('is a no-op when the payload carries no key', () => {
    const reg = new StateInvalidationRegistry();
    const handler = makeStateInvalidationHandler(reg);
    handler({ node: { id: 'n1' } } as unknown as HoloScriptValue);
    expect(reg.size).toBe(0);
  });
});

describe('attachStateInvalidationConsumer (event-system integration)', () => {
  it('catches a persistent_expired emitted directly through emit(ctx)', async () => {
    const ctx = makeCtx();
    const reg = attachStateInvalidationConsumer(ctx, new StateInvalidationRegistry());
    await emit('persistent_expired', { key: 'direct-k', node: { id: 'orb-1' } } as unknown as HoloScriptValue, ctx);
    expect(reg.wasInvalidated('direct-k')).toBe(true);
    expect(reg.get('direct-k')?.nodeId).toBe('orb-1');
  });
});

describe('PersistentTrait expiry → registry (real end-to-end wire)', () => {
  it('FAILING-IF-BROKEN: an expired persistent key is observed by the consumer', async () => {
    vi.useFakeTimers();
    try {
      const ctx = makeCtx();
      const reg = attachStateInvalidationConsumer(ctx, new StateInvalidationRegistry());
      const traitCtx = traitCtxFor(ctx);

      const key = uniqueKey('expired');
      const node = { id: 'orb-expired' } as unknown as HSPlusNode;
      const config = { key, defaultValue: 'seed', ttlMs: 1000, backend: 'memory' as const };

      persistentHandler.onAttach!(node, config, traitCtx);
      expect(reg.wasInvalidated(key)).toBe(false); // not expired yet

      // Advance past the TTL, then tick the trait.
      vi.setSystemTime(Date.now() + 5000);
      await persistentHandler.onUpdate!(node, config, traitCtx, 16);

      // The decisive assertion: expiry was no longer silent.
      expect(reg.wasInvalidated(key)).toBe(true);
      expect(reg.get(key)?.nodeId).toBe('orb-expired');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does NOT invalidate a key whose TTL has not elapsed (no false positive)', async () => {
    vi.useFakeTimers();
    try {
      const ctx = makeCtx();
      const reg = attachStateInvalidationConsumer(ctx, new StateInvalidationRegistry());
      const traitCtx = traitCtxFor(ctx);

      const key = uniqueKey('live');
      const node = { id: 'orb-live' } as unknown as HSPlusNode;
      const config = { key, defaultValue: 'seed', ttlMs: 1_000_000, backend: 'memory' as const };

      persistentHandler.onAttach!(node, config, traitCtx);
      vi.setSystemTime(Date.now() + 1000); // well within the TTL
      await persistentHandler.onUpdate!(node, config, traitCtx, 16);

      expect(reg.wasInvalidated(key)).toBe(false);
    } finally {
      vi.useRealTimers();
    }
  });
});
