/**
 * HoloGram Bundle HTTP Client — MCP server ↔ Studio API
 *
 * Provides upload and download for content-addressed hologram bundles.
 * The MCP server may run in a different process/container from Studio,
 * so all operations go through the Studio HTTP API (not direct fs).
 */

export interface HologramBundleUploadInput {
  /** JSON-stringified {@link HologramMeta} */
  meta: string;
  /** Base64-encoded depth map bytes */
  depthBinBase64: string;
  /** Base64-encoded normal map bytes */
  normalBinBase64: string;
  /** Optional base64-encoded quilt PNG */
  quiltPngBase64?: string;
  /** Optional base64-encoded MV-HEVC MP4 */
  mvhevcMp4Base64?: string;
  /** Optional base64-encoded parallax WebM */
  parallaxWebmBase64?: string;
}

export interface HologramBundleUploadResult {
  hash: string;
  written: boolean;
  url: string;
}

export interface HologramAssetGetResult {
  base64: string;
  mimeType: string;
  byteLength: number;
}

function studioBaseUrl(): string {
  return (
    process.env.HOLOGRAM_STUDIO_URL?.trim() ||
    process.env.HOLOSCRIPT_RENDER_URL?.trim() ||
    'http://localhost:3000'
  );
}

function buildUploadUrl(): string {
  return `${studioBaseUrl().replace(/\/$/, '')}/api/hologram/upload`;
}

function buildAssetUrl(hash: string, asset: string): string {
  return `${studioBaseUrl().replace(/\/$/, '')}/api/hologram/${encodeURIComponent(hash)}/${encodeURIComponent(asset)}`;
}

function base64ToBlob(b64: string): Blob {
  const buf = Buffer.from(b64, 'base64');
  return new Blob([buf]);
}

/**
 * Upload a hologram bundle to the Studio store.
 *
 * Uses multipart/form-data. Authenticates with HOLOGRAM_WORKER_TOKEN
 * (Bearer) when available; otherwise relies on session auth if the
 * Studio and MCP server share a cookie jar (same-origin deploy).
 */
export async function uploadHologramBundle(
  input: HologramBundleUploadInput,
): Promise<HologramBundleUploadResult> {
  const fd = new FormData();
  fd.append('meta', input.meta);
  fd.append('depth.bin', base64ToBlob(input.depthBinBase64), 'depth.bin');
  fd.append('normal.bin', base64ToBlob(input.normalBinBase64), 'normal.bin');

  if (input.quiltPngBase64) {
    fd.append('quilt.png', base64ToBlob(input.quiltPngBase64), 'quilt.png');
  }
  if (input.mvhevcMp4Base64) {
    fd.append('mvhevc.mp4', base64ToBlob(input.mvhevcMp4Base64), 'mvhevc.mp4');
  }
  if (input.parallaxWebmBase64) {
    fd.append('parallax.webm', base64ToBlob(input.parallaxWebmBase64), 'parallax.webm');
  }

  const headers: Record<string, string> = {};
  const token = process.env.HOLOGRAM_WORKER_TOKEN?.trim();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(buildUploadUrl(), {
    method: 'POST',
    headers,
    body: fd,
  });

  const text = await res.text();
  let body: Record<string, unknown> = {};
  try {
    body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    // leave body empty on parse failure
  }

  if (!res.ok) {
    const err =
      typeof body.error === 'string'
        ? body.error
        : `hologram upload: HTTP ${res.status}`;
    throw new Error(err);
  }

  return {
    hash: String(body.hash ?? ''),
    written: Boolean(body.written),
    url: String(body.url ?? ''),
  };
}

/**
 * Retrieve a hologram bundle asset by content hash.
 *
 * Public read — no auth required. Returns base64-encoded bytes
 * so the MCP tool response stays JSON-safe.
 */
export async function getHologramAsset(
  hash: string,
  asset: string,
): Promise<HologramAssetGetResult> {
  const res = await fetch(buildAssetUrl(hash, asset));

  if (!res.ok) {
    const text = await res.text();
    let body: Record<string, unknown> = {};
    try {
      body = text ? (JSON.parse(text) as Record<string, unknown>) : {};
    } catch {
      // ignore
    }
    const err =
      typeof body.error === 'string'
        ? body.error
        : `hologram get asset: HTTP ${res.status}`;
    throw new Error(err);
  }

  const buf = Buffer.from(await res.arrayBuffer());
  const mimeType = res.headers.get('Content-Type') || 'application/octet-stream';

  return {
    base64: buf.toString('base64'),
    mimeType,
    byteLength: buf.byteLength,
  };
}
