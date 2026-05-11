/**
 * snn-webgpu Power Benchmark on Commodity Hardware
 *
 * Measures wall-clock time and GPU power draw for canonical LIF neuron
 * simulation workloads at varying population sizes.  Runs natively under
 * Node.js via Dawn (webgpu npm package) so that the GPU is executing the
 * exact same WGSL compute shaders as the browser benchmark, while a
 * concurrent `nvidia-smi` poller captures power readings.
 *
 * Environment variables
 *   BENCH_POWER_POLL_MS   Power polling interval (default: 500)
 *   BENCH_NEURONS         Comma-separated neuron counts (default: 1024,…,1048576)
 *   BENCH_TIMESTEPS       Timesteps per batch (default: 100)
 *   BENCH_MIN_DURATION_MS Minimum duration per neuron count (default: 2000)
 *   BENCH_WARMUP_MS       Idle-power baseline window before first workload
 *   BENCH_OUTPUT_PATH     JSON artifact path
 *   BENCH_COMMIT          Git commit SHA for artifact metadata
 *   BENCH_DRIVER          GPU driver string (default: auto)
 *   BENCH_TARGET          Hardware label (default: auto)
 *
 * Output schema: snn-webgpu-power-benchmark-v1
 */

import { spawn } from 'child_process';
import { createHash } from 'crypto';
import { writeFile, mkdir } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(pkgRoot, '../..');

// ── Dawn bootstrap (mirrors cross-vendor-determinism-runner.mjs) ────────────
let gpuInstance;
try {
  const { create } = await import('webgpu');
  gpuInstance = create([]);
  if (typeof globalThis.navigator === 'undefined') {
    globalThis.navigator = {};
  }
  globalThis.navigator.gpu = gpuInstance;
} catch (e) {
  console.error('[power-bench] Failed to bootstrap Dawn:', e.message);
  process.exit(1);
}

if (typeof globalThis.GPUBufferUsage === 'undefined') {
  globalThis.GPUBufferUsage = {
    MAP_READ: 0x0001,
    MAP_WRITE: 0x0002,
    COPY_SRC: 0x0004,
    COPY_DST: 0x0008,
    INDEX: 0x0010,
    VERTEX: 0x0020,
    UNIFORM: 0x0040,
    STORAGE: 0x0080,
    INDIRECT: 0x0100,
    QUERY_RESOLVE: 0x0200,
  };
}
if (typeof globalThis.GPUMapMode === 'undefined') {
  globalThis.GPUMapMode = { READ: 0x0001, WRITE: 0x0002 };
}

const { GPUContext, LIFSimulator } = await import('../dist/index.js');

// ── Helpers ────────────────────────────────────────────────────────────────

function boolEnv(name, defaultValue = false) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  return ['1', 'true', 'yes', 'on'].includes(String(raw).toLowerCase());
}

function numEnv(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null) return defaultValue;
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultValue;
}

function strEnv(name, defaultValue) {
  return process.env[name] ?? defaultValue;
}

function parseNeuronCounts(raw) {
  if (!raw) return [1024, 4096, 16384, 65536, 262144, 1048576];
  return raw.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n) && n > 0);
}

async function exec(cmd, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { shell: false });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => { stdout += d; });
    proc.stderr.on('data', (d) => { stderr += d; });
    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`${cmd} exited ${code}: ${stderr.trim() || stdout.trim()}`));
      } else {
        resolve(stdout.trim());
      }
    });
    proc.on('error', reject);
  });
}

async function queryGpuInfo() {
  try {
    const out = await exec('nvidia-smi', [
      '--query-gpu=name,driver_version,timestamp,power.draw,power.limit,temperature.gpu,utilization.gpu',
      '--format=csv,noheader',
    ]);
    const parts = out.split(',').map((s) => s.trim());
    return {
      name: parts[0] ?? 'unknown',
      driverVersion: parts[1] ?? 'unknown',
      timestamp: parts[2] ?? new Date().toISOString(),
      powerDrawW: parsePower(parts[3]),
      powerLimitW: parsePower(parts[4]),
      temperatureC: parseNumber(parts[5]),
      utilizationPct: parseNumber(parts[6]),
    };
  } catch {
    return null;
  }
}

function parsePower(s) {
  if (!s) return null;
  const m = s.match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

function parseNumber(s) {
  if (!s) return null;
  const m = s.match(/([\d.]+)/);
  return m ? Number(m[1]) : null;
}

// ── Power poller ───────────────────────────────────────────────────────────

class PowerPoller {
  intervalMs = 500;
  samples = [];
  timer = null;
  running = false;

  constructor(intervalMs = 500) {
    this.intervalMs = intervalMs;
  }

  start() {
    if (this.running) return;
    this.running = true;
    this.timer = setInterval(async () => {
      try {
        const sample = await queryGpuInfo();
        if (sample) {
          this.samples.push({
            ts: Date.now(),
            powerDrawW: sample.powerDrawW,
            temperatureC: sample.temperatureC,
            utilizationPct: sample.utilizationPct,
          });
        }
      } catch {
        // silently ignore transient nvidia-smi failures
      }
    }, this.intervalMs);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  filter(startMs, endMs) {
    return this.samples.filter((s) => s.ts >= startMs && s.ts <= endMs);
  }

  clear() {
    this.samples = [];
  }
}

// ── Artifact helpers ───────────────────────────────────────────────────────

function computeSha256(obj) {
  return createHash('sha256').update(JSON.stringify(obj)).digest('hex');
}

function avg(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

// ── Main benchmark ─────────────────────────────────────────────────────────

async function main() {
  const neuronCounts = parseNeuronCounts(strEnv('BENCH_NEURONS', ''));
  const timesteps = numEnv('BENCH_TIMESTEPS', 100);
  const minDurationMs = numEnv('BENCH_MIN_DURATION_MS', 2000);
  const warmupMs = numEnv('BENCH_WARMUP_MS', 3000);
  const pollMs = numEnv('BENCH_POWER_POLL_MS', 500);
  const outputPath = strEnv(
    'BENCH_OUTPUT_PATH',
    path.join(repoRoot, '.bench-logs', 'snn-webgpu-power-benchmark.json')
  );
  const commitSha = strEnv('BENCH_COMMIT', process.env.GIT_COMMIT ?? 'auto');
  const target = strEnv('BENCH_TARGET', 'auto');
  const driver = strEnv('BENCH_DRIVER', 'auto');

  console.log('[power-bench] snn-webgpu Power Benchmark');
  console.log(`[power-bench] Neuron counts: ${neuronCounts.join(', ')}`);
  console.log(`[power-bench] Timesteps: ${timesteps}`);
  console.log(`[power-bench] Polling every ${pollMs} ms`);
  console.log(`[power-bench] Min duration per size: ${minDurationMs} ms`);

  // Probe GPU once to check sensor availability
  const gpuInfo = await queryGpuInfo();
  if (!gpuInfo) {
    console.error('[power-bench] nvidia-smi unavailable — cannot measure GPU power.');
    process.exit(1);
  }
  if (gpuInfo.powerDrawW == null) {
    console.error('[power-bench] GPU power sensor not available (power.draw is N/A).');
    process.exit(1);
  }
  console.log(`[power-bench] GPU: ${gpuInfo.name} | Driver: ${gpuInfo.driverVersion}`);
  console.log(`[power-bench] Initial power: ${gpuInfo.powerDrawW} W`);

  const poller = new PowerPoller(pollMs);

  // ── Idle-power baseline ──────────────────────────────────────────────────
  console.log(`[power-bench] Measuring idle power for ${warmupMs} ms…`);
  poller.start();
  await sleep(warmupMs);
  const idleSamples = poller.samples.slice();
  poller.stop();
  const idlePowerW = avg(idleSamples.map((s) => s.powerDrawW).filter((p) => p != null));
  console.log(`[power-bench] Idle power baseline: ${idlePowerW.toFixed(2)} W`);
  poller.clear();

  // ── Initialize Dawn context once ────────────────────────────────────────
  const ctx = new GPUContext();
  await ctx.initialize({ powerPreference: 'high-performance', label: 'power-bench' });

  // ── Run workloads ────────────────────────────────────────────────────────
  const results = [];
  const failures = [];

  for (const neuronCount of neuronCounts) {
    console.log(`\n[power-bench] ===== N=${neuronCount.toLocaleString()} =====`);
    let totalWorkSteps = 0;
    let totalDurationMs = 0;
    let batch = 0;

    // Warm-up: create simulator, run a few steps, then destroy
    const warmupSim = new LIFSimulator(ctx, neuronCount);
    try {
      await warmupSim.initialize();
      const warmupInput = new Float32Array(neuronCount).fill(0);
      for (let i = 0; i < neuronCount; i++) {
        warmupInput[i] = Math.random() * 20;
      }
      warmupSim.setSynapticInput(warmupInput);
      await warmupSim.stepN(10);
      warmupSim.destroy();
    } catch (e) {
      console.error(`[power-bench] Warm-up error for N=${neuronCount}:`, e.message);
      failures.push({ stage: 'warmup', neuronCount, message: e.message });
      continue;
    }

    // Timed measurement with power polling
    poller.start();
    const benchStartMs = Date.now();

    const sim = new LIFSimulator(ctx, neuronCount);
    try {
      await sim.initialize();
      const input = new Float32Array(neuronCount);
      for (let i = 0; i < neuronCount; i++) {
        input[i] = Math.random() * 20;
      }
      sim.setSynapticInput(input);

      // Run batches until we exceed minDurationMs
      do {
        const loopStart = performance.now();
        await sim.stepN(timesteps);
        const loopElapsed = performance.now() - loopStart;
        totalDurationMs += loopElapsed;
        totalWorkSteps += timesteps;
        batch++;
      } while (totalDurationMs < minDurationMs);

      // Force a readback so the GPU work is truly complete (mirrors browser bench)
      await sim.readSpikes();
    } catch (e) {
      poller.stop();
      console.error(`[power-bench] Error for N=${neuronCount}:`, e.message);
      failures.push({ stage: 'timed', neuronCount, message: e.message });
      sim.destroy();
      continue;
    }

    const benchEndMs = Date.now();
    poller.stop();
    const powerSamples = poller.filter(benchStartMs, benchEndMs);
    poller.clear();

    const avgPowerW = avg(powerSamples.map((s) => s.powerDrawW).filter((p) => p != null));
    const deltaPowerW = avgPowerW - idlePowerW;
    const totalEnergyJ = (avgPowerW * totalDurationMs) / 1000;
    const totalNeuronTimesteps = neuronCount * totalWorkSteps;
    const throughputMPerS = totalNeuronTimesteps / (totalDurationMs / 1000) / 1e6;
    const energyPerNeuronTimestepJ = totalEnergyJ / totalNeuronTimesteps;
    const efficiencyMPerJoule = throughputMPerS / avgPowerW;

    console.log(`  Batches: ${batch}`);
    console.log(`  Total steps: ${totalWorkSteps}`);
    console.log(`  Duration: ${totalDurationMs.toFixed(1)} ms`);
    console.log(`  Throughput: ${throughputMPerS.toFixed(1)} M neurons/s`);
    console.log(`  Avg power: ${avgPowerW.toFixed(2)} W`);
    console.log(`  Delta power: ${deltaPowerW.toFixed(2)} W`);
    console.log(`  Total energy: ${totalEnergyJ.toFixed(3)} J`);
    console.log(`  Energy/neuron·timestep: ${energyPerNeuronTimestepJ.toExponential(3)} J`);
    console.log(`  Efficiency: ${efficiencyMPerJoule.toFixed(3)} M neurons/s/W`);

    results.push({
      neuronCount,
      timesteps: totalWorkSteps,
      batchCount: batch,
      durationMs: Number(totalDurationMs.toFixed(3)),
      throughputMPerS: Number(throughputMPerS.toFixed(3)),
      avgPowerW: Number(avgPowerW.toFixed(3)),
      deltaPowerW: Number(deltaPowerW.toFixed(3)),
      idlePowerW: Number(idlePowerW.toFixed(3)),
      totalEnergyJ: Number(totalEnergyJ.toFixed(6)),
      energyPerNeuronTimestepJ: Number(energyPerNeuronTimestepJ.toExponential(3)),
      efficiencyMPerJoule: Number(efficiencyMPerJoule.toFixed(3)),
      powerSamples: powerSamples.length,
    });

    sim.destroy();
  }

  ctx.destroy();

  // ── Build artifact ─────────────────────────────────────────────────────────
  const peak = results.reduce(
    (best, r) => (r.throughputMPerS > best.throughputMPerS ? r : best),
    results[0] ?? null
  );
  const mostEfficient = results.reduce(
    (best, r) => (r.efficiencyMPerJoule > best.efficiencyMPerJoule ? r : best),
    results[0] ?? null
  );

  const artifact = {
    schema_version: 'snn-webgpu-power-benchmark-v1',
    benchmark: 'snn-webgpu-power-commodity',
    generatedAt: new Date().toISOString(),
    status: failures.length > 0 && results.length === 0 ? 'error' : 'completed',
    target,
    commitSha,
    driver: driver === 'auto' ? gpuInfo.driverVersion : driver,
    gpu: {
      name: gpuInfo.name,
      driverVersion: gpuInfo.driverVersion,
    },
    powerSensor: 'nvidia-smi',
    idlePowerW: Number(idlePowerW.toFixed(3)),
    configuration: {
      neuronCounts,
      timestepsPerBatch: timesteps,
      minDurationMs,
      powerPollMs: pollMs,
    },
    results,
    peak: peak
      ? {
          neuronCount: peak.neuronCount,
          throughputMPerS: peak.throughputMPerS,
          energyPerNeuronTimestepJ: peak.energyPerNeuronTimestepJ,
        }
      : null,
    mostEfficient: mostEfficient
      ? {
          neuronCount: mostEfficient.neuronCount,
          efficiencyMPerJoule: mostEfficient.efficiencyMPerJoule,
          energyPerNeuronTimestepJ: mostEfficient.energyPerNeuronTimestepJ,
        }
      : null,
    failures,
    notes: [],
  };

  if (peak) {
    artifact.notes.push(
      `Peak throughput ${peak.throughputMPerS} M neurons/s at N=${peak.neuronCount.toLocaleString()}.`
    );
  }
  if (mostEfficient) {
    artifact.notes.push(
      `Most efficient ${mostEfficient.efficiencyMPerJoule} M neurons/s/W at N=${mostEfficient.neuronCount.toLocaleString()}.`
    );
  }
  if (failures.length > 0) {
    artifact.notes.push(`${failures.length} failure(s) recorded.`);
  }

  const outPath = path.resolve(outputPath);
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(artifact, null, 2), 'utf-8');

  console.log(`\n[power-bench] Artifact saved → ${outPath}`);
  console.log(`[power-bench] Status: ${artifact.status}`);
  if (peak) {
    console.log(`[power-bench] Peak: ${peak.throughputMPerS} M neurons/s @ N=${peak.neuronCount}`);
  }
  if (mostEfficient) {
    console.log(
      `[power-bench] Most efficient: ${mostEfficient.efficiencyMPerJoule} M neurons/s/W @ N=${mostEfficient.neuronCount}`
    );
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error('[power-bench] Fatal error:', err);
  process.exit(1);
});
