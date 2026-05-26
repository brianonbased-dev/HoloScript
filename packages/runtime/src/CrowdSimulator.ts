/**
 * @holoscript/runtime - CrowdSimulator
 *
 * Consumes the crowd-sim lifecycle emitted by CrowdSimTrait
 * (packages/core/src/traits/CrowdSimTrait.ts) and runs an actual boids
 * integrator. Closes the missing listener side (Pattern E: emit-without-listener)
 * — the trait advertised crowd simulation via flocking weights but emitted
 * `crowd_sim_step` with no integration behind it.
 *
 * Each step applies separation / alignment / cohesion / goal-seeking and
 * integrates agent positions by deltaTime (Reynolds boids). Headless and
 * deterministic so it runs in tests and on a server without a GPU; the GPU
 * spatial-hash path stays in the renderer.
 */

import type { EventBus } from './events.js';

export type Vec3 = [number, number, number];

export interface CrowdAgent {
  position: Vec3;
  velocity: Vec3;
}

export interface CrowdSimCreateEvent {
  nodeId: string;
  maxAgents?: number;
  speed?: number;
  avoidanceRadius?: number;
  goalWeight?: number;
  flocking?: { separation?: number; alignment?: number; cohesion?: number };
}

export interface CrowdSimSpawnEvent {
  nodeId: string;
  count: number;
  position?: Vec3;
  agentCount?: number;
}

export interface CrowdSimGoalEvent {
  nodeId: string;
  groupId?: string;
  position: Vec3;
}

export interface CrowdSimStepEvent {
  nodeId: string;
  deltaTime: number;
  agentCount?: number;
}

interface CrowdSimParams {
  speed: number;
  avoidanceRadius: number;
  perceptionRadius: number;
  goalWeight: number;
  separation: number;
  alignment: number;
  cohesion: number;
}

interface CrowdState {
  agents: CrowdAgent[];
  goal: Vec3 | null;
  params: CrowdSimParams;
  stepCount: number;
}

const DEFAULT_PARAMS: CrowdSimParams = {
  speed: 1.5,
  avoidanceRadius: 1.0,
  perceptionRadius: 3.0,
  goalWeight: 1.0,
  separation: 1.5,
  alignment: 1.0,
  cohesion: 0.8,
};

// --- small vector helpers --------------------------------------------------

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}
function magnitude(v: Vec3): number {
  return Math.hypot(v[0], v[1], v[2]);
}
function clampMagnitude(v: Vec3, max: number): Vec3 {
  const m = magnitude(v);
  if (m <= max || m === 0) return v;
  const s = max / m;
  return [v[0] * s, v[1] * s, v[2] * s];
}

export class CrowdSimulator {
  private readonly bus: EventBus;
  private crowds = new Map<string, CrowdState>();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: { bus: EventBus }) {
    this.bus = options.bus;
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.unsubscribers.push(
      this.bus.on<CrowdSimCreateEvent>('crowd_sim_create', (e) => this.onCreate(e))
    );
    this.unsubscribers.push(
      this.bus.on<CrowdSimSpawnEvent>('crowd_sim_spawn', (e) => this.onSpawn(e))
    );
    this.unsubscribers.push(
      this.bus.on<CrowdSimGoalEvent>('crowd_sim_goal', (e) => this.onGoal(e))
    );
    this.unsubscribers.push(
      this.bus.on<CrowdSimStepEvent>('crowd_sim_step', (e) => this.onStep(e))
    );
    this.unsubscribers.push(
      this.bus.on<{ nodeId: string }>('crowd_sim_clear', (e) => this.clearCrowd(e.nodeId))
    );
    this.unsubscribers.push(
      this.bus.on<{ nodeId: string }>('crowd_sim_destroy', (e) => this.crowds.delete(e.nodeId))
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  private ensure(nodeId: string): CrowdState {
    let s = this.crowds.get(nodeId);
    if (!s) {
      s = { agents: [], goal: null, params: { ...DEFAULT_PARAMS }, stepCount: 0 };
      this.crowds.set(nodeId, s);
    }
    return s;
  }

  private onCreate(e: CrowdSimCreateEvent): void {
    const s = this.ensure(e.nodeId);
    s.params = {
      speed: e.speed ?? DEFAULT_PARAMS.speed,
      avoidanceRadius: e.avoidanceRadius ?? DEFAULT_PARAMS.avoidanceRadius,
      perceptionRadius: Math.max(
        DEFAULT_PARAMS.perceptionRadius,
        (e.avoidanceRadius ?? DEFAULT_PARAMS.avoidanceRadius) * 3
      ),
      goalWeight: e.goalWeight ?? DEFAULT_PARAMS.goalWeight,
      separation: e.flocking?.separation ?? DEFAULT_PARAMS.separation,
      alignment: e.flocking?.alignment ?? DEFAULT_PARAMS.alignment,
      cohesion: e.flocking?.cohesion ?? DEFAULT_PARAMS.cohesion,
    };
  }

  private onSpawn(e: CrowdSimSpawnEvent): void {
    const s = this.ensure(e.nodeId);
    const base: Vec3 = e.position ?? [0, 0, 0];
    for (let k = 0; k < e.count; k++) {
      // Deterministic tight cluster (agents start near-overlapping so that
      // separation has to push them apart — the failing-if-broken signal).
      const offset: Vec3 = [
        ((k % 3) - 1) * 0.03,
        0,
        (Math.floor(k / 3) - 1) * 0.03,
      ];
      s.agents.push({
        position: [base[0] + offset[0], base[1] + offset[1], base[2] + offset[2]],
        velocity: [0, 0, 0],
      });
    }
  }

  private onGoal(e: CrowdSimGoalEvent): void {
    this.ensure(e.nodeId).goal = e.position;
  }

  /** One Reynolds boids integration step for a node's agents. */
  private onStep(e: CrowdSimStepEvent): void {
    const s = this.crowds.get(e.nodeId);
    if (!s || s.agents.length === 0) return;
    const dt = e.deltaTime;
    const p = s.params;
    const agents = s.agents;
    const next: Vec3[] = new Array(agents.length);

    for (let i = 0; i < agents.length; i++) {
      const ai = agents[i];
      const sep: Vec3 = [0, 0, 0];
      const aliSum: Vec3 = [0, 0, 0];
      const cohSum: Vec3 = [0, 0, 0];
      let neighbors = 0;

      for (let j = 0; j < agents.length; j++) {
        if (j === i) continue;
        const aj = agents[j];
        const d = dist(ai.position, aj.position);
        if (d > p.perceptionRadius) continue;
        if (d < p.avoidanceRadius && d > 1e-6) {
          // Push away, stronger the closer the neighbor.
          const w = (p.avoidanceRadius - d) / p.avoidanceRadius / d;
          sep[0] += (ai.position[0] - aj.position[0]) * w;
          sep[1] += (ai.position[1] - aj.position[1]) * w;
          sep[2] += (ai.position[2] - aj.position[2]) * w;
        } else if (d <= 1e-6) {
          // Coincident agents: deterministic tiny nudge so they can separate.
          sep[0] += ((i - j) % 2 === 0 ? 1 : -1) * 0.5;
          sep[2] += ((i + j) % 2 === 0 ? 1 : -1) * 0.5;
        }
        aliSum[0] += aj.velocity[0];
        aliSum[1] += aj.velocity[1];
        aliSum[2] += aj.velocity[2];
        cohSum[0] += aj.position[0];
        cohSum[1] += aj.position[1];
        cohSum[2] += aj.position[2];
        neighbors++;
      }

      const accel: Vec3 = [
        sep[0] * p.separation,
        sep[1] * p.separation,
        sep[2] * p.separation,
      ];

      if (neighbors > 0) {
        // Alignment: match average neighbor velocity.
        accel[0] += (aliSum[0] / neighbors) * p.alignment;
        accel[1] += (aliSum[1] / neighbors) * p.alignment;
        accel[2] += (aliSum[2] / neighbors) * p.alignment;
        // Cohesion: steer toward neighbor centroid.
        accel[0] += (cohSum[0] / neighbors - ai.position[0]) * p.cohesion;
        accel[1] += (cohSum[1] / neighbors - ai.position[1]) * p.cohesion;
        accel[2] += (cohSum[2] / neighbors - ai.position[2]) * p.cohesion;
      }

      if (s.goal) {
        const gx = s.goal[0] - ai.position[0];
        const gy = s.goal[1] - ai.position[1];
        const gz = s.goal[2] - ai.position[2];
        const gm = Math.hypot(gx, gy, gz) || 1;
        accel[0] += (gx / gm) * p.goalWeight;
        accel[1] += (gy / gm) * p.goalWeight;
        accel[2] += (gz / gm) * p.goalWeight;
      }

      let v: Vec3 = [
        ai.velocity[0] + accel[0] * dt,
        ai.velocity[1] + accel[1] * dt,
        ai.velocity[2] + accel[2] * dt,
      ];
      v = clampMagnitude(v, p.speed);
      ai.velocity = v;
      next[i] = [
        ai.position[0] + v[0] * dt,
        ai.position[1] + v[1] * dt,
        ai.position[2] + v[2] * dt,
      ];
    }

    for (let i = 0; i < agents.length; i++) agents[i].position = next[i];
    s.stepCount++;
  }

  private clearCrowd(nodeId: string): void {
    const s = this.crowds.get(nodeId);
    if (s) {
      s.agents = [];
      s.goal = null;
    }
  }

  // --- query API -----------------------------------------------------------

  getAgents(nodeId: string): CrowdAgent[] {
    return this.crowds.get(nodeId)?.agents ?? [];
  }

  agentCount(nodeId: string): number {
    return this.crowds.get(nodeId)?.agents.length ?? 0;
  }

  stepCount(nodeId: string): number {
    return this.crowds.get(nodeId)?.stepCount ?? 0;
  }

  /** Minimum pairwise distance between agents (Infinity for < 2 agents). */
  minPairwiseDistance(nodeId: string): number {
    const agents = this.getAgents(nodeId);
    let min = Infinity;
    for (let i = 0; i < agents.length; i++)
      for (let j = i + 1; j < agents.length; j++) {
        const d = dist(agents[i].position, agents[j].position);
        if (d < min) min = d;
      }
    return min;
  }
}

export function createCrowdSimulator(options: { bus: EventBus }): CrowdSimulator {
  const sim = new CrowdSimulator(options);
  sim.start();
  return sim;
}
