import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseHoloStrict } from '../../../core/src/parser/HoloCompositionParser';
import { handleSimulationTool } from '../simulation-tools';

const questLogicPath = fileURLToPath(
  new URL('../../../../examples/scientific/experiment-quest/experiment-quest.hs', import.meta.url)
);
const augmentedLabPath = fileURLToPath(
  new URL('../../../../examples/scientific/experiment-quest/augmented-lab.holo', import.meta.url)
);

let questLogic = '';
let augmentedLab = '';

beforeAll(async () => {
  [questLogic, augmentedLab] = await Promise.all([
    readFile(questLogicPath, 'utf8'),
    readFile(augmentedLabPath, 'utf8'),
  ]);
});

async function solve(functionName: string, args: number[]): Promise<Record<string, unknown>> {
  return (await handleSimulationTool('solve_logic', {
    code: questLogic,
    functionName,
    args,
  })) as Record<string, unknown>;
}

describe('reusable augmented experiment quest', () => {
  it('parses the augmented lab as sovereign HoloScript source', () => {
    const composition = parseHoloStrict(augmentedLab);

    expect(composition.name).toBe('AugmentedExperimentQuest');
    expect(composition.objects?.length).toBeGreaterThan(0);
  });

  it('rejects a malformed run classification', async () => {
    const result = await solve('score_experiment_run', [4, 1, 1, 2, 1, 0]);

    expect(result.success).toBe(true);
    expect(result.result).toBe(-1);
  });

  it('awards no evidence XP for a duplicate run', async () => {
    const result = await solve('score_experiment_run', [3, 1, 1, 2, 0, 0]);

    expect(result.success).toBe(true);
    expect(result.result).toBe(0);
  });

  it('rewards an accounted or negative result when its evidence process is sound', async () => {
    const result = await solve('score_experiment_run', [1, 1, 1, 2, 1, 0]);

    expect(result.success).toBe(true);
    expect(result.result).toBe(36);
  });

  it('keeps anomaly rewards modest so spectacular claims do not dominate play', async () => {
    const accounted = await solve('score_experiment_run', [1, 1, 1, 2, 1, 0]);
    const anomaly = await solve('score_experiment_run', [2, 1, 1, 2, 1, 0]);
    const candidate = await solve('score_experiment_run', [3, 1, 1, 2, 1, 0]);

    expect(anomaly.result).toBe(46);
    expect(candidate.result).toBe(56);
    expect((candidate.result as number) - (accounted.result as number)).toBeLessThanOrEqual(20);
  });

  it('penalizes unsafe procedure without making XP negative', async () => {
    const oneIncident = await solve('score_experiment_run', [1, 1, 1, 2, 1, 1]);
    const manyIncidents = await solve('score_experiment_run', [1, 1, 1, 2, 1, 5]);

    expect(oneIncident.result).toBe(16);
    expect(manyIncidents.result).toBe(0);
  });

  it('gates rank by completed process, not points alone', async () => {
    const pointsOnly = await solve('experiment_rank', [500, 1, 0, 0]);
    const investigator = await solve('experiment_rank', [120, 3, 2, 0]);
    const replicator = await solve('experiment_rank', [220, 8, 4, 1]);
    const steward = await solve('experiment_rank', [500, 20, 8, 3]);

    expect(pointsOnly.result).toBe(0);
    expect(investigator.result).toBe(2);
    expect(replicator.result).toBe(3);
    expect(steward.result).toBe(4);
  });

  it('lets a campaign advance entirely through well-measured null results', async () => {
    const run = await solve('score_experiment_run', [1, 1, 1, 2, 1, 0]);
    const campaignXp = (run.result as number) * 6;
    const rank = await solve('experiment_rank', [campaignXp, 6, 6, 0]);

    expect(campaignXp).toBe(216);
    expect(rank.result).toBe(2);
  });

  it('produces a replay-verifiable receipt for scored runs', async () => {
    const result = await solve('score_experiment_run', [1, 1, 1, 2, 1, 0]);
    const replay = (await handleSimulationTool('verify_cael_trace', {
      traceJSONL: result.traceJSONL,
    })) as Record<string, unknown>;

    expect(replay).toMatchObject({
      success: true,
      hashChainValid: true,
      replayValid: true,
      solverType: 'hs-logic',
      replayResult: 36,
    });
  });
});
