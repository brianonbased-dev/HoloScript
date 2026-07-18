import { describe, expect, it, vi } from 'vitest';

const mockReplayState = vi.hoisted(() => ({
  thermalReplayOffset: 0,
  structuralReplayOffset: 0,
}));

vi.mock('@holoscript/engine', () => {
  class ThermalSolver {
    private steps = 0;

    constructor(private readonly config: Record<string, unknown>) {
      if (!Array.isArray(config.gridResolution)) throw new Error('gridResolution required');
      if (!Array.isArray(config.domainSize)) throw new Error('domainSize required');
      if (!config.materials || typeof config.defaultMaterial !== 'string') {
        throw new Error('material config required');
      }
    }

    step(): void {
      this.steps += 1;
    }

    getTemperatureGrid(): Record<string, unknown> {
      return {
        gridResolution: this.config.gridResolution,
        domainSize: this.config.domainSize,
        steps: this.steps,
      };
    }

    getTemperatureField(): Float32Array {
      return new Float32Array([this.steps + mockReplayState.thermalReplayOffset]);
    }
  }

  class StructuralSolverTET10 {
    private readonly vertices: Float64Array | Float32Array;
    private readonly tetrahedra: Uint32Array;

    constructor(config: { vertices?: unknown; tetrahedra?: unknown }) {
      if (!(config.vertices instanceof Float64Array || config.vertices instanceof Float32Array)) {
        throw new Error('vertices typed array required');
      }
      if (!(config.tetrahedra instanceof Uint32Array)) {
        throw new Error('tetrahedra typed array required');
      }
      this.vertices = config.vertices;
      this.tetrahedra = config.tetrahedra;
    }

    solve(): void {}
    getDisplacements(): number[] {
      return Array.from(
        { length: this.vertices.length },
        (_, index) => index / 10 + mockReplayState.structuralReplayOffset
      );
    }
    getVonMisesStress(): number[] {
      return Array.from(
        { length: this.tetrahedra.length / 10 },
        (_, index) => 1 + index / 100 + mockReplayState.structuralReplayOffset
      );
    }
    getSafetyFactor(): number {
      return 1;
    }
  }

  return {
    Simulation: {
      ThermalSolver,
      StructuralSolverTET10,
      hashGeometry(
        vertices: Float64Array | Float32Array | undefined,
        elements: Uint32Array | undefined,
        _mode?: string
      ): string {
        if (!vertices || !elements) return 'no-geometry';
        return `geo-mock-${vertices.length}v-${elements.length}e`;
      },
      computeStateDigest(
        solver: {
          fieldNames?: Iterable<string>;
          getField(name: string): Float32Array | Float64Array | null;
        },
        hashMode: 'fnv1a' | 'sha256'
      ): string {
        const fields = [...(solver.fieldNames ?? [])].sort();
        const payload = fields
          .map((name) => {
            const field = solver.getField(name);
            const values = field ? Array.from(field).join(',') : '';
            return `${name}:${values}`;
          })
          .join(';');
        return `${hashMode}:${payload}`;
      },
    },
  };
});

import { handleSimulationTool } from '../simulation-tools';
import { simulationTools } from '../simulation-tools';

// Minimal TET10 structural config used by geometry-hash and state-digest tests.
// 4 corner nodes + 6 midpoint nodes = 10 nodes for a single TET10 element.
const minimalStructuralConfig = {
  nodes: [
    [0, 0, 0],
    [1, 0, 0],
    [0, 1, 0],
    [0, 0, 1],
    [0.5, 0, 0],
    [0.5, 0.5, 0],
    [0, 0.5, 0],
    [0, 0, 0.5],
    [0.5, 0, 0.5],
    [0, 0.5, 0.5],
  ],
  elements: [[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]],
  materials: { E: 200e9, nu: 0.3 },
  forces: [{ nodeIndex: 1, fx: 1000, fy: 0, fz: 0 }],
  constraints: [{ nodeIndex: 0 }],
};

type MutableTraceEntry = {
  version: 'cael.v1';
  runId: string;
  index: number;
  event: string;
  timestamp: number;
  simTime: number;
  prevHash: string;
  hash: string;
  payload: Record<string, unknown>;
};

function canonicalTraceValue(value: unknown): unknown {
  if (value === null || value === undefined || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((entry) => canonicalTraceValue(entry));
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value as Record<string, unknown>).sort()) {
    out[key] = canonicalTraceValue((value as Record<string, unknown>)[key]);
  }
  return out;
}

function traceHash(entry: Omit<MutableTraceEntry, 'hash'>): string {
  const input = JSON.stringify(canonicalTraceValue(entry));
  let hash = 2166136261;
  for (let index = 0; index < input.length; index++) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `cael-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function rehashTrace(entries: MutableTraceEntry[]): string {
  let prevHash = 'cael.genesis';
  return entries
    .map((entry, index) => {
      const { hash: _oldHash, ...entryWithoutHash } = entry;
      const base: Omit<MutableTraceEntry, 'hash'> = {
        ...entryWithoutHash,
        index,
        prevHash,
      };
      const hash = traceHash(base);
      prevHash = hash;
      return JSON.stringify({ ...base, hash });
    })
    .join('\n');
}

describe('simulation tools with CAEL metadata', () => {
  it('keeps simulation tool property descriptions free of generic returns pollution', () => {
    const polluted = JSON.stringify(simulationTools).includes(
      'Returns: JSON object containing execution results. Specific schema omitted.'
    );
    expect(polluted).toBe(false);
  });

  it('solve_thermal returns CAEL trace metadata and verify succeeds by traceId', async () => {
    const config = {
      gridResolution: [3, 3, 3],
      domainSize: [1, 1, 1],
      timeStep: 0.01,
      materials: {},
      defaultMaterial: 'water',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 20,
    };

    const solve = (await handleSimulationTool('solve_thermal', { config })) as Record<
      string,
      unknown
    >;

    expect(solve.success).toBe(true);
    expect(typeof solve.caelTraceId).toBe('string');
    expect(typeof solve.traceJSONL).toBe('string');
    expect(typeof solve.traceHash).toBe('string');

    const verify = (await handleSimulationTool('verify_cael_trace', {
      traceId: solve.caelTraceId,
    })) as Record<string, unknown>;

    expect(verify.success).toBe(true);
    expect(verify.hashChainValid).toBe(true);
    expect(verify.replayValid).toBe(true);
  });

  it('solve_thermal accepts the legacy advertised gridSize shape', async () => {
    const config = {
      gridSize: [3, 3, 3],
      spacing: 0.5,
      material: { conductivity: 0.6 },
      sources: [{ position: [0.5, 0.5, 0.5], power: 10 }],
      boundaryConditions: [{ face: 'x0', type: 'dirichlet', value: 20 }],
      initialTemperature: 20,
    };

    const solve = (await handleSimulationTool('solve_thermal', { config, steps: 1 })) as Record<
      string,
      unknown
    >;

    expect(solve.success).toBe(true);
    expect(typeof solve.traceJSONL).toBe('string');
  });

  it('train_rom fits a CAEL-backed surrogate and compile_to_rom_twin emits a step artifact', async () => {
    const config = {
      gridResolution: [3, 3, 3],
      domainSize: [1, 1, 1],
      timeStep: 0.01,
      materials: {},
      defaultMaterial: 'water',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 20,
    };
    const samples = [
      { inputs: { heat: 1, ambient: 10 }, outputs: { maxTemperature: 12 } },
      { inputs: { heat: 2, ambient: 10 }, outputs: { maxTemperature: 14 } },
      { inputs: { heat: 1, ambient: 20 }, outputs: { maxTemperature: 22 } },
      { inputs: { heat: 3, ambient: 20 }, outputs: { maxTemperature: 26 } },
    ];

    const trainingExamples: Array<{
      traceJSONL: string;
      inputs: Record<string, number>;
      outputs: Record<string, number>;
    }> = [];
    for (const sample of samples) {
      const solve = (await handleSimulationTool('solve_thermal', { config, steps: 1 })) as Record<
        string,
        unknown
      >;
      trainingExamples.push({
        traceJSONL: String(solve.traceJSONL),
        inputs: sample.inputs,
        outputs: sample.outputs,
      });
    }

    const trained = (await handleSimulationTool('train_rom', {
      trainingExamples,
      inputNames: ['heat', 'ambient'],
      outputNames: ['maxTemperature'],
      solverType: 'solve_thermal',
      modelId: 'rom-test-thermal',
      maxError: 0.001,
    })) as Record<string, unknown>;

    expect(trained.success).toBe(true);
    const validation = trained.validation as Record<string, unknown>;
    expect(validation.passed).toBe(true);
    const receipt = trained.caelReceipt as Record<string, unknown>;
    expect(receipt.sourceScale).toBe('empirical-surrogate');
    expect(receipt.trainingTraceHashes).toHaveLength(samples.length);

    const compiled = (await handleSimulationTool('compile_to_rom_twin', {
      modelId: 'rom-test-thermal',
      sampleInput: { heat: 4, ambient: 30 },
    })) as Record<string, unknown>;

    expect(compiled.success).toBe(true);
    const artifact = compiled.artifact as Record<string, unknown>;
    expect(artifact.stepInterface).toBe('step(inputs) -> outputs');
    expect(artifact.source).toContain('export function step');
    expect(artifact.wasmReady).toBe(true);
    const preview = compiled.stepPreview as Record<string, number>;
    expect(preview.maxTemperature).toBeCloseTo(38, 3);
  });

  it('verify_cael_trace detects tampered trace', async () => {
    const config = {
      gridResolution: [3, 3, 3],
      domainSize: [1, 1, 1],
      timeStep: 0.01,
      materials: {},
      defaultMaterial: 'water',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 20,
    };

    const solve = (await handleSimulationTool('solve_thermal', { config })) as Record<
      string,
      unknown
    >;
    const original = String(solve.traceJSONL);

    const tampered = original.replace('"event":"step"', '"event":"stap"');

    const verify = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL: tampered,
    })) as Record<string, unknown>;

    expect(verify.success).toBe(false);
    expect(verify.hashChainValid).toBe(false);
    expect(verify.replayValid).toBe(false);
  });

  it('solve_structural geometry hash in init trace entry is not the placeholder geo-unavailable', async () => {
    const solve = (await handleSimulationTool('solve_structural', {
      config: minimalStructuralConfig,
    })) as Record<string, unknown>;

    expect(solve.success).toBe(true);
    const traceJSONL = String(solve.traceJSONL);
    const initLine = traceJSONL.split('\n').find((l) => l.includes('"event":"init"'));
    expect(initLine).toBeTruthy();
    const initEntry = JSON.parse(initLine!);
    const geometryHash = initEntry?.payload?.geometryHash;
    expect(typeof geometryHash).toBe('string');
    expect(geometryHash).not.toBe('geo-unavailable');
    expect(geometryHash).not.toBe('');
  });

  it('solve_structural recorder.solve() carries non-empty stateDigests', async () => {
    const solve = (await handleSimulationTool('solve_structural', {
      config: minimalStructuralConfig,
    })) as Record<string, unknown>;

    expect(solve.success).toBe(true);
    const traceJSONL = String(solve.traceJSONL);
    const solveLine = traceJSONL.split('\n').find((l) => l.includes('"event":"solve"'));
    expect(solveLine).toBeTruthy();
    const solveEntry = JSON.parse(solveLine!);
    const stateDigests = solveEntry?.payload?.stateDigests;
    expect(Array.isArray(stateDigests)).toBe(true);
    expect(stateDigests.length).toBeGreaterThan(0);
    expect(typeof stateDigests[0]).toBe('string');
    expect(stateDigests[0]).not.toBe('');
  });

  it('verify_cael_trace rehydrates canonical structural typed arrays and verifies replay', async () => {
    const solve = (await handleSimulationTool('solve_structural', {
      config: minimalStructuralConfig,
    })) as Record<string, unknown>;

    expect(solve.success).toBe(true);
    const traceJSONL = String(solve.traceJSONL);
    const initLine = traceJSONL.split('\n').find((l) => l.includes('"event":"init"'));
    expect(initLine).toBeTruthy();
    const initEntry = JSON.parse(initLine!);
    expect(initEntry.payload.config.vertices.__cael_typed_array).toBe('Float64Array');
    expect(initEntry.payload.config.tetrahedra.__cael_typed_array).toBe('Uint32Array');

    const verify = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL,
    })) as Record<string, unknown>;

    expect(verify.success).toBe(true);
    expect(verify.hashChainValid).toBe(true);
    expect(verify.replayValid).toBe(true);
    expect(verify.solverType).toBe('solve_structural');
  });

  it('verify_cael_trace rejects a valid structural chain with no solve event', async () => {
    const solve = (await handleSimulationTool('solve_structural', {
      config: minimalStructuralConfig,
    })) as Record<string, unknown>;
    const entries = String(solve.traceJSONL)
      .split('\n')
      .map((line) => JSON.parse(line) as MutableTraceEntry)
      .filter((entry) => entry.event !== 'solve');

    const verify = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL: rehashTrace(entries),
    })) as Record<string, unknown>;

    expect(verify.success).toBe(false);
    expect(verify.hashChainValid).toBe(true);
    expect(verify.replayValid).toBe(false);
    expect(String(verify.error)).toContain('missing the solve event');
  });

  it('verify_cael_trace rejects a valid structural chain with no state digest', async () => {
    const solve = (await handleSimulationTool('solve_structural', {
      config: minimalStructuralConfig,
    })) as Record<string, unknown>;
    const entries = String(solve.traceJSONL)
      .split('\n')
      .map((line) => JSON.parse(line) as MutableTraceEntry);
    const solveEntry = entries.find((entry) => entry.event === 'solve');
    expect(solveEntry).toBeTruthy();
    delete solveEntry!.payload.stateDigests;

    const verify = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL: rehashTrace(entries),
    })) as Record<string, unknown>;

    expect(verify.success).toBe(false);
    expect(verify.hashChainValid).toBe(true);
    expect(verify.replayValid).toBe(false);
    expect(String(verify.error)).toContain('missing state digests');
  });

  it('solve_thermal geometry hash in init trace entry is not the placeholder geo-unavailable', async () => {
    const config = {
      gridResolution: [3, 3, 3],
      domainSize: [1, 1, 1],
      timeStep: 0.01,
      materials: {},
      defaultMaterial: 'water',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 20,
    };

    const solve = (await handleSimulationTool('solve_thermal', { config })) as Record<
      string,
      unknown
    >;

    expect(solve.success).toBe(true);
    const traceJSONL = String(solve.traceJSONL);
    const initLine = traceJSONL.split('\n').find((l) => l.includes('"event":"init"'));
    expect(initLine).toBeTruthy();
    const initEntry = JSON.parse(initLine!);
    const geometryHash = initEntry?.payload?.geometryHash;
    expect(typeof geometryHash).toBe('string');
    expect(geometryHash).not.toBe('geo-unavailable');
    expect(geometryHash).not.toBe('');
  });

  it('verify_cael_trace rejects one flipped replay output value with a valid trace hash chain', async () => {
    const config = {
      gridResolution: [3, 3, 3],
      domainSize: [1, 1, 1],
      timeStep: 0.01,
      materials: {},
      defaultMaterial: 'water',
      boundaryConditions: [],
      sources: [],
      initialTemperature: 20,
    };

    mockReplayState.thermalReplayOffset = 0;
    const solve = (await handleSimulationTool('solve_thermal', { config, steps: 2 })) as Record<
      string,
      unknown
    >;
    const traceJSONL = String(solve.traceJSONL);

    const cleanVerify = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL,
    })) as Record<string, unknown>;

    expect(cleanVerify.success).toBe(true);
    expect(cleanVerify.hashChainValid).toBe(true);
    expect(cleanVerify.replayValid).toBe(true);

    try {
      mockReplayState.thermalReplayOffset = 1;
      const tamperedVerify = (await handleSimulationTool('verify_cael_trace', {
        traceJSONL,
      })) as Record<string, unknown>;

      expect(tamperedVerify.success).toBe(false);
      expect(tamperedVerify.hashChainValid).toBe(true);
      expect(tamperedVerify.replayValid).toBe(false);
      expect(String(tamperedVerify.error)).toContain('state-digest mismatch');
    } finally {
      mockReplayState.thermalReplayOffset = 0;
    }
  });
});
