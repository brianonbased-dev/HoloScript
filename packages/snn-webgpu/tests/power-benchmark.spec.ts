/**
 * Power benchmark harness test for snn-webgpu.
 *
 * Runs scripts/power-benchmark.mjs (Node.js + Dawn) when nvidia-smi is
 * available, validates the artifact JSON schema, and asserts structural
 * integrity.  Skips gracefully on non-NVIDIA hardware or CI environments.
 */

import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { spawn } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const pkgRoot = path.resolve(__dirname, '..');

async function hasNvidiaSmi(): Promise<boolean> {
  return new Promise((resolve) => {
    const proc = spawn('nvidia-smi', ['--query-gpu=name', '--format=csv,noheader'], {
      shell: false,
    });
    proc.on('error', () => resolve(false));
    proc.on('close', (code) => resolve(code === 0));
  });
}

interface PowerBenchmarkResult {
  neuronCount: number;
  timesteps: number;
  batchCount: number;
  durationMs: number;
  throughputMPerS: number;
  avgPowerW: number;
  deltaPowerW: number;
  idlePowerW: number;
  totalEnergyJ: number;
  energyPerNeuronTimestepJ: number;
  efficiencyMPerJoule: number;
  powerSamples: number;
}

interface PowerBenchmarkArtifact {
  schema_version: string;
  benchmark: string;
  generatedAt: string;
  status: string;
  target: string;
  commitSha: string;
  driver: string;
  gpu: { name: string; driverVersion: string };
  powerSensor: string;
  idlePowerW: number;
  configuration: {
    neuronCounts: number[];
    timestepsPerBatch: number;
    minDurationMs: number;
    powerPollMs: number;
  };
  results: PowerBenchmarkResult[];
  peak: { neuronCount: number; throughputMPerS: number; energyPerNeuronTimestepJ: number } | null;
  mostEfficient: { neuronCount: number; efficiencyMPerJoule: number; energyPerNeuronTimestepJ: number } | null;
  failures: Array<{ stage: string; neuronCount?: number; message: string }>;
  notes: string[];
}

test.describe('snn-webgpu power benchmark', () => {
  test.skip(async () => {
    const ok = await hasNvidiaSmi();
    if (!ok) {
      console.log('[power-bench-test] nvidia-smi unavailable — skipping power benchmark test');
    }
    return !ok;
  }, 'Requires NVIDIA GPU with nvidia-smi');

  test('produces a valid power-benchmark artifact', async () => {
    const scriptPath = path.join(pkgRoot, 'scripts', 'power-benchmark.mjs');
    const outputPath = path.join(pkgRoot, '.bench-logs', 'power-benchmark-test.json');

    const artifact = await runPowerBenchmark(scriptPath, outputPath);

    // Schema assertions
    expect(artifact.schema_version).toBe('snn-webgpu-power-benchmark-v1');
    expect(artifact.benchmark).toBe('snn-webgpu-power-commodity');
    expect(typeof artifact.generatedAt).toBe('string');
    expect(artifact.status).toBe('completed');
    expect(artifact.powerSensor).toBe('nvidia-smi');
    expect(artifact.gpu).toBeDefined();
    expect(typeof artifact.gpu.name).toBe('string');
    expect(typeof artifact.gpu.driverVersion).toBe('string');
    expect(typeof artifact.idlePowerW).toBe('number');
    expect(artifact.idlePowerW).toBeGreaterThan(0);

    // Configuration
    expect(Array.isArray(artifact.configuration.neuronCounts)).toBe(true);
    expect(artifact.configuration.neuronCounts.length).toBeGreaterThan(0);
    expect(typeof artifact.configuration.timestepsPerBatch).toBe('number');
    expect(artifact.configuration.minDurationMs).toBeGreaterThan(0);

    // Results
    expect(artifact.results.length).toBeGreaterThan(0);
    for (const r of artifact.results) {
      expect(r.neuronCount).toBeGreaterThan(0);
      expect(r.timesteps).toBeGreaterThan(0);
      expect(r.durationMs).toBeGreaterThan(0);
      expect(r.throughputMPerS).toBeGreaterThan(0);
      expect(r.avgPowerW).toBeGreaterThan(0);
      expect(r.totalEnergyJ).toBeGreaterThan(0);
      expect(r.energyPerNeuronTimestepJ).toBeGreaterThan(0);
      expect(r.efficiencyMPerJoule).toBeGreaterThan(0);
      expect(r.powerSamples).toBeGreaterThanOrEqual(1);
    }

    // Peak
    expect(artifact.peak).not.toBeNull();
    expect(artifact.peak!.neuronCount).toBeGreaterThan(0);
    expect(artifact.peak!.throughputMPerS).toBeGreaterThan(0);

    // Efficiency
    expect(artifact.mostEfficient).not.toBeNull();
    expect(artifact.mostEfficient!.neuronCount).toBeGreaterThan(0);
    expect(artifact.mostEfficient!.efficiencyMPerJoule).toBeGreaterThan(0);

    // No failures
    expect(artifact.failures).toEqual([]);
  });
});

async function runPowerBenchmark(
  scriptPath: string,
  outputPath: string
): Promise<PowerBenchmarkArtifact> {
  return new Promise((resolve, reject) => {
    const proc = spawn(process.execPath, [scriptPath], {
      cwd: pkgRoot,
      env: {
        ...process.env,
        BENCH_OUTPUT_PATH: outputPath,
        BENCH_NEURONS: '1024,4096',
        BENCH_TIMESTEPS: '50',
        BENCH_MIN_DURATION_MS: '1000',
        BENCH_WARMUP_MS: '1500',
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d;
    });
    proc.stderr.on('data', (d) => {
      stderr += d;
    });

    proc.on('close', async (code) => {
      if (code !== 0) {
        reject(new Error(`Power benchmark exited ${code}.\nstdout:\n${stdout}\nstderr:\n${stderr}`));
        return;
      }
      try {
        const raw = await fs.readFile(outputPath, 'utf-8');
        const artifact = JSON.parse(raw) as PowerBenchmarkArtifact;
        resolve(artifact);
      } catch (e) {
        reject(e);
      }
    });

    proc.on('error', reject);
  });
}
