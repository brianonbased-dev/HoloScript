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
    rendered = await Promise.all(renderPromises);
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

// ── Provider stubs for Sprint 0a ─────────────────────────────────────────────

/**
 * Node-side providers for CLI and the hologram-worker service. These are
 * STUBS in Sprint 0a — they throw with an explicit Sprint reference so
 * callers can't silently fall through. Real implementations land in
 * Sprint 0c (worker): onnxruntime-node depth + headless Chromium quilt
 * render + ffmpeg MV-HEVC mux.
 */
export function createNodeProvidersStub(): HologramProviders {
  const rejectStub = <T>(which: string): Promise<T> => {
    return Promise.reject(
      new CreateHologramError(
        'missing_provider',
        `Node ${which} provider is not implemented in Sprint 0a — see Sprint 0c (hologram-worker service)`
      )
    );
  };
  return {
    depth: {
      async infer() {
        return rejectStub<DepthInferenceResult>('depth');
      },
    },
    quilt: {
      async render() {
        return rejectStub<Uint8Array>('quilt');
      },
    },
    mvhevc: {
      async encode() {
        return rejectStub<Uint8Array>('mvhevc');
      },
    },
    parallax: {
      async encode() {
        return rejectStub<Uint8Array>('parallax');
      },
    },
  };
}
