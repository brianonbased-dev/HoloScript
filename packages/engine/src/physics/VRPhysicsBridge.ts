/**
 * VRPhysicsBridge.ts
 *
 * Bridges the gap between WebXR input (Hands/Headset) and the Physics Engine.
 * Responsibilities:
 * 1. Create/Update Kinematic Bodies for hands/fingers.
 * 2. Sync velocity for throwing mechanics.
 * 3. Manage collision layers for hands (to avoid self-collision if needed).
 */

import { IPhysicsWorld, IRigidBodyConfig, IVector3, IQuaternion } from './PhysicsTypes';
import { VRHand, Vector3 } from '@holoscript/core';

export class VRPhysicsBridge {
  private world: IPhysicsWorld;
  private handBodies: Map<string, string> = new Map(); // handId -> physicsBodyId
  private lastPositions: Map<string, IVector3> = new Map();
  private lastRotations: Map<string, IQuaternion> = new Map();
  private onHaptic: (hand: 'left' | 'right', intensity: number, duration: number) => void;

  constructor(
    world: IPhysicsWorld,
    onHaptic?: (hand: 'left' | 'right', intensity: number, duration: number) => void
  ) {
    this.world = world;
    this.onHaptic = onHaptic || (() => {});
  }

  public update(
    vrContext: { hands: { left: VRHand | null; right: VRHand | null } },
    delta: number
  ): void {
    this.updateHand(vrContext.hands.left, 'left', delta);
    this.updateHand(vrContext.hands.right, 'right', delta);
    this.checkCollisions();
  }

  private checkCollisions(): void {
    const contacts = this.world.getContacts();

    for (const contact of contacts) {
      if (contact.type === 'begin') {
        if (contact.bodyA === 'hand_left' || contact.bodyB === 'hand_left') {
          this.onHaptic('left', 0.5, 50);
        }
        if (contact.bodyA === 'hand_right' || contact.bodyB === 'hand_right') {
          this.onHaptic('right', 0.5, 50);
        }
      }
    }
  }

  // Make public for testing
  public updateHand(hand: VRHand | null, side: 'left' | 'right', delta: number): void {
    const bodyId = `hand_${side}`;

    if (!hand) {
      // If hand lost tracking, maybe move body far away or disable it?
      // For now, we perform no update (body slightly stale) or we could teleport it to 0, -1000, 0
      return;
    }

    // Check if body exists
    let body = this.world.getBody(bodyId);

    if (!body) {
      // Create Kinematic Body for Hand (Palm)
      const config: IRigidBodyConfig = {
        id: bodyId,
        type: 'kinematic',
        mass: 1, // Infinite mass for kinematic
        transform: {
          position: [hand.position?.[0] ?? 0, hand.position?.[1] ?? 0, hand.position?.[2] ?? 0],
          rotation: [
            hand.rotation?.[0] ?? 0,
            hand.rotation?.[1] ?? 0,
            hand.rotation?.[2] ?? 0,
            hand.rotation?.[3] ?? 1,
          ],
        },
        shape: {
          type: 'sphere',
          radius: 0.05, // 5cm palm radius
        },
        material: {
          friction: 0.5,
          restitution: 0.0,
        },
      };

      this.world.createBody(config);
      body = this.world.getBody(bodyId);
    }

    if (body) {
      // Calculate Velocity (vital for throwing)
      const currentPos = hand.position || [0, 0, 0];
      const prevPos = this.lastPositions.get(bodyId) || currentPos;

      // Prevent divide by zero
      const safeDelta = delta > 0.001 ? delta : 0.016;

      const rawVelocity: IVector3 = [
        (currentPos[0] - prevPos[0]) / safeDelta,
        (currentPos[1] - prevPos[1]) / safeDelta,
        (currentPos[2] - prevPos[2]) / safeDelta,
      ];

      // Simple smoothing (Lerp with previous velocity if available)
      const prevVel = body.linearVelocity || [0, 0, 0];
      const smoothingFactor = 0.5; // 0 = old, 1 = new

      const smoothedVelocity: IVector3 = [
        prevVel[0] * (1 - smoothingFactor) + rawVelocity[0] * smoothingFactor,
        prevVel[1] * (1 - smoothingFactor) + rawVelocity[1] * smoothingFactor,
        prevVel[2] * (1 - smoothingFactor) + rawVelocity[2] * smoothingFactor,
      ];

      // Update Body Transform
      this.world.setPosition(bodyId, [currentPos[0], currentPos[1], currentPos[2]]);
      if (hand.rotation) {
        this.world.setRotation(bodyId, [
          hand.rotation[0],
          hand.rotation[1],
          hand.rotation[2],
          hand.rotation[3],
        ]);
      }

      // Update Body Velocity
      this.world.setLinearVelocity(bodyId, smoothedVelocity);

      // Store history
      this.lastPositions.set(bodyId, [currentPos[0], currentPos[1], currentPos[2]]);
    }
  }

  public getHandBodyId(side: 'left' | 'right'): string | null {
    const id = `hand_${side}`;
    return this.world.getBody(id) ? id : null;
  }
}
