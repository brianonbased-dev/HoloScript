/**
 * deviceDetect — pick the best HoloGram render path for the current viewer.
 *
 * Detects three classes of viewer:
 *   - 'looking-glass': a Looking Glass display reachable through the
 *      holoplay-core Bridge SDK (browser → local Bridge daemon → display).
 *   - 'vision-pro':   Apple Vision Pro / visionOS Safari, where MV-HEVC
 *      spatial video plays natively in <video>.
 *   - 'parallax':     fallback for everyone else (phones, laptops, desktops
 *      without a holographic display). Renders a depth-mapped parallax card.
 *
 * SECURITY: this function only inspects browser-provided capabilities.
 * It NEVER accepts caller-provided strings as authoritative. The `userAgent`
 * argument is for testability and is treated as untrusted; its content
 * never reaches the DOM.
 *
 * @see Sprint 2 (A): board task task_1776678231432_a08m
 * @see D.019: HoloGram product line
 */

export type HologramViewerKind = 'looking-glass' | 'vision-pro' | 'parallax';

export interface DetectViewerOptions {
  /** Override userAgent (tests). Defaults to navigator.userAgent. */
  userAgent?: string;
  /** Override WebXR availability check. Defaults to navigator.xr presence. */
  hasWebXR?: boolean;
  /**
   * Override the holoplay-core capability probe. The runtime check is a
   * `window.HoloPlayCore` truthy lookup or a `holoplay-core` ESM module
   * resolution flag set by a prior dynamic import. Tests inject this
   * directly to avoid touching globals.
   */
  hasHoloplayCore?: boolean;
}

// ── Vision Pro detection ─────────────────────────────────────────────────────
//
// Apple's UA on visionOS Safari contains "Vision" plus the Apple platform
// markers. We deliberately keep the regex conservative: false-positive on a
// Vision Pro means we serve MV-HEVC, which the browser will gracefully
// reject if it can't decode it (the viewer falls through to parallax via
// the <video> error handler downstream).

const VISION_PRO_UA = /\b(VisionOS|Vision\s?Pro|AppleWebKit.*Vision)\b/i;

export function isVisionProUserAgent(ua: string): boolean {
  return typeof ua === 'string' && VISION_PRO_UA.test(ua);
}

// ── Looking Glass detection ──────────────────────────────────────────────────
//
// The Bridge SDK is a separate native daemon that the holoplay-core npm
// module talks to over WebSockets. Presence of the SDK on `window` (set
// when the user installs the Looking Glass browser extension) OR a
// previously-loaded `holoplay-core` module is the only signal we trust.
// We never sniff the UA for "Looking Glass" — there is no UA marker.

export function isLookingGlassEnvironment(opts: {
  hasHoloplayCore?: boolean;
  win?: { HoloPlayCore?: unknown };
}): boolean {
  if (opts.hasHoloplayCore === true) return true;
  if (opts.hasHoloplayCore === false) return false;
  return Boolean(opts.win?.HoloPlayCore);
}

// ── WebXR detection ──────────────────────────────────────────────────────────
//
// WebXR alone doesn't tell us which display is connected, but it's a
// useful tiebreaker: on a desktop with WebXR + a Looking Glass extension
// AND a Vision Pro UA, we trust the Vision Pro UA. WebXR's role is to
// EXCLUDE: if neither holoplay nor Vision Pro hints fire, we still pick
// parallax because we don't know what XR device is connected.

export function hasWebXRRuntime(nav?: { xr?: unknown }): boolean {
  return Boolean(nav?.xr);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Pick the render path for this viewer. Default: 'parallax' — the safest
 * fallback that works everywhere a <canvas> + WebGL works.
 *
 * Detection order (first match wins):
 *   1. Looking Glass (holoplay-core present) — explicit, user-installed SDK
 *   2. Vision Pro UA — visionOS Safari only
 *   3. Parallax (default)
 *
 * Looking Glass beats Vision Pro because the SDK is opt-in: a user with
 * a LG extension installed has explicitly indicated they want LG output.
 */
export function detectViewer(options: DetectViewerOptions = {}): HologramViewerKind {
  const ua =
    options.userAgent ??
    (typeof navigator !== 'undefined' ? navigator.userAgent : '');

  const win =
    typeof globalThis !== 'undefined'
      ? (globalThis as { HoloPlayCore?: unknown })
      : undefined;

  if (
    isLookingGlassEnvironment({
      hasHoloplayCore: options.hasHoloplayCore,
      win,
    })
  ) {
    return 'looking-glass';
  }

  if (isVisionProUserAgent(ua)) {
    return 'vision-pro';
  }

  // hasWebXR is observational — we record it but don't change the
  // default. Caller can still inspect navigator.xr if they want to
  // upgrade beyond parallax (e.g., immersive WebXR session).
  void hasWebXRRuntime(
    typeof navigator !== 'undefined' ? (navigator as { xr?: unknown }) : undefined
  );

  return 'parallax';
}
