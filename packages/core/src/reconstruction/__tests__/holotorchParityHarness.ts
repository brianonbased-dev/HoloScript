/**
 * holotorchParityHarness.ts — shared WebGPU bootstrap + parity helpers for the
 * HoloTorch inference-parity tests. Not a test file (no *.test.ts suffix).
 *
 * Extracted once a third consumer appeared (gemm, ops, block). The two earlier
 * parity tests still inline their bootstrap; folding them onto this harness is a
 * follow-up cleanup.
 *
 * Receipts (2026-09-24 audit follow-up): every run APPENDS. The tip file
 * `<op>-parity.receipt.json` is still rewritten so existing readers keep working,
 * but the same payload is also appended (a) as a timestamped sibling under
 * `receipts/history/` and (b) as one NDJSON line in `receipts/parity-history.ndjson`.
 * Prior tip contents are never deleted.
 */
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export interface AdapterInfo {
  vendor?: string;
  architecture?: string;
  device?: string;
  description?: string;
}

let capturedAdapterInfo: AdapterInfo = {};
let cachedDevice: GPUDevice | null | undefined;

export function getAdapterInfo(): AdapterInfo {
  return capturedAdapterInfo;
}

/** Bootstrap node-webgpu once and cache the device (prefers the discrete GPU). Null in GPU-less env. */
export async function getWebGpuDevice(): Promise<GPUDevice | null> {
  if (cachedDevice !== undefined) return cachedDevice;
  const g = globalThis as unknown as { navigator?: { gpu?: GPU } };
  if (!g.navigator?.gpu) {
    try {
      const mod = (await import('webgpu')) as unknown as {
        create?: (flags: string[]) => GPU;
        globals?: Record<string, unknown>;
        default?: { create?: (flags: string[]) => GPU; globals?: Record<string, unknown> };
      };
      const create = mod.create ?? mod.default?.create;
      const globals = mod.globals ?? mod.default?.globals ?? {};
      const gpu = typeof create === 'function' ? create([]) : undefined;
      if (!gpu || typeof (gpu as { requestAdapter?: unknown }).requestAdapter !== 'function') {
        cachedDevice = null;
        return null;
      }
      g.navigator ??= {} as { gpu?: GPU };
      g.navigator.gpu = gpu;
      const target = globalThis as unknown as Record<string, unknown>;
      for (const [k, v] of Object.entries(globals)) {
        if (target[k] == null)
          Object.defineProperty(globalThis, k, { value: v, writable: true, configurable: true });
      }
    } catch {
      cachedDevice = null;
      return null;
    }
  }
  const adapter = await g.navigator!.gpu!.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    cachedDevice = null;
    return null;
  }
  const info = (adapter as unknown as { info?: AdapterInfo }).info ?? {};
  capturedAdapterInfo = {
    vendor: info.vendor,
    architecture: info.architecture,
    device: info.device,
    description: info.description,
  };
  cachedDevice = await adapter.requestDevice();
  return cachedDevice;
}

export interface AllCloseResult {
  maxAbs: number;
  maxRefAbs: number;
  relToScale: number;
  allClose: boolean;
}

/** numpy.allclose semantics: |got-ref| <= atol + rtol*|ref| elementwise. */
export function compareAllClose(
  got: Float32Array,
  ref: Float64Array,
  atol: number,
  rtol: number
): AllCloseResult {
  let maxAbs = 0;
  let maxRefAbs = 0;
  let allClose = true;
  for (let i = 0; i < got.length; i++) {
    const abs = Math.abs(got[i] - ref[i]);
    const r = Math.abs(ref[i]);
    if (abs > maxAbs) maxAbs = abs;
    if (r > maxRefAbs) maxRefAbs = r;
    if (abs > atol + rtol * r) allClose = false;
  }
  return { maxAbs, maxRefAbs, relToScale: maxAbs / Math.max(maxRefAbs, 1e-12), allClose };
}

/** Deterministic PRNG in [-1, 1] so receipts reproduce. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return (s / 0xffffffff) * 2 - 1;
  };
}

export function receiptsDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), '..', 'holotorch', 'receipts');
}

/**
 * Append a parity receipt. Tip file is updated for existing readers; history is
 * never overwritten. Stamp defaults to now (ISO, colon-safe for filenames).
 */
export function writeParityReceipt(
  op: string,
  payload: Record<string, unknown>,
  { stamp = new Date().toISOString() }: { stamp?: string } = {}
): { tipPath: string; historyPath: string; ndjsonPath: string } {
  const outDir = receiptsDir();
  const historyDir = join(outDir, 'history');
  mkdirSync(historyDir, { recursive: true });
  const record = {
    schema: 'holotorch-inference-parity.v0',
    op,
    recordedAt: stamp,
    adapter: capturedAdapterInfo,
    ...payload,
  };
  const body = `${JSON.stringify(record, null, 2)}\n`;
  const tipPath = join(outDir, `${op}-parity.receipt.json`);
  const safeStamp = stamp.replace(/[:.]/g, '-');
  const historyPath = join(historyDir, `${op}-parity.${safeStamp}.receipt.json`);
  const ndjsonPath = join(outDir, 'parity-history.ndjson');
  writeFileSync(historyPath, body);
  appendFileSync(ndjsonPath, `${JSON.stringify(record)}\n`);
  writeFileSync(tipPath, body);
  return { tipPath, historyPath, ndjsonPath };
}
