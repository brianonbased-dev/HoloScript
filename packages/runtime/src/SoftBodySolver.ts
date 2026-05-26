/**
 * @holoscript/runtime - SoftBodySolver
 *
 * Consumes the soft-body lifecycle emitted by SoftBodyProTrait
 * (packages/core/src/traits/SoftBodyProTrait.ts) and runs a real Position-Based
 * Dynamics (PBD) solver with parametric tearing. Closes the missing listener
 * side (Pattern E: emit-without-listener) — the trait advertised tearing &
 * deformation but emitted `soft_body_pro_step` with no solver behind it.
 *
 * Each step: integrate particles (Verlet inertia + gravity + damping), evaluate
 * per-constraint strain, TEAR distance constraints whose strain exceeds the
 * node's tear threshold (topology change), then relax the surviving constraints
 * over `solverIterations`. Headless + deterministic for tests/server.
 */

import type { EventBus } from './events.js';

export type Vec3 = [number, number, number];

export interface SoftBodyParticle {
  position: Vec3;
  prevPosition: Vec3;
  /** Inverse mass; 0 = pinned (immovable). */
  invMass: number;
}

export interface DistanceConstraint {
  a: number;
  b: number;
  restLength: number;
}

export interface SoftBodyCreateEvent {
  nodeId: string;
  tearThreshold?: number;
  solverIterations?: number;
  compliance?: number;
  damping?: number;
}

export interface SoftBodyStepEvent {
  nodeId: string;
  deltaTime: number;
  tearThreshold?: number;
}

export interface SoftBodyImpulseEvent {
  nodeId: string;
  position?: Vec3;
  force?: Vec3;
  radius?: number;
}

interface SoftBodyParams {
  tearThreshold: number;
  solverIterations: number;
  compliance: number;
  damping: number;
}

interface SoftBody {
  particles: SoftBodyParticle[];
  constraints: DistanceConstraint[];
  params: SoftBodyParams;
  tornConstraints: number;
  initialConstraintCount: number;
  stepCount: number;
}

const DEFAULT_PARAMS: SoftBodyParams = {
  tearThreshold: 0.8,
  solverIterations: 10,
  compliance: 0.001,
  damping: 0.99,
};

const GRAVITY: Vec3 = [0, -9.81, 0];

function dist(a: Vec3, b: Vec3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

export class SoftBodySolver {
  private readonly bus: EventBus;
  private bodies = new Map<string, SoftBody>();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  constructor(options: { bus: EventBus }) {
    this.bus = options.bus;
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.unsubscribers.push(
      this.bus.on<SoftBodyCreateEvent>('soft_body_pro_create', (e) => this.onCreate(e))
    );
    this.unsubscribers.push(
      this.bus.on<SoftBodyStepEvent>('soft_body_pro_step', (e) => this.onStep(e))
    );
    this.unsubscribers.push(
      this.bus.on<SoftBodyImpulseEvent>('soft_body_pro_impulse', (e) => this.onImpulse(e))
    );
    this.unsubscribers.push(
      this.bus.on<{ nodeId: string }>('soft_body_pro_reset', (e) => this.onReset(e.nodeId))
    );
    this.unsubscribers.push(
      this.bus.on<{ nodeId: string }>('soft_body_pro_destroy', (e) => this.bodies.delete(e.nodeId))
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  /** Seed a body's geometry (called by the scene-graph / mesh sync). */
  setBody(nodeId: string, particles: SoftBodyParticle[], constraints: DistanceConstraint[]): void {
    const existing = this.bodies.get(nodeId);
    this.bodies.set(nodeId, {
      particles: particles.map((p) => ({
        position: [...p.position] as Vec3,
        prevPosition: [...(p.prevPosition ?? p.position)] as Vec3,
        invMass: p.invMass,
      })),
      constraints: constraints.map((c) => ({ ...c })),
      params: existing?.params ?? { ...DEFAULT_PARAMS },
      tornConstraints: 0,
      initialConstraintCount: constraints.length,
      stepCount: 0,
    });
  }

  /** Directly set a particle position (e.g. to impose a stretch in a test). */
  setParticlePosition(nodeId: string, index: number, pos: Vec3): void {
    const body = this.bodies.get(nodeId);
    const p = body?.particles[index];
    if (p) {
      p.position = [...pos] as Vec3;
      p.prevPosition = [...pos] as Vec3; // zero velocity at the imposed pose
    }
  }

  private ensureParams(nodeId: string): SoftBody {
    let body = this.bodies.get(nodeId);
    if (!body) {
      body = {
        particles: [],
        constraints: [],
        params: { ...DEFAULT_PARAMS },
        tornConstraints: 0,
        initialConstraintCount: 0,
        stepCount: 0,
      };
      this.bodies.set(nodeId, body);
    }
    return body;
  }

  private onCreate(e: SoftBodyCreateEvent): void {
    const body = this.ensureParams(e.nodeId);
    body.params = {
      tearThreshold: e.tearThreshold ?? DEFAULT_PARAMS.tearThreshold,
      solverIterations: e.solverIterations ?? DEFAULT_PARAMS.solverIterations,
      compliance: e.compliance ?? DEFAULT_PARAMS.compliance,
      damping: e.damping ?? DEFAULT_PARAMS.damping,
    };
  }

  private onImpulse(e: SoftBodyImpulseEvent): void {
    const body = this.bodies.get(e.nodeId);
    if (!body || !e.position || !e.force) return;
    const radius = e.radius ?? 1.0;
    for (const p of body.particles) {
      if (p.invMass === 0) continue;
      const d = dist(p.position, e.position);
      if (d > radius) continue;
      const falloff = (1 - d / radius) * p.invMass;
      // Apply as a velocity kick via prevPosition displacement.
      p.prevPosition = [
        p.prevPosition[0] - e.force[0] * falloff,
        p.prevPosition[1] - e.force[1] * falloff,
        p.prevPosition[2] - e.force[2] * falloff,
      ];
    }
  }

  /** One PBD step with tearing for a node's body. */
  private onStep(e: SoftBodyStepEvent): void {
    const body = this.bodies.get(e.nodeId);
    if (!body || body.particles.length === 0) return;
    const dt = e.deltaTime;
    const threshold = e.tearThreshold ?? body.params.tearThreshold;
    const { particles, params } = body;

    // 1. Integrate (Verlet with damping + gravity).
    for (const p of particles) {
      if (p.invMass === 0) continue;
      const next: Vec3 = [0, 0, 0];
      for (let k = 0; k < 3; k++) {
        const vel = (p.position[k] - p.prevPosition[k]) * params.damping;
        next[k] = p.position[k] + vel + GRAVITY[k] * dt * dt;
      }
      p.prevPosition = [...p.position] as Vec3;
      p.position = next;
    }

    // 2. Tearing: drop constraints whose strain exceeds the threshold.
    const survivors: DistanceConstraint[] = [];
    for (const c of body.constraints) {
      const d = dist(particles[c.a].position, particles[c.b].position);
      const strain = c.restLength > 0 ? (d - c.restLength) / c.restLength : 0;
      if (strain > threshold) {
        body.tornConstraints++;
      } else {
        survivors.push(c);
      }
    }
    body.constraints = survivors;

    // 3. Relax surviving distance constraints (PBD projection).
    for (let iter = 0; iter < params.solverIterations; iter++) {
      for (const c of body.constraints) {
        const pa = particles[c.a];
        const pb = particles[c.b];
        const wSum = pa.invMass + pb.invMass;
        if (wSum === 0) continue;
        const delta: Vec3 = [
          pb.position[0] - pa.position[0],
          pb.position[1] - pa.position[1],
          pb.position[2] - pa.position[2],
        ];
        const len = Math.hypot(delta[0], delta[1], delta[2]) || 1e-9;
        const diff = (len - c.restLength) / (len * wSum);
        for (let k = 0; k < 3; k++) {
          pa.position[k] += pa.invMass * diff * delta[k];
          pb.position[k] -= pb.invMass * diff * delta[k];
        }
      }
    }

    body.stepCount++;
  }

  private onReset(nodeId: string): void {
    const body = this.bodies.get(nodeId);
    if (body) {
      body.tornConstraints = 0;
      body.stepCount = 0;
    }
  }

  // --- query API -----------------------------------------------------------

  getBody(nodeId: string): SoftBody | undefined {
    return this.bodies.get(nodeId);
  }
  constraintCount(nodeId: string): number {
    return this.bodies.get(nodeId)?.constraints.length ?? 0;
  }
  tornCount(nodeId: string): number {
    return this.bodies.get(nodeId)?.tornConstraints ?? 0;
  }
  stepCount(nodeId: string): number {
    return this.bodies.get(nodeId)?.stepCount ?? 0;
  }
  getParticles(nodeId: string): SoftBodyParticle[] {
    return this.bodies.get(nodeId)?.particles ?? [];
  }
}

export function createSoftBodySolver(options: { bus: EventBus }): SoftBodySolver {
  const solver = new SoftBodySolver(options);
  solver.start();
  return solver;
}
