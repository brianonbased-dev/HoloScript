import { describe, it, expect } from 'vitest';
import {
  signOperation,
  verifyOperation,
  LWWRegister,
  GCounter,
  ORSet,
  createAgentState,
  setRegister,
  getRegister,
  incrementCounter,
  getCounter,
  mergeStates,
  type DID,
  type SignedOperation,
} from '../AuthenticatedCRDT';

// =============================================================================
// HELPERS
// =============================================================================

function makeDID(overrides?: Partial<DID>): DID {
  return {
    id: 'did:key:z6MkTest',
    deviceId: 'device-1',
    scope: ['*'],
    revoked: false,
    ...overrides,
  };
}

function makeScopedDID(scopes: string[]): DID {
  return makeDID({ scope: scopes });
}

function makeRevokedDID(): DID {
  return makeDID({ revoked: true });
}

// =============================================================================
// SIGN & VERIFY
// =============================================================================

describe('AuthenticatedCRDT — signOperation / verifyOperation', () => {
  it('creates a signed operation with all fields', () => {
    const signer = makeDID();
    const op = signOperation('hello', signer, 'state:name', 1);
    expect(op.payload).toBe('hello');
    expect(op.signer).toBe(signer);
    expect(op.timestamp).toBe(1);
    expect(op.scopeTag).toBe('state:name');
    expect(typeof op.signature).toBe('string');
    expect(op.signature.length).toBeGreaterThan(0);
  });

  it('verifies a valid signed operation', () => {
    const signer = makeDID();
    const op = signOperation({ x: 1 }, signer, 'state:pos', 10);
    const result = verifyOperation(op);
    expect(result.valid).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('rejects a revoked signer', () => {
    const signer = makeRevokedDID();
    const op = signOperation('data', signer, 'state:x', 1);
    const result = verifyOperation(op);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Signer DID revoked');
  });

  it('rejects out-of-scope operations', () => {
    const signer = makeScopedDID(['state:name']);
    const op = signOperation('val', signer, 'state:secret', 1);
    const result = verifyOperation(op);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("lacks scope 'state:secret'");
  });

  it('wildcard scope (*) allows any scope tag', () => {
    const signer = makeDID({ scope: ['*'] });
    const op = signOperation('val', signer, 'anything:here', 1);
    expect(verifyOperation(op).valid).toBe(true);
  });

  it('rejects tampered signatures', () => {
    const signer = makeDID();
    const op = signOperation('data', signer, 'state:x', 1);
    const tampered: SignedOperation<string> = { ...op, signature: 'deadbeef' };
    const result = verifyOperation(tampered);
    expect(result.valid).toBe(false);
    expect(result.reason).toBe('Signature mismatch');
  });

  it('signature is deterministic', () => {
    const signer = makeDID();
    const op1 = signOperation('same', signer, 'tag', 5);
    const op2 = signOperation('same', signer, 'tag', 5);
    expect(op1.signature).toBe(op2.signature);
  });

  it('different payloads produce different signatures', () => {
    const signer = makeDID();
    const op1 = signOperation('alpha', signer, 'tag', 1);
    const op2 = signOperation('bravo', signer, 'tag', 1);
    expect(op1.signature).not.toBe(op2.signature);
  });
});

// =============================================================================
// LWW-REGISTER
// =============================================================================

describe('AuthenticatedCRDT — LWWRegister', () => {
  it('starts with initial value', () => {
    const reg = new LWWRegister('initial');
    expect(reg.get()).toBe('initial');
    expect(reg.getTimestamp()).toBe(0);
  });

  it('accepts a valid set operation', () => {
    const reg = new LWWRegister('old');
    const signer = makeDID();
    const op = signOperation('new', signer, 'state:val', 1);
    const result = reg.set(op);
    expect(result.accepted).toBe(true);
    expect(reg.get()).toBe('new');
    expect(reg.getTimestamp()).toBe(1);
  });

  it('rejects stale timestamps', () => {
    const reg = new LWWRegister('v0');
    const signer = makeDID();
    reg.set(signOperation('v1', signer, 'state:x', 10));
    const result = reg.set(signOperation('v2', signer, 'state:x', 5));
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('Stale timestamp');
    expect(reg.get()).toBe('v1');
  });

  it('rejects equal timestamps (not strictly greater)', () => {
    const reg = new LWWRegister('v0');
    const signer = makeDID();
    reg.set(signOperation('v1', signer, 'state:x', 10));
    const result = reg.set(signOperation('v2', signer, 'state:x', 10));
    expect(result.accepted).toBe(false);
  });

  it('rejects revoked signers', () => {
    const reg = new LWWRegister('v0');
    const signer = makeRevokedDID();
    const op = signOperation('v1', signer, 'state:x', 1);
    const result = reg.set(op);
    expect(result.accepted).toBe(false);
    expect(result.reason).toBe('Signer DID revoked');
  });

  it('tracks operation history', () => {
    const reg = new LWWRegister(0);
    const signer = makeDID();
    reg.set(signOperation(1, signer, 'state:n', 1));
    reg.set(signOperation(2, signer, 'state:n', 2));
    reg.set(signOperation(3, signer, 'state:n', 3));
    expect(reg.getHistory()).toHaveLength(3);
  });

  it('merge takes the higher-timestamp value', () => {
    const signer = makeDID();
    const regA = new LWWRegister('A');
    regA.set(signOperation('A-val', signer, 'state:x', 5));

    const regB = new LWWRegister('B');
    regB.set(signOperation('B-val', signer, 'state:x', 10));

    regA.merge(regB);
    expect(regA.get()).toBe('B-val');
  });

  it('merge does not downgrade', () => {
    const signer = makeDID();
    const regA = new LWWRegister('A');
    regA.set(signOperation('A-val', signer, 'state:x', 10));

    const regB = new LWWRegister('B');
    regB.set(signOperation('B-val', signer, 'state:x', 5));

    regA.merge(regB);
    expect(regA.get()).toBe('A-val');
  });
});

// =============================================================================
// G-COUNTER
// =============================================================================

describe('AuthenticatedCRDT — GCounter', () => {
  it('starts at zero', () => {
    const counter = new GCounter();
    expect(counter.value()).toBe(0);
  });

  it('increments by 1 by default', () => {
    const counter = new GCounter();
    counter.increment('node-a');
    expect(counter.value()).toBe(1);
    expect(counter.nodeValue('node-a')).toBe(1);
  });

  it('increments by custom amount', () => {
    const counter = new GCounter();
    counter.increment('node-a', 5);
    expect(counter.value()).toBe(5);
  });

  it('tracks per-node counts independently', () => {
    const counter = new GCounter();
    counter.increment('node-a', 3);
    counter.increment('node-b', 7);
    expect(counter.nodeValue('node-a')).toBe(3);
    expect(counter.nodeValue('node-b')).toBe(7);
    expect(counter.value()).toBe(10);
  });

  it('returns 0 for unknown nodes', () => {
    const counter = new GCounter();
    expect(counter.nodeValue('ghost')).toBe(0);
  });

  it('merge takes max per node', () => {
    const a = new GCounter();
    a.increment('x', 5);
    a.increment('y', 3);

    const b = new GCounter();
    b.increment('x', 3);
    b.increment('y', 7);
    b.increment('z', 2);

    a.merge(b);
    expect(a.nodeValue('x')).toBe(5); // max(5,3)
    expect(a.nodeValue('y')).toBe(7); // max(3,7)
    expect(a.nodeValue('z')).toBe(2); // new from b
    expect(a.value()).toBe(14);
  });

  it('merge is idempotent', () => {
    const a = new GCounter();
    a.increment('x', 5);
    const b = new GCounter();
    b.increment('x', 3);

    a.merge(b);
    const v1 = a.value();
    a.merge(b);
    expect(a.value()).toBe(v1);
  });

  it('toJSON / fromJSON round-trips', () => {
    const original = new GCounter();
    original.increment('a', 10);
    original.increment('b', 20);

    const json = original.toJSON();
    expect(json).toEqual({ a: 10, b: 20 });

    const restored = GCounter.fromJSON(json);
    expect(restored.value()).toBe(30);
    expect(restored.nodeValue('a')).toBe(10);
    expect(restored.nodeValue('b')).toBe(20);
  });
});

// =============================================================================
// OR-SET
// =============================================================================

describe('AuthenticatedCRDT — ORSet', () => {
  it('starts empty', () => {
    const set = new ORSet<string>();
    expect(set.size).toBe(0);
    expect(set.values()).toEqual([]);
  });

  it('add inserts an element', () => {
    const set = new ORSet<string>();
    const signer = makeDID();
    const tag = set.add('hello', signer, 1);
    expect(tag).toBeTruthy();
    expect(set.has('hello')).toBe(true);
    expect(set.size).toBe(1);
  });

  it('add from revoked signer is rejected', () => {
    const set = new ORSet<string>();
    const signer = makeRevokedDID();
    const tag = set.add('secret', signer, 1);
    expect(tag).toBe('');
    expect(set.has('secret')).toBe(false);
  });

  it('remove removes all copies of a value', () => {
    const set = new ORSet<string>();
    const signer = makeDID();
    set.add('x', signer, 1);
    set.add('x', signer, 2); // duplicate add
    expect(set.has('x')).toBe(true);

    const removed = set.remove('x', signer);
    expect(removed).toBe(2);
    expect(set.has('x')).toBe(false);
  });

  it('remove returns 0 for non-existent values', () => {
    const set = new ORSet<string>();
    const signer = makeDID();
    expect(set.remove('ghost', signer)).toBe(0);
  });

  it('values are deduplicated', () => {
    const set = new ORSet<number>();
    const signer = makeDID();
    set.add(42, signer, 1);
    set.add(42, signer, 2);
    set.add(42, signer, 3);
    // Internal elements are 3, but unique values is 1
    expect(set.values()).toEqual([42]);
    expect(set.size).toBe(1);
  });

  it('works with object values', () => {
    const set = new ORSet<{ id: number; name: string }>();
    const signer = makeDID();
    set.add({ id: 1, name: 'Alice' }, signer, 1);
    set.add({ id: 2, name: 'Bob' }, signer, 2);
    expect(set.size).toBe(2);
    expect(set.has({ id: 1, name: 'Alice' })).toBe(true);
    expect(set.has({ id: 3, name: 'Charlie' })).toBe(false);
  });

  it('merge: adds from other win over concurrent state', () => {
    const signerA = makeDID({ id: 'did:key:A', deviceId: 'A' });
    const signerB = makeDID({ id: 'did:key:B', deviceId: 'B' });

    const setA = new ORSet<string>();
    setA.add('shared', signerA, 1);

    const setB = new ORSet<string>();
    setB.add('only-b', signerB, 1);

    setA.merge(setB);
    expect(setA.has('shared')).toBe(true);
    expect(setA.has('only-b')).toBe(true);
  });

  it('merge: tombstones from other are applied when tags collide', () => {
    const signer = makeDID();

    const setA = new ORSet<string>();
    setA.add('doomed', signer, 1);

    // setB has same element added with same signer/timestamp, generating the same tag
    const setB = new ORSet<string>();
    setB.add('doomed', signer, 1);
    setB.remove('doomed', signer);

    // After merge, tombstone from B deletes A's element because tags collide
    // (same signer.id + same timestamp + same tagCounter start = identical tag)
    setA.merge(setB);
    expect(setA.has('doomed')).toBe(false);
  });

  it('merge: concurrent adds with different signers survive removes', () => {
    const signerA = makeDID({ id: 'did:key:A', deviceId: 'A' });
    const signerB = makeDID({ id: 'did:key:B', deviceId: 'B' });

    const setA = new ORSet<string>();
    setA.add('item', signerA, 1); // tag: did:key:A_1_0

    const setB = new ORSet<string>();
    setB.add('item', signerB, 1); // tag: did:key:B_1_0 (different!)
    setB.remove('item', signerB);

    // A's element survives because its tag differs from B's tombstone
    setA.merge(setB);
    expect(setA.has('item')).toBe(true);
  });

  it('merge: revoked signers are filtered out', () => {
    const revokedSigner = makeRevokedDID();
    const goodSigner = makeDID({ id: 'did:key:good' });

    const setA = new ORSet<string>();
    const setB = new ORSet<string>();
    setB.add('good', goodSigner, 1);
    // Can't add via revoked signer (returns '')
    setB.add('bad', revokedSigner, 2);

    setA.merge(setB);
    expect(setA.has('good')).toBe(true);
    expect(setA.has('bad')).toBe(false);
  });
});

// =============================================================================
// AUTHENTICATED AGENT STATE
// =============================================================================

describe('AuthenticatedCRDT — Agent State helpers', () => {
  it('createAgentState initializes empty state', () => {
    const state = createAgentState('did:key:z6MkAgent');
    expect(state.agentDID).toBe('did:key:z6MkAgent');
    expect(state.registers.size).toBe(0);
    expect(state.counters.size).toBe(0);
    expect(state.sets.size).toBe(0);
    expect(state.lastSync).toBe(0);
  });

  it('setRegister / getRegister round-trip', () => {
    const state = createAgentState('agent-1');
    const signer = makeDID({ scope: ['state:name'] });
    const result = setRegister(state, 'name', 'HoloBot', signer, 1);
    expect(result.accepted).toBe(true);
    expect(getRegister<string>(state, 'name')).toBe('HoloBot');
  });

  it('setRegister creates register on first use', () => {
    const state = createAgentState('agent-1');
    const signer = makeDID();
    expect(state.registers.has('new-key')).toBe(false);
    setRegister(state, 'new-key', 42, signer, 1);
    expect(state.registers.has('new-key')).toBe(true);
    expect(getRegister<number>(state, 'new-key')).toBe(42);
  });

  it('setRegister rejects stale updates', () => {
    const state = createAgentState('agent-1');
    const signer = makeDID();
    setRegister(state, 'x', 'first', signer, 10);
    const result = setRegister(state, 'x', 'second', signer, 5);
    expect(result.accepted).toBe(false);
    expect(getRegister(state, 'x')).toBe('first');
  });

  it('getRegister returns undefined for missing keys', () => {
    const state = createAgentState('agent-1');
    expect(getRegister(state, 'missing')).toBeUndefined();
  });

  it('incrementCounter / getCounter', () => {
    const state = createAgentState('agent-1');
    incrementCounter(state, 'actions', 'node-a', 3);
    incrementCounter(state, 'actions', 'node-b', 7);
    expect(getCounter(state, 'actions')).toBe(10);
  });

  it('getCounter returns 0 for missing counters', () => {
    const state = createAgentState('agent-1');
    expect(getCounter(state, 'nonexistent')).toBe(0);
  });

  it('incrementCounter creates counter on first use', () => {
    const state = createAgentState('agent-1');
    expect(state.counters.has('new-counter')).toBe(false);
    incrementCounter(state, 'new-counter', 'n', 1);
    expect(state.counters.has('new-counter')).toBe(true);
    expect(getCounter(state, 'new-counter')).toBe(1);
  });
});

// =============================================================================
// STATE MERGING
// =============================================================================

describe('AuthenticatedCRDT — mergeStates', () => {
  it('merges registers from remote into local', () => {
    const signer = makeDID();
    const local = createAgentState('local');
    const remote = createAgentState('remote');

    setRegister(local, 'x', 'local-val', signer, 5);
    setRegister(remote, 'x', 'remote-val', signer, 10);
    setRegister(remote, 'y', 'only-remote', signer, 1);

    mergeStates(local, remote);
    expect(getRegister(local, 'x')).toBe('remote-val'); // remote has higher ts
    expect(getRegister(local, 'y')).toBe('only-remote'); // new from remote
  });

  it('local register wins when it has higher timestamp', () => {
    const signer = makeDID();
    const local = createAgentState('local');
    const remote = createAgentState('remote');

    setRegister(local, 'x', 'local-wins', signer, 20);
    setRegister(remote, 'x', 'remote-loses', signer, 10);

    mergeStates(local, remote);
    expect(getRegister(local, 'x')).toBe('local-wins');
  });

  it('merges counters from remote into local', () => {
    const local = createAgentState('local');
    const remote = createAgentState('remote');

    incrementCounter(local, 'ops', 'a', 5);
    incrementCounter(remote, 'ops', 'a', 3);
    incrementCounter(remote, 'ops', 'b', 7);

    mergeStates(local, remote);
    expect(getCounter(local, 'ops')).toBe(12); // max(5,3) + 7
  });

  it('merges sets from remote into local', () => {
    const signer = makeDID();
    const local = createAgentState('local');
    const remote = createAgentState('remote');

    // Manually add sets
    local.sets.set('tags', new ORSet<string>());
    local.sets.get('tags')!.add('alpha', signer, 1);

    remote.sets.set('tags', new ORSet<string>());
    remote.sets.get('tags')!.add('beta', signer, 2);

    mergeStates(local, remote);
    const tags = local.sets.get('tags')!;
    expect(tags.has('alpha')).toBe(true);
    expect(tags.has('beta')).toBe(true);
  });

  it('updates lastSync to the max of both', () => {
    const local = createAgentState('local');
    local.lastSync = 100;
    const remote = createAgentState('remote');
    remote.lastSync = 200;

    mergeStates(local, remote);
    expect(local.lastSync).toBe(200);
  });

  it('merge is commutative for counters', () => {
    const a = createAgentState('a');
    const b = createAgentState('b');

    incrementCounter(a, 'c', 'x', 5);
    incrementCounter(b, 'c', 'y', 3);

    const a2 = createAgentState('a2');
    incrementCounter(a2, 'c', 'x', 5);
    const b2 = createAgentState('b2');
    incrementCounter(b2, 'c', 'y', 3);

    mergeStates(a, b);
    mergeStates(b2, a2);

    expect(getCounter(a, 'c')).toBe(getCounter(b2, 'c'));
  });
});
