/**
 * SteeringBehavior — Seek/flee/arrive/wander/avoid with weighted blending
 *
 * @version 1.0.0
 */

export interface Vec2 {
  x: number;
  z: number;
}

export type SteeringType = 'seek' | 'flee' | 'arrive' | 'wander' | 'avoid' | 'pursue' | 'evade';

export interface SteeringAgent {
  position: Vec2;
  velocity: Vec2;
  maxSpeed: number;
  maxForce: number;
  mass: number;
}

export interface SteeringOutput {
  force: Vec2;
  type: SteeringType;
  weight: number;
}

export class SteeringBehavior {
  /**
   * Seek — steer toward a target
   */
  static seek(agent: SteeringAgent, target: Vec2): Vec2 {
    const desired = { x: target.x - agent.position.x, z: target.z - agent.position.z };
    const mag = Math.sqrt(desired.x ** 2 + desired.z ** 2);
    if (mag === 0) return { x: 0, z: 0 };
    desired.x = (desired.x / mag) * agent.maxSpeed;
    desired.z = (desired.z / mag) * agent.maxSpeed;
    return {
      x: desired.x - agent.velocity.x,
      z: desired.z - agent.velocity.z,
    };
  }

  /**
   * Flee — steer away from a target
   */
  static flee(agent: SteeringAgent, target: Vec2): Vec2 {
    const force = this.seek(agent, target);
    return { x: -force.x, z: -force.z };
  }

  /**
   * Arrive — seek with deceleration near target
   */
  static arrive(agent: SteeringAgent, target: Vec2, slowRadius: number = 5): Vec2 {
    const toTarget = { x: target.x - agent.position.x, z: target.z - agent.position.z };
    const dist = Math.sqrt(toTarget.x ** 2 + toTarget.z ** 2);
    if (dist === 0) return { x: 0, z: 0 };

    const speed = dist < slowRadius ? agent.maxSpeed * (dist / slowRadius) : agent.maxSpeed;

    const desired = {
      x: (toTarget.x / dist) * speed,
      z: (toTarget.z / dist) * speed,
    };

    return {
      x: desired.x - agent.velocity.x,
      z: desired.z - agent.velocity.z,
    };
  }

  /**
   * Wander — random jitter-based steering
   */
  static wander(
    agent: SteeringAgent,
    wanderRadius: number = 2,
    wanderDistance: number = 4,
    jitter: number = 0.5
  ): Vec2 {
    const angle = Math.random() * Math.PI * 2;
    const wanderTarget = {
      x: agent.position.x + Math.cos(angle) * wanderRadius * jitter,
      z: agent.position.z + Math.sin(angle) * wanderRadius * jitter,
    };

    const velMag = Math.sqrt(agent.velocity.x ** 2 + agent.velocity.z ** 2);
    const forward =
      velMag > 0
        ? {
            x: (agent.velocity.x / velMag) * wanderDistance,
            z: (agent.velocity.z / velMag) * wanderDistance,
          }
        : { x: wanderDistance, z: 0 };

    const circleCenter = {
      x: agent.position.x + forward.x,
      z: agent.position.z + forward.z,
    };

    return this.seek(agent, {
      x: circleCenter.x + wanderTarget.x - agent.position.x,
      z: circleCenter.z + wanderTarget.z - agent.position.z,
    });
  }

  /**
   * Obstacle avoidance
   */
  static avoid(
    agent: SteeringAgent,
    obstacles: { position: Vec2; radius: number }[],
    lookAhead: number = 5
  ): Vec2 {
    const force: Vec2 = { x: 0, z: 0 };

    for (const obs of obstacles) {
      const toObs = { x: obs.position.x - agent.position.x, z: obs.position.z - agent.position.z };
      const dist = Math.sqrt(toObs.x ** 2 + toObs.z ** 2);

      if (dist < lookAhead + obs.radius) {
        const pushStrength = (lookAhead + obs.radius - dist) / (lookAhead + obs.radius);
        force.x -= (toObs.x / dist) * pushStrength * agent.maxForce;
        force.z -= (toObs.z / dist) * pushStrength * agent.maxForce;
      }
    }

    return force;
  }

  /**
   * Blend multiple steering outputs by weight
   */
  static blend(outputs: SteeringOutput[], maxForce: number): Vec2 {
    const result: Vec2 = { x: 0, z: 0 };
    for (const out of outputs) {
      result.x += out.force.x * out.weight;
      result.z += out.force.z * out.weight;
    }

    const mag = Math.sqrt(result.x ** 2 + result.z ** 2);
    if (mag > maxForce) {
      result.x = (result.x / mag) * maxForce;
      result.z = (result.z / mag) * maxForce;
    }

    return result;
  }
}
