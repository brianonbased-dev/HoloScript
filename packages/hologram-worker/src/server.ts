import { createServer } from 'node:http';

import {
  createHologram,
  CreateHologramError,
  type HologramSourceKind,
  type HologramTarget,
} from '@holoscript/engine/hologram';

import { closeWorkerBrowser } from './playwright-pipeline.js';
import { WorkerHologramCoordinator } from './providers.js';
import { uploadHologramToStudio } from './upload-studio.js';

const MAX_BODY = 20 * 1024 * 1024;
const WINDOW_MS = 60_000;
const MAX_REQ_PER_WINDOW = 30;

const rateState = new Map<string, number[]>();

function allowRate(ip: string): boolean {
  const now = Date.now();
  const arr = rateState.get(ip) ?? [];
  const pruned = arr.filter((t) => now - t < WINDOW_MS);
  if (pruned.length >= MAX_REQ_PER_WINDOW) return false;
  pruned.push(now);
  rateState.set(ip, pruned);
  return true;
}

interface RenderBody {
  sourceUrl?: string;
  sourceBase64?: string;
  mediaType?: string;
  targets?: string[];
  /** If true, skip Studio upload (local testing). */
  skipUpload?: boolean;
}

function parseBody(raw: string): RenderBody {
  try {
    return JSON.parse(raw) as RenderBody;
  } catch {
    throw new Error('invalid JSON body');
  }
}

async function loadMediaBytes(body: RenderBody): Promise<Uint8Array> {
  if (body.sourceBase64 != null && body.sourceBase64 !== '') {
    const buf = Buffer.from(body.sourceBase64, 'base64');
    if (!buf.length) throw new Error('empty base64');
    return new Uint8Array(buf);
  }
  if (body.sourceUrl != null && body.sourceUrl !== '') {
    const res = await fetch(body.sourceUrl, { redirect: 'follow' });
    if (!res.ok) throw new Error(`sourceUrl fetch failed: HTTP ${res.status}`);
    const len = res.headers.get('content-length');
    if (len && Number(len) > MAX_BODY) throw new Error('source exceeds size cap');
    const ab = await res.arrayBuffer();
    if (ab.byteLength > MAX_BODY) throw new Error('source exceeds size cap');
    return new Uint8Array(ab);
  }
  throw new Error('Provide sourceUrl or sourceBase64');
}

function clientIp(req: import('node:http').IncomingMessage): string {
  const raw = req.socket?.remoteAddress ?? 'unknown';
  return raw.replace(/^::ffff:/, '');
}

const server = createServer(async (req, res) => {
  if (req.url === '/health' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true, service: '@holoscript/hologram-worker' }));
    return;
  }

  if (req.url !== '/render' || req.method !== 'POST') {
    res.writeHead(404);
    res.end();
    return;
  }

  const ip = clientIp(req);
  if (!allowRate(ip)) {
    res.writeHead(429, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'rate_limited' }));
    return;
  }

  const ingressToken = process.env.HOLOGRAM_WORKER_INGRESS_TOKEN?.trim();
  if (ingressToken) {
    const auth = req.headers.authorization?.trim() ?? '';
    const m = /^Bearer\s+(\S+)$/i.exec(auth);
    if (!m || m[1] !== ingressToken) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'unauthorized' }));
      return;
    }
  }

  let raw = '';
  let len = 0;
  for await (const chunk of req) {
    len += chunk.length;
    if (len > MAX_BODY) {
      res.writeHead(413, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'payload_too_large' }));
      return;
    }
    raw += chunk.toString('utf8');
  }

  try {
    const body = parseBody(raw);
    const media = await loadMediaBytes(body);
    const mediaType = (body.mediaType ?? 'image').toLowerCase();
    if (mediaType !== 'image' && mediaType !== 'gif' && mediaType !== 'video') {
      throw new Error('mediaType must be image, gif, or video');
    }
    const sourceKind = mediaType as HologramSourceKind;
    const targets = (body.targets ?? ['quilt', 'mvhevc', 'parallax']) as HologramTarget[];
    for (const t of targets) {
      if (t !== 'quilt' && t !== 'mvhevc' && t !== 'parallax') {
        throw new Error(`unknown target: ${t}`);
      }
    }

    const coord = new WorkerHologramCoordinator();
    try {
      const bundle = await createHologram(media, sourceKind, coord.providers, {
        targets,
        sequentialRender: true,
      });

      let hash = bundle.hash;
      const studioBase = process.env.STUDIO_INTERNAL_URL?.trim();
      const uploadToken = process.env.HOLOGRAM_WORKER_TOKEN?.trim();
      if (!body.skipUpload && studioBase && uploadToken) {
        const up = await uploadHologramToStudio(studioBase, uploadToken, bundle);
        hash = up.hash;
      }

      const publicBase =
        process.env.HOLOGRAM_SHARE_BASE_URL?.trim() || studioBase?.replace(/\/$/, '') || '';
      let shareUrl = '';
      if (publicBase) {
        const base = publicBase.replace(/\/$/, '');
        const asset = targets.includes('quilt')
          ? 'quilt.png'
          : targets.includes('mvhevc')
            ? 'mvhevc.mp4'
            : 'parallax.webm';
        shareUrl = `${base}/api/hologram/${hash}/${asset}`;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(
        JSON.stringify({
          hash,
          shareUrl,
          targets,
          mvhevcUrl: publicBase
            ? `${publicBase.replace(/\/$/, '')}/api/hologram/${hash}/mvhevc.mp4`
            : '',
          quiltUrl: publicBase
            ? `${publicBase.replace(/\/$/, '')}/api/hologram/${hash}/quilt.png`
            : '',
        }),
      );
    } finally {
      await coord.dispose();
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const code = e instanceof CreateHologramError ? e.code : 'internal';
    const status =
      code === 'empty_media' || code === 'invalid_source_kind' || code === 'unknown_target'
        ? 400
        : code === 'missing_provider'
          ? 400
          : msg.includes('sourceUrl') || msg.includes('base64') || msg.includes('mediaType')
            ? 400
            : 500;
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: msg, code }));
  }
});

const port = Number(process.env.PORT || 8790);
server.listen(port, () => {
  console.log(`[hologram-worker] listening on :${port}`);
});

process.on('SIGTERM', async () => {
  await closeWorkerBrowser();
  process.exit(0);
});
