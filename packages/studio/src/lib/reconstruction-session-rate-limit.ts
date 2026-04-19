/**
 * Lightweight in-memory rate limits for reconstruction scan session API routes.
 * Resets on server restart; pair with CDN / edge limits in production.
 */

type Bucket = { timestamps: number[] };

declare global {
  // eslint-disable-next-line no-var
  var __reconstructionSessionRateBuckets__: Map<string, Bucket> | undefined;
}

const buckets: Map<string, Bucket> =
  globalThis.__reconstructionSessionRateBuckets__ ??
  (globalThis.__reconstructionSessionRateBuckets__ = new Map());

function prune(bucket: Bucket, windowMs: number, now: number): void {
  bucket.timestamps = bucket.timestamps.filter((t) => now - t < windowMs);
}

export function takeRateLimitToken(
  key: string,
  maxPerWindow: number,
  windowMs: number,
): { ok: true } | { ok: false; retryAfterSec: number } {
  const now = Date.now();
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    buckets.set(key, bucket);
  }
  prune(bucket, windowMs, now);
  if (bucket.timestamps.length >= maxPerWindow) {
    const oldest = bucket.timestamps[0] ?? now;
    const retryAfterMs = windowMs - (now - oldest);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }
  bucket.timestamps.push(now);
  return { ok: true };
}

export function clientIpFromRequest(request: Request): string {
  const xf = request.headers.get('x-forwarded-for');
  if (xf) {
    const first = xf.split(',')[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get('x-real-ip');
  if (realIp?.trim()) return realIp.trim();
  return 'unknown';
}
