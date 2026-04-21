/**
 * P.008.03 — ML server selection: LinUCB vs uniform random (simulated bimodal latency).
 *
 * Two servers: "fast" ~50 ms, "slow" ~500 ms (Gaussian noise). Rewards = 1000/latency
 * so higher is better. LinUCB1 maximizes cumulative reward vs i.i.d. uniform selection.
 *
 * Latencies for each round are **precomputed** for both arms so policies are compared
 * on the same underlying draws (fair regret).
 *
 * Not wired to a live MLServerSelector yet — this file is the regression harness.
 */

export interface SimSummary {
  name: string;
  totalReward: number;
  meanLatencyMs: number;
  picks: number[];
}

export interface RegretReport {
  round500: { linUcb: number; random: number };
}

const FAST_MEAN = 50;
const SLOW_MEAN = 500;
const FAST_STD = 8;
const SLOW_STD = 80;

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function gaussian(rng: () => number): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

function sampleLatency(arm: 0 | 1, rng: () => number): number {
  if (arm === 0) return Math.max(1, FAST_MEAN + gaussian(rng) * FAST_STD);
  return Math.max(1, SLOW_MEAN + gaussian(rng) * SLOW_STD);
}

export function latencyToReward(latencyMs: number): number {
  return 1000 / Math.max(latencyMs, 1e-3);
}

/** Independent latency draws per arm per round (common random numbers for all policies). */
export function precomputeLatencyTable(rounds: number, seed: number): [number, number][] {
  const rng = mulberry32(seed);
  const rows: [number, number][] = [];
  for (let t = 0; t < rounds; t++) {
    rows.push([sampleLatency(0, rng), sampleLatency(1, rng)]);
  }
  return rows;
}

/** Clairvoyant baseline: per round choose the arm with higher reward (lower latency). */
export function oracleBestArmRewardSum(table: [number, number][]): number {
  let s = 0;
  for (const [a0, a1] of table) {
    s += Math.max(latencyToReward(a0), latencyToReward(a1));
  }
  return s;
}

/** Always pick arm 0 (fast machine) — near-optimal if fast is almost always better. */
export function alwaysFastArmRewardSum(table: [number, number][]): number {
  let s = 0;
  for (const [a0] of table) {
    s += latencyToReward(a0);
  }
  return s;
}

/** UCB1 (maximize reward). Uses shared latency table; `rng` only for tie-break / internal randomness (none here). */
export function runLinUcbOnTable(
  table: [number, number][],
  _seed: number,
  exploration: number = Math.sqrt(2)
): SimSummary {
  const rounds = table.length;
  const n = [0, 0];
  const sumR = [0, 0];
  let totalReward = 0;
  let sumLatency = 0;
  const picks = [0, 0];
  let t = 0;

  for (const _ of table) {
    t++;
    let arm: 0 | 1;
    if (n[0] === 0) arm = 0;
    else if (n[1] === 0) arm = 1;
    else {
      const ucb0 = sumR[0] / n[0] + exploration * Math.sqrt(Math.log(t) / n[0]);
      const ucb1 = sumR[1] / n[1] + exploration * Math.sqrt(Math.log(t) / n[1]);
      arm = ucb0 >= ucb1 ? 0 : 1;
    }
    const latency = table[t - 1]![arm]!;
    const r = latencyToReward(latency);
    n[arm]++;
    sumR[arm] += r;
    totalReward += r;
    sumLatency += latency;
    picks[arm]++;
  }

  return {
    name: 'LinUCB1',
    totalReward,
    meanLatencyMs: sumLatency / rounds,
    picks,
  };
}

export function runUniformRandomOnTable(table: [number, number][], seed: number): SimSummary {
  const rng = mulberry32(seed ^ 0x9e3779b9);
  let totalReward = 0;
  let sumLatency = 0;
  const picks = [0, 0];

  for (const row of table) {
    const arm = (rng() < 0.5 ? 0 : 1) as 0 | 1;
    const latency = row[arm]!;
    const r = latencyToReward(latency);
    totalReward += r;
    sumLatency += latency;
    picks[arm]++;
  }

  return {
    name: 'uniform-random',
    totalReward,
    meanLatencyMs: sumLatency / table.length,
    picks,
  };
}

/** Slice policy: run policy logic only on first `len` rounds (re-run from scratch on prefix). */
export function rewardOnPrefixLinUcb(
  table: [number, number][],
  len: number,
  seed: number
): number {
  const prefix = table.slice(0, len);
  return runLinUcbOnTable(prefix, seed).totalReward;
}

export function rewardOnPrefixRandom(table: [number, number][], len: number, seed: number): number {
  const prefix = table.slice(0, len);
  return runUniformRandomOnTable(prefix, seed).totalReward;
}

export function regretReportAt500(table: [number, number][], seed: number): RegretReport {
  const rUcb = rewardOnPrefixLinUcb(table, 500, seed);
  const rRnd = rewardOnPrefixRandom(table, 500, seed);
  const oracle500 = oracleBestArmRewardSum(table.slice(0, 500));

  const linUcbRegret = oracle500 - rUcb;
  const randomRegret = oracle500 - rRnd;
  return {
    round500: { linUcb: linUcbRegret, random: randomRegret },
  };
}
