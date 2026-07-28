import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createCapabilityWorkItem,
  createInMemoryCapabilityWorkStore,
  normalizeCapabilities,
  runCapabilityWorkerTick,
  PostgresCapabilityWorkStore,
  workerCanRun,
} from '../src/capability-work.mjs';

test('normalizes capability declarations and matches required capabilities', () => {
  assert.deepEqual(normalizeCapabilities([' Cloud ', 'cpu', 'cloud', '']), ['cloud', 'cpu']);
  const item = createCapabilityWorkItem({
    kind: 'probe',
    idempotencyKey: 'probe-1',
    requiredCapabilities: ['cloud', 'cpu'],
  });
  assert.equal(workerCanRun(item, { capabilities: ['cpu', 'cloud', 'gpu'] }), true);
  assert.equal(workerCanRun(item, { capabilities: ['cpu'] }), false);
});

test('idempotent enqueue returns one durable work identity', async () => {
  const store = createInMemoryCapabilityWorkStore({ idFactory: () => 'work-1' });
  const first = await store.enqueue({ kind: 'probe', idempotencyKey: 'same-key' });
  const replay = await store.enqueue({ kind: 'probe', idempotencyKey: 'same-key' });
  assert.equal(first.id, 'work-1');
  assert.equal(replay.id, first.id);
  assert.equal((await store.list()).length, 1);
});

test('capability routing leaves edge-only work visible while cloud claims portable work', async () => {
  const store = createInMemoryCapabilityWorkStore();
  await store.enqueue({
    kind: 'edge-probe',
    idempotencyKey: 'edge-only',
    requiredCapabilities: ['edge-io'],
    priority: 1,
  });
  await store.enqueue({
    kind: 'continuity-probe',
    idempotencyKey: 'portable',
    requiredCapabilities: ['cpu'],
    priority: 2,
  });
  const claim = await store.claim({ id: 'railway', capabilities: ['cloud', 'cpu'] });
  assert.equal(claim.kind, 'continuity-probe');
  const queued = await store.list({ status: 'queued' });
  assert.equal(queued.length, 1);
  assert.equal(queued[0].kind, 'edge-probe');
});

test('expired Jetson lease fails over once without duplicate completion', async () => {
  let clock = Date.parse('2026-07-13T00:00:00.000Z');
  const store = createInMemoryCapabilityWorkStore({ now: () => clock });
  await store.enqueue({
    kind: 'continuity-probe',
    idempotencyKey: 'failover',
    requiredCapabilities: ['cpu'],
  });
  const jetson = await store.claim(
    { id: 'jetson', capabilities: ['cpu', 'edge'] },
    { leaseMs: 1000 }
  );
  assert.equal(jetson.attempts, 1);
  assert.equal(await store.claim({ id: 'railway', capabilities: ['cpu', 'cloud'] }), null);
  clock += 1001;
  const cloud = await store.claim({ id: 'railway', capabilities: ['cpu', 'cloud'] });
  assert.equal(cloud.id, jetson.id);
  assert.equal(cloud.attempts, 2);
  await store.complete({
    workId: cloud.id,
    workerId: 'railway',
    leaseToken: cloud.leaseToken,
    result: { recovered: true },
  });
  await assert.rejects(
    () =>
      store.complete({
        workId: jetson.id,
        workerId: 'jetson',
        leaseToken: jetson.leaseToken,
        result: { duplicate: true },
      }),
    /not leased|ownership mismatch/u
  );
  const completed = await store.list({ status: 'completed' });
  assert.equal(completed.length, 1);
  assert.deepEqual(completed[0].result, { recovered: true });
});

test('worker tick executes a registered handler and redacts its lease token', async () => {
  const store = createInMemoryCapabilityWorkStore();
  await store.enqueue({
    kind: 'continuity-probe',
    idempotencyKey: 'tick',
    requiredCapabilities: ['cpu'],
    payload: { value: 42 },
  });
  const receipt = await runCapabilityWorkerTick({
    store,
    worker: { id: 'laptop', capabilities: ['cpu', 'local-custody'] },
    handlers: {
      'continuity-probe': async ({ payload }) => ({ observed: payload.value }),
    },
  });
  assert.equal(receipt.status, 'executed');
  assert.equal(receipt.result.observed, 42);
  assert.equal(receipt.lease.rawTokenIncluded, false);
  assert.match(receipt.lease.tokenSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.equal(JSON.stringify(receipt).includes('leaseToken'), false);
});

test('handler failure is receipted and safely requeues bounded work', async () => {
  const store = createInMemoryCapabilityWorkStore();
  await store.enqueue({ kind: 'broken', idempotencyKey: 'broken', maxAttempts: 2 });
  const receipt = await runCapabilityWorkerTick({
    store,
    worker: { id: 'cloud', capabilities: [] },
    handlers: {
      broken: async () => {
        throw new Error('boom');
      },
    },
  });
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.work.nextStatus, 'queued');
  assert.equal((await store.list({ status: 'queued' })).length, 1);
});

test('worker tick renews long leases and writes through an optional receipt sink', async () => {
  const base = createInMemoryCapabilityWorkStore();
  let renewals = 0;
  const store = {
    ...base,
    async renew(input) {
      renewals += 1;
      return base.renew(input);
    },
  };
  const written = [];
  await store.enqueue({ kind: 'slow', idempotencyKey: 'slow' });
  const receipt = await runCapabilityWorkerTick({
    store,
    worker: { id: 'cloud', capabilities: ['cpu'] },
    leaseMs: 30,
    heartbeatMs: 5,
    handlers: {
      slow: async () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 18)),
    },
    receipts: {
      async write(value) {
        written.push(value);
        return 'receipt:slow';
      },
    },
  });
  assert.equal(receipt.status, 'executed');
  assert.ok(renewals >= 1);
  assert.equal(written.length, 1);
  assert.equal(receipt.receiptPersistence.ok, true);
  assert.equal(receipt.receiptPersistence.reference, 'receipt:slow');
});

test('Postgres claim SQL reaps terminal leases, scores preferences, and uses SKIP LOCKED', async () => {
  const queries = [];
  const now = '2026-07-13T00:00:00.000Z';
  const pool = {
    async query(sql, params) {
      queries.push({ sql, params });
      if (/RETURNING work\.\*/u.test(sql)) {
        return {
          rows: [
            {
              id: 'work-pg',
              workspace_id: 'test',
              idempotency_key: 'pg-claim',
              kind: 'probe',
              required_capabilities: ['cpu'],
              preferred_capabilities: ['cloud'],
              payload: {},
              status: 'leased',
              priority: 5,
              attempts: 2,
              max_attempts: 3,
              lease_owner: 'railway',
              lease_token: 'token',
              lease_expires_at: '2026-07-13T00:01:00.000Z',
              result: null,
              error: 'prior lease expired',
              created_at: now,
              updated_at: now,
            },
          ],
        };
      }
      return { rows: [] };
    },
  };
  const store = new PostgresCapabilityWorkStore({ pool, workspaceId: 'test', now: () => now });
  const claimed = await store.claim({ id: 'railway', capabilities: ['cloud', 'cpu'] });
  assert.equal(claimed.id, 'work-pg');
  const claimSql = queries[0].sql;
  assert.match(claimSql, /expired_final/u);
  assert.match(claimSql, /attempts >= max_attempts/u);
  assert.match(claimSql, /jsonb_array_elements_text\(preferred_capabilities\)/u);
  assert.match(claimSql, /FOR UPDATE SKIP LOCKED/u);
  assert.deepEqual(JSON.parse(queries[0].params[2]), ['cloud', 'cpu']);
});

test('worker tick aborts a hung handler at the wall-clock boundary', async () => {
  const store = createInMemoryCapabilityWorkStore();
  await store.enqueue({ kind: 'hung', idempotencyKey: 'hung', maxAttempts: 1 });
  const startedAt = Date.now();
  const receipt = await runCapabilityWorkerTick({
    store,
    worker: { id: 'cloud', capabilities: ['cpu'] },
    leaseMs: 100,
    wallTimeoutMs: 20,
    handlers: { hung: async () => new Promise(() => {}) },
  });
  assert.equal(receipt.status, 'failed');
  assert.equal(receipt.bounds.timedOut, true);
  assert.equal(receipt.work.nextStatus, 'failed');
  assert.match(receipt.error, /wall timeout 20ms/u);
  assert.ok(Date.now() - startedAt < 500);
  assert.match(receipt.evidence.inputSha256, /^sha256:[a-f0-9]{64}$/u);
  assert.match(receipt.evidence.policySha256, /^sha256:[a-f0-9]{64}$/u);
});
