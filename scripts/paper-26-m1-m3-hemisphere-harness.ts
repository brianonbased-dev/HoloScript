#!/usr/bin/env tsx
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { HSPlusNode, TraitContext } from '../packages/core/src/traits/TraitTypes.js';
import { computeParallelBounds } from '../packages/core/src/traits/pillar/ParallelPillar.js';
import type { PillarSlice } from '../packages/core/src/traits/pillar/SemanticCollaborationContract.js';
import {
  getUAALAgentSnapshot,
  uAALComposedAgentHandler,
  type UAALAgentConfig,
} from '../packages/core/src/traits/pillar/uAALComposedAgent.js';

interface CliConfig {
  agents: number;
  ticks: number;
  innerFreq: number;
  latentDim: number;
  rollingWindow: number;
  reportTicks: number[];
  seed: number;
  out: string;
}

interface AgentTickRecord {
  tick: number;
  gamma: number;
  rhoCumulative: number;
  rhoRolling: number;
  totalLoss: number;
  conservationLoss: number;
  bilateralLoss: number;
  lifecycle: string;
}

interface AgentState {
  node: HSPlusNode;
  config: UAALAgentConfig;
  ctx: TraitContext;
  history: AgentTickRecord[];
  pendingSlices: Array<{ from: string; loop: 'inner' | 'outer'; slice: PillarSlice }>;
  rollingFingerprints: string[];
  lastLoss: { totalLoss: number; conservationLoss: number; bilateralLoss: number } | null;
  lastGamma: number;
  lastRhoCumulative: number;
  lastRhoRolling: number;
}

interface SummaryStats {
  n: number;
  mean: number;
  std: number;
  median: number;
  p10: number;
  p90: number;
  min: number;
  max: number;
  ci95Low: number;
  ci95High: number;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const DEFAULT_OUT = 'research/paper-26-artifacts/paper-26-m1-m3-hemisphere-sim-2026-06-21.json';

function parseArgs(): CliConfig {
  const get = (name: string, fallback: string): string => {
    const prefix = `--${name}=`;
    const found = process.argv.find((arg) => arg.startsWith(prefix));
    return found ? found.slice(prefix.length) : fallback;
  };

  const ticks = Number.parseInt(get('ticks', '1000'), 10);
  const reportTicks = get('report-ticks', '100,500,1000')
    .split(',')
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((tick) => Number.isFinite(tick) && tick > 0 && tick <= ticks);

  return {
    agents: Number.parseInt(get('agents', '100'), 10),
    ticks,
    innerFreq: Number.parseInt(get('inner-freq', '10'), 10),
    latentDim: Number.parseInt(get('latent-dim', '32'), 10),
    rollingWindow: Number.parseInt(get('rolling-window', '100'), 10),
    reportTicks,
    seed: Number.parseInt(get('seed', '262026'), 10),
    out: get('out', DEFAULT_OUT),
  };
}

function round(value: number): number {
  return Number(value.toFixed(6));
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.max(0, Math.min(sorted.length - 1, Math.ceil(sorted.length * p) - 1));
  return sorted[idx] ?? 0;
}

function stats(values: number[]): SummaryStats {
  const sorted = [...values].sort((a, b) => a - b);
  const mu = mean(sorted);
  const variance = sorted.reduce((sum, value) => sum + (value - mu) ** 2, 0) / sorted.length;
  const std = Math.sqrt(variance);
  const ci = 1.96 * (std / Math.sqrt(sorted.length));
  return {
    n: sorted.length,
    mean: round(mu),
    std: round(std),
    median: round(percentile(sorted, 0.5)),
    p10: round(percentile(sorted, 0.1)),
    p90: round(percentile(sorted, 0.9)),
    min: round(sorted[0] ?? 0),
    max: round(sorted[sorted.length - 1] ?? 0),
    ci95Low: round(mu - ci),
    ci95High: round(mu + ci),
  };
}

function stableDigest(value: unknown): string {
  return createHash('sha256')
    .update(`${JSON.stringify(value, null, 2)}\n`)
    .digest('hex');
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeCtx(onEmit?: (name: string, payload: unknown) => void): TraitContext {
  return {
    emit(name: string, payload: unknown) {
      onEmit?.(name, payload);
    },
    getState: () => ({}),
    setState: () => {},
    getScaleMultiplier: () => 1,
    setScaleContext: () => {},
    vr: null,
    physics: null,
    audio: null,
    haptics: null,
  } as unknown as TraitContext;
}

function fingerprintSlice(slice: PillarSlice): string {
  return `${slice.axis_1_id}:${slice.axis_2_id}:${slice.pos_1.toFixed(2)}:${slice.pos_2.toFixed(2)}`;
}

function createAgent(index: number, cfg: CliConfig): AgentState {
  const agentId = `paper26_harness_agent_${String(index).padStart(3, '0')}`;
  const config: UAALAgentConfig = {
    agent_id: agentId,
    inner_frequency: cfg.innerFreq,
    emit_to_peers: true,
    jepa_latent_dim: cfg.latentDim,
  };

  const state: AgentState = {
    node: {} as HSPlusNode,
    config,
    ctx: makeCtx(),
    history: [],
    pendingSlices: [],
    rollingFingerprints: [],
    lastLoss: null,
    lastGamma: 0,
    lastRhoCumulative: 1,
    lastRhoRolling: 1,
  };

  state.ctx = makeCtx((name, payload) => {
    if (name === 'pillarjepa:loss') {
      const p = payload as {
        totalLoss?: number;
        conservationLoss?: number;
        bilateralLoss?: number;
        hemisphereAgreement?: number;
      };
      state.lastLoss = {
        totalLoss: p.totalLoss ?? 0,
        conservationLoss: p.conservationLoss ?? 0,
        bilateralLoss: p.bilateralLoss ?? 0,
      };
      if (typeof p.hemisphereAgreement === 'number') {
        state.lastGamma = p.hemisphereAgreement;
      }
    }

    if (name === 'emitter:diversity_stats') {
      const p = payload as { diversity_ratio?: number };
      if (typeof p.diversity_ratio === 'number') {
        state.lastRhoCumulative = p.diversity_ratio;
      }
    }

    if (name === 'emitter:training_slice') {
      const training = payload as { slice?: { slice?: PillarSlice } };
      const slice = training.slice?.slice;
      if (slice) {
        state.rollingFingerprints.push(fingerprintSlice(slice));
        if (state.rollingFingerprints.length > cfg.rollingWindow) {
          state.rollingFingerprints.shift();
        }
        state.lastRhoRolling =
          new Set(state.rollingFingerprints).size / state.rollingFingerprints.length;
      }
    }

    if (name === 'recursive_link:send') {
      const msg = payload as { from?: string; loop?: 'inner' | 'outer'; slice?: PillarSlice };
      if (msg.slice) {
        state.pendingSlices.push({
          from: msg.from ?? state.config.agent_id,
          loop: msg.loop ?? 'outer',
          slice: msg.slice,
        });
      }
    }
  });

  uAALComposedAgentHandler.onAttach?.(state.node, config, state.ctx);
  return state;
}

function routePendingSlices(source: AgentState, agents: AgentState[], fanOut: number): void {
  const sourceIndex = agents.indexOf(source);
  if (sourceIndex < 0) return;
  for (const msg of source.pendingSlices) {
    for (let offset = 1; offset <= fanOut; offset++) {
      const peer = agents[(sourceIndex + offset) % agents.length];
      if (!peer) continue;
      peer.ctx.emit('recursive_link:receive', {
        from: msg.from,
        to: peer.config.agent_id,
        loop: msg.loop,
        slice: msg.slice,
        timestamp_ms: 0,
      });
    }
  }
  source.pendingSlices.length = 0;
}

function tickAgent(agent: AgentState, cfg: CliConfig): void {
  const tickIndex = agent.history.length;
  const progress = Math.min(1, tickIndex / Math.max(1, cfg.ticks * 0.8));
  const agentNumber = Number.parseInt(agent.config.agent_id.slice(-3), 10) || 0;
  const phase = agentNumber * 0.6;

  for (let inner = 0; inner < cfg.innerFreq; inner++) {
    const step = tickIndex * cfg.innerFreq + inner;
    const wobble = Math.sin(0.15 * step + phase);
    const metadata = {
      tick: tickIndex,
      convergence: progress,
      maturity: 0.5 + 0.5 * progress,
      phase: progress < 0.6 ? 'transient' : 'steady_state',
      energy_conservation: 1.0 + 0.05 * wobble,
      momentum_violation: 0.1 * (1 - progress) * Math.abs(wobble),
      entropy_level: 0.5 + 0.3 * Math.sin(0.07 * step + phase),
      angular_momentum_pressure: 0.2 * Math.cos(0.11 * step + phase),
      physics_source: 'deterministic_local_harness',
    };

    uAALComposedAgentHandler.onEvent?.(agent.node, agent.config, agent.ctx, {
      type: 'cogvm:tick',
      context: 'paper26-m1-m3-harness',
      metadata,
    } as Parameters<NonNullable<typeof uAALComposedAgentHandler.onEvent>>[3]);
  }
}

function captureAgent(agent: AgentState, tick: number): AgentTickRecord {
  const snapshot = getUAALAgentSnapshot(agent.node);
  return {
    tick,
    gamma: round(agent.lastGamma),
    rhoCumulative: round(agent.lastRhoCumulative),
    rhoRolling: round(agent.lastRhoRolling),
    totalLoss: round(agent.lastLoss?.totalLoss ?? 0),
    conservationLoss: round(agent.lastLoss?.conservationLoss ?? 0),
    bilateralLoss: round(agent.lastLoss?.bilateralLoss ?? 0),
    lifecycle: snapshot?.cogvm?.lifecycle ?? 'init',
  };
}

function randomCoordinateBaseline(cfg: CliConfig): {
  samples: number;
  gamma: SummaryStats;
  target: string;
  targetMet: boolean;
} {
  const rng = mulberry32(cfg.seed ^ 0xb200);
  const gammas: number[] = [];
  const samples = cfg.agents * cfg.ticks;
  for (let i = 0; i < samples; i++) {
    const left: PillarSlice = {
      axis_1_id: 'random_x',
      axis_2_id: 'random_y',
      pos_1: rng(),
      pos_2: rng(),
      pillar_id: 'b2_random_left',
      pillar_domain: 'coordination',
    };
    const right: PillarSlice = {
      axis_1_id: 'random_x',
      axis_2_id: 'random_y',
      pos_1: rng(),
      pos_2: rng(),
      pillar_id: 'b2_random_right',
      pillar_domain: 'coordination',
    };
    gammas.push(computeParallelBounds(left, right).hemisphere_agreement);
  }
  const gamma = stats(gammas);
  return {
    samples,
    gamma,
    target: 'mean gamma < 0.5',
    targetMet: gamma.mean < 0.5,
  };
}

function groupTrajectories(agents: AgentState[]): Array<{
  agentIds: string[];
  gamma: number[];
  rhoCumulative: number[];
  rhoRolling: number[];
}> {
  const groups = new Map<
    string,
    {
      agentIds: string[];
      gamma: number[];
      rhoCumulative: number[];
      rhoRolling: number[];
    }
  >();

  for (const agent of agents) {
    const gamma = agent.history.map((record) => record.gamma);
    const rhoCumulative = agent.history.map((record) => record.rhoCumulative);
    const rhoRolling = agent.history.map((record) => record.rhoRolling);
    const key = stableDigest({ gamma, rhoCumulative, rhoRolling });
    const existing = groups.get(key);
    if (existing) {
      existing.agentIds.push(agent.config.agent_id);
      continue;
    }
    groups.set(key, {
      agentIds: [agent.config.agent_id],
      gamma,
      rhoCumulative,
      rhoRolling,
    });
  }

  return [...groups.values()];
}

async function main(): Promise<void> {
  const cfg = parseArgs();
  const agents = Array.from({ length: cfg.agents }, (_, index) => createAgent(index, cfg));
  const population: Array<{
    tick: number;
    gamma: SummaryStats;
    rhoCumulative: SummaryStats;
    rhoRolling: SummaryStats;
    meanTotalLoss: number;
    lifecycleDistribution: Record<string, number>;
  }> = [];

  for (let tick = 1; tick <= cfg.ticks; tick++) {
    for (const agent of agents) {
      tickAgent(agent, cfg);
      routePendingSlices(agent, agents, 3);
      agent.history.push(captureAgent(agent, tick));
    }

    const tickRecords = agents.map((agent) => agent.history[agent.history.length - 1]!);
    const lifecycles: Record<string, number> = {};
    for (const record of tickRecords) {
      lifecycles[record.lifecycle] = (lifecycles[record.lifecycle] ?? 0) + 1 / agents.length;
    }

    population.push({
      tick,
      gamma: stats(tickRecords.map((record) => record.gamma)),
      rhoCumulative: stats(tickRecords.map((record) => record.rhoCumulative)),
      rhoRolling: stats(tickRecords.map((record) => record.rhoRolling)),
      meanTotalLoss: round(mean(tickRecords.map((record) => record.totalLoss))),
      lifecycleDistribution: lifecycles,
    });
  }

  const reportRows = cfg.reportTicks.map((tick) => population[tick - 1]).filter(Boolean);
  const final = population[population.length - 1]!;
  const baseline = randomCoordinateBaseline(cfg);
  const trajectoryGroups = groupTrajectories(agents);

  const artifactWithoutDigest = {
    schema: 'paper-26.m1-m3-hemisphere-sim.v1',
    generatedAt: new Date().toISOString(),
    boardTask: 'task_1781914349053_amgs',
    paper: 'paper-26-pillar-slice-framework-iclr',
    harness: {
      script: relative(REPO_ROOT, fileURLToPath(import.meta.url)).replaceAll('\\', '/'),
      stack:
        'Drives the shipped uAALComposedAgentHandler, which composes CognitiveVMTrait, PillarJEPA, SliceEmitter, and LatentIntegrityLayer.',
      deterministic: true,
      seed: cfg.seed,
      note:
        'Commands do not call external services. The harness records runtime events emitted by production handlers.',
    },
    config: {
      agents: cfg.agents,
      outerTicks: cfg.ticks,
      innerFrequency: cfg.innerFreq,
      latentDim: cfg.latentDim,
      rollingWindow: cfg.rollingWindow,
      reportTicks: cfg.reportTicks,
    },
    metrics: {
      m1: {
        name: 'hemisphere agreement gamma',
        sourceEvent: 'pillarjepa:loss.hemisphereAgreement',
        target: 'median gamma at tick 1000 > 0.9',
        targetMet: final.gamma.median > 0.9,
      },
      m3: {
        name: 'slice diversity rho',
        sourceEvent: 'emitter:diversity_stats.diversity_ratio plus harness rolling-window rho',
        cumulativeTarget: 'mean cumulative rho at tick 1000 > 0.8',
        cumulativeTargetMet: final.rhoCumulative.mean > 0.8,
        rollingTarget: 'mean rolling-window rho at tick 1000 > 0.8',
        rollingTargetMet: final.rhoRolling.mean > 0.8,
      },
    },
    reportRows,
    finalPopulation: final,
    b2RandomCoordinateBaseline: baseline,
    interpretation: {
      m1:
        final.gamma.median > 0.9
          ? 'M1 passes: median gamma exceeds 0.9 at tick 1000 in the shipped dual-loop stack.'
          : 'M1 does not pass the stated threshold in this run; use measured value instead of an expected cell.',
      m3:
        final.rhoCumulative.mean > 0.8
          ? 'M3 cumulative rho passes the static target.'
          : 'M3 cumulative rho does not pass the static lifetime target; this matches the existing paper note that cumulative rho is miscalibrated for long runs.',
      b2:
        baseline.targetMet
          ? 'B2 random-coordinate baseline passes the <0.5 threshold.'
          : 'B2 random-coordinate baseline does not pass <0.5 under the current 2D gamma=1-box_area definition; independent random coordinates have high expected gamma, so threshold separation should not be claimed without a different baseline definition.',
    },
    trajectoryEncoding:
      'Per-agent trajectories are grouped by identical gamma/rho arrays to keep the artifact citeable; each group lists the agentIds that share the trajectory.',
    trajectoryGroups,
  };

  const artifact = {
    ...artifactWithoutDigest,
    artifactBodySha256: stableDigest(artifactWithoutDigest),
  };

  const outAbs = resolve(REPO_ROOT, cfg.out);
  await mkdir(dirname(outAbs), { recursive: true });
  await writeFile(outAbs, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8');

  console.log(
    JSON.stringify(
      {
        ok: true,
        output: relative(REPO_ROOT, outAbs).replaceAll('\\', '/'),
        final: {
          gammaMedian: final.gamma.median,
          gammaMean: final.gamma.mean,
          rhoCumulativeMean: final.rhoCumulative.mean,
          rhoRollingMean: final.rhoRolling.mean,
          b2MeanGamma: baseline.gamma.mean,
        },
        targets: {
          m1: artifact.metrics.m1.targetMet,
          m3Cumulative: artifact.metrics.m3.cumulativeTargetMet,
          m3Rolling: artifact.metrics.m3.rollingTargetMet,
          b2: baseline.targetMet,
        },
        artifactBodySha256: artifact.artifactBodySha256,
      },
      null,
      2
    )
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
