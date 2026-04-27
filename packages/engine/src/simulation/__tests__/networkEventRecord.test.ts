import { describe, it, expect } from 'vitest';
import {
  NETWORK_EVENT_V1,
  buildNetworkEventV1Record,
  canonicalNetworkEventSnapshot,
  networkEventWireKey,
  wireFormatEquivalentNetworkEvent,
  type NetworkEvent,
  type NetworkEventWireInput,
} from '../networkEventRecord';

function event(over: Partial<NetworkEvent> = {}): NetworkEvent {
  return {
    type: 'presence.join',
    actor: 'claude1',
    chainDepth: 0,
    payload: { surface: 'claude-code' },
    ...over,
  };
}

function feed(over: Partial<NetworkEventWireInput> = {}): NetworkEventWireInput {
  return {
    feedId: 'feed-team-7',
    events: [
      event({ chainDepth: 0, type: 'presence.join', actor: 'claude1', payload: { surface: 'claude-code' } }),
      event({ chainDepth: 1, type: 'board.claim', actor: 'claude1', payload: { taskId: 't-1' } }),
    ],
    ...over,
  };
}

describe('networkEventRecord (network.event.v1 — fifth instance of time-binding solverType family)', () => {
  it('NETWORK_EVENT_V1 is the documented solverType token', () => {
    expect(NETWORK_EVENT_V1).toBe('network.event.v1');
  });

  it('wireFormatEquivalentNetworkEvent is true for identical feeds', () => {
    expect(wireFormatEquivalentNetworkEvent(feed(), feed())).toBe(true);
  });

  it('canonical-snapshot is chainDepth-ordered regardless of input order', () => {
    const sortedFirst = feed();
    const reversedInput = feed({
      events: [
        event({ chainDepth: 1, type: 'board.claim', actor: 'claude1', payload: { taskId: 't-1' } }),
        event({ chainDepth: 0, type: 'presence.join', actor: 'claude1', payload: { surface: 'claude-code' } }),
      ],
    });
    expect(wireFormatEquivalentNetworkEvent(sortedFirst, reversedInput)).toBe(true);
  });

  it('canonical-snapshot preserves parentHash and meta', () => {
    const f = feed({
      events: [
        event({ chainDepth: 0 }),
        event({ chainDepth: 1, type: 'mode.switch', payload: { from: 'audit', to: 'build' }, parentHash: 'h0', meta: { reason: 'auto' } }),
      ],
    });
    const snap = canonicalNetworkEventSnapshot(f) as { events: Array<Record<string, unknown>> };
    expect(snap.events[1].parentHash).toBe('h0');
    expect(snap.events[1].meta).toEqual({ reason: 'auto' });
  });

  it('different payload at same chainDepth → different wire key', () => {
    const a = feed();
    const b = feed({
      events: [
        event({ chainDepth: 0, payload: { surface: 'cursor' } }),
        event({ chainDepth: 1, type: 'board.claim', actor: 'claude1', payload: { taskId: 't-1' } }),
      ],
    });
    expect(wireFormatEquivalentNetworkEvent(a, b)).toBe(false);
  });

  it('different feedId → different wire key (each feed is its own block universe)', () => {
    const a = feed({ feedId: 'feed-team-7' });
    const b = feed({ feedId: 'feed-team-other' });
    expect(wireFormatEquivalentNetworkEvent(a, b)).toBe(false);
  });

  it('different parentHash (branch geometry) → different wire key', () => {
    const a = feed({
      events: [
        event({ chainDepth: 0 }),
        event({ chainDepth: 1, type: 'board.claim', payload: { taskId: 't-1' }, parentHash: 'h0' }),
      ],
    });
    const b = feed({
      events: [
        event({ chainDepth: 0 }),
        event({ chainDepth: 1, type: 'board.claim', payload: { taskId: 't-1' }, parentHash: 'h-other' }),
      ],
    });
    expect(wireFormatEquivalentNetworkEvent(a, b)).toBe(false);
  });

  it('multi-actor feed at same chainDepth: deterministic ordering by (type, actor)', () => {
    const f = feed({
      feedId: 'busy-feed',
      events: [
        event({ chainDepth: 0, type: 'presence.join', actor: 'gemini1', payload: {} }),
        event({ chainDepth: 0, type: 'board.claim', actor: 'claude1', payload: { taskId: 't-1' } }),
        event({ chainDepth: 0, type: 'presence.join', actor: 'claude1', payload: {} }),
      ],
    });
    const snap = canonicalNetworkEventSnapshot(f) as { events: Array<{ type: string; actor: string }> };
    // Sorted by type ASC, then actor ASC at same chainDepth
    expect(snap.events[0]).toMatchObject({ type: 'board.claim', actor: 'claude1' });
    expect(snap.events[1]).toMatchObject({ type: 'presence.join', actor: 'claude1' });
    expect(snap.events[2]).toMatchObject({ type: 'presence.join', actor: 'gemini1' });
  });

  it('throws on duplicate (chainDepth, type, actor) — W.087-class identity collision', () => {
    const malformed: NetworkEventWireInput = {
      feedId: 'feed-malformed',
      events: [
        event({ chainDepth: 5, type: 'board.claim', actor: 'claude1', payload: { taskId: 'a' } }),
        event({ chainDepth: 5, type: 'board.claim', actor: 'claude1', payload: { taskId: 'b' } }),
      ],
    };
    expect(() => canonicalNetworkEventSnapshot(malformed)).toThrow(/duplicate.*chainDepth=5/);
    expect(() => networkEventWireKey(malformed)).toThrow();
  });

  it('buildNetworkEventV1Record exposes solverType, specVersion, wireKey, eventCount, label', () => {
    const f = feed();
    const rec = buildNetworkEventV1Record(f, { label: 'standup-feed' });
    expect(rec.solverType).toBe('network.event.v1');
    expect(rec.specVersion).toBe(1);
    expect(rec.feedId).toBe('feed-team-7');
    expect(rec.eventCount).toBe(2);
    expect(rec.wireKey).toBe(networkEventWireKey(f));
    expect(rec.label).toBe('standup-feed');
  });

  it('buildNetworkEventV1Record omits label when not provided', () => {
    const rec = buildNetworkEventV1Record(feed());
    expect('label' in rec).toBe(false);
  });

  it('observer-restart simulation: same canonical content is wire-equivalent across instance churn (W.111)', () => {
    const fromObserverA = feed({
      events: [
        event({ chainDepth: 0, type: 'mode.switch', payload: { from: 'audit', to: 'build' } }),
        event({ chainDepth: 1, type: 'knowledge.sync', payload: { entries: 3 }, parentHash: 'h0' }),
      ],
    });
    const fromObserverB_after_restart = feed({
      events: [
        event({ chainDepth: 0, type: 'mode.switch', payload: { from: 'audit', to: 'build' } }),
        event({ chainDepth: 1, type: 'knowledge.sync', payload: { entries: 3 }, parentHash: 'h0' }),
      ],
    });
    expect(wireFormatEquivalentNetworkEvent(fromObserverA, fromObserverB_after_restart)).toBe(true);
  });

  it('full team-feed event-class coverage compiles and canonicalizes', () => {
    const f = feed({
      feedId: 'feed-full',
      events: [
        event({ chainDepth: 0, type: 'presence.join', actor: 'claude1', payload: {} }),
        event({ chainDepth: 1, type: 'mode.switch', actor: 'claude1', payload: { to: 'build' } }),
        event({ chainDepth: 2, type: 'board.claim', actor: 'claude1', payload: { taskId: 't' } }),
        event({ chainDepth: 3, type: 'knowledge.sync', actor: 'claude1', payload: { entries: 1 } }),
        event({ chainDepth: 4, type: 'suggestion.vote', actor: 'gemini1', payload: { dir: 'up' } }),
        event({ chainDepth: 5, type: 'board.done', actor: 'claude1', payload: { taskId: 't', commit: 'abc' } }),
      ],
    });
    const rec = buildNetworkEventV1Record(f);
    expect(rec.eventCount).toBe(6);
    expect(rec.wireKey.length).toBeGreaterThan(50); // non-trivial key
  });
});
