import { createHash, randomUUID } from 'node:crypto';

export const CAPABILITY_WORK_ITEM_SCHEMA = 'holoscript.agent-runtime.capability-work-item.v1';
export const CAPABILITY_WORK_RECEIPT_SCHEMA = 'holoscript.agent-runtime.worker-tick.v1';
export const CAPABILITY_WORK_STORE_SCHEMA = 'holoscript.agent-runtime.capability-work-store.v1';

const WORK_STATUSES = new Set(['queued', 'leased', 'completed', 'failed']);

function iso(value = Date.now()) {
  const resolved = typeof value === 'function' ? value() : value;
  return new Date(resolved).toISOString();
}

function epoch(value) {
  const parsed = new Date(value).getTime();
  return Number.isFinite(parsed) ? parsed : 0;
}

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function safeError(error) {
  return String(error?.message || error || 'unknown error')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[REDACTED_POSTGRES_URL]')
    .slice(0, 1000);
}

function assertIdentifier(value, label) {
  const normalized = String(value || '').trim();
  if (!/^[a-z_][a-z0-9_]*$/u.test(normalized)) {
    throw new Error(`${label} must be a lowercase SQL identifier`);
  }
  return normalized;
}

function clone(value) {
  return value == null ? value : JSON.parse(JSON.stringify(value));
}

function stableValue(value) {
  if (Array.isArray(value)) return value.map(stableValue);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, stableValue(child)]),
  );
}

function sha256Stable(value) {
  return `sha256:${createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex')}`;
}

export function normalizeCapabilities(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))].sort();
}

export function workerCanRun(workItem, worker) {
  const offered = new Set(normalizeCapabilities(worker?.capabilities));
  return normalizeCapabilities(workItem?.requiredCapabilities)
    .every((capability) => offered.has(capability));
}

export function createCapabilityWorkItem(input = {}, options = {}) {
  const kind = String(input.kind || '').trim();
  if (!kind) throw new Error('capability work kind is required');
  const idempotencyKey = String(input.idempotencyKey || '').trim();
  if (!idempotencyKey) throw new Error('capability work idempotencyKey is required');
  const now = iso(options.now || Date.now);
  return {
    schema: CAPABILITY_WORK_ITEM_SCHEMA,
    id: String(input.id || options.idFactory?.() || randomUUID()),
    workspaceId: String(input.workspaceId || options.workspaceId || 'default'),
    idempotencyKey,
    kind,
    requiredCapabilities: normalizeCapabilities(input.requiredCapabilities),
    preferredCapabilities: normalizeCapabilities(input.preferredCapabilities),
    payload: clone(input.payload || {}),
    status: 'queued',
    priority: positiveInteger(input.priority, 5),
    attempts: 0,
    maxAttempts: positiveInteger(input.maxAttempts, 3),
    leaseOwner: null,
    leaseToken: null,
    leaseExpiresAt: null,
    result: null,
    error: null,
    createdAt: now,
    updatedAt: now,
  };
}

function preferredScore(workItem, worker) {
  const offered = new Set(normalizeCapabilities(worker?.capabilities));
  return normalizeCapabilities(workItem.preferredCapabilities)
    .filter((capability) => offered.has(capability)).length;
}

function compareCandidates(left, right, worker) {
  return left.priority - right.priority
    || preferredScore(right, worker) - preferredScore(left, worker)
    || epoch(left.createdAt) - epoch(right.createdAt)
    || left.id.localeCompare(right.id);
}

function assertLease(workItem, workerId, leaseToken) {
  if (!workItem || workItem.status !== 'leased') throw new Error('work item is not leased');
  if (workItem.leaseOwner !== workerId || workItem.leaseToken !== leaseToken) {
    throw new Error('work lease ownership mismatch');
  }
}

export function createInMemoryCapabilityWorkStore(options = {}) {
  const now = options.now || Date.now;
  const workspaceId = String(options.workspaceId || 'default');
  const items = new Map();
  const idempotency = new Map();

  function releaseExpired() {
    const current = epoch(iso(now));
    for (const item of items.values()) {
      if (item.status !== 'leased' || epoch(item.leaseExpiresAt) > current) continue;
      item.status = item.attempts >= item.maxAttempts ? 'failed' : 'queued';
      item.error = item.status === 'failed' ? 'lease expired after maximum attempts' : 'lease expired';
      item.leaseOwner = null;
      item.leaseToken = null;
      item.leaseExpiresAt = null;
      item.updatedAt = iso(now);
    }
  }

  return {
    schema: CAPABILITY_WORK_STORE_SCHEMA,
    durable: false,
    async ensureSchema() {
      return { ok: true, durable: false, workspaceId };
    },
    async enqueue(input) {
      const key = String(input?.idempotencyKey || '').trim();
      const existingId = idempotency.get(key);
      if (existingId) return clone(items.get(existingId));
      const item = createCapabilityWorkItem(input, {
        now,
        workspaceId,
        idFactory: options.idFactory,
      });
      items.set(item.id, item);
      idempotency.set(item.idempotencyKey, item.id);
      return clone(item);
    },
    async claim(worker, claimOptions = {}) {
      const workerId = String(worker?.id || '').trim();
      if (!workerId) throw new Error('worker id is required to claim work');
      releaseExpired();
      const candidate = [...items.values()]
        .filter((item) => item.status === 'queued' && item.attempts < item.maxAttempts)
        .filter((item) => workerCanRun(item, worker))
        .sort((left, right) => compareCandidates(left, right, worker))[0];
      if (!candidate) return null;
      const leaseMs = positiveInteger(claimOptions.leaseMs, 60_000);
      candidate.status = 'leased';
      candidate.attempts += 1;
      candidate.leaseOwner = workerId;
      candidate.leaseToken = randomUUID();
      candidate.leaseExpiresAt = iso(epoch(iso(now)) + leaseMs);
      candidate.updatedAt = iso(now);
      return clone(candidate);
    },
    async renew({ workId, workerId, leaseToken, leaseMs = 60_000 }) {
      const item = items.get(workId);
      assertLease(item, workerId, leaseToken);
      item.leaseExpiresAt = iso(epoch(iso(now)) + positiveInteger(leaseMs, 60_000));
      item.updatedAt = iso(now);
      return clone(item);
    },
    async complete({ workId, workerId, leaseToken, result }) {
      const item = items.get(workId);
      assertLease(item, workerId, leaseToken);
      item.status = 'completed';
      item.result = clone(result ?? null);
      item.error = null;
      item.leaseOwner = null;
      item.leaseToken = null;
      item.leaseExpiresAt = null;
      item.updatedAt = iso(now);
      return clone(item);
    },
    async fail({ workId, workerId, leaseToken, error }) {
      const item = items.get(workId);
      assertLease(item, workerId, leaseToken);
      item.status = item.attempts >= item.maxAttempts ? 'failed' : 'queued';
      item.error = safeError(error);
      item.leaseOwner = null;
      item.leaseToken = null;
      item.leaseExpiresAt = null;
      item.updatedAt = iso(now);
      return clone(item);
    },
    async list(filter = {}) {
      releaseExpired();
      return [...items.values()]
        .filter((item) => !filter.status || item.status === filter.status)
        .map(clone);
    },
    async snapshot() {
      releaseExpired();
      const all = [...items.values()];
      const counts = Object.fromEntries([...WORK_STATUSES].map((status) => [
        status,
        all.filter((item) => item.status === status).length,
      ]));
      return {
        schema: CAPABILITY_WORK_STORE_SCHEMA,
        generatedAt: iso(now),
        workspaceId,
        durable: false,
        counts,
        total: all.length,
      };
    },
    async close() {},
  };
}

function rowToWorkItem(row) {
  if (!row) return null;
  return {
    schema: CAPABILITY_WORK_ITEM_SCHEMA,
    id: row.id,
    workspaceId: row.workspace_id,
    idempotencyKey: row.idempotency_key,
    kind: row.kind,
    requiredCapabilities: normalizeCapabilities(row.required_capabilities),
    preferredCapabilities: normalizeCapabilities(row.preferred_capabilities),
    payload: row.payload || {},
    status: row.status,
    priority: Number(row.priority),
    attempts: Number(row.attempts),
    maxAttempts: Number(row.max_attempts),
    leaseOwner: row.lease_owner || null,
    leaseToken: row.lease_token || null,
    leaseExpiresAt: row.lease_expires_at ? iso(row.lease_expires_at) : null,
    result: row.result ?? null,
    error: row.error || null,
    createdAt: iso(row.created_at),
    updatedAt: iso(row.updated_at),
  };
}

export class PostgresCapabilityWorkStore {
  constructor(options = {}) {
    if (!options.pool) throw new Error('PostgresCapabilityWorkStore requires a pg-compatible pool');
    this.pool = options.pool;
    this.ownsPool = options.ownsPool === true;
    this.workspaceId = String(options.workspaceId || 'default');
    this.tableName = assertIdentifier(options.tableName || 'holoscript_agent_work', 'tableName');
    this.now = options.now || Date.now;
    this.schema = CAPABILITY_WORK_STORE_SCHEMA;
    this.durable = true;
  }

  async ensureSchema() {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL,
        idempotency_key TEXT NOT NULL,
        kind TEXT NOT NULL,
        required_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
        preferred_capabilities JSONB NOT NULL DEFAULT '[]'::jsonb,
        payload JSONB NOT NULL DEFAULT '{}'::jsonb,
        status TEXT NOT NULL CHECK (status IN ('queued', 'leased', 'completed', 'failed')),
        priority INTEGER NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        max_attempts INTEGER NOT NULL,
        lease_owner TEXT,
        lease_token TEXT,
        lease_expires_at TIMESTAMPTZ,
        result JSONB,
        error TEXT,
        created_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL,
        UNIQUE (workspace_id, idempotency_key)
      )
    `);
    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS ${this.tableName}_claim_idx
      ON ${this.tableName} (workspace_id, status, priority, created_at)
    `);
    return { ok: true, durable: true, workspaceId: this.workspaceId, table: this.tableName };
  }

  async enqueue(input) {
    const item = createCapabilityWorkItem(input, {
      now: this.now,
      workspaceId: this.workspaceId,
    });
    const result = await this.pool.query(`
      INSERT INTO ${this.tableName} (
        id, workspace_id, idempotency_key, kind, required_capabilities,
        preferred_capabilities, payload, status, priority, attempts,
        max_attempts, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5::jsonb,$6::jsonb,$7::jsonb,$8,$9,$10,$11,$12,$13)
      ON CONFLICT (workspace_id, idempotency_key)
      DO UPDATE SET idempotency_key = EXCLUDED.idempotency_key
      RETURNING *
    `, [
      item.id,
      item.workspaceId,
      item.idempotencyKey,
      item.kind,
      JSON.stringify(item.requiredCapabilities),
      JSON.stringify(item.preferredCapabilities),
      JSON.stringify(item.payload),
      item.status,
      item.priority,
      item.attempts,
      item.maxAttempts,
      item.createdAt,
      item.updatedAt,
    ]);
    return rowToWorkItem(result.rows[0]);
  }

  async claim(worker, options = {}) {
    const workerId = String(worker?.id || '').trim();
    if (!workerId) throw new Error('worker id is required to claim work');
    const now = iso(this.now);
    const leaseExpiresAt = iso(epoch(now) + positiveInteger(options.leaseMs, 60_000));
    const token = randomUUID();
    const capabilities = normalizeCapabilities(worker.capabilities);
    const result = await this.pool.query(`
      WITH expired_final AS (
        UPDATE ${this.tableName}
        SET status = 'failed', error = 'lease expired after maximum attempts',
            lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL,
            updated_at = $2
        WHERE workspace_id = $1 AND status = 'leased'
          AND lease_expires_at <= $2 AND attempts >= max_attempts
        RETURNING id
      ), candidate AS (
        SELECT id
        FROM ${this.tableName}
        WHERE workspace_id = $1
          AND (status = 'queued' OR (status = 'leased' AND lease_expires_at <= $2))
          AND attempts < max_attempts
          AND required_capabilities <@ $3::jsonb
        ORDER BY priority ASC,
          (
            SELECT COUNT(*)
            FROM jsonb_array_elements_text(preferred_capabilities) AS preferred(value)
            WHERE $3::jsonb ? preferred.value
          ) DESC,
          created_at ASC, id ASC
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE ${this.tableName} AS work
      SET status = 'leased', attempts = work.attempts + 1,
          lease_owner = $4, lease_token = $5, lease_expires_at = $6,
          error = CASE WHEN work.status = 'leased' THEN 'prior lease expired' ELSE work.error END,
          updated_at = $2
      FROM candidate
      WHERE work.id = candidate.id
      RETURNING work.*
    `, [this.workspaceId, now, JSON.stringify(capabilities), workerId, token, leaseExpiresAt]);
    return rowToWorkItem(result.rows[0]);
  }

  async renew({ workId, workerId, leaseToken, leaseMs = 60_000 }) {
    const now = iso(this.now);
    const result = await this.pool.query(`
      UPDATE ${this.tableName}
      SET lease_expires_at = $1, updated_at = $2
      WHERE id = $3 AND workspace_id = $4 AND status = 'leased'
        AND lease_owner = $5 AND lease_token = $6
      RETURNING *
    `, [iso(epoch(now) + positiveInteger(leaseMs, 60_000)), now, workId, this.workspaceId, workerId, leaseToken]);
    if (!result.rows[0]) throw new Error('work lease ownership mismatch');
    return rowToWorkItem(result.rows[0]);
  }

  async complete({ workId, workerId, leaseToken, result: workResult }) {
    const result = await this.pool.query(`
      UPDATE ${this.tableName}
      SET status = 'completed', result = $1::jsonb, error = NULL,
          lease_owner = NULL, lease_token = NULL, lease_expires_at = NULL, updated_at = $2
      WHERE id = $3 AND workspace_id = $4 AND status = 'leased'
        AND lease_owner = $5 AND lease_token = $6
      RETURNING *
    `, [JSON.stringify(workResult ?? null), iso(this.now), workId, this.workspaceId, workerId, leaseToken]);
    if (!result.rows[0]) throw new Error('work lease ownership mismatch');
    return rowToWorkItem(result.rows[0]);
  }

  async fail({ workId, workerId, leaseToken, error }) {
    const result = await this.pool.query(`
      UPDATE ${this.tableName}
      SET status = CASE WHEN attempts >= max_attempts THEN 'failed' ELSE 'queued' END,
          error = $1, lease_owner = NULL, lease_token = NULL,
          lease_expires_at = NULL, updated_at = $2
      WHERE id = $3 AND workspace_id = $4 AND status = 'leased'
        AND lease_owner = $5 AND lease_token = $6
      RETURNING *
    `, [safeError(error), iso(this.now), workId, this.workspaceId, workerId, leaseToken]);
    if (!result.rows[0]) throw new Error('work lease ownership mismatch');
    return rowToWorkItem(result.rows[0]);
  }

  async list(filter = {}) {
    const params = [this.workspaceId];
    const where = ['workspace_id = $1'];
    if (filter.status) {
      if (!WORK_STATUSES.has(filter.status)) throw new Error('invalid capability work status');
      params.push(filter.status);
      where.push(`status = $${params.length}`);
    }
    const result = await this.pool.query(`
      SELECT * FROM ${this.tableName}
      WHERE ${where.join(' AND ')}
      ORDER BY priority ASC, created_at ASC, id ASC
    `, params);
    return result.rows.map(rowToWorkItem);
  }

  async snapshot() {
    const result = await this.pool.query(`
      SELECT status, COUNT(*)::integer AS count
      FROM ${this.tableName}
      WHERE workspace_id = $1
      GROUP BY status
    `, [this.workspaceId]);
    const counts = Object.fromEntries([...WORK_STATUSES].map((status) => [status, 0]));
    for (const row of result.rows) counts[row.status] = Number(row.count);
    return {
      schema: CAPABILITY_WORK_STORE_SCHEMA,
      generatedAt: iso(this.now),
      workspaceId: this.workspaceId,
      durable: true,
      counts,
      total: Object.values(counts).reduce((sum, value) => sum + value, 0),
    };
  }

  async close() {
    if (this.ownsPool && typeof this.pool.end === 'function') await this.pool.end();
  }
}

export async function createPostgresCapabilityWorkStore(options = {}) {
  let pool = options.pool;
  let ownsPool = false;
  if (!pool) {
    const connectionString = String(options.connectionString || '').trim();
    if (!connectionString) throw new Error('connectionString or pool is required');
    const pg = options.pgModule || await import('pg');
    const Pool = pg.Pool || pg.default?.Pool;
    if (!Pool) throw new Error('pg Pool export is unavailable');
    pool = new Pool({ connectionString });
    ownsPool = true;
  }
  return new PostgresCapabilityWorkStore({ ...options, pool, ownsPool });
}

export async function runCapabilityWorkerTick(options = {}) {
  const { store, worker, handlers = {}, leaseMs = 60_000 } = options;
  if (!store?.claim) throw new Error('capability worker requires a work store');
  const workerId = String(worker?.id || '').trim();
  if (!workerId) throw new Error('capability worker id is required');
  const startedAt = Date.now();
  const wallTimeoutMs = positiveInteger(options.wallTimeoutMs, Math.min(positiveInteger(leaseMs, 60_000), 60_000));
  const workItem = await store.claim({
    id: workerId,
    capabilities: normalizeCapabilities(worker.capabilities),
  }, { leaseMs });
  if (!workItem) {
    return persistWorkerReceipt({
      schema: CAPABILITY_WORK_RECEIPT_SCHEMA,
      generatedAt: iso(),
      status: 'idle',
      worker: { id: workerId, capabilities: normalizeCapabilities(worker.capabilities) },
      work: null,
      bounds: { leaseMs: positiveInteger(leaseMs, 60_000), wallTimeoutMs, timedOut: false },
      durationMs: Date.now() - startedAt,
      error: null,
    }, options.receipts);
  }
  const tokenSha256 = `sha256:${createHash('sha256').update(workItem.leaseToken).digest('hex')}`;
  const inputSha256 = sha256Stable({
    id: workItem.id,
    kind: workItem.kind,
    payload: workItem.payload,
    requiredCapabilities: workItem.requiredCapabilities,
  });
  const policySha256 = sha256Stable({
    workerId,
    workerCapabilities: normalizeCapabilities(worker.capabilities),
    registeredKinds: Object.keys(handlers).sort(),
    leaseMs: positiveInteger(leaseMs, 60_000),
    wallTimeoutMs,
  });
  const handler = handlers[workItem.kind];
  const autoRenew = options.autoRenew !== false && typeof store.renew === 'function';
  const heartbeatMs = positiveInteger(
    options.heartbeatMs,
    Math.max(1000, Math.floor(positiveInteger(leaseMs, 60_000) / 3)),
  );
  let heartbeatTimer = null;
  let renewChain = Promise.resolve();
  let renewError = null;
  let timedOut = false;
  if (autoRenew) {
    heartbeatTimer = setInterval(() => {
      renewChain = renewChain.then(async () => {
        try {
          await store.renew({
            workId: workItem.id,
            workerId,
            leaseToken: workItem.leaseToken,
            leaseMs,
          });
        } catch (error) {
          renewError = error;
        }
      });
    }, heartbeatMs);
    heartbeatTimer.unref?.();
  }
  try {
    if (typeof handler !== 'function') throw new Error(`no handler registered for work kind ${workItem.kind}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      timedOut = true;
      controller.abort(new Error(`work handler exceeded wall timeout ${wallTimeoutMs}ms`));
    }, wallTimeoutMs);
    timeout.unref?.();
    const handlerPromise = Promise.resolve(handler({
      payload: clone(workItem.payload),
      workItem: clone({ ...workItem, leaseToken: null }),
      worker: { id: workerId, capabilities: normalizeCapabilities(worker.capabilities) },
      signal: controller.signal,
    }));
    const timeoutPromise = new Promise((_, reject) => {
      controller.signal.addEventListener('abort', () => reject(controller.signal.reason), { once: true });
    });
    let result;
    try {
      result = await Promise.race([handlerPromise, timeoutPromise]);
    } finally {
      clearTimeout(timeout);
    }
    await renewChain;
    if (renewError) throw new Error(`work lease renewal failed: ${safeError(renewError)}`);
    const completed = await store.complete({
      workId: workItem.id,
      workerId,
      leaseToken: workItem.leaseToken,
      result,
    });
    return persistWorkerReceipt({
      schema: CAPABILITY_WORK_RECEIPT_SCHEMA,
      generatedAt: iso(),
      status: 'executed',
      worker: { id: workerId, capabilities: normalizeCapabilities(worker.capabilities) },
      work: { id: workItem.id, kind: workItem.kind, attempts: completed.attempts },
      lease: { tokenSha256, fencingAttempt: completed.attempts, rawTokenIncluded: false },
      evidence: { inputSha256, policySha256 },
      bounds: { leaseMs: positiveInteger(leaseMs, 60_000), wallTimeoutMs, timedOut: false },
      durationMs: Date.now() - startedAt,
      result: clone(result ?? null),
      error: null,
    }, options.receipts);
  } catch (error) {
    const failed = await store.fail({
      workId: workItem.id,
      workerId,
      leaseToken: workItem.leaseToken,
      error,
    });
    return persistWorkerReceipt({
      schema: CAPABILITY_WORK_RECEIPT_SCHEMA,
      generatedAt: iso(),
      status: 'failed',
      worker: { id: workerId, capabilities: normalizeCapabilities(worker.capabilities) },
      work: { id: workItem.id, kind: workItem.kind, attempts: failed.attempts, nextStatus: failed.status },
      lease: { tokenSha256, fencingAttempt: failed.attempts, rawTokenIncluded: false },
      evidence: { inputSha256, policySha256 },
      bounds: { leaseMs: positiveInteger(leaseMs, 60_000), wallTimeoutMs, timedOut },
      durationMs: Date.now() - startedAt,
      result: null,
      error: safeError(error),
    }, options.receipts);
  } finally {
    if (heartbeatTimer) clearInterval(heartbeatTimer);
  }
}

async function persistWorkerReceipt(receipt, receipts) {
  if (typeof receipts?.write !== 'function') return receipt;
  try {
    const reference = await receipts.write(clone(receipt));
    return {
      ...receipt,
      receiptPersistence: {
        attempted: true,
        ok: true,
        reference: reference ?? null,
        error: null,
      },
    };
  } catch (error) {
    return {
      ...receipt,
      receiptPersistence: {
        attempted: true,
        ok: false,
        reference: null,
        error: safeError(error),
      },
    };
  }
}
