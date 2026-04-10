/**
 * SteeringBehaviors.ts
 *
 * Autonomous agent movement: seek, flee, arrive, wander,
 * flocking (separation/alignment/cohesion), and obstacle avoidance.
 *
 * @module navigation
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SteeringAgent {
  position: { x: number; y: number; z: number };
  velocity: { x: number; y: number; z: number };
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
  position: { x: number; y: number; z: number };
  radius: number;
}

type Vec3 = { x: number; y: number; z: number };

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

  seek(agent: SteeringAgent, target: Vec3): Vec3 {
    const desired = this.sub(target, agent.position);
    const norm = this.normalize(desired);
    const scaled = this.scale(norm, agent.maxSpeed);
    return this.truncate(this.sub(scaled, agent.velocity), agent.maxForce);
  }

  flee(agent: SteeringAgent, target: Vec3): Vec3 {
    const desired = this.sub(agent.position, target);
    const norm = this.normalize(desired);
    const scaled = this.scale(norm, agent.maxSpeed);
    return this.truncate(this.sub(scaled, agent.velocity), agent.maxForce);
  }

  arrive(agent: SteeringAgent, target: Vec3): Vec3 {
    const toTarget = this.sub(target, agent.position);
    const dist = this.mag(toTarget);
    if (dist < 0.001) return { x: 0, y: 0, z: 0 };

    let speed = agent.maxSpeed;
    if (dist < this.config.arriveSlowRadius) {
      speed = agent.maxSpeed * (dist / this.config.arriveSlowRadius);
    }

    const desired = this.scale(this.normalize(toTarget), speed);
    return this.truncate(this.sub(desired, agent.velocity), agent.maxForce);
  }

  wander(agent: SteeringAgent): Vec3 {
    this.wanderAngle += (Math.random() - 0.5) * 2 * this.config.wanderJitter;

    const vel =
      this.mag(agent.velocity) > 0.001 ? this.normalize(agent.velocity) : { x: 1, y: 0, z: 0 };
    const circleCenter = this.add(agent.position, this.scale(vel, this.config.wanderDistance));

    const wanderTarget: Vec3 = {
      x: circleCenter.x + Math.cos(this.wanderAngle) * this.config.wanderRadius,
      y: circleCenter.y,
      z: circleCenter.z + Math.sin(this.wanderAngle) * this.config.wanderRadius,
    };

    return this.seek(agent, wanderTarget);
  }

  // ---------------------------------------------------------------------------
  // Flocking Behaviors
  // ---------------------------------------------------------------------------

  separation(agent: SteeringAgent, neighbors: SteeringAgent[]): Vec3 {
    const force: Vec3 = { x: 0, y: 0, z: 0 };
    let count = 0;

    for (const n of neighbors) {
      const d = this.dist(agent.position, n.position);
      if (d > 0 && d < this.config.separationRadius) {
        const away = this.normalize(this.sub(agent.position, n.position));
        const weighted = this.scale(away, 1 / Math.max(d, 0.1));
        force.x += weighted.x;
        force.y += weighted.y;
        force.z += weighted.z;
        count++;
      }
    }

    if (count > 0) {
      force.x /= count;
      force.y /= count;
      force.z /= count;
    }
    return this.scale(force, this.config.separationWeight);
  }

  alignment(agent: SteeringAgent, neighbors: SteeringAgent[]): Vec3 {
    const avgVel: Vec3 = { x: 0, y: 0, z: 0 };
    let count = 0;

    for (const n of neighbors) {
      const d = this.dist(agent.position, n.position);
      if (d > 0 && d < this.config.alignmentRadius) {
        avgVel.x += n.velocity.x;
        avgVel.y += n.velocity.y;
        avgVel.z += n.velocity.z;
        count++;
      }
    }

    if (count === 0) return { x: 0, y: 0, z: 0 };
    avgVel.x /= count;
    avgVel.y /= count;
    avgVel.z /= count;
    const steer = this.sub(avgVel, agent.velocity);
    return this.scale(this.truncate(steer, agent.maxForce), this.config.alignmentWeight);
  }

  cohesion(agent: SteeringAgent, neighbors: SteeringAgent[]): Vec3 {
    const center: Vec3 = { x: 0, y: 0, z: 0 };
    let count = 0;

    for (const n of neighbors) {
      const d = this.dist(agent.position, n.position);
      if (d > 0 && d < this.config.cohesionRadius) {
        center.x += n.position.x;
        center.y += n.position.y;
        center.z += n.position.z;
        count++;
      }
    }

    if (count === 0) return { x: 0, y: 0, z: 0 };
    center.x /= count;
    center.y /= count;
    center.z /= count;
    return this.scale(this.seek(agent, center), this.config.cohesionWeight);
  }

  flock(agent: SteeringAgent, neighbors: SteeringAgent[]): Vec3 {
    const sep = this.separation(agent, neighbors);
    const ali = this.alignment(agent, neighbors);
    const coh = this.cohesion(agent, neighbors);
    return this.add(this.add(sep, ali), coh);
  }

  // ---------------------------------------------------------------------------
  // Obstacle Avoidance
  // ---------------------------------------------------------------------------

  avoidObstacles(agent: SteeringAgent, obstacles: SteeringObstacle[]): Vec3 {
    const force: Vec3 = { x: 0, y: 0, z: 0 };
    const ahead = this.add(
      agent.position,
      this.scale(
        this.mag(agent.velocity) > 0.001 ? this.normalize(agent.velocity) : { x: 1, y: 0, z: 0 },
        this.config.avoidanceDistance
      )
    );

    for (const obs of obstacles) {
      const d = this.dist(ahead, obs.position);
      if (d < obs.radius + 1) {
        const away = this.normalize(this.sub(ahead, obs.position));
        const strength = (obs.radius + 1 - d) / (obs.radius + 1);
        force.x += away.x * strength * agent.maxForce;
        force.y += away.y * strength * agent.maxForce;
        force.z += away.z * strength * agent.maxForce;
      }
    }

    return this.truncate(force, agent.maxForce);
  }

  // ---------------------------------------------------------------------------
  // Apply Force to Agent
  // ---------------------------------------------------------------------------

  applyForce(agent: SteeringAgent, force: Vec3, dt: number): void {
    const accel = this.scale(force, 1 / agent.mass);
    agent.velocity.x += accel.x * dt;
    agent.velocity.y += accel.y * dt;
    agent.velocity.z += accel.z * dt;

    // Clamp to max speed
    const speed = this.mag(agent.velocity);
    if (speed > agent.maxSpeed) {
      const ratio = agent.maxSpeed / speed;
      agent.velocity.x *= ratio;
      agent.velocity.y *= ratio;
      agent.velocity.z *= ratio;
    }

    agent.position.x += agent.velocity.x * dt;
    agent.position.y += agent.velocity.y * dt;
    agent.position.z += agent.velocity.z * dt;
  }

  // ---------------------------------------------------------------------------
  // Vector Helpers
  // ---------------------------------------------------------------------------

  private sub(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  }
  private add(a: Vec3, b: Vec3): Vec3 {
    return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
  }
  private scale(v: Vec3, s: number): Vec3 {
    return { x: v.x * s, y: v.y * s, z: v.z * s };
  }
  private mag(v: Vec3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
  private dist(a: Vec3, b: Vec3): number {
    return this.mag(this.sub(a, b));
  }

  private normalize(v: Vec3): Vec3 {
    const m = this.mag(v);
    return m > 0.0001 ? this.scale(v, 1 / m) : { x: 0, y: 0, z: 0 };
  }

  private truncate(v: Vec3, max: number): Vec3 {
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
