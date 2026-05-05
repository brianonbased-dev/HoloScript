import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  __resetScanSessionStoreForTests,
  getScanSessionStore,
  type ScanSession,
} from './reconstruction-scan-store';

let sessionDir: string | null = null;

function session(overrides: Partial<ScanSession> = {}): ScanSession {
  return {
    token: 'scan_token_file_store',
    createdAt: new Date('2026-05-05T00:00:00.000Z').toISOString(),
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    status: 'pending-phone',
    weightStrategy: 'distill',
    ...overrides,
  };
}

describe('reconstruction scan session store', () => {
  beforeEach(async () => {
    sessionDir = await mkdtemp(join(tmpdir(), 'studio-scan-store-test-'));
    vi.stubEnv('STUDIO_SCAN_SESSION_DIR', sessionDir);
    vi.stubEnv('STUDIO_SCAN_SESSION_STORE', 'file');
    vi.stubEnv('UPSTASH_REDIS_URL', '');
    vi.stubEnv('UPSTASH_REDIS_TOKEN', '');
    __resetScanSessionStoreForTests();
  });

  afterEach(async () => {
    __resetScanSessionStoreForTests();
    vi.unstubAllEnvs();
    if (sessionDir) {
      await rm(sessionDir, { recursive: true, force: true });
      sessionDir = null;
    }
  });

  it('persists sessions across store reinitialization', async () => {
    const firstStore = getScanSessionStore();
    const record = session({ status: 'phone-connected' });

    expect(firstStore.mode).toBe('file');
    await firstStore.set(record.token, record);

    __resetScanSessionStoreForTests();
    const secondStore = getScanSessionStore();

    await expect(secondStore.get(record.token)).resolves.toEqual(record);
  });

  it('prunes expired file-backed sessions', async () => {
    const store = getScanSessionStore();
    const record = session({
      token: 'scan_token_expired',
      expiresAt: new Date(Date.now() - 1_000).toISOString(),
    });

    await store.set(record.token, record);
    await store.pruneExpired();

    await expect(store.get(record.token)).resolves.toBeUndefined();
  });
});
