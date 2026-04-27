/**
 * Paper #2 Benchmark: STDP-LEARNED SNN Navigation Experiment
 *
 * Companion to `paper-snn-navigation.test.ts` (the reactive 20% baseline).
 * This harness enables Spike-Timing-Dependent Plasticity (STDP) learning on
 * the same 2D obstacle room and demonstrates that path efficiency improves
 * past the 20% reactive baseline cited in `paper-2-snn-neurips.tex` §5.4.
 *
 * Why a separate harness:
 *   - The baseline reactive controller uses @holoscript/snn-webgpu's
 *     CPUReferenceSimulator (LIF-only, no synapses, no plasticity).
 *   - SNNNetwork (the multi-layer STDP-capable type) requires WebGPU and
 *     the Vitest mock GPU dispatches no compute shaders, so weights would
 *     never update in CI.
 *   - This harness implements a self-contained CPU LIF + Hebbian-STDP path
 *     that is bit-deterministic (xorshift32) and runs in node with no GPU.
 *   - The STDP rule mirrors `synaptic-weights.wgsl::stdp_weight_update`
 *     (LTP soft-bounded toward 1, LTD soft-bounded toward 0) so any future
 *     port to the WebGPU SNNNetwork path produces identical learning
 *     dynamics modulo numeric precision.
 *
 * Architecture (closes Future Work item (1) in paper-2-snn-neurips.tex §6):
 *   - Sensor input: 8 ray-cast distances + 2 goal vector components (10 inputs)
 *   - Pre-synaptic layer: 64 LIF neurons (8 ray populations × 8 neurons)
 *   - Post-synaptic layer: 4 action neurons (N, E, S, W)
 *   - Plastic synapses: 4 × 64 weight matrix, soft-bounded Hebbian STDP
 *   - Action selection: argmax of action-layer spike count
 *   - Teacher (training only): inject 80mV into the greedy-toward-goal
 *     action neuron each step → STDP strengthens place→action paths that
 *     consistently lead to goal-approaching choices.
 *
 * Metrics emitted (NeurIPS-paper-aligned):
 *   - Baseline path efficiency (random weights, no learning)
 *   - Trained path efficiency (frozen weights after STDP)
 *   - Improvement (post − baseline)
 *   - Per-tick LIF time, spike counts, weight delta statistics
 *
 * Determinism:
 *   - All randomness sourced from a seeded xorshift32 PRNG (seed = 42).
 *   - Result is reproducible across machines and Node versions.
 *
 * @see research/paper-2-snn-neurips.tex §5.4 (baseline 20%)
 * @see research/paper-2-snn-neurips.tex §6 Future Work item (1)
 * @see packages/snn-webgpu/src/shaders/synaptic-weights.wgsl::stdp_weight_update
 */

import { describe, it, expect } from 'vitest';

// ── 2D Navigation Environment (mirrors paper-snn-navigation.test.ts) ────────

interface Vec2 { x: number; y: number }

interface NavEnvironment {
  width: number;
  height: number;
  obstacles: Array<{ pos: Vec2; radius: number }>;
  goal: Vec2;
  agentPos: Vec2;
  agentRadius: number;
}

function createRoom(): NavEnvironment {
  return {
    width: 20,
    height: 20,
    obstacles: [
      { pos: { x: 5, y: 10 }, radius: 2 },
      { pos: { x: 10, y: 5 }, radius: 1.5 },
      { pos: { x: 10, y: 15 }, radius: 1.5 },
      { pos: { x: 15, y: 10 }, radius: 2 },
      { pos: { x: 8, y: 8 }, radius: 1 },
      { pos: { x: 12, y: 12 }, radius: 1 },
    ],
    goal: { x: 18, y: 18 },
    agentPos: { x: 2, y: 2 },
    agentRadius: 0.4,
  };
}

function castSensorRays(env: NavEnvironment): Float32Array {
  const distances = new Float32Array(8);
  const maxDist = Math.sqrt(env.width ** 2 + env.height ** 2);
  const angles = [
    0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4,
    Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4,
  ];

  for (let i = 0; i < 8; i++) {
    const dx = Math.cos(angles[i]);
    const dy = Math.sin(angles[i]);
    let minDist = maxDist;

    if (dx > 0) minDist = Math.min(minDist, (env.width - env.agentPos.x) / dx);
    if (dx < 0) minDist = Math.min(minDist, -env.agentPos.x / dx);
    if (dy > 0) minDist = Math.min(minDist, (env.height - env.agentPos.y) / dy);
    if (dy < 0) minDist = Math.min(minDist, -env.agentPos.y / dy);

    for (const obs of env.obstacles) {
      const ox = obs.pos.x - env.agentPos.x;
      const oy = obs.pos.y - env.agentPos.y;
      const proj = ox * dx + oy * dy;
      if (proj < 0) continue;
      const perpSq = ox * ox + oy * oy - proj * proj;
      const rSq = (obs.radius + env.agentRadius) ** 2;
      if (perpSq < rSq) {
        const hit = proj - Math.sqrt(rSq - perpSq);
        if (hit > 0 && hit < minDist) minDist = hit;
      }
    }

    distances[i] = Math.max(0, Math.min(1, minDist / maxDist));
  }
  return distances;
}

function goalVector(env: NavEnvironment): { dist: number; angle: number } {
  const dx = env.goal.x - env.agentPos.x;
  const dy = env.goal.y - env.agentPos.y;
  const maxDist = Math.sqrt(env.width ** 2 + env.height ** 2);
  return {
    dist: Math.sqrt(dx * dx + dy * dy) / maxDist,
    angle: Math.atan2(dy, dx),
  };
}

function moveAgent(env: NavEnvironment, action: string, stepSize: number = 0.8): void {
  let nx = env.agentPos.x;
  let ny = env.agentPos.y;

  switch (action) {
    case 'move_east': nx += stepSize; break;
    case 'move_west': nx -= stepSize; break;
    case 'move_north': ny += stepSize; break;
    case 'move_south': ny -= stepSize; break;
  }

  nx = Math.max(env.agentRadius, Math.min(env.width - env.agentRadius, nx));
  ny = Math.max(env.agentRadius, Math.min(env.height - env.agentRadius, ny));

  for (const obs of env.obstacles) {
    const dx = nx - obs.pos.x;
    const dy = ny - obs.pos.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = obs.radius + env.agentRadius;
    if (dist < minDist) {
      const pushDist = minDist - dist;
      nx += (dx / dist) * pushDist;
      ny += (dy / dist) * pushDist;
    }
  }

  env.agentPos = { x: nx, y: ny };
}

function atGoal(env: NavEnvironment, threshold: number = 1.0): boolean {
  const dx = env.goal.x - env.agentPos.x;
  const dy = env.goal.y - env.agentPos.y;
  return Math.sqrt(dx * dx + dy * dy) < threshold;
}

// ── Greedy teacher signal (training only) ──────────────────────────────────

function greedyAction(env: NavEnvironment): number {
  const dx = env.goal.x - env.agentPos.x;
  const dy = env.goal.y - env.agentPos.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 1 : 3; // E or W
  }
  return dy > 0 ? 0 : 2; // N or S
}

const ACTION_NAMES = ['move_north', 'move_east', 'move_south', 'move_west'] as const;

// ── Deterministic PRNG (xorshift32) ────────────────────────────────────────

function makePrng(seed: number): () => number {
  let state = (seed >>> 0) || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) / 0xffffffff);
  };
}

// ── LIF parameters (match @holoscript/snn-webgpu DEFAULT_LIF_PARAMS) ───────

const LIF = {
  vRest: -65.0,
  vReset: -75.0,
  vThreshold: -55.0,
  tau: 20.0,
  dt: 1.0,
  refractoryMs: 2.0,
} as const;

const LIF_DECAY = Math.exp(-LIF.dt / LIF.tau);

// ── Two-layer LIF + STDP CPU reference network ─────────────────────────────

interface NetworkParams {
  preCount: number;
  postCount: number;
  learningRate: number;
  ltdRatio: number;        // LTD strength relative to LTP (0.5 matches WGSL)
  weightSeed: number;
}

class STDPNet {
  readonly preCount: number;
  readonly postCount: number;
  readonly weights: Float32Array;       // postCount × preCount (row-major)
  readonly preMembrane: Float32Array;
  readonly preRefractory: Float32Array;
  readonly preSpikes: Float32Array;
  readonly postMembrane: Float32Array;
  readonly postRefractory: Float32Array;
  readonly postSpikes: Float32Array;
  private learningRate: number;
  private ltdRatio: number;

  constructor(params: NetworkParams) {
    this.preCount = params.preCount;
    this.postCount = params.postCount;
    this.learningRate = params.learningRate;
    this.ltdRatio = params.ltdRatio;

    // Random weight init in [0, 1) via seeded xorshift32 — same family as
    // generateWeightMatrix in @holoscript/snn-webgpu/poc/cpu-reference.
    const rng = makePrng(params.weightSeed);
    this.weights = new Float32Array(this.preCount * this.postCount);
    for (let i = 0; i < this.weights.length; i++) {
      this.weights[i] = rng() * 0.5; // start small to keep dynamics bounded
    }

    this.preMembrane = new Float32Array(this.preCount).fill(LIF.vRest);
    this.preRefractory = new Float32Array(this.preCount);
    this.preSpikes = new Float32Array(this.preCount);
    this.postMembrane = new Float32Array(this.postCount).fill(LIF.vRest);
    this.postRefractory = new Float32Array(this.postCount);
    this.postSpikes = new Float32Array(this.postCount);
  }

  reset(): void {
    this.preMembrane.fill(LIF.vRest);
    this.preRefractory.fill(0);
    this.preSpikes.fill(0);
    this.postMembrane.fill(LIF.vRest);
    this.postRefractory.fill(0);
    this.postSpikes.fill(0);
  }

  /**
   * One LIF step on the input layer.
   * `inputCurrent` is in mV; pushes neurons toward threshold.
   */
  private stepPre(inputCurrent: Float32Array): number {
    let totalSpikes = 0;
    for (let i = 0; i < this.preCount; i++) {
      if (this.preRefractory[i] > 0) {
        this.preRefractory[i] = Math.max(this.preRefractory[i] - LIF.dt, 0);
        this.preMembrane[i] = LIF.vReset;
        this.preSpikes[i] = 0;
        continue;
      }
      const v = LIF.vRest + (this.preMembrane[i] - LIF.vRest) * LIF_DECAY + inputCurrent[i];
      if (v >= LIF.vThreshold) {
        this.preSpikes[i] = 1;
        this.preMembrane[i] = LIF.vReset;
        this.preRefractory[i] = LIF.refractoryMs;
        totalSpikes++;
      } else {
        this.preSpikes[i] = 0;
        this.preMembrane[i] = v;
      }
    }
    return totalSpikes;
  }

  /**
   * Compute synaptic currents from pre→post via the weight matrix, then
   * one LIF step on the post layer. Optional `teacherCurrent` is added to
   * the post-synaptic input (used for supervised STDP).
   */
  private stepPost(teacherCurrent?: Float32Array): number {
    let totalSpikes = 0;
    for (let j = 0; j < this.postCount; j++) {
      // Synaptic current = sum of weights from spiking pre neurons
      let current = 0;
      const rowOffset = j * this.preCount;
      for (let i = 0; i < this.preCount; i++) {
        if (this.preSpikes[i] > 0.5) {
          current += this.weights[rowOffset + i];
        }
      }
      if (teacherCurrent) {
        current += teacherCurrent[j];
      }

      if (this.postRefractory[j] > 0) {
        this.postRefractory[j] = Math.max(this.postRefractory[j] - LIF.dt, 0);
        this.postMembrane[j] = LIF.vReset;
        this.postSpikes[j] = 0;
        continue;
      }
      const v = LIF.vRest + (this.postMembrane[j] - LIF.vRest) * LIF_DECAY + current;
      if (v >= LIF.vThreshold) {
        this.postSpikes[j] = 1;
        this.postMembrane[j] = LIF.vReset;
        this.postRefractory[j] = LIF.refractoryMs;
        totalSpikes++;
      } else {
        this.postSpikes[j] = 0;
        this.postMembrane[j] = v;
      }
    }
    return totalSpikes;
  }

  /**
   * STDP weight update — mirrors the WGSL `stdp_weight_update` kernel:
   *   - if pre & post both spiked → LTP: dw = lr * (1 - w)
   *   - if pre spiked but post didn't → LTD: dw = -lr * ltdRatio * w
   *   - clamp to [0, 1]
   */
  private applySTDP(): void {
    const lr = this.learningRate;
    for (let j = 0; j < this.postCount; j++) {
      const post = this.postSpikes[j];
      const rowOffset = j * this.preCount;
      for (let i = 0; i < this.preCount; i++) {
        const pre = this.preSpikes[i];
        const w = this.weights[rowOffset + i];
        let dw = 0;
        if (pre > 0.5 && post > 0.5) {
          dw = lr * (1 - w);
        } else if (pre > 0.5 && post < 0.5) {
          dw = -lr * this.ltdRatio * w;
        }
        const next = w + dw;
        this.weights[rowOffset + i] = next < 0 ? 0 : next > 1 ? 1 : next;
      }
    }
  }

  /**
   * Decode-mode forward pass for action selection.
   * Runs `lifSteps` LIF iterations with no teacher current and no STDP;
   * returns the per-neuron post-layer spike counts so the caller can
   * argmax-decode the chosen action.
   */
  forward(
    inputCurrent: Float32Array,
    lifSteps: number,
  ): { preSpikeTotal: number; postSpikeCounts: Int32Array } {
    const counts = new Int32Array(this.postCount);
    let preSpikeTotal = 0;
    for (let s = 0; s < lifSteps; s++) {
      preSpikeTotal += this.stepPre(inputCurrent);
      this.stepPost(undefined);
      for (let j = 0; j < this.postCount; j++) {
        if (this.postSpikes[j] > 0.5) counts[j]++;
      }
    }
    return { preSpikeTotal, postSpikeCounts: counts };
  }

  /**
   * Supervised STDP reinforcement step.
   *
   * Mirrors `SNNNavigationAgent.reinforceAction()` in
   * `packages/snn-webgpu/src/experiments/stdp-navigation.ts`:
   *
   *   - The teacher current overrides the natural synaptic drive on the
   *     post layer so ONLY the correct action neuron fires.
   *   - Pre-layer LIF runs on the same sensor input as the decode pass.
   *   - One LIF step (place fires → action[correct] fires) → STDP LTP on
   *     pre→teacher synapses, LTD on pre→non-teacher synapses.
   *
   * This decoupling (decode vs reinforce) is what makes the STDP signal
   * unambiguous: during reinforcement, post-spikes are exactly the
   * teacher signal, so weight updates are supervised rather than
   * self-correlated.
   */
  reinforce(inputCurrent: Float32Array, teacherCurrent: Float32Array): void {
    this.stepPre(inputCurrent);
    // Override natural drive: zero refractory + reset membrane on action
    // layer so only the teacher current decides who fires.
    this.postMembrane.fill(LIF.vRest);
    this.postRefractory.fill(0);
    this.postSpikes.fill(0);
    // Compute synaptic current from pre→post using current weights, then
    // ADD the teacher signal. The teacher (80mV) dominates so only the
    // teacher neuron crosses threshold; natural pre→post spike drive is
    // present (so LTD on losers is realistic) but cannot tip non-teacher
    // neurons over threshold.
    for (let j = 0; j < this.postCount; j++) {
      let current = 0;
      const rowOffset = j * this.preCount;
      for (let i = 0; i < this.preCount; i++) {
        if (this.preSpikes[i] > 0.5) {
          current += this.weights[rowOffset + i];
        }
      }
      current += teacherCurrent[j];
      const v = LIF.vRest + (this.postMembrane[j] - LIF.vRest) * LIF_DECAY + current;
      if (v >= LIF.vThreshold) {
        this.postSpikes[j] = 1;
        this.postMembrane[j] = LIF.vReset;
        this.postRefractory[j] = LIF.refractoryMs;
      } else {
        this.postSpikes[j] = 0;
        this.postMembrane[j] = v;
      }
    }
    this.applySTDP();
  }

  weightStats(): { mean: number; min: number; max: number; nonzero: number } {
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    let nonzero = 0;
    for (let i = 0; i < this.weights.length; i++) {
      const w = this.weights[i];
      sum += w;
      if (w < min) min = w;
      if (w > max) max = w;
      if (w > 1e-6) nonzero++;
    }
    return { mean: sum / this.weights.length, min, max, nonzero };
  }
}

// ── Sensor encoding: 8 rays + goal direction → 64-neuron pre-layer ─────────

const PRE_PER_DIRECTION = 8;
const PRE_COUNT = PRE_PER_DIRECTION * 8; // 64
const POST_COUNT = 4;
const LIF_STEPS_PER_TICK = 10;
const INPUT_SCALE_MV = 18; // moderate — keeps spike rate informative without saturating

/**
 * Build the pre-layer input current from sensor readings.
 *
 * Each of the 8 rays drives `PRE_PER_DIRECTION` neurons. The current is the
 * `openness` of the ray (1 = far away, 0 = wall right here) scaled by
 * INPUT_SCALE_MV. The goal vector additionally biases the directional
 * populations aligned with the goal angle, giving the SNN a directional
 * prior the way the reactive baseline does — but here STDP refines the
 * pre→post mapping over time.
 */
function encodeSensorInput(env: NavEnvironment): Float32Array {
  const rays = castSensorRays(env);
  const gv = goalVector(env);
  const input = new Float32Array(PRE_COUNT);

  // Ray index → cardinal direction (0=N, 1=E, 2=S, 3=W).
  // ray 0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE — same mapping as the
  // reactive baseline NavSensorBridge in paper-snn-navigation.test.ts.
  const rayToDirs: number[][] = [
    [1],     // E
    [0, 1],  // NE
    [0],     // N
    [0, 3],  // NW
    [3],     // W
    [2, 3],  // SW
    [2],     // S
    [1, 2],  // SE
  ];

  for (let r = 0; r < 8; r++) {
    const openness = rays[r];
    const popStart = r * PRE_PER_DIRECTION;
    for (let n = 0; n < PRE_PER_DIRECTION; n++) {
      input[popStart + n] += openness * INPUT_SCALE_MV * 0.6;
    }
    // Cross-bind to cardinal direction populations via the original 64 layout.
    for (const dir of rayToDirs[r]) {
      // Neurons share the directional bias by adding to neighboring rays
      // tied to that cardinal direction. (no-op: handled by goal bias below)
      void dir;
    }
  }

  // Goal bias: align rays whose direction matches goal angle.
  const dirAngles = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // N, E, S, W
  const rayDirs = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4,
                   Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];
  void dirAngles;
  for (let r = 0; r < 8; r++) {
    let angleDiff = Math.abs(gv.angle - rayDirs[r]);
    if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
    const alignment = Math.max(0, Math.cos(angleDiff));
    const popStart = r * PRE_PER_DIRECTION;
    for (let n = 0; n < PRE_PER_DIRECTION; n++) {
      input[popStart + n] += alignment * INPUT_SCALE_MV * 0.4 * (1 - gv.dist * 0.5);
    }
  }

  return input;
}

/** Inject 80mV into the post neuron for the greedy-toward-goal action. */
function teacherSignal(env: NavEnvironment): Float32Array {
  const t = new Float32Array(POST_COUNT);
  t[greedyAction(env)] = 80; // well above LIF.vThreshold − vRest = 10
  return t;
}

/**
 * Run one navigation episode. Returns metrics.
 *
 * @param net    The two-layer STDP network
 * @param learn  When true, supervised STDP reinforcement runs each tick
 * @param maxTicks Episode horizon
 * @param env    Environment (mutated in place)
 */
function runEpisode(
  net: STDPNet,
  learn: boolean,
  maxTicks: number,
  env: NavEnvironment,
): {
  pathLength: number;
  manhattanDist: number;
  pathEfficiency: number;
  reachedGoal: boolean;
  goalTick: number;
  totalPostSpikes: number;
  ticks: number;
} {
  net.reset();
  const startPos = { ...env.agentPos };
  const path: Vec2[] = [{ ...env.agentPos }];
  let totalPostSpikes = 0;
  let goalTick = -1;
  let reachedGoal = false;

  for (let tick = 0; tick < maxTicks; tick++) {
    const input = encodeSensorInput(env);

    // 1. DECODE: forward pass with no teacher → action selection
    const { postSpikeCounts } = net.forward(input, LIF_STEPS_PER_TICK);
    for (let j = 0; j < POST_COUNT; j++) totalPostSpikes += postSpikeCounts[j];

    // Argmax decode (ties → lowest index for determinism)
    let best = 0;
    let bestVal = postSpikeCounts[0];
    for (let j = 1; j < POST_COUNT; j++) {
      if (postSpikeCounts[j] > bestVal) {
        bestVal = postSpikeCounts[j];
        best = j;
      }
    }
    moveAgent(env, ACTION_NAMES[best]);
    path.push({ ...env.agentPos });

    // 2. REINFORCE (training only): supervised STDP on the post-action
    //    sensor reading — STDP strengthens pre→teacher_action synapses.
    //    Sensor input is re-sampled because the agent has moved.
    if (learn) {
      const teacherInput = encodeSensorInput(env);
      const teacher = teacherSignal(env);
      net.reinforce(teacherInput, teacher);
    }

    if (!reachedGoal && atGoal(env)) {
      reachedGoal = true;
      goalTick = tick;
      break;
    }
  }

  let pathLength = 0;
  for (let i = 1; i < path.length; i++) {
    const dx = path[i].x - path[i - 1].x;
    const dy = path[i].y - path[i - 1].y;
    pathLength += Math.sqrt(dx * dx + dy * dy);
  }
  const manhattanDist =
    Math.abs(env.goal.x - startPos.x) + Math.abs(env.goal.y - startPos.y);

  // Path efficiency, paper-2 §5.4 definition: manhattan / actual_path,
  // but ONLY if the goal was reached. If not reached, we report 0 — a
  // shorter wandering path that never converges to the goal is NOT a more
  // efficient navigator. (Without this guard the agent can game the metric
  // by getting stuck against a wall and recording an artificially short
  // path; see audit comment in the harness file.)
  const pathEfficiency =
    reachedGoal && pathLength > 0
      ? Math.min(1, manhattanDist / pathLength)
      : 0;

  return {
    pathLength,
    manhattanDist,
    pathEfficiency,
    reachedGoal,
    goalTick,
    totalPostSpikes,
    ticks: path.length - 1,
  };
}

// ── The Experiment ─────────────────────────────────────────────────────────

describe('Paper #2 Benchmark: STDP-Learned SNN Navigation', () => {
  it('STDP training improves path efficiency past the 20% reactive baseline', () => {
    const TRAIN_EPISODES = 8;
    const EVAL_EPISODES = 3;
    const MAX_TICKS = 200;

    const tStart = performance.now();
    const log: string[] = [];

    const baselineNet = new STDPNet({
      preCount: PRE_COUNT,
      postCount: POST_COUNT,
      learningRate: 0.02,
      ltdRatio: 0.5,
      weightSeed: 42,
    });
    const baselineWeights0 = new Float32Array(baselineNet.weights);

    let baselineEffSum = 0;
    let baselineGoalReached = 0;
    for (let ep = 0; ep < EVAL_EPISODES; ep++) {
      const env = createRoom();
      const r = runEpisode(baselineNet, false, MAX_TICKS, env);
      baselineEffSum += r.pathEfficiency;
      if (r.reachedGoal) baselineGoalReached++;
      log.push(
        `[baseline ep ${ep}] reached=${r.reachedGoal} ticks=${r.ticks} ` +
        `path=${r.pathLength.toFixed(2)} eff=${(r.pathEfficiency * 100).toFixed(1)}%`,
      );
    }
    const baselineEff = baselineEffSum / EVAL_EPISODES;

    // Confirm baseline weights stayed exactly identical (no learning).
    let baselineDrift = 0;
    for (let i = 0; i < baselineWeights0.length; i++) {
      if (Math.abs(baselineWeights0[i] - baselineNet.weights[i]) > 1e-9) {
        baselineDrift++;
      }
    }

    // ── Train ───────────────────────────────────────────────────────────────
    const trainedNet = new STDPNet({
      preCount: PRE_COUNT,
      postCount: POST_COUNT,
      learningRate: 0.02,
      ltdRatio: 0.5,
      weightSeed: 42, // identical init to baseline → fair comparison
    });
    const trainedWeights0 = new Float32Array(trainedNet.weights);

    for (let ep = 0; ep < TRAIN_EPISODES; ep++) {
      const env = createRoom();
      const r = runEpisode(trainedNet, true, MAX_TICKS, env);
      log.push(
        `[train ep ${ep}] reached=${r.reachedGoal} ticks=${r.ticks} ` +
        `eff=${(r.pathEfficiency * 100).toFixed(1)}% spikes=${r.totalPostSpikes}`,
      );
    }
    const trainedWeightStats = trainedNet.weightStats();

    // Count weights that changed (sanity: STDP did fire).
    let weightsChanged = 0;
    let weightDeltaMax = 0;
    for (let i = 0; i < trainedWeights0.length; i++) {
      const diff = Math.abs(trainedWeights0[i] - trainedNet.weights[i]);
      if (diff > 1e-6) weightsChanged++;
      if (diff > weightDeltaMax) weightDeltaMax = diff;
    }

    // ── Evaluate trained (frozen weights, no teacher) ──────────────────────
    let trainedEffSum = 0;
    let trainedGoalReached = 0;
    for (let ep = 0; ep < EVAL_EPISODES; ep++) {
      const env = createRoom();
      const r = runEpisode(trainedNet, false, MAX_TICKS, env);
      trainedEffSum += r.pathEfficiency;
      if (r.reachedGoal) trainedGoalReached++;
      log.push(
        `[trained eval ep ${ep}] reached=${r.reachedGoal} ticks=${r.ticks} ` +
        `path=${r.pathLength.toFixed(2)} eff=${(r.pathEfficiency * 100).toFixed(1)}%`,
      );
    }
    const trainedEff = trainedEffSum / EVAL_EPISODES;
    const improvement = trainedEff - baselineEff;
    const wallMs = performance.now() - tStart;

    // ── Print results ───────────────────────────────────────────────────────
    console.log('\n[stdp-nav-experiment] === STDP NAVIGATION RESULTS ===');
    for (const line of log) console.log('[stdp-nav-experiment]   ' + line);
    console.log('[stdp-nav-experiment]');
    console.log(
      `[stdp-nav-experiment] Baseline mean efficiency:  ${(baselineEff * 100).toFixed(1)}% ` +
      `(${baselineGoalReached}/${EVAL_EPISODES} reached goal)`,
    );
    console.log(
      `[stdp-nav-experiment] Trained mean efficiency:   ${(trainedEff * 100).toFixed(1)}% ` +
      `(${trainedGoalReached}/${EVAL_EPISODES} reached goal)`,
    );
    console.log(
      `[stdp-nav-experiment] Improvement:               ${(improvement * 100).toFixed(1)} pp`,
    );
    console.log(
      `[stdp-nav-experiment] Weights changed by STDP:   ` +
      `${weightsChanged}/${trainedWeights0.length}, max |Δw|=${weightDeltaMax.toFixed(4)}`,
    );
    console.log(
      `[stdp-nav-experiment] Trained weight stats:      ` +
      `mean=${trainedWeightStats.mean.toFixed(3)} ` +
      `min=${trainedWeightStats.min.toFixed(3)} ` +
      `max=${trainedWeightStats.max.toFixed(3)} ` +
      `nonzero=${trainedWeightStats.nonzero}/${trainedWeights0.length}`,
    );
    console.log(`[stdp-nav-experiment] Baseline weight drift:     ${baselineDrift} (must be 0)`);
    console.log(`[stdp-nav-experiment] Wall time:                 ${wallMs.toFixed(0)} ms`);

    // ── LaTeX table for the paper ──────────────────────────────────────────
    console.log('\n% ── LaTeX: STDP Navigation Experiment (Paper #2) ──');
    console.log('\\begin{table}[h]\\centering');
    console.log('\\caption{STDP learning improves path efficiency past the 20\\% reactive baseline (Section~5.4). 64 LIF pre-neurons $\\to$ 4 action neurons; soft-bounded Hebbian STDP; CPU reference (deterministic).}');
    console.log('\\label{tab:stdp-nav-experiment}');
    console.log('\\begin{tabular}{lr}');
    console.log('\\toprule');
    console.log('Metric & Value \\\\');
    console.log('\\midrule');
    console.log(`Training episodes & ${TRAIN_EPISODES} \\\\`);
    console.log(`Evaluation episodes (each phase) & ${EVAL_EPISODES} \\\\`);
    console.log(`Baseline path efficiency (random weights) & ${(baselineEff * 100).toFixed(1)}\\% \\\\`);
    console.log(`Trained path efficiency (post-STDP, frozen) & ${(trainedEff * 100).toFixed(1)}\\% \\\\`);
    console.log(`Improvement & ${(improvement * 100).toFixed(1)} pp \\\\`);
    console.log(`Plastic synapses updated & ${weightsChanged} / ${trainedWeights0.length} \\\\`);
    console.log(`Max $|\\Delta w|$ across training & ${weightDeltaMax.toFixed(4)} \\\\`);
    console.log(`Wall time (train+eval) & ${wallMs.toFixed(0)} ms \\\\`);
    console.log('\\bottomrule');
    console.log('\\end{tabular}\\end{table}');

    // ── Assertions ──────────────────────────────────────────────────────────
    // Baseline weights MUST NOT have drifted (sanity that learn=false really
    // disables STDP, mirroring the WGSL learning_rate=0 short-circuit).
    expect(baselineDrift).toBe(0);
    // STDP must have actually run during training.
    expect(weightsChanged).toBeGreaterThan(0);
    expect(weightDeltaMax).toBeGreaterThan(0);
    // Headline claim: STDP-trained network strictly outperforms the random
    // baseline. (Baseline efficiency may be 0 — random weights typically
    // cannot reach the goal at all under the strict reached-goal-required
    // metric — which is itself a clean negative-control: improvement is
    // attributable to STDP, not to any prior in the architecture.)
    expect(trainedEff).toBeGreaterThan(baselineEff);
    // Public-facing claim cited in paper-2 §5.4: efficiency past 20%.
    expect(trainedEff).toBeGreaterThan(0.20);
    // And the trained agent must actually reach the goal in eval (no
    // efficiency-by-getting-stuck loophole — already enforced by the
    // metric, asserted here for clarity).
    expect(trainedGoalReached).toBeGreaterThan(0);
  }, 60_000);
});
