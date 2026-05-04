'use client';

export interface ScanSessionResponse {
  token: string;
  mobileUrl: string;
  expiresAt: string;
}

type ScanSessionStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export const SCAN_SESSION_STORAGE_KEY = 'holoscript:scan-room:last-session';

export function isScanSessionResponse(value: unknown): value is ScanSessionResponse {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as { token?: unknown; mobileUrl?: unknown; expiresAt?: unknown };
  return (
    typeof candidate.token === 'string' &&
    typeof candidate.mobileUrl === 'string' &&
    typeof candidate.expiresAt === 'string'
  );
}

function currentScanSessionStorage(): ScanSessionStorage | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage;
}

function isExpiredSession(session: ScanSessionResponse): boolean {
  const expiresAtMs = new Date(session.expiresAt).getTime();
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= Date.now();
}

export function readStoredScanSession(
  storage: ScanSessionStorage | null = currentScanSessionStorage(),
): ScanSessionResponse | null {
  if (!storage) return null;

  try {
    const raw = storage.getItem(SCAN_SESSION_STORAGE_KEY);
    if (!raw) return null;

    const parsed: unknown = JSON.parse(raw);
    if (!isScanSessionResponse(parsed) || isExpiredSession(parsed)) {
      storage.removeItem(SCAN_SESSION_STORAGE_KEY);
      return null;
    }

    return parsed;
  } catch {
    try {
      storage.removeItem(SCAN_SESSION_STORAGE_KEY);
    } catch {
      // no-op
    }
    return null;
  }
}

export function writeStoredScanSession(
  session: ScanSessionResponse,
  storage: ScanSessionStorage | null = currentScanSessionStorage(),
): void {
  if (!storage) return;

  try {
    storage.setItem(SCAN_SESSION_STORAGE_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable in private modes; polling still works for the current render.
  }
}

export function clearStoredScanSession(
  storage: ScanSessionStorage | null = currentScanSessionStorage(),
): void {
  if (!storage) return;

  try {
    storage.removeItem(SCAN_SESSION_STORAGE_KEY);
  } catch {
    // no-op
  }
}
