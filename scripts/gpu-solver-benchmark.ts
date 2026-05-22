import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';

import { WebGPUContext } from '../packages/engine/src/gpu/WebGPUContext';
import { AcousticSolver } from '../packages/engine/src/simulation/AcousticSolver';
import { StructuralSolver, type StructuralConfig } from '../packages/engine/src/simulation/StructuralSolver';
import { ThermalSolver, type ThermalConfig } from '../packages/engine/src/simulation/ThermalSolver';
import type { Force } from '../packages/engine/src/simulation/units/PhysicalQuantity';

type Args = {
  repeats: number;
  out: string;
};

type StructuralTiming = {
  elapsedMs: number;
  converged: boolean;
  iterations: number;
  residual: number;
  usedGPU: boolean;
};

function parseArgs(argv: string[]): Args {
  const args: Args = {
    repeats: 2,
    out: '.bench-logs/gpu-solver-benchmark.json',
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const readValue = (): string => {
      const eq = arg.indexOf('=');
      if (eq >= 0) return arg.slice(eq + 1);
      i++;
      return argv[i] ?? '';
    };

    if (arg === '--repeats' || arg.startsWith('--repeats=')) args.repeats = Number(readValue());
    else if (arg === '--out' || arg.startsWith('--out=')) args.out = readValue();
  }

  if (!Number.isFinite(args.repeats) || args.repeats <= 0) {
    throw new Error(`Invalid --repeats: ${args.repeats}`);
  }

  return args;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

function maxAbsDiff(a: Float32Array, b: Float32Array): number {
  let diff = 0;
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    diff = Math.max(diff, Math.abs(a[i] - b[i]));
  }
  return diff;
}

function buildTET4CantileverConfig(useGPU: boolean): StructuralConfig {
  const vertices = new Float32Array([
    0, 0, 0,
    1, 0, 0,
    0, 1, 0,
    0, 0, 1,
    1, 1, 1,
  ]);
  const tetrahedra = new Uint32Array([
    0, 1, 2, 3,
    1, 2, 3, 4,
  ]);

  return {
    vertices,
    tetrahedra,
    material: { density: 1000, youngs_modulus: 1e6, poisson_ratio: 0.3, yield_strength: 1e8 },
    constraints: [{ id: 'fixed-root', type: 'fixed', nodes: [0] }],
    loads: [{ id: 'tip-load', type: 'point', nodeIndex: 4, force: [0, 0, 100] as [Force, Force, Force] }],
    maxIterations: 1000,
    tolerance: 1e-8,
    useGPU,
  };
}

async function timeStructural(useGPU: boolean): Promise<{ timing: StructuralTiming; displacements: Float32Array; nnz: number | undefined }> {
  const solver = new StructuralSolver(buildTET4CantileverConfig(useGPU));
  const start = performance.now();
  const result = useGPU ? await solver.solveAsync() : solver.solve();
  const elapsedMs = performance.now() - start;
  const stats = solver.getStats();
  const displacements = new Float32Array(solver.getDisplacements());
  const nnz = stats.nnz as number | undefined;
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
    nnz,
  };
}

function buildThermalConfig(useGPU: boolean): ThermalConfig {
  return {
    gridResolution: [18, 18, 18],
    domainSize: [1, 1, 1],
    timeStep: 0.0005,
    materials: { air: { conductivity: 0.026, density: 1.225, specific_heat: 1005 } },
    defaultMaterial: 'air',
    boundaryConditions: [
      { type: 'dirichlet', faces: ['x-'], value: 100 },
      { type: 'dirichlet', faces: ['x+'], value: 20 },
    ],
    sources: [{ id: 'heater', type: 'point', position: [0.5, 0.5, 0.5], heat_output: 1000 }],
    initialTemperature: 20,
    useGPU,
  };
}

async function timeThermal(useGPU: boolean, steps: number): Promise<{ elapsedMs: number; field: Float32Array; usedGPU: boolean }> {
  const solver = new ThermalSolver(buildThermalConfig(useGPU));
  const start = performance.now();
  for (let i = 0; i < steps; i++) {
    if (useGPU) await solver.stepAsync(0.0005);
    else solver.step(0.0005);
  }
  const elapsedMs = performance.now() - start;
  const field = new Float32Array(solver.getTemperatureField());
  const stats = solver.getStats();
  solver.dispose();
  return { elapsedMs, field, usedGPU: stats.usedGPU };
}

async function timeAcoustic(useGPU: boolean, steps: number): Promise<{ elapsedMs: number; field: Float32Array; usedGPU: boolean }> {
  const solver = new AcousticSolver({
    gridResolution: [18, 18, 18],
    domainSize: [1, 1, 1],
    speedOfSound: 343,
    sources: [{ id: 'pulse', type: 'gaussian_pulse', position: [9, 9, 9], amplitude: 1, pulseWidth: 0.0001 }],
    useGPU,
  });
  const start = performance.now();
  for (let i = 0; i < steps; i++) {
    if (useGPU) await solver.stepAsync();
    else solver.step();
  }
  const elapsedMs = performance.now() - start;
  const field = new Float32Array(solver.getPressureField());
  const stats = solver.getStats();
  solver.dispose();
  return { elapsedMs, field, usedGPU: stats.usedGPU };
}

async function getWebGpuProbe(): Promise<Record<string, unknown>> {
  const context = new WebGPUContext({ fallbackToCPU: true });
  await context.initialize();
  const caps = context.getCapabilities();
  const result = {
    supported: context.isSupported(),
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

  const structuralCpu: StructuralTiming[] = [];
  const structuralGpu: StructuralTiming[] = [];
  const thermalCpu: number[] = [];
  const thermalGpu: number[] = [];
  const acousticCpu: number[] = [];
  const acousticGpu: number[] = [];
  let structuralDiff = 0;
  let thermalDiff = 0;
  let acousticDiff = 0;
  let structuralNnz: number | undefined;

  for (let i = 0; i < args.repeats; i++) {
    const sCpu = await timeStructural(false);
    const sGpu = await timeStructural(true);
    structuralCpu.push(sCpu.timing);
    structuralGpu.push(sGpu.timing);
    structuralDiff = Math.max(structuralDiff, maxAbsDiff(sCpu.displacements, sGpu.displacements));
    structuralNnz = sGpu.nnz ?? sCpu.nnz;

    const tCpu = await timeThermal(false, 4);
    const tGpu = await timeThermal(true, 4);
    thermalCpu.push(tCpu.elapsedMs);
    thermalGpu.push(tGpu.elapsedMs);
    thermalDiff = Math.max(thermalDiff, maxAbsDiff(tCpu.field, tGpu.field));

    const aCpu = await timeAcoustic(false, 4);
    const aGpu = await timeAcoustic(true, 4);
    acousticCpu.push(aCpu.elapsedMs);
    acousticGpu.push(aGpu.elapsedMs);
    acousticDiff = Math.max(acousticDiff, maxAbsDiff(aCpu.field, aGpu.field));
  }

  const artifact = {
    schemaVersion: 'gpu-solver-benchmark/v1',
    generatedAt: new Date().toISOString(),
    harness: 'scripts/gpu-solver-benchmark.ts',
    repeats: args.repeats,
    webgpu,
    structuralTet4: {
      mesh: { nodeCount: 5, elementCount: 2, dofCount: 15, nnz: structuralNnz },
      cpu: { medianMs: median(structuralCpu.map((t) => t.elapsedMs)), timings: structuralCpu },
      gpu: { medianMs: median(structuralGpu.map((t) => t.elapsedMs)), timings: structuralGpu },
      speedup: median(structuralCpu.map((t) => t.elapsedMs)) / median(structuralGpu.map((t) => t.elapsedMs)),
      maxAbsDisplacementDiff: structuralDiff,
    },
    thermalStencil: {
      grid: [18, 18, 18],
      steps: 4,
      cpuMedianMs: median(thermalCpu),
      gpuMedianMs: median(thermalGpu),
      speedup: median(thermalCpu) / median(thermalGpu),
      maxAbsFieldDiff: thermalDiff,
    },
    acousticStencil: {
      grid: [18, 18, 18],
      steps: 4,
      cpuMedianMs: median(acousticCpu),
      gpuMedianMs: median(acousticGpu),
      speedup: median(acousticCpu) / median(acousticGpu),
      maxAbsFieldDiff: acousticDiff,
    },
    note: 'GPU paths include WebGPU dispatch and CPU readback for verification; timings are not steady-state render-loop timings.',
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
