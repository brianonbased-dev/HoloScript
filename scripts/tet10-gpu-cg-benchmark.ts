import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { WebGPUContext } from '../packages/engine/src/gpu/WebGPUContext';
import {
  StructuralSolverTET10,
  tet4ToTet10,
  type TET10Config,
} from '../packages/engine/src/simulation/StructuralSolverTET10';
import type { Force } from '../packages/engine/src/simulation/units/PhysicalQuantity';

type Timing = {
  elapsedMs: number;
  converged: boolean;
  iterations: number;
  residual: number;
  usedGPU: boolean;
};

type Args = {
  nx: number;
  ny: number;
  nz: number;
  repeats: number;
  out: string;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    nx: 2,
    ny: 2,
    nz: 8,
    repeats: 3,
    out: '.bench-logs/tet10-gpu-cg-benchmark.json',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const readValue = (): string => {
      const eq = arg.indexOf('=');
      if (eq >= 0) return arg.slice(eq + 1);
      i++;
      return argv[i] ?? '';
    };

    if (arg === '--nx' || arg.startsWith('--nx=')) args.nx = Number(readValue());
    else if (arg === '--ny' || arg.startsWith('--ny=')) args.ny = Number(readValue());
    else if (arg === '--nz' || arg.startsWith('--nz=')) args.nz = Number(readValue());
    else if (arg === '--repeats' || arg.startsWith('--repeats=')) args.repeats = Number(readValue());
    else if (arg === '--out' || arg.startsWith('--out=')) args.out = readValue();
  }

  for (const [key, value] of Object.entries(args)) {
    if (key === 'out') continue;
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid --${key}: ${String(value)}`);
    }
  }

  return args;
}

function buildConfig(nx: number, ny: number, nz: number, useGPU: boolean): TET10Config {
  const lx = 1;
  const ly = 1;
  const lz = 5;
  const pts: number[] = [];

  for (let k = 0; k <= nz; k++) {
    for (let j = 0; j <= ny; j++) {
      for (let i = 0; i <= nx; i++) {
        pts.push((i * lx) / nx, (j * ly) / ny, (k * lz) / nz);
      }
    }
  }

  const idx = (i: number, j: number, k: number): number =>
    k * (nx + 1) * (ny + 1) + j * (nx + 1) + i;
  const tets: number[] = [];

  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const v0 = idx(i, j, k);
        const v1 = idx(i + 1, j, k);
        const v2 = idx(i + 1, j + 1, k);
        const v3 = idx(i, j + 1, k);
        const v4 = idx(i, j, k + 1);
        const v5 = idx(i + 1, j, k + 1);
        const v6 = idx(i + 1, j + 1, k + 1);
        const v7 = idx(i, j + 1, k + 1);
        tets.push(
          v0, v1, v3, v4,
          v1, v2, v3, v6,
          v4, v5, v6, v1,
          v4, v6, v7, v3,
          v1, v4, v6, v3,
        );
      }
    }
  }

  const tet10 = tet4ToTet10(new Float64Array(pts), new Uint32Array(tets));
  const nodeCount = tet10.vertices.length / 3;
  const fixedNodes: number[] = [];
  const tipNodes: number[] = [];

  for (let n = 0; n < nodeCount; n++) {
    const z = tet10.vertices[n * 3 + 2];
    if (Math.abs(z) < 1e-8) fixedNodes.push(n);
    if (Math.abs(z - lz) < 1e-8) tipNodes.push(n);
  }

  const loadPerTipNode = 100 / Math.max(1, tipNodes.length);

  return {
    vertices: tet10.vertices,
    tetrahedra: tet10.tetrahedra,
    material: 'steel_a36',
    constraints: [{ id: 'fixed-z0', type: 'fixed', nodes: fixedNodes }],
    loads: tipNodes.map((nodeIndex) => ({
      id: `tip-${nodeIndex}`,
      type: 'point' as const,
      nodeIndex,
      force: [0, loadPerTipNode, 0] as [Force, Force, Force],
    })),
    maxIterations: 2000,
    tolerance: 1e-8,
    useGPU,
  };
}

async function timeSolve(config: TET10Config): Promise<{ timing: Timing; displacements: Float64Array }> {
  const solver = new StructuralSolverTET10(config);
  const start = performance.now();
  const result = await solver.solve();
  const elapsedMs = performance.now() - start;
  const stats = solver.getStats();
  const displacements = new Float64Array(solver.getDisplacements());
  solver.dispose();

  return {
    timing: {
      elapsedMs,
      converged: result.converged,
      iterations: result.iterations,
      residual: result.residual,
      usedGPU: Boolean(stats.useGPU),
    },
    displacements,
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    diff = Math.max(diff, Math.abs(a[i] - b[i]));
  }
  return diff;
}

async function getWebGpuProbe(): Promise<Record<string, unknown>> {
  const context = new WebGPUContext({ fallbackToCPU: true });
  await context.initialize();
  const caps = context.getCapabilities();
  let adapterInfo: Record<string, unknown> | null = null;
  if (caps.adapter) {
    adapterInfo = await (caps.adapter as unknown as {
      requestAdapterInfo?: () => Promise<Record<string, unknown>>;
    }).requestAdapterInfo?.() ?? null;
  }
  const result = {
    supported: context.isSupported(),
    adapterInfo,
    limits: caps.limits
      ? {
          maxBufferSize: caps.limits.maxBufferSize,
          maxStorageBufferBindingSize: caps.limits.maxStorageBufferBindingSize,
          maxComputeInvocationsPerWorkgroup: caps.limits.maxComputeInvocationsPerWorkgroup,
        }
      : null,
  };
  context.destroy();
  return result;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const webgpu = await getWebGpuProbe();
  const cpuTimings: Timing[] = [];
  const gpuTimings: Timing[] = [];
  let maxDiff = 0;
  let dofCount = 0;
  let elementCount = 0;

  for (let i = 0; i < args.repeats; i++) {
    const cpuConfig = buildConfig(args.nx, args.ny, args.nz, false);
    dofCount = (cpuConfig.vertices.length / 3) * 3;
    elementCount = cpuConfig.tetrahedra.length / 10;
    const cpu = await timeSolve(cpuConfig);
    const gpu = await timeSolve(buildConfig(args.nx, args.ny, args.nz, true));
    cpuTimings.push(cpu.timing);
    gpuTimings.push(gpu.timing);
    maxDiff = Math.max(maxDiff, maxAbsDiff(cpu.displacements, gpu.displacements));
  }

  const cpuMedianMs = median(cpuTimings.map((t) => t.elapsedMs));
  const gpuMedianMs = median(gpuTimings.map((t) => t.elapsedMs));
  const artifact = {
    schemaVersion: 'tet10-gpu-cg-benchmark/v1',
    generatedAt: new Date().toISOString(),
    harness: 'scripts/tet10-gpu-cg-benchmark.ts',
    mesh: { nx: args.nx, ny: args.ny, nz: args.nz, elementCount, dofCount },
    repeats: args.repeats,
    webgpu,
    cpu: { medianMs: cpuMedianMs, timings: cpuTimings },
    gpu: { medianMs: gpuMedianMs, timings: gpuTimings },
    speedup: cpuMedianMs / gpuMedianMs,
    maxAbsDisplacementDiff: maxDiff,
    note: 'Measures TET10 solve() wall time after constructor-time CSR assembly; GPU path includes WebGPU CG dispatch and readback.',
  };

  const out = resolve(args.out);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`);
  console.log(JSON.stringify(artifact, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.stack ?? error.message : String(error));
    process.exit(1);
  });
