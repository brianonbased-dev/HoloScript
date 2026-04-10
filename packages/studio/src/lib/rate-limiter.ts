/**
 * Simple in-memory sliding-window rate limiter for Next.js API routes.
 *
 * Designed for Studio-side protection against runaway agents spamming the
 * board endpoints before the request even reaches the MCP server.
 *
 * Usage:
 *   const result = rateLimit(req, { windowMs: 60_000, max: 20 });
 *   if (!result.ok) return result.response;
 */

import { NextRequest, NextResponse } from 'next/server';

interface RateLimitOptions {
  /** Length of the sliding window in milliseconds. Default: 60 000 (1 min). */
  windowMs?: number;
  /** Maximum number of requests allowed within the window. */
  max: number;
  /** Human-readable description used in the 429 message. */
  label?: string;
}

interface RateLimitResult {
  ok: true;
  remaining: number;
  reset: number;
}
interface RateLimitBlocked {
  ok: false;
  response: NextResponse;
}

type RateLimitOutcome = RateLimitResult | RateLimitBlocked;

// ---------------------------------------------------------------------------
// Internal store — one Map per process lifetime (fine for Next.js edge-like
// serverless workers that restart regularly).
// ---------------------------------------------------------------------------

interface BucketEntry {
  timestamps: number[];
}

const store = new Map<string, BucketEntry>();

/** Evict expired entries every 5 minutes so the map doesn't grow unbounded. */
let lastEvict = Date.now();
function maybeEvict(windowMs: number) {
  const now = Date.now();
  if (now - lastEvict < 300_000) return;
  lastEvict = now;
  const cutoff = now - windowMs;
  for (const [key, bucket] of store) {
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
    if (bucket.timestamps.length === 0) store.delete(key);
  }
}

// ---------------------------------------------------------------------------
// Key derivation: IP + (Authorization key if present) for write endpoints.
// ---------------------------------------------------------------------------

function deriveKey(req: NextRequest, suffix: string): string {
  const ip =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    req.headers.get('x-real-ip') ??
    'unknown';
  // Include a hash of the auth key so different agents share separate limits.
  const authKey = req.headers.get('authorization')?.slice(-12) ?? '';
  return `${suffix}:${ip}:${authKey}`;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export function rateLimit(
  req: NextRequest,
  options: RateLimitOptions,
  keySuffix = 'default',
): RateLimitOutcome {
  const { max, windowMs = 60_000, label = 'Too many requests' } = options;
  const now = Date.now();
  const cutoff = now - windowMs;

  maybeEvict(windowMs);

  const key = deriveKey(req, keySuffix);
  let bucket = store.get(key);
  if (!bucket) {
    bucket = { timestamps: [] };
    store.set(key, bucket);
  }

  // Slide the window — drop timestamps older than cutoff.
  bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

  const count = bucket.timestamps.length;

  if (count >= max) {
    const oldestInWindow = bucket.timestamps[0] ?? now;
    const reset = Math.ceil((oldestInWindow + windowMs) / 1000);
    return {
      ok: false,
      response: NextResponse.json(
        { error: label, retryAfter: reset - Math.floor(now / 1000) },
        {
          status: 429,
          headers: {
            'X-RateLimit-Limit': String(max),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(reset),
            'Retry-After': String(reset - Math.floor(now / 1000)),
          },
        },
      ),
    };
  }

  bucket.timestamps.push(now);
  const remaining = max - bucket.timestamps.length;
  const reset = Math.ceil((now + windowMs) / 1000);

  return { ok: true, remaining, reset };
}

// ---------------------------------------------------------------------------
// Pre-built limiters used by the board routes
// ---------------------------------------------------------------------------

/** Write operations: 20 PATCH/POST per minute per IP+key */
export function boardWriteLimit(req: NextRequest, teamId: string) {
  return rateLimit(req, { max: 20, windowMs: 60_000, label: 'Too many board write operations. Retry after the window resets.' }, `board-write:${teamId}`);
}

/** Read operations: 120 GETs per minute per IP+key */
export function boardReadLimit(req: NextRequest, teamId: string) {
  return rateLimit(req, { max: 120, windowMs: 60_000, label: 'Too many board read requests.' }, `board-read:${teamId}`);
}
