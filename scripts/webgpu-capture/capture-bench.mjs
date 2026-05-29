#!/usr/bin/env node
/**
 * Generalized WebGPU bench-capture driver.
 *
 * Extends the existing probe-webgpu.mjs pattern (Playwright + Chromium with
 * --enable-unsafe-webgpu --ignore-gpu-blocklist [+ --use-vulkan on Linux])
 * into a config-driven benchmark capture. The output is a receipt-v2.schema.json-
 * shaped JSON anchored to the paper section that cites it.
 *
 * Usage:
 *   node scripts/webgpu-capture/capture-bench.mjs <config.json> [--out <path>]
 *
 * The config shape mirrors the schema's `kernel` block plus per-bench knobs:
 *   {
 *     "paper": "trust-by-construction-paper",
 *     "section": "5.1",
 *     "harness": "scripts/webgpu-capture/capture-bench.mjs",
 *     "kernel": {
 *       "name": "cael-trace-fold",
 *       "wgsl_path": "packages/engine/src/gpu/shaders/cg_kernels.wgsl",
 *       "entry_point": "reduce_residual",       // @compute fn name
 *       "workgroup_size": [256, 1, 1],
 *       "dispatch_size": [16, 1, 1]
 *     },
 *     "buffers": [
 *       { "name": "data", "binding": 0, "size_bytes": 16384,
 *         "init": "iota-f32", "usage": ["storage", "copy_dst", "copy_src"] }
 *     ],
 *     "trials": 100,
 *     "warmup": 10
 *   }
 *
 * Env overrides:
 *   HOLOSCRIPT_HW_TIER       — pin H1/H2/H3
 *   HOLOSCRIPT_HW_LABEL      — human-readable host label
 *   HOLOSCRIPT_HW_GPU        — GPU label
 *   WEBGPU_PROBE_CHROME      — path to Chromium binary (defaults to bundled)
 *   WEBGPU_PROBE_HEADLESS    — '0' to disable headless
 *   WEBGPU_LAUNCH_ARGS       — comma-separated additional args
 *
 * Designed to run on any host the existing probe-webgpu.mjs runs on:
 * Windows (Google Chrome), Linux (Chromium + vulkan), macOS (Chrome).
 * Use scripts/webgpu-capture/setup-host.sh on a Linux fleet host first.
 */

import http from 'node:http';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import { chromium } from 'playwright';

// ── CLI ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.error('Usage: capture-bench.mjs <config.json> [--out <path>]');
  process.exit(1);
}
const configPath = args[0];
const outIdx = args.indexOf('--out');
const outPathArg = outIdx >= 0 ? args[outIdx + 1] : undefined;

const config = JSON.parse(readFileSync(configPath, 'utf8'));
const repoRoot = findRepoRoot(process.cwd());
const wgslAbsPath = path.resolve(repoRoot, config.kernel.wgsl_path);
const wgsl = readFileSync(wgslAbsPath, 'utf8');
const wgslSha256 = createHash('sha256').update(wgsl).digest('hex');

// ── Hardware tier ────────────────────────────────────────────────────────
const hardware = detectHardware();

// ── Launch Chromium + run kernel ─────────────────────────────────────────
const result = await runCapture({ wgsl, wgslSha256 });

// ── Emit receipt-v2 ──────────────────────────────────────────────────────
const capturedAt = new Date().toISOString();
const receipt = {
  receipt_version: 'v2',
  captured_at: capturedAt,
  path: 'webgpu-browser',
  paper: config.paper,
  section: config.section ?? null,
  harness: config.harness ?? 'scripts/webgpu-capture/capture-bench.mjs',
  hardware,
  adapter_info: result.adapterInfo,
  browser: result.browser,
  kernel: {
    name: config.kernel.entry_point,
    wgsl_path: config.kernel.wgsl_path,
    wgsl_sha256: wgslSha256,
    workgroup_size: config.kernel.workgroup_size,
    dispatch_size: config.kernel.dispatch_size,
  },
  protocol_commit: gitHeadHash(repoRoot),
  results: result.results,
  notes: result.notes,
  ots_proof_path: null,
  anchor_chain: null,
};

const benchDir = path.join(
  repoRoot,
  '.bench-logs',
  capturedAt.replace(/[:.]/g, '-')
);
mkdirSync(benchDir, { recursive: true });
const outPath = outPathArg ?? path.join(benchDir, `${config.paper}-${config.kernel.entry_point}.json`);
writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
console.log(`[capture-bench] receipt → ${outPath}`);
console.log(JSON.stringify(receipt, null, 2));
process.exit(0);

// ── Hardware detection (matches paper4-rtx-bench-standalone.mjs) ─────────
function detectHardware() {
  const envTier = process.env.HOLOSCRIPT_HW_TIER;
  const envLabel = process.env.HOLOSCRIPT_HW_LABEL;
  const envGpu = process.env.HOLOSCRIPT_HW_GPU;
  const cpuInfo = os.cpus();
  const cpuModel = cpuInfo[0]?.model ?? 'unknown';
  const cpuCount = cpuInfo.length;
  const ramGb = Math.round((os.totalmem() / 1024 / 1024 / 1024) * 10) / 10;
  let tier = 'H1', label, tierConfidence = 'fallback';
  if (envTier === 'H1' || envTier === 'H2' || envTier === 'H3') {
    tier = envTier;
    label = envLabel ?? `${envTier} (HOLOSCRIPT_HW_TIER=${envTier})`;
    tierConfidence = 'env';
  } else if (/Xeon|Threadripper|EPYC/i.test(cpuModel)) {
    tier = 'H2';
    label = 'H2 (auto-detected workstation/server CPU)';
    tierConfidence = 'detected';
  } else {
    label = 'H1 (fallback: CPU model unrecognized)';
  }
  return {
    tier, label,
    gpu: envGpu ?? 'unspecified (read from adapter_info)',
    cpu: cpuModel, cpuCount, ramGb,
    platform: process.platform,
    release: os.release(),
    arch: process.arch,
    node: process.version,
    tierConfidence,
  };
}

function gitHeadHash(repoRoot) {
  try {
    return execSync('git rev-parse HEAD', { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    return null;
  }
}

function findRepoRoot(start) {
  let cur = start;
  for (let i = 0; i < 12; i++) {
    if (existsSync(path.join(cur, 'pnpm-workspace.yaml'))) return cur;
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  return start;
}

// ── Browser launch + page driver ─────────────────────────────────────────
async function runCapture({ wgsl, wgslSha256 }) {
  const DEFAULT_CHROME_WIN = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
  const executablePath =
    process.env.WEBGPU_PROBE_CHROME && existsSync(process.env.WEBGPU_PROBE_CHROME)
      ? process.env.WEBGPU_PROBE_CHROME
      : existsSync(DEFAULT_CHROME_WIN) ? DEFAULT_CHROME_WIN : undefined;

  const headless = process.env.WEBGPU_PROBE_HEADLESS !== '0';
  const baseArgs = [
    '--enable-unsafe-webgpu',
    '--ignore-gpu-blocklist',
    '--no-sandbox',
    ...(process.platform === 'linux' ? ['--use-vulkan'] : []),
    ...(process.env.WEBGPU_LAUNCH_ARGS ? process.env.WEBGPU_LAUNCH_ARGS.split(',') : []),
  ];

  // Tiny localhost server so the page runs in a secure context.
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
    res.end(buildPage());
  });
  const address = await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address()));
  });

  let browser;
  try {
    browser = await chromium.launch({
      headless,
      ...(executablePath ? { executablePath } : {}),
      args: baseArgs,
    });
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[page] ERR ${msg.text()}`);
    });
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'domcontentloaded' });
    const pageResult = await page.evaluate(runBenchInPage, {
      wgsl,
      wgslSha256,
      kernel: config.kernel,
      buffers: config.buffers ?? [{ name: 'data', binding: 0, size_bytes: 16384, init: 'iota-f32', usage: ['storage', 'copy_dst', 'copy_src'] }],
      trials: config.trials ?? 100,
      warmup: config.warmup ?? 10,
    });
    return {
      adapterInfo: pageResult.adapterInfo,
      browser: {
        userAgent: pageResult.userAgent,
        executablePath: executablePath ?? 'playwright-bundled-chromium',
        headless,
        launchArgs: baseArgs,
      },
      results: pageResult.results,
      notes: pageResult.notes,
    };
  } finally {
    if (browser) await browser.close();
    await new Promise((r) => server.close(r));
  }
}

function buildPage() {
  return `<!doctype html>
<title>HoloScript WebGPU Bench Capture</title>
<body>
<h1>WebGPU bench capture running…</h1>
<pre id="log"></pre>
</body>`;
}

// ── Page-context bench runner ─────────────────────────────────────────────
async function runBenchInPage(input) {
  const log = (m) => {
    const el = document.getElementById('log');
    if (el) el.textContent += m + '\n';
    console.log(m);
  };

  if (!navigator.gpu) {
    return {
      adapterInfo: null,
      userAgent: navigator.userAgent,
      notes: ['navigator.gpu unavailable'],
      results: [],
    };
  }
  const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
  if (!adapter) {
    return {
      adapterInfo: null,
      userAgent: navigator.userAgent,
      notes: ['requestAdapter returned null'],
      results: [],
    };
  }
  const adapterInfo = adapter.requestAdapterInfo
    ? await adapter.requestAdapterInfo()
    : { vendor: '', architecture: '', device: '', description: '' };
  const device = await adapter.requestDevice();
  const notes = [];

  // --- Init buffers ---
  const buffers = input.buffers.map((b) => {
    let usage = 0;
    for (const u of b.usage) {
      if (u === 'storage') usage |= GPUBufferUsage.STORAGE;
      else if (u === 'copy_dst') usage |= GPUBufferUsage.COPY_DST;
      else if (u === 'copy_src') usage |= GPUBufferUsage.COPY_SRC;
      else if (u === 'uniform') usage |= GPUBufferUsage.UNIFORM;
    }
    const buf = device.createBuffer({ size: b.size_bytes, usage });
    if (b.init === 'iota-f32') {
      const n = b.size_bytes / 4;
      const arr = new Float32Array(n);
      for (let i = 0; i < n; i++) arr[i] = i;
      device.queue.writeBuffer(buf, 0, arr);
    } else if (b.init === 'iota-u32') {
      const n = b.size_bytes / 4;
      const arr = new Uint32Array(n);
      for (let i = 0; i < n; i++) arr[i] = i >>> 0;
      device.queue.writeBuffer(buf, 0, arr);
    } else if (b.init === 'zeros') {
      const arr = new Uint8Array(b.size_bytes);
      device.queue.writeBuffer(buf, 0, arr);
    }
    return { ...b, buffer: buf };
  });

  // --- Compile shader + pipeline ---
  const shader = device.createShaderModule({ code: input.wgsl });
  let compileFailed = false;
  if (shader.getCompilationInfo) {
    const info = await shader.getCompilationInfo();
    for (const m of info.messages) {
      const tag = m.type === 'error' ? 'ERR' : m.type.toUpperCase();
      const line = `WGSL ${tag} ${m.lineNum}:${m.linePos} ${m.message}`;
      log(line);
      if (m.type === 'error') compileFailed = true;
    }
  }
  if (compileFailed) {
    return {
      adapterInfo,
      userAgent: navigator.userAgent,
      notes: [...notes, 'WGSL compilation reported errors; see log'],
      results: [],
    };
  }

  let pipeline;
  try {
    pipeline = device.createComputePipeline({
      layout: 'auto',
      compute: { module: shader, entryPoint: input.kernel.entry_point },
    });
  } catch (e) {
    return {
      adapterInfo,
      userAgent: navigator.userAgent,
      notes: [...notes, `pipeline creation failed: ${e?.message ?? e}`],
      results: [],
    };
  }

  const bindGroup = device.createBindGroup({
    layout: pipeline.getBindGroupLayout(0),
    entries: buffers.map((b) => ({ binding: b.binding, resource: { buffer: b.buffer } })),
  });

  const [dx, dy, dz] = input.kernel.dispatch_size ?? [1, 1, 1];

  // --- Warmup ---
  for (let i = 0; i < input.warmup; i++) {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(dx, dy, dz);
    pass.end();
    device.queue.submit([enc.finish()]);
  }
  await device.queue.onSubmittedWorkDone();

  // --- Trials (wall-clock incl. queue submit; GPU-only timestamp would need timestamp-query feature) ---
  const times = [];
  for (let i = 0; i < input.trials; i++) {
    const t0 = performance.now();
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.dispatchWorkgroups(dx, dy, dz);
    pass.end();
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    times.push((performance.now() - t0) * 1000); // µs
  }

  const sorted = [...times].sort((a, b) => a - b);
  const median = sorted.length % 2 === 0
    ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
    : sorted[Math.floor(sorted.length / 2)];
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);

  return {
    adapterInfo,
    userAgent: navigator.userAgent,
    notes: [
      'Timings include queue submit + onSubmittedWorkDone awaiter (wall-clock); ' +
      'GPU-only timestamp query would require timestamp-query feature.',
      ...notes,
    ],
    results: [{
      op: input.kernel.entry_point,
      scale: `dispatch ${dx}x${dy}x${dz} workgroups @ ${(input.kernel.workgroup_size || []).join('x')}`,
      n: input.trials,
      trials: input.trials,
      median_us: median,
      p95_us: sorted[p95Idx],
      min_us: sorted[0],
      max_us: sorted[sorted.length - 1],
    }],
  };
}
