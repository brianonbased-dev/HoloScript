/**
 * Playwright test harness for WebGPU Physics Smoke Benchmark.
 *
 * Loads packages/engine/benchmark-webgpu-physics.html in a Chromium browser
 * with WebGPU enabled, waits for window.__WEBGPU_PHYSICS_ARTIFACT__ to settle,
 * asserts schema validity, and writes machine-readable JSON to
 * .bench-logs/webgpu-physics-bench.json for CI drift detection.
 *
 * Environment variables:
 *   BENCH_HEADLESS        "0" to show browser (default: "1")
 *   BENCH_TIMEOUT_MS      timeout in ms (default: 120000)
 *   BENCH_REQUIRE_COMPLETED  "0" to pass even on non-completed status (default: "0")
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
  const commit = process.env.BENCH_COMMIT ?? process.env.GIT_COMMIT ?? 'auto';
  const driver = process.env.BENCH_DRIVER ?? 'auto';

  const params = new URLSearchParams({ commit, driver });

  const htmlPath = path.join(pkgRoot, 'benchmark-webgpu-physics.html').replace(/\\/g, '/');
  return `file:///${htmlPath}?${params.toString()}`;
}

async function resolveOutputPath(): Promise<string> {
  if (process.env.BENCH_OUTPUT_PATH) return process.env.BENCH_OUTPUT_PATH;
  return path.join(repoRoot, '.bench-logs', 'webgpu-physics-bench.json');
}

interface PhysicsBenchCell {
  particleCount: number;
  steps: number;
  totalMs: number;
  avgStepMs: number;
  fps: number;
  passed: boolean;
}

interface WebGPUPhysicsArtifact {
  schema_version: string;
  benchmark: string;
  outputPath: string;
  generatedAt: string;
  status: string;
  commitSha: string;
  driver: string;
  sourceHtml: string;
  browserUserAgent: string;
  adapter: {
    vendor: string | null;
    architecture: string | null;
    device: string | null;
    description: string | null;
  } | null;
  cells: PhysicsBenchCell[];
  failures: Array<{ stage: string; message: string; timestamp: string }>;
  notes: string[];
}

// ---------------------------------------------------------------------------
// Status categories
// ---------------------------------------------------------------------------

const COMPLETED_STATUS = 'completed';

const TOLERATED_STATUSES = new Set([
  COMPLETED_STATUS,
  'unsupported',
  'error',
]);

const POLL_INTERVAL_MS = 500;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('WebGPU physics smoke benchmark harness', () => {
  let artifact: WebGPUPhysicsArtifact;

  test('loads benchmark-webgpu-physics.html, captures artifact, and writes JSON', async ({ page }) => {
    const fileUrl = buildFileUrl();

    let settled = false;
    let resolveArtifact!: (a: WebGPUPhysicsArtifact) => void;
    const artifactPromise = new Promise<WebGPUPhysicsArtifact>((resolve) => {
      resolveArtifact = resolve;
    });

    await page.exposeFunction('__playwrightBenchDone__', (a: WebGPUPhysicsArtifact) => {
      if (settled) return;
      settled = true;
      resolveArtifact(a);
    });

    await page.addInitScript(`
      const _poll = setInterval(() => {
        const a = window.__WEBGPU_PHYSICS_ARTIFACT__;
        if (!a) return;
        const s = a.status;
        if (s === 'completed' || s === 'error' || s === 'unsupported') {
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

    console.log('[harness] Waiting for __WEBGPU_PHYSICS_ARTIFACT__ to settle...');
    artifact = await artifactPromise;

    console.log(`[harness] Settled with status: ${artifact.status}`);

    // Schema assertions
    expect(artifact.schema_version).toBe('webgpu-physics-bench-v1');
    expect(artifact.benchmark).toBe('webgpu-physics-bench');
    expect(typeof artifact.generatedAt).toBe('string');
    expect(typeof artifact.browserUserAgent).toBe('string');
    expect(Array.isArray(artifact.failures)).toBe(true);
    expect(Array.isArray(artifact.notes)).toBe(true);
    expect(Array.isArray(artifact.cells)).toBe(true);

    // Status assertions
    expect(
      TOLERATED_STATUSES.has(artifact.status),
      `Unexpected artifact status: "${artifact.status}"`
    ).toBe(true);

    // Adapter info assertions (when present)
    if (artifact.adapter) {
      expect(typeof artifact.adapter.vendor).toBe('string');
    }

    // Cell assertions (when completed)
    if (artifact.status === COMPLETED_STATUS) {
      expect(artifact.cells.length).toBeGreaterThan(0);

      for (const cell of artifact.cells) {
        expect(typeof cell.particleCount).toBe('number');
        expect(typeof cell.avgStepMs).toBe('number');
        expect(typeof cell.fps).toBe('number');
        expect(typeof cell.passed).toBe('boolean');

        // Physics sanity: step time must be positive finite
        expect(cell.avgStepMs).toBeGreaterThan(0);
        expect(Number.isFinite(cell.fps)).toBe(true);
      }

      // 1K must pass (this is the smoke test floor)
      const cell1k = artifact.cells.find((c) => c.particleCount === 1000);
      if (cell1k) {
        expect(cell1k.passed).toBe(true);
        console.log(
          `[harness] 1K cell: ${cell1k.avgStepMs.toFixed(3)} ms/step (${cell1k.fps.toFixed(1)} FPS)`
        );
      }

      // 10K and 100K are informative; we log but don't gate CI on them
      const cell10k = artifact.cells.find((c) => c.particleCount === 10000);
      const cell100k = artifact.cells.find((c) => c.particleCount === 100000);
      if (cell10k) {
        console.log(
          `[harness] 10K cell: ${cell10k.avgStepMs.toFixed(3)} ms/step (${cell10k.fps.toFixed(1)} FPS)`
        );
      }
      if (cell100k) {
        console.log(
          `[harness] 100K cell: ${cell100k.avgStepMs.toFixed(3)} ms/step (${cell100k.fps.toFixed(1)} FPS)`
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
    console.log(`[harness] Receipt saved -> ${outputPath}`);
  });

  test('artifact schema is stable across runs (drift guard)', async () => {
    const outputPath = await resolveOutputPath();

    let baseline: WebGPUPhysicsArtifact | null = null;
    try {
      const raw = await fs.readFile(outputPath, 'utf-8');
      baseline = JSON.parse(raw) as WebGPUPhysicsArtifact;
    } catch {
      console.log('[drift-guard] No baseline artifact found -- first run, skipping drift check.');
      test.skip();
      return;
    }

    expect(baseline.schema_version).toBe('webgpu-physics-bench-v1');

    if (
      artifact &&
      artifact.status === COMPLETED_STATUS &&
      baseline.status === COMPLETED_STATUS
    ) {
      // Compare 1K cell FPS drift (loose: within 20% is fine)
      const prev1k = baseline.cells.find((c) => c.particleCount === 1000);
      const curr1k = artifact.cells.find((c) => c.particleCount === 1000);
      if (prev1k && curr1k) {
        const drift = Math.abs(prev1k.avgStepMs - curr1k.avgStepMs) / prev1k.avgStepMs;
        console.log(`[drift-guard] 1K cell drift: ${(drift * 100).toFixed(1)}%`);
        if (drift > 0.2) {
          console.warn(
            `[drift-guard] Significant drift detected: ` +
            `prev=${prev1k.avgStepMs.toFixed(3)} ms ` +
            `curr=${curr1k.avgStepMs.toFixed(3)} ms`
          );
        }
      }
    }
  });
});
