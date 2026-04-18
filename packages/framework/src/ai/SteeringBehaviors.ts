/**
 * SteeringBehaviors.ts
 *
 * Autonomous agent steering: seek, flee, arrive, wander,
 * flock (separation/alignment/cohesion), and obstacle avoidance.
 *
 * @module ai
 */

// =============================================================================
// TYPES
// =============================================================================

export interface SteeringAgent {
  position: { x: number; y: number; z: number } | [number, number, number];
  velocity: { x: number; y: number; z: number } | [number, number, number];
  maxSpeed: number;
  maxForce: number;
  mass: number;
}

export interface FlockConfig {
  separationWeight: number;
  alignmentWeight: number;
  cohesionWeight: number;
  neighborRadius: number;
}

export interface ObstacleCircle {
  center: { x: number; y: number; z: number };
  radius: number;
}

type Vec3 = { x: number; y: number; z: number };

function getX(v: Vec3 | [number, number, number]): number {
  return Array.isArray(v) ? v[0] : v.x;
}
function getY(v: Vec3 | [number, number, number]): number {
  return Array.isArray(v) ? v[1] : v.y;
}
function getZ(v: Vec3 | [number, number, number]): number {
  return Array.isArray(v) ? v[2] : v.z;
}

function makeVec3(x: number, y: number, z: number): Vec3 & { 0: number; 1: number; 2: number } {
  return { x, y, z, 0: x, 1: y, 2: z };
}

// =============================================================================
// STEERING BEHAVIORS
// =============================================================================

export class SteeringBehaviors {
  // ---------------------------------------------------------------------------
  // Basic Behaviors
  // ---------------------------------------------------------------------------

  static seek(agent: SteeringAgent, target: Vec3 | [number, number, number]): Vec3 {
    const desired = SteeringBehaviors.sub(target, agent.position);
    const norm = SteeringBehaviors.normalize(desired);
    const scaled = SteeringBehaviors.scale(norm, agent.maxSpeed);
    return SteeringBehaviors.truncate(
      SteeringBehaviors.sub(scaled, agent.velocity),
      agent.maxForce
    );
  }

  static flee(agent: SteeringAgent, threat: Vec3 | [number, number, number]): Vec3 {
    const desired = SteeringBehaviors.sub(agent.position, threat);
    const norm = SteeringBehaviors.normalize(desired);
    const scaled = SteeringBehaviors.scale(norm, agent.maxSpeed);
    return SteeringBehaviors.truncate(
      SteeringBehaviors.sub(scaled, agent.velocity),
      agent.maxForce
    );
  }

  static arrive(agent: SteeringAgent, target: Vec3 | [number, number, number], slowRadius: number): Vec3 {
    const toTarget = SteeringBehaviors.sub(target, agent.position);
    const dist = SteeringBehaviors.vecLength(toTarget);
    if (dist < 0.001) return makeVec3(0, 0, 0);

    const speed = dist < slowRadius ? agent.maxSpeed * (dist / slowRadius) : agent.maxSpeed;
    const desired = SteeringBehaviors.scale(SteeringBehaviors.normalize(toTarget), speed);
    return SteeringBehaviors.truncate(
      SteeringBehaviors.sub(desired, agent.velocity),
      agent.maxForce
    );
  }

  static wander(
    agent: SteeringAgent,
    circleDistance: number,
    circleRadius: number,
    angleJitter: number,
    currentAngle: number
  ): { force: Vec3; newAngle: number } {
    const angle = currentAngle + (Math.random() - 0.5) * angleJitter;
    const vel = SteeringBehaviors.normalize(agent.velocity);
    const circleCenter = SteeringBehaviors.add(
      agent.position,
      SteeringBehaviors.scale(vel, circleDistance)
    );
    const offset = { x: Math.cos(angle) * circleRadius, y: 0, z: Math.sin(angle) * circleRadius };
    const target = SteeringBehaviors.add(circleCenter, offset);
    return { force: SteeringBehaviors.seek(agent, target), newAngle: angle };
  }

  // ---------------------------------------------------------------------------
  // Flock
  // ---------------------------------------------------------------------------

  static flock(agent: SteeringAgent, neighbors: SteeringAgent[], config: FlockConfig): Vec3 {
    const nearby = neighbors.filter((n) => {
      if (n === agent) return false;
      return SteeringBehaviors.distance(agent.position, n.position) < config.neighborRadius;
    });

    if (nearby.length === 0) return makeVec3(0, 0, 0);

    const sep = SteeringBehaviors.separation(agent, nearby);
    const ali = SteeringBehaviors.alignment(agent, nearby);
    const coh = SteeringBehaviors.cohesion(agent, nearby);

    return makeVec3(
      sep.x * config.separationWeight +
        ali.x * config.alignmentWeight +
        coh.x * config.cohesionWeight,
      sep.y * config.separationWeight +
        ali.y * config.alignmentWeight +
        coh.y * config.cohesionWeight,
      sep.z * config.separationWeight +
        ali.z * config.alignmentWeight +
        coh.z * config.cohesionWeight
    );
  }

  private static separation(agent: SteeringAgent, neighbors: SteeringAgent[]): Vec3 {
    let fx = 0,
      fy = 0,
      fz = 0;
    for (const n of neighbors) {
      const d = SteeringBehaviors.sub(agent.position, n.position);
      const dist = SteeringBehaviors.vecLength(d) || 0.001;
      fx += d.x / (dist * dist);
      fy += d.y / (dist * dist);
      fz += d.z / (dist * dist);
    }
    return SteeringBehaviors.normalize(makeVec3(fx, fy, fz));
  }

  private static alignment(_agent: SteeringAgent, neighbors: SteeringAgent[]): Vec3 {
    let vx = 0,
      vy = 0,
      vz = 0;
    for (const n of neighbors) {
      vx += getX(n.velocity);
      vy += getY(n.velocity);
      vz += getZ(n.velocity);
    }
    const avg = makeVec3(vx / neighbors.length, vy / neighbors.length, vz / neighbors.length);
    return SteeringBehaviors.normalize(avg);
  }

  private static cohesion(agent: SteeringAgent, neighbors: SteeringAgent[]): Vec3 {
    let cx = 0,
      cy = 0,
      cz = 0;
    for (const n of neighbors) {
      cx += getX(n.position);
      cy += getY(n.position);
      cz += getZ(n.position);
    }
    const center = makeVec3(cx / neighbors.length, cy / neighbors.length, cz / neighbors.length);
    return SteeringBehaviors.normalize(SteeringBehaviors.sub(center, agent.position));
  }

  // ---------------------------------------------------------------------------
  // Obstacle Avoidance
  // ---------------------------------------------------------------------------

  static obstacleAvoidance(
    agent: SteeringAgent,
    obstacles: ObstacleCircle[],
    lookAhead: number
  ): Vec3 {
    const ahead = SteeringBehaviors.add(
      agent.position,
      SteeringBehaviors.scale(SteeringBehaviors.normalize(agent.velocity), lookAhead)
    );

    let nearest: ObstacleCircle | null = null;
    let nearestDist = Infinity;

    for (const obs of obstacles) {
      const dist = SteeringBehaviors.distance(ahead, obs.center);
      if (dist < obs.radius && dist < nearestDist) {
        nearest = obs;
        nearestDist = dist;
      }
    }

    if (!nearest) return makeVec3(0, 0, 0);

    const avoidance = SteeringBehaviors.sub(ahead, nearest.center);
    return SteeringBehaviors.truncate(SteeringBehaviors.normalize(avoidance), agent.maxForce);
  }

  // ---------------------------------------------------------------------------
  // Integration
  // ---------------------------------------------------------------------------

  static applyForce(agent: SteeringAgent, force: Vec3, dt: number): void {
    const ax = force.x / agent.mass,
      ay = force.y / agent.mass,
      az = force.z / agent.mass;
    agent.velocity.x += ax * dt;
    agent.velocity.y += ay * dt;
    agent.velocity.z += az * dt;
    agent.velocity = SteeringBehaviors.truncate(agent.velocity, agent.maxSpeed);
    agent.position.x += agent.velocity.x * dt;
    agent.position.y += agent.velocity.y * dt;
    agent.position.z += agent.velocity.z * dt;
  }

  // ---------------------------------------------------------------------------
  // Vec3 Helpers
  // ---------------------------------------------------------------------------

  private static sub(a: Vec3 | [number, number, number], b: Vec3 | [number, number, number]): Vec3 {
    return makeVec3(getX(a) - getX(b), getY(a) - getY(b), getZ(a) - getZ(b));
  }
  private static add(a: Vec3 | [number, number, number], b: Vec3 | [number, number, number]): Vec3 {
    return makeVec3(getX(a) + getX(b), getY(a) + getY(b), getZ(a) + getZ(b));
  }
  private static scale(v: Vec3, s: number): Vec3 {
    return makeVec3(v.x * s, v.y * s, v.z * s);
  }
  private static vecLength(v: Vec3): number {
    return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  }
  private static distance(a: Vec3, b: Vec3): number {
    return SteeringBehaviors.vecLength(SteeringBehaviors.sub(a, b));
  }
  private static normalize(v: Vec3): Vec3 {
    const len = SteeringBehaviors.vecLength(v) || 1;
    return makeVec3(v.x / len, v.y / len, v.z / len);
  }
  private static truncate(v: Vec3, max: number): Vec3 {
    const len = SteeringBehaviors.vecLength(v);
    if (len <= max) return v;
    return SteeringBehaviors.scale(SteeringBehaviors.normalize(v), max);
  }
}
