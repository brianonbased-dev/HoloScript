/**
 * Paper #2 Benchmark: SNN Agent Navigation Experiment
 *
 * An SNN agent navigates a 2D room with obstacles using:
 * - 8 distance sensors (ray-cast to walls/obstacles) → spike-encoded input
 * - 128-neuron LIF SNN for cognition (via SNNCognitionEngine)
 * - 4 movement actions (N/S/E/W) selected by spike population decoding
 * - Full CAEL trace recording at every timestep
 *
 * Metrics for Paper #2 (NeurIPS):
 * - Task success rate (goal reached?)
 * - Time-to-goal (ticks)
 * - Path efficiency (Manhattan distance / path length)
 * - CAEL trace size (bytes, entries)
 * - Per-tick timing (perception + cognition + action + record)
 * - Spike statistics (firing rate, population activity)
 */

import { describe, it, expect } from 'vitest';
import { resolveIngestPath, runPaperHarnessIngestProbe } from '@holoscript/holomap';
import { SNNCognitionEngine } from '../SNNCognitionEngine';
import type {
  CAELSensorBridge,
  CAELActionSelector,
  CAELActionMapper,
  SensorReading,
  CognitionSnapshot,
  ActionDecision,
  AgentAction,
  WorldDelta,
} from '../CAELAgent';
import type { SimSolver, FieldData } from '../SimSolver';

// ── 2D Navigation Environment ───────────────────────────────────────────────

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

/** Cast 8 rays from agent position, return normalized distances [0,1] */
function castSensorRays(env: NavEnvironment): Float32Array {
  const distances = new Float32Array(8);
  const maxDist = Math.sqrt(env.width ** 2 + env.height ** 2);
  const angles = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (5 * Math.PI) / 4, (3 * Math.PI) / 2, (7 * Math.PI) / 4];

  for (let i = 0; i < 8; i++) {
    const dx = Math.cos(angles[i]);
    const dy = Math.sin(angles[i]);
    let minDist = maxDist;

    // Check walls
    if (dx > 0) minDist = Math.min(minDist, (env.width - env.agentPos.x) / dx);
    if (dx < 0) minDist = Math.min(minDist, -env.agentPos.x / dx);
    if (dy > 0) minDist = Math.min(minDist, (env.height - env.agentPos.y) / dy);
    if (dy < 0) minDist = Math.min(minDist, -env.agentPos.y / dy);

    // Check obstacles (ray-sphere intersection)
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

/** Distance and angle to goal, normalized */
function goalVector(env: NavEnvironment): { dist: number; angle: number } {
  const dx = env.goal.x - env.agentPos.x;
  const dy = env.goal.y - env.agentPos.y;
  const maxDist = Math.sqrt(env.width ** 2 + env.height ** 2);
  return {
    dist: Math.sqrt(dx * dx + dy * dy) / maxDist,
    angle: Math.atan2(dy, dx),
  };
}

function moveAgent(env: NavEnvironment, action: string, stepSize: number = 0.5): boolean {
  let nx = env.agentPos.x;
  let ny = env.agentPos.y;

  switch (action) {
    case 'move_east': nx += stepSize; break;
    case 'move_west': nx -= stepSize; break;
    case 'move_north': ny += stepSize; break;
    case 'move_south': ny -= stepSize; break;
    default: return false;
  }

  // Wall collision
  nx = Math.max(env.agentRadius, Math.min(env.width - env.agentRadius, nx));
  ny = Math.max(env.agentRadius, Math.min(env.height - env.agentRadius, ny));

  // Obstacle collision
  for (const obs of env.obstacles) {
    const dx = nx - obs.pos[0];
    const dy = ny - obs.pos[1];
    const dist = Math.sqrt(dx * dx + dy * dy);
    const minDist = obs.radius + env.agentRadius;
    if (dist < minDist) {
      // Push out
      const pushDist = minDist - dist;
      nx += (dx / dist) * pushDist;
      ny += (dy / dist) * pushDist;
    }
  }

  env.agentPos = { x: nx, y: ny };
  return true;
}

function atGoal(env: NavEnvironment, threshold: number = 1.0): boolean {
  const dx = env.goal.x - env.agentPos.x;
  const dy = env.goal.y - env.agentPos.y;
  return Math.sqrt(dx * dx + dy * dy) < threshold;
}

// ── Minimal SimSolver stub for CAEL compatibility ──────────────────────────

class NavSimSolver implements SimSolver {
  private env: NavEnvironment;
  private sensorField: Float32Array = new Float32Array(10);
  solverType = 'navigation' as const;

  constructor(env: NavEnvironment) { this.env = env; }

  step(_dt: number): void {
    // Update sensor field from environment state
    const rays = castSensorRays(this.env);
    const gv = goalVector(this.env);
    this.sensorField = new Float32Array([...rays, gv.dist, (gv.angle / Math.PI + 1) / 2]);
  }

  getField(name: string): FieldData | null {
    if (name === 'nav_sensors') return this.sensorField;
    return null;
  }

  getNodeCount(): number { return 10; }
  getDOFCount(): number { return 10; }
}

// ── CAEL-compatible sensor bridge for navigation ───────────────────────────

class NavSensorBridge implements CAELSensorBridge {
  readonly id = 'nav-sensor-bridge';
  readonly fieldNames = ['nav_sensors'] as const;
  private env: NavEnvironment;

  constructor(env: NavEnvironment) { this.env = env; }

  sample(solver: SimSolver, simTime: number): SensorReading[] {
    solver.getField('nav_sensors'); // trigger solver update

    // Build 128-neuron input current array matching population layout:
    // neurons 0-31: N population, 32-63: E, 64-95: S, 96-127: W
    const rays = castSensorRays(this.env);
    const gv = goalVector(this.env);
    const values = new Float32Array(128);

    // Ray mapping to directions:
    // ray 0=E, 1=NE, 2=N, 3=NW, 4=W, 5=SW, 6=S, 7=SE
    // Population: N=0, E=1, S=2, W=3
    const rayToDir = [
      [1],       // ray 0 (E) → excites E pop
      [0, 1],    // ray 1 (NE) → excites N, E
      [0],       // ray 2 (N) → excites N pop
      [0, 3],    // ray 3 (NW) → excites N, W
      [3],       // ray 4 (W) → excites W pop
      [2, 3],    // ray 5 (SW) → excites S, W
      [2],       // ray 6 (S) → excites S pop
      [1, 2],    // ray 7 (SE) → excites E, S
    ];

    // Obstacle avoidance: CLOSE obstacles INHIBIT that direction
    // Open space EXCITES that direction
    for (let r = 0; r < 8; r++) {
      const openness = rays[r]; // 0 = wall right here, 1 = far away
      for (const dir of rayToDir[r]) {
        const popStart = dir * 32;
        // Open → excite (positive current), blocked → inhibit (near-zero current)
        for (let n = popStart; n < popStart + 32; n++) {
          values[n] += openness * 0.3; // moderate excitation from open space
        }
      }
    }

    // Goal attraction: STRONGLY excite the population closest to goal direction
    // N=+y (π/2), E=+x (0), S=-y (-π/2), W=-x (π)
    const goalStrength = 0.8 * (1 - gv.dist * 0.5); // stronger when closer
    const dirAngles = [Math.PI / 2, 0, -Math.PI / 2, Math.PI]; // N, E, S, W

    for (let dir = 0; dir < 4; dir++) {
      // Cosine similarity between goal angle and direction angle
      let angleDiff = Math.abs(gv.angle - dirAngles[dir]);
      if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff;
      const alignment = Math.max(0, Math.cos(angleDiff)); // 1 = perfect, 0 = orthogonal

      const popStart = dir * 32;
      for (let n = popStart; n < popStart + 32; n++) {
        values[n] += alignment * goalStrength;
      }
    }

    // Normalize to [0, 1]
    let maxVal = 0;
    for (let i = 0; i < 128; i++) if (values[i] > maxVal) maxVal = values[i];
    if (maxVal > 0) for (let i = 0; i < 128; i++) values[i] /= maxVal;

    return [{
      fieldName: 'nav_sensors',
      simTime,
      values,
    }];
  }

  encode(readings: SensorReading[]): Record<string, unknown> {
    return {
      id: this.id,
      readings: readings.map(r => ({
        fieldName: r.fieldName,
        simTime: r.simTime,
        values: Array.from(r.values).map(v => Number(v.toFixed(4))),
      })),
    };
  }
}

// ── Navigation action selector using spike population decoding ─────────────

class NavActionSelector implements CAELActionSelector {
  readonly id = 'nav-spike-decoder';
  private readonly actions = ['move_north', 'move_east', 'move_south', 'move_west'];

  select(cognition: CognitionSnapshot, _simTime: number): ActionDecision {
    // Decode spike populations: neurons 0-31→N, 32-63→E, 64-95→S, 96-127→W
    const popSize = 32;
    const popCounts = [0, 0, 0, 0];

    for (const spike of cognition.spikes) {
      const pop = Math.min(3, Math.floor(spike.neuronIndex / popSize));
      popCounts[pop]++;
    }

    // Pure spike-population decoding — the sensor bridge already encoded
    // goal direction and obstacle avoidance into asymmetric input currents.
    // The SNN's differential firing rates ARE the decision.
    const utilities = popCounts.map(c => c);
    const actions: AgentAction[] = this.actions.map((type, i) => ({
      type,
      params: {},
      utility: utilities[i],
    }));

    actions.sort((a, b) => (b.utility ?? 0) - (a.utility ?? 0));

    return {
      chosen: actions[0],
      alternatives: actions.slice(1),
      reason: `spike_pop=[${popCounts.join(',')}]`,
    };
  }

  encode(decision: ActionDecision): Record<string, unknown> {
    return {
      id: this.id,
      chosen: decision.chosen,
      alternatives: decision.alternatives,
      reason: decision.reason,
    };
  }
}

// ── Navigation action mapper ───────────────────────────────────────────────

class NavActionMapper implements CAELActionMapper {
  readonly id = 'nav-action-mapper';
  private env: NavEnvironment;
  private stepSize: number;

  constructor(env: NavEnvironment, stepSize: number = 0.5) { this.env = env; this.stepSize = stepSize; }

  apply(action: AgentAction, _solver: SimSolver, _simTime: number): WorldDelta {
    const before = `${this.env.agentPos.x.toFixed(3)},${this.env.agentPos.y.toFixed(3)}`;
    moveAgent(this.env, action.type, this.stepSize);
    const after = `${this.env.agentPos.x.toFixed(3)},${this.env.agentPos.y.toFixed(3)}`;

    return {
      type: 'custom',
      description: `Agent ${action.type}: (${before}) → (${after})`,
      details: {
        action: action.type,
        positionBefore: before,
        positionAfter: after,
        atGoal: atGoal(this.env),
      },
      hashBefore: before,
      hashAfter: after,
    };
  }

  encode(delta: WorldDelta): Record<string, unknown> {
    return { id: this.id, ...delta };
  }
}

// ── FNV-1a hash for trace verification ─────────────────────────────────────

function fnv1a(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

// ── The Experiment ─────────────────────────────────────────────────────────

describe('Paper #2 Benchmark: SNN Navigation Experiment', () => {
  it('SNN agent navigates obstacle room with CAEL trace — 200 ticks', async () => {
    const TOTAL_TICKS = 200;
    const DT = 0.05; // 50ms per tick → 10s total simulation
    const ingestPath = resolveIngestPath(process);

    // Setup environment
    const env = createRoom();
    const solver = new NavSimSolver(env);

    // Setup SNN cognition (128 neurons, CPU fallback in CI)
    const cognition = new SNNCognitionEngine({
      id: 'nav-snn-128',
      neuronCount: 128,
      inputScalemV: 15, // moderate sensitivity
      stepsPerTick: 10,  // 10 LIF steps per agent tick
    });

    const sensor = new NavSensorBridge(env);
    const actionSelector = new NavActionSelector();
    const actionMapper = new NavActionMapper(env, 0.8); // larger step for coverage

    // CAEL trace (manual recording since we're not using full ContractedSimulation)
    const trace: Array<{
      tick: number;
      type: string;
      data: Record<string, unknown>;
      hash: number;
    }> = [];
    let prevHash = 0;

    function record(tick: number, type: string, data: Record<string, unknown>) {
      const payload = JSON.stringify({ tick, type, data });
      const hash = fnv1a(prevHash.toString() + payload);
      trace.push({ tick, type, data, hash });
      prevHash = hash;
    }

    // Metrics
    const tickTimings: number[] = [];
    let totalSpikes = 0;
    let goalReached = false;
    let goalTick = -1;
    const path: Vec2[] = [{ ...env.agentPos }];

    // Run experiment
    console.log('\n[nav-experiment] === SNN Navigation Experiment ===');
    console.log(
      `[nav-experiment] Scene ingest: ${ingestPath} (set HOLOSCRIPT_INGEST_PATH or --ingest-path=)`,
    );
    console.log(`[nav-experiment] Room: ${env.width}x${env.height}, ${env.obstacles.length} obstacles`);
    console.log(`[nav-experiment] Start: (${env.agentPos.x}, ${env.agentPos.y}), Goal: (${env.goal.x}, ${env.goal.y})`);
    console.log(`[nav-experiment] SNN: 128 LIF neurons, 10 steps/tick, CPU reference`);
    console.log('');

    for (let tick = 0; tick < TOTAL_TICKS; tick++) {
      const tickStart = performance.now();

      // 1. PERCEPTION: update solver, read sensors
      solver.step(DT);
      const readings = sensor.sample(solver, tick * DT);
      record(tick, 'perception', sensor.encode(readings));

      // 2. COGNITION: SNN processes sensor input
      // Goal direction is already encoded into asymmetric input currents
      // by NavSensorBridge — the SNN's differential firing IS the decision
      const snapshot = await cognition.think(readings, DT);
      record(tick, 'cognition', cognition.encode(snapshot));
      totalSpikes += snapshot.spikeCount;

      // 3. ACTION SELECTION: decode spike populations
      const decision = actionSelector.select(snapshot, tick * DT);
      record(tick, 'action', actionSelector.encode(decision));

      // 4. WORLD DELTA: move agent
      const delta = actionMapper.apply(decision.chosen, solver, tick * DT);
      record(tick, 'world_delta', actionMapper.encode(delta));

      path.push({ ...env.agentPos });

      const tickEnd = performance.now();
      tickTimings.push(tickEnd - tickStart);

      // Check goal
      if (!goalReached && atGoal(env)) {
        goalReached = true;
        goalTick = tick;
      }

      // Progress every 50 ticks
      if ((tick + 1) % 50 === 0) {
        const pos = env.agentPos;
        const dist = Math.sqrt((env.goal.x - pos.x) ** 2 + (env.goal.y - pos.y) ** 2);
        console.log(`[nav-experiment] Tick ${tick + 1}: pos=(${pos.x.toFixed(1)}, ${pos.y.toFixed(1)}) dist=${dist.toFixed(1)} spikes=${totalSpikes} ${goalReached ? 'GOAL!' : ''}`);
      }
    }

    // ── Compute Metrics ──────────────────────────────────────────────────────

    const traceJSONL = trace.map(e => JSON.stringify(e)).join('\n');
    const traceBytes = new TextEncoder().encode(traceJSONL).length;
    const traceEntries = trace.length;

    const totalPathLength = path.reduce((sum, p, i) => {
      if (i === 0) return 0;
      const dx = p.x - path[i - 1].x;
      const dy = p.y - path[i - 1].y;
      return sum + Math.sqrt(dx * dx + dy * dy);
    }, 0);

    const manhattanDist = Math.abs(env.goal.x - path[0].x) + Math.abs(env.goal.y - path[0].y);
    const pathEfficiency = totalPathLength > 0 ? manhattanDist / totalPathLength : 0;

    const avgTickMs = tickTimings.reduce((a, b) => a + b, 0) / tickTimings.length;
    const medianTickMs = [...tickTimings].sort((a, b) => a - b)[Math.floor(tickTimings.length / 2)];
    const p95TickMs = [...tickTimings].sort((a, b) => a - b)[Math.floor(tickTimings.length * 0.95)];

    const avgFiringRate = totalSpikes / (128 * TOTAL_TICKS * 10); // spikes per neuron per LIF step

    // Verify hash chain integrity
    let verifyHash = 0;
    let chainValid = true;
    for (const entry of trace) {
      const payload = JSON.stringify({ tick: entry.tick, type: entry.type, data: entry.data });
      const expected = fnv1a(verifyHash.toString() + payload);
      if (expected !== entry.hash) { chainValid = false; break; }
      verifyHash = expected;
    }

    // ── Print Results ────────────────────────────────────────────────────────

    console.log('\n[nav-experiment] === RESULTS ===');
    console.log(`[nav-experiment] Goal reached: ${goalReached} ${goalReached ? `(tick ${goalTick})` : '(not reached)'}`);
    console.log(`[nav-experiment] Final position: (${env.agentPos.x.toFixed(2)}, ${env.agentPos.y.toFixed(2)})`);
    console.log(`[nav-experiment] Final distance to goal: ${Math.sqrt((env.goal.x - env.agentPos.x) ** 2 + (env.goal.y - env.agentPos.y) ** 2).toFixed(2)}`);
    console.log(`[nav-experiment] Path length: ${totalPathLength.toFixed(2)} (Manhattan optimal: ${manhattanDist.toFixed(2)})`);
    console.log(`[nav-experiment] Path efficiency: ${(pathEfficiency * 100).toFixed(1)}%`);
    console.log('');
    console.log(`[nav-experiment] Total spikes: ${totalSpikes}`);
    console.log(`[nav-experiment] Avg firing rate: ${(avgFiringRate * 100).toFixed(2)}% per neuron per step`);
    console.log('');
    console.log(`[nav-experiment] Tick timing: mean=${avgTickMs.toFixed(2)}ms median=${medianTickMs.toFixed(2)}ms p95=${p95TickMs.toFixed(2)}ms`);
    console.log(`[nav-experiment] Total wall time: ${tickTimings.reduce((a, b) => a + b, 0).toFixed(0)}ms for ${TOTAL_TICKS} ticks`);
    console.log('');
    console.log(`[nav-experiment] CAEL trace: ${traceEntries} entries, ${(traceBytes / 1024).toFixed(1)} KB`);
    console.log(`[nav-experiment] Hash chain valid: ${chainValid}`);
    console.log(`[nav-experiment] Bytes/entry: ${(traceBytes / traceEntries).toFixed(0)}`);

    const ingestProbe = await runPaperHarnessIngestProbe({
      paperId: 'paper-2-snn-navigation',
      ingestPath,
    });
    console.log('\n[nav-experiment] === Scene ingest probe (attach for reviewers) ===\n');
    console.log(ingestProbe.reportMarkdown);

    // ── LaTeX Table ──────────────────────────────────────────────────────────

    console.log('\n% ── LaTeX: SNN Navigation Experiment (Paper #2) ──');
    console.log('\\begin{table}[h]');
    console.log('\\centering');
    console.log('\\caption{SNN navigation experiment: 128 LIF neurons, 200 ticks, 6 obstacles.}');
    console.log('\\label{tab:nav-experiment}');
    console.log('\\begin{tabular}{lr}');
    console.log('\\toprule');
    console.log('Metric & Value \\\\');
    console.log('\\midrule');
    console.log(`Goal reached & ${goalReached ? `Yes (tick ${goalTick})` : 'No'} \\\\`);
    console.log(`Path length & ${totalPathLength.toFixed(2)} \\\\`);
    console.log(`Path efficiency & ${(pathEfficiency * 100).toFixed(1)}\\% \\\\`);
    console.log(`Total spikes & ${totalSpikes.toLocaleString()} \\\\`);
    console.log(`Firing rate & ${(avgFiringRate * 100).toFixed(2)}\\% \\\\`);
    console.log(`Mean tick time & ${avgTickMs.toFixed(2)} ms \\\\`);
    console.log(`Median tick time & ${medianTickMs.toFixed(2)} ms \\\\`);
    console.log(`P95 tick time & ${p95TickMs.toFixed(2)} ms \\\\`);
    console.log(`CAEL entries & ${traceEntries} \\\\`);
    console.log(`CAEL trace size & ${(traceBytes / 1024).toFixed(1)} KB \\\\`);
    console.log(`Hash chain valid & ${chainValid ? 'Yes' : 'No'} \\\\`);
    console.log('\\bottomrule');
    console.log('\\end{tabular}');
    console.log('\\end{table}');

    // ── Assertions ───────────────────────────────────────────────────────────

    expect(chainValid).toBe(true);
    expect(traceEntries).toBe(TOTAL_TICKS * 4); // 4 entries per tick
    expect(totalSpikes).toBeGreaterThan(0);
    expect(avgTickMs).toBeLessThan(50); // must run at >20Hz
    expect(traceBytes).toBeGreaterThan(0);
  }, 60_000);
});
