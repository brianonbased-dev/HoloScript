'use client';

/**
 * HologramViewer — device-adaptive renderer for a HologramBundle.
 *
 * Picks between three render paths via {@link detectViewer}:
 *   - 'looking-glass': feeds quilt PNG to holoplay-core Bridge SDK (dynamic
 *      import, falls back to parallax if the package is not installed).
 *   - 'vision-pro':   plays MV-HEVC mp4 via <video> (falls back to parallax
 *      if `bundle.mvhevcMp4` is missing or playback fails).
 *   - 'parallax':     WebGL depth-displacement card (the default).
 *
 * SECURITY (per Sprint 2 (A) task spec):
 *   - meta is sanitized via {@link sanitizeMetaForRender} before any
 *     value reaches the DOM. Unknown fields are dropped; strings are
 *     pattern-validated; numbers are clamped.
 *   - The component never reads `window.location.search` or other URL
 *     query state. The hash that identifies the bundle comes from the
 *     parent route param, not from this component.
 *   - All asset URLs are constructed from the validated hash via
 *     `bundleAssetUrl()`; we never concatenate raw input.
 *
 * @see Sprint 2 (A): board task task_1776678231432_a08m
 */

import { useEffect, useMemo, useRef, useState } from 'react';

import type { HologramBundle } from '@holoscript/engine/hologram';

import {
  detectViewer,
  type HologramViewerKind,
} from '@/lib/hologram/deviceDetect';

import {
  isHashLike,
  sanitizeMetaForRender,
  type SafeHologramMeta,
} from './hologramMetaSanitizer';

// ── Public API ──────────────────────────────────────────────────────────────

export interface HologramViewerProps {
  /** The bundle to render. Hash is used only for asset URL construction. */
  bundle: HologramBundle;
  /**
   * Override the detected viewer (tests + manual selector). When omitted,
   * `detectViewer()` is invoked once on mount.
   */
  viewerOverride?: HologramViewerKind;
  /** Optional className for the outer wrapper. */
  className?: string;
}

// ── URL helpers ──────────────────────────────────────────────────────────────
//
// The asset HTTP route is /api/hologram/<hash>/<asset>. Hash and asset must
// match the strict patterns; both are validated by the server too, but we
// double-check on the client to catch programming errors before the request.

type AssetName = 'depth.bin' | 'normal.bin' | 'quilt.png' | 'mvhevc.mp4' | 'parallax.webm';

function bundleAssetUrl(hash: string, asset: AssetName): string {
  if (!isHashLike(hash)) {
    // Defensive — caller should have validated. Returning '#' makes any
    // accidental link a no-op rather than a traversal vector.
    return '#';
  }
  return `/api/hologram/${hash}/${asset}`;
}

// ── Looking Glass path ───────────────────────────────────────────────────────

/**
 * Attempt to load holoplay-core dynamically and feed the quilt PNG to a
 * Bridge SDK client. Returns an unmount function. If the package is not
 * installed (the common case in dev environments), throws — the caller
 * falls back to parallax rendering.
 */
async function mountLookingGlassRender(
  container: HTMLDivElement,
  quiltUrl: string,
  meta: SafeHologramMeta
): Promise<() => void> {
  // Dynamic import via a variable specifier so the bundler doesn't try to
  // resolve it at build time. If holoplay-core isn't installed, this
  // rejects — we let the caller catch and fall through.
  const dynamicImport: (s: string) => Promise<unknown> = (s) =>
    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    Function('return import(' + JSON.stringify(s) + ')')() as Promise<unknown>;

  const mod = (await dynamicImport('holoplay-core')) as {
    Client?: new () => { sendQuilt(opts: { url: string; tilesX: number; tilesY: number }): void; close?: () => void };
  };

  if (!mod.Client) {
    throw new Error('holoplay-core present but Client export missing');
  }

  const client = new mod.Client();
  // Default tile layout for Looking Glass quilt (matches QuiltCompiler)
  client.sendQuilt({ url: quiltUrl, tilesX: 8, tilesY: 6 });

  // Render a placeholder card so the container isn't empty
  const card = document.createElement('div');
  card.textContent = 'Sent to Looking Glass display';
  card.style.padding = '24px';
  card.style.textAlign = 'center';
  card.style.color = '#a78bfa';
  container.appendChild(card);

  void meta; // reserved for future per-meta config

  return () => {
    if (typeof client.close === 'function') {
      client.close();
    }
    if (card.parentNode === container) {
      container.removeChild(card);
    }
  };
}

// ── Component ────────────────────────────────────────────────────────────────

export function HologramViewer({
  bundle,
  viewerOverride,
  className = '',
}: HologramViewerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeKind, setActiveKind] = useState<HologramViewerKind>(
    viewerOverride ?? 'parallax'
  );
  const [error, setError] = useState<string | null>(null);

  const safeMeta = useMemo(() => sanitizeMetaForRender(bundle.meta), [bundle.meta]);
  const safeHash = isHashLike(bundle.hash) ? bundle.hash : null;

  // Detect viewer on mount (client only). If override is set, skip.
  useEffect(() => {
    if (viewerOverride) {
      setActiveKind(viewerOverride);
      return;
    }
    setActiveKind(detectViewer());
  }, [viewerOverride]);

  // Looking Glass: attempt dynamic import, fall back to parallax on failure.
  useEffect(() => {
    if (activeKind !== 'looking-glass') return;
    if (!safeHash) {
      setActiveKind('parallax');
      return;
    }
    if (!bundle.quiltPng) {
      setActiveKind('parallax');
      return;
    }

    const container = containerRef.current;
    if (!container) return;

    let cleanup: (() => void) | null = null;
    let cancelled = false;

    const quiltUrl = bundleAssetUrl(safeHash, 'quilt.png');

    mountLookingGlassRender(container, quiltUrl, safeMeta)
      .then((cleanupFn) => {
        if (cancelled) {
          cleanupFn();
        } else {
          cleanup = cleanupFn;
        }
      })
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : 'unknown';
        // Don't echo the error to the DOM — just log + fall through.
        // eslint-disable-next-line no-console
        console.warn('[HologramViewer] holoplay-core unavailable, falling back to parallax:', msg);
        if (!cancelled) {
          setActiveKind('parallax');
        }
      });

    return () => {
      cancelled = true;
      if (cleanup) cleanup();
    };
  }, [activeKind, safeHash, bundle.quiltPng, safeMeta]);

  if (!safeHash) {
    return (
      <div
        className={`flex items-center justify-center rounded-lg border border-red-500/30 bg-red-500/10 p-8 ${className}`}
        role="alert"
      >
        <p className="text-sm text-red-300">Invalid hologram identifier</p>
      </div>
    );
  }

  // ── Render paths ──
  if (activeKind === 'vision-pro' && bundle.mvhevcMp4) {
    return (
      <div className={`relative ${className}`} data-viewer-kind="vision-pro">
        {/*
          Vision Pro plays MV-HEVC natively. If decode fails the onError
          handler downgrades to parallax. We deliberately do NOT pass any
          part of meta into attributes — only the (validated) hash-derived
          URL.
        */}
        <video
          // eslint-disable-next-line jsx-a11y/media-has-caption
          src={bundleAssetUrl(safeHash, 'mvhevc.mp4')}
          autoPlay
          loop
          muted
          playsInline
          onError={() => {
            setError('mvhevc-decode-failed');
            setActiveKind('parallax');
          }}
          className="w-full h-full"
        />
        {error && (
          <div className="absolute inset-x-0 bottom-0 bg-black/40 p-2 text-center text-xs text-amber-300">
            Falling back to parallax render
          </div>
        )}
      </div>
    );
  }

  if (activeKind === 'looking-glass') {
    return (
      <div
        ref={containerRef}
        className={`relative flex items-center justify-center rounded-lg bg-black/40 ${className}`}
        data-viewer-kind="looking-glass"
        aria-label="Looking Glass output"
      />
    );
  }

  // Parallax fallback. Renders the quilt as a flat preview card with a
  // semantically labelled meta footer. The actual WebGL parallax shader
  // lives in r3f-renderer / engine and is wired in Sprint 2 (B). For now
  // we display the quilt PNG (or the parallax WebM if present) — both are
  // already content-addressed assets that the user just uploaded.
  const previewUrl = bundle.parallaxWebm
    ? bundleAssetUrl(safeHash, 'parallax.webm')
    : bundle.quiltPng
      ? bundleAssetUrl(safeHash, 'quilt.png')
      : null;

  return (
    <div
      className={`relative flex flex-col gap-2 rounded-lg border border-studio-border bg-black/30 p-4 ${className}`}
      data-viewer-kind="parallax"
    >
      <div className="relative w-full overflow-hidden rounded-md bg-black/60" style={{ aspectRatio: `${safeMeta.width || 16} / ${safeMeta.height || 9}` }}>
        {previewUrl ? (
          bundle.parallaxWebm ? (
            <video
              // eslint-disable-next-line jsx-a11y/media-has-caption
              src={previewUrl}
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-contain"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="hologram preview"
              className="h-full w-full object-contain"
            />
          )
        ) : (
          <div className="flex h-32 items-center justify-center text-xs text-studio-muted">
            No preview asset available
          </div>
        )}
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-studio-muted">
        <dt>Source</dt>
        <dd>{safeMeta.sourceKind}</dd>
        <dt>Dimensions</dt>
        <dd>
          {safeMeta.width} x {safeMeta.height}
        </dd>
        <dt>Frames</dt>
        <dd>{safeMeta.frames}</dd>
        <dt>Backend</dt>
        <dd>{safeMeta.backend}</dd>
        <dt>Model</dt>
        <dd className="truncate" title={safeMeta.modelId}>
          {safeMeta.modelId}
        </dd>
        <dt>Created</dt>
        <dd>{safeMeta.createdAt}</dd>
      </dl>
    </div>
  );
}

export default HologramViewer;
