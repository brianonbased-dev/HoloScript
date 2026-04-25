/**
 * SteeringBehavior — Seek/flee/arrive/wander/avoid with weighted blending
 *
 * @version 1.0.0
 */

import { Vector3 } from '../types/HoloScriptPlus';

export type SteeringType = 'seek' | 'flee' | 'arrive' | 'wander' | 'avoid' | 'pursue' | 'evade';

export interface SteeringAgent {
  position: Vector3;
  velocity: Vector3;
  maxSpeed: number;
  maxForce: number;
  mass: number;
}

export interface SteeringOutput {
  force: Vector3;
  type: SteeringType;
  weight: number;
}

export class SteeringBehavior {
  /**
   * Seek — steer toward a target
   */
  static seek(agent: SteeringAgent, target: Vector3): Vector3 {
    const desired: Vector3 = [
      target[0] - agent.position[0],
      target[1] - agent.position[1],
      target[2] - agent.position[2]
    ];
    const mag = Math.sqrt(desired[0] ** 2 + desired[1] ** 2 + desired[2] ** 2);
    if (mag === 0) return [0, 0, 0];
    
    desired[0] = (desired[0] / mag) * agent.maxSpeed;
    desired[1] = (desired[1] / mag) * agent.maxSpeed;
    desired[2] = (desired[2] / mag) * agent.maxSpeed;
    
    return [
      desired[0] - agent.velocity[0],
      desired[1] - agent.velocity[1],
      desired[2] - agent.velocity[2]
    ];
  }

  /**
   * Flee — steer away from a target
   */
  static flee(agent: SteeringAgent, target: Vector3): Vector3 {
    const force = this.seek(agent, target);
    return [-force[0], -force[1], -force[2]];
  }

  /**
   * Arrive — seek with deceleration near target
   */
  static arrive(agent: SteeringAgent, target: Vector3, slowRadius: number = 5): Vector3 {
    const toTarget: Vector3 = [
      target[0] - agent.position[0],
      target[1] - agent.position[1],
      target[2] - agent.position[2]
    ];
    const dist = Math.sqrt(toTarget[0] ** 2 + toTarget[1] ** 2 + toTarget[2] ** 2);
    if (dist === 0) return [0, 0, 0];

    const speed = dist < slowRadius ? agent.maxSpeed * (dist / slowRadius) : agent.maxSpeed;

    const desired: Vector3 = [
      (toTarget[0] / dist) * speed,
      (toTarget[1] / dist) * speed,
      (toTarget[2] / dist) * speed
    ];

    return [
      desired[0] - agent.velocity[0],
      desired[1] - agent.velocity[1],
      desired[2] - agent.velocity[2]
    ];
  }

  /**
   * Wander — random jitter-based steering
   */
  static wander(
    agent: SteeringAgent,
    wanderRadius: number = 2,
    wanderDistance: number = 4,
    jitter: number = 0.5
  ): Vector3 {
    const angle = Math.random() * Math.PI * 2;
    const wanderTarget: Vector3 = [
      agent.position[0] + Math.cos(angle) * wanderRadius * jitter,
      agent.position[1],
      agent.position[2] + Math.sin(angle) * wanderRadius * jitter
    ];

    const velMag = Math.sqrt(agent.velocity[0] ** 2 + agent.velocity[1] ** 2 + agent.velocity[2] ** 2);
    const forward: Vector3 =
      velMag > 0
        ? [
            (agent.velocity[0] / velMag) * wanderDistance,
            (agent.velocity[1] / velMag) * wanderDistance,
            (agent.velocity[2] / velMag) * wanderDistance
          ]
        : [wanderDistance, 0, 0];

    const circleCenter: Vector3 = [
      agent.position[0] + forward[0],
      agent.position[1] + forward[1],
      agent.position[2] + forward[2]
    ];

    return this.seek(agent, [
      circleCenter[0] + wanderTarget[0] - agent.position[0],
      circleCenter[1] + wanderTarget[1] - agent.position[1],
      circleCenter[2] + wanderTarget[2] - agent.position[2]
    ]);
  }

  /**
   * Obstacle avoidance
   */
  static avoid(
    agent: SteeringAgent,
    obstacles: { position: Vector3; radius: number }[],
    lookAhead: number = 5
  ): Vector3 {
    const force: Vector3 = [0, 0, 0];

    for (const obs of obstacles) {
      const toObs: Vector3 = [
        obs.position[0] - agent.position[0],
        obs.position[1] - agent.position[1],
        obs.position[2] - agent.position[2]
      ];
      const dist = Math.sqrt(toObs[0] ** 2 + toObs[1] ** 2 + toObs[2] ** 2);

      if (dist < lookAhead + obs.radius) {
        const pushStrength = (lookAhead + obs.radius - dist) / (lookAhead + obs.radius);
        force[0] -= (toObs[0] / dist) * pushStrength * agent.maxForce;
        force[1] -= (toObs[1] / dist) * pushStrength * agent.maxForce;
        force[2] -= (toObs[2] / dist) * pushStrength * agent.maxForce;
      }
    }

    return force;
  }

  /**
   * Blend multiple steering outputs by weight
   */
  static blend(outputs: SteeringOutput[], maxForce: number): Vector3 {
    const result: Vector3 = [0, 0, 0];
    for (const out of outputs) {
      result[0] += out.force[0] * out.weight;
      result[1] += out.force[1] * out.weight;
      result[2] += out.force[2] * out.weight;
    }

    const mag = Math.sqrt(result[0] ** 2 + result[1] ** 2 + result[2] ** 2);
    if (mag > maxForce) {
      result[0] = (result[0] / mag) * maxForce;
      result[1] = (result[1] / mag) * maxForce;
      result[2] = (result[2] / mag) * maxForce;
    }

    return result;
  }
}
