import type { Vector3 } from '../types';
import type { TraitHandler, HSPlusNode, VRHand, TraitEvent, TraitInstanceDelegate } from './TraitTypes';
/**
 * GrabbableTrait.ts
 *
 * Makes an object grabbable by VR hands.
 * Uses physics joints to attach the object to the hand when pinched.
 */

import { Trait } from './Trait';
import { TraitContext } from './VRTraitSystem';

export class GrabbableTrait implements Trait {
  name = 'grabbable';
  private grabbedHands: Set<string> = new Set();
  private initialPinchDistance: number = 0;
  private initialScale: Vector3 = [1, 1, 1];

  private lastHandPositions: Map<string, Vector3> = new Map();
  private lastHandTime: number = 0;

  onUpdate(node: Record<string, unknown>, context: TraitContext, delta: number): void {
    const n = node as unknown as HSPlusNode;
    const hands = context.vr.hands;
    const now = performance.now();

    // Update history for velocity calculation
    if (hands.left) this.lastHandPositions.set('left', this.toArr3(hands.left.position));
    if (hands.right) this.lastHandPositions.set('right', this.toArr3(hands.right.position));
    this.lastHandTime = now;

    // Check Releases
    for (const handName of this.grabbedHands) {
      // ... rest of loop
      const hand = handName === 'left' ? hands.left : hands.right;
      if (hand && (hand.pinchStrength ?? 0) < 0.5) {
        this.release(n, context, handName, hand);
      }
    }

    // Check Grabs (if not already grabbed by this hand)
    if (!this.grabbedHands.has('left'))
      this.checkHandInteraction(n, context, hands.left, 'left');
    if (!this.grabbedHands.has('right'))
      this.checkHandInteraction(n, context, hands.right, 'right');

    // Two-Handed Manipulation
    if (this.grabbedHands.size === 2 && hands.left && hands.right) {
      this.updateTwoHanded(n, hands.left, hands.right);
    }
  }

  private checkHandInteraction(
    node: HSPlusNode,
    context: TraitContext,
    hand: VRHand | null,
    side: string
  ): void {
    if (!hand) return;
    const pos = node.properties?.position;
    if (!pos) return;
    const dist = this.getDistance(pos, hand.position);

    if (dist < 0.1) {
      if ((hand.pinchStrength ?? 0) > 0.9) {
        this.grab(node, context, side, hand);
      }
    }
  }

  private grab(node: HSPlusNode, context: TraitContext, side: string, hand: VRHand): void {
    this.grabbedHands.add(side);

    if (this.grabbedHands.size === 2) {
      // Enter Manipulation Mode
      const hands = context.vr.hands;
      if (hands.left && hands.right) {
        this.initialPinchDistance = this.getDistance(hands.left.position, hands.right.position);
        this.initialScale = node.properties?.scale
          ? ([...(node.properties.scale as Vector3)] as Vector3)
          : ([1, 1, 1] as Vector3);

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

  private release(node: HSPlusNode, context: TraitContext, side: string, hand: VRHand): void {
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

  private updateTwoHanded(node: HSPlusNode, left: VRHand, right: VRHand): void {
    const currentDist = this.getDistance(left.position, right.position);
    const scaleFactor = currentDist / this.initialPinchDistance;

    const newScale = [
      this.initialScale[0] * scaleFactor,
      this.initialScale[1] * scaleFactor,
      this.initialScale[2] * scaleFactor,
    ];

    if (node.properties) node.properties.scale = newScale as Vector3;

    // Rotation Logic (Steering Wheel)
    // Vector between hands
    const [rx, , rz] = this.toArr3(right.position);
    const [lx, , lz] = this.toArr3(left.position);
    const dx = rx - lx;
    const dz = rz - lz;
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
      this.initialObjectRotation = node.properties?.rotation
        ? ([...(node.properties.rotation as Vector3)] as Vector3)
        : ([0, 0, 0] as Vector3);
    }

    const deltaAngle = angle - this.initialHandAngle;
    // Apply to Y axis
    if (this.initialObjectRotation) {
      if (node.properties) {
        node.properties.rotation = [
          this.initialObjectRotation[0],
          this.initialObjectRotation[1] + deltaAngle,
          this.initialObjectRotation[2],
        ] as Vector3;
      }
    }

    // Scale update is applied to node.properties.scale above.
    // The physics engine picks up scale changes on the next simulation step.
  }

  private initialHandAngle: number | null = null;
  private initialObjectRotation: Vector3 | null = null;

  private toArr3(
    v: [number, number, number] | [number, number, number]
  ): [number, number, number] {
    return Array.isArray(v) ? v : [v[0], v[1], v[2]];
  }

  private getDistance(
    p1: [number, number, number] | [number, number, number],
    p2: [number, number, number] | [number, number, number]
  ): number {
    const x1 = Array.isArray(p1) ? p1[0] : (p1[0] ?? 0);
    const y1 = Array.isArray(p1) ? p1[1] : (p1[1] ?? 0);
    const z1 = Array.isArray(p1) ? p1[2] : (p1[2] ?? 0);
    const x2 = Array.isArray(p2) ? p2[0] : (p2[0] ?? 0);
    const y2 = Array.isArray(p2) ? p2[1] : (p2[1] ?? 0);
    const z2 = Array.isArray(p2) ? p2[2] : (p2[2] ?? 0);
    const dx = x1 - x2;
    const dy = y1 - y2;
    const dz = z1 - z2;
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  }

  private calculateThrowVelocity(hand: VRHand, side: string): [number, number, number] {
    const prevPos = this.lastHandPositions.get(side);

    if (!prevPos) return [0, 0, 0];

    // Assuming rough delta of 16ms if not passed
    const delta = 0.016;

    const hp = this.toArr3(hand.position);
    const velocity: [number, number, number] = [
      (hp[0] - prevPos[0]) / delta,
      (hp[1] - prevPos[1]) / delta,
      (hp[2] - prevPos[2]) / delta,
    ];

    // Clamp for sanity
    const maxVel = 20;
    return [
      Math.max(-maxVel, Math.min(maxVel, velocity[0])),
      Math.max(-maxVel, Math.min(maxVel, velocity[1])),
      Math.max(-maxVel, Math.min(maxVel, velocity[2])),
    ];
  }

  onDetach(node: Record<string, unknown>, context: TraitContext): void {
    if (this.grabbedHands.size > 0) {
      context.emit('physics_release', { nodeId: (node as unknown as HSPlusNode).id });
    }
  }
}

// ── Handler (delegates to GrabbableTrait) ──

export const grabbableHandler = {
  name: 'grabbable',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    const instance = new GrabbableTrait();
    node.__grabbable_instance = instance;
    ctx.emit('grabbable_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__grabbable_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('grabbable_detached', { node });
    delete node.__grabbable_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__grabbable_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'grabbable_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('grabbable_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__grabbable_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
