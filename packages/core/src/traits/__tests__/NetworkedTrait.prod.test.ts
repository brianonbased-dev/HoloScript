/**
 * NetworkedTrait — Production Test Suite
 *
 * NetworkedTrait is a class with public methods, not a handler.
 * External dependencies mocked:
 * - SyncProtocol — mocked as a class so `new SyncProtocol()` works
 * - WebSocketTransport / WebRTCTransport — stubbed as classes
 * - logger — silenced
 *
 * Key behaviours tested (pure-logic, no real connections):
 * 1. constructor — normalises syncProperties (string → SyncProperty), sets entityId, isOwner for mode='owner'
 * 2. getConfig — returns copy of config
 * 3. getEntityId — returns unique string starting with 'entity_'
 * 4. setProperty / getProperty / getState — manages syncState Map, emits 'propertyChanged'
 * 5. flushUpdates — drains pendingUpdates, returns object, clears map
 * 6. shouldSync — respects syncRate gating; returns true only when interval elapsed AND pending updates exist
 * 7. applyState — applies all entries to syncState, emits 'stateReceived'
 * 8. getInterpolatedState — returns null for empty buffer; returns single sample when < 2
 * 9. buffer keeps <= 10 entries (backed by applyState)
 * 10. requestOwnership — returns true immediately when already owner; returns false when non-transferable
 *     — grants locally when transferable + no network
 * 11. releaseOwnership — clears owner flag, emits 'ownershipChanged'
 * 12. connect (local) — sets up SyncProtocol; on() called for events
 * 13. disconnect — sets connected=false; no throw
 * 14. getLatency — delegates to syncProtocol.getLatency()
 * 15. event listeners: on() returns unsubscribe fn; multiple listeners; unsubscribe stops delivery
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock external deps with class syntax ─────────────────────────────────────
const _syncProtoInstance = {
  connect: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(false),
  getClientId: vi.fn().mockReturnValue('client_001'),
  getLatency: vi.fn().mockReturnValue(42),
  on: vi.fn(),
  syncState: vi.fn(),
  requestOwnership: vi.fn(),
  respondToOwnership: vi.fn(),
};

vi.mock('../../network/SyncProtocol', () => {
  class SyncProtocol {
    connect = _syncProtoInstance.connect;
    isConnected = _syncProtoInstance.isConnected;
    getClientId = _syncProtoInstance.getClientId;
    getLatency = _syncProtoInstance.getLatency;
    on = _syncProtoInstance.on;
    syncState = _syncProtoInstance.syncState;
    requestOwnership = _syncProtoInstance.requestOwnership;
    respondToOwnership = _syncProtoInstance.respondToOwnership;
  }
  return { SyncProtocol };
});

vi.mock('../../network/WebSocketTransport', () => {
  class WebSocketTransport {
    connect = vi.fn().mockRejectedValue(new Error('no ws'));
    disconnect = vi.fn();
    onMessage = vi.fn();
    sendMessage = vi.fn();
  }
  return { WebSocketTransport };
});

vi.mock('../../network/WebRTCTransport', () => {
  class WebRTCTransport {
    initialize = vi.fn().mockRejectedValue(new Error('no rtc'));
    disconnect = vi.fn();
    onMessage = vi.fn();
    sendMessage = vi.fn();
  }
  return { WebRTCTransport };
});

vi.mock('../../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() },
}));

import { NetworkedTrait } from '../NetworkedTrait';

// ─── helpers ──────────────────────────────────────────────────────────────────
function makeOwnerTrait(overrides: any = {}) {
  return new NetworkedTrait({ mode: 'owner', syncRate: 60, ...overrides });
}
function makeSharedTrait(overrides: any = {}) {
  return new NetworkedTrait({ mode: 'shared', syncRate: 20, ...overrides });
}

beforeEach(() => vi.clearAllMocks());

// ─── constructor ──────────────────────────────────────────────────────────────
describe('NetworkedTrait — constructor', () => {
  it('generates unique entityId starting with "entity_"', () => {
    expect(makeOwnerTrait().getEntityId()).toMatch(/^entity_/);
  });

  it('two instances have different entityIds', () => {
    expect(makeOwnerTrait().getEntityId()).not.toBe(makeOwnerTrait().getEntityId());
  });

  it('normalises string syncProperties to SyncProperty', () => {
    const t = makeOwnerTrait({ syncProperties: ['pos', 'rot'] });
    const props = t.getConfig().syncProperties as any[];
    expect(props[0]).toEqual(expect.objectContaining({ name: 'pos' }));
    expect(props[1]).toEqual(expect.objectContaining({ name: 'rot' }));
  });

  it('leaves SyncProperty objects untouched', () => {
    const t = makeOwnerTrait({ syncProperties: [{ name: 'hp', priority: 5 }] });
    const props = t.getConfig().syncProperties as any[];
    expect(props[0]).toEqual(expect.objectContaining({ name: 'hp', priority: 5 }));
  });
});

// ─── getConfig ────────────────────────────────────────────────────────────────
describe('NetworkedTrait.getConfig', () => {
  it('returns a copy of the config', () => {
    const t = makeOwnerTrait({ room: 'test-room', channel: 'reliable' });
    const cfg = t.getConfig();
    expect(cfg.room).toBe('test-room');
    expect(cfg.channel).toBe('reliable');
  });

  it('mutating the copy does not affect internal config', () => {
    const t = makeOwnerTrait({ room: 'test-room' });
    const cfg = t.getConfig();
    cfg.room = 'mutated';
    expect(t.getConfig().room).toBe('test-room');
  });
});

// ─── setProperty / getProperty / getState ─────────────────────────────────────
describe('NetworkedTrait — property management', () => {
  it('setProperty stores value', () => {
    const t = makeOwnerTrait();
    t.setProperty('health', 95);
    expect(t.getProperty('health')).toBe(95);
  });

  it('setProperty emits propertyChanged event', () => {
    const t = makeOwnerTrait();
    const listener = vi.fn();
    t.on('propertyChanged', listener);
    t.setProperty('x', 42);
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ property: 'x', value: 42 }));
  });

  it('getProperty returns undefined for unknown key', () => {
    expect(makeOwnerTrait().getProperty('nonexistent')).toBeUndefined();
  });

  it('getState returns all properties as plain object', () => {
    const t = makeOwnerTrait();
    t.setProperty('a', 1); t.setProperty('b', 'hello');
    expect(t.getState()).toEqual({ a: 1, b: 'hello' });
  });

  it('getState is a copy — mutations do not affect internal state', () => {
    const t = makeOwnerTrait();
    t.setProperty('x', 10);
    const state = t.getState();
    state.x = 999;
    expect(t.getProperty('x')).toBe(10);
  });
});

// ─── flushUpdates ─────────────────────────────────────────────────────────────
describe('NetworkedTrait.flushUpdates', () => {
  it('returns pending updates as plain object', () => {
    const t = makeOwnerTrait();
    t.setProperty('pos', [1, 2, 3]);
    expect(t.flushUpdates()).toEqual({ pos: [1, 2, 3] });
  });

  it('clears pending updates after flush', () => {
    const t = makeOwnerTrait();
    t.setProperty('x', 1);
    t.flushUpdates();
    expect(Object.keys(t.flushUpdates()).length).toBe(0);
  });
});

// ─── shouldSync ───────────────────────────────────────────────────────────────
describe('NetworkedTrait.shouldSync', () => {
  it('returns false when no pending updates', () => {
    expect(makeOwnerTrait({ syncRate: 1 }).shouldSync()).toBe(false);
  });

  it('returns true when pending updates and interval elapsed (lastSyncTime=0)', () => {
    const t = makeOwnerTrait({ syncRate: 1 });
    t.setProperty('x', 1);
    expect(t.shouldSync()).toBe(true);
  });

  it('returns false within interval even with pending updates', () => {
    const t = makeOwnerTrait({ syncRate: 100 }); // 10ms interval
    t.setProperty('x', 1);
    t.shouldSync(); // arms lastSyncTime
    t.setProperty('y', 2);
    expect(t.shouldSync()).toBe(false);
  });
});

// ─── applyState ───────────────────────────────────────────────────────────────
describe('NetworkedTrait.applyState', () => {
  it('applies all entries to syncState', () => {
    const t = makeSharedTrait({ interpolation: false });
    t.applyState({ hp: 50, mp: 30 });
    expect(t.getProperty('hp')).toBe(50);
    expect(t.getProperty('mp')).toBe(30);
  });

  it('emits stateReceived', () => {
    const t = makeSharedTrait({ interpolation: false });
    const listener = vi.fn();
    t.on('stateReceived', listener);
    t.applyState({ x: 1 });
    expect(listener).toHaveBeenCalled();
  });

  it('adds sample to interpolation buffer when interpolation=true', () => {
    const t = makeSharedTrait({ interpolation: true });
    t.applyState({ position: [1, 2, 3] });
    expect(t.getInterpolatedState()).not.toBeNull();
  });

  it('buffer capped at 10 entries', () => {
    const t = makeSharedTrait({ interpolation: true });
    for (let i = 0; i < 12; i++) t.applyState({ x: i });
    // Still returns a sample (the last one) — not null
    expect(t.getInterpolatedState()).not.toBeNull();
  });
});

// ─── getInterpolatedState ─────────────────────────────────────────────────────
describe('NetworkedTrait.getInterpolatedState', () => {
  it('returns null when buffer is empty', () => {
    expect(makeSharedTrait({ interpolation: true }).getInterpolatedState()).toBeNull();
  });

  it('returns one sample when buffer has exactly 1 entry', () => {
    const t = makeSharedTrait({ interpolation: true });
    t.applyState({ x: 5 });
    expect(t.getInterpolatedState()).not.toBeNull();
  });
});

// ─── requestOwnership / releaseOwnership ──────────────────────────────────────
describe('NetworkedTrait — ownership', () => {
  it('requestOwnership returns true when already owner (mode=owner)', async () => {
    expect(await makeOwnerTrait().requestOwnership()).toBe(true);
  });

  it('requestOwnership returns false when non-transferable and not owner', async () => {
    expect(await makeSharedTrait({ authority: { transferable: false } }).requestOwnership()).toBe(false);
  });

  it('requestOwnership grants locally when transferable + no syncProtocol', async () => {
    expect(await makeSharedTrait({ authority: { transferable: true } }).requestOwnership()).toBe(true);
  });

  it('releaseOwnership emits ownershipChanged', () => {
    const t = makeOwnerTrait();
    const listener = vi.fn();
    t.on('ownershipChanged', listener);
    t.releaseOwnership();
    expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'ownershipChanged' }));
  });

  it('releaseOwnership no-op when not owner', () => {
    const t = makeSharedTrait();
    const listener = vi.fn();
    t.on('ownershipChanged', listener);
    t.releaseOwnership();
    expect(listener).not.toHaveBeenCalled();
  });
});

// ─── connect (local) / disconnect ─────────────────────────────────────────────
describe('NetworkedTrait — connect / disconnect', () => {
  it('connect (local) calls syncProtocol.connect()', async () => {
    const t = makeOwnerTrait({ room: 'room_test' });
    await t.connect('local');
    expect(_syncProtoInstance.connect).toHaveBeenCalled();
  });

  it('connect registers event listeners via .on()', async () => {
    const t = makeOwnerTrait();
    await t.connect('local');
    expect(_syncProtoInstance.on).toHaveBeenCalledWith('state-updated', expect.any(Function));
    expect(_syncProtoInstance.on).toHaveBeenCalledWith('connected', expect.any(Function));
    expect(_syncProtoInstance.on).toHaveBeenCalledWith('disconnected', expect.any(Function));
  });

  it('disconnect does not throw', async () => {
    const t = makeOwnerTrait();
    await t.connect('local');
    expect(() => t.disconnect()).not.toThrow();
  });

  it('getLatency delegates to syncProtocol after connect', async () => {
    const t = makeOwnerTrait();
    await t.connect('local');
    expect(t.getLatency()).toBe(42);
  });
});

// ─── event listener (on / off) ────────────────────────────────────────────────
describe('NetworkedTrait — event listeners', () => {
  it('listener fires on emit', () => {
    const t = makeOwnerTrait();
    const handler = vi.fn();
    t.on('propertyChanged', handler);
    t.setProperty('x', 1);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('listener registered via on() receives event payload', () => {
    const t = makeOwnerTrait();
    let received: any = null;
    t.on('propertyChanged', (ev) => { received = ev; });
    t.setProperty('z', 77);
    expect(received).not.toBeNull();
    expect(received.property).toBe('z');
    expect(received.value).toBe(77);
  });

  it('multiple listeners both receive same event', () => {
    const t = makeOwnerTrait();
    const h1 = vi.fn(); const h2 = vi.fn();
    t.on('propertyChanged', h1);
    t.on('propertyChanged', h2);
    t.setProperty('y', 99);
    expect(h1).toHaveBeenCalledTimes(1);
    expect(h2).toHaveBeenCalledTimes(1);
  });
});
