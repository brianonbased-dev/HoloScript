/**
 * useHologramMcpContent - detects MCP tool responses whose content_type is
 * a hologram, and resolves them into a renderable shape.
 *
 * Renderer flow:
 *   1. Studio chat receives an MCP tool result.
 *   2. Calls `detectHologramContent(envelope)` from @holoscript/core.
 *   3. If hit, hands the `HologramMcpResponse` to this hook.
 *   4. The hook resolves the payload (hash / url / holo-code) into a
 *      `ResolvedHologramContent` that the renderer or a downstream
 *      `HologramMcpContentRenderer` consumes.
 *
 * Spec: task_1778114362909_zp7u
 */

import { useEffect, useMemo, useState } from 'react';

import {
  HOLOGRAM_CONTENT_TYPES,
  detectHologramContent,
  type HologramBundleRef,
  type HologramContentType,
  type HologramMcpResponse,
} from '@holoscript/core';

// Public API

export type HologramRouteKind = 'parallax' | 'quilt' | 'mvhevc' | 'holo-code';

export interface ResolvedHologramContent {
  /** The validated MCP response. */
  response: HologramMcpResponse;
  /** Renderer kind chosen for this payload. */
  route: HologramRouteKind;
  /** Resolved asset URL (for `hash` / `url` payloads). undefined for holo-code. */
  assetUrl?: string;
  /** Inline .holo source (for `holo-code` payloads). undefined otherwise. */
  holoCode?: string;
  /**
   * Stable id for this resolution - used as React key when remounting the
   * downstream renderer. Derived from payload, so identical payloads share
   * the same id and avoid re-mount thrash.
   */
  contentKey: string;
}

export interface UseHologramMcpContentResult {
  /** Resolved content if detection + resolution succeeded; null otherwise. */
  resolved: ResolvedHologramContent | null;
  /**
   * False when the input envelope is not a hologram MCP response (i.e. a
   * normal text response). Studio chat uses this to fall back to text
   * rendering.
   */
  isHologram: boolean;
  /** Reason the content failed to resolve, if any. */
  error?: string;
}

// Asset URL resolution

/**
 * Resolve a {@link HologramBundleHashRef} to a Studio asset URL. Returns the
 * `parallax.webm` URL by default; renderers can override per-asset via the
 * `bundleAssetUrl` helper.
 *
 * Studio base resolution order:
 *   1. `studioBase` field on the payload
 *   2. `HOLOGRAM_STUDIO_URL` env (when running in Node)
 *   3. Same-origin (browser default)
 */
function resolveStudioBase(payload: HologramBundleRef): string {
  if (payload.kind === 'hash' && payload.studioBase) {
    return payload.studioBase.replace(/\/$/, '');
  }
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
    ?.env;
  if (env?.HOLOGRAM_STUDIO_URL) {
    return env.HOLOGRAM_STUDIO_URL.replace(/\/$/, '');
  }
  // Browser same-origin default; '' means relative URL.
  return '';
}

function pickAsset(contentType: HologramContentType): string {
  switch (contentType) {
    case HOLOGRAM_CONTENT_TYPES.quilt:
      return 'quilt.png';
    case HOLOGRAM_CONTENT_TYPES.mvhevc:
      return 'mvhevc.mp4';
    case HOLOGRAM_CONTENT_TYPES.parallax:
    case HOLOGRAM_CONTENT_TYPES.holo:
    default:
      return 'parallax.webm';
  }
}

function pickRoute(
  contentType: HologramContentType,
  payload: HologramBundleRef,
  preferred?: 'parallax' | 'quilt' | 'mvhevc' | 'auto'
): HologramRouteKind {
  if (payload.kind === 'holo-code') return 'holo-code';
  if (preferred && preferred !== 'auto') return preferred;
  switch (contentType) {
    case HOLOGRAM_CONTENT_TYPES.quilt:
      return 'quilt';
    case HOLOGRAM_CONTENT_TYPES.mvhevc:
      return 'mvhevc';
    case HOLOGRAM_CONTENT_TYPES.parallax:
      return 'parallax';
    case HOLOGRAM_CONTENT_TYPES.holo:
    default:
      return 'parallax';
  }
}

function buildAssetUrl(
  payload: HologramBundleRef,
  contentType: HologramContentType
): string | undefined {
  if (payload.kind === 'url') return payload.url;
  if (payload.kind === 'hash') {
    const base = resolveStudioBase(payload);
    const asset = pickAsset(contentType);
    const hash = encodeURIComponent(payload.hash);
    return `${base}/api/hologram/${hash}/${encodeURIComponent(asset)}`;
  }
  return undefined;
}

function buildContentKey(payload: HologramBundleRef): string {
  if (payload.kind === 'hash') return `hash:${payload.hash}`;
  if (payload.kind === 'url') return `url:${payload.url}`;
  // holo-code: take a length-prefixed hash-ish key (cheap, deterministic).
  let h = 0;
  for (let i = 0; i < payload.holoCode.length; i++) {
    h = (Math.imul(h, 31) + payload.holoCode.charCodeAt(i)) | 0;
  }
  return `holo-code:${payload.holoCode.length}:${h}`;
}

/**
 * Resolve a {@link HologramMcpResponse} into a renderable shape. Pure - no
 * network IO; the returned `assetUrl` is constructed but not fetched.
 */
export function resolveHologramMcpContent(
  response: HologramMcpResponse
): ResolvedHologramContent {
  const route = pickRoute(response.content_type, response.payload, response.hints?.preferredViewer);
  const assetUrl =
    response.payload.kind === 'holo-code'
      ? undefined
      : buildAssetUrl(response.payload, response.content_type);
  const holoCode =
    response.payload.kind === 'holo-code' ? response.payload.holoCode : undefined;

  return {
    response,
    route,
    assetUrl,
    holoCode,
    contentKey: buildContentKey(response.payload),
  };
}

// React hook

/**
 * Detect a hologram-typed MCP envelope and return a resolved view ready for
 * the renderer to consume. Pass any MCP-like `envelope` (the typed dispatch
 * object, the raw `HologramMcpResponse`, or a legacy `{content:[{text}]}`
 * envelope where text is JSON). Returns `{ isHologram: false }` when the
 * envelope is not a hologram response - the chat surface uses that to fall
 * through to text rendering.
 *
 * The hook is intentionally synchronous - `resolveHologramMcpContent` does
 * no IO. The `useState` + `useEffect` pair is purely so React schedules a
 * re-render when callers swap the envelope (e.g. on a new chat message).
 */
export function useHologramMcpContent(envelope: unknown): UseHologramMcpContentResult {
  const detected = useMemo(() => detectHologramContent(envelope), [envelope]);
  const [error, setError] = useState<string | undefined>(undefined);

  useEffect(() => {
    setError(undefined);
  }, [detected]);

  if (!detected) {
    return { resolved: null, isHologram: false };
  }

  try {
    const resolved = resolveHologramMcpContent(detected);
    return { resolved, isHologram: true, error };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return {
      resolved: null,
      isHologram: true,
      error: `Failed to resolve hologram content: ${message}`,
    };
  }
}
