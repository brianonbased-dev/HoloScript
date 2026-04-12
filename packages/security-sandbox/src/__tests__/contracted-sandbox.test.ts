import { describe, expect, it } from 'vitest';
import {
  HoloScriptSandbox,
  type ContractedSandboxData,
  type SandboxSimSolver,
} from '../index';

describe('HoloScriptSandbox.executeContractedSimulation', () => {
  const validHolo = `
    cube {
      @color(red)
      @position(0, 0, 0)
    }
  `;

  it('returns vm + contract + cael metadata for valid .holo input', async () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: true });

    const result = await sandbox.executeContractedSimulation(validHolo, {
      source: 'ai-generated',
      steps: 5,
      dt: 0.02,
      vmTicks: 2,
    });

    expect(result.success).toBe(true);
    expect(result.metadata.validated).toBe(true);

    const data = result.data as ContractedSandboxData;
    expect(data.vm.ticksExecuted).toBe(2);
    expect(typeof data.vm.finalStatus).toBe('string');

    expect(data.contract.totalSteps).toBe(5);
    expect(data.contract.totalSimTime).toBeCloseTo(0.1, 9);
    expect(data.contract.interactions).toBeGreaterThanOrEqual(2);

    expect(typeof data.cael.traceId).toBe('string');
    expect(typeof data.cael.traceHash).toBe('string');
    expect(data.cael.traceJSONL.length).toBeGreaterThan(0);
    expect(data.cael.verify.valid).toBe(true);
  });

  it('rejects invalid syntax before vm/contract execution', async () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: true });

    const result = await sandbox.executeContractedSimulation('cube {{{ @bad }', {
      source: 'ai-generated',
    });

    expect(result.success).toBe(false);
    expect(result.error?.type).toBe('validation');
    expect(result.metadata.validated).toBe(false);
  });

  it('uses custom solverFactory when provided', async () => {
    const sandbox = new HoloScriptSandbox({ enableLogging: true });

    let factoryCalled = 0;
    const solverFactory = (_config: Record<string, unknown>): SandboxSimSolver => {
      factoryCalled += 1;
      let simTime = 0;
      return {
        mode: 'transient',
        fieldNames: ['custom_field'],
        step(dt: number) {
          simTime += dt;
        },
        solve() {},
        getField(name: string): Float32Array | Float64Array | null {
          if (name !== 'custom_field') return null;
          return new Float32Array([simTime, simTime * 2]);
        },
        getStats() {
          return { simTime, source: 'custom-solver' };
        },
        dispose() {},
      };
    };

    const result = await sandbox.executeContractedSimulation(validHolo, {
      solverFactory,
      simulationConfig: { custom: true },
      steps: 3,
      dt: 0.01,
    });

    expect(result.success).toBe(true);
    expect(factoryCalled).toBe(1);

    const data = result.data as ContractedSandboxData;
    expect(data.contract.totalSteps).toBe(3);
    expect(data.cael.verify.valid).toBe(true);
  });
});
