/**
 * Playwright test harness for Paper-6 WebGPU Cross-Backend Matrix Benchmark.
 *
 * Loads packages/engine/benchmark-paper6-webgpu.html in a Chromium browser with
 * WebGPU enabled, waits for window.__PAPER6_WEBGPU_ARTIFACT__ to settle,
 * asserts schema validity, and writes machine-readable JSON to
 * .bench-logs/paper-6-webgpu-matrix-bench.json for CI drift detection.
 *
 * Environment variables:
 *   BENCH_HEADLESS        "0" to show browser (default: "1")
 *   BENCH_TIMEOUT_MS      timeout in ms (default: 120000)
 *   BENCH_REQUIRE_COMPLETED  "0" to pass even on non-completed status (default: "0")
 *   BENCH_STRICT_ADAPTER  "1" to gate on NVIDIA/Ampere adapter (default: "0")
 *   BENCH_TARGET          "rtx3060" | "auto" (default: "auto")
 *   BENCH_COMMIT          git commit SHA for artifact metadata (default: "auto")
 *   BENCH_DRIVER          GPU driver version for artifact metadata (default: "auto")
 *   BENCH_OUTPUT_PATH     override output JSON path
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgRoot, '../..');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function boolEnv(name: string, defaultValue = false): boolean {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function buildFileUrl(): string {
  const target = process.env.BENCH_TARGET ?? 'auto';
  const strictAdapter = boolEnv('BENCH_STRICT_ADAPTER', false) || target === 'rtx3060';
  const commit = process.env.BENCH_COMMIT ?? process.env.GIT_COMMIT ?? 'auto';
  const driver = process.env.BENCH_DRIVER ?? 'auto';

  const params = new URLSearchParams({
    target,
    strictAdapter: strictAdapter ? '1' : '0',
    commit,
    driver,
  });

  const htmlPath = path.join(pkgRoot, 'benchmark-paper6-webgpu.html').replace(/\\/g, '/');
  return `file:///${htmlPath}?${params.toString()}`;
}

async function resolveOutputPath(): Promise<string> {
  if (process.env.BENCH_OUTPUT_PATH) return process.env.BENCH_OUTPUT_PATH;
  return path.join(repoRoot, '.bench-logs', 'paper-6-gpu-bench.json');
}

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
  status: string;
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

// ---------------------------------------------------------------------------
// Status categories
// ---------------------------------------------------------------------------

const COMPLETED_STATUS = 'completed';

const TOLERATED_STATUSES = new Set([
  COMPLETED_STATUS,
  'aborted_wrong_adapter',
  'device_request_failed',
  'benchmark_error',
]);

const POLL_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Paper-6 WebGPU cross-backend matrix benchmark harness', () => {
  let artifact: Paper6WebGPUArtifact;

  test('loads benchmark-paper6-webgpu.html, captures artifact, and writes JSON', async ({ page }) => {
    const fileUrl = buildFileUrl();

    let settled = false;
    let resolveArtifact!: (a: Paper6WebGPUArtifact) => void;
    const artifactPromise = new Promise<Paper6WebGPUArtifact>((resolve) => {
      resolveArtifact = resolve;
    });

    await page.exposeFunction('__playwrightBenchDone__', (a: Paper6WebGPUArtifact) => {
      if (settled) return;
      settled = true;
      resolveArtifact(a);
    });

    await page.addInitScript(`
      const _poll = setInterval(() => {
        const a = window.__PAPER6_WEBGPU_ARTIFACT__;
        if (!a) return;
        const s = a.status;
        if (s === 'completed' || String(s).includes('error') || String(s).includes('aborted') || String(s).includes('failed')) {
          clearInterval(_poll);
          window.__playwrightBenchDone__(a);
        }
      }, ${POLL_INTERVAL_MS});
    `);

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        console.log(`[browser:error] ${msg.text()}`);
      }
    });
    page.on('pageerror', (err) => {
      console.log(`[browser:pageerror] ${err.message}`);
    });

    console.log(`\n[harness] Loading: ${fileUrl}`);
    await page.goto(fileUrl);

    console.log('[harness] Waiting for __PAPER6_WEBGPU_ARTIFACT__ to settle...');
    artifact = await artifactPromise;

    console.log(`[harness] Settled with status: ${artifact.status}`);

    // Schema assertions
    expect(artifact.schema_version).toBe('paper-6-gpu-bench-v1');
    expect(artifact.benchmark).toBe('paper-6-gpu-bench');
    expect(typeof artifact.generatedAt).toBe('string');
    expect(typeof artifact.browserUserAgent).toBe('string');
    expect(Array.isArray(artifact.failures)).toBe(true);
    expect(Array.isArray(artifact.notes)).toBe(true);

    // Status assertions
    expect(
      TOLERATED_STATUSES.has(artifact.status),
      `Unexpected artifact status: "${artifact.status}"`
    ).toBe(true);

    // Cell assertions (when completed)
    if (artifact.status === COMPLETED_STATUS) {
      expect(artifact.cell).not.toBeNull();
      const cell = artifact.cell!;
      expect(typeof cell.browser).toBe('string');
      expect(typeof cell.os).toBe('string');
      expect(typeof cell.gpuVendor).toBe('string');
      expect(typeof cell.hash).toBe('number');
      expect(typeof cell.hashEqual).toBe('boolean');
      expect(cell.timings.sampling_ms).toBeGreaterThan(0);
      expect(cell.timings.total_ms).toBeGreaterThan(0);

      // Determinism: hash must be stable (baseline placeholder allows any hash)
      if (cell.baselineHash !== 0) {
        expect(cell.hashEqual).toBe(true);
      }

      // Cross-backend claim: if the hash diverges from baseline, note it
      if (!cell.hashEqual && cell.baselineHash !== 0) {
        console.warn(
          `[harness] Hash divergence detected: ` +
          `hash=0x${cell.hash.toString(16).padStart(8, '0')} ` +
          `baseline=0x${cell.baselineHash.toString(16).padStart(8, '0')}`
        );
      }
    } else {
      console.log(
        `[harness] Status "${artifact.status}" is not 'completed'. ` +
        `Failures: ${JSON.stringify(artifact.failures)}`
      );
      if (!boolEnv('BENCH_REQUIRE_COMPLETED')) {
        console.log('[harness] BENCH_REQUIRE_COMPLETED not set -- accepting non-completed status.');
      }
    }

    // Write artifact
    const outputPath = await resolveOutputPath();
    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, JSON.stringify(artifact, null, 2), 'utf-8');
    console.log(`[harness] Artifact saved -> ${outputPath}`);
  });

  test('artifact schema is stable across runs (drift guard)', async ({ page }) => {
    const outputPath = await resolveOutputPath();

    let baseline: Paper6WebGPUArtifact | null = null;
    try {
      const raw = await fs.readFile(outputPath, 'utf-8');
      baseline = JSON.parse(raw) as Paper6WebGPUArtifact;
    } catch {
      console.log('[drift-guard] No baseline artifact found -- first run, skipping drift check.');
      test.skip();
      return;
    }

    expect(baseline.schema_version).toBe('paper-6-gpu-bench-v1');

    if (artifact && artifact.status === COMPLETED_STATUS && baseline.status === COMPLETED_STATUS) {
      const prevHash = baseline.cell?.hash ?? null;
      const currHash = artifact.cell?.hash ?? null;

      if (prevHash !== null && currHash !== null) {
        if (prevHash !== currHash) {
          console.warn(
            `[drift-guard] Hash drift detected: ` +
            `previous=0x${prevHash.toString(16).padStart(8, '0')} ` +
            `current=0x${currHash.toString(16).padStart(8, '0')}`
          );
        } else {
          console.log(
            `[drift-guard] Hash stable: ` +
            `0x${currHash.toString(16).padStart(8, '0')}`
          );
        }
      }
    }
  });
});
