/**
 * PressableTrait.ts
 *
 * Turns an entity into a physical 3D button.
 * Uses a Prismatic Joint (Slider) with a spring force to simulate a mechanical button.
 *
 * Properties:
 * - distance: Max depression distance (meters). Default 0.01 (1cm).
 * - spring: Spring strength.
 * - damping: Spring damping.
 * - triggerPoint: Normalized point (0-1) where 'press' event fires.
 */

import { Trait } from './Trait';
import type { TraitContext } from './TraitTypes';

export class PressableTrait implements Trait {
  name = 'pressable';
  private isPressed: boolean = false;
  private initialPos: { x: number; y: number; z: number } | null = null; // Local offset?

  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  onAttach(node: HSPlusNode, context: TraitContext): void {
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const distance = node.properties.distance || 0.01;
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const stiffness = node.properties.stiffness || 100;
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const damping = node.properties.damping || 5;

    // Request Physics Constraint: Prismatic (Slider) along local Z
    // The anchor is the parent or world. If parent is null, it's anchored to world start pos.
    context.emit('physics_add_constraint', {
      type: 'prismatic',
      nodeId: node.id,
      axis: { x: 0, y: 0, z: 1 }, // Local Z
      min: 0,
      max: distance,
      spring: { stiffness, damping, restLength: 0 }, // Spring pulls back to 0
    });
  }

  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  onUpdate(node: HSPlusNode, context: TraitContext, _delta: number): void {
    if (!this.initialPos) {
      // Capture initial position on first update (assuming simulation settled or static start)
      // Better: capture onAttach, but onAttach might be before physics/layout settle.
      // Let's rely on node.properties.position for initial reference if not set.
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      this.initialPos = node.properties.position
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        ? { ...node.properties.position }
        : { x: 0, y: 0, z: 0 };
    }

    const currentPos = context.physics.getBodyPosition((node.id as string));
    if (!currentPos || !this.initialPos) return;

    // Calculate depression along Z axis (local)
    // Assumptions: Button moves along Positive Z or Negative Z?
    // Prismatic setup was local Z (0,0,1).
    // Depression = difference in Z.
    // NOTE: Assumes world-aligned button (Z-axis depression). Rotated buttons would need
    // inverse-transform of currentPos into local space before measuring depression.

    // @ts-expect-error During migration
    const dist = Math.abs(currentPos.z - this.initialPos.z);

    // Config
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const maxDist = node.properties.distance || 0.01;
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const triggerPoint = node.properties.triggerPoint || 0.5; // 50% max distance
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const releasePoint = node.properties.releasePoint || 0.3; // Hysteresis

    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const depression = Math.min(dist / maxDist, 1.0);

    // Check State
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    if (!this.isPressed && depression > triggerPoint) {
      this.isPressed = true;
      context.emit('ui_press_start', { nodeId: node.id });
      // Pulse both hands — physics contact alone doesn't identify which hand pressed.
      context.haptics.pulse('left', 0.5, 20);
      context.haptics.pulse('right', 0.5, 20);
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    } else if (this.isPressed && depression < releasePoint) {
      this.isPressed = false;
      context.emit('ui_press_end', { nodeId: node.id });
      context.haptics.pulse('left', 0.3, 10);
      context.haptics.pulse('right', 0.3, 10);
    }
  }
}

// ── Handler (delegates to PressableTrait) ──
import type { TraitHandler, HSPlusNode, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const pressableHandler = {
  name: 'pressable',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    const instance = new PressableTrait();
    node.__pressable_instance = instance;
    ctx.emit('pressable_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__pressable_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('pressable_detached', { node });
    delete node.__pressable_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__pressable_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'pressable_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('pressable_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__pressable_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
