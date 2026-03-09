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
import { VRHand, Vector3 } from '../types/HoloScriptPlus';

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
        type: 'kinematic',
        mass: 1, // Infinite mass for kinematic
        position: { x: hand.position.x, y: hand.position.y, z: hand.position.z },
        rotation: { x: hand.rotation.x, y: hand.rotation.y, z: hand.rotation.z, w: 1 }, // TODO: Convert Euler to Quat if needed
        shape: {
          type: 'sphere',
          radius: 0.05, // 5cm palm radius
        },
        friction: 0.5,
        restitution: 0.0,
        isTrigger: true, // Hands are triggers for "Grab" detection, OR kinematic colliders for pushing?
        // Let's make them Kinematic Colliders so they push things, but we listen for collisions for grab
      };

      this.world.addBody(bodyId, config);
      body = this.world.getBody(bodyId);
    }

    if (body) {
      // Calculate Velocity (vital for throwing)
      // Use a simple history buffer if needed, but for now simple delta is okay if smoothed
      // Let's implement a small exponential smoothing or just raw delta if frame rate is high

      const prevPos = this.lastPositions.get(bodyId) || {
        x: hand.position.x,
        y: hand.position.y,
        z: hand.position.z,
      };

      // Prevent divide by zero
      const safeDelta = delta > 0.001 ? delta : 0.016;

      const rawVelocity = {
        x: (hand.position.x - prevPos.x) / safeDelta,
        y: (hand.position.y - prevPos.y) / safeDelta,
        z: (hand.position.z - prevPos.z) / safeDelta,
      };

      // Simple smoothing (Lerp with previous velocity if available)
      // This helps reduce jitter in physics interactions
      const prevVel = body.velocity || { x: 0, y: 0, z: 0 };
      const smoothingFactor = 0.5; // 0 = old, 1 = new

      const smoothedVelocity = {
        x: prevVel.x * (1 - smoothingFactor) + rawVelocity.x * smoothingFactor,
        y: prevVel.y * (1 - smoothingFactor) + rawVelocity.y * smoothingFactor,
        z: prevVel.z * (1 - smoothingFactor) + rawVelocity.z * smoothingFactor,
      };

      // Update Body Transform
      body.position = { x: hand.position.x, y: hand.position.y, z: hand.position.z };

      // Update Body Velocity
      body.velocity = smoothedVelocity;

      // Store history
      this.lastPositions.set(bodyId, { ...body.position });
    }
  }

  public getHandBodyId(side: 'left' | 'right'): string | null {
    const id = `hand_${side}`;
    return this.world.getBody(id) ? id : null;
  }
}
