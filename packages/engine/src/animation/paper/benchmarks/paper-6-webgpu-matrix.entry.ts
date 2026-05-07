/**
 * Paper-6 WebGPU Cross-Backend Matrix Benchmark — browser entry point.
 *
 * Imports the canonical AnimationSamplingProbe, runs it in the browser,
 * detects environment (browser / OS / GPU), measures per-stage latency,
 * computes the FNV-1a hash, and exposes the artifact on
 * window.__PAPER6_WEBGPU_ARTIFACT__ for the Playwright harness to capture.
 *
 * Build:  pnpm run build:paper6-bench
 *         (esbuild bundles this entry into benchmark-paper6-webgpu.js)
 *
 * Run:    npx playwright test tests/paper-6-webgpu-matrix.spec.ts
 *         (or open benchmark-paper6-webgpu.html directly in a browser)
 */

import { runAnimationSamplingProbe, PAPER_P2_0_CANONICAL_SPEC } from '../AnimationSamplingProbe';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Paper6CellResult {
  browser: string;
  os: string;
  gpuVendor: string;
  gpuDevice: string | null;
  gpuArchitecture: string | null;
  adapterDescription: string | null;
  hash: number;
  baselineHash: number;
  hashEqual: boolean;
  timings: {
    preimageBuild_ms: number;
    schemaValidation_ms: number;
    sampling_ms: number;
    hashing_ms: number;
    regressionCheck_ms: number;
    total_ms: number;
  };
}

interface Paper6WebGPUArtifact {
  schema_version: string;
  benchmark: string;
  outputPath: string;
  generatedAt: string;
  status: 'initializing' | 'completed' | 'error' | 'aborted_wrong_adapter';
  target: string;
  strictAdapter: boolean;
  commitSha: string;
  driver: string;
  sourceHtml: string;
  browserUserAgent: string;
  cell: Paper6CellResult | null;
  failures: Array<{ stage: string; message: string; timestamp: string }>;
  notes: string[];
}

declare global {
  interface Window {
    __PAPER6_WEBGPU_ARTIFACT__?: Paper6WebGPUArtifact;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Environment detection
// ─────────────────────────────────────────────────────────────────────────────

function detectBrowser(ua: string): string {
  if (ua.includes('Edg/')) return 'Edge';
  if (ua.includes('Chrome/') && !ua.includes('Edg/')) return 'Chromium';
  if (ua.includes('Firefox/')) return 'Firefox';
  if (ua.includes('Safari/') && !ua.includes('Chrome/')) return 'Safari';
  return 'Unknown';
}

function detectOS(ua: string): string {
  if (ua.includes('Windows NT')) return 'Windows';
  if (ua.includes('Mac OS X')) return 'macOS';
  if (ua.includes('Linux') && !ua.includes('Android')) return 'Linux';
  if (ua.includes('Android')) return 'Android';
  if (ua.includes('iPhone') || ua.includes('iPad')) return 'iOS';
  return 'Unknown';
}

// ─────────────────────────────────────────────────────────────────────────────
// FNV-1a 32-bit (platform-stable, same as Paper6MecanimDivergenceProbe)
// ─────────────────────────────────────────────────────────────────────────────

function fnv1a32(data: Uint8Array): number {
  let hash = 0x811c9dc5 >>> 0;
  for (let i = 0; i < data.length; i++) {
    hash ^= data[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Baseline hash — computed from the canonical spec under the HoloScript
// contract baseline (CPU, deterministic reduction order).
// This value was computed once and frozen; any change to the canonical spec
// or sampling math must be reflected here.
// Computed 2026-04-30 via:
//   npx tsx -e "import {runAnimationSamplingProbe, PAPER_P2_0_CANONICAL_SPEC} from ..."
// ─────────────────────────────────────────────────────────────────────────────

const PAPER6_CANONICAL_BASELINE_HASH: number = 0x9d39d725; // seeded 2026-04-30 from Chromium+Windows+integrated GPU

// ─────────────────────────────────────────────────────────────────────────────
// Main benchmark
// ─────────────────────────────────────────────────────────────────────────────

async function runPaper6WebGPUMatrixBenchmark(): Promise<void> {
  const query = new URLSearchParams(window.location.search);
  const target = query.get('target') ?? 'auto';
  const strictAdapter = query.get('strictAdapter') === '1' || target === 'rtx3060';

  const artifact: Paper6WebGPUArtifact = {
    schema_version: 'paper-6-gpu-bench-v1',
    benchmark: 'paper-6-gpu-bench',
    outputPath: 'HoloScript/.bench-logs/paper-6-gpu-bench.json',
    generatedAt: new Date().toISOString(),
    status: 'initializing',
    target,
    strictAdapter,
    commitSha: query.get('commit') ?? 'UNKNOWN_COMMIT_SHA_SET_QUERY_PARAM',
    driver: query.get('driver') ?? 'UNKNOWN_DRIVER_SET_QUERY_PARAM',
    sourceHtml: 'packages/engine/benchmark-paper6-webgpu.html',
    browserUserAgent: navigator.userAgent,
    cell: null,
    failures: [],
    notes: [],
  };

  function fail(stage: string, message: string) {
    artifact.status = 'error';
    artifact.failures.push({ stage, message, timestamp: new Date().toISOString() });
  }

  function note(message: string) {
    artifact.notes.push(message);
  }

  // ------------------------------------------------------------------
  // WebGPU adapter detection (best-effort; may fail on non-WebGPU browsers)
  // ------------------------------------------------------------------
  let adapterInfo: {
    vendor: string;
    architecture: string | null;
    device: string | null;
    description: string | null;
  } | null = null;

  try {
    if ('gpu' in navigator) {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        const info = adapter.info || {};
        adapterInfo = {
          vendor: info.vendor || 'unknown',
          architecture: info.architecture || null,
          device: info.device || null,
          description: [info.vendor, info.architecture, info.device].filter(Boolean).join(' ') || null,
        };
      } else {
        note('WebGPU adapter request returned null (software renderer or blocked).');
      }
    } else {
      note('WebGPU not available in this browser — running CPU-only substrate probe.');
    }
  } catch (e: any) {
    note(`WebGPU adapter detection failed: ${e.message}`);
  }

  // ------------------------------------------------------------------
  // Adapter gate (RTX-3060 strict mode)
  // ------------------------------------------------------------------
  if (strictAdapter && adapterInfo) {
    const isNvidia = adapterInfo.vendor.toLowerCase().includes('nvidia');
    const isAmpereOrBetter = ['ampere', 'ada', 'rtx'].some((t) =>
      (adapterInfo!.description || '').toLowerCase().includes(t)
    );
    if (!isNvidia || !isAmpereOrBetter) {
      artifact.status = 'aborted_wrong_adapter';
      fail(
        'adapter_gate',
        `strictAdapter requested but adapter is "${adapterInfo.description}" (expected NVIDIA Ampere/Ada).`
      );
      window.__PAPER6_WEBGPU_ARTIFACT__ = artifact;
      return;
    }
  }

  // ------------------------------------------------------------------
  // Per-stage timing
  // ------------------------------------------------------------------
  const t0 = performance.now();

  // 1. Preimage build (construct clip + validate spec)
  const tPreimage0 = performance.now();
  const clipSpec = PAPER_P2_0_CANONICAL_SPEC.clipSpec;
  const sampleTimes = PAPER_P2_0_CANONICAL_SPEC.sampleTimes;
  const tPreimage1 = performance.now();

  // 2. Schema validation (minimal — assert spec shape)
  const tSchema0 = performance.now();
  if (!clipSpec.tracks || clipSpec.tracks.length === 0) {
    fail('schema_validation', 'Canonical spec has no tracks');
    window.__PAPER6_WEBGPU_ARTIFACT__ = artifact;
    return;
  }
  if (!sampleTimes || sampleTimes.length === 0) {
    fail('schema_validation', 'Canonical spec has no sample times');
    window.__PAPER6_WEBGPU_ARTIFACT__ = artifact;
    return;
  }
  const tSchema1 = performance.now();

  // 3. Sampling (the substrate probe)
  const tSampling0 = performance.now();
  let samples: Uint8Array;
  try {
    samples = runAnimationSamplingProbe(PAPER_P2_0_CANONICAL_SPEC);
  } catch (e: any) {
    fail('sampling', `runAnimationSamplingProbe threw: ${e.message}`);
    window.__PAPER6_WEBGPU_ARTIFACT__ = artifact;
    return;
  }
  const tSampling1 = performance.now();

  // 4. Hash chain (FNV-1a of the sampled bytes)
  const tHash0 = performance.now();
  const hash = fnv1a32(samples);
  const tHash1 = performance.now();

  // 5. Regression check (compare to baseline)
  const tRegression0 = performance.now();
  const baselineHash = PAPER6_CANONICAL_BASELINE_HASH;
  // When the baseline hash is still the placeholder (0x00000000), we
  // treat this as a "seed" run — the hash itself becomes the baseline
  // for future comparisons on this exact build.
  const hashEqual = baselineHash === 0 ? true : hash === baselineHash;
  const tRegression1 = performance.now();

  const t1 = performance.now();

  // ------------------------------------------------------------------
  // Populate artifact
  // ------------------------------------------------------------------
  artifact.cell = {
    browser: detectBrowser(navigator.userAgent),
    os: detectOS(navigator.userAgent),
    gpuVendor: adapterInfo?.vendor ?? 'cpu-only',
    gpuDevice: adapterInfo?.device ?? null,
    gpuArchitecture: adapterInfo?.architecture ?? null,
    adapterDescription: adapterInfo?.description ?? null,
    hash,
    baselineHash,
    hashEqual,
    timings: {
      preimageBuild_ms: tPreimage1 - tPreimage0,
      schemaValidation_ms: tSchema1 - tSchema0,
      sampling_ms: tSampling1 - tSampling0,
      hashing_ms: tHash1 - tHash0,
      regressionCheck_ms: tRegression1 - tRegression0,
      total_ms: t1 - t0,
    },
  };

  if (baselineHash === 0) {
    note(
      `Baseline hash is placeholder (0x00000000). ` +
      `This run seeded hash=0x${hash.toString(16).padStart(8, '0')}. ` +
      `Update PAPER6_CANONICAL_BASELINE_HASH after cross-cell verification.`
    );
  }

  artifact.status = 'completed';
  window.__PAPER6_WEBGPU_ARTIFACT__ = artifact;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

runPaper6WebGPUMatrixBenchmark().catch((err) => {
  console.error('[paper-6-webgpu-matrix] Unhandled error:', err);
  (window as any).__PAPER6_WEBGPU_ARTIFACT__ = {
    ...(window as any).__PAPER6_WEBGPU_ARTIFACT__,
    status: 'error',
    failures: [
      ...(window as any).__PAPER6_WEBGPU_ARTIFACT__?.failures ?? [],
      { stage: 'bootstrap', message: String(err), timestamp: new Date().toISOString() },
    ],
  };
});
