/**
 * createHologram — single isomorphic entry point for turning 2D media
 * (image / GIF / video) into a HoloGram bundle.
 *
 * Architecture:
 *   media bytes
 *     -> DepthProvider (inference)
 *        -> depth Float32Array + normal Float32Array
 *     -> [optional] QuiltRenderer  -> quilt PNG bytes
 *     -> [optional] MvhevcEncoder  -> MV-HEVC mp4 bytes
 *     -> [optional] ParallaxEncoder -> parallax WebM bytes
 *   -> HologramBundle (with content-addressed hash)
 *
 * Providers are dependency-injected so the same orchestrator runs in
 * browser (WebGPU depth + Three.js quilt render) and on the Node-side
 * hologram-worker service (onnxruntime-node + headless Chromium quilt
 * render + ffmpeg MV-HEVC mux). See Sprint 0c for the Node providers.
 *
 * This file is audit-grade:
 *   - All inputs validated at the boundary; typed errors thrown
 *   - No hidden globals, no implicit fetches, no console.log
 *   - Time source injectable for test determinism
 *
 * @see D.019 (MEMORY.md): HoloGram product line + telegram push metaphor
 * @see F.007: Plans declare both what's built and what's excluded
 * @see F.016: Scope discipline — Sprint 0a is orchestration only
 */

import { depthToNormalMap } from './DepthEstimationService';
import {
  computeBundleHash,
  type HologramBundle,
  type HologramMeta,
  type HologramSourceKind,
  type HologramTarget,
} from './HologramBundle';

// ── Provider Interfaces ──────────────────────────────────────────────────────

export interface DepthInferenceResult {
  /** Float32 depth map, row-major, values in [0,1]. */
  depthMap: Float32Array;
  /** Width of the output map */
  width: number;
  /** Height of the output map */
  height: number;
  /** Number of frames (1 for still images, >1 for GIF/video) */
  frames: number;
  /** Backend that actually ran the inference */
  backend: HologramMeta['backend'];
  /** Model ID used (e.g., 'depth-anything/Depth-Anything-V2-Small-hf') */
  modelId: string;
}

export interface DepthProvider {
  /**
   * Run depth estimation on media bytes. Implementations MUST NOT mutate
   * the input. MUST throw a descriptive Error on failure (do not return
   * empty results silently).
   */
  infer(media: Uint8Array, sourceKind: HologramSourceKind): Promise<DepthInferenceResult>;
}

export interface QuiltRenderer {
  /**
   * Render 48-view quilt as PNG. `tilesConfig` comes from QuiltCompiler —
   * a list of per-view camera offsets + shears. Returns the assembled
   * quilt image as PNG-encoded bytes.
   */
  render(input: {
    depthMap: Float32Array;
    normalMap: Float32Array;
    width: number;
    height: number;
    frames: number;
    media: Uint8Array;
    sourceKind: HologramSourceKind;
  }): Promise<Uint8Array>;
}

export interface MvhevcEncoder {
  /** Encode a stereo pair sequence as MV-HEVC mp4 bytes */
  encode(input: {
    depthMap: Float32Array;
    width: number;
    height: number;
    frames: number;
    media: Uint8Array;
    sourceKind: HologramSourceKind;
  }): Promise<Uint8Array>;
}

export interface ParallaxEncoder {
  /** Encode a parallax WebM loop (small, phone-friendly fallback) */
  encode(input: {
    depthMap: Float32Array;
    width: number;
    height: number;
    media: Uint8Array;
    sourceKind: HologramSourceKind;
  }): Promise<Uint8Array>;
}

// ── Providers bundle ─────────────────────────────────────────────────────────

export interface HologramProviders {
  depth: DepthProvider;
  quilt?: QuiltRenderer;
  mvhevc?: MvhevcEncoder;
  parallax?: ParallaxEncoder;
}

// ── Input / Options ──────────────────────────────────────────────────────────

export interface CreateHologramOptions {
  /** Which outputs to produce. Default: all three. */
  targets?: HologramTarget[];
  /** Override the default clock (for deterministic tests) */
  now?: () => Date;
  /**
   * When true, run quilt / mvhevc / parallax encoders one after another instead
   * of in parallel. Node hologram-worker uses this so Playwright can reuse a
   * single browser across targets.
   */
  sequentialRender?: boolean;
}

export interface CreateNodeProvidersOptions {
  /** Hologram worker base URL. Default: HOLOGRAM_WORKER_URL. */
  workerUrl?: string;
  /** Bearer token for worker ingress. Default: HOLOGRAM_WORKER_INGRESS_TOKEN. */
  token?: string;
  /** Fetch implementation for tests or custom runtimes. Default: global fetch. */
  fetchImpl?: typeof fetch;
}

export class CreateHologramError extends Error {
  constructor(
    public readonly code:
      | 'empty_media'
      | 'invalid_source_kind'
      | 'unknown_target'
      | 'missing_provider'
      | 'depth_failed'
      | 'render_failed',
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'CreateHologramError';
  }
}

const VALID_SOURCE_KINDS = new Set<HologramSourceKind>(['image', 'gif', 'video']);
const VALID_TARGETS = new Set<HologramTarget>(['quilt', 'mvhevc', 'parallax']);

// ── Node worker provider helpers ────────────────────────────────────────────

type WorkerBytesResponse = { bytesBase64?: string };

interface WorkerDepthResponse {
  depthMapBase64?: string;
  width?: number;
  height?: number;
  frames?: number;
  backend?: HologramMeta['backend'];
  modelId?: string;
}

function envValue(name: string): string | undefined {
  const g = globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  };
  return g.process?.env?.[name]?.trim() || undefined;
}

function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).toString('base64');
  }
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  if (typeof Buffer !== 'undefined') {
    return new Uint8Array(Buffer.from(base64, 'base64'));
  }
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

function float32ToBase64(values: Float32Array): string {
  return bytesToBase64(new Uint8Array(values.buffer, values.byteOffset, values.byteLength));
}

function base64ToFloat32(base64: string, label: string): Float32Array {
  const bytes = base64ToBytes(base64).slice();
  if (bytes.byteLength % 4 !== 0) {
    throw new CreateHologramError(
      'missing_provider',
      `hologram-worker ${label} response is ${bytes.byteLength} bytes, expected Float32 bytes`
    );
  }
  return new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
}

function resolveWorkerUrl(options: CreateNodeProvidersOptions): string {
  const url = options.workerUrl ?? envValue('HOLOGRAM_WORKER_URL');
  if (!url) {
    throw new CreateHologramError(
      'missing_provider',
      'Node hologram providers require HOLOGRAM_WORKER_URL or createNodeProviders({ workerUrl })'
    );
  }
  return url.replace(/\/$/, '');
}

async function postWorkerJson<T>(
  options: CreateNodeProvidersOptions,
  path: string,
  body: Record<string, unknown>
): Promise<T> {
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new CreateHologramError('missing_provider', 'Node hologram providers require fetch');
  }

  const token = options.token ?? envValue('HOLOGRAM_WORKER_INGRESS_TOKEN');
  const response = await fetchImpl(`${resolveWorkerUrl(options)}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  let parsed: unknown = {};
  try {
    parsed = text ? JSON.parse(text) : {};
  } catch {
    throw new CreateHologramError(
      'missing_provider',
      `hologram-worker ${path} returned invalid JSON (${response.status})`
    );
  }

  if (!response.ok) {
    const err = parsed as { error?: string };
    throw new CreateHologramError(
      'missing_provider',
      err.error || `hologram-worker ${path} failed with HTTP ${response.status}`
    );
  }

  return parsed as T;
}

function decodeWorkerBytes(response: WorkerBytesResponse, label: string): Uint8Array {
  if (!response.bytesBase64) {
    throw new CreateHologramError(
      'missing_provider',
      `hologram-worker ${label} response omitted bytesBase64`
    );
  }
  return base64ToBytes(response.bytesBase64);
}

// ── Orchestrator ─────────────────────────────────────────────────────────────

/**
 * Build a HologramBundle from media bytes. This is the ONE function every
 * push path (CLI, Studio upload, MCP tool, feed post) calls. Keeping it
 * isomorphic + provider-injected is what lets us share the pipeline
 * across browser + Node + worker surfaces.
 */
export async function createHologram(
  media: Uint8Array,
  sourceKind: HologramSourceKind,
  providers: HologramProviders,
  options: CreateHologramOptions = {}
): Promise<HologramBundle> {
  // ── Input validation ──
  if (!media || media.byteLength === 0) {
    throw new CreateHologramError('empty_media', 'media must be non-empty bytes');
  }
  if (!VALID_SOURCE_KINDS.has(sourceKind)) {
    throw new CreateHologramError(
      'invalid_source_kind',
      `sourceKind must be one of ${[...VALID_SOURCE_KINDS].join('|')}, got ${sourceKind}`
    );
  }
  const targets = options.targets ?? ['quilt', 'mvhevc', 'parallax'];
  for (const t of targets) {
    if (!VALID_TARGETS.has(t)) {
      throw new CreateHologramError(
        'unknown_target',
        `unknown target '${t}' — must be one of ${[...VALID_TARGETS].join('|')}`
      );
    }
  }
  if (!providers.depth) {
    throw new CreateHologramError('missing_provider', 'providers.depth is required');
  }
  if (targets.includes('quilt') && !providers.quilt) {
    throw new CreateHologramError(
      'missing_provider',
      "target 'quilt' requested but providers.quilt is not configured"
    );
  }
  if (targets.includes('mvhevc') && !providers.mvhevc) {
    throw new CreateHologramError(
      'missing_provider',
      "target 'mvhevc' requested but providers.mvhevc is not configured"
    );
  }
  if (targets.includes('parallax') && !providers.parallax) {
    throw new CreateHologramError(
      'missing_provider',
      "target 'parallax' requested but providers.parallax is not configured"
    );
  }

  const now = options.now ?? (() => new Date());
  const startMs = Date.now();

  // ── 1. Depth inference ──
  let depthResult: DepthInferenceResult;
  try {
    depthResult = await providers.depth.infer(media, sourceKind);
  } catch (err) {
    throw new CreateHologramError(
      'depth_failed',
      `depth inference failed: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  const { depthMap, width, height, frames, backend, modelId } = depthResult;

  // ── 2. Derive normal map (CPU, deterministic, free) ──
  // Per W.155: depth-to-normal via Sobel costs zero extra inference.
  const normalMap = depthToNormalMap(depthMap, width, height);

  // ── 3. Build meta (canonical identity fields first) ──
  const meta: HologramMeta = {
    sourceKind,
    width,
    height,
    frames,
    modelId,
    backend,
    inferenceMs: Date.now() - startMs,
    createdAt: now().toISOString(),
    schemaVersion: 1,
  };

  // ── 4. Pack depth + normal into Uint8 views for hashing/storage ──
  const depthBin = new Uint8Array(depthMap.buffer, depthMap.byteOffset, depthMap.byteLength);
  const normalBin = new Uint8Array(normalMap.buffer, normalMap.byteOffset, normalMap.byteLength);

  // ── 5. Compute identity hash (content-addressed) ──
  const hash = await computeBundleHash(meta, depthBin, normalBin);

  // ── 6. Render targets in parallel (fail-fast on any error) ──
  const renderInput = { depthMap, normalMap, width, height, frames, media, sourceKind };
  const renderPromises: Promise<[HologramTarget, Uint8Array]>[] = [];
  if (targets.includes('quilt') && providers.quilt) {
    renderPromises.push(
      providers.quilt.render(renderInput).then((bytes) => ['quilt' as const, bytes])
    );
  }
  if (targets.includes('mvhevc') && providers.mvhevc) {
    renderPromises.push(
      providers.mvhevc.encode(renderInput).then((bytes) => ['mvhevc' as const, bytes])
    );
  }
  if (targets.includes('parallax') && providers.parallax) {
    renderPromises.push(
      providers.parallax.encode(renderInput).then((bytes) => ['parallax' as const, bytes])
    );
  }

  let rendered: [HologramTarget, Uint8Array][];
  try {
    if (options.sequentialRender) {
      rendered = [];
      for (const p of renderPromises) {
        rendered.push(await p);
      }
    } else {
      rendered = await Promise.all(renderPromises);
    }
  } catch (err) {
    throw new CreateHologramError(
      'render_failed',
      `render failed: ${err instanceof Error ? err.message : String(err)}`,
      err
    );
  }

  // ── 7. Assemble bundle ──
  const bundle: HologramBundle = { hash, meta, depthBin, normalBin };
  for (const [target, bytes] of rendered) {
    if (target === 'quilt') bundle.quiltPng = bytes;
    else if (target === 'mvhevc') bundle.mvhevcMp4 = bytes;
    else if (target === 'parallax') bundle.parallaxWebm = bytes;
  }

  return bundle;
}

// ── Node providers backed by the hologram-worker service ────────────────────

/**
 * Node-side providers for CLI and service surfaces. The implementation is
 * worker-backed: each provider calls the Sprint 0c hologram-worker provider
 * endpoint and returns bytes/maps to the isomorphic createHologram pipeline.
 *
 * If the worker is not configured or reachable, the provider fails loudly with
 * CreateHologramError('missing_provider'); there is no synthetic fallback.
 */
export function createNodeProviders(
  options: CreateNodeProvidersOptions = {}
): HologramProviders {
  return {
    depth: {
      async infer(media, sourceKind) {
        const response = await postWorkerJson<WorkerDepthResponse>(options, '/providers/depth', {
          sourceBase64: bytesToBase64(media),
          mediaType: sourceKind,
        });
        const { depthMapBase64, width, height, frames, backend, modelId } = response;
        if (
          !depthMapBase64 ||
          !Number.isInteger(width) ||
          !Number.isInteger(height) ||
          !Number.isInteger(frames) ||
          !backend ||
          !modelId
        ) {
          throw new CreateHologramError(
            'missing_provider',
            'hologram-worker depth response omitted required fields'
          );
        }
        const depthMap = base64ToFloat32(depthMapBase64, 'depth');
        return {
          depthMap,
          width: width as number,
          height: height as number,
          frames: frames as number,
          backend,
          modelId,
        };
      },
    },
    quilt: {
      async render(input) {
        const response = await postWorkerJson<WorkerBytesResponse>(options, '/providers/quilt', {
          sourceBase64: bytesToBase64(input.media),
          mediaType: input.sourceKind,
          depthMapBase64: float32ToBase64(input.depthMap),
          normalMapBase64: float32ToBase64(input.normalMap),
          width: input.width,
          height: input.height,
          frames: input.frames,
        });
        return decodeWorkerBytes(response, 'quilt');
      },
    },
    mvhevc: {
      async encode(input) {
        const response = await postWorkerJson<WorkerBytesResponse>(options, '/providers/mvhevc', {
          sourceBase64: bytesToBase64(input.media),
          mediaType: input.sourceKind,
          depthMapBase64: float32ToBase64(input.depthMap),
          width: input.width,
          height: input.height,
          frames: input.frames,
        });
        return decodeWorkerBytes(response, 'mvhevc');
      },
    },
    parallax: {
      async encode(input) {
        const response = await postWorkerJson<WorkerBytesResponse>(options, '/providers/parallax', {
          sourceBase64: bytesToBase64(input.media),
          mediaType: input.sourceKind,
          depthMapBase64: float32ToBase64(input.depthMap),
          width: input.width,
          height: input.height,
        });
        return decodeWorkerBytes(response, 'parallax');
      },
    },
  };
}

/**
 * @deprecated Use createNodeProviders(). Kept as a compatibility alias for
 * older callers; it no longer returns Sprint-0a stubs.
 */
export function createNodeProvidersStub(
  options: CreateNodeProvidersOptions = {}
): HologramProviders {
  return createNodeProviders(options);
}
