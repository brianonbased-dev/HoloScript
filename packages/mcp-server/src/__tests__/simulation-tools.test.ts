import { describe, expect, it, vi } from 'vitest';

const mockReplayState = vi.hoisted(() => ({
  thermalReplayOffset: 0,
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
    solve(): void {}
    getDisplacements(): number[] {
      return [];
    }
    getVonMisesStress(): number[] {
      return [];
    }
    getSafetyFactor(): number {
      return 1;
    }
  }

  return {
    Simulation: {
      ThermalSolver,
      StructuralSolverTET10,
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
