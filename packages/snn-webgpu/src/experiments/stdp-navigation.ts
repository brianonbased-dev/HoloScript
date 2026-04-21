/**
 * STDP Navigation Task — Paper 2 (SNN NeurIPS)
 *
 * Grid-world navigation experiment where a spiking neural network
 * learns to improve path efficiency via Spike-Timing-Dependent Plasticity (STDP).
 *
 * Architecture:
 *   - Input layer: GRID_SIZE² place-cell neurons (one neuron per grid cell)
 *   - Output layer: 4 action neurons (up, down, right, left)
 *   - Connection: input → output with optional STDP
 *
 * Learning mechanism:
 *   - Each step the agent selects an action by reading argmax of output spikes
 *   - When STDP is enabled, a supervised signal injects a strong post-synaptic
 *     current onto the "correct" action neuron (greedy towards goal), driving
 *     Hebbian co-firing and thus STDP weight updates on the input → action path.
 *
 * Metrics:
 *   - pathEfficiency = optimalPathLength / actualPathLength (capped at 1.0)
 *   - Baseline (random weights, no learning): typically ~10–25% efficiency
 *   - After STDP training: measurably higher (see paper-2-snn-neurips.tex §5.4)
 */

import { GPUContext } from '../gpu-context.js';
import { SNNNetwork } from '../snn-network.js';
import type { NetworkConfig } from '../types.js';

// ── Constants ─────────────────────────────────────────────────────────────

export const GRID_SIZE = 8;

/** Actions indexed 0–3. */
export const ACTIONS: readonly [number, number][] = [
  [0, 1], // 0: up (y+1)
  [0, -1], // 1: down (y-1)
  [1, 0], // 2: right (x+1)
  [-1, 0], // 3: left (x-1)
] as const;

export const ACTION_NAMES = ['up', 'down', 'right', 'left'] as const;

// ── Types ─────────────────────────────────────────────────────────────────

export interface GridWorld {
  /** Side length of the square grid. */
  size: number;
  /** Starting position [x, y]. */
  start: [number, number];
  /** Goal position [x, y]. */
  goal: [number, number];
  /** Blocked cells stored as "x,y" strings. */
  obstacles: Set<string>;
}

export interface NavigationResult {
  /** Number of steps taken in this episode. */
  pathLength: number;
  /** BFS-optimal path length (Manhattan distance when no obstacles). */
  optimalPathLength: number;
  /** optimalPathLength / pathLength, clamped to [0, 1]. */
  pathEfficiency: number;
  /** Whether the agent reached the goal within maxSteps. */
  reachedGoal: boolean;
}

export interface TrainingStats {
  trainingEpisodes: number;
  baselineEfficiency: number;
  postTrainingEfficiency: number;
  /** post − baseline; positive means learning improved navigation. */
  improvement: number;
}

// ── BFS helper ────────────────────────────────────────────────────────────

/**
 * Computes shortest path length from start to goal via BFS.
 * Returns -1 if the goal is unreachable (blocked by obstacles).
 */
export function bfsPathLength(
  world: GridWorld,
  start: [number, number],
  goal: [number, number]
): number {
  const { size } = world;
  if (start[0] === goal[0] && start[1] === goal[1]) return 0;

  const visited = new Set<string>();
  const queue: Array<[[number, number], number]> = [[start, 0]];
  visited.add(`${start[0]},${start[1]}`);

  while (queue.length > 0) {
    const [[x, y], dist] = queue.shift()!;
    for (const [dx, dy] of ACTIONS) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= size || ny >= size) continue;
      const key = `${nx},${ny}`;
      if (world.obstacles.has(key) || visited.has(key)) continue;
      if (nx === goal[0] && ny === goal[1]) return dist + 1;
      visited.add(key);
      queue.push([[nx, ny], dist + 1]);
    }
  }

  return -1; // unreachable
}

// ── Encoding helpers ──────────────────────────────────────────────────────

/**
 * Encodes grid position (x, y) as a place-cell spike array.
 * One hot: the neuron at index (y * gridSize + x) fires.
 */
function encodePosition(x: number, y: number, gridSize: number): Float32Array {
  const spikes = new Float32Array(gridSize * gridSize);
  const idx = y * gridSize + x;
  if (idx >= 0 && idx < spikes.length) {
    spikes[idx] = 1.0;
  }
  return spikes;
}

/**
 * Greedy action toward goal: move along the axis with greater remaining distance.
 * Returns action index 0–3.
 */
function greedyAction(x: number, y: number, gx: number, gy: number): number {
  const dx = gx - x;
  const dy = gy - y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx > 0 ? 2 : 3; // right or left
  }
  return dy > 0 ? 0 : 1; // up or down
}

// ── Navigation agent ──────────────────────────────────────────────────────

/**
 * SNN-based navigation agent.
 *
 * When `stdpEnabled` is true the network's synaptic weights are updated
 * via the `stdp_weight_update` WGSL shader each step.
 */
export class SNNNavigationAgent {
  private network: SNNNetwork;
  private world: GridWorld;
  private simStepsPerAction: number;

  constructor(
    ctx: GPUContext,
    world: GridWorld,
    stdpEnabled: boolean,
    simStepsPerAction = 10
  ) {
    this.world = world;
    this.simStepsPerAction = simStepsPerAction;
    const n = world.size * world.size;

    const config: NetworkConfig = {
      layers: [
        { name: 'place', neuronCount: n },
        { name: 'action', neuronCount: 4 },
      ],
      connections: [
        {
          from: 'place',
          to: 'action',
          weightInit: 'random',
          stdpEnabled,
          learningRate: stdpEnabled ? 0.02 : 0.0,
        },
      ],
      dt: 1.0,
    };

    this.network = new SNNNetwork(ctx, config);
  }

  async initialize(): Promise<void> {
    await this.network.initialize();
  }

  /**
   * Select action for position (x, y) by running SNN for `simStepsPerAction` steps.
   * Returns index 0–3 of the output neuron with the highest firing rate.
   */
  async selectAction(x: number, y: number): Promise<number> {
    // Encode current position as place-cell spikes
    const inputSpikes = encodePosition(x, y, this.world.size);
    this.network.setInputSpikes('place', inputSpikes);

    // Clear any residual synaptic input in the action layer
    this.network.setSynapticInput('action', new Float32Array(4));

    await this.network.stepN(this.simStepsPerAction);

    // Read action-layer spikes, pick argmax
    const result = await this.network.readLayerSpikes('action');
    let bestAction = 0;
    let bestVal = -Infinity;
    for (let a = 0; a < 4; a++) {
      if (result.data[a] > bestVal) {
        bestVal = result.data[a];
        bestAction = a;
      }
    }
    return bestAction;
  }

  /**
   * Provide a supervised STDP reinforcement signal at the current position.
   *
   * Injects a suprathreshold synaptic current into the `correctAction` output
   * neuron so it fires reliably during the next step.  When STDP is enabled,
   * the co-activation of the place-cell (pre) and action neuron (post) causes
   * the `stdp_weight_update` shader to strengthen that synapse.
   */
  async reinforceAction(x: number, y: number, correctAction: number): Promise<void> {
    const inputSpikes = encodePosition(x, y, this.world.size);
    this.network.setInputSpikes('place', inputSpikes);

    // Inject a strong depolarisation into the correct action neuron
    const actionCurrent = new Float32Array(4);
    actionCurrent[correctAction] = 80.0; // well above threshold (−55 mV)
    this.network.setSynapticInput('action', actionCurrent);

    // One step: place cells fire (pre) + action neuron fires (post) → STDP LTP
    await this.network.step();
  }

  /**
   * Run one navigation episode.
   *
   * @param learn - When true, supervised STDP reinforcement is applied each step.
   * @param maxSteps - Episode horizon (default 50).
   */
  async runEpisode(learn = false, maxSteps = 50): Promise<NavigationResult> {
    let [x, y] = this.world.start;
    const [gx, gy] = this.world.goal;
    const optimalLen = bfsPathLength(this.world, this.world.start, this.world.goal);

    let pathLength = 0;
    let reachedGoal = false;

    this.network.resetState();

    for (let step = 0; step < maxSteps; step++) {
      // Check goal
      if (x === gx && y === gy) {
        reachedGoal = true;
        break;
      }

      // Agent chooses action
      const action = await this.selectAction(x, y);
      const [dx, dy] = ACTIONS[action];
      const nx = Math.max(0, Math.min(this.world.size - 1, x + dx));
      const ny = Math.max(0, Math.min(this.world.size - 1, y + dy));

      // Move if not blocked
      if (!this.world.obstacles.has(`${nx},${ny}`)) {
        x = nx;
        y = ny;
      }
      pathLength++;

      // STDP reinforcement: teach the network the greedy-optimal action
      if (learn) {
        const correctAct = greedyAction(x, y, gx, gy);
        await this.reinforceAction(x, y, correctAct);
      }
    }

    // Final check after loop
    if (x === gx && y === gy) {
      reachedGoal = true;
    }

    // pathEfficiency in (0, 1]: optimal / actual, clamped to 1.0
    const pathEfficiency =
      pathLength > 0 && optimalLen > 0 ? Math.min(1.0, optimalLen / pathLength) : 0;

    return { pathLength, optimalPathLength: optimalLen, pathEfficiency, reachedGoal };
  }

  /**
   * Train the network over N episodes with STDP reinforcement enabled.
   */
  async train(episodes: number): Promise<void> {
    for (let ep = 0; ep < episodes; ep++) {
      await this.runEpisode(true);
    }
  }

  /**
   * Evaluate the trained network over N episodes without further learning.
   * Returns average path efficiency.
   */
  async evaluate(episodes: number): Promise<number> {
    let total = 0;
    for (let ep = 0; ep < episodes; ep++) {
      const result = await this.runEpisode(false);
      total += result.pathEfficiency;
    }
    return total / episodes;
  }

  /**
   * Read the current weight matrix for the place→action connection.
   */
  async readWeights(): Promise<Float32Array> {
    const result = await this.network.readConnectionWeights('place', 'action');
    return result.data;
  }

  destroy(): void {
    this.network.destroy();
  }
}

// ── Grid world factory helpers ────────────────────────────────────────────

/**
 * Standard 8×8 open-field navigation world.
 * Start: top-left (0,0), Goal: bottom-right (7,7).
 */
export function createDefaultWorld(): GridWorld {
  return {
    size: GRID_SIZE,
    start: [0, 0],
    goal: [GRID_SIZE - 1, GRID_SIZE - 1],
    obstacles: new Set(),
  };
}

/**
 * Small 4×4 world for fast unit tests.
 * Start: (0,0), Goal: (3,3).
 */
export function createSmallWorld(): GridWorld {
  return {
    size: 4,
    start: [0, 0],
    goal: [3, 3],
    obstacles: new Set(),
  };
}

/**
 * 4×4 world with a central column obstacle forcing a detour.
 * Obstacle column at x=2 except for a gap at y=2.
 */
export function createObstacleWorld(): GridWorld {
  return {
    size: 4,
    start: [0, 0],
    goal: [3, 3],
    obstacles: new Set(['2,0', '2,1', '2,3']),
  };
}

// ── Full training benchmark ───────────────────────────────────────────────

/**
 * Run the complete STDP navigation benchmark.
 *
 * Trains an SNN with STDP for `trainingEpisodes`, then compares its
 * average efficiency over `evalEpisodes` against an untrained (random)
 * baseline.  Returns {@link TrainingStats}.
 *
 * This is the reference implementation cited in paper-2-snn-neurips.tex §5.4.
 */
export async function runSTDPNavigationBenchmark(
  ctx: GPUContext,
  opts: {
    world?: GridWorld;
    trainingEpisodes?: number;
    evalEpisodes?: number;
    simStepsPerAction?: number;
  } = {}
): Promise<TrainingStats> {
  const world = opts.world ?? createSmallWorld();
  const trainingEpisodes = opts.trainingEpisodes ?? 30;
  const evalEpisodes = opts.evalEpisodes ?? 10;
  const simSteps = opts.simStepsPerAction ?? 10;

  // ── Baseline: no STDP ──────────────────────────────────────────────────
  const baseline = new SNNNavigationAgent(ctx, world, false, simSteps);
  await baseline.initialize();
  const baselineEfficiency = await baseline.evaluate(evalEpisodes);
  baseline.destroy();

  // ── STDP agent: train then evaluate ────────────────────────────────────
  const trained = new SNNNavigationAgent(ctx, world, true, simSteps);
  await trained.initialize();
  await trained.train(trainingEpisodes);
  const postTrainingEfficiency = await trained.evaluate(evalEpisodes);
  trained.destroy();

  return {
    trainingEpisodes,
    baselineEfficiency,
    postTrainingEfficiency,
    improvement: postTrainingEfficiency - baselineEfficiency,
  };
}
