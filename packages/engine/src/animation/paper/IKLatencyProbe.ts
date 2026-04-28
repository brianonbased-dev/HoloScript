import { type IKBone, type IKChain, type IKSolveMode, IKSolver } from '../IKSolver';

export interface IKLatencyCellSpec {
  mode: IKSolveMode;
  chainLength: 2 | 3 | 5 | 10;
  taskCount: number;
  seed?: number;
}

export interface IKLatencyCellResult extends IKLatencyCellSpec {
  totalMs: number;
  microsecondsPerSolve: number;
  outputBytes: Uint8Array;
}

export interface IKLatencyMatrixOptions {
  taskCount?: number;
  warmupRuns?: number;
  measuredRuns?: number;
  seed?: number;
}

export interface IKLatencyMatrixCell {
  mode: IKSolveMode;
  chainLength: 2 | 3 | 5 | 10;
  medianMicrosecondsPerSolve: number;
  runMicrosecondsPerSolve: number[];
}

export const PAPER_7_IK_CHAIN_LENGTHS = [2, 3, 5, 10] as const;
export const PAPER_7_IK_MODES = ['analytic', 'ccd', 'fabrik'] as const satisfies readonly IKSolveMode[];

function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = Math.imul(t ^ (t >>> 15), 1 | t);
    x ^= x + Math.imul(x ^ (x >>> 7), 61 | x);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1]! + sorted[mid]!) / 2
    : sorted[mid]!;
}

function cloneChain(chain: IKChain): IKChain {
  return {
    ...chain,
    target: [...chain.target],
    poleTarget: chain.poleTarget ? [...chain.poleTarget] : undefined,
    bones: chain.bones.map((b) => ({
      ...b,
      position: [...b.position],
      rotation: { ...b.rotation },
    })),
  };
}

function buildCanonicalChain(chainLength: 2 | 3 | 5 | 10): IKChain {
  const bones: IKBone[] = [];
  for (let i = 0; i < chainLength; i += 1) {
    bones.push({
      id: `b${i + 1}`,
      position: [0, i, 0],
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      length: 1,
      minAngle: -Math.PI,
      maxAngle: Math.PI,
    });
  }

  return {
    id: `chain-${chainLength}`,
    bones,
    target: [0, chainLength - 1, 0],
    weight: 1,
    iterations: 12,
  };
}

function buildTargetSequence(
  chainLength: 2 | 3 | 5 | 10,
  taskCount: number,
  seed: number,
): Array<[number, number, number]> {
  const rand = mulberry32(seed);
  const reach = Math.max(1, chainLength - 0.25);
  const result: Array<[number, number, number]> = [];

  for (let i = 0; i < taskCount; i += 1) {
    const theta = rand() * Math.PI * 2;
    const radius = rand() * reach * 0.85;
    const vertical = (rand() * 2 - 1) * reach * 0.5;
    result.push([
      Math.cos(theta) * radius,
      vertical + reach * 0.4,
      Math.sin(theta) * radius * 0.35,
    ]);
  }

  return result;
}

export function runIKLatencyProbe(spec: IKLatencyCellSpec): Uint8Array {
  const solver = new IKSolver();
  const chain = cloneChain(buildCanonicalChain(spec.chainLength));
  solver.addChain(chain);

  const targets = buildTargetSequence(spec.chainLength, spec.taskCount, spec.seed ?? 42);
  const output = new Float32Array(spec.taskCount * 3);
  let out = 0;

  for (const target of targets) {
    solver.setTarget(chain.id, target[0], target[1], target[2]);
    solver.solveChain(chain.id, spec.mode);
    const solved = solver.getChain(chain.id);
    if (!solved) {
      throw new Error(`IKLatencyProbe: chain ${chain.id} disappeared during solve`);
    }
    const endEffector = solved.bones[solved.bones.length - 1]!.position;
    output[out++] = endEffector[0];
    output[out++] = endEffector[1];
    output[out++] = endEffector[2];
  }

  return new Uint8Array(output.buffer, output.byteOffset, output.byteLength);
}

export function benchmarkIKLatencyCell(spec: IKLatencyCellSpec): IKLatencyCellResult {
  const started = performance.now();
  const outputBytes = runIKLatencyProbe(spec);
  const ended = performance.now();
  const totalMs = Math.max(0, ended - started);
  const microsecondsPerSolve = (totalMs * 1000) / spec.taskCount;

  return {
    ...spec,
    totalMs,
    microsecondsPerSolve,
    outputBytes,
  };
}

export function benchmarkIKLatencyMatrix(
  options: IKLatencyMatrixOptions = {},
): IKLatencyMatrixCell[] {
  const taskCount = options.taskCount ?? 10_000;
  const warmupRuns = options.warmupRuns ?? 1;
  const measuredRuns = options.measuredRuns ?? 5;
  const baseSeed = options.seed ?? 1337;

  const cells: IKLatencyMatrixCell[] = [];

  for (const mode of PAPER_7_IK_MODES) {
    for (const chainLength of PAPER_7_IK_CHAIN_LENGTHS) {
      for (let w = 0; w < warmupRuns; w += 1) {
        benchmarkIKLatencyCell({
          mode,
          chainLength,
          taskCount: Math.min(taskCount, 512),
          seed: baseSeed + w,
        });
      }

      const runMicrosecondsPerSolve: number[] = [];
      for (let r = 0; r < measuredRuns; r += 1) {
        const cell = benchmarkIKLatencyCell({
          mode,
          chainLength,
          taskCount,
          seed: baseSeed + r,
        });
        runMicrosecondsPerSolve.push(cell.microsecondsPerSolve);
      }

      cells.push({
        mode,
        chainLength,
        medianMicrosecondsPerSolve: median(runMicrosecondsPerSolve),
        runMicrosecondsPerSolve,
      });
    }
  }

  return cells;
}

export function formatIKLatencyMarkdown(cells: IKLatencyMatrixCell[]): string {
  const lines: string[] = [];
  lines.push('| Mode | 2 bones | 3 bones | 5 bones | 10 bones |');
  lines.push('|------|---------|---------|---------|----------|');

  for (const mode of PAPER_7_IK_MODES) {
    const row = PAPER_7_IK_CHAIN_LENGTHS.map((chainLength) => {
      const cell = cells.find((c) => c.mode === mode && c.chainLength === chainLength);
      return cell ? cell.medianMicrosecondsPerSolve.toFixed(2) : '—';
    });
    const label = mode === 'analytic' ? 'Analytic' : mode === 'ccd' ? 'CCD' : 'FABRIK';
    lines.push(`| ${label} | ${row[0]} | ${row[1]} | ${row[2]} | ${row[3]} |`);
  }

  return lines.join('\n');
}
