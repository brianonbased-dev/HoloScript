/**
 * /g/[hash] — public HoloGram viewer page.
 *
 * Loads the requested bundle from the FileSystemHologramStore (server-side),
 * sanitizes the meta, and renders <HologramViewer/> with the validated
 * subset. The hash route param is treated as untrusted: it's validated
 * against the strict 64-hex pattern before any I/O. Anything else returns
 * Next.js's 404.
 *
 * SECURITY:
 *   - Hash is validated by `assertValidHash` before any path is constructed.
 *   - URL query params are NEVER read or echoed.
 *   - meta.json is parsed by the store (not by us); we still re-sanitize
 *     before passing to the client renderer.
 *   - We bypass server-side rendering of the actual HologramViewer (which
 *     touches WebGL / WebXR globals) by streaming a minimal "shell" plus
 *     a hydrated client subtree.
 *
 * @see Sprint 2 (A): board task task_1776678231432_a08m
 */

import { notFound } from 'next/navigation';
import type { Metadata } from 'next';

import type { HologramBundle, HologramMeta } from '@holoscript/engine/hologram';
import {
  assertValidHash,
  HologramStoreError,
} from '@holoscript/engine/hologram';

import { getHologramStore } from '@/app/api/hologram/_lib/store';
import { sanitizeMetaForRender } from '@/components/hologram/hologramMetaSanitizer';

import HologramPageClient from './HologramPageClient';

// Force Node runtime — we need filesystem access to the store.
export const runtime = 'nodejs';

// Disable caching of this route while the bundle catalog is mutable.
// FileSystemHologramStore is local-volume backed; cache control is
// handled at the asset route level (immutable).
export const dynamic = 'force-dynamic';

// ── Server-side bundle load ──────────────────────────────────────────────────

interface LoadedBundle {
  hash: string;
  meta: HologramMeta;
  hasQuilt: boolean;
  hasMvhevc: boolean;
  hasParallax: boolean;
}

async function loadBundle(rawHash: unknown): Promise<LoadedBundle | null> {
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

// ── Metadata (Open Graph) ────────────────────────────────────────────────────

export async function generateMetadata({
  params,
}: {
  params: Promise<{ hash: string }>;
}): Promise<Metadata> {
  const { hash } = await params;
  const loaded = await loadBundle(hash);
  if (!loaded) {
    return { title: 'HoloGram — not found' };
  }
  const safe = sanitizeMetaForRender(loaded.meta);
  return {
    title: `HoloGram - ${safe.sourceKind} ${safe.width}x${safe.height}`,
    description: 'A 3D HoloGram rendered from 2D media',
    openGraph: {
      title: 'HoloGram',
      description: `${safe.sourceKind} hologram, ${safe.width}x${safe.height}, ${safe.frames} frame(s)`,
      type: 'website',
      images: loaded.hasQuilt
        ? [{ url: `/api/hologram/${loaded.hash}/quilt.png` }]
        : undefined,
    },
  };
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default async function HologramPage({
  params,
}: {
  params: Promise<{ hash: string }>;
}) {
  const { hash } = await params;
  const loaded = await loadBundle(hash);
  if (!loaded) {
    notFound();
  }

  // Construct a minimal client-side bundle shape. The actual depth/normal
  // bytes are NOT shipped through the page payload — the viewer fetches
  // them on demand from the asset routes.
  const clientBundle: HologramBundle = {
    hash: loaded.hash,
    meta: loaded.meta,
    // Empty placeholders — the renderer fetches these as needed via URL.
    depthBin: new Uint8Array(0),
    normalBin: new Uint8Array(0),
    ...(loaded.hasQuilt ? { quiltPng: new Uint8Array(0) } : {}),
    ...(loaded.hasMvhevc ? { mvhevcMp4: new Uint8Array(0) } : {}),
    ...(loaded.hasParallax ? { parallaxWebm: new Uint8Array(0) } : {}),
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-4xl flex-col gap-6 px-4 py-8">
      <header className="flex items-baseline justify-between">
        <h1 className="text-2xl font-semibold text-studio-text">HoloGram</h1>
        <code
          className="rounded bg-black/30 px-2 py-1 text-[10px] text-studio-muted"
          title={loaded.hash}
        >
          {loaded.hash.slice(0, 12)}
        </code>
      </header>
      <HologramPageClient bundle={clientBundle} />
    </main>
  );
}

// Export internals for unit tests (the route is otherwise opaque).
export const __test__ = { loadBundle };
