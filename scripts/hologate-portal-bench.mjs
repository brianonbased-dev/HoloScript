#!/usr/bin/env node
/**
 * hologate-portal-bench.mjs — HoloGate portal benchmark suite
 *
 * Benchmarks four HoloGate subsystems and produces a receipt JSON suitable
 * for paper-audit-matrix evidence (Paper 35 candidate — HoloGate agent+human
 * co-presence). Per research/2026-05-22_hologate-copresence-systems-paper-evaluation.md §5.
 *
 * Measurements:
 *   (1) validatePortalIntent latency over 10K intents with varying scopes
 *   (2) Delta broadcast fan-out: N subscribers, per-subscriber delivery time
 *   (3) Portal threshold negotiation overhead: request_entry → entrant_arrived
 *   (4) World-state hash computation cost for 1K-entity world
 *
 * Usage:
 *   node scripts/hologate-portal-bench.mjs
 *   node scripts/hologate-portal-bench.mjs --N=10000 --subscribers=50
 *   node scripts/hologate-portal-bench.mjs --dry-run
 *
 * Output:
 *   scripts/receipts/hologate-portal-bench-receipt.json
 *   (also printed to stdout)
 *
 * Context:
 *   Board task: task_1779439734598_y1gk
 *   Research:   research/2026-05-22_hologate-copresence-systems-paper-evaluation.md
 *   Commit:     (inserted on write-receipt)
 */

import { performance } from 'node:perf_hooks';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import os from 'node:os';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, '..');

// ── CLI flags ─────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name, def) => {
  const m = args.find((a) => a.startsWith(`--${name}=`));
  return m ? Number(m.split('=')[1]) : def;
};
const hasFlag = (name) => args.includes(`--${name}`);

const N_INTENT = flag('N', 10_000);
const N_SUBSCRIBERS = flag('subscribers', 50);
const DRY_RUN = hasFlag('dry-run');
const WARMUP = 200;

const RECEIPT_DIR = join(REPO_ROOT, 'scripts', 'receipts');
const RECEIPT_PATH = join(RECEIPT_DIR, 'hologate-portal-bench-receipt.json');

// ── Helpers ───────────────────────────────────────────────────────────────────

const banner = (t) => {
  console.log(`\n${'─'.repeat(62)}`);
  console.log(`  ${t}`);
  console.log('─'.repeat(62));
};
const ok = (l, v) => console.log(`  \x1b[32m✓\x1b[0m ${l.padEnd(38)} ${v}`);
const warn = (l, v) => console.log(`  \x1b[33m⚠\x1b[0m ${l.padEnd(38)} ${String(v).slice(0, 80)}`);

/**
 * Time fn() for `iters` iterations after `warmup` warmup iterations.
 * Returns { avgNs, minNs, maxNs, p50Ns, p99Ns, opsPerSec }.
 */
function timeit(fn, iters, warmup = WARMUP) {
  for (let i = 0; i < warmup; i++) fn();
  const samples = new Float64Array(iters);
  for (let i = 0; i < iters; i++) {
    const t0 = performance.now();
    fn();
    samples[i] = (performance.now() - t0) * 1e6; // ns
  }
  samples.sort();
  const sum = samples.reduce((a, b) => a + b, 0);
  const avgNs = sum / iters;
  const minNs = samples[0];
  const maxNs = samples[iters - 1];
  const p50Ns = samples[Math.floor(iters * 0.5)];
  const p99Ns = samples[Math.floor(iters * 0.99)];
  const opsPerSec = Math.round(1e9 / avgNs);
  return {
    avgNs: +avgNs.toFixed(1),
    minNs: +minNs.toFixed(1),
    maxNs: +maxNs.toFixed(1),
    p50Ns: +p50Ns.toFixed(1),
    p99Ns: +p99Ns.toFixed(1),
    opsPerSec,
  };
}

function fmtNs(ns) {
  if (ns < 1_000) return `${ns.toFixed(0)} ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)} µs`;
  return `${(ns / 1_000_000).toFixed(2)} ms`;
}

// ── Inline pure functions (mirrors packages/mcp-server/src/holo-portal-intent.ts)
// These are re-implemented here to avoid a build dependency. The benchmark
// exercises exactly the same code path — same algorithm, same branch structure.
// If the source changes, update this section accordingly.
// ─────────────────────────────────────────────────────────────────────────────

const SCOPE_RANK = { 'read-only': 0, 'mutate-zone': 1, 'drive-avatar': 2 };

function matchesZoneGlob(id, globs) {
  if (!globs || globs.length === 0) return false;
  return globs.some((g) => {
    const re = new RegExp(
      '^' +
        g
          .split('*')
          .map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*') +
        '$'
    );
    return re.test(id);
  });
}

function validatePortalIntent(intent, policy, requestedScope, driveAvatarActiveCount = 0) {
  const p = policy ?? {};
  const scope = requestedScope ?? p.defaultScope ?? 'read-only';
  const warn = p.enforcement?.onScopeViolation === 'warn';
  const deny = (reason) =>
    warn ? { allowed: true, scope, reason, warned: true } : { allowed: false, scope, reason };
  const allow = () => ({ allowed: true, scope });
  if (p.allowedScopes && p.allowedScopes.length > 0 && !p.allowedScopes.includes(scope)) {
    return deny(`scope '${scope}' not in allowedScopes`);
  }
  const rank = SCOPE_RANK[scope];
  if (rank < SCOPE_RANK['mutate-zone']) {
    return deny(`scope 'read-only' cannot perform '${intent.kind}'`);
  }
  switch (intent.kind) {
    case 'move':
    case 'grab': {
      const targetId = intent.kind === 'grab' ? intent.targetId : intent.entityId;
      if (rank >= SCOPE_RANK['drive-avatar']) return allow();
      if (matchesZoneGlob(targetId, p.mutableZoneGlobs)) return allow();
      return deny(`'${intent.kind}' on '${targetId}' requires mutableZoneGlob`);
    }
    case 'look':
    case 'say': {
      if (rank < SCOPE_RANK['drive-avatar']) return deny(`'${intent.kind}' requires drive-avatar`);
      if (p.driveAvatar && p.driveAvatar.allow === false) return deny('drive-avatar disabled');
      const max = p.driveAvatar?.maxEntities ?? 0;
      if (max > 0 && driveAvatarActiveCount >= max)
        return deny(`drive-avatar limit reached (${driveAvatarActiveCount}/${max})`);
      return allow();
    }
    default:
      return deny('unknown intent kind');
  }
}

// ── World-state hash (measurement 4) ─────────────────────────────────────────
// Mirrors the portal-entry sha256Canonical pattern.

function sha256WorldState(entityMap) {
  const sorted = Object.keys(entityMap)
    .sort()
    .reduce((acc, k) => {
      acc[k] = entityMap[k];
      return acc;
    }, {});
  return createHash('sha256').update(JSON.stringify(sorted), 'utf8').digest('hex');
}

/** Build a fake 1K-entity world state map for benchmarking hash cost. */
function buildWorldState(nEntities) {
  const state = {};
  for (let i = 0; i < nEntities; i++) {
    state[`entity_${i.toString().padStart(5, '0')}`] = {
      transform: {
        position: { x: Math.random(), y: Math.random(), z: Math.random() },
        rotation: { x: 0, y: 0, z: 0, w: 1 },
      },
      visible: true,
      updatedAt: Date.now(),
    };
  }
  return state;
}

// ── Git commit hash ───────────────────────────────────────────────────────────

function gitHead() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: REPO_ROOT, encoding: 'utf-8' }).trim();
  } catch {
    return 'unknown';
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  BENCHMARK 1: validatePortalIntent over 10K intents with varying scopes
// ─────────────────────────────────────────────────────────────────────────────

function bench1_intentValidation(N) {
  banner(`[1/4] Intent validation (N=${N.toLocaleString()})`);

  const scopes = ['read-only', 'mutate-zone', 'drive-avatar'];
  const kinds = ['move', 'look', 'grab', 'say'];
  const policies = {
    readOnly: { defaultScope: 'read-only' },
    mutateZone: { defaultScope: 'mutate-zone', mutableZoneGlobs: ['zone_*'] },
    driveAvatar: { defaultScope: 'drive-avatar', driveAvatar: { allow: true, maxEntities: 5 } },
  };

  // Build a mixed intent corpus of N entries cycling through combinations
  const intents = Array.from({ length: N }, (_, i) => {
    const kind = kinds[i % kinds.length];
    switch (kind) {
      case 'move':
        return { kind: 'move', entityId: `ent_${i}`, position: { x: i * 0.1, y: 0, z: 0 } };
      case 'look':
        return { kind: 'look', entityId: `ent_${i}`, rotation: { x: 0, y: 0, z: 0, w: 1 } };
      case 'grab':
        return { kind: 'grab', entityId: `ent_${i}`, targetId: `zone_${i % 20}` };
      case 'say':
        return { kind: 'say', entityId: `ent_${i}`, utterance: `hello ${i}` };
    }
  });
  const policyList = Object.values(policies);

  // Bench: run all N validations per iteration
  let lastResult = null;
  const elapsed0 = performance.now();
  for (let it = 0; it < N; it++) {
    const policy = policyList[it % policyList.length];
    const scope = scopes[it % scopes.length];
    lastResult = validatePortalIntent(intents[it], policy, scope);
  }
  const totalMs = performance.now() - elapsed0;
  const avgNs = (totalMs * 1e6) / N;

  // Per-scope breakdown (smaller sample)
  const BREAKDOWN_N = Math.min(N, 2000);
  const breakdown = {};
  for (const scope of scopes) {
    const policy =
      policies[
        scope === 'read-only' ? 'readOnly' : scope === 'mutate-zone' ? 'mutateZone' : 'driveAvatar'
      ];
    const intent = { kind: 'move', entityId: 'ent_0', position: { x: 0, y: 0, z: 0 } };
    const r = timeit(() => validatePortalIntent(intent, policy, scope), BREAKDOWN_N, 100);
    breakdown[scope] = r;
  }

  ok('N intents validated', N.toLocaleString());
  ok('Total wall time', `${totalMs.toFixed(1)} ms`);
  ok('Avg per-intent latency', fmtNs(avgNs));
  ok('Throughput', `${Math.round(N / (totalMs / 1000)).toLocaleString()} intent/sec`);
  console.log('\n  Per-scope breakdown:');
  for (const [scope, r] of Object.entries(breakdown)) {
    console.log(`    ${scope.padEnd(14)} avg=${fmtNs(r.avgNs)} p99=${fmtNs(r.p99Ns)}`);
  }
  ok('Sample result (last)', JSON.stringify(lastResult));

  return {
    N,
    totalWallMs: +totalMs.toFixed(1),
    avgPerIntentNs: +avgNs.toFixed(1),
    throughputIntentsPerSec: Math.round(N / (totalMs / 1000)),
    breakdown: Object.fromEntries(
      Object.entries(breakdown).map(([k, v]) => [
        k,
        {
          avgNs: v.avgNs,
          p50Ns: v.p50Ns,
          p99Ns: v.p99Ns,
          opsPerSec: v.opsPerSec,
        },
      ])
    ),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  BENCHMARK 2: Delta broadcast fan-out latency
// ─────────────────────────────────────────────────────────────────────────────

function bench2_broadcastFanout(nSubscribers) {
  banner(`[2/4] Delta broadcast fan-out (N subscribers=${nSubscribers})`);

  // Inline subscriber registry (mirrors networking-tools.ts subscribeToStateDeltas).
  // We measure the pure in-process fan-out cost, not I/O transport.
  const subscribers = new Set();
  const subscribe = (fn) => {
    subscribers.add(fn);
    return () => subscribers.delete(fn);
  };

  let totalCallbacks = 0;
  const receivedBySubscriber = new Map();

  // Register N subscribers
  const unsubscribers = [];
  for (let i = 0; i < nSubscribers; i++) {
    const id = i;
    receivedBySubscriber.set(id, 0);
    const unsub = subscribe((deltas) => {
      receivedBySubscriber.set(id, receivedBySubscriber.get(id) + deltas.length);
      totalCallbacks++;
    });
    unsubscribers.push(unsub);
  }

  // Build a representative delta batch (3 fields changed)
  const sampleDeltas = [
    { entityId: 'ent_0', field: 'transform', oldValue: { x: 0 }, newValue: { x: 1 } },
    { entityId: 'ent_0', field: 'visible', oldValue: true, newValue: false },
    { entityId: 'ent_1', field: 'holding', oldValue: null, newValue: 'target_7' },
  ];

  function broadcastDeltas(deltas) {
    for (const sub of subscribers) {
      try {
        sub(deltas);
      } catch {}
    }
  }

  // Warm up
  for (let i = 0; i < 50; i++) broadcastDeltas(sampleDeltas);

  // Measure: 1000 broadcast rounds
  const ROUNDS = 1000;
  const t0 = performance.now();
  for (let r = 0; r < ROUNDS; r++) broadcastDeltas(sampleDeltas);
  const totalMs = performance.now() - t0;

  const avgPerBroadcastNs = (totalMs * 1e6) / ROUNDS;
  const avgPerSubscriberNs = avgPerBroadcastNs / nSubscribers;

  // Verify all subscribers received all deltas
  let allReceived = true;
  for (const [id, count] of receivedBySubscriber) {
    if (count < ROUNDS * sampleDeltas.length + 50 * sampleDeltas.length) {
      allReceived = false;
      warn(`subscriber ${id} received only ${count} delta callbacks`);
    }
  }

  // Cleanup
  for (const unsub of unsubscribers) unsub();

  ok('Subscribers', nSubscribers);
  ok('Broadcast rounds', ROUNDS.toLocaleString());
  ok('Deltas per broadcast', sampleDeltas.length);
  ok('Total wall time', `${totalMs.toFixed(2)} ms`);
  ok('Avg per-broadcast (all subs)', fmtNs(avgPerBroadcastNs));
  ok('Avg per-subscriber delivery', fmtNs(avgPerSubscriberNs));
  ok('All subscribers received deltas', allReceived ? 'YES' : 'NO (check warn)');

  // Fan-out scaling: measure at 1, 10, 50, 100 subscribers
  const scalingPoints = [1, 10, 50, Math.min(nSubscribers, 100)];
  const scaling = {};
  for (const n of [...new Set(scalingPoints)]) {
    const localSubs = new Set();
    for (let i = 0; i < n; i++) localSubs.add(() => {});
    function localBroadcast(d) {
      for (const s of localSubs) s(d);
    }
    for (let i = 0; i < 50; i++) localBroadcast(sampleDeltas);
    const st0 = performance.now();
    for (let r = 0; r < ROUNDS; r++) localBroadcast(sampleDeltas);
    const sMs = performance.now() - st0;
    scaling[`n${n}`] = { avgNs: +((sMs * 1e6) / ROUNDS).toFixed(1) };
  }
  console.log('\n  Fan-out scaling:');
  for (const [k, v] of Object.entries(scaling)) {
    console.log(`    ${k.padEnd(6)} avg=${fmtNs(v.avgNs)}`);
  }

  return {
    nSubscribers,
    broadcastRounds: ROUNDS,
    deltasPerBroadcast: sampleDeltas.length,
    totalWallMs: +totalMs.toFixed(2),
    avgPerBroadcastNs: +avgPerBroadcastNs.toFixed(1),
    avgPerSubscriberDeliveryNs: +avgPerSubscriberNs.toFixed(1),
    allSubscribersReceived: allReceived,
    fanoutScaling: scaling,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  BENCHMARK 3: Portal threshold negotiation overhead
//  Models the request_entry → representation negotiation → entrant_arrived sequence.
//  This is a pure in-process simulation of the protocol state machine.
// ─────────────────────────────────────────────────────────────────────────────

function bench3_thresholdNegotiation() {
  banner('[3/4] Portal threshold negotiation overhead');

  // Simulate the content-negotiation decision tree:
  //   1. Receive entrant connection (has A2A card → agent-semantic; no card → human)
  //   2. Determine representation lane (defaultRepresentationLaneFor)
  //   3. Check HoloDoor scope policy
  //   4. Emit entrant_arrived event with negotiated receipt

  function defaultRepresentationLaneFor(surfaceKind) {
    switch (surfaceKind) {
      case 'agent-semantic':
      case 'agent-pixel':
        return 'semantic-state';
      case 'human-headset':
      case 'human-browser':
        return 'pixel-stream';
    }
  }

  function defaultAcceptedFormatsFor(lane) {
    return lane === 'semantic-state'
      ? ['scene-graph+trait-delta', 'authoritative-state-snapshot']
      : ['webxr-frame', 'av1-stream'];
  }

  // Negotiate one portal entry. Returns the negotiated representation.
  function negotiateEntry(entrantKind, a2aCardRef, policy) {
    // Step 1: determine lane
    const lane = defaultRepresentationLaneFor(entrantKind);
    const formats = defaultAcceptedFormatsFor(lane);

    // Step 2: resolve scope (from HoloDoor policy)
    const scope = policy?.defaultScope ?? 'read-only';
    const spatialScopes =
      scope === 'drive-avatar'
        ? ['read', 'mutate', 'admin']
        : scope === 'mutate-zone'
          ? ['read', 'mutate']
          : ['read'];

    // Step 3: build minimal receipt header (content-hash omitted for speed)
    const negotiatedAt = new Date().toISOString();
    const representation = { lane, acceptedFormats: formats, negotiatedAt };
    const scopesGranted = {
      spatial: spatialScopes,
      toolScopeIds: [],
      worldId: 'world_bench',
      grantedAt: negotiatedAt,
    };

    // Step 4: entrant_arrived event (simulate write to event bus)
    const event = {
      type: 'entrant_arrived',
      agentId: a2aCardRef
        ? `agent_${Math.abs(a2aCardRef.charCodeAt(8) ?? 0)}`
        : `human_${Date.now() % 9999}`,
      lane,
      scope,
    };

    return { representation, scopesGranted, event };
  }

  const ITER = 5000;
  const entrantKinds = ['agent-semantic', 'human-headset', 'human-browser', 'agent-pixel'];
  const policies = [
    { defaultScope: 'read-only' },
    { defaultScope: 'mutate-zone' },
    { defaultScope: 'drive-avatar', driveAvatar: { allow: true } },
  ];

  let lastResult = null;
  const samples = new Float64Array(ITER);
  for (let i = 0; i < ITER; i++) {
    const kind = entrantKinds[i % entrantKinds.length];
    const policy = policies[i % policies.length];
    const a2aRef = kind.startsWith('agent') ? `https://agents.example.com/a2a/${i}` : undefined;
    const t0 = performance.now();
    lastResult = negotiateEntry(kind, a2aRef, policy);
    samples[i] = (performance.now() - t0) * 1e6;
  }
  samples.sort();
  const avg = samples.reduce((a, b) => a + b, 0) / ITER;
  const p50 = samples[Math.floor(ITER * 0.5)];
  const p99 = samples[Math.floor(ITER * 0.99)];

  ok('Iterations', ITER.toLocaleString());
  ok('Avg negotiation latency', fmtNs(avg));
  ok('p50', fmtNs(p50));
  ok('p99', fmtNs(p99));
  ok('Throughput', `${Math.round(1e9 / avg).toLocaleString()} negotiations/sec`);
  ok('Sample output lane', lastResult.event.lane);

  return {
    N: ITER,
    avgNs: +avg.toFixed(1),
    p50Ns: +p50.toFixed(1),
    p99Ns: +p99.toFixed(1),
    throughputPerSec: Math.round(1e9 / avg),
    stepsModelled: [
      'lane-selection',
      'scope-resolution',
      'receipt-header',
      'entrant-arrived-event',
    ],
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  BENCHMARK 4: World-state hash computation cost (1K entities)
// ─────────────────────────────────────────────────────────────────────────────

function bench4_worldStateHash() {
  banner('[4/4] World-state hash cost (SHA-256 of 1K-entity state)');

  const worldState = buildWorldState(1000);
  const entityCount = Object.keys(worldState).length;

  // Time one full hash
  const r = timeit(() => sha256WorldState(worldState), 200, 20);

  // Also measure at 100, 500, 1000, 2000 entities
  const scaling = {};
  for (const n of [100, 500, 1000, 2000]) {
    const ws = buildWorldState(n);
    const sr = timeit(() => sha256WorldState(ws), 100, 10);
    scaling[`n${n}`] = { avgNs: sr.avgNs, p99Ns: sr.p99Ns };
  }

  const sampleHash = sha256WorldState(worldState);

  ok(`Entity count`, entityCount);
  ok('Avg hash latency', fmtNs(r.avgNs));
  ok('p50', fmtNs(r.p50Ns));
  ok('p99', fmtNs(r.p99Ns));
  ok('Throughput', `${r.opsPerSec.toLocaleString()} hashes/sec`);
  ok('Sample hash (first 16 hex)', sampleHash.slice(0, 16) + '…');

  console.log('\n  Scaling by entity count:');
  for (const [k, v] of Object.entries(scaling)) {
    console.log(`    ${k.padEnd(7)} avg=${fmtNs(v.avgNs)} p99=${fmtNs(v.p99Ns)}`);
  }

  return {
    entityCount,
    avgNs: r.avgNs,
    p50Ns: r.p50Ns,
    p99Ns: r.p99Ns,
    opsPerSec: r.opsPerSec,
    scaling,
    sampleHash: sampleHash.slice(0, 16) + '…',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
//  MAIN
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\nHoloGate Portal Benchmark Suite');
  console.log(`Run: ${new Date().toISOString()}`);
  console.log(`Host: ${os.hostname()} | Arch: ${os.arch()} | CPUs: ${os.cpus().length}`);
  console.log(`Node: ${process.version}`);
  if (DRY_RUN) {
    console.log('\n[DRY-RUN] skipping actual benchmarks.');
    process.exit(0);
  }

  const startMs = performance.now();

  const r1 = bench1_intentValidation(N_INTENT);
  const r2 = bench2_broadcastFanout(N_SUBSCRIBERS);
  const r3 = bench3_thresholdNegotiation();
  const r4 = bench4_worldStateHash();

  const totalMs = performance.now() - startMs;
  const commit = gitHead();

  const receipt = {
    schemaVersion: 'holoscript.bench.hologate-portal.v1',
    benchmarkId: `hgbench_${Date.now().toString(36)}`,
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/hologate-portal-bench.mjs',
    host: {
      hostname: os.hostname(),
      arch: os.arch(),
      cpuCount: os.cpus().length,
      cpuModel: os.cpus()[0]?.model ?? 'unknown',
      nodeVersion: process.version,
    },
    commit,
    totalBenchDurationMs: +totalMs.toFixed(0),
    paperTarget: 'Paper 35 — HoloGate agent+human co-presence (EuroSys 2027 candidate)',
    researchFile: 'research/2026-05-22_hologate-copresence-systems-paper-evaluation.md',
    boardTask: 'task_1779439734598_y1gk',
    measurements: {
      intentValidation: r1,
      deltaFanout: r2,
      thresholdNegotiation: r3,
      worldStateHash: r4,
    },
    summary: {
      intentValidation_avgNs: r1.avgPerIntentNs,
      intentValidation_opsPerSec: r1.throughputIntentsPerSec,
      broadcastFanout_n50_avgNs: r2.avgPerBroadcastNs,
      thresholdNeg_avgNs: r3.avgNs,
      thresholdNeg_p99Ns: r3.p99Ns,
      worldHash_1K_avgNs: r4.avgNs,
      worldHash_1K_opsPerSec: r4.opsPerSec,
    },
  };

  banner('Receipt');
  ok('benchmarkId', receipt.benchmarkId);
  ok('commit', commit);
  ok('Total bench time', `${totalMs.toFixed(0)} ms`);

  if (!existsSync(RECEIPT_DIR)) mkdirSync(RECEIPT_DIR, { recursive: true });
  writeFileSync(RECEIPT_PATH, JSON.stringify(receipt, null, 2));
  ok('Receipt written to', RECEIPT_PATH.replace(REPO_ROOT + '/', ''));

  console.log('\n── Summary ──────────────────────────────────────────────────────');
  console.log(
    `  [1] Intent validation   avg=${fmtNs(r1.avgPerIntentNs)} | ${r1.throughputIntentsPerSec.toLocaleString()} intents/sec`
  );
  console.log(
    `  [2] Broadcast fan-out   avg per broadcast (N=${r2.nSubscribers} subs)=${fmtNs(r2.avgPerBroadcastNs)}`
  );
  console.log(`  [3] Threshold negot.    avg=${fmtNs(r3.avgNs)} p99=${fmtNs(r3.p99Ns)}`);
  console.log(
    `  [4] World-state hash    avg=${fmtNs(r4.avgNs)} (1K entities, ${r4.opsPerSec.toLocaleString()} hashes/sec)`
  );
  console.log('─────────────────────────────────────────────────────────────────\n');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
