import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { handleSimulationTool } from '../simulation-tools';

const ledgerPath = fileURLToPath(
  new URL('../../../../examples/scientific/energy-discovery-lab/energy-ledger.hs', import.meta.url)
);

let ledgerSource = '';

beforeAll(async () => {
  ledgerSource = await readFile(ledgerPath, 'utf8');
});

async function classify(args: number[]): Promise<Record<string, unknown>> {
  return (await handleSimulationTool('solve_logic', {
    code: ledgerSource,
    functionName: 'classify_energy_claim',
    args,
  })) as Record<string, unknown>;
}

describe('energy discovery HoloScript ledger', () => {
  it('rejects malformed measurements before evaluating an energy claim', async () => {
    const result = await classify([-1, 0, 0, 0, 0, 0, 0, 3, 2, 1]);

    expect(result.success).toBe(true);
    expect(result.result).toBe(0);
  });

  it('classifies output explained by measured inputs as accounted energy', async () => {
    const result = await classify([100, 80, 20, 20, 10, 10, 1, 3, 2, 1]);

    expect(result.success).toBe(true);
    expect(result.result).toBe(1);
  });

  it('counts battery discharge as an input instead of apparent free energy', async () => {
    const result = await classify([100, 10, 100, 20, 5, 5, 1, 3, 2, 1]);

    expect(result.success).toBe(true);
    expect(result.result).toBe(1);
  });

  it('counts consumed electrode chemistry as an input', async () => {
    const result = await classify([100, 10, 20, 20, 5, 85, 1, 3, 2, 1]);

    expect(result.success).toBe(true);
    expect(result.result).toBe(1);
  });

  it('keeps a positive one-run residual as an anomaly, not a discovery', async () => {
    const result = await classify([100, 10, 20, 20, 5, 5, 1, 1, 1, 0]);

    expect(result.success).toBe(true);
    expect(result.result).toBe(2);
  });

  it('advances only a replicated, independently metered, closed-boundary residual', async () => {
    const result = await classify([100, 10, 20, 20, 5, 5, 1, 3, 2, 1]);

    expect(result.success).toBe(true);
    expect(result.result).toBe(3);
    expect(result.verified).toBe(true);

    const replay = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL: result.traceJSONL,
    })) as Record<string, unknown>;

    expect(replay.error).toBeUndefined();
    expect(replay).toMatchObject({
      success: true,
      hashChainValid: true,
      replayValid: true,
      solverType: 'hs-logic',
      replayResult: 3,
    });
  });
});
