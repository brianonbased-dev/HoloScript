export const runtime = 'nodejs';

/**
 * GET /api/hologram/:hash/:asset
 *
 * Serves bytes for an allow-listed bundle asset with long-cache headers.
 * Public read: content-addressed paths; uploads remain authenticated separately.
 */

import { NextResponse } from 'next/server';

import {
  ASSET_CONTENT_TYPES,
  assertValidAssetName,
  assertValidHash,
  HologramStoreError,
} from '@holoscript/engine/hologram';

import { getHologramStore } from '../../_lib/store';

const CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function GET(
  _request: Request,
  context: { params: Promise<{ hash: string; asset: string }> }
) {
  const { hash, asset: assetParam } = await context.params;

  try {
    assertValidHash(hash);
    assertValidAssetName(assetParam);
  } catch (err) {
    if (err instanceof HologramStoreError && err.code === 'invalid_hash') {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    if (err instanceof HologramStoreError && err.code === 'invalid_asset') {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 400 });
    }
    throw err;
  }

  const store = getHologramStore();
  let bytes: Uint8Array | null;
  try {
    bytes = await store.getAsset(hash, assetParam);
  } catch (err) {
    if (err instanceof HologramStoreError) {
      return NextResponse.json({ error: err.message, code: err.code }, { status: 500 });
    }
    throw err;
  }

  if (!bytes) {
    return NextResponse.json({ error: 'Not found', code: 'not_found' }, { status: 404 });
  }

  const contentType = ASSET_CONTENT_TYPES[assetParam];

  return new NextResponse(Buffer.from(bytes), {
    status: 200,
    headers: {
      'Content-Type': contentType,
      'Cache-Control': CACHE_CONTROL,
    },
  });
}
