import { createHash, randomUUID } from 'node:crypto';

import type {
  MemoryEntry,
  MemoryEntryInput,
  RecallOptions,
  SovereignMemoryConfig,
  SovereignMemoryHealth,
  SovereignMemorySchemaReceipt,
} from './sovereign-memory-store.js';

export const SOVEREIGN_MEMORY_ROUND_TRIP_RECEIPT_SCHEMA =
  'holoscript.memory.postgres-round-trip.v1';

export const SOVEREIGN_MEMORY_CONNECTION_ENV_KEYS = [
  'MEMORY_DATABASE_URL',
  'DATABASE_URL',
  'HOLOREPO_DATABASE_URL',
] as const;

export interface SovereignMemoryEnvironmentStatus {
  configured: boolean;
  mode: 'connection-string' | 'fields' | 'unconfigured';
  connectionSource: string | null;
  credentialPresent: boolean;
  workspaceId: string;
}

export interface ResolvedSovereignMemoryEnvironment {
  config: SovereignMemoryConfig;
  status: SovereignMemoryEnvironmentStatus;
}

export interface SovereignMemoryRoundTripStore {
  ensureSchema(): Promise<SovereignMemorySchemaReceipt>;
  health(): Promise<SovereignMemoryHealth>;
  store(input: MemoryEntryInput): Promise<string>;
  recall(query: string, options?: RecallOptions): Promise<MemoryEntry[]>;
  forget(id: string): Promise<void>;
}

export interface SovereignMemoryRoundTripReceipt {
  schema: typeof SOVEREIGN_MEMORY_ROUND_TRIP_RECEIPT_SCHEMA;
  generatedAt: string;
  ok: boolean;
  workspaceId: string;
  schemaReceipt: SovereignMemorySchemaReceipt | null;
  health: SovereignMemoryHealth | null;
  probe: {
    authorAgent: string;
    entryId: string | null;
    tokenSha256: string;
    recalledCount: number;
    matched: boolean;
    cleanupAttempted: boolean;
    cleanupVerified: boolean;
  };
  events: Array<{
    stage: string;
    status: 'completed' | 'failed';
    at: string;
  }>;
  error: { name: string; code: string | null; message: string } | null;
  receiptHash: string;
}

function text(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function positiveInt(value: unknown, fallback: number): number {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function redactError(error: unknown): { name: string; code: string | null; message: string } {
  const candidate = error && typeof error === 'object' ? (error as Record<string, unknown>) : {};
  const message = String(candidate.message ?? error ?? 'unknown error')
    .replace(/postgres(?:ql)?:\/\/[^\s]+/giu, '[REDACTED_POSTGRES_URL]')
    .replace(/password\s*=\s*[^\s;]+/giu, 'password=[REDACTED]');
  return {
    name: text(candidate.name) ?? 'Error',
    code: text(candidate.code),
    message,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function resolveSovereignMemoryConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): ResolvedSovereignMemoryEnvironment {
  const workspaceId = text(env.MEMORY_WORKSPACE) ?? 'default';
  const connection = SOVEREIGN_MEMORY_CONNECTION_ENV_KEYS.map((key) => ({
    key,
    value: text(env[key]),
  })).find((entry) => entry.value);
  if (connection?.value) {
    return {
      config: { connectionString: connection.value, workspaceId },
      status: {
        configured: true,
        mode: 'connection-string',
        connectionSource: connection.key,
        credentialPresent: true,
        workspaceId,
      },
    };
  }

  const host = text(env.MEMORY_PGHOST);
  const password = text(env.MEMORY_PGPASSWORD);
  if (host) {
    return {
      config: {
        host,
        port: positiveInt(env.MEMORY_PGPORT, 5432),
        database: text(env.MEMORY_PGDATABASE) ?? 'knowledge',
        user: text(env.MEMORY_PGUSER) ?? 'memory_svc',
        password: password ?? undefined,
        workspaceId,
      },
      status: {
        configured: true,
        mode: 'fields',
        connectionSource: 'MEMORY_PGHOST',
        credentialPresent: Boolean(password),
        workspaceId,
      },
    };
  }

  return {
    config: { workspaceId },
    status: {
      configured: false,
      mode: 'unconfigured',
      connectionSource: null,
      credentialPresent: false,
      workspaceId,
    },
  };
}

export async function runSovereignMemoryRoundTrip({
  store,
  workspaceId = 'default',
  authorAgent = 'holoscript-memory-consumer',
  clock = () => new Date().toISOString(),
  idFactory = () => randomUUID(),
}: {
  store: SovereignMemoryRoundTripStore;
  workspaceId?: string;
  authorAgent?: string;
  clock?: () => string;
  idFactory?: () => string;
}): Promise<SovereignMemoryRoundTripReceipt> {
  const probeId = idFactory();
  const entryId = `P.MEMORY.${probeId}`;
  const token = `memory-round-trip-${probeId}`;
  const events: SovereignMemoryRoundTripReceipt['events'] = [];
  let schemaReceipt: SovereignMemorySchemaReceipt | null = null;
  let health: SovereignMemoryHealth | null = null;
  let storedEntryId: string | null = null;
  let recalledCount = 0;
  let matched = false;
  let cleanupAttempted = false;
  let cleanupVerified = false;
  let failure: SovereignMemoryRoundTripReceipt['error'] = null;

  const mark = (stage: string, status: 'completed' | 'failed') => {
    events.push({ stage, status, at: clock() });
  };

  try {
    schemaReceipt = await store.ensureSchema();
    mark('schema', 'completed');
    health = await store.health();
    if (!health.ok) throw new Error('memory schema health check failed after bootstrap');
    mark('health', 'completed');

    storedEntryId = await store.store({
      id: entryId,
      authorAgent,
      section: 'P',
      type: 'pattern',
      domain: 'consumer-proof',
      tags: ['public-package', 'postgres-round-trip'],
      confidence: 1,
      provenanceHash: `${SOVEREIGN_MEMORY_ROUND_TRIP_RECEIPT_SCHEMA}:${sha256(token)}`,
      content: `Sovereign memory public-package round trip ${token}`,
    });
    mark('store', 'completed');

    const recalled = await store.recall(token, { authorAgent, limit: 10 });
    recalledCount = recalled.length;
    matched = recalled.some((entry) => entry.id === storedEntryId);
    if (!matched) throw new Error('stored memory entry was not recalled by its probe token');
    mark('recall', 'completed');

    cleanupAttempted = true;
    await store.forget(storedEntryId);
    mark('cleanup', 'completed');
    const afterCleanup = await store.recall(token, { authorAgent, limit: 10 });
    cleanupVerified = !afterCleanup.some((entry) => entry.id === storedEntryId);
    if (!cleanupVerified) throw new Error('memory round-trip probe remained after cleanup');
    mark('cleanup-verify', 'completed');
  } catch (error) {
    failure = redactError(error);
    mark(events.at(-1)?.stage === 'cleanup' ? 'cleanup-verify' : 'round-trip', 'failed');
    if (storedEntryId && !cleanupAttempted) {
      cleanupAttempted = true;
      try {
        await store.forget(storedEntryId);
        const afterCleanup = await store.recall(token, { authorAgent, limit: 10 });
        cleanupVerified = !afterCleanup.some((entry) => entry.id === storedEntryId);
        mark('cleanup-after-failure', cleanupVerified ? 'completed' : 'failed');
      } catch {
        mark('cleanup-after-failure', 'failed');
      }
    }
  }

  const unsigned: Omit<SovereignMemoryRoundTripReceipt, 'receiptHash'> = {
    schema: SOVEREIGN_MEMORY_ROUND_TRIP_RECEIPT_SCHEMA,
    generatedAt: clock(),
    ok: Boolean(schemaReceipt?.ok && health?.ok && matched && cleanupVerified && !failure),
    workspaceId,
    schemaReceipt,
    health,
    probe: {
      authorAgent,
      entryId: storedEntryId,
      tokenSha256: sha256(token),
      recalledCount,
      matched,
      cleanupAttempted,
      cleanupVerified,
    },
    events,
    error: failure,
  };
  return {
    ...unsigned,
    receiptHash: `sha256:${sha256(JSON.stringify(unsigned))}`,
  };
}
