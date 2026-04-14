/**
 * SteeringBehaviors.ts
 *
 * Autonomous agent movement: seek, flee, arrive, wander,
 * flocking (separation/alignment/cohesion), and obstacle avoidance.
 *
 * @module navigation
 */

type NavigationVector = [number, number, number];

// =============================================================================
// TYPES
// =============================================================================

export interface SteeringAgent {
  position: NavigationVector;
  velocity: NavigationVector;
  maxSpeed: number;
  maxForce: number;
  mass: number;
}

export interface SteeringConfig {
  separationRadius: number;
  separationWeight: number;
  alignmentRadius: number;
  alignmentWeight: number;
  cohesionRadius: number;
  cohesionWeight: number;
  wanderRadius: number;
  wanderDistance: number;
  wanderJitter: number;
  arriveSlowRadius: number;
  avoidanceDistance: number;
}

export interface SteeringObstacle {
  position: NavigationVector;
  radius: number;
}

// =============================================================================
// DEFAULT CONFIG
// =============================================================================

const DEFAULT_STEERING: SteeringConfig = {
  separationRadius: 5,
  separationWeight: 1.5,
  alignmentRadius: 10,
  alignmentWeight: 1.0,
  cohesionRadius: 15,
  cohesionWeight: 1.0,
  wanderRadius: 3,
  wanderDistance: 5,
  wanderJitter: 0.5,
  arriveSlowRadius: 10,
  avoidanceDistance: 8,
};

// =============================================================================
// STEERING BEHAVIORS
// =============================================================================

export class SteeringBehaviors {
  private config: SteeringConfig;
  private wanderAngle = 0;

  constructor(config?: Partial<SteeringConfig>) {
    this.config = { ...DEFAULT_STEERING, ...config };
  }

  // ---------------------------------------------------------------------------
  // Individual Behaviors
  // ---------------------------------------------------------------------------

  seek(agent: SteeringAgent, target: NavigationVector): NavigationVector {
    const desired = this.sub(target, agent.position);
    const norm = this.normalize(desired);
    const scaled = this.scale(norm, agent.maxSpeed);
    return this.truncate(this.sub(scaled, agent.velocity), agent.maxForce);
  }

  flee(agent: SteeringAgent, target: NavigationVector): NavigationVector {
    const desired = this.sub(agent.position, target);
    const norm = this.normalize(desired);
    const scaled = this.scale(norm, agent.maxSpeed);
    return this.truncate(this.sub(scaled, agent.velocity), agent.maxForce);
  }

  arrive(agent: SteeringAgent, target: NavigationVector): NavigationVector {
    const toTarget = this.sub(target, agent.position);
    const dist = this.mag(toTarget);
    if (dist < 0.001) return [0, 0, 0];

    let speed = agent.maxSpeed;
    if (dist < this.config.arriveSlowRadius) {
      speed = agent.maxSpeed * (dist / this.config.arriveSlowRadius);
    }

    const desired = this.scale(this.normalize(toTarget), speed);
    return this.truncate(this.sub(desired, agent.velocity), agent.maxForce);
  }

  wander(agent: SteeringAgent): NavigationVector {
    this.wanderAngle += (Math.random() - 0.5) * 2 * this.config.wanderJitter;

    const vel =
      this.mag(agent.velocity) > 0.001 ? this.normalize(agent.velocity) : ([1, 0, 0] as NavigationVector);
    const circleCenter = this.add(agent.position, this.scale(vel, this.config.wanderDistance));

    const wanderTarget: NavigationVector = [
      circleCenter[0] + Math.cos(this.wanderAngle) * this.config.wanderRadius,
      circleCenter[1],
      circleCenter[2] + Math.sin(this.wanderAngle) * this.config.wanderRadius,
    ];

    return this.seek(agent, wanderTarget);
  }

  // ---------------------------------------------------------------------------
  // Flocking Behaviors
  // ---------------------------------------------------------------------------

  separation(agent: SteeringAgent, neighbors: SteeringAgent[]): NavigationVector {
    const force: NavigationVector = [0, 0, 0];
    let count = 0;

    for (const n of neighbors) {
      const d = this.dist(agent.position, n.position);
      if (d > 0 && d < this.config.separationRadius) {
        const away = this.normalize(this.sub(agent.position, n.position));
        const weighted = this.scale(away, 1 / Math.max(d, 0.1));
        force[0] += weighted[0];
        force[1] += weighted[1];
        force[2] += weighted[2];
        count++;
      }
    }

    if (count > 0) {
      force[0] /= count;
      force[1] /= count;
      force[2] /= count;
    }
    return this.scale(force, this.config.separationWeight);
  }

  alignment(agent: SteeringAgent, neighbors: SteeringAgent[]): NavigationVector {
    const avgVel: NavigationVector = [0, 0, 0];
    let count = 0;

    for (const n of neighbors) {
      const d = this.dist(agent.position, n.position);
      if (d > 0 && d < this.config.alignmentRadius) {
        avgVel[0] += n.velocity[0];
        avgVel[1] += n.velocity[1];
        avgVel[2] += n.velocity[2];
        count++;
      }
    }

    if (count === 0) return [0, 0, 0];
    avgVel[0] /= count;
    avgVel[1] /= count;
    avgVel[2] /= count;
    const steer = this.sub(avgVel, agent.velocity);
    return this.scale(this.truncate(steer, agent.maxForce), this.config.alignmentWeight);
  }

  cohesion(agent: SteeringAgent, neighbors: SteeringAgent[]): NavigationVector {
    const center: NavigationVector = [0, 0, 0];
    let count = 0;

    for (const n of neighbors) {
      const d = this.dist(agent.position, n.position);
      if (d > 0 && d < this.config.cohesionRadius) {
        center[0] += n.position[0];
        center[1] += n.position[1];
        center[2] += n.position[2];
        count++;
      }
    }

    if (count === 0) return [0, 0, 0];
    center[0] /= count;
    center[1] /= count;
    center[2] /= count;
    return this.scale(this.seek(agent, center), this.config.cohesionWeight);
  }

  flock(agent: SteeringAgent, neighbors: SteeringAgent[]): NavigationVector {
    const sep = this.separation(agent, neighbors);
    const ali = this.alignment(agent, neighbors);
    const coh = this.cohesion(agent, neighbors);
    return this.add(this.add(sep, ali), coh);
  }

  // ---------------------------------------------------------------------------
  // Obstacle Avoidance
  // ---------------------------------------------------------------------------

  avoidObstacles(agent: SteeringAgent, obstacles: SteeringObstacle[]): NavigationVector {
    const force: NavigationVector = [0, 0, 0];
    const ahead = this.add(
      agent.position,
      this.scale(
        this.mag(agent.velocity) > 0.001 ? this.normalize(agent.velocity) : [1, 0, 0],
        this.config.avoidanceDistance
      )
    );

    for (const obs of obstacles) {
      const d = this.dist(ahead, obs.position);
      if (d < obs.radius + 1) {
        const away = this.normalize(this.sub(ahead, obs.position));
        const strength = (obs.radius + 1 - d) / (obs.radius + 1);
        force[0] += away[0] * strength * agent.maxForce;
        force[1] += away[1] * strength * agent.maxForce;
        force[2] += away[2] * strength * agent.maxForce;
      }
    }

    return this.truncate(force, agent.maxForce);
  }

  // ---------------------------------------------------------------------------
  // Apply Force to Agent
  // ---------------------------------------------------------------------------

  applyForce(agent: SteeringAgent, force: NavigationVector, dt: number): void {
    const accel = this.scale(force, 1 / agent.mass);
    agent.velocity[0] += accel[0] * dt;
    agent.velocity[1] += accel[1] * dt;
    agent.velocity[2] += accel[2] * dt;

    // Clamp to max speed
    const speed = this.mag(agent.velocity);
    if (speed > agent.maxSpeed) {
      const ratio = agent.maxSpeed / speed;
      agent.velocity[0] *= ratio;
      agent.velocity[1] *= ratio;
      agent.velocity[2] *= ratio;
    }

    agent.position[0] += agent.velocity[0] * dt;
    agent.position[1] += agent.velocity[1] * dt;
    agent.position[2] += agent.velocity[2] * dt;
  }

  // ---------------------------------------------------------------------------
  // Vector Helpers
  // ---------------------------------------------------------------------------

  private sub(a: NavigationVector, b: NavigationVector): NavigationVector {
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  }
  private add(a: NavigationVector, b: NavigationVector): NavigationVector {
    return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  }
  private scale(v: NavigationVector, s: number): NavigationVector {
    return [v[0] * s, v[1] * s, v[2] * s];
  }
  private mag(v: NavigationVector): number {
    return Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  }
  private dist(a: NavigationVector, b: NavigationVector): number {
    return this.mag(this.sub(a, b));
  }

  private normalize(v: NavigationVector): NavigationVector {
    const m = this.mag(v);
    return m > 0.0001 ? this.scale(v, 1 / m) : ([0, 0, 0] as NavigationVector);
  }

  private truncate(v: NavigationVector, max: number): NavigationVector {
    const m = this.mag(v);
    return m > max ? this.scale(v, max / m) : v;
  }

  // ---------------------------------------------------------------------------
  // Config
  // ---------------------------------------------------------------------------

  getConfig(): SteeringConfig {
    return { ...this.config };
  }
  setConfig(config: Partial<SteeringConfig>): void {
    Object.assign(this.config, config);
  }
}
