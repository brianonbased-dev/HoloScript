#!/usr/bin/env node
/**
 * Paper 11 — RTX GPU Timing Harness for trait semiring resolution overhead.
 *
 * Analogous to packages/snn-webgpu/scripts/run-benchmark.mjs
 * Launches Chromium + WebGPU (high-perf / native Vulkan on RTX 3060/6000 Ada),
 * loads the self-contained p11-trait-gpu.html (WGSL proxy for tropical semiring ops +
 * JS browser baseline), captures artifact with per-batch per-trait µs numbers,
 * saves to .bench-logs/paper-11-trait-gpu-bench.json
 *
 * Run (from HoloScript root, after pnpm install + playwright install):
 *   node benchmarks/p11-trait-gpu-bench.mjs
 *   # or with env:
 *   BENCH_VULKAN_BACKEND=native BENCH_FORCE_HIGH_PERFORMANCE_GPU=1 node ...
 *
 * This produces the missing D.011 RTX empirical data point for Paper 11 (ECOO P '27).
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '..');

function boolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}
function numEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const p = Number(raw);
  return Number.isFinite(p) && p > 0 ? p : defaultValue;
}

function resolveOptions() {
  const target = process.env.BENCH_TARGET ?? 'rtx';
  const headless = boolEnv('BENCH_HEADLESS', true);
  const timeoutMs = numEnv('BENCH_TIMEOUT_MS', 180000);
  const vulkanBackend = process.env.BENCH_VULKAN_BACKEND ?? 'native';
  const forceHighPerformanceGpu = boolEnv('BENCH_FORCE_HIGH_PERFORMANCE_GPU', true);
  const outputPath = process.env.BENCH_OUTPUT_PATH ??
    path.join(repoRoot, '.bench-logs', 'paper-11-trait-gpu-bench.json');
  return { target, headless, timeoutMs, vulkanBackend, forceHighPerformanceGpu, outputPath };
}

async function main() {
  const opts = resolveOptions();
  console.log('[P11-GPU-Bench] Starting Paper 11 trait semiring GPU harness...');
  console.log('[P11-GPU-Bench] Options:', opts);

  const chromiumArgs = [
    '--enable-unsafe-webgpu',
    '--enable-webgpu-developer-features',
    `--use-vulkan=${opts.vulkanBackend}`,
    '--disable-vulkan-fallback-to-gl-for-testing',
    '--ignore-gpu-blocklist',
  ];
  if (opts.forceHighPerformanceGpu) chromiumArgs.push('--force_high_performance_gpu');

  const browser = await chromium.launch({ headless: opts.headless, args: chromiumArgs });
  const page = await browser.newPage();

  page.on('console', (msg) => {
    if (['error', 'warning'].includes(msg.type())) console.log(`[browser:${msg.type()}] ${msg.text()}`);
  });
  page.on('pageerror', (e) => console.log('[browser:pageerror]', e.message));

  let settled = false;
  let resolveArtifact;
  const artifactPromise = new Promise(r => { resolveArtifact = r; });

  await page.exposeFunction('onP11Complete', (art) => {
    if (settled) return;
    settled = true;
    resolveArtifact(art);
  });

  const watch = `
    setInterval(() => {
      if (window.__P11_GPU_ARTIFACT__ &&
          (window.__P11_GPU_ARTIFACT__.status === 'completed' ||
           window.__P11_GPU_ARTIFACT__.status === 'error')) {
        window.onP11Complete(window.__P11_GPU_ARTIFACT__);
      }
    }, 400);
  `;
  await page.addInitScript(watch);

  const htmlUrl = `file://${path.join(repoRoot, 'benchmarks', 'p11-trait-gpu.html')}?target=${encodeURIComponent(opts.target)}`;
  console.log('[P11-GPU-Bench] Navigating to', htmlUrl);
  await page.goto(htmlUrl);

  console.log('[P11-GPU-Bench] Waiting for GPU benchmark (WebGPU + proxy semiring on RTX)...');

  const artifact = await Promise.race([
    artifactPromise,
    new Promise((_, rej) => setTimeout(() => rej(new Error(`Timeout after ${opts.timeoutMs}ms`)), opts.timeoutMs))
  ]);

  await browser.close();

  const outPath = path.resolve(opts.outputPath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(artifact, null, 2));
  console.log('[P11-GPU-Bench] Artifact written:', outPath);

  if (artifact.status === 'completed') {
    console.log('[P11-GPU-Bench] SUCCESS — GPU timing data captured for Paper 11 D.011.');
    if (artifact.byBatchSize?.length) {
      const sample = artifact.byBatchSize[artifact.byBatchSize.length - 1];
      console.log('  Sample (largest batch):', sample);
    }
  } else {
    console.error('[P11-GPU-Bench] Completed with status:', artifact.status, artifact.error || '');
  }
}

main().catch(err => {
  console.error('[P11-GPU-Bench] FATAL', err);
  process.exit(1);
});
