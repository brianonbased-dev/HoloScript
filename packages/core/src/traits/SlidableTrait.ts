/**
 * SlidableTrait.ts
 *
 * Turns an entity into a physical slider or lever.
 *
 * Properties:
 * - axis: 'x', 'y', 'z'.
 * - length: Length of track (meters).
 * - value: Current value (0-1).
 */

import { Trait } from './Trait';
import type { TraitContext } from './TraitTypes';

export class SlidableTrait implements Trait {
  name = 'slidable';

  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  onAttach(node: HSPlusNode, context: TraitContext): void {
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const axis = node.properties.axis || 'x';
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const length = node.properties.length || 0.1;

    let axisVec = { x: 1, y: 0, z: 0 };
    if (axis === 'y') axisVec = { x: 0, y: 1, z: 0 };
    if (axis === 'z') axisVec = { x: 0, y: 0, z: 1 };

    // Request Prismatic Constraint without spring (or weak spring/friction for "feel")
    context.emit('physics_add_constraint', {
      type: 'prismatic',
      nodeId: node.id,
      axis: axisVec,
      min: -length / 2,
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      max: length / 2,
      // friction: 0.5 // Not yet supported by the physics_add_constraint event schema
    });
  }

  private initialPos: { x: number; y: number; z: number } | null = null;
  private lastValue: number = 0;

  // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
  onUpdate(node: HSPlusNode, context: TraitContext, _delta: number): void {
    if (!this.initialPos) {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      this.initialPos = node.properties.position
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        ? { ...node.properties.position }
        : { x: 0, y: 0, z: 0 };
    }

    const currentPos = context.physics.getBodyPosition((node.id as string));
    if (!currentPos || !this.initialPos) return;

    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const axis = node.properties.axis || 'x';
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const length = node.properties.length || 0.1;

    // Project position difference onto axis
    let delta = 0;
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    if (axis === 'x') delta = currentPos.x - this.initialPos.x;
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    if (axis === 'y') delta = currentPos.y - this.initialPos.y;
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    if (axis === 'z') delta = currentPos.z - this.initialPos.z;

    // Normalize to 0-1 based on length (-length/2 to length/2)
    // Constraint min = -length/2, max = length/2
    // Value 0 = min, Value 1 = max

    // Position relative to center (initialPos) runs from -L/2 to L/2
    // So Value = (delta - (-L/2)) / L = (delta + L/2) / L

    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    let value = (delta + length / 2) / length;
    value = Math.max(0, Math.min(1, value)); // Clamp

    if (Math.abs(value - this.lastValue) > 0.01) {
      // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
      node.properties.value = value;
      context.emit('ui_value_change', { nodeId: node.id, value });

      // Haptic Tick
      // trigger every 10% change?
      if (Math.floor(value * 10) !== Math.floor(this.lastValue * 10)) {
        // Rumble both hands — physics contact alone doesn't identify which hand is sliding.
        context.haptics.rumble('right', 0.2);
        context.haptics.rumble('left', 0.2);
      }

      this.lastValue = value;
    }
  }
}

// ── Handler (delegates to SlidableTrait) ──
import type { TraitHandler, HSPlusNode, TraitEvent, TraitInstanceDelegate } from './TraitTypes';

export const slidableHandler = {
  name: 'slidable',
  defaultConfig: {},
  onAttach(node: HSPlusNode, config: unknown, ctx: TraitContext): void {
    const instance = new SlidableTrait();
    node.__slidable_instance = instance;
    ctx.emit('slidable_attached', { node, config });
  },
  onDetach(node: HSPlusNode, _config: unknown, ctx: TraitContext): void {
    const instance = node.__slidable_instance as TraitInstanceDelegate;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('slidable_detached', { node });
    delete node.__slidable_instance;
  },
  onEvent(node: HSPlusNode, _config: unknown, ctx: TraitContext, event: TraitEvent): void {
    const instance = node.__slidable_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'slidable_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('slidable_configured', { node });
    }
  },
  onUpdate(node: HSPlusNode, _config: unknown, ctx: TraitContext, dt: number): void {
    const instance = node.__slidable_instance as TraitInstanceDelegate;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
