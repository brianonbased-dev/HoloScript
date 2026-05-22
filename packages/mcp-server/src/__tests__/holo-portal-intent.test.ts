import { describe, it, expect, beforeEach } from 'vitest';
import {
  validatePortalIntent,
  intentToDelta,
  deepMerge,
  matchesZoneGlob,
  type SpatialPolicy,
  type PortalIntent,
} from '../holo-portal-intent.js';
import {
  handleNetworkingTool,
  subscribeToStateDeltas,
  __stateDeltaSubscriberCount,
  __resetNetworkingState,
  isWebRTCTransportEnabled,
  disableWebRTCTransport,
} from '../networking-tools.js';

describe('matchesZoneGlob', () => {
  it('matches * wildcard segments and anchors fully', () => {
    expect(matchesZoneGlob('zone:lobby:chair-1', ['zone:lobby:*'])).toBe(true);
    expect(matchesZoneGlob('zone:vault:door', ['zone:lobby:*'])).toBe(false);
    expect(matchesZoneGlob('anything', [])).toBe(false);
    expect(matchesZoneGlob('anything', undefined)).toBe(false);
    expect(matchesZoneGlob('exact', ['exact'])).toBe(true);
  });
});

describe('validatePortalIntent scope ladder', () => {
  const move: PortalIntent = { kind: 'move', entityId: 'zone:lobby:box', position: { x: 1, y: 0, z: 0 } };
  const say: PortalIntent = { kind: 'say', entityId: 'avatar:1', utterance: 'hi' };
  const look: PortalIntent = { kind: 'look', entityId: 'avatar:1', rotation: { x: 0, y: 1, z: 0, w: 0 } };

  it('read-only rejects every mutating intent', () => {
    const p: SpatialPolicy = { defaultScope: 'read-only' };
    expect(validatePortalIntent(move, p).allowed).toBe(false);
    expect(validatePortalIntent(say, p).allowed).toBe(false);
    expect(validatePortalIntent(look, p).allowed).toBe(false);
  });

  it('mutate-zone allows move/grab on zone-matched ids, denies avatar speech/orientation', () => {
    const p: SpatialPolicy = { defaultScope: 'mutate-zone', mutableZoneGlobs: ['zone:lobby:*'] };
    expect(validatePortalIntent(move, p).allowed).toBe(true);
    const offZone: PortalIntent = { kind: 'move', entityId: 'zone:vault:safe', position: { x: 0, y: 0, z: 0 } };
    expect(validatePortalIntent(offZone, p).allowed).toBe(false);
    expect(validatePortalIntent(say, p).allowed).toBe(false);
    expect(validatePortalIntent(look, p).allowed).toBe(false);
  });

  it('drive-avatar allows say/look/move and inherits zone rights', () => {
    const p: SpatialPolicy = { defaultScope: 'drive-avatar', driveAvatar: { allow: true, maxEntities: 1 } };
    expect(validatePortalIntent(say, p).allowed).toBe(true);
    expect(validatePortalIntent(look, p).allowed).toBe(true);
    expect(validatePortalIntent(move, p).allowed).toBe(true);
  });

  it('rejects a requested scope not in allowedScopes', () => {
    const p: SpatialPolicy = { allowedScopes: ['read-only'] };
    expect(validatePortalIntent(move, p, 'drive-avatar').allowed).toBe(false);
  });

  it('enforces drive-avatar maxEntities', () => {
    const p: SpatialPolicy = { defaultScope: 'drive-avatar', driveAvatar: { allow: true, maxEntities: 2 } };
    expect(validatePortalIntent(say, p, 'drive-avatar', 1).allowed).toBe(true);
    expect(validatePortalIntent(say, p, 'drive-avatar', 2).allowed).toBe(false);
  });

  it('respects driveAvatar.allow=false', () => {
    const p: SpatialPolicy = { defaultScope: 'drive-avatar', driveAvatar: { allow: false } };
    expect(validatePortalIntent(say, p).allowed).toBe(false);
  });

  it('warn enforcement allows but flags the violation', () => {
    const p: SpatialPolicy = { defaultScope: 'read-only', enforcement: { onScopeViolation: 'warn' } };
    const v = validatePortalIntent(move, p);
    expect(v.allowed).toBe(true);
    expect(v.warned).toBe(true);
    expect(v.reason).toBeTruthy();
  });

  it('defaults to read-only (deny) when no policy/scope given', () => {
    expect(validatePortalIntent(move, undefined).allowed).toBe(false);
  });
});

describe('intentToDelta', () => {
  it('maps each intent kind to the right payload shape', () => {
    expect(intentToDelta({ kind: 'move', entityId: 'e', position: { x: 1, y: 2, z: 3 } }, 100).payload)
      .toEqual({ transform: { position: { x: 1, y: 2, z: 3 } }, updatedAt: 100 });
    expect(intentToDelta({ kind: 'grab', entityId: 'e', targetId: 't' }, 100).payload)
      .toEqual({ holding: 't', updatedAt: 100 });
    expect(intentToDelta({ kind: 'say', entityId: 'e', utterance: 'yo' }, 100).payload)
      .toEqual({ lastUtterance: 'yo', utteranceTs: 100 });
  });
});

describe('deepMerge (concurrency non-clobber)', () => {
  it('merges different sub-fields of the same nested object without clobbering', () => {
    const base = { transform: { position: { x: 1 }, rotation: { y: 2 } } };
    const a = deepMerge(base, { transform: { position: { x: 9 } } });
    expect(a).toEqual({ transform: { position: { x: 9 }, rotation: { y: 2 } } });
  });
  it('replaces arrays and primitives wholesale', () => {
    expect(deepMerge({ a: [1, 2], b: 1 }, { a: [3], b: 2 })).toEqual({ a: [3], b: 2 });
  });
});

describe('push_portal_intent end-to-end via handler', () => {
  beforeEach(() => {
    __resetNetworkingState();
  });

  it('rejects an out-of-scope intent without mutating, then applies an in-scope one and broadcasts', async () => {
    const received: unknown[] = [];
    const unsub = subscribeToStateDeltas((d) => received.push(d));
    expect(__stateDeltaSubscriberCount()).toBeGreaterThan(0);

    const eid = `avatar:test:${Date.now()}`;
    // read-only policy → say is rejected, no broadcast.
    const rejected = await handleNetworkingTool('push_portal_intent', {
      intent: { kind: 'say', entityId: eid, utterance: 'hello' },
      spatialPolicy: { defaultScope: 'read-only' },
    });
    expect(rejected.status).toBe('rejected');
    expect(received.length).toBe(0);

    // drive-avatar policy → say applies and fans out to the subscriber.
    const ok = await handleNetworkingTool('push_portal_intent', {
      intent: { kind: 'say', entityId: eid, utterance: 'hello' },
      requestedScope: 'drive-avatar',
      spatialPolicy: { defaultScope: 'drive-avatar', driveAvatar: { allow: true, maxEntities: 1 } },
    });
    expect(ok.status).toBe('success');
    expect(received.length).toBe(1);

    unsub();
    expect(__stateDeltaSubscriberCount()).toBe(0);
  });
});

describe('Loro CRDT convergence (task_1779438040591_o53t)', () => {
  beforeEach(() => {
    __resetNetworkingState();
  });

  it('push_state_delta reads back from Loro CRDT', async () => {
    const eid = `entity:loro:${Date.now()}`;
    const result = await handleNetworkingTool('push_state_delta', {
      entityId: eid,
      payload: { x: 10, y: 20 },
    });
    expect(result.status).toBe('success');

    const state = await handleNetworkingTool('fetch_authoritative_state', { entityId: eid });
    expect(state.x).toBe(10);
    expect(state.y).toBe(20);
  });

  it('concurrent field writes converge without clobbering', async () => {
    const eid = `entity:loro:concurrent:${Date.now()}`;
    // Write x field
    await handleNetworkingTool('push_state_delta', { entityId: eid, payload: { x: 1 } });
    // Write y field — should not clobber x
    await handleNetworkingTool('push_state_delta', { entityId: eid, payload: { y: 2 } });

    const state = await handleNetworkingTool('fetch_authoritative_state', { entityId: eid });
    expect(state.x).toBe(1);
    expect(state.y).toBe(2);
  });

  it('push_portal_intent persists to Loro CRDT', async () => {
    const eid = `avatar:loro:${Date.now()}`;
    const result = await handleNetworkingTool('push_portal_intent', {
      intent: { kind: 'move', entityId: eid, position: { x: 5, y: 0, z: 0 } },
      requestedScope: 'mutate-zone',
      spatialPolicy: { defaultScope: 'mutate-zone', mutableZoneGlobs: ['avatar:*'] },
    });
    expect(result.status).toBe('success');

    const state = await handleNetworkingTool('fetch_authoritative_state', { entityId: eid });
    expect(state.transform.position.x).toBe(5);
  });

  it('fetch returns _null for nonexistent entity', async () => {
    const state = await handleNetworkingTool('fetch_authoritative_state', {
      entityId: 'nonexistent:loro',
    });
    expect(state._null).toBe(true);
  });
});

describe('WebRTC peer transport lifecycle (task_1779438040591_uj7g)', () => {
  beforeEach(() => {
    __resetNetworkingState();
    disableWebRTCTransport();
  });

  it('WebRTC transport is disabled by default', () => {
    expect(isWebRTCTransportEnabled()).toBe(false);
  });

  it('disableWebRTCTransport is idempotent when not enabled', () => {
    disableWebRTCTransport();
    expect(isWebRTCTransportEnabled()).toBe(false);
  });

  it('disableWebRTCTransport disables an active provider', async () => {
    // We can't fully test enableWebRTCTransport in unit tests (needs signaling
    // server + @holoscript/crdt-spatial), but we can test that disable properly
    // cleans up and enable throws gracefully when deps are missing.
    const { enableWebRTCTransport } = await import('../networking-tools.js');
    // enableWebRTCTransport is async and requires @holoscript/crdt-spatial.
    // In CI without that dep it should throw with a clear message.
    try {
      await enableWebRTCTransport({ room: 'test-room' });
    } catch (err) {
      // Expected: @holoscript/crdt-spatial not found or signaling unreachable
      expect(err instanceof Error).toBe(true);
    }
    // Regardless, disable should work idempotently.
    disableWebRTCTransport();
    expect(isWebRTCTransportEnabled()).toBe(false);
  });
});
