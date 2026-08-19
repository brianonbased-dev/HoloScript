/**
 * Agent Neural-Map Loss Protocol — Operational Test (HoloLand)
 *
 * Direction: D.043 — Disposable Neural Maps + Durable Identity
 * Canonical Path: scripts/__tests__/agent-neural-map-loss.test.mjs
 *
 * Run: node scripts/__tests__/agent-neural-map-loss.test.mjs
 */

import assert from 'node:assert';

// ── Minimal mock runtime that implements the protocol ──

class MockNPCRuntime {
  constructor(seed) {
    this.seed = seed;
    this.state = 'SEED';
    this.map = null;
    this.utteranceBuffer = [];
    this.reputationDeltas = [];
    this.behaviorFactAppends = [];
    this.agendaDelta = null;
    this.episodeDigest = null;
    this.lastMergedAt = seed.lastMergedAt;
  }

  hydrate({ budgetMs = 100 }) {
    if (this.state !== 'SEED') throw new Error(`Cannot hydrate from ${this.state}`);
    const start = Date.now();
    this.map = {
      inferenceContext: `kv-${this.seed.npcId}`,
      workingMemory: [...(this.seed.episodeDigest?.lastUtterances || [])],
    };
    this.state = 'ACTIVE';
    const elapsed = Date.now() - start;
    if (elapsed > budgetMs) throw new Error(`Hydrate timeout: ${elapsed}ms > ${budgetMs}ms`);
    return { event: 'npc:hydrate:ready', elapsed };
  }

  tick({ playerInput }) {
    if (this.state !== 'ACTIVE') throw new Error(`Cannot tick from ${this.state}`);
    const response = `NPC ${this.seed.npcId} responds to: ${playerInput}`;
    this.utteranceBuffer.push(response);
    this.reputationDeltas.push({ player: 'player1', delta: +1 });
    return { event: 'npc:tick', output: response };
  }

  merge() {
    if (this.state !== 'ACTIVE') throw new Error(`Cannot merge from ${this.state}`);
    this.seed.reputationLedger.push(...this.reputationDeltas);
    this.seed.behaviorFactLog.push(...this.behaviorFactAppends);
    if (this.agendaDelta) this.seed.agendaState = { ...this.seed.agendaState, ...this.agendaDelta };
    this.seed.episodeDigest = {
      lastUtterances: this.utteranceBuffer.slice(-8),
      valence: 'neutral',
      keyDecisions: [],
    };
    this.seed.lastMergedAt = Date.now();
    return { event: 'npc:merge:ack', seedHash: this.hashSeed() };
  }

  destroy() {
    if (this.state !== 'ACTIVE') throw new Error(`Cannot destroy from ${this.state}`);
    const finalSeedHash = this.hashSeed();
    this.map = null;
    this.utteranceBuffer = [];
    this.reputationDeltas = [];
    this.behaviorFactAppends = [];
    this.agendaDelta = null;
    this.episodeDigest = null;
    this.state = 'SEED';
    return { event: 'npc:destroy', finalSeedHash };
  }

  hashSeed() {
    return `seed-hash-${this.seed.npcId}-${this.seed.reputationLedger.length}-${this.seed.behaviorFactLog.length}-${this.seed.lastMergedAt}`;
  }
}

function createSeed(npcId) {
  return {
    npcId,
    wallet: `wallet-${npcId}`,
    handle: npcId,
    brainComposition: `compositions/${npcId}.hsplus`,
    reputationLedger: [],
    behaviorFactLog: [],
    agendaState: { goals: ['greet'] },
    episodeDigest: { lastUtterances: [], valence: 'neutral', keyDecisions: [] },
    lastMergedAt: 0,
  };
}

// ── Test runner ──

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  PASS: ${name}`);
    passed++;
  } catch (e) {
    console.error(`  FAIL: ${name}`);
    console.error(`    ${e.message}`);
    failed++;
  }
}

console.log('Agent Neural-Map Loss Protocol (HoloLand)\n');

test('hydrates from SEED to ACTIVE within budget', () => {
  const seed = createSeed('npc-test-01');
  const runtime = new MockNPCRuntime(seed);
  const result = runtime.hydrate({ budgetMs: 100 });
  assert.strictEqual(result.event, 'npc:hydrate:ready');
  assert.ok(result.elapsed < 100);
  assert.strictEqual(runtime.state, 'ACTIVE');
  assert.ok(runtime.map !== null);
});

test('ticks deterministically while ACTIVE', () => {
  const seed = createSeed('npc-test-01');
  const runtime = new MockNPCRuntime(seed);
  runtime.hydrate({ budgetMs: 100 });
  const result = runtime.tick({ playerInput: 'hello' });
  assert.strictEqual(result.event, 'npc:tick');
  assert.ok(result.output.includes('hello'));
  assert.strictEqual(runtime.utteranceBuffer.length, 1);
});

test('merges episodic deltas back to seed', () => {
  const seed = createSeed('npc-test-01');
  const runtime = new MockNPCRuntime(seed);
  runtime.hydrate({ budgetMs: 100 });
  runtime.tick({ playerInput: 'hello' });
  const preMergeHash = runtime.hashSeed();
  const mergeResult = runtime.merge();
  assert.strictEqual(mergeResult.event, 'npc:merge:ack');
  assert.strictEqual(seed.reputationLedger.length, 1);
  assert.strictEqual(seed.behaviorFactLog.length, 0);
  assert.strictEqual(seed.episodeDigest.lastUtterances.length, 1);
  assert.notStrictEqual(mergeResult.seedHash, preMergeHash);
});

test('destroys running map and returns to SEED', () => {
  const seed = createSeed('npc-test-01');
  const runtime = new MockNPCRuntime(seed);
  runtime.hydrate({ budgetMs: 100 });
  runtime.tick({ playerInput: 'hello' });
  const mergeResult = runtime.merge();
  const destroyResult = runtime.destroy();
  assert.strictEqual(destroyResult.event, 'npc:destroy');
  assert.strictEqual(destroyResult.finalSeedHash, mergeResult.seedHash);
  assert.strictEqual(runtime.state, 'SEED');
  assert.strictEqual(runtime.map, null);
  assert.strictEqual(runtime.utteranceBuffer.length, 0);
});

test('rehydrates from post-destroy seed deterministically', () => {
  const seed = createSeed('npc-test-01');
  const runtime = new MockNPCRuntime(seed);
  runtime.hydrate({ budgetMs: 100 });
  runtime.tick({ playerInput: 'hello' });
  runtime.merge();
  runtime.destroy();

  const runtime2 = new MockNPCRuntime(seed);
  const result = runtime2.hydrate({ budgetMs: 100 });
  assert.strictEqual(result.event, 'npc:hydrate:ready');
  assert.strictEqual(runtime2.map.workingMemory.length, 1);
  assert.ok(runtime2.map.workingMemory[0].includes('hello'));
});

test('writes cross-NPC gossip to both seeds before destroy', () => {
  const seedA = createSeed('npc-a');
  const seedB = createSeed('npc-b');
  const rtA = new MockNPCRuntime(seedA);
  const rtB = new MockNPCRuntime(seedB);

  rtA.hydrate({ budgetMs: 100 });
  rtB.hydrate({ budgetMs: 100 });

  rtA.reputationDeltas.push({ player: 'player1', delta: -1, gossip: 'stole item' });
  rtB.reputationDeltas.push({ player: 'player1', delta: -1, gossip: 'heard from npc-a' });

  const mergeA = rtA.merge();
  const mergeB = rtB.merge();

  assert.ok(seedA.reputationLedger.some(r => r.gossip === 'stole item'));
  assert.ok(seedB.reputationLedger.some(r => r.gossip === 'heard from npc-a'));

  rtA.destroy();
  rtB.destroy();

  assert.ok(seedA.reputationLedger.length > 0);
  assert.ok(seedB.reputationLedger.length > 0);
});

test('shard-split safety: seed moves without running map', () => {
  const seed = createSeed('npc-test-01');
  const runtime = new MockNPCRuntime(seed);
  runtime.hydrate({ budgetMs: 100 });
  runtime.tick({ playerInput: 'hello' });
  runtime.merge();
  const preSplitHash = runtime.hashSeed();
  runtime.destroy();

  const movedSeed = { ...seed, shardId: 'shard-b' };
  const rt2 = new MockNPCRuntime(movedSeed);
  rt2.hydrate({ budgetMs: 100 });
  assert.ok(rt2.map !== null);
  assert.strictEqual(rt2.state, 'ACTIVE');
  assert.strictEqual(rt2.hashSeed(), preSplitHash);
});

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
