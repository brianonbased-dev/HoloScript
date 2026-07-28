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
import { execFileSync, execSync } from 'node:child_process';
import * as path from 'node:path';
import * as os from 'node:os';
import { chromium } from 'playwright';
import {
  buildGpuIdentityNotes,
  detectHostGpuInventory,
  normalizeBrowserGpuInfo,
} from './gpu-identity.mjs';

// ── CLI ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0 || args[0] === '--help') {
  console.error('Usage: capture-bench.mjs <config.json> [--out <path>]');
  process.exit(1);
}
const configPath = args[0];
const outIdx = args.indexOf('--out');
const outPathArg = outIdx >= 0 ? args[outIdx + 1] : undefined;

const configSource = readFileSync(configPath, 'utf8');
const config = JSON.parse(configSource);
const repoRoot = findRepoRoot(process.cwd());
const wgslAbsPath = path.resolve(repoRoot, config.kernel.wgsl_path);
const wgsl = readFileSync(wgslAbsPath, 'utf8');
const wgslSha256 = createHash('sha256').update(wgsl).digest('hex');
const harnessRelativePath = 'scripts/webgpu-capture/capture-bench.mjs';
const gpuIdentityRelativePath = 'scripts/webgpu-capture/gpu-identity.mjs';
const configRelativePath = path.relative(repoRoot, path.resolve(configPath)).replaceAll('\\', '/');
const relevantPaths = [
  harnessRelativePath,
  gpuIdentityRelativePath,
  configRelativePath,
  config.kernel.wgsl_path,
];

// ── Hardware tier ────────────────────────────────────────────────────────
const hardware = detectHardware();
const hostGpuInventory = detectHostGpuInventory();

// ── Launch Chromium + run kernel ─────────────────────────────────────────
const result = await runCapture({ wgsl, wgslSha256 });

if (!Array.isArray(result.results) || result.results.length === 0) {
  throw new Error('WebGPU capture produced no benchmark result; refusing to emit evidence.');
}
if (config.require_digest_match === true) {
  const digest = result.results[0]?.digest_summary;
  const matched =
    digest?.digest_bit_identical === true || digest?.digest_epsilon_identical === true;
  if (!matched) {
    throw new Error(
      `WebGPU digest requirement failed: mode=${digest?.digest_mode ?? 'missing'} ` +
        `unique=${digest?.unique_digest_count ?? 'missing'}`
    );
  }
}

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
  browser_gpu_info: result.browserGpuInfo,
  host_gpu_inventory: hostGpuInventory,
  browser: result.browser,
  kernel: {
    name: config.kernel.entry_point,
    wgsl_path: config.kernel.wgsl_path,
    wgsl_sha256: wgslSha256,
    workgroup_size: config.kernel.workgroup_size,
    dispatch_size: config.kernel.dispatch_size,
  },
  protocol_commit: gitHeadHash(repoRoot),
  code_provenance: {
    relevant_paths_clean: gitPathsClean(repoRoot, relevantPaths),
    inputs: [
      sourceIdentity(repoRoot, harnessRelativePath),
      sourceIdentity(repoRoot, gpuIdentityRelativePath),
      { path: configRelativePath, sha256: sha256Text(configSource) },
      { path: config.kernel.wgsl_path, sha256: wgslSha256 },
    ],
  },
  results: result.results,
  notes: [
    ...result.notes,
    ...buildGpuIdentityNotes(result.adapterInfo, result.browserGpuInfo, hostGpuInventory),
  ],
  ots_proof_path: null,
  anchor_chain: null,
};

const benchDir = path.join(repoRoot, '.bench-logs', capturedAt.replace(/[:.]/g, '-'));
mkdirSync(benchDir, { recursive: true });
const outPath =
  outPathArg ?? path.join(benchDir, `${config.paper}-${config.kernel.entry_point}.json`);
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
  let tier = 'H1',
    label,
    tierConfidence = 'fallback';
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
    tier,
    label,
    gpu: envGpu ?? 'unspecified (see adapter_info, browser_gpu_info, and host_gpu_inventory)',
    cpu: cpuModel,
    cpuCount,
    ramGb,
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

function gitPathsClean(repoRoot, paths) {
  try {
    execFileSync('git', ['diff', '--quiet', '--', ...paths], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['diff', '--cached', '--quiet', '--', ...paths], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function sha256Text(value) {
  return createHash('sha256').update(value).digest('hex');
}

function sourceIdentity(repoRoot, relativePath) {
  return {
    path: relativePath,
    sha256: createHash('sha256')
      .update(readFileSync(path.resolve(repoRoot, relativePath)))
      .digest('hex'),
  };
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
      : existsSync(DEFAULT_CHROME_WIN)
        ? DEFAULT_CHROME_WIN
        : undefined;

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
    let browserGpuInfo = null;
    let browserGpuInfoNote = null;
    let cdpSession;
    try {
      cdpSession = await browser.newBrowserCDPSession();
      const systemInfo = await cdpSession.send('SystemInfo.getInfo');
      browserGpuInfo = normalizeBrowserGpuInfo(systemInfo?.gpu);
    } catch {
      browserGpuInfoNote = 'Chromium CDP SystemInfo.getInfo was unavailable.';
    } finally {
      if (cdpSession) await cdpSession.detach().catch(() => {});
    }
    const page = await browser.newPage();
    page.on('console', (msg) => {
      if (msg.type() === 'error') console.error(`[page] ERR ${msg.text()}`);
    });
    await page.goto(`http://127.0.0.1:${address.port}/`, { waitUntil: 'domcontentloaded' });
    const pageResult = await page.evaluate(runBenchInPage, {
      wgsl,
      wgslSha256,
      kernel: config.kernel,
      buffers: config.buffers ?? [
        {
          name: 'data',
          binding: 0,
          size_bytes: 16384,
          init: 'iota-f32',
          usage: ['storage', 'copy_dst', 'copy_src'],
        },
      ],
      trials: config.trials ?? 100,
      warmup: config.warmup ?? 10,
      digest_buffer: config.digest_buffer ?? null,
    });
    return {
      adapterInfo: pageResult.adapterInfo,
      browserGpuInfo,
      browser: {
        userAgent: pageResult.userAgent,
        executablePath: executablePath ?? 'playwright-bundled-chromium',
        headless,
        launchArgs: baseArgs,
      },
      results: pageResult.results,
      notes: [...pageResult.notes, ...(browserGpuInfoNote ? [browserGpuInfoNote] : [])],
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
  const adapterInfo = adapter.info
    ? { ...adapter.info }
    : adapter.requestAdapterInfo
      ? await adapter.requestAdapterInfo()
      : { vendor: '', architecture: '', device: '', description: '' };

  // Phase 3: request 'timestamp-query' feature so we can report kernel-only
  // GPU timing distinct from wall-clock-including-queue. If the adapter
  // doesn't support it (rare on modern desktop GPUs), fall back to wall-only.
  const hasTimestamp = adapter.features.has('timestamp-query');
  const device = hasTimestamp
    ? await adapter.requestDevice({ requiredFeatures: ['timestamp-query'] })
    : await adapter.requestDevice();
  const notes = [];
  if (!hasTimestamp) {
    notes.push(
      'Adapter does not support timestamp-query feature; falling back to wall-clock-only timing.'
    );
  }

  // --- Init buffers (extracted so the per-trial reset path can replay the
  //     same init spec — critical for digest_buffer claims that span more
  //     than just an `init: zeros` shape, e.g. SAXPY's vec_y = iota-f32). ---
  function writeInit(buf, b) {
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
    } else if (b.init && typeof b.init === 'object' && b.init.kind === 'csr-tridiag-f32') {
      // Synthetic tridiagonal CSR: 3 nonzeros per row (i-1, i, i+1). f32 values.
      // For binding 'csr_val' (f32 nnz), 'csr_col' (u32 nnz), 'csr_row' (u32 num_rows+1).
      const N = b.init.num_rows;
      if (b.init.field === 'val') {
        const arr = new Float32Array(b.size_bytes / 4);
        let k = 0;
        for (let i = 0; i < N; i++) {
          if (i > 0) arr[k++] = -1.0;
          arr[k++] = 2.0;
          if (i < N - 1) arr[k++] = -1.0;
        }
        device.queue.writeBuffer(buf, 0, arr);
      } else if (b.init.field === 'col') {
        const arr = new Uint32Array(b.size_bytes / 4);
        let k = 0;
        for (let i = 0; i < N; i++) {
          if (i > 0) arr[k++] = i - 1;
          arr[k++] = i;
          if (i < N - 1) arr[k++] = i + 1;
        }
        device.queue.writeBuffer(buf, 0, arr);
      } else if (b.init.field === 'row') {
        // CSR row pointer: row[i+1] - row[i] = nnz in row i. Tridiagonal:
        // boundary rows have 2 NNZ, middle rows have 3.
        const arr = new Uint32Array(b.size_bytes / 4);
        let cum = 0;
        arr[0] = 0;
        for (let i = 0; i < N; i++) {
          cum += i === 0 || i === N - 1 ? 2 : 3;
          arr[i + 1] = cum;
        }
        device.queue.writeBuffer(buf, 0, arr);
      }
    } else if (b.init && typeof b.init === 'object' && b.init.kind === 'uniform-u32-args') {
      // Pack SolverArgs uniform: { num_rows: u32, vector_width: u32, n: u32, alpha: f32 }.
      const u32 = new Uint32Array(b.size_bytes / 4);
      u32[0] = b.init.num_rows >>> 0;
      u32[1] = (b.init.vector_width ?? 1) >>> 0;
      u32[2] = (b.init.n ?? b.init.num_rows) >>> 0;
      const f32 = new Float32Array(u32.buffer);
      f32[3] = b.init.alpha ?? 1.0;
      device.queue.writeBuffer(buf, 0, u32);
    } else if (b.init && typeof b.init === 'object' && b.init.kind === 'uniform-u32-tuple') {
      // Pack an arbitrary u32 tuple uniform (e.g. cael-trace-fold-v1 Params).
      const arr = new Uint32Array(b.size_bytes / 4);
      const values = b.init.values ?? [];
      for (let j = 0; j < Math.min(arr.length, values.length); j++) {
        arr[j] = values[j] >>> 0;
      }
      device.queue.writeBuffer(buf, 0, arr);
    } else if (b.init && typeof b.init === 'object' && b.init.kind === 'const-f32') {
      // Fill an f32 storage buffer with a constant value (e.g. small synaptic
      // input for the LIF kernel so neurons integrate over time).
      const n = b.size_bytes / 4;
      const value = b.init.value ?? 0;
      const arr = new Float32Array(n);
      for (let j = 0; j < n; j++) arr[j] = value;
      device.queue.writeBuffer(buf, 0, arr);
    } else if (b.init && typeof b.init === 'object' && b.init.kind === 'uniform-encode-params') {
      // Pack EncodeParams from Paper 2's spike-encode.wgsl:
      //   { data_count: u32, time_window: u32, encoding_mode: u32, seed: u32,
      //     min_value: f32, max_value: f32, delta_threshold: f32, _pad0: u32 }
      const view = new ArrayBuffer(32);
      const u32 = new Uint32Array(view);
      const f32 = new Float32Array(view);
      u32[0] = (b.init.data_count ?? 1000) >>> 0;
      u32[1] = (b.init.time_window ?? 10) >>> 0;
      u32[2] = (b.init.encoding_mode ?? 0) >>> 0;
      u32[3] = (b.init.seed ?? 0x1234abcd) >>> 0;
      f32[4] = b.init.min_value ?? 0.0;
      f32[5] = b.init.max_value ?? 1.0;
      f32[6] = b.init.delta_threshold ?? 0.05;
      u32[7] = 0;
      device.queue.writeBuffer(buf, 0, new Uint8Array(view));
    } else if (b.init && typeof b.init === 'object' && b.init.kind === 'uniform-lif-params') {
      // Pack the LIFParams uniform from Paper 2's lif-neuron.wgsl:
      //   { tau: f32, v_threshold: f32, v_reset: f32, v_rest: f32, dt: f32,
      //     neuron_count: u32, _pad0: u32, _pad1: u32 }  // 32 bytes total
      const view = new ArrayBuffer(32);
      const f32 = new Float32Array(view);
      const u32 = new Uint32Array(view);
      f32[0] = b.init.tau ?? 20.0;
      f32[1] = b.init.v_threshold ?? -50.0;
      f32[2] = b.init.v_reset ?? -70.0;
      f32[3] = b.init.v_rest ?? -65.0;
      f32[4] = b.init.dt ?? 0.5;
      u32[5] = (b.init.neuron_count ?? 10000) >>> 0;
      u32[6] = 0;
      u32[7] = 0;
      device.queue.writeBuffer(buf, 0, new Uint8Array(view));
    } else if (b.init && typeof b.init === 'object' && b.init.kind === 'trace-rows-u32x4') {
      // Synthetic CAEL trace rows for cael-trace-fold-v1: TraceRow { a,b,c,d: u32 }.
      // Deterministic content: row i = (i, i*7 + 3, i*13 + 5, i*17 + 11). Tied to the
      // row index so the GPU and CPU substitute produce comparable shapes.
      const arr = new Uint32Array(b.size_bytes / 4);
      const rows = b.size_bytes >> 4; // 16 bytes per row
      for (let r = 0; r < rows; r++) {
        const base = r * 4;
        arr[base + 0] = r >>> 0;
        arr[base + 1] = (r * 7 + 3) >>> 0;
        arr[base + 2] = (r * 13 + 5) >>> 0;
        arr[base + 3] = (r * 17 + 11) >>> 0;
      }
      device.queue.writeBuffer(buf, 0, arr);
    } else if (b.init && typeof b.init === 'object' && b.init.kind === 'uniform-struct') {
      // Native struct packer — supersedes the uniform-u32-tuple +
      // IEEE-754 bit-pattern shim that 3 SNN configs use. Field list:
      //   fields: [{ name?: string, type: 'u32'|'i32'|'f32'|'pad', value: number }, ...]
      // Packed at 4-byte stride per field (matches std140-on-uniform
      // alignment for scalar fields; struct vec/mat fields must still be
      // expanded into scalars by the caller). 'pad' inserts a zero
      // word — explicit so configs document the layout the WGSL expects.
      const view = new ArrayBuffer(b.size_bytes);
      const u32 = new Uint32Array(view);
      const i32 = new Int32Array(view);
      const f32 = new Float32Array(view);
      const fields = b.init.fields ?? [];
      for (let j = 0; j < Math.min(u32.length, fields.length); j++) {
        const f = fields[j];
        if (!f || f.type === 'pad') {
          u32[j] = 0;
          continue;
        }
        if (f.type === 'u32') u32[j] = (f.value ?? 0) >>> 0;
        else if (f.type === 'i32') i32[j] = (f.value ?? 0) | 0;
        else if (f.type === 'f32') f32[j] = f.value ?? 0;
        else throw new Error(`uniform-struct: unknown field type '${f.type}'`);
      }
      device.queue.writeBuffer(buf, 0, new Uint8Array(view));
    }
  }

  const buffers = input.buffers.map((b) => {
    let usage = 0;
    for (const u of b.usage) {
      if (u === 'storage') usage |= GPUBufferUsage.STORAGE;
      else if (u === 'copy_dst') usage |= GPUBufferUsage.COPY_DST;
      else if (u === 'copy_src') usage |= GPUBufferUsage.COPY_SRC;
      else if (u === 'uniform') usage |= GPUBufferUsage.UNIFORM;
    }
    const buf = device.createBuffer({ size: b.size_bytes, usage });
    writeInit(buf, b);
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

  // --- Bind groups (multi-group dispatch — cg_kernels uses 4 groups) ---
  // Buffers can specify `group` field; default 0. Each distinct group becomes
  // its own bind group, derived from pipeline.getBindGroupLayout(g).
  const groupIds = [...new Set(buffers.map((b) => b.group ?? 0))].sort((a, b) => a - b);
  const bindGroups = groupIds.map((g) => {
    const groupBuffers = buffers.filter((b) => (b.group ?? 0) === g);
    return {
      index: g,
      bindGroup: device.createBindGroup({
        layout: pipeline.getBindGroupLayout(g),
        entries: groupBuffers.map((b) => ({ binding: b.binding, resource: { buffer: b.buffer } })),
      }),
    };
  });

  const [dx, dy, dz] = input.kernel.dispatch_size ?? [1, 1, 1];

  const setGroups = (pass) => {
    for (const { index, bindGroup } of bindGroups) pass.setBindGroup(index, bindGroup);
  };

  // --- Warmup ---
  for (let i = 0; i < input.warmup; i++) {
    const enc = device.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.setPipeline(pipeline);
    setGroups(pass);
    pass.dispatchWorkgroups(dx, dy, dz);
    pass.end();
    device.queue.submit([enc.finish()]);
  }
  await device.queue.onSubmittedWorkDone();

  // --- Optional digest readback (Paper 3 §replay-determinism) ---
  // If config sets `digest_buffer: { group, binding }`, after each trial we
  // copy that buffer to a staging buffer, mapAsync-read it, and SHA-256 the
  // bytes. The receipt records the array of hex digests; consumers verify
  // `unique_digest_count === 1` to prove bit-identical replay on this adapter.
  //
  // Optional ε-tolerance mode (W.GOLD.554 follow-up — Route 2b):
  //   digest_buffer: { group, binding, dtype: 'f32', tolerance_epsilon: 1e-6 }
  // When `dtype: 'f32'` and `tolerance_epsilon` are set, the staging bytes
  // are reinterpreted as f32, quantized to int(value/ε), and THEN hashed.
  // Two adapters that produce f32 buffers differing by < ε per element
  // collapse to the same SHA-256. This gives Route 2b papers an
  // ε-identical replay claim without forcing the impossible bit-identical
  // claim that mixed-atomic kernels break (W.GOLD.554).
  const digestBuf = input.digest_buffer
    ? buffers.find(
        (b) =>
          (b.group ?? 0) === input.digest_buffer.group && b.binding === input.digest_buffer.binding
      )
    : null;
  const digestMode =
    input.digest_buffer?.dtype === 'f32' &&
    typeof input.digest_buffer?.tolerance_epsilon === 'number'
      ? 'epsilon-quantized-f32'
      : 'bit-identical';
  const epsilon = input.digest_buffer?.tolerance_epsilon ?? null;
  let staging = null;
  if (digestBuf) {
    staging = device.createBuffer({
      size: digestBuf.size_bytes,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  async function sha256Hex(bytes) {
    const buf = await crypto.subtle.digest('SHA-256', bytes);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function digestBytes(rawBytes) {
    if (digestMode === 'bit-identical') return sha256Hex(rawBytes);
    // ε-quantized: reinterpret bytes as f32, divide by ε, round to int32,
    // re-emit as int32 byte buffer, then SHA-256. We use a single ε for the
    // whole buffer — appropriate when all elements are in the same numeric
    // regime (e.g. a CG residual vector, an SDF distance field).
    const f32 = new Float32Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength / 4);
    // rawU32 shares the same buffer so NaN bit patterns are readable.
    const rawU32 = new Uint32Array(rawBytes.buffer, rawBytes.byteOffset, rawBytes.byteLength / 4);
    const quant = new Int32Array(f32.length);
    for (let j = 0; j < f32.length; j++) {
      // Round to nearest int (not floor) so [-ε/2, +ε/2) → 0 symmetric.
      // NaN: preserve the raw u32 bit pattern rather than a fixed sentinel.
      // A kernel that consistently produces the same NaN bits will hash as
      // ε-identical (deterministic failure); one that produces varying NaN
      // bit patterns will produce distinct digests (non-deterministic failure).
      const v = f32[j];
      quant[j] = Number.isNaN(v) ? rawU32[j] | 0 : Math.round(v / epsilon);
    }
    return sha256Hex(new Uint8Array(quant.buffer));
  }

  async function resetDigestBuffer() {
    // Re-init ALL storage buffers tagged copy_dst from their config init
    // spec. The bit-identical / ε-identical claim requires every trial to
    // begin from the canonical pre-dispatch state, not the post-dispatch
    // state of trial N-1. (Read-only uniforms and copy-only buffers stay
    // untouched.) This generalizes the previous zeros-only reset.
    if (!digestBuf) return;
    for (const b of buffers) {
      if (!b.usage.includes('copy_dst')) continue;
      if (b.usage.includes('uniform')) continue; // uniforms never drift between trials
      writeInit(b.buffer, b);
    }
  }

  // --- Timestamp-query plumbing (Phase 3 — kernel-only GPU timing) ---
  let querySet = null;
  let queryResolve = null;
  let queryReadback = null;
  if (hasTimestamp) {
    querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
    queryResolve = device.createBuffer({
      size: 16, // 2 × u64
      usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
    });
    queryReadback = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });
  }

  // --- Trials ---
  const wallTimes = [];
  const gpuTimes = [];
  const digests = [];
  for (let i = 0; i < input.trials; i++) {
    if (digestBuf) await resetDigestBuffer();
    const t0 = performance.now();
    const enc = device.createCommandEncoder();
    const passDesc = hasTimestamp
      ? { timestampWrites: { querySet, beginningOfPassWriteIndex: 0, endOfPassWriteIndex: 1 } }
      : {};
    const pass = enc.beginComputePass(passDesc);
    pass.setPipeline(pipeline);
    setGroups(pass);
    pass.dispatchWorkgroups(dx, dy, dz);
    pass.end();
    if (hasTimestamp) {
      enc.resolveQuerySet(querySet, 0, 2, queryResolve, 0);
      enc.copyBufferToBuffer(queryResolve, 0, queryReadback, 0, 16);
    }
    if (digestBuf && staging) {
      enc.copyBufferToBuffer(digestBuf.buffer, 0, staging, 0, digestBuf.size_bytes);
    }
    device.queue.submit([enc.finish()]);
    await device.queue.onSubmittedWorkDone();
    wallTimes.push((performance.now() - t0) * 1000); // µs

    if (hasTimestamp) {
      await queryReadback.mapAsync(GPUMapMode.READ);
      const buf = queryReadback.getMappedRange();
      const ts = new BigUint64Array(buf.slice(0));
      queryReadback.unmap();
      const gpuNs = Number(ts[1] - ts[0]); // ns
      gpuTimes.push(gpuNs / 1000); // µs
    }

    if (digestBuf && staging) {
      await staging.mapAsync(GPUMapMode.READ);
      const bytes = new Uint8Array(staging.getMappedRange().slice(0));
      staging.unmap();
      digests.push(await digestBytes(bytes));
    }
  }
  const times = wallTimes; // backwards-compat alias for the wall-clock summary below

  const sorted = [...times].sort((a, b) => a - b);
  const median =
    sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
  const p95Idx = Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1);

  // --- Digest summary (Paper 3 bit-identical OR Route 2b ε-identical) ---
  const uniqueDigests = digests.length > 0 ? [...new Set(digests)] : [];
  const digestSummary = digestBuf
    ? {
        digest_buffer: input.digest_buffer,
        digest_mode: digestMode,
        tolerance_epsilon: epsilon,
        digest_count: digests.length,
        unique_digest_count: uniqueDigests.length,
        // For ε-mode, "epsilon_identical" reads more honestly than "bit_identical".
        digest_bit_identical: digestMode === 'bit-identical' && uniqueDigests.length === 1,
        digest_epsilon_identical:
          digestMode === 'epsilon-quantized-f32' && uniqueDigests.length === 1,
        digest_first: digests[0],
        digest_unique_list:
          uniqueDigests.length <= 8
            ? uniqueDigests
            : [...uniqueDigests.slice(0, 8), `…(${uniqueDigests.length - 8} more)`],
      }
    : null;

  return {
    adapterInfo,
    userAgent: navigator.userAgent,
    notes: [
      hasTimestamp
        ? 'Wall-clock fields (median_us, p95_us, …) include queue submit + onSubmittedWorkDone awaiter; ' +
          'kernel-only GPU fields (gpu_median_us, …) come from the timestamp-query feature ' +
          'and exclude submit/queue overhead.'
        : 'Timings include queue submit + onSubmittedWorkDone awaiter (wall-clock); ' +
          'adapter does not support timestamp-query so kernel-only timing is unavailable.',
      ...(digestBuf
        ? [
            `Digest readback enabled on group(${input.digest_buffer.group}).binding(${input.digest_buffer.binding}); mode=${digestMode}${epsilon != null ? ` (ε=${epsilon})` : ''}; ` +
              `${
                digestMode === 'bit-identical'
                  ? digestSummary.digest_bit_identical
                    ? 'all ' +
                      digestSummary.digest_count +
                      ' trials produced the same SHA-256 (bit-identical replay PASSES at same-adapter scope)'
                    : 'observed ' +
                      digestSummary.unique_digest_count +
                      ' distinct digests across ' +
                      digestSummary.digest_count +
                      ' trials (bit-identical replay FAILS — see digest_unique_list)'
                  : digestSummary.digest_epsilon_identical
                    ? 'all ' +
                      digestSummary.digest_count +
                      ' trials collapsed to the same SHA-256 after ε-quantization (ε-identical replay PASSES at same-adapter scope, ε=' +
                      epsilon +
                      ')'
                    : 'observed ' +
                      digestSummary.unique_digest_count +
                      ' distinct digests after ε-quantization across ' +
                      digestSummary.digest_count +
                      ' trials (ε-identical replay FAILS at ε=' +
                      epsilon +
                      ' — see digest_unique_list)'
              }.`,
          ]
        : []),
      ...notes,
    ],
    results: [
      {
        op: input.kernel.entry_point,
        scale: `dispatch ${dx}x${dy}x${dz} workgroups @ ${(input.kernel.workgroup_size || []).join('x')}`,
        n: input.trials,
        trials: input.trials,
        // wall-clock (includes queue submit + onSubmittedWorkDone awaiter)
        median_us: median,
        p95_us: sorted[p95Idx],
        min_us: sorted[0],
        max_us: sorted[sorted.length - 1],
        // kernel-only GPU timing via timestamp-query, when supported
        ...(gpuTimes.length > 0
          ? (() => {
              const gs = [...gpuTimes].sort((a, b) => a - b);
              const gp95 = Math.min(gs.length - 1, Math.ceil(0.95 * gs.length) - 1);
              return {
                gpu_median_us:
                  gs.length % 2 === 0
                    ? (gs[gs.length / 2 - 1] + gs[gs.length / 2]) / 2
                    : gs[Math.floor(gs.length / 2)],
                gpu_p95_us: gs[gp95],
                gpu_min_us: gs[0],
                gpu_max_us: gs[gs.length - 1],
              };
            })()
          : {}),
        ...(digestSummary ? { digest_summary: digestSummary } : {}),
      },
    ],
  };
}
