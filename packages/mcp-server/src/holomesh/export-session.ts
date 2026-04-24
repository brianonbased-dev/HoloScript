import * as crypto from 'crypto';
import type { ExportSession, SerializedExportSession } from './types';

const DEFAULT_EXPORT_SESSION_TTL_MS = 15 * 60 * 1000;

export interface ExportSessionConfig {
  ttlMs?: number;
  now?: () => number;
}

export type IdempotencyRegistrationResult =
  | 'accepted'
  | 'replay'
  | 'expired'
  | 'consumed'
  | 'missing';

function normalizeTtlMs(ttlMs?: number): number {
  if (!Number.isFinite(ttlMs) || (ttlMs as number) <= 0) return DEFAULT_EXPORT_SESSION_TTL_MS;
  return Math.floor(ttlMs as number);
}

function getNow(config?: ExportSessionConfig): number {
  return config?.now ? config.now() : Date.now();
}

export function createExportSession(userId: string, config: ExportSessionConfig = {}): ExportSession {
  const now = getNow(config);
  const ttlMs = normalizeTtlMs(config.ttlMs);

  return {
    sessionId: crypto.randomUUID(),
    userId,
    createdAt: now,
    expiresAt: now + ttlMs,
    status: 'prepared',
    serverNonce: crypto.randomBytes(32).toString('hex'),
    idempotencyKeys: new Set<string>(),
  };
}

export function isExportSessionExpired(session: ExportSession, now = Date.now()): boolean {
  return now > session.expiresAt;
}

export function markExportSessionPackaged(
  session: ExportSession,
  manifestHash?: string
): ExportSession {
  if (session.status !== 'expired' && session.status !== 'finalized') {
    session.status = 'packaged';
  }
  if (manifestHash && manifestHash.trim()) {
    session.packageManifestHash = manifestHash.trim();
  }
  return session;
}

export function markExportSessionFinalized(session: ExportSession, now = Date.now()): ExportSession {
  session.status = 'finalized';
  session.consumedAt = now;
  return session;
}

export function registerIdempotencyKey(
  session: ExportSession,
  idempotencyKey: string | undefined,
  now = Date.now()
): IdempotencyRegistrationResult {
  const normalized = (idempotencyKey || '').trim();
  if (!normalized) return 'missing';

  if (session.status === 'finalized') return 'consumed';

  if (isExportSessionExpired(session, now)) {
    session.status = 'expired';
    return 'expired';
  }

  if (session.idempotencyKeys.has(normalized)) return 'replay';

  session.idempotencyKeys.add(normalized);
  return 'accepted';
}

export function pruneExpiredExportSessions(
  store: Map<string, ExportSession>,
  now = Date.now()
): number {
  let pruned = 0;
  for (const [sessionId, session] of store.entries()) {
    if (isExportSessionExpired(session, now)) {
      session.status = 'expired';
      store.delete(sessionId);
      pruned++;
    }
  }
  return pruned;
}

export function serializeExportSession(session: ExportSession): SerializedExportSession {
  return {
    ...session,
    idempotencyKeys: Array.from(session.idempotencyKeys.values()),
  };
}

export function deserializeExportSession(raw: unknown): ExportSession | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Partial<SerializedExportSession>;

  if (!candidate.sessionId || !candidate.userId || !candidate.serverNonce) return null;
  if (!Number.isFinite(candidate.createdAt) || !Number.isFinite(candidate.expiresAt)) return null;
  if (!candidate.status || !['prepared', 'packaged', 'finalized', 'expired'].includes(candidate.status)) {
    return null;
  }

  const idempotencyKeys = Array.isArray(candidate.idempotencyKeys)
    ? candidate.idempotencyKeys.filter((k): k is string => typeof k === 'string' && k.trim().length > 0)
    : [];

  return {
    sessionId: candidate.sessionId,
    userId: candidate.userId,
    createdAt: candidate.createdAt,
    expiresAt: candidate.expiresAt,
    status: candidate.status,
    serverNonce: candidate.serverNonce,
    idempotencyKeys: new Set(idempotencyKeys),
    consumedAt: Number.isFinite(candidate.consumedAt) ? candidate.consumedAt : undefined,
    packageManifestHash:
      typeof candidate.packageManifestHash === 'string' ? candidate.packageManifestHash : undefined,
  };
}
