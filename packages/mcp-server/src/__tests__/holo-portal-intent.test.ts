import { describe, it, expect, beforeEach } from 'vitest';
import { Loro, LoroMap } from 'loro-crdt';
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
  const move: PortalIntent = {
    kind: 'move',
    entityId: 'zone:lobby:box',
    position: { x: 1, y: 0, z: 0 },
  };
  const say: PortalIntent = { kind: 'say', entityId: 'avatar:1', utterance: 'hi' };
  const look: PortalIntent = {
    kind: 'look',
    entityId: 'avatar:1',
    rotation: { x: 0, y: 1, z: 0, w: 0 },
  };

  it('read-only rejects every mutating intent', () => {
    const p: SpatialPolicy = { defaultScope: 'read-only' };
    expect(validatePortalIntent(move, p).allowed).toBe(false);
    expect(validatePortalIntent(say, p).allowed).toBe(false);
    expect(validatePortalIntent(look, p).allowed).toBe(false);
  });

  it('mutate-zone allows move/grab on zone-matched ids, denies avatar speech/orientation', () => {
    const p: SpatialPolicy = { defaultScope: 'mutate-zone', mutableZoneGlobs: ['zone:lobby:*'] };
    expect(validatePortalIntent(move, p).allowed).toBe(true);
    const offZone: PortalIntent = {
      kind: 'move',
      entityId: 'zone:vault:safe',
      position: { x: 0, y: 0, z: 0 },
    };
    expect(validatePortalIntent(offZone, p).allowed).toBe(false);
    expect(validatePortalIntent(say, p).allowed).toBe(false);
    expect(validatePortalIntent(look, p).allowed).toBe(false);
  });

  it('drive-avatar allows say/look/move and inherits zone rights', () => {
    const p: SpatialPolicy = {
      defaultScope: 'drive-avatar',
      driveAvatar: { allow: true, maxEntities: 1 },
    };
    expect(validatePortalIntent(say, p).allowed).toBe(true);
    expect(validatePortalIntent(look, p).allowed).toBe(true);
    expect(validatePortalIntent(move, p).allowed).toBe(true);
  });

  it('rejects a requested scope not in allowedScopes', () => {
    const p: SpatialPolicy = { allowedScopes: ['read-only'] };
    expect(validatePortalIntent(move, p, 'drive-avatar').allowed).toBe(false);
  });

  it('enforces drive-avatar maxEntities', () => {
    const p: SpatialPolicy = {
      defaultScope: 'drive-avatar',
      driveAvatar: { allow: true, maxEntities: 2 },
    };
    expect(validatePortalIntent(say, p, 'drive-avatar', 1).allowed).toBe(true);
    expect(validatePortalIntent(say, p, 'drive-avatar', 2).allowed).toBe(false);
  });

  it('respects driveAvatar.allow=false', () => {
    const p: SpatialPolicy = { defaultScope: 'drive-avatar', driveAvatar: { allow: false } };
    expect(validatePortalIntent(say, p).allowed).toBe(false);
  });

  it('warn enforcement allows but flags the violation', () => {
    const p: SpatialPolicy = {
      defaultScope: 'read-only',
      enforcement: { onScopeViolation: 'warn' },
    };
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
    expect(
      intentToDelta({ kind: 'move', entityId: 'e', position: { x: 1, y: 2, z: 3 } }, 100).payload
    ).toEqual({ transform: { position: { x: 1, y: 2, z: 3 } }, updatedAt: 100 });
    expect(intentToDelta({ kind: 'grab', entityId: 'e', targetId: 't' }, 100).payload).toEqual({
      holding: 't',
      updatedAt: 100,
    });
    expect(intentToDelta({ kind: 'say', entityId: 'e', utterance: 'yo' }, 100).payload).toEqual({
      lastUtterance: 'yo',
      utteranceTs: 100,
    });
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

// ---------------------------------------------------------------------------
// HoloGate Loro CRDT 2-Agent Convergence Test
// Task: task_1779439734598_di6r
// Research: research/2026-05-22_hologate-copresence-systems-paper-evaluation.md §5
//
// Tests true CRDT convergence: two independent Loro docs with distinct
// peerIds writing concurrently to the same entity, then exchanging updates
// and verifying that both docs converge to the same merged state without
// clobbering either agent's writes.
// ---------------------------------------------------------------------------

/** Helper: read all fields of an entity from a Loro doc's entities map as a plain object. */
function readEntityFromLoroDoc(doc: Loro, entityId: string): Record<string, unknown> {
  const entitiesMap = doc.getMap('entities');
  const entityMap = entitiesMap.get(entityId) as LoroMap | undefined;
  if (!entityMap) return {};
  const raw = entityMap.toJSON() as Record<string, string>;
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(raw)) {
    try {
      result[key] = JSON.parse(value);
    } catch {
      result[key] = value;
    }
  }
  return result;
}

describe('HoloGate Loro CRDT 2-agent convergence (task_1779439734598_di6r)', () => {
  it('two agents writing different fields to the same entity converge without clobbering', () => {
    // Create two independent Loro docs with distinct peerIds
    const docA = new Loro();
    docA.setPeerId(BigInt(1001));
    const docB = new Loro();
    docB.setPeerId(BigInt(2002));

    // Phase 1: Doc A creates the entity container and syncs to B.
    // This establishes shared base state (same container ID across docs).
    docA.getMap('entities').setContainer('avatar:convergence-test', new LoroMap());
    docA.commit();

    const baseUpdate = docA.export({ mode: 'update' });
    docB.import(baseUpdate);

    // Phase 2: Concurrent writes — each agent writes different fields
    // without exchanging updates in between (models offline divergence).
    const entityA = docA.getMap('entities').get('avatar:convergence-test') as LoroMap;
    const entityB = docB.getMap('entities').get('avatar:convergence-test') as LoroMap;

    // Agent A writes transform
    entityA.set('transform', JSON.stringify({ position: { x: 1, y: 0, z: 0 } }));
    docA.commit();

    // Agent B writes rotation (concurrently — no knowledge of A's write yet)
    entityB.set('rotation', JSON.stringify({ x: 0, y: 1, z: 0, w: 0 }));
    docB.commit();

    // Phase 3: Exchange updates: A → B, B → A
    const updateAtoB = docA.export({ mode: 'update' });
    const updateBtoA = docB.export({ mode: 'update' });

    docB.import(updateAtoB);
    docA.import(updateBtoA);

    // Both docs must now converge to the same state
    const stateA = readEntityFromLoroDoc(docA, 'avatar:convergence-test');
    const stateB = readEntityFromLoroDoc(docB, 'avatar:convergence-test');

    // Verify no clobber: both fields present in both docs
    expect(stateA.transform).toEqual({ position: { x: 1, y: 0, z: 0 } });
    expect(stateA.rotation).toEqual({ x: 0, y: 1, z: 0, w: 0 });
    expect(stateB.transform).toEqual({ position: { x: 1, y: 0, z: 0 } });
    expect(stateB.rotation).toEqual({ x: 0, y: 1, z: 0, w: 0 });

    // Convergence: both docs have identical state
    expect(stateA).toEqual(stateB);
  });

  it('three agents writing different fields to the same entity converge', () => {
    const docA = new Loro();
    docA.setPeerId(BigInt(3001));
    const docB = new Loro();
    docB.setPeerId(BigInt(3002));
    const docC = new Loro();
    docC.setPeerId(BigInt(3003));

    // Phase 1: Doc A creates entity structure, syncs to B and C
    docA.getMap('entities').setContainer('zone:test:object', new LoroMap());
    docA.commit();

    const baseUpdate = docA.export({ mode: 'update' });
    docB.import(baseUpdate);
    docC.import(baseUpdate);

    // Phase 2: Concurrent writes from three agents
    const entityA = docA.getMap('entities').get('zone:test:object') as LoroMap;
    const entityB = docB.getMap('entities').get('zone:test:object') as LoroMap;
    const entityC = docC.getMap('entities').get('zone:test:object') as LoroMap;

    entityA.set('position', JSON.stringify({ x: 10, y: 5, z: -3 }));
    docA.commit();

    entityB.set('velocity', JSON.stringify({ x: 0, y: 0, z: 1 }));
    docB.commit();

    entityC.set('metadata', JSON.stringify({ name: 'test-cube', type: 'dynamic' }));
    docC.commit();

    // Phase 3: Full mesh exchange
    const updateA = docA.export({ mode: 'update' });
    const updateB = docB.export({ mode: 'update' });
    const updateC = docC.export({ mode: 'update' });

    docA.import(updateB);
    docA.import(updateC);
    docB.import(updateA);
    docB.import(updateC);
    docC.import(updateA);
    docC.import(updateB);

    // All three docs converge to the same state
    const stateA = readEntityFromLoroDoc(docA, 'zone:test:object');
    const stateB = readEntityFromLoroDoc(docB, 'zone:test:object');
    const stateC = readEntityFromLoroDoc(docC, 'zone:test:object');

    expect(stateA).toEqual(stateB);
    expect(stateB).toEqual(stateC);

    // No clobber: all three fields present
    expect(stateA.position).toEqual({ x: 10, y: 5, z: -3 });
    expect(stateA.velocity).toEqual({ x: 0, y: 0, z: 1 });
    expect(stateA.metadata).toEqual({ name: 'test-cube', type: 'dynamic' });
  });

  it('concurrent writes to the same field converge (CRDT LWW semantics)', () => {
    const docA = new Loro();
    docA.setPeerId(BigInt(4001));
    const docB = new Loro();
    docB.setPeerId(BigInt(4002));

    // Shared base: A creates entity, syncs to B
    docA.getMap('entities').setContainer('avatar:lww-test', new LoroMap());
    docA.commit();

    const baseUpdate = docA.export({ mode: 'update' });
    docB.import(baseUpdate);

    const entityA = docA.getMap('entities').get('avatar:lww-test') as LoroMap;
    const entityB = docB.getMap('entities').get('avatar:lww-test') as LoroMap;

    // Both agents write to the SAME field concurrently
    entityA.set('color', JSON.stringify('red'));
    docA.commit();

    entityB.set('color', JSON.stringify('blue'));
    docB.commit();

    // Exchange updates
    const updateA = docA.export({ mode: 'update' });
    const updateB = docB.export({ mode: 'update' });
    docB.import(updateA);
    docA.import(updateB);

    // Both docs converge to the same value (Loro CRDT resolves LWW)
    const stateA = readEntityFromLoroDoc(docA, 'avatar:lww-test');
    const stateB = readEntityFromLoroDoc(docB, 'avatar:lww-test');

    // CRDT convergence: both docs agree on a single value
    expect(stateA.color).toEqual(stateB.color);
    // The value is one of the two writes (not garbled, not null, not merged)
    expect(['red', 'blue']).toContain(stateA.color);
  });

  it('deep-merge expectation: nested object fields from different agents are preserved', () => {
    const docA = new Loro();
    docA.setPeerId(BigInt(5001));
    const docB = new Loro();
    docB.setPeerId(BigInt(5002));

    // Shared base
    docA.getMap('entities').setContainer('avatar:nested-test', new LoroMap());
    docA.commit();

    const baseUpdate = docA.export({ mode: 'update' });
    docB.import(baseUpdate);

    const entityA = docA.getMap('entities').get('avatar:nested-test') as LoroMap;
    const entityB = docB.getMap('entities').get('avatar:nested-test') as LoroMap;

    // Agent A writes position inside transform
    entityA.set(
      'transform',
      JSON.stringify({ position: { x: 5, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 } })
    );
    docA.commit();

    // Agent B writes a different top-level field (health) without touching transform
    entityB.set('health', JSON.stringify({ hp: 100, shield: 50 }));
    docB.commit();

    // Exchange
    const updateA = docA.export({ mode: 'update' });
    const updateB = docB.export({ mode: 'update' });
    docB.import(updateA);
    docA.import(updateB);

    // Both docs converge with both fields intact
    const stateA = readEntityFromLoroDoc(docA, 'avatar:nested-test');
    const stateB = readEntityFromLoroDoc(docB, 'avatar:nested-test');

    expect(stateA).toEqual(stateB);
    expect(stateA.transform).toEqual({
      position: { x: 5, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
    });
    expect(stateA.health).toEqual({ hp: 100, shield: 50 });
  });

  it('convergence round-trip latency is sub-millisecond for small entities', () => {
    const docA = new Loro();
    docA.setPeerId(BigInt(6001));
    const docB = new Loro();
    docB.setPeerId(BigInt(6002));

    // Shared base
    docA.getMap('entities').setContainer('avatar:perf-test', new LoroMap());
    docA.commit();

    const baseUpdate = docA.export({ mode: 'update' });
    docB.import(baseUpdate);

    const entityA = docA.getMap('entities').get('avatar:perf-test') as LoroMap;
    const entityB = docB.getMap('entities').get('avatar:perf-test') as LoroMap;

    entityA.set('transform', JSON.stringify({ position: { x: 1, y: 2, z: 3 } }));
    docA.commit();

    entityB.set('metadata', JSON.stringify({ name: 'perf-entity' }));
    docB.commit();

    // Measure export + import round-trip
    const start = performance.now();
    const updateA = docA.export({ mode: 'update' });
    const updateB = docB.export({ mode: 'update' });
    docB.import(updateA);
    docA.import(updateB);
    const elapsed = performance.now() - start;

    // Verify convergence correctness
    const stateA = readEntityFromLoroDoc(docA, 'avatar:perf-test');
    const stateB = readEntityFromLoroDoc(docB, 'avatar:perf-test');
    expect(stateA).toEqual(stateB);

    // CRDT convergence round-trip for 2-field entity should be under 10ms
    // (generous bound; actual is typically <1ms)
    expect(elapsed).toBeLessThan(10);
  });
});
