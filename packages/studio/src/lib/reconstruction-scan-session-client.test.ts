import { describe, expect, it } from 'vitest';
import {
  SCAN_SESSION_STORAGE_KEY,
  clearStoredScanSession,
  readStoredScanSession,
  writeStoredScanSession,
  type ScanSessionResponse,
} from './reconstruction-scan-session-client';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
}

function activeSession(overrides: Partial<ScanSessionResponse> = {}): ScanSessionResponse {
  return {
    token: 'scan-token',
    mobileUrl: 'https://studio.example/scan-room/mobile/scan-token',
    expiresAt: new Date(Date.now() + 60_000).toISOString(),
    ...overrides,
  };
}

describe('reconstruction scan session client storage', () => {
  it('persists and restores an active scan session', () => {
    const storage = memoryStorage();
    const session = activeSession();

    writeStoredScanSession(session, storage);

    expect(readStoredScanSession(storage)).toEqual(session);
  });

  it('clears expired sessions during restore', () => {
    const storage = memoryStorage();
    storage.setItem(
      SCAN_SESSION_STORAGE_KEY,
      JSON.stringify(activeSession({ expiresAt: new Date(Date.now() - 1_000).toISOString() })),
    );

    expect(readStoredScanSession(storage)).toBeNull();
    expect(storage.getItem(SCAN_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('clears malformed sessions during restore', () => {
    const storage = memoryStorage();
    storage.setItem(SCAN_SESSION_STORAGE_KEY, JSON.stringify({ token: 'scan-token' }));

    expect(readStoredScanSession(storage)).toBeNull();
    expect(storage.getItem(SCAN_SESSION_STORAGE_KEY)).toBeNull();
  });

  it('removes a stored session on request', () => {
    const storage = memoryStorage();
    writeStoredScanSession(activeSession(), storage);

    clearStoredScanSession(storage);

    expect(storage.getItem(SCAN_SESSION_STORAGE_KEY)).toBeNull();
  });
});
