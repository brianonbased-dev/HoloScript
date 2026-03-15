/**
 * GrabbableTrait.ts
 *
 * Makes an object grabbable by VR hands.
 * Uses physics joints to attach the object to the hand when pinched.
 */

import { Trait } from './Trait';
import { TraitContext } from './VRTraitSystem';
import { VRHand, Vector3 } from '../types/HoloScriptPlus';

export class GrabbableTrait implements Trait {
  name = 'grabbable';
  private grabbedHands: Set<string> = new Set();
  private initialPinchDistance: number = 0;
  private initialScale: Vector3 = { x: 1, y: 1, z: 1 };

  private lastHandPositions: Map<string, Vector3> = new Map();
  private lastHandTime: number = 0;

  onUpdate(node: any, context: TraitContext, delta: number): void {
    const hands = context.vr.hands;
    const now = performance.now();

    // Update history for velocity calculation
    if (hands.left) this.lastHandPositions.set('left', { ...hands.left.position });
    if (hands.right) this.lastHandPositions.set('right', { ...hands.right.position });
    this.lastHandTime = now;

    // Check Releases
    for (const handName of this.grabbedHands) {
      // ... rest of loop
      const hand = handName === 'left' ? hands.left : hands.right;
      if (hand && hand.pinchStrength < 0.5) {
        this.release(node, context, handName, hand);
      }
    }

    // Check Grabs (if not already grabbed by this hand)
    if (!this.grabbedHands.has('left'))
      this.checkHandInteraction(node, context, hands.left, 'left');
    if (!this.grabbedHands.has('right'))
      this.checkHandInteraction(node, context, hands.right, 'right');

    // Two-Handed Manipulation
    if (this.grabbedHands.size === 2 && hands.left && hands.right) {
      this.updateTwoHanded(node, hands.left, hands.right);
    }
  }

  private checkHandInteraction(
    node: any,
    context: TraitContext,
    hand: VRHand | null,
    side: string
  ): void {
    if (!hand) return;
    const dist = this.getDistance(node.properties.position, hand.position);

    if (dist < 0.1) {
      if (hand.pinchStrength > 0.9) {
        this.grab(node, context, side, hand);
      }
    }
  }

  private grab(node: any, context: TraitContext, side: string, hand: VRHand): void {
    this.grabbedHands.add(side);

    if (this.grabbedHands.size === 2) {
      // Enter Manipulation Mode
      const hands = context.vr.hands;
      if (hands.left && hands.right) {
        this.initialPinchDistance = this.getDistance(hands.left.position, hands.right.position);
        this.initialScale = { ...node.properties.scale } || { x: 1, y: 1, z: 1 };

        // Reset Rotation State
        this.initialHandAngle = null;
        this.initialObjectRotation = null;

        // Optional: Release physics constraints to allow smooth scaling
        context.emit('physics_release', { nodeId: node.id });
      }
    } else {
      // Single Hand Grab - Physics Constraint
      context.emit('physics_grab', { nodeId: node.id, hand: side });
    }
  }

  private release(node: any, context: TraitContext, side: string, hand: VRHand): void {
    this.grabbedHands.delete(side);

    // Clear Rotation State on any release
    this.initialHandAngle = null;
    this.initialObjectRotation = null;

    if (this.grabbedHands.size === 1) {
      // Re-enter Single Hand Physics Mode with remaining hand
      const remainingHand = Array.from(this.grabbedHands)[0];
      context.emit('physics_grab', { nodeId: node.id, hand: remainingHand });
    } else {
      // Full Release
      context.emit('physics_release', {
        nodeId: node.id,
        hand: side,
        velocity: this.calculateThrowVelocity(hand, side),
      });
    }
  }

  private updateTwoHanded(node: any, left: VRHand, right: VRHand): void {
    const currentDist = this.getDistance(left.position, right.position);
    const scaleFactor = currentDist / this.initialPinchDistance;

    const newScale = {
      x: this.initialScale.x * scaleFactor,
      y: this.initialScale.y * scaleFactor,
      z: this.initialScale.z * scaleFactor,
    };

    node.properties.scale = newScale;

    // Rotation Logic (Steering Wheel)
    // Vector between hands
    const dx = right.position.x - left.position.x;
    const dz = right.position.z - left.position.z;
    const angle = Math.atan2(dz, dx);

    // We need initial angle to calculate delta.
    // For now, let's just rotate Y based on angle change?
    // Better: Store initial angle in grab().
    // Simplification: Just set Y rotation to angle (absolute steering) requires initial offset.

    // Let's stick to Scale for now to ensure stability, or implement simple Y rotation if requested.
    // The task asked for "scaling/rotation".
    // Let's add simple Y rotation.

    if (this.initialHandAngle === null) {
      this.initialHandAngle = angle;
      this.initialObjectRotation = node.properties.rotation
        ? { ...node.properties.rotation }
        : { x: 0, y: 0, z: 0 };
    }

    const deltaAngle = angle - this.initialHandAngle;
    // Apply to Y axis
    if (this.initialObjectRotation) {
      node.properties.rotation = {
        x: this.initialObjectRotation.x,
        y: this.initialObjectRotation.y + deltaAngle,
        z: this.initialObjectRotation.z,
      };
    }

    // TODO: Emit scale update to physics engine if body needs resizing
  }

  private initialHandAngle: number | null = null;
  private initialObjectRotation: Vector3 | null = null;

  private getDistance(p1: any, p2: any): number {
    const dx =
      p1.x !== undefined
        ? p1.x - (p2.x !== undefined ? p2.x : p2[0])
        : p1[0] - (p2.x !== undefined ? p2.x : p2[0]);
    const dy =
      p1.y !== undefined
        ? p1.y - (p2.y !== undefined ? p2.y : p2[1])
        : p1[1] - (p2.y !== undefined ? p2.y : p2[1]);
    const dz =
      p1.z !== undefined
        ? p1.z - (p2.z !== undefined ? p2.z : p2[2])
        : p1[2] - (p2.z !== undefined ? p2.z : p2[2]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private calculateThrowVelocity(hand: VRHand, side: string): [number, number, number] {
    const prevPos = this.lastHandPositions.get(side);

    if (!prevPos) return [0, 0, 0];

    // Assuming rough delta of 16ms if not passed
    const delta = 0.016;

    const velocity: [number, number, number] = [
      (hand.position.x - prevPos.x) / delta,
      (hand.position.y - prevPos.y) / delta,
      (hand.position.z - prevPos.z) / delta,
    ];

    // Clamp for sanity
    const maxVel = 20;
    return [
      Math.max(-maxVel, Math.min(maxVel, velocity[0])),
      Math.max(-maxVel, Math.min(maxVel, velocity[1])),
      Math.max(-maxVel, Math.min(maxVel, velocity[2])),
    ];
  }

  onDetach(node: any, context: TraitContext): void {
    if (this.grabbedHands.size > 0) {
      context.emit('physics_release', { nodeId: node.id });
    }
  }
}

// ── Handler wrapper (auto-generated) ──
import type { TraitHandler } from './TraitTypes';

export const grabbableHandler = {
  name: 'grabbable',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    node.__grabbableState = { active: true, config };
    ctx.emit('grabbable_attached', { node });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    ctx.emit('grabbable_detached', { node });
    delete node.__grabbableState;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    if (event.type === 'grabbable_configure') {
      Object.assign(node.__grabbableState?.config ?? {}, event.payload ?? {});
      ctx.emit('grabbable_configured', { node });
    }
  },
  onUpdate(_node: any, _config: any, _ctx: any, _dt: number): void {},
} as const satisfies TraitHandler;
