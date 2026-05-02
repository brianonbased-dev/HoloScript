/**
 * /g/[hash] — server-side bundle load helper.
 *
 * Extracted from page.tsx so the function is reusable in tests without
 * exporting non-standard symbols from a Next.js page module (Next 16
 * strict-page-type rejects any export beyond the canonical surface
 * default/metadata/runtime/dynamic/revalidate/etc).
 *
 * SECURITY:
 *   - Hash is validated by `assertValidHash` before any path is constructed.
 *   - URL query params are NEVER read here.
 *   - meta.json is parsed by the store (not by us); the page re-sanitizes
 *     before passing to the client renderer.
 *
 * WAVE B STREAM 5: expiry policy — loadBundle now checks the share registry.
 * If a share record exists and has expired, returns { expired: true } instead
 * of the bundle. The page component renders a 410 Gone response for expired
 * grams. Grams with no share record are always accessible (content-addressed
 * permanent links).
 */

import type { HologramMeta } from '@holoscript/engine/hologram';
import {
  assertValidHash,
  HologramStoreError,
} from '@holoscript/engine/hologram';

import { getHologramStore, getShareRegistry } from '@/app/api/hologram/_lib/store';

export interface LoadedBundle {
  hash: string;
  meta: HologramMeta;
  hasQuilt: boolean;
  hasMvhevc: boolean;
  hasParallax: boolean;
}

/**
 * Result of loading a bundle for the viewer page. If the share has expired,
 * `expired` is true and `bundle` is null. If the hash is invalid or the
 * bundle doesn't exist, both are null. Otherwise `bundle` contains the
 * loaded metadata and `expired` is false.
 */
export interface LoadResult {
  bundle: LoadedBundle | null;
  expired: boolean;
}

export async function loadBundle(rawHash: unknown): Promise<LoadResult> {
  // Validate before any I/O. assertValidHash throws HologramStoreError
  // (code 'invalid_hash') for anything that isn't 64 lowercase hex.
  try {
    assertValidHash(rawHash);
  } catch (err) {
    if (err instanceof HologramStoreError) return { bundle: null, expired: false };
    throw err;
  }
  const hash = rawHash; // narrowed to string by assertion

  // Wave B Stream 5: check share expiry before loading the bundle.
  const registry = getShareRegistry();
  const { expired } = await registry.getShareStatus(hash);
  if (expired) {
    return { bundle: null, expired: true };
  }

  const store = getHologramStore();

  let meta: HologramMeta | null;
  try {
    meta = await store.getMeta(hash);
  } catch (err) {
    if (err instanceof HologramStoreError) return { bundle: null, expired: false };
    throw err;
  }
  if (!meta) return { bundle: null, expired: false };

  // We don't load the depth/normal binary blobs server-side — the client
  // viewer fetches them lazily via /api/hologram/<hash>/<asset>. We DO
  // need to know which optional renderer outputs exist so the viewer can
  // pick a path. Existence checks are cheap (HEAD-equivalent).
  const [quilt, mvhevc, parallax] = await Promise.all([
    store.getAsset(hash, 'quilt.png').then((b) => b !== null).catch(() => false),
    store.getAsset(hash, 'mvhevc.mp4').then((b) => b !== null).catch(() => false),
    store
      .getAsset(hash, 'parallax.webm')
      .then((b) => b !== null)
      .catch(() => false),
  ]);

  return {
    bundle: {
      hash,
      meta,
      hasQuilt: quilt,
      hasMvhevc: mvhevc,
      hasParallax: parallax,
    },
    expired: false,
  };
}
