#!/usr/bin/env node
/**
 * HoloScript Desktop Hardware Benchmark Suite
 *
 * Lanes (run in order, each optional/graceful on failure):
 *   1. System probe     — CPU model, cores, RAM, OS, Node.js, pnpm
 *   2. CPU single-thread — SHA-256 hash throughput (ops/sec)
 *   3. CPU multi-thread  — Worker threads across all logical cores
 *   4. WASM SIMD        — WebAssembly.validate + minimal compute bench
 *   5. Memory bandwidth  — Float32Array fill + copy (GB/s)
 *   6. Storage I/O      — 64 MB write + read (MB/s)
 *   7. GPU (nvidia-smi)  — Name, VRAM, driver, compute capability
 *   8. WebGPU (browser) — Playwright probe (skipped if not installed)
 *   9. Webcam           — PnP device enumeration (Windows PowerShell)
 *  10. HoloScript parser — Parse throughput via @holoscript/core dist
 *
 * Outputs:
 *   .bench-logs/hardware-YYYY-MM-DD.json   — PortableHardwareReceiptMetadata
 *   ~/.ai-ecosystem/.tmp/holoshell-hardware-capability.json — HoloShell routing profile
 *   POST /knowledge/sync → HoloMesh knowledge store
 *
 * Usage:
 *   node scripts/hardware-bench.mjs [--no-gpu] [--no-webcam] [--no-parser] [--dry-run]
 *
 * HoloShell context (D.051): This machine = T1-local seat.
 * HoloMesh context: Capability receipt enables task routing by peer agents.
 */

import { createHash, randomBytes } from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { writeFileSync, readFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import os from 'node:os';

// ─── Worker path ─────────────────────────────────────────────────────────────

if (!isMainThread) {
  // CPU multi-thread worker: run SHA-256 for BENCH_DURATION_MS, report count
  const { durationMs } = workerData;
  const input = Buffer.from('holoscript-hw-bench-worker-sha256-payload-v1');
  let count = 0;
  const deadline = performance.now() + durationMs;
  while (performance.now() < deadline) {
    createHash('sha256').update(input).digest();
    count++;
  }
  parentPort.postMessage({ count });
  process.exit(0);
}

// ─── Constants ────────────────────────────────────────────────────────────────

const __filename = fileURLToPath(import.meta.url);
const __dirname  = dirname(__filename);
const REPO_ROOT  = join(__dirname, '..');

const CPU_BENCH_MS    = 3000;  // single-thread bench duration
const MT_BENCH_MS     = 3000;  // multi-thread bench duration per worker
const MEM_SIZE_BYTES  = 256 * 1024 * 1024;   // 256 MB
const STORAGE_BYTES   = 64  * 1024 * 1024;   // 64 MB
const PARSER_ITERS    = 50;

const args = process.argv.slice(2);
const FLAG_NO_GPU     = args.includes('--no-gpu');
const FLAG_NO_WEBCAM  = args.includes('--no-webcam');
const FLAG_NO_PARSER  = args.includes('--no-parser');
const FLAG_DRY_RUN    = args.includes('--dry-run');

// ─── Helpers ──────────────────────────────────────────────────────────────────

function banner(title) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('─'.repeat(60));
}

function ok(label, value) {
  console.log(`  ✓ ${label.padEnd(28)} ${value}`);
}

function warn(label, value) {
  console.log(`  ⚠ ${label.padEnd(28)} ${value}`);
}

function skip(label, reason) {
  console.log(`  ⊘ ${label.padEnd(28)} skipped (${reason})`);
}

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

// ─── Lane 1: System probe ─────────────────────────────────────────────────────

banner('Lane 1 · System Probe');
const cpuInfo   = os.cpus();
const totalRam  = os.totalmem();
const freeRam   = os.freemem();
const platform  = os.platform();
const arch      = os.arch();
const release   = os.release();
const hostname  = os.hostname();
const nodeVer   = process.version;

const pnpmResult = spawnSync('pnpm', ['--version'], { encoding: 'utf8', timeout: 3000 });
const pnpmVer    = pnpmResult.stdout?.trim() ?? 'unknown';

const systemProbe = {
  hostname,
  platform,
  arch,
  osRelease: release,
  cpu: { model: cpuInfo[0]?.model ?? 'unknown', logicalCores: cpuInfo.length },
  memory: { totalBytes: totalRam, freeBytes: freeRam },
  nodeVersion: nodeVer,
  pnpmVersion: pnpmVer,
};

ok('CPU', `${systemProbe.cpu.model}`);
ok('Logical cores', String(systemProbe.cpu.logicalCores));
ok('RAM total', `${(totalRam / 1024 ** 3).toFixed(1)} GB`);
ok('RAM free', `${(freeRam / 1024 ** 3).toFixed(1)} GB`);
ok('OS', `${platform} ${arch} ${release}`);
ok('Node.js', nodeVer);
ok('pnpm', pnpmVer);

// ─── Lane 2: CPU single-thread ───────────────────────────────────────────────

banner('Lane 2 · CPU Single-Thread (SHA-256)');
const stInput   = Buffer.from('holoscript-hw-bench-singlethread-sha256-payload-v1');
let stCount     = 0;
const stStart   = performance.now();
const stDeadline = stStart + CPU_BENCH_MS;
while (performance.now() < stDeadline) {
  createHash('sha256').update(stInput).digest();
  stCount++;
}
const stElapsed = performance.now() - stStart;
const stOpsPerSec = Math.round((stCount / stElapsed) * 1000);

const cpuSingleThread = { opsPerSec: stOpsPerSec, durationMs: Math.round(stElapsed), iterations: stCount };
ok('Ops/sec', stOpsPerSec.toLocaleString());
ok('Total iterations', stCount.toLocaleString());

// ─── Lane 3: CPU multi-thread ─────────────────────────────────────────────────

banner(`Lane 3 · CPU Multi-Thread (${cpuInfo.length} workers)`);

const mtWorkers = cpuInfo.length;
const mtResults = await Promise.all(
  Array.from({ length: mtWorkers }, () =>
    new Promise((resolve, reject) => {
      const w = new Worker(new URL(import.meta.url), {
        workerData: { durationMs: MT_BENCH_MS },
      });
      w.once('message', resolve);
      w.once('error', reject);
    })
  )
);

const mtTotalOps = mtResults.reduce((sum, r) => sum + r.count, 0);
const mtOpsPerSec = Math.round((mtTotalOps / MT_BENCH_MS) * 1000);
const mtEfficiency = ((mtOpsPerSec / (stOpsPerSec * mtWorkers)) * 100).toFixed(1);

const cpuMultiThread = {
  workers: mtWorkers,
  totalOpsPerSec: mtOpsPerSec,
  parallelEfficiencyPct: parseFloat(mtEfficiency),
  durationMs: MT_BENCH_MS,
};

ok('Total ops/sec', mtOpsPerSec.toLocaleString());
ok('Per-core ops/sec', Math.round(mtOpsPerSec / mtWorkers).toLocaleString());
ok('Parallel efficiency', `${mtEfficiency}%`);

// ─── Lane 4: WASM SIMD ───────────────────────────────────────────────────────

banner('Lane 4 · WASM SIMD');

// SIMD availability via WebAssembly.validate
const simdOpcode = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, // magic
  0x01, 0x00, 0x00, 0x00, // version
  0x01, 0x05, 0x01, 0x60, 0x00, 0x01, 0x7b, // type: () -> v128
  0x03, 0x02, 0x01, 0x00, // func
  0x0a, 0x0a, 0x01, 0x08, 0x00, 0xfd, 0x0c, // v128.const
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x0b,
]);
const simdAvailable = WebAssembly.validate(simdOpcode);

// Minimal WASM compile throughput bench (how fast can we compile small modules?)
const minimalWasm = new Uint8Array([
  0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00,
  0x01, 0x04, 0x01, 0x60, 0x00, 0x00,
  0x03, 0x02, 0x01, 0x00,
  0x0a, 0x04, 0x01, 0x02, 0x00, 0x0b,
]);
let wasmCompiles = 0;
const wasmStart = performance.now();
const wasmDeadline = wasmStart + 1000;
while (performance.now() < wasmDeadline) {
  await WebAssembly.compile(minimalWasm);
  wasmCompiles++;
}
const wasmElapsed = performance.now() - wasmStart;
const wasmCompilesPerSec = Math.round((wasmCompiles / wasmElapsed) * 1000);

const wasmBench = {
  simdAvailable,
  moduleCompilesPerSec: wasmCompilesPerSec,
  durationMs: Math.round(wasmElapsed),
};

ok('SIMD available', String(simdAvailable));
ok('Module compiles/sec', wasmCompilesPerSec.toLocaleString());

// ─── Lane 5: Memory bandwidth ─────────────────────────────────────────────────

banner('Lane 5 · Memory Bandwidth');

const src = new Float32Array(MEM_SIZE_BYTES / 4);
const dst = new Float32Array(MEM_SIZE_BYTES / 4);

// Fill
const fillStart = performance.now();
src.fill(1.23456789);
const fillMs = performance.now() - fillStart;
const fillGBps = +((MEM_SIZE_BYTES / 1e9) / (fillMs / 1e3)).toFixed(2);

// Copy
const copyStart = performance.now();
dst.set(src);
const copyMs = performance.now() - copyStart;
const copyGBps = +((MEM_SIZE_BYTES / 1e9) / (copyMs / 1e3)).toFixed(2);

const memBench = {
  sizeBytes: MEM_SIZE_BYTES,
  fillGBps,
  copyGBps,
  fillMs: Math.round(fillMs),
  copyMs: Math.round(copyMs),
};

ok('Fill bandwidth', `${fillGBps} GB/s`);
ok('Copy bandwidth', `${copyGBps} GB/s`);

// ─── Lane 6: Storage I/O ─────────────────────────────────────────────────────

banner('Lane 6 · Storage I/O (64 MB)');

const storageBuf  = Buffer.allocUnsafe(STORAGE_BYTES);
randomBytes(1024).copy(storageBuf); // seed first 1KB with random bytes
const tmpFile     = join(os.tmpdir(), `holoscript-hw-bench-${Date.now()}.bin`);

// Write
const writeStart = performance.now();
writeFileSync(tmpFile, storageBuf);
const writeMs  = performance.now() - writeStart;
const writeMBps = +((STORAGE_BYTES / 1024 / 1024) / (writeMs / 1e3)).toFixed(1);

// Read
const readStart = performance.now();
const readBuf   = readFileSync(tmpFile);
const readMs    = performance.now() - readStart;
const readMBps  = +((readBuf.length / 1024 / 1024) / (readMs / 1e3)).toFixed(1);

try { unlinkSync(tmpFile); } catch { /* ignore */ }

const storageBench = {
  sizeBytes: STORAGE_BYTES,
  writeMBps,
  readMBps,
  writeMs: Math.round(writeMs),
  readMs: Math.round(readMs),
};

ok('Write speed', `${writeMBps} MB/s`);
ok('Read speed',  `${readMBps} MB/s`);

// ─── Lane 7: GPU (nvidia-smi) ────────────────────────────────────────────────

banner('Lane 7 · GPU (nvidia-smi + NVML)');

let gpuBench = { available: false, source: 'nvidia-smi' };

if (!FLAG_NO_GPU) {
  const nvResult = spawnSync(
    'nvidia-smi',
    ['--query-gpu=name,memory.total,memory.free,driver_version,compute_cap,power.limit,clocks.max.sm',
     '--format=csv,noheader,nounits'],
    { timeout: 8000, encoding: 'utf8' },
  );

  if (nvResult.status === 0 && nvResult.stdout?.trim()) {
    const lines = nvResult.stdout.trim().split('\n');
    const gpus = lines.map((line, i) => {
      const [name, memTotal, memFree, driver, computeCap, powerLimit, maxSmClock] =
        line.split(',').map(s => s.trim());
      return { index: i, name, memTotalMiB: parseInt(memTotal), memFreeMiB: parseInt(memFree),
               driver, computeCap, powerLimitW: parseFloat(powerLimit), maxSmClockMHz: parseInt(maxSmClock) };
    });

    gpuBench = { available: true, source: 'nvidia-smi', gpus };
    for (const g of gpus) {
      ok(`GPU ${g.index}`, g.name);
      ok('  VRAM total', `${g.memTotalMiB} MiB`);
      ok('  VRAM free',  `${g.memFreeMiB} MiB`);
      ok('  Driver',     g.driver);
      ok('  Compute cap',g.computeCap ?? 'unknown');
      ok('  Max SM clock',`${g.maxSmClockMHz} MHz`);
    }
  } else {
    warn('nvidia-smi', nvResult.error?.message ?? 'not found or non-zero exit');

    // Fallback: try wmic on Windows
    if (platform === 'win32') {
      const wmicResult = spawnSync(
        'wmic', ['path', 'win32_VideoController', 'get', 'Name,AdapterRAM,DriverVersion', '/format:csv'],
        { timeout: 5000, encoding: 'utf8' },
      );
      if (wmicResult.status === 0) {
        gpuBench = { available: true, source: 'wmic', raw: wmicResult.stdout.trim() };
        ok('GPU (wmic)', wmicResult.stdout.split('\n').find(l => l.includes('NVIDIA') || l.includes('AMD'))?.trim() ?? 'see raw');
      } else {
        warn('GPU', 'unavailable — no nvidia-smi or wmic');
      }
    }
  }
} else {
  skip('GPU', '--no-gpu flag');
}

// ─── Lane 8: WebGPU (optional Playwright) ────────────────────────────────────

banner('Lane 8 · WebGPU Adapter (Playwright)');

let webgpuBench = { available: false };

if (!FLAG_NO_GPU) {
  const probeScript = join(REPO_ROOT, 'scripts', 'probe-webgpu.mjs');
  if (existsSync(probeScript)) {
    const probeResult = spawnSync('node', [probeScript], {
      timeout: 30000,
      encoding: 'utf8',
      env: { ...process.env, WEBGPU_PROBE_HEADLESS: '1' },
    });
    if (probeResult.status === 0 && probeResult.stdout?.trim()) {
      try {
        webgpuBench = { available: true, ...JSON.parse(probeResult.stdout) };
        ok('WebGPU', webgpuBench.ok ? 'adapter acquired' : 'probe ran (check result)');
        if (webgpuBench.adapterInfo) {
          ok('  Adapter', JSON.stringify(webgpuBench.adapterInfo));
        }
      } catch {
        warn('WebGPU', 'probe ran but JSON parse failed');
      }
    } else {
      const errMsg = probeResult.stderr?.slice(0, 200) ?? probeResult.error?.message ?? 'non-zero exit';
      warn('WebGPU', `probe failed: ${errMsg}`);
    }
  } else {
    skip('WebGPU', 'probe-webgpu.mjs not found');
  }
} else {
  skip('WebGPU', '--no-gpu flag');
}

// ─── Lane 9: Webcam / input devices ─────────────────────────────────────────

banner('Lane 9 · Webcam & Input Devices');

let webcamBench = { available: false };

if (!FLAG_NO_WEBCAM && platform === 'win32') {
  const psCmd = [
    '-NoProfile', '-NonInteractive', '-Command',
    'Get-PnpDevice -Class Camera,HIDClass | Where-Object Status -eq OK | Select-Object Class,FriendlyName | ConvertTo-Json -Compress',
  ];
  const psResult = spawnSync('powershell', psCmd, { timeout: 8000, encoding: 'utf8' });

  if (psResult.status === 0 && psResult.stdout?.trim()) {
    try {
      const raw = JSON.parse(psResult.stdout.trim());
      const devices = (Array.isArray(raw) ? raw : [raw]).map(d => ({
        class: d.Class, name: d.FriendlyName,
      }));
      const cameras = devices.filter(d => d.class === 'Camera');
      const hid     = devices.filter(d => d.class === 'HIDClass');

      webcamBench = { available: cameras.length > 0, cameras, hidDevices: hid.length };

      if (cameras.length > 0) {
        const unique = [...new Set(cameras.map(c => c.name))];
        ok('Cameras', unique.join(', '));
        ok('Camera count', `${cameras.length} device(s)`);
      } else {
        warn('Cameras', 'none found');
      }
      ok('HID devices', `${hid.length}`);
    } catch {
      warn('Webcam probe', 'JSON parse failed');
    }
  } else {
    warn('Webcam probe', psResult.error?.message ?? 'PowerShell failed');
  }
} else if (!FLAG_NO_WEBCAM) {
  // Linux/macOS: check /dev/video*
  const lsResult = spawnSync('ls', ['/dev'], { timeout: 2000, encoding: 'utf8' });
  const videoDevs = (lsResult.stdout ?? '').split('\n').filter(l => l.startsWith('video'));
  webcamBench = { available: videoDevs.length > 0, devices: videoDevs };
  ok('Video devices', videoDevs.length > 0 ? videoDevs.join(', ') : 'none');
} else {
  skip('Webcam', '--no-webcam flag');
}

// ─── Lane 10: HoloScript parser throughput ───────────────────────────────────

banner('Lane 10 · HoloScript Parser Throughput');

let parserBench = { available: false };

if (!FLAG_NO_PARSER) {
  const coreDistIndex = join(REPO_ROOT, 'packages', 'core', 'dist', 'index.js');
  const sampleHolo    = join(REPO_ROOT, 'examples', 'hello-world.holo');
  const fallbackHolo  = `
composition "HardwareBench" {
  object "Cube" @mesh @physics @rigid_body {
    position: [0, 0, 0]
    scale: [1, 1, 1]
    mass: 1.0
  }
  object "Light" @point_light {
    intensity: 1.0
    color: #FFFFFF
  }
}`.trim();

  if (existsSync(coreDistIndex)) {
    try {
      const coreModule = await import(pathToFileURL(coreDistIndex).href);
      const parseHoloScript = coreModule.parseHoloScript ?? coreModule.parse ?? coreModule.parseComposition ?? coreModule.parseHolo;
      const source = existsSync(sampleHolo) ? readFileSync(sampleHolo, 'utf8') : fallbackHolo;

      // Warmup
      for (let i = 0; i < 3; i++) parseHoloScript(source);

      // Bench
      const parserStart = performance.now();
      for (let i = 0; i < PARSER_ITERS; i++) parseHoloScript(source);
      const parserMs = performance.now() - parserStart;

      const parsesPerSec  = Math.round((PARSER_ITERS / parserMs) * 1000);
      const avgParseMs    = +(parserMs / PARSER_ITERS).toFixed(2);
      const sourceBytes   = Buffer.byteLength(source, 'utf8');
      const throughputKBps = +((sourceBytes / 1024) * parsesPerSec).toFixed(1);

      parserBench = {
        available: true,
        iterations: PARSER_ITERS,
        parsesPerSec,
        avgParseMs,
        sourceSizeBytes: sourceBytes,
        throughputKBps,
      };

      ok('Parses/sec', parsesPerSec.toLocaleString());
      ok('Avg parse time', `${avgParseMs} ms`);
      ok('Throughput', `${throughputKBps} KB/s`);
      ok('Source size', `${sourceBytes} B`);
    } catch (e) {
      warn('Parser bench', String(e.message).slice(0, 80));
    }
  } else {
    skip('HoloScript parser', 'core not built (run pnpm build first)');
  }
} else {
  skip('HoloScript parser', '--no-parser flag');
}

// ─── Capability scoring ───────────────────────────────────────────────────────

banner('Capability Scoring');

function cpuTier(opsPerSec) {
  if (opsPerSec >= 200_000) return 'high';
  if (opsPerSec >= 80_000)  return 'mid';
  return 'low';
}
function memTier(totalBytes) {
  if (totalBytes >= 32 * 1024 ** 3) return 'high';
  if (totalBytes >= 8  * 1024 ** 3) return 'mid';
  return 'low';
}
function gpuTier(gpus) {
  if (!gpus?.length) return 'none';
  const maxVram = Math.max(...gpus.map(g => g.memTotalMiB ?? 0));
  if (maxVram >= 20_000) return 'discrete-high';
  if (maxVram >= 8_000)  return 'discrete-mid';
  if (maxVram >= 2_000)  return 'discrete-low';
  return 'integrated';
}

const cpuT   = cpuTier(stOpsPerSec);
const memT   = memTier(totalRam);
const gpuT   = gpuBench.available ? gpuTier(gpuBench.gpus) : 'none';
const hasSIMD = wasmBench.simdAvailable;

// HoloShell T-tier (D.051): T1 = local machine with GPU
// T0=uAA2 sovereign, T1=local, T2=cloud, T3=headless
const holoshellTier = gpuT !== 'none' ? 'T1-local-gpu' : 'T1-local';

const routing = {
  canRunGPUSolvers:    gpuT !== 'none',
  canRunWebGPUSolvers: webgpuBench.available === true,
  canRunWASMSolvers:   true,
  canRunWASMSIMD:      hasSIMD,
  canRunWebcamGaze:    webcamBench.available,
  recommendedParallelism: cpuInfo.length,
  preferLocal:         true,
  offloadThreshold: {
    reasonToOffload: gpuT === 'none'
      ? 'No discrete GPU — offload GPU solver workloads'
      : `GPU present (${gpuT}) — offload only if VRAM > ${gpuBench.gpus?.[0]?.memTotalMiB ?? 0} MiB or requires multi-GPU`,
    gpuVRAMLimitMiB: gpuBench.gpus?.[0]?.memTotalMiB ?? 0,
    ramLimitGB: Math.round(totalRam / 1024 ** 3),
  },
};

ok('CPU tier',       cpuT);
ok('Memory tier',    memT);
ok('GPU tier',       gpuT);
ok('WASM SIMD',      String(hasSIMD));
ok('HoloShell seat', holoshellTier);
ok('Can run GPU',    String(routing.canRunGPUSolvers));
ok('Can run WebGPU', String(routing.canRunWebGPUSolvers));
ok('Can run webcam', String(routing.canRunWebcamGaze));
ok('Parallelism',    String(routing.recommendedParallelism));

// ─── Build PortableHardwareReceiptMetadata ────────────────────────────────────

banner('Building Receipt');

const captureTime = new Date().toISOString();
const benchId     = `hw-bench-${Date.now().toString(36)}`;

// Payload hash for provenance
const payloadForHash = JSON.stringify({
  captureTime, hostname, cpuSingleThread, gpuBench: gpuBench.gpus,
});
const sourceCompositionHash = sha256(payloadForHash);

const receipt = {
  schemaVersion: 'holoscript.hardware-receipt-metadata.v1',
  benchId,
  generatedAt: captureTime,

  target: {
    id: `${hostname}-desktop`,
    kind: 'desktop',
    architecture: arch,
    artifactKind: 'hardware-bench',
  },

  device: {
    vendor: systemProbe.cpu.model.includes('Intel') ? 'Intel' : 'AMD',
    model: systemProbe.cpu.model,
    accelerator: gpuBench.gpus?.[0]?.name ?? null,
    acceleratorVRAMMiB: gpuBench.gpus?.[0]?.memTotalMiB ?? null,
    acceleratorDriver: gpuBench.gpus?.[0]?.driver ?? null,
    acceleratorComputeCap: gpuBench.gpus?.[0]?.computeCap ?? null,
    logicalCores: systemProbe.cpu.logicalCores,
    totalRAMBytes: totalRam,
    webcamAvailable: webcamBench.available,
    webcamDevices: webcamBench.cameras?.map(c => c.name) ?? [],
  },

  runtime: {
    name: 'node',
    version: nodeVer,
    hostOS: `${platform} ${arch} ${release}`,
    pnpmVersion: pnpmVer,
    adapterFingerprint: webgpuBench.adapterInfo
      ? sha256(JSON.stringify(webgpuBench.adapterInfo))
      : null,
  },

  compilerVersion: '6.1.0', // @holoscript/core version

  constraints: [
    { type: 'frame_budget', value: 16.67, unit: 'ms', description: '60 fps target' },
    { type: 'memory_limit', value: Math.round(totalRam / 1024 ** 3), unit: 'GB' },
    { type: 'vram_limit',   value: gpuBench.gpus?.[0]?.memTotalMiB ?? 0, unit: 'MiB' },
  ],

  measuredResults: [
    { metric: 'cpu_single_thread_sha256_ops_per_sec', value: cpuSingleThread.opsPerSec, unit: 'ops/s', method: 'SHA-256 hash loop' },
    { metric: 'cpu_multi_thread_sha256_ops_per_sec',  value: cpuMultiThread.totalOpsPerSec, unit: 'ops/s', method: `${mtWorkers} Worker threads` },
    { metric: 'cpu_parallel_efficiency_pct',          value: cpuMultiThread.parallelEfficiencyPct, unit: '%', method: 'multi/single ratio' },
    { metric: 'wasm_module_compiles_per_sec',          value: wasmBench.moduleCompilesPerSec, unit: 'compiles/s', method: 'WebAssembly.compile loop' },
    { metric: 'wasm_simd_available',                   value: hasSIMD ? 1 : 0, unit: 'bool', method: 'WebAssembly.validate v128.const' },
    { metric: 'memory_fill_bandwidth_gbps',            value: memBench.fillGBps, unit: 'GB/s', method: `Float32Array.fill ${MEM_SIZE_BYTES / 1024 ** 2}MB` },
    { metric: 'memory_copy_bandwidth_gbps',            value: memBench.copyGBps, unit: 'GB/s', method: `Float32Array.set ${MEM_SIZE_BYTES / 1024 ** 2}MB` },
    { metric: 'storage_write_mbps',                    value: storageBench.writeMBps, unit: 'MB/s', method: `writeFileSync ${STORAGE_BYTES / 1024 ** 2}MB` },
    { metric: 'storage_read_mbps',                     value: storageBench.readMBps, unit: 'MB/s', method: `readFileSync ${STORAGE_BYTES / 1024 ** 2}MB` },
    ...(parserBench.available ? [
      { metric: 'holoscript_parses_per_sec', value: parserBench.parsesPerSec, unit: 'parses/s', method: `parseHoloScript × ${PARSER_ITERS}` },
      { metric: 'holoscript_parser_throughput_kbps', value: parserBench.throughputKBps, unit: 'KB/s', method: 'parse throughput' },
    ] : []),
  ],

  replayInputs: [
    { uri: `file://${__filename}`, sha256: sha256(readFileSync(__filename)) },
  ],

  provenance: {
    captureTime,
    sourceCompositionHash,
    command: `node scripts/hardware-bench.mjs ${args.join(' ')}`.trim(),
  },

  owner: {
    agent: 'claude1',
    team: 'team_1777834718247_unr35n',
    seat: holoshellTier,
  },

  // Extended sections for HoloShell and HoloMesh
  holoshell: {
    tier: holoshellTier,
    cpuTier: cpuT,
    memoryTier: memT,
    gpuTier: gpuT,
    routing,
  },

  holomesh: {
    capabilityClaims: [
      gpuT !== 'none'    && `gpu:${gpuT}`,
      hasSIMD            && 'wasm:simd',
      webcamBench.available && 'sensor:webcam',
      parserBench.available && 'holoscript:parser',
      routing.canRunGPUSolvers && 'solver:gpu',
      true               && 'solver:cpu',
      true               && 'solver:wasm',
    ].filter(Boolean),
    preferredWorkloads: [
      routing.canRunGPUSolvers ? 'gpu-solver' : null,
      'cpu-solver',
      'wasm-solver',
      routing.canRunWebcamGaze ? 'webcam-gaze' : null,
      parserBench.available ? 'holoscript-parse' : null,
    ].filter(Boolean),
  },

  // Raw lane data
  lanes: {
    system: systemProbe,
    cpuSingleThread,
    cpuMultiThread,
    wasm: wasmBench,
    memory: memBench,
    storage: storageBench,
    gpu: gpuBench,
    webgpu: webgpuBench,
    webcam: webcamBench,
    parser: parserBench,
  },
};

ok('Bench ID',             benchId);
ok('Source hash',          sourceCompositionHash.slice(0, 16) + '…');
ok('Capability claims',    receipt.holomesh.capabilityClaims.join(', '));
ok('Preferred workloads',  receipt.holomesh.preferredWorkloads.join(', '));

// ─── Write outputs ────────────────────────────────────────────────────────────

banner('Writing Outputs');

const today = captureTime.slice(0, 10);
const benchLogsDir = join(REPO_ROOT, '.bench-logs');
mkdirSync(benchLogsDir, { recursive: true });

const receiptPath = join(benchLogsDir, `hardware-${today}.json`);
const receiptJson = JSON.stringify(receipt, null, 2);

if (!FLAG_DRY_RUN) {
  writeFileSync(receiptPath, receiptJson);
  ok('Receipt written', receiptPath.replace(REPO_ROOT, '.'));
} else {
  ok('Receipt (dry-run)', receiptPath.replace(REPO_ROOT, '.') + ' [NOT WRITTEN]');
}

// HoloShell capability profile
const holoshellCapDir = join(os.homedir(), '.ai-ecosystem', '.tmp');
mkdirSync(holoshellCapDir, { recursive: true });
const holoshellCapPath = join(holoshellCapDir, 'holoshell-hardware-capability.json');
const holoshellCap = {
  schemaVersion: 'holoshell.hardware-capability.v1',
  benchId,
  generatedAt: captureTime,
  seat: holoshellTier,
  cpu:  { model: systemProbe.cpu.model, cores: systemProbe.cpu.logicalCores, tier: cpuT, singleThreadOpsPerSec: stOpsPerSec },
  memory: { totalGB: +(totalRam / 1024 ** 3).toFixed(1), tier: memT },
  gpu:  gpuBench.available ? {
    name: gpuBench.gpus?.[0]?.name,
    vramMiB: gpuBench.gpus?.[0]?.memTotalMiB,
    driver: gpuBench.gpus?.[0]?.driver,
    tier: gpuT,
    webgpuAvailable: webgpuBench.available === true,
  } : { tier: 'none', webgpuAvailable: false },
  wasm: { simd: hasSIMD, compilesPerSec: wasmBench.moduleCompilesPerSec },
  webcam: { available: webcamBench.available, devices: webcamBench.cameras?.map(c => c.name) ?? [] },
  routing,
  receiptPath,
};

if (!FLAG_DRY_RUN) {
  writeFileSync(holoshellCapPath, JSON.stringify(holoshellCap, null, 2));
  ok('HoloShell profile', holoshellCapPath.replace(os.homedir(), '~'));
} else {
  ok('HoloShell (dry-run)', holoshellCapPath.replace(os.homedir(), '~') + ' [NOT WRITTEN]');
}

// ─── HoloMesh knowledge sync ──────────────────────────────────────────────────

banner('HoloMesh Knowledge Sync');

if (!FLAG_DRY_RUN) {
  // Load API key
  let apiKey = process.env.HOLOSCRIPT_API_KEY;
  if (!apiKey) {
    const envPaths = [
      join(REPO_ROOT, '.env'),
      join(os.homedir(), '.ai-ecosystem', '.env'),
    ];
    for (const p of envPaths) {
      if (existsSync(p)) {
        const line = readFileSync(p, 'utf8').split('\n')
          .find(l => l.startsWith('HOLOSCRIPT_API_KEY'));
        if (line) { apiKey = line.split('=')[1]?.trim(); break; }
      }
    }
  }

  if (apiKey) {
    const knowledgeEntry = {
      id: `W.HW.${hostname}-${today}`,
      workspace_id: 'ai-ecosystem',
      type: 'wisdom',
      domain: 'hardware',
      content: [
        `HoloShell T1-local seat: ${systemProbe.cpu.model} (${cpuInfo.length} cores), `,
        `${(totalRam / 1024 ** 3).toFixed(0)}GB RAM, `,
        gpuBench.gpus?.[0] ? `${gpuBench.gpus[0].name} ${gpuBench.gpus[0].memTotalMiB}MiB, ` : 'no discrete GPU, ',
        `WASM SIMD:${hasSIMD}. `,
        `CPU ${stOpsPerSec.toLocaleString()} ops/s single. `,
        `Mem fill ${memBench.fillGBps}GB/s. `,
        `Capabilities: ${receipt.holomesh.capabilityClaims.join(' ')}. `,
        `BenchId: ${benchId}. Date: ${today}.`,
      ].join(''),
      access: 'shared',
      metadata: {
        benchId,
        seat: holoshellTier,
        gpuTier,
        cpuTier: cpuT,
        capabilityClaims: receipt.holomesh.capabilityClaims,
        captureTime,
      },
    };

    try {
      const { default: https } = await import('node:https');
      // Top-level workspace_id; entries array per codebase-tools.ts contract
      const body = JSON.stringify({ workspace_id: 'ai-ecosystem', entries: [knowledgeEntry] });
      const syncResult = await new Promise((resolve, reject) => {
        const req = https.request(
          'https://mcp-orchestrator-production-45f9.up.railway.app/knowledge/sync',
          { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-mcp-api-key': apiKey, 'Content-Length': Buffer.byteLength(body) } },
          (res) => {
            let data = '';
            res.on('data', c => data += c);
            res.on('end', () => resolve({ status: res.statusCode, body: data }));
          },
        );
        req.on('error', reject);
        req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
        req.write(body);
        req.end();
      });

      if (syncResult.status < 300) {
        ok('Knowledge sync', `HTTP ${syncResult.status} — ${knowledgeEntry.id}`);
      } else {
        warn('Knowledge sync', `HTTP ${syncResult.status}: ${syncResult.body.slice(0, 100)}`);
      }
    } catch (e) {
      warn('Knowledge sync', e.message);
    }
  } else {
    warn('Knowledge sync', 'HOLOSCRIPT_API_KEY not found — skipping');
  }
} else {
  skip('HoloMesh sync', '--dry-run flag');
}

// ─── Summary ──────────────────────────────────────────────────────────────────

banner('Summary');

const summary = {
  benchId,
  seat: holoshellTier,
  cpu: `${cpuT} (${stOpsPerSec.toLocaleString()} ops/s ST, ${mtOpsPerSec.toLocaleString()} ops/s MT/${mtWorkers}c)`,
  memory: `${memT} (fill ${memBench.fillGBps}GB/s, copy ${memBench.copyGBps}GB/s)`,
  storage: `write ${storageBench.writeMBps}MB/s, read ${storageBench.readMBps}MB/s`,
  wasm: `SIMD:${hasSIMD}, ${wasmBench.moduleCompilesPerSec.toLocaleString()} compiles/s`,
  gpu: gpuBench.available ? `${gpuT} — ${gpuBench.gpus?.[0]?.name} ${gpuBench.gpus?.[0]?.memTotalMiB}MiB` : 'none',
  webgpu: webgpuBench.available ? 'available' : 'unavailable/skipped',
  webcam: webcamBench.available ? `${[...new Set(webcamBench.cameras?.map(c => c.name))].join(', ')}` : 'none',
  parser: parserBench.available ? `${parserBench.parsesPerSec.toLocaleString()} parses/s` : 'skipped',
  capabilityClaims: receipt.holomesh.capabilityClaims,
};

for (const [k, v] of Object.entries(summary)) {
  if (k === 'capabilityClaims') {
    ok('Capability claims', Array.isArray(v) ? v.join(', ') : String(v));
  } else {
    ok(k, String(v));
  }
}

console.log('\n');
console.log(`  Receipt: .bench-logs/hardware-${today}.json`);
console.log(`  Profile: ~/.ai-ecosystem/.tmp/holoshell-hardware-capability.json`);
console.log(`  Done in ${((performance.now()) / 1000).toFixed(1)}s\n`);
