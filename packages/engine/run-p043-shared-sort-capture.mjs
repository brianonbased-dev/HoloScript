#!/usr/bin/env node
/**
 * P043 shared-sort capture runner.
 *
 * `scripts/p043-sku-matrix.mjs --run-cell` supplies the P043_* environment
 * contract and delegates here through P043_BENCH_COMMAND. The default path runs
 * the real WGSL shared-sort preprocess kernel in Chromium/WebGPU. `--smoke`
 * uses the same deterministic fixture generator with a CPU twin so CI can prove
 * the artifact contract without claiming a paper-grade GPU measurement.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { platform, release } from 'node:os';
import { performance } from 'node:perf_hooks';
import { execFileSync } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..');
const SHADER_PATH = resolve(__dirname, 'src/gpu/shaders/splat-shared-sort.wgsl');
const DEFAULT_OUT = '.bench-logs/p043-shared-sort-capture.json';
const FRAME_BUDGET_MS = 1000 / 90;
const WORKGROUP_SIZE = 64;
const DEFAULT_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

const SCENE_GAUSSIANS = Object.freeze({
  'indoor-500k': 500_000,
  'outdoor-1m': 1_000_000,
  'dense-2m': 2_000_000,
});

function parseArgs(argv) {
  const args = {
    mode: process.env.P043_CAPTURE_MODE || (process.env.P043_SMOKE === '1' ? 'smoke' : 'browser-webgpu'),
    out: process.env.P043_OUTPUT_PATH || DEFAULT_OUT,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const raw = argv[i];
    if (raw === '--') continue;
    if (raw === '--smoke') {
      args.mode = 'smoke';
      continue;
    }
    if (raw === '--browser-webgpu') {
      args.mode = 'browser-webgpu';
      continue;
    }
    if (raw === '--help' || raw === '-h') {
      args.help = true;
      continue;
    }
    const [flag, inline] = raw.startsWith('--') ? raw.slice(2).split('=', 2) : [raw, undefined];
    const value = inline ?? argv[i + 1];
    if (inline === undefined && value && !value.startsWith('--')) i += 1;
    if (flag === 'mode') args.mode = value || args.mode;
    else if (flag === 'out') args.out = value || args.out;
    else throw new Error(`unknown argument: ${raw}`);
  }
  return args;
}

function usage() {
  return [
    'Usage: node packages/engine/run-p043-shared-sort-capture.mjs [--browser-webgpu|--smoke] [--out PATH]',
    '',
    'Required P043 environment:',
    '  P043_CELL_ID P043_SKU_ID P043_SCENE_ID P043_SCENE_FIXTURE P043_VIEW_COUNT',
    '  P043_SAMPLE_SECONDS P043_WARMUP_SECONDS P043_REQUIRED_RUNS P043_OUTPUT_PATH',
    '',
    'Smoke-only knobs:',
    '  P043_SMOKE_GAUSSIANS=2048',
  ].join('\n');
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`missing required env ${name}`);
  return value;
}

function positiveInt(name, fallback) {
  const raw = process.env[name];
  const value = raw == null ? fallback : Number(raw);
  if (!Number.isInteger(value) || value <= 0) throw new Error(`${name} must be a positive integer`);
  return value;
}

function nonNegativeSeconds(name, fallback) {
  const raw = process.env[name];
  const value = raw == null ? fallback : Number(raw);
  if (!Number.isFinite(value) || value < 0) throw new Error(`${name} must be a non-negative number`);
  return value;
}

function loadConfig(args) {
  const sceneId = requireEnv('P043_SCENE_ID');
  const requestedGaussianCount = positiveInt(
    'P043_GAUSSIAN_COUNT',
    SCENE_GAUSSIANS[sceneId] ?? 100_000
  );
  return {
    cellId: requireEnv('P043_CELL_ID'),
    skuId: requireEnv('P043_SKU_ID'),
    sceneId,
    sceneFixture: requireEnv('P043_SCENE_FIXTURE'),
    viewCount: positiveInt('P043_VIEW_COUNT'),
    sampleSeconds: nonNegativeSeconds('P043_SAMPLE_SECONDS', 60),
    warmupSeconds: nonNegativeSeconds('P043_WARMUP_SECONDS', 5),
    requiredRuns: positiveInt('P043_REQUIRED_RUNS', 3),
    outputPath: args.out,
    mode: args.mode,
    requestedGaussianCount,
    gaussianCount: args.mode === 'smoke'
      ? positiveInt('P043_SMOKE_GAUSSIANS', Math.min(2048, requestedGaussianCount))
      : requestedGaussianCount,
    thermalState: process.env.P043_THERMAL_STATE || 'unknown',
    batteryState: process.env.P043_BATTERY_STATE || 'unknown',
    browserShell: process.env.P043_BROWSER_SHELL || null,
  };
}

function hashString(input) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  return function rand() {
    let t = seed += 0x6d2b79f5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generatePositions(sceneId, count) {
  const rand = mulberry32(hashString(sceneId));
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const a = rand() * Math.PI * 2;
    const r = sceneId === 'dense-2m' ? Math.pow(rand(), 0.35) * 18 : rand() * 42;
    const height = sceneId === 'outdoor-1m' ? (rand() - 0.5) * 18 : (rand() - 0.5) * 5;
    const zScale = sceneId === 'indoor-500k' ? 0.45 : 1.0;
    positions[i * 3] = Math.cos(a) * r;
    positions[i * 3 + 1] = height;
    positions[i * 3 + 2] = Math.sin(a) * r * zScale - 12;
  }
  return positions;
}

function generateViews(viewCount) {
  const views = [];
  for (let i = 0; i < viewCount; i += 1) {
    const a = (i / viewCount) * Math.PI * 2;
    const eyePosition = [Math.cos(a) * 2.5, 1.6, Math.sin(a) * 2.5 + 2.5];
    const eyeDirection = [-eyePosition[0], -0.15, -eyePosition[2] - 10];
    views.push({ eyePosition, eyeDirection });
  }
  return views;
}

function safeNormalize(v) {
  const len2 = v[0] * v[0] + v[1] * v[1] + v[2] * v[2];
  if (len2 < 1e-12) return [0, 0, 0];
  const inv = 1 / Math.sqrt(len2);
  return [v[0] * inv, v[1] * inv, v[2] * inv];
}

function cpuSharedSort(positions, views) {
  const count = Math.floor(positions.length / 3);
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const view of views) {
    cx += view.eyePosition[0];
    cy += view.eyePosition[1];
    cz += view.eyePosition[2];
  }
  cx /= views.length;
  cy /= views.length;
  cz /= views.length;
  const normDirs = views.map((view) => safeNormalize(view.eyeDirection));
  const distances = new Float32Array(count);
  const bitmasks = new Uint32Array(count);
  for (let g = 0; g < count; g += 1) {
    const px = positions[g * 3];
    const py = positions[g * 3 + 1];
    const pz = positions[g * 3 + 2];
    const dx = px - cx;
    const dy = py - cy;
    const dz = pz - cz;
    distances[g] = dx * dx + dy * dy + dz * dz;
    let mask = 0;
    for (let v = 0; v < views.length && v < 32; v += 1) {
      const view = views[v];
      const rx = px - view.eyePosition[0];
      const ry = py - view.eyePosition[1];
      const rz = pz - view.eyePosition[2];
      const len2 = rx * rx + ry * ry + rz * rz;
      if (len2 < 1e-12) {
        mask |= 1 << v;
        continue;
      }
      const inv = 1 / Math.sqrt(len2);
      const dir = normDirs[v];
      if ((rx * inv * dir[0]) + (ry * inv * dir[1]) + (rz * inv * dir[2]) >= 0.5) {
        mask |= 1 << v;
      }
    }
    bitmasks[g] = mask >>> 0;
  }
  return checksum(distances, bitmasks);
}

function checksum(distances, bitmasks) {
  let hash = 2166136261;
  const step = Math.max(1, Math.floor(distances.length / 4096));
  for (let i = 0; i < distances.length; i += step) {
    hash ^= Math.floor(distances[i] * 1000) >>> 0;
    hash = Math.imul(hash, 16777619);
    hash ^= bitmasks[i] >>> 0;
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function metric(samples) {
  const sorted = [...samples].sort((a, b) => a - b);
  const avg = sorted.reduce((sum, value) => sum + value, 0) / Math.max(1, sorted.length);
  return {
    samples: samples.map((value) => Number(value.toFixed(4))),
    avg: Number(avg.toFixed(4)),
    p50: Number(percentile(sorted, 50).toFixed(4)),
    p95: Number(percentile(sorted, 95).toFixed(4)),
    p99: Number(percentile(sorted, 99).toFixed(4)),
  };
}

function buildArtifact(config, result) {
  const adapterInfo = normalizeAdapterInfo(result.adapterInfo, config);
  const frameMetric = metric(result.frameSamples);
  const sharedSortMetric = metric(result.sharedSortSamples);
  const visibilityMetric = metric(result.visibilitySamples);
  return {
    schema_version: 'p043-shared-sort-capture-v1',
    benchmark: 'p043-cross-vendor-shared-sort',
    status: result.status,
    captureMode: result.captureMode,
    runner: 'packages/engine/run-p043-shared-sort-capture.mjs',
    generatedAt: new Date().toISOString(),
    cellId: config.cellId,
    skuId: config.skuId,
    sceneId: config.sceneId,
    sceneFixture: config.sceneFixture,
    fixtureMode: result.fixtureMode,
    requestedGaussianCount: config.requestedGaussianCount,
    gaussianCount: config.gaussianCount,
    views: config.viewCount,
    sampleSeconds: config.sampleSeconds,
    warmupSeconds: config.warmupSeconds,
    requiredRuns: config.requiredRuns,
    adapterInfo,
    browserVersion: result.browserVersion,
    osVersion: result.osVersion,
    browserShell: config.browserShell,
    batteryState: config.batteryState,
    thermalState: config.thermalState,
    frameTimeMs: frameMetric,
    perUserFrameTimeMs: {
      p95: Number((frameMetric.p95 / Math.max(1, config.viewCount)).toFixed(4)),
    },
    sharedSortMs: sharedSortMetric,
    visibilityMaskMs: visibilityMetric,
    droppedFrameCount: result.frameSamples.filter((value) => value > FRAME_BUDGET_MS).length,
    runs: result.runs,
    checksum: result.checksum,
    notes: result.notes,
    failures: result.failures,
  };
}

function hasAdapterIdentity(adapterInfo) {
  if (!adapterInfo || typeof adapterInfo !== 'object') return false;
  return ['vendor', 'device', 'architecture', 'description', 'name'].some(
    (key) => typeof adapterInfo[key] === 'string' && adapterInfo[key].trim()
  );
}

function normalizeAdapterInfo(adapterInfo, config) {
  if (hasAdapterIdentity(adapterInfo)) return adapterInfo;
  const envInfo = {
    vendor: process.env.P043_ADAPTER_VENDOR,
    device: process.env.P043_ADAPTER_DEVICE,
    architecture: process.env.P043_ADAPTER_ARCHITECTURE,
    description: process.env.P043_ADAPTER_DESCRIPTION,
    source: 'P043_ADAPTER_* env',
  };
  if (hasAdapterIdentity(envInfo)) return envInfo;
  const hostInfo = hostAdapterInfo(config.skuId);
  if (hostInfo) return hostInfo;
  return adapterInfo ?? {};
}

function hostAdapterInfo(skuId) {
  if (process.platform !== 'win32') return null;
  try {
    const raw = execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-Command',
        'Get-CimInstance Win32_VideoController | Select-Object Name,AdapterCompatibility,DriverVersion,PNPDeviceID | ConvertTo-Json -Compress',
      ],
      { encoding: 'utf8', windowsHide: true, timeout: 10_000 }
    ).trim();
    const parsed = JSON.parse(raw);
    const rows = Array.isArray(parsed) ? parsed : [parsed];
    const target = String(skuId).toLowerCase().replace(/[^a-z0-9]+/g, '');
    const picked =
      rows.find((row) => String(row.Name ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '').includes(target))
      ?? rows.find((row) => /nvidia/i.test(String(row.AdapterCompatibility ?? row.Name ?? '')))
      ?? rows.find((row) => !/virtual|display/i.test(String(row.Name ?? '')))
      ?? rows[0];
    if (!picked) return null;
    return {
      vendor: picked.AdapterCompatibility ?? 'unknown',
      device: picked.Name ?? 'unknown',
      architecture: null,
      description: [picked.AdapterCompatibility, picked.Name, picked.DriverVersion].filter(Boolean).join(' | '),
      driverVersion: picked.DriverVersion ?? null,
      pnpDeviceId: picked.PNPDeviceID ?? null,
      source: 'Win32_VideoController fallback',
    };
  } catch {
    return null;
  }
}

function writeArtifact(outPath, artifact) {
  const full = resolve(REPO_ROOT, outPath);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');
  return full;
}

async function runSmoke(config) {
  const positions = generatePositions(config.sceneId, config.gaussianCount);
  const views = generateViews(config.viewCount);
  const frameSamples = [];
  const sharedSortSamples = [];
  const visibilitySamples = [];
  const runs = [];
  let lastChecksum = 0;
  const warmups = Math.max(1, Math.ceil(config.warmupSeconds));
  const samplesPerRun = Math.max(5, Math.ceil(config.sampleSeconds * 10));

  for (let run = 1; run <= config.requiredRuns; run += 1) {
    for (let i = 0; i < warmups; i += 1) cpuSharedSort(positions, views);
    const runSamples = [];
    for (let i = 0; i < samplesPerRun; i += 1) {
      const t0 = performance.now();
      lastChecksum = cpuSharedSort(positions, views);
      const elapsed = performance.now() - t0;
      frameSamples.push(elapsed);
      sharedSortSamples.push(elapsed);
      visibilitySamples.push(elapsed);
      runSamples.push(elapsed);
    }
    runs.push({
      run,
      sampleCount: runSamples.length,
      frameTimeMs: metric(runSamples),
    });
  }

  return {
    status: 'smoke_completed',
    captureMode: 'smoke-cpu',
    fixtureMode: 'deterministic-synthetic-smoke',
    adapterInfo: {
      vendor: 'smoke',
      device: 'cpu-twin',
      architecture: process.arch,
      description: 'Deterministic CPU smoke twin; not paper-grade GPU evidence',
    },
    browserVersion: 'node-smoke',
    osVersion: `${platform()} ${release()}`,
    frameSamples,
    sharedSortSamples,
    visibilitySamples,
    runs,
    checksum: lastChecksum,
    notes: [
      'Smoke mode proves the P043 artifact contract without claiming GPU measurement.',
      'scripts/p043-sku-matrix.mjs rejects smoke artifacts during --check-results.',
    ],
    failures: [],
  };
}

async function runBrowserWebGpu(config) {
  const shader = readFileSync(SHADER_PATH, 'utf8');
  let chromium;
  try {
    ({ chromium } = await import('@playwright/test'));
  } catch (error) {
    return failureResult(config, 'playwright_import_failed', error.message);
  }

  const nativeChrome =
    process.env.WEBGPU_CHROME && existsSync(process.env.WEBGPU_CHROME)
      ? process.env.WEBGPU_CHROME
      : existsSync(DEFAULT_CHROME)
        ? DEFAULT_CHROME
        : undefined;
  const useNativeWebGpu =
    process.env.WEBGPU_DETERMINISM_NATIVE === '1'
    || process.env.BENCH_VULKAN_BACKEND === 'native'
    || (process.platform === 'win32' && Boolean(nativeChrome));
  const browser = await chromium.launch({
    headless: process.env.BENCH_HEADLESS !== '0',
    ...(useNativeWebGpu && nativeChrome ? { executablePath: nativeChrome } : {}),
    args: [
      '--enable-unsafe-webgpu',
      '--enable-webgpu-developer-features',
      '--ignore-gpu-blocklist',
      '--force_high_performance_gpu',
      ...(useNativeWebGpu
        ? ['--enable-features=Vulkan,WebGPU']
        : [
            '--use-vulkan=swiftshader',
            '--disable-vulkan-fallback-to-gl-for-testing',
            '--disable-gpu-sandbox',
          ]),
    ],
  });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(resolve(__dirname, 'benchmark-webgpu-physics.html')).href);
    const result = await page.evaluate(async ({ shaderSource, config, workgroupSize, frameBudgetMs }) => {
      const failures = [];
      const notes = [
        'Browser WebGPU runner executes splat-shared-sort.wgsl directly.',
        'sharedSortMs and visibilityMaskMs both report the fused preprocess dispatch because the WGSL computes distance keys and bitmasks in one pass.',
      ];
      const nowIso = () => new Date().toISOString();
      if (!('gpu' in navigator)) {
        return {
          status: 'unsupported',
          failures: [{ stage: 'navigator.gpu', message: 'WebGPU unavailable', timestamp: nowIso() }],
          notes,
        };
      }

      const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' });
      if (!adapter) {
        return {
          status: 'unsupported',
          failures: [{ stage: 'requestAdapter', message: 'No WebGPU adapter returned', timestamp: nowIso() }],
          notes,
        };
      }

      let adapterInfo = adapter.info ?? {};
      if ((!adapterInfo || Object.keys(adapterInfo).length === 0) && adapter.requestAdapterInfo) {
        adapterInfo = await adapter.requestAdapterInfo();
      }
      const device = await adapter.requestDevice();

      const hashString = (input) => {
        let h = 2166136261;
        for (let i = 0; i < input.length; i += 1) {
          h ^= input.charCodeAt(i);
          h = Math.imul(h, 16777619);
        }
        return h >>> 0;
      };
      const mulberry32 = (seed) => () => {
        let t = seed += 0x6d2b79f5;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      const generatePositions = (sceneId, count) => {
        const rand = mulberry32(hashString(sceneId));
        const positions = new Float32Array(count * 3);
        for (let i = 0; i < count; i += 1) {
          const a = rand() * Math.PI * 2;
          const r = sceneId === 'dense-2m' ? Math.pow(rand(), 0.35) * 18 : rand() * 42;
          const height = sceneId === 'outdoor-1m' ? (rand() - 0.5) * 18 : (rand() - 0.5) * 5;
          const zScale = sceneId === 'indoor-500k' ? 0.45 : 1.0;
          positions[i * 3] = Math.cos(a) * r;
          positions[i * 3 + 1] = height;
          positions[i * 3 + 2] = Math.sin(a) * r * zScale - 12;
        }
        return positions;
      };
      const generateViews = (viewCount) => {
        const views = [];
        for (let i = 0; i < viewCount; i += 1) {
          const a = (i / viewCount) * Math.PI * 2;
          const eyePosition = [Math.cos(a) * 2.5, 1.6, Math.sin(a) * 2.5 + 2.5];
          views.push({ eyePosition, eyeDirection: [-eyePosition[0], -0.15, -eyePosition[2] - 10] });
        }
        return views;
      };
      const checksum = (distances, bitmasks) => {
        let hash = 2166136261;
        const step = Math.max(1, Math.floor(distances.length / 4096));
        for (let i = 0; i < distances.length; i += step) {
          hash ^= Math.floor(distances[i] * 1000) >>> 0;
          hash = Math.imul(hash, 16777619);
          hash ^= bitmasks[i] >>> 0;
          hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
      };

      const positions = generatePositions(config.sceneId, config.gaussianCount);
      const views = generateViews(config.viewCount);
      const splats = new ArrayBuffer(config.gaussianCount * 32);
      const splatF32 = new Float32Array(splats);
      for (let g = 0; g < config.gaussianCount; g += 1) {
        const base = g * 8;
        splatF32[base] = positions[g * 3];
        splatF32[base + 1] = positions[g * 3 + 1];
        splatF32[base + 2] = positions[g * 3 + 2];
        splatF32[base + 6] = 1;
      }
      const viewBufferData = new Float32Array(config.viewCount * 8);
      for (let v = 0; v < config.viewCount; v += 1) {
        const base = v * 8;
        viewBufferData.set(views[v].eyePosition, base);
        viewBufferData.set(views[v].eyeDirection, base + 4);
      }
      const uniforms = new ArrayBuffer(32);
      const uniformView = new DataView(uniforms);
      uniformView.setUint32(0, config.gaussianCount, true);
      uniformView.setUint32(4, config.viewCount, true);
      let cx = 0, cy = 0, cz = 0;
      for (const view of views) {
        cx += view.eyePosition[0];
        cy += view.eyePosition[1];
        cz += view.eyePosition[2];
      }
      cx /= views.length;
      cy /= views.length;
      cz /= views.length;
      uniformView.setFloat32(16, cx, true);
      uniformView.setFloat32(20, cy, true);
      uniformView.setFloat32(24, cz, true);

      const module = device.createShaderModule({ code: shaderSource });
      const pipeline = await device.createComputePipelineAsync({
        layout: 'auto',
        compute: { module, entryPoint: 'cs_preprocess' },
      });
      const makeBuffer = (size, usage, data) => {
        const buffer = device.createBuffer({ size, usage });
        if (data) device.queue.writeBuffer(buffer, 0, data);
        return buffer;
      };
      const uniformBuffer = makeBuffer(uniforms.byteLength, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST, uniforms);
      const splatBuffer = makeBuffer(splats.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, splats);
      const viewsBuffer = makeBuffer(viewBufferData.byteLength, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST, viewBufferData);
      const distancesBuffer = makeBuffer(config.gaussianCount * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const bitmasksBuffer = makeBuffer(config.gaussianCount * 4, GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC);
      const readDistances = makeBuffer(config.gaussianCount * 4, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      const readBitmasks = makeBuffer(config.gaussianCount * 4, GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ);
      const bindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformBuffer } },
          { binding: 1, resource: { buffer: splatBuffer } },
          { binding: 2, resource: { buffer: viewsBuffer } },
          { binding: 3, resource: { buffer: distancesBuffer } },
          { binding: 4, resource: { buffer: bitmasksBuffer } },
        ],
      });
      const dispatchOnce = async (copyOut = false) => {
        const encoder = device.createCommandEncoder();
        const pass = encoder.beginComputePass();
        pass.setPipeline(pipeline);
        pass.setBindGroup(0, bindGroup);
        pass.dispatchWorkgroups(Math.ceil(config.gaussianCount / workgroupSize));
        pass.end();
        if (copyOut) {
          encoder.copyBufferToBuffer(distancesBuffer, 0, readDistances, 0, config.gaussianCount * 4);
          encoder.copyBufferToBuffer(bitmasksBuffer, 0, readBitmasks, 0, config.gaussianCount * 4);
        }
        const started = performance.now();
        device.queue.submit([encoder.finish()]);
        await device.queue.onSubmittedWorkDone();
        return performance.now() - started;
      };

      const frameSamples = [];
      const runs = [];
      const warmupEnd = performance.now() + (config.warmupSeconds * 1000);
      while (performance.now() < warmupEnd) await dispatchOnce(false);
      for (let run = 1; run <= config.requiredRuns; run += 1) {
        const runSamples = [];
        const sampleEnd = performance.now() + (config.sampleSeconds * 1000);
        do {
          const elapsed = await dispatchOnce(false);
          frameSamples.push(elapsed);
          runSamples.push(elapsed);
        } while (performance.now() < sampleEnd || runSamples.length === 0);
        runs.push({ run, sampleCount: runSamples.length });
      }
      await dispatchOnce(true);
      await readDistances.mapAsync(GPUMapMode.READ);
      await readBitmasks.mapAsync(GPUMapMode.READ);
      const distanceCopy = new Float32Array(readDistances.getMappedRange().slice(0));
      const bitmaskCopy = new Uint32Array(readBitmasks.getMappedRange().slice(0));
      const resultChecksum = checksum(distanceCopy, bitmaskCopy);
      readDistances.unmap();
      readBitmasks.unmap();
      return {
        status: 'completed',
        adapterInfo,
        browserVersion: navigator.userAgent,
        osVersion: `${navigator.platform}`,
        frameSamples,
        runs,
        checksum: resultChecksum,
        droppedFrameCount: frameSamples.filter((value) => value > frameBudgetMs).length,
        notes,
        failures,
      };
    }, { shaderSource: shader, config, workgroupSize: WORKGROUP_SIZE, frameBudgetMs: FRAME_BUDGET_MS });

    if (result.status !== 'completed') {
      return {
        status: result.status,
        captureMode: 'browser-webgpu',
        fixtureMode: 'deterministic-synthetic-browser',
        adapterInfo: result.adapterInfo ?? null,
        browserVersion: result.browserVersion ?? 'unknown',
        osVersion: result.osVersion ?? `${platform()} ${release()}`,
        frameSamples: [],
        sharedSortSamples: [],
        visibilitySamples: [],
        runs: [],
        checksum: 0,
        notes: result.notes ?? [],
        failures: result.failures ?? [],
      };
    }

    return {
      status: 'completed',
      captureMode: 'browser-webgpu',
      fixtureMode: 'deterministic-synthetic-browser',
      adapterInfo: result.adapterInfo,
      browserVersion: result.browserVersion,
      osVersion: result.osVersion,
      frameSamples: result.frameSamples,
      sharedSortSamples: result.frameSamples,
      visibilitySamples: result.frameSamples,
      runs: result.runs.map((run) => ({ ...run, frameBudgetMs: FRAME_BUDGET_MS })),
      checksum: result.checksum,
      notes: result.notes,
      failures: result.failures,
    };
  } catch (error) {
    return failureResult(config, 'browser_webgpu_capture_failed', error.stack || error.message);
  } finally {
    await browser.close();
  }
}

function failureResult(config, stage, message) {
  return {
    status: 'error',
    captureMode: config.mode,
    fixtureMode: 'none',
    adapterInfo: null,
    browserVersion: 'unknown',
    osVersion: `${platform()} ${release()}`,
    frameSamples: [],
    sharedSortSamples: [],
    visibilitySamples: [],
    runs: [],
    checksum: 0,
    notes: [],
    failures: [{ stage, message, timestamp: new Date().toISOString() }],
  };
}

export async function main(argv = process.argv.slice(2)) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (error) {
    console.error(`[p043-shared-sort-capture] ${error.message}`);
    console.error(usage());
    return 2;
  }
  if (args.help) {
    console.log(usage());
    return 0;
  }

  let config;
  try {
    config = loadConfig(args);
  } catch (error) {
    console.error(`[p043-shared-sort-capture] ${error.message}`);
    return 2;
  }

  const result = config.mode === 'smoke' ? await runSmoke(config) : await runBrowserWebGpu(config);
  const artifact = buildArtifact(config, result);
  const full = writeArtifact(config.outputPath, artifact);
  console.log(`[p043-shared-sort-capture] ${artifact.status} -> ${full}`);
  return artifact.status === 'completed' || artifact.status === 'smoke_completed' ? 0 : 2;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(
    (code) => process.exit(code),
    (error) => {
      console.error('[p043-shared-sort-capture] fatal', error);
      process.exit(2);
    }
  );
}
