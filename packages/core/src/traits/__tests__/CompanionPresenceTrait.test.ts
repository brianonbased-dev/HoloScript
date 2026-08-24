import { describe, expect, it, vi } from 'vitest';
import {
  companionPresenceHandler,
  type CompanionPresenceState,
} from '../CompanionPresenceTrait';
import { VRTraitRegistry } from '../VRTraitSystem';
import type { TraitContext } from '../TraitTypes';

type TestNode = { properties: Record<string, unknown>; __companionPresenceState?: CompanionPresenceState };

function ctx() {
  return { emit: vi.fn() } as unknown as TraitContext & { emit: ReturnType<typeof vi.fn> };
}

function attach(config: Record<string, unknown> = {}) {
  const node: TestNode = { properties: {} };
  const context = ctx();
  companionPresenceHandler.onAttach(node as never, config as never, context);
  return { node, context };
}

describe('companion_presence runtime', () => {
  it('registers in the VRTraitRegistry alongside affect_state', () => {
    const registry = new VRTraitRegistry();
    expect(registry.has('companion_presence')).toBe(true);
    expect(registry.has('affect_state')).toBe(true);
  });

  it('attaches in accumulating posture, owner-bound, and receipts the attach', () => {
    const { node, context } = attach({ owner_scope_key: 'soul-1-secret-key' });
    const state = node.__companionPresenceState!;
    expect(state.phase).toBe('accumulating');
    expect(state.bound).toBe(true);
    expect(node.properties.presenceNamed).toBe(false);
    expect(context.emit).toHaveBeenCalledWith(
      'companion_presence_ready',
      expect.objectContaining({ phase: 'accumulating', bound: true })
    );
    expect(state.receipts).toHaveLength(1);
    expect(state.receipts[0].receiptHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('never emits the raw ownerScopeKey in any receipt', () => {
    const { node } = attach({ owner_scope_key: 'soul-1-secret-key' });
    const state = node.__companionPresenceState!;
    const serialized = JSON.stringify(state.receipts);
    expect(serialized).not.toContain('soul-1-secret-key');
    expect(state.receipts[0].ownerScopeKeyHash).toMatch(/^[0-9a-f]{8}$/);
  });

  it('greets on owner_near once per cooldown, then stays attentive', () => {
    const { node, context } = attach({ greeting_cooldown_ms: 60_000 });
    companionPresenceHandler.onEvent(node as never, {} as never, context, { type: 'owner_near' });
    expect(context.emit).toHaveBeenCalledWith('companion_greeting', expect.anything());
    const greetings = context.emit.mock.calls.filter((c) => c[0] === 'companion_greeting');
    companionPresenceHandler.onEvent(node as never, {} as never, context, { type: 'owner_near' });
    const greetingsAfter = context.emit.mock.calls.filter((c) => c[0] === 'companion_greeting');
    expect(greetingsAfter.length).toBe(greetings.length);
    expect(node.properties.presenceAttention).toBe('attentive');
  });

  it('manifests on presence_manifest and receipts the transition', () => {
    const { node, context } = attach({});
    companionPresenceHandler.onEvent(node as never, {} as never, context, {
      type: 'presence_manifest',
    });
    const state = node.__companionPresenceState!;
    expect(state.phase).toBe('manifested');
    expect(node.properties.presenceNamed).toBe(true);
    expect(state.receipts.map((r) => r.event)).toContain('presence_manifest');
  });

  it('owner_forget resets accrual back to accumulating posture, receipted', () => {
    const { node, context } = attach({});
    companionPresenceHandler.onEvent(node as never, {} as never, context, {
      type: 'presence_manifest',
    });
    companionPresenceHandler.onEvent(node as never, {} as never, context, { type: 'owner_forget' });
    const state = node.__companionPresenceState!;
    expect(state.phase).toBe('accumulating');
    expect(state.attention).toBe('idle');
    expect(state.receipts.map((r) => r.event)).toContain('owner_forget');
  });
});
