import { describe, it, expect } from 'vitest';
import {
  createExportSession,
  deserializeExportSession,
  isExportSessionExpired,
  markExportSessionFinalized,
  markExportSessionPackaged,
  pruneExpiredExportSessions,
  registerIdempotencyKey,
  serializeExportSession,
} from '../export-session';
import type { ExportSession } from '../types';

describe('export-session foundation', () => {
  it('creates session with deterministic ttl window and nonce', () => {
    const now = 1_000;
    const session = createExportSession('user-a', { ttlMs: 5_000, now: () => now });

    expect(session.userId).toBe('user-a');
    expect(session.createdAt).toBe(now);
    expect(session.expiresAt).toBe(now + 5_000);
    expect(session.status).toBe('prepared');
    expect(session.serverNonce).toHaveLength(64);
    expect(session.idempotencyKeys.size).toBe(0);
  });

  it('evaluates ttl expiry from explicit clock', () => {
    const session = createExportSession('user-b', { ttlMs: 100, now: () => 0 });
    expect(isExportSessionExpired(session, 100)).toBe(false);
    expect(isExportSessionExpired(session, 101)).toBe(true);
  });

  it('prunes only expired sessions', () => {
    const store = new Map<string, ExportSession>();
    const fresh = createExportSession('fresh', { ttlMs: 1_000, now: () => 0 });
    const stale = createExportSession('stale', { ttlMs: 10, now: () => 0 });

    store.set(fresh.sessionId, fresh);
    store.set(stale.sessionId, stale);

    const pruned = pruneExpiredExportSessions(store, 11);
    expect(pruned).toBe(1);
    expect(store.has(stale.sessionId)).toBe(false);
    expect(store.has(fresh.sessionId)).toBe(true);
  });

  it('tracks idempotency keys and flags replay', () => {
    const session = createExportSession('user-c', { ttlMs: 1_000, now: () => 100 });

    expect(registerIdempotencyKey(session, 'idem-1', 150)).toBe('accepted');
    expect(registerIdempotencyKey(session, 'idem-1', 160)).toBe('replay');
    expect(registerIdempotencyKey(session, '   ', 170)).toBe('missing');
  });

  it('rejects idempotency registration once session consumed', () => {
    const session = createExportSession('user-d', { ttlMs: 2_000, now: () => 0 });
    markExportSessionFinalized(session, 500);

    expect(registerIdempotencyKey(session, 'idem-2', 600)).toBe('consumed');
  });

  it('rejects idempotency registration once session expired', () => {
    const session = createExportSession('user-e', { ttlMs: 100, now: () => 0 });

    expect(registerIdempotencyKey(session, 'idem-3', 150)).toBe('expired');
    expect(session.status).toBe('expired');
  });

  it('serializes and deserializes session with idempotency keys', () => {
    const session = createExportSession('user-f', { ttlMs: 5_000, now: () => 1_000 });
    registerIdempotencyKey(session, 'idem-a', 1_100);
    registerIdempotencyKey(session, 'idem-b', 1_200);
    markExportSessionPackaged(session, 'sha256:abc');

    const serialized = serializeExportSession(session);
    expect(Array.isArray(serialized.idempotencyKeys)).toBe(true);
    expect(serialized.idempotencyKeys).toEqual(expect.arrayContaining(['idem-a', 'idem-b']));

    const restored = deserializeExportSession(serialized);
    expect(restored).not.toBeNull();
    expect(restored?.idempotencyKeys.has('idem-a')).toBe(true);
    expect(restored?.idempotencyKeys.has('idem-b')).toBe(true);
    expect(restored?.status).toBe('packaged');
    expect(restored?.packageManifestHash).toBe('sha256:abc');
  });

  it('returns null for malformed serialized session', () => {
    expect(deserializeExportSession({})).toBeNull();
    expect(deserializeExportSession({ sessionId: 'x' })).toBeNull();
  });
});
