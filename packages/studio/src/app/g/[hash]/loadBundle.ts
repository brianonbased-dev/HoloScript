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
 */

import type { HologramMeta } from '@holoscript/engine/hologram';
import {
  assertValidHash,
  HologramStoreError,
} from '@holoscript/engine/hologram';

import { getHologramStore } from '@/app/api/hologram/_lib/store';

export interface LoadedBundle {
  hash: string;
  meta: HologramMeta;
  hasQuilt: boolean;
  hasMvhevc: boolean;
  hasParallax: boolean;
}

export async function loadBundle(rawHash: unknown): Promise<LoadedBundle | null> {
  // Validate before any I/O. assertValidHash throws HologramStoreError
  // (code 'invalid_hash') for anything that isn't 64 lowercase hex.
  try {
    assertValidHash(rawHash);
  } catch (err) {
    if (err instanceof HologramStoreError) return null;
    throw err;
  }
  const hash = rawHash; // narrowed to string by assertion

  const store = getHologramStore();

  let meta: HologramMeta | null;
  try {
    meta = await store.getMeta(hash);
  } catch (err) {
    if (err instanceof HologramStoreError) return null;
    throw err;
  }
  if (!meta) return null;

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
    hash,
    meta,
    hasQuilt: quilt,
    hasMvhevc: mvhevc,
    hasParallax: parallax,
  };
}
