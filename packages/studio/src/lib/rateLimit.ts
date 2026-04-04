/**
 * In-memory sliding window rate limiter.
 * Tracks request timestamps per IP within a 1-minute window.
 * No external dependencies (no Redis) — suitable for single-instance deployments.
 */

const WINDOW_MS = 60_000; // 1 minute

const requests = new Map<string, number[]>();

export function rateLimit(
  ip: string,
  maxRequests: number
): { allowed: boolean; remaining: number; retryAfter?: number } {
  const now = Date.now();
  const windowStart = now - WINDOW_MS;

  const timestamps = (requests.get(ip) || []).filter((t) => t > windowStart);

  if (timestamps.length >= maxRequests) {
    const oldestInWindow = timestamps[0];
    const retryAfter = Math.ceil((oldestInWindow + WINDOW_MS - now) / 1000);
    return { allowed: false, remaining: 0, retryAfter };
  }

  timestamps.push(now);
  requests.set(ip, timestamps);

  // Periodic cleanup — every ~100 calls, purge stale entries
  if (Math.random() < 0.01) {
    for (const [key, ts] of requests) {
      if (ts.every((t) => t < windowStart)) requests.delete(key);
    }
  }

  return { allowed: true, remaining: maxRequests - timestamps.length };
}
