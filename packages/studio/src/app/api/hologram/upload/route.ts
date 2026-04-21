export const runtime = 'nodejs';

/**
 * POST /api/hologram/upload
 *
 * Multipart form: `meta` (JSON string, {@link HologramMeta}), required file fields
 * `depth.bin` and `normal.bin`, optional `quilt.png`, `mvhevc.mp4`, `parallax.webm`.
 * Any client-supplied content hash is ignored; the store recomputes identity.
 *
 * Size cap: when `Content-Length` is present and exceeds {@link MAX_HOLOGRAM_UPLOAD_BYTES},
 * the handler returns 413 without buffering. When it is absent (common for chunked
 * multipart), the cap is still enforced by {@link FileSystemHologramStore} after the
 * body is parsed — callers should prefer sending `Content-Length` when possible.
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

import type { HologramBundle, HologramMeta } from '@holoscript/engine/hologram';
import { HologramBundleError, HologramStoreError } from '@holoscript/engine/hologram';

import { virusScanHookPoint } from '@/lib/virusScanHookPoint';

import { authorizeHologramUpload } from '../_lib/authorizeUpload';
import { getHologramStore, MAX_HOLOGRAM_UPLOAD_BYTES } from '../_lib/store';

const PLACEHOLDER_HASH = '0'.repeat(64);

const OPTIONAL_FILE_FIELDS: ReadonlyArray<{
  field: 'quilt.png' | 'mvhevc.mp4' | 'parallax.webm';
  key: 'quiltPng' | 'mvhevcMp4' | 'parallaxWebm';
}> = [
  { field: 'quilt.png', key: 'quiltPng' },
  { field: 'mvhevc.mp4', key: 'mvhevcMp4' },
  { field: 'parallax.webm', key: 'parallaxWebm' },
];

function jsonError(status: number, error: string, code?: string) {
  return NextResponse.json(code ? { error, code } : { error }, { status });
}

function isHologramMeta(v: unknown): v is HologramMeta {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.schemaVersion === 1 &&
    (o.sourceKind === 'image' || o.sourceKind === 'gif' || o.sourceKind === 'video') &&
    typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    typeof o.frames === 'number' &&
    typeof o.modelId === 'string' &&
    (o.backend === 'webgpu' ||
      o.backend === 'wasm' ||
      o.backend === 'cpu' ||
      o.backend === 'onnxruntime-node') &&
    typeof o.inferenceMs === 'number' &&
    typeof o.createdAt === 'string'
  );
}

async function fileToUint8(file: File): Promise<Uint8Array> {
  const buf = await file.arrayBuffer();
  return new Uint8Array(buf);
}

export async function POST(request: NextRequest) {
  const denied = await authorizeHologramUpload(request);
  if (denied) return denied;

  const cl = request.headers.get('content-length');
  if (cl) {
    const n = Number(cl);
    if (Number.isFinite(n) && n > MAX_HOLOGRAM_UPLOAD_BYTES) {
      return jsonError(413, 'Payload too large', 'payload_too_large');
    }
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return jsonError(400, 'Invalid multipart body');
  }

  const metaRaw = form.get('meta');
  if (typeof metaRaw !== 'string') {
    return jsonError(400, '`meta` field must be a JSON string');
  }

  let parsedMeta: unknown;
  try {
    parsedMeta = JSON.parse(metaRaw) as unknown;
  } catch {
    return jsonError(400, '`meta` must be valid JSON');
  }

  if (!isHologramMeta(parsedMeta)) {
    return jsonError(400, '`meta` failed shape validation');
  }

  const depthEnt = form.get('depth.bin');
  const normalEnt = form.get('normal.bin');
  if (!(depthEnt instanceof File)) {
    return jsonError(400, 'missing or invalid depth.bin file field');
  }
  if (!(normalEnt instanceof File)) {
    return jsonError(400, 'missing or invalid normal.bin file field');
  }

  const depthBin = await fileToUint8(depthEnt);
  const normalBin = await fileToUint8(normalEnt);

  const bundle: HologramBundle = {
    hash: PLACEHOLDER_HASH,
    meta: parsedMeta,
    depthBin,
    normalBin,
  };

  for (const { field, key } of OPTIONAL_FILE_FIELDS) {
    const ent = form.get(field);
    if (ent instanceof File) {
      bundle[key] = await fileToUint8(ent);
    }
  }

  const store = getHologramStore();

  try {
    const scanChunks = [Buffer.from(bundle.depthBin), Buffer.from(bundle.normalBin)];
    if (bundle.quiltPng?.length) scanChunks.push(Buffer.from(bundle.quiltPng));
    if (bundle.mvhevcMp4?.length) scanChunks.push(Buffer.from(bundle.mvhevcMp4));
    if (bundle.parallaxWebm?.length) scanChunks.push(Buffer.from(bundle.parallaxWebm));
    virusScanHookPoint('hologram/bundle', Buffer.concat(scanChunks));
    const { hash, written } = await store.put(bundle);
    return NextResponse.json({ hash, written });
  } catch (err) {
    if (err instanceof HologramBundleError) {
      return jsonError(400, err.message, err.code);
    }
    if (err instanceof HologramStoreError) {
      if (err.code === 'size_limit_exceeded') {
        return jsonError(413, err.message, err.code);
      }
      if (err.code === 'invalid_hash' || err.code === 'invalid_asset') {
        return jsonError(400, err.message, err.code);
      }
      return jsonError(500, 'Storage error', err.code);
    }
    throw err;
  }
}
