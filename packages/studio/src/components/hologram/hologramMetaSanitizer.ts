/**
 * hologramMetaSanitizer — defensive validation for HologramMeta fields
 * before they reach the DOM.
 *
 * Why a separate module? The viewer is a `'use client'` React component
 * that imports lucide-react and other ESM-only deps that fail to transform
 * under vitest's node environment in this package (see AgentMonitorPanel
 * test pattern: extract logic, test logic). Sanitization is the security-
 * critical part and MUST be unit-tested without the React shell.
 *
 * SECURITY (per task spec):
 *   - meta.json: only render validated fields. Never echo URL query params
 *     or raw user input into the page.
 *   - Treat bundle.meta fields as untrusted: escape strings, validate
 *     types, ignore unknown fields.
 */

import type { HologramMeta } from '@holoscript/engine/hologram';

/** Whitelisted meta fields that the viewer is allowed to display. */
export interface SafeHologramMeta {
  sourceKind: 'image' | 'gif' | 'video' | 'unknown';
  width: number;
  height: number;
  frames: number;
  /** Sanitized model id, max 64 chars, alphanum + dash + slash + dot only */
  modelId: string;
  backend: 'webgpu' | 'wasm' | 'cpu' | 'onnxruntime-node' | 'unknown';
  inferenceMs: number;
  /** ISO timestamp, validated; 'unknown' if invalid */
  createdAt: string;
}

const VALID_SOURCE_KINDS = new Set(['image', 'gif', 'video']);
const VALID_BACKENDS = new Set(['webgpu', 'wasm', 'cpu', 'onnxruntime-node']);

// Model IDs are short identifiers like "depth-anything/Depth-Anything-V2-Small-hf".
// We allow [A-Za-z0-9._/-] only and cap at 64 chars to prevent layout abuse.
const MODEL_ID_PATTERN = /^[A-Za-z0-9._/-]{1,64}$/;

// ISO 8601 — strict YYYY-MM-DDTHH:MM:SS(.sss)?Z. We DON'T accept timezone
// offsets (defensive narrowing: fewer code paths, fewer formatter bugs).
const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/;

const MAX_DIMENSION = 16384; // 16K — anything bigger is almost certainly an attack
const MAX_FRAMES = 10000; // 10k frames — bigger likely means resource exhaustion
const MAX_INFERENCE_MS = 24 * 60 * 60 * 1000; // 1 day

function safeInt(v: unknown, max: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return 0;
  if (!Number.isInteger(v)) return Math.floor(v);
  if (v < 0) return 0;
  if (v > max) return max;
  return v;
}

/**
 * Produce a render-safe view of HologramMeta. Untrusted fields are
 * coerced/clamped/replaced with 'unknown' rather than thrown — the viewer
 * should always render SOMETHING (defense-in-depth: a corrupt meta.json
 * shouldn't break the page entirely).
 *
 * Unknown fields on the input are silently dropped. This matters because
 * `bundle.meta` is read from the store, where a future schema migration
 * could add fields the current viewer isn't ready to render.
 */
export function sanitizeMetaForRender(meta: unknown): SafeHologramMeta {
  if (!meta || typeof meta !== 'object') {
    return {
      sourceKind: 'unknown',
      width: 0,
      height: 0,
      frames: 0,
      modelId: 'unknown',
      backend: 'unknown',
      inferenceMs: 0,
      createdAt: 'unknown',
    };
  }

  const m = meta as Record<string, unknown>;

  const sourceKind =
    typeof m.sourceKind === 'string' && VALID_SOURCE_KINDS.has(m.sourceKind)
      ? (m.sourceKind as 'image' | 'gif' | 'video')
      : 'unknown';

  const backend =
    typeof m.backend === 'string' && VALID_BACKENDS.has(m.backend)
      ? (m.backend as SafeHologramMeta['backend'])
      : 'unknown';

  const modelId =
    typeof m.modelId === 'string' && MODEL_ID_PATTERN.test(m.modelId)
      ? m.modelId
      : 'unknown';

  const createdAt =
    typeof m.createdAt === 'string' && ISO_PATTERN.test(m.createdAt)
      ? m.createdAt
      : 'unknown';

  return {
    sourceKind,
    width: safeInt(m.width, MAX_DIMENSION),
    height: safeInt(m.height, MAX_DIMENSION),
    frames: safeInt(m.frames, MAX_FRAMES),
    modelId,
    backend,
    inferenceMs: safeInt(m.inferenceMs, MAX_INFERENCE_MS),
    createdAt,
  };
}

/**
 * Validate that a string is a 64-char lowercase hex hash. The viewer uses
 * this on path params (the `[hash]` route segment) before constructing
 * any asset URL. If false, render 404 — never echo the bad value back.
 */
export function isHashLike(s: unknown): s is string {
  return typeof s === 'string' && /^[0-9a-f]{64}$/.test(s);
}

/** Type guard accepting only the strict HologramMeta shape (no coercion). */
export function isStrictHologramMeta(v: unknown): v is HologramMeta {
  if (!v || typeof v !== 'object') return false;
  const o = v as Record<string, unknown>;
  return (
    o.schemaVersion === 1 &&
    typeof o.sourceKind === 'string' &&
    VALID_SOURCE_KINDS.has(o.sourceKind) &&
    typeof o.width === 'number' &&
    typeof o.height === 'number' &&
    typeof o.frames === 'number' &&
    typeof o.modelId === 'string' &&
    typeof o.backend === 'string' &&
    VALID_BACKENDS.has(o.backend) &&
    typeof o.inferenceMs === 'number' &&
    typeof o.createdAt === 'string'
  );
}
