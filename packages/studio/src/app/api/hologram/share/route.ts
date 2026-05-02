export const runtime = 'nodejs';

/**
 * POST /api/hologram/share
 *
 * Create a share record for an existing HoloGram bundle. Idempotent: if a
 * share record already exists for the given hash, returns the existing record.
 *
 * Wave B Stream 5: share URL infrastructure (task_1776813797701_zi8i).
 *
 * Request body:
 *   { hash: string, ttlSeconds?: number }
 *
 * Response:
 *   200 { hash, url, expiresAt, createdAt, viewCount }
 *   400 { error, code } — invalid hash or TTL
 *   401 — unauthorized (requires auth or worker token)
 *   404 { error, code } — bundle not found in store
 *
 * GET /api/hologram/share?hash=<hash>
 *
 * Query the share status for a HoloGram. Returns 200 with the share record
 * (including expiry status) or 404 if no share record exists.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import { assertValidHash, HologramStoreError } from '@holoscript/engine/hologram';

import { authorizeHologramUpload } from '../../_lib/authorizeUpload';
import { getHologramStore, getShareRegistry } from '../../_lib/store';

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

// ── POST: create or return existing share ────────────────────────────────────

export async function POST(request: NextRequest) {
  const denied = await authorizeHologramUpload(request);
  if (denied) return denied;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  if (!body || typeof body !== 'object') {
    return jsonError(400, 'Request body must be a JSON object', 'invalid_body');
  }

  const obj = body as Record<string, unknown>;
  const hash = typeof obj.hash === 'string' ? obj.hash.trim() : '';
  const ttlSeconds = typeof obj.ttlSeconds === 'number' ? obj.ttlSeconds : undefined;

  if (!hash || !HASH_PATTERN.test(hash)) {
    return jsonError(400, '`hash` must be a 64-char lowercase hex string', 'invalid_hash');
  }

  if (ttlSeconds !== undefined && (!Number.isFinite(ttlSeconds) || ttlSeconds < 0)) {
    return jsonError(400, '`ttlSeconds` must be a non-negative number', 'invalid_ttl');
  }

  // Verify the bundle exists in the store before creating a share record
  const store = getHologramStore();
  let exists: boolean;
  try {
    exists = await store.has(hash);
  } catch (err) {
    if (err instanceof HologramStoreError) {
      return jsonError(400, err.message, err.code);
    }
    throw err;
  }

  if (!exists) {
    return jsonError(404, 'Bundle not found', 'not_found');
  }

  const registry = getShareRegistry();

  // Validate TTL against registry max
  if (ttlSeconds !== undefined && ttlSeconds > registry.getMaxTtl()) {
    return jsonError(
      400,
      `ttlSeconds exceeds maximum (${registry.getMaxTtl()}s)`,
      'ttl_exceeds_max'
    );
  }

  const record = await registry.createShare({
    hash,
    ttlSeconds,
  });

  return NextResponse.json({
    hash: record.hash,
    url: `/g/${record.hash}`,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    viewCount: record.viewCount,
  });
}

// ── GET: query share status ───────────────────────────────────────────────────

export async function GET(request: NextRequest) {
  const hash = request.nextUrl.searchParams.get('hash')?.trim() ?? '';

  if (!hash || !HASH_PATTERN.test(hash)) {
    return jsonError(400, '`hash` query parameter must be a 64-char lowercase hex string', 'invalid_hash');
  }

  const registry = getShareRegistry();
  const { record, expired } = await registry.getShareStatus(hash);

  if (!record) {
    // No share record = bundle was never shared, but is still accessible
    // via content-addressed URL if it exists in the store.
    return NextResponse.json({
      hash,
      shared: false,
      expired: false,
    });
  }

  return NextResponse.json({
    hash: record.hash,
    url: `/g/${record.hash}`,
    shared: true,
    expired,
    createdAt: record.createdAt,
    expiresAt: record.expiresAt,
    viewCount: record.viewCount,
    createdBy: record.createdBy,
  });
}