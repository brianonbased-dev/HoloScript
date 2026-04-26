/**
 * hologramShareLogic — pure helpers for the HologramShareDropZone.
 *
 * Lives in its own module so node-env tests can exercise media detection,
 * FormData construction, response validation, and URL composition without
 * importing the React shell (lucide-react ESM doesn't transform under
 * studio's vitest node env — pattern matches AgentMonitorPanel).
 */

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff', 'bmp']);
const GIF_EXTENSIONS = new Set(['gif', 'apng']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv', 'avi', 'ogv']);

export type MediaSourceKind = 'image' | 'gif' | 'video';

/**
 * Map filename + MIME to the canonical HologramSourceKind. Returns null
 * for anything we don't accept (caller must surface an error to the user
 * and refuse to build the bundle).
 */
export function detectMediaSourceKind(
  filename: string,
  mimeType: string = ''
): MediaSourceKind | null {
  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  if (IMAGE_EXTENSIONS.has(ext)) return 'image';
  if (GIF_EXTENSIONS.has(ext)) return 'gif';
  if (VIDEO_EXTENSIONS.has(ext)) return 'video';
  if (mimeType.startsWith('image/gif')) return 'gif';
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  return null;
}

/**
 * Build the multipart FormData payload that /api/hologram/upload expects.
 * The route ignores any client-supplied hash and recomputes the canonical
 * one server-side.
 */
export function buildShareUploadFormData(bundle: {
  meta: unknown;
  depthBin: Uint8Array;
  normalBin: Uint8Array;
  quiltPng?: Uint8Array;
  mvhevcMp4?: Uint8Array;
  parallaxWebm?: Uint8Array;
}): FormData {
  const fd = new FormData();
  fd.append('meta', JSON.stringify(bundle.meta));
  fd.append('depth.bin', new Blob([bundle.depthBin as BlobPart]), 'depth.bin');
  fd.append('normal.bin', new Blob([bundle.normalBin as BlobPart]), 'normal.bin');
  if (bundle.quiltPng) {
    fd.append('quilt.png', new Blob([bundle.quiltPng as BlobPart]), 'quilt.png');
  }
  if (bundle.mvhevcMp4) {
    fd.append('mvhevc.mp4', new Blob([bundle.mvhevcMp4 as BlobPart]), 'mvhevc.mp4');
  }
  if (bundle.parallaxWebm) {
    fd.append('parallax.webm', new Blob([bundle.parallaxWebm as BlobPart]), 'parallax.webm');
  }
  return fd;
}

/** Server response shape for POST /api/hologram/upload. */
export interface UploadResponse {
  hash: string;
  written: boolean;
  /** Optional canonical share URL (server-supplied since Sprint 2 (A)). */
  url?: string;
}

const HASH_PATTERN = /^[0-9a-f]{64}$/;

/** Type guard: response body is a well-formed UploadResponse with a valid hash. */
export function isValidUploadResponse(v: unknown): v is UploadResponse {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.hash === 'string' &&
    HASH_PATTERN.test(o.hash) &&
    typeof o.written === 'boolean'
  );
}

/**
 * Compose the public share URL for a validated hash. Returns '#' for
 * anything that isn't a strict 64-hex hash — callers should never reach
 * this fallback in practice (we type-guard before calling).
 */
export function shareUrlForHash(hash: string): string {
  if (!HASH_PATTERN.test(hash)) return '#';
  return `/g/${hash}`;
}
