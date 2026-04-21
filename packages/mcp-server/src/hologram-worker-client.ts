/**
 * HTTP client for @holoscript/hologram-worker POST /render.
 */

export interface HologramWorkerRenderInput {
  sourceUrl?: string;
  sourceBase64?: string;
  mediaType: 'image' | 'gif' | 'video';
  targets: Array<'quilt' | 'mvhevc' | 'parallax'>;
  skipUpload?: boolean;
}

export interface HologramWorkerRenderResult {
  hash: string;
  shareUrl: string;
  quiltUrl: string;
  mvhevcUrl: string;
  targets: string[];
}

function workerBaseUrl(): string | undefined {
  const u = process.env.HOLOGRAM_WORKER_URL?.trim();
  return u || undefined;
}

function ingressHeaders(): Record<string, string> {
  const token = process.env.HOLOGRAM_WORKER_INGRESS_TOKEN?.trim();
  if (!token) return {};
  return { Authorization: `Bearer ${token}` };
}

export function isHologramWorkerConfigured(): boolean {
  return Boolean(workerBaseUrl());
}

export async function callHologramWorkerRender(
  input: HologramWorkerRenderInput,
): Promise<HologramWorkerRenderResult> {
  const base = workerBaseUrl();
  if (!base) throw new Error('hologram worker: HOLOGRAM_WORKER_URL is not set');

  const url = `${base.replace(/\/$/, '')}/render`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...ingressHeaders(),
    },
    body: JSON.stringify({
      sourceUrl: input.sourceUrl,
      sourceBase64: input.sourceBase64,
      mediaType: input.mediaType,
      targets: input.targets,
      skipUpload: input.skipUpload,
    }),
  });

  const text = await res.text();
  let body: unknown;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(`hologram worker: invalid JSON (${res.status})`);
  }

  if (!res.ok) {
    const err = body as { error?: string };
    throw new Error(err.error || `hologram worker: HTTP ${res.status}`);
  }

  const o = body as Partial<HologramWorkerRenderResult>;
  if (!o.hash) throw new Error('hologram worker: missing hash in response');

  return {
    hash: o.hash,
    shareUrl: o.shareUrl ?? '',
    quiltUrl: o.quiltUrl ?? '',
    mvhevcUrl: o.mvhevcUrl ?? '',
    targets: Array.isArray(o.targets) ? o.targets : input.targets,
  };
}
