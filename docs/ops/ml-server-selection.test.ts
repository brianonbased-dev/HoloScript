/**
 * Vitest gate for docs/ops/ml-server-selection.bench.ts (P.008.03).
 */
import { describe, it, expect } from 'vitest';
import {
  precomputeLatencyTable,
  runLinUcbOnTable,
  runUniformRandomOnTable,
  regretReportAt500,
} from './ml-server-selection.bench';

describe('P.008.03 ML server selection (simulated)', () => {
  it('LinUCB1 outperforms uniform random on total reward (bimodal latency table)', () => {
    const rounds = 1000;
    const seed = 0xace12345;
    const table = precomputeLatencyTable(rounds, seed);

    const ucb = runLinUcbOnTable(table, seed);
    const rnd = runUniformRandomOnTable(table, seed);

    console.log(
      `[P.008.03] rounds=${rounds} LinUCB reward=${ucb.totalReward.toFixed(2)} meanLatency=${ucb.meanLatencyMs.toFixed(2)}ms picks=${ucb.picks.join(',')}`
    );
    console.log(
      `[P.008.03] rounds=${rounds} Random  reward=${rnd.totalReward.toFixed(2)} meanLatency=${rnd.meanLatencyMs.toFixed(2)}ms picks=${rnd.picks.join(',')}`
    );

    expect(ucb.totalReward).toBeGreaterThan(rnd.totalReward);
    expect(ucb.meanLatencyMs).toBeLessThan(rnd.meanLatencyMs);
    expect(ucb.picks[0]).toBeGreaterThan(ucb.picks[1]);
  });

  it('by round 500: LinUCB regret < 30% of uniform-random regret', () => {
    const seed = 0xbee71e07;
    const table = precomputeLatencyTable(1000, seed);
    const { round500 } = regretReportAt500(table, seed);

    console.log(
      `[P.008.03] round-500 regret LinUCB=${round500.linUcb.toFixed(4)} random=${round500.random.toFixed(4)}`
    );

    expect(round500.random).toBeGreaterThan(0);
    expect(round500.linUcb).toBeLessThan(0.3 * round500.random);
  });
});
