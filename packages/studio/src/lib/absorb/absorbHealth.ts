/**
 * Cheap absorb-service health probe for Studio's /api/health.
 *
 * Repo import and the absorb daemon both depend on absorb. When it is down or
 * Studio is not configured to reach it, /api/health must say so ("degraded")
 * instead of reporting healthy while every import 502s.
 *
 * One GET to absorb's own /health with a short timeout, memoized briefly so a
 * health poller cannot turn into load on absorb. The key is never sent and
 * never echoed: only whether one is configured.
 */

export type AbsorbHealthStatus = 'ok' | 'misconfigured' | 'unreachable' | 'unhealthy';

export interface AbsorbHealth {
  status: AbsorbHealthStatus;
  degraded: boolean;
  /** Origin only (no path, no credentials). */
  origin?: string;
  httpStatus?: number;
  latencyMs?: number;
  reason?: string;
}

export interface AbsorbHealthOptions {
  baseUrl: string | undefined;
  apiKeyConfigured: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

export const ABSORB_HEALTH_TIMEOUT_MS = 1500;
export const ABSORB_HEALTH_CACHE_MS = 15_000;

export async function checkAbsorbHealth(opts: AbsorbHealthOptions): Promise<AbsorbHealth> {
  let url: URL;
  try {
    url = new URL(opts.baseUrl ?? '');
    if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error('protocol');
  } catch {
    return { status: 'misconfigured', degraded: true, reason: 'ABSORB_SERVICE_URL is not an http(s) URL' };
  }
  const origin = url.origin;
  if (!opts.apiKeyConfigured) {
    return { status: 'misconfigured', degraded: true, origin, reason: 'no absorb API key configured' };
  }

  const fetchImpl = opts.fetchImpl ?? fetch;
  const started = Date.now();
  try {
    const res = await fetchImpl(`${origin}/health`, {
      method: 'GET',
      cache: 'no-store',
      signal: AbortSignal.timeout(opts.timeoutMs ?? ABSORB_HEALTH_TIMEOUT_MS),
    });
    const latencyMs = Date.now() - started;
    if (!res.ok) {
      return { status: 'unhealthy', degraded: true, origin, httpStatus: res.status, latencyMs };
    }
    return { status: 'ok', degraded: false, origin, httpStatus: res.status, latencyMs };
  } catch (err) {
    const name = err instanceof Error ? err.name : '';
    return {
      status: 'unreachable',
      degraded: true,
      origin,
      latencyMs: Date.now() - started,
      reason: name === 'TimeoutError' || name === 'AbortError' ? 'timed out' : 'connection failed',
    };
  }
}

let cached: { at: number; value: Promise<AbsorbHealth> } | null = null;

/** Memoized for ABSORB_HEALTH_CACHE_MS; concurrent callers share one probe. */
export function getAbsorbHealthCached(opts: AbsorbHealthOptions, now = Date.now()): Promise<AbsorbHealth> {
  if (cached && now - cached.at < ABSORB_HEALTH_CACHE_MS) return cached.value;
  cached = { at: now, value: checkAbsorbHealth(opts) };
  return cached.value;
}

/** Test hook. */
export function resetAbsorbHealthCache(): void {
  cached = null;
}
