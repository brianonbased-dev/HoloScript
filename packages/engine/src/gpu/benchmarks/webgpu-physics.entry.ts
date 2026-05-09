/**
 * WebGPU Physics Smoke / Benchmark — browser entry point.
 *
 * Runs the existing WebGPU particle-physics pipeline at 1K, 10K, and 100K
 * particles, measures per-step wall time, and exposes a machine-readable
 * artifact on window.__WEBGPU_PHYSICS_ARTIFACT__ for the Playwright harness.
 *
 * Build:  pnpm run build:webgpu-physics-bench
 *         (esbuild bundles this entry into benchmark-webgpu-physics.js)
 *
 * Run:    pnpm run benchmark:webgpu:physics
 *         (or open benchmark-webgpu-physics.html directly in Chrome)
 */

import { WebGPUContext } from '../WebGPUContext.js';
import { GPUBufferManager, createInitialParticleData } from '../GPUBuffers.js';
import { ComputePipeline } from '../ComputePipeline.js';
import { PARTICLE_PHYSICS_WGSL } from './particle-physics-shader.js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface PhysicsBenchCell {
  particleCount: number;
  steps: number;
  totalMs: number;
  avgStepMs: number;
  fps: number;
  passed: boolean; // true if avgStepMs < 16.0 (60 FPS budget)
}

interface WebGPUPhysicsArtifact {
  schema_version: string;
  benchmark: string;
  outputPath: string;
  generatedAt: string;
  status: 'initializing' | 'completed' | 'error' | 'unsupported';
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

declare global {
  interface Window {
    __WEBGPU_PHYSICS_ARTIFACT__?: WebGPUPhysicsArtifact;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
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
// Benchmark core
// ─────────────────────────────────────────────────────────────────────────────

async function runBenchmarkCell(
  particleCount: number,
  steps: number,
  artifact: WebGPUPhysicsArtifact
): Promise<PhysicsBenchCell> {
  const context = new WebGPUContext({ fallbackToCPU: false });
  await context.initialize();

  if (!context.isSupported()) {
    throw new Error('WebGPU not supported');
  }

  const bufferManager = new GPUBufferManager(context, particleCount);
  await bufferManager.initialize();

  const pipeline = new ComputePipeline(context, bufferManager, {
    shaderCode: PARTICLE_PHYSICS_WGSL,
    workgroupSize: context.getOptimalWorkgroupSize(),
  });
  await pipeline.initialize();

  // Seed particles high above ground
  const data = createInitialParticleData(particleCount, {
    positionRange: { min: -5, max: 5 },
    radius: 0.05,
    mass: 1.0,
  });
  for (let i = 0; i < particleCount; i++) {
    data.positions[i * 4 + 1] = 10.0; // y = 10m
  }
  bufferManager.uploadParticleData(data);

  const uniforms = {
    dt: 0.016,
    gravity: 9.8,
    groundY: 0,
    restitution: 0.5,
    friction: 0.9,
    particleCount,
    _pad1: 0,
    _pad2: 0,
  };

  // Warm-up: 10 steps (excluded from timing)
  for (let i = 0; i < 10; i++) {
    await pipeline.step(uniforms);
  }

  // Timed run
  const t0 = performance.now();
  for (let i = 0; i < steps; i++) {
    await pipeline.step(uniforms);
  }
  const totalMs = performance.now() - t0;
  const avgStepMs = totalMs / steps;
  const fps = 1000 / avgStepMs;

  // Download a small sample to sanity-check physics moved
  const final = await bufferManager.downloadParticleData();
  let anyMoved = false;
  for (let i = 0; i < Math.min(particleCount, 10); i++) {
    if (final.positions[i * 4 + 1] < 9.9) {
      anyMoved = true;
      break;
    }
  }
  if (!anyMoved) {
    artifact.notes.push(`Cell ${particleCount}: particles did not move — possible shader stall.`);
  }

  bufferManager.destroy();
  pipeline.destroy();
  context.destroy();

  return {
    particleCount,
    steps,
    totalMs,
    avgStepMs,
    fps,
    passed: avgStepMs < 16.0,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main benchmark
// ─────────────────────────────────────────────────────────────────────────────

async function runWebGPUPhysicsBenchmark(): Promise<void> {
  const query = new URLSearchParams(window.location.search);

  const artifact: WebGPUPhysicsArtifact = {
    schema_version: 'webgpu-physics-bench-v1',
    benchmark: 'webgpu-physics-bench',
    outputPath: 'HoloScript/.bench-logs/webgpu-physics-bench.json',
    generatedAt: new Date().toISOString(),
    status: 'initializing',
    commitSha: query.get('commit') ?? 'UNKNOWN_COMMIT_SHA_SET_QUERY_PARAM',
    driver: query.get('driver') ?? 'UNKNOWN_DRIVER_SET_QUERY_PARAM',
    sourceHtml: 'packages/engine/benchmark-webgpu-physics.html',
    browserUserAgent: navigator.userAgent,
    adapter: null,
    cells: [],
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
  // Adapter detection
  // ------------------------------------------------------------------
  try {
    if ('gpu' in navigator) {
      const adapter = await (navigator as any).gpu.requestAdapter();
      if (adapter) {
        const info = adapter.info || {};
        artifact.adapter = {
          vendor: info.vendor || null,
          architecture: info.architecture || null,
          device: info.device || null,
          description: [info.vendor, info.architecture, info.device].filter(Boolean).join(' ') || null,
        };
      } else {
        note('WebGPU adapter request returned null (software renderer or blocked).');
      }
    } else {
      note('WebGPU not available in this browser.');
    }
  } catch (e: any) {
    note(`WebGPU adapter detection failed: ${e.message}`);
  }

  if (!artifact.adapter) {
    artifact.status = 'unsupported';
    fail('adapter_detection', 'WebGPU adapter unavailable — benchmark requires Chrome/Edge with WebGPU enabled.');
    window.__WEBGPU_PHYSICS_ARTIFACT__ = artifact;
    return;
  }

  // ------------------------------------------------------------------
  // Benchmark cells: 1K, 10K, 100K particles
  // ------------------------------------------------------------------
  const configs = [
    { particleCount: 1000, steps: 300 },
    { particleCount: 10000, steps: 300 },
    { particleCount: 100000, steps: 120 },
  ];

  for (const cfg of configs) {
    try {
      const cell = await runBenchmarkCell(cfg.particleCount, cfg.steps, artifact);
      artifact.cells.push(cell);
      note(
        `${cfg.particleCount} particles: ${cell.avgStepMs.toFixed(3)} ms/step ` +
        `(${cell.fps.toFixed(1)} FPS) — ${cell.passed ? 'PASS' : 'FAIL'}`
      );
    } catch (e: any) {
      fail(`cell_${cfg.particleCount}`, e.message || String(e));
    }
  }

  if (artifact.failures.length === 0) {
    artifact.status = 'completed';
  } else if (artifact.cells.length > 0) {
    // Partial success: some cells ran, some failed
    artifact.status = 'completed';
    note('Some benchmark cells failed; see failures array.');
  } else {
    artifact.status = 'error';
  }

  window.__WEBGPU_PHYSICS_ARTIFACT__ = artifact;
}

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────

runWebGPUPhysicsBenchmark().catch((err) => {
  console.error('[webgpu-physics-bench] Unhandled error:', err);
  const prev = (window as any).__WEBGPU_PHYSICS_ARTIFACT__;
  (window as any).__WEBGPU_PHYSICS_ARTIFACT__ = {
    ...(prev || {}),
    status: 'error',
    failures: [
      ...(prev?.failures || []),
      { stage: 'bootstrap', message: String(err), timestamp: new Date().toISOString() },
    ],
  };
});
