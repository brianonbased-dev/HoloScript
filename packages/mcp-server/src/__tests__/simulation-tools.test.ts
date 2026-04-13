import { describe, expect, it } from 'vitest';
import { handleSimulationTool } from '../simulation-tools';
import { simulationTools } from '../simulation-tools';

describe('simulation tools with CAEL metadata', () => {
  it('keeps simulation tool property descriptions free of generic returns pollution', () => {
    const polluted = JSON.stringify(simulationTools).includes(
      'Returns: JSON object containing execution results. Specific schema omitted.'
    );
    expect(polluted).toBe(false);
  });

  it.skip('solve_thermal returns CAEL trace metadata and verify succeeds by traceId', async () => {
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

    const solve = (await handleSimulationTool('solve_thermal', { config })) as Record<string, unknown>;

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

  it.skip('verify_cael_trace detects tampered trace', async () => {
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

    const solve = (await handleSimulationTool('solve_thermal', { config })) as Record<string, unknown>;
    const original = String(solve.traceJSONL);

    const tampered = original.replace('"event":"step"', '"event":"stap"');

    const verify = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL: tampered,
    })) as Record<string, unknown>;

    expect(verify.success).toBe(false);
    expect(verify.hashChainValid).toBe(false);
    expect(verify.replayValid).toBe(false);
  });
});
