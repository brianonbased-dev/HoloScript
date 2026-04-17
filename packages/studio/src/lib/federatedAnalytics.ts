/**
 * Federated / privacy-preserving analytics for Studio.
 *
 * When `NEXT_PUBLIC_FEDERATED_ANALYTICS_URL` is set, event counts are aggregated
 * locally (plus a random install id). Only aggregates are POSTed — no per-event
 * raw payloads. Works alongside PostHog when both are configured.
 *
 * Env:
 *   NEXT_PUBLIC_FEDERATED_ANALYTICS_URL — HTTPS endpoint accepting JSON POST
 */

const STORAGE_AGG = 'holoscript_federated_aggregates_v1';
const STORAGE_INSTALL = 'holoscript_federated_install_id';

let memoryCounts: Record<string, number> = {};
let windowStartMs = 0;
let initialized = false;

function safeRandomId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

export function getFederatedEndpoint(): string | undefined {
  if (typeof process === 'undefined') return undefined;
  return process.env.NEXT_PUBLIC_FEDERATED_ANALYTICS_URL;
}

export function isFederatedAnalyticsEnabled(): boolean {
  return Boolean(getFederatedEndpoint());
}

/**
 * Call once on client boot when federated URL may be present.
 */
export function initFederatedAnalytics(): void {
  if (typeof window === 'undefined') return;
  if (!getFederatedEndpoint()) return;
  if (initialized) return;
  initialized = true;
  windowStartMs = Date.now();
  try {
    const raw = localStorage.getItem(STORAGE_AGG);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, number>;
      memoryCounts = { ...parsed };
    }
  } catch {
    // ignore corrupt storage
  }
}

export function getOrCreateInstallId(): string {
  if (typeof window === 'undefined') return 'ssr';
  try {
    let id = localStorage.getItem(STORAGE_INSTALL);
    if (!id) {
      id = safeRandomId();
      localStorage.setItem(STORAGE_INSTALL, id);
    }
    return id;
  } catch {
    return safeRandomId();
  }
}

export function recordFederatedEvent(eventName: string): void {
  if (!getFederatedEndpoint()) return;
  if (typeof window === 'undefined') return;
  initFederatedAnalytics();
  memoryCounts[eventName] = (memoryCounts[eventName] ?? 0) + 1;
  try {
    localStorage.setItem(STORAGE_AGG, JSON.stringify(memoryCounts));
  } catch {
    // quota — still keep in-memory counts for this session
  }
}

export interface FederatedFlushPayload {
  aggregates: Record<string, number>;
  windowStart: number;
  windowEnd: number;
  installId: string;
}

/**
 * POST aggregated counts to the configured endpoint. Clears local buffer on success.
 * @returns true if flushed successfully or nothing to send
 */
export async function flushFederatedAnalytics(): Promise<boolean> {
  const url = getFederatedEndpoint();
  if (!url || typeof window === 'undefined') return true;

  initFederatedAnalytics();

  const aggregates = { ...memoryCounts };
  const keys = Object.keys(aggregates);
  if (keys.length === 0) return true;

  const windowEnd = Date.now();
  const payload: FederatedFlushPayload = {
    aggregates,
    windowStart: windowStartMs || windowEnd,
    windowEnd,
    installId: getOrCreateInstallId(),
  };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) return false;
    memoryCounts = {};
    windowStartMs = Date.now();
    try {
      localStorage.removeItem(STORAGE_AGG);
    } catch {
      /* empty */
    }
    return true;
  } catch {
    return false;
  }
}

/** @internal testing */
export function _resetFederatedAnalyticsForTests(): void {
  memoryCounts = {};
  windowStartMs = 0;
  initialized = false;
}
