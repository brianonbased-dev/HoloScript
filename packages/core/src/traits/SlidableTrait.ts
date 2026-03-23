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

  onAttach(node: any, context: TraitContext): void {
    const axis = node.properties.axis || 'x';
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
      max: length / 2,
      // friction: 0.5 // TODO: Support friction in constraint event
    });
  }

  private initialPos: { x: number; y: number; z: number } | null = null;
  private lastValue: number = 0;

  onUpdate(node: any, context: TraitContext, _delta: number): void {
    if (!this.initialPos) {
      this.initialPos = node.properties.position
        ? { ...node.properties.position }
        : { x: 0, y: 0, z: 0 };
    }

    const currentPos = context.physics.getBodyPosition(node.id);
    if (!currentPos || !this.initialPos) return;

    const axis = node.properties.axis || 'x';
    const length = node.properties.length || 0.1;

    // Project position difference onto axis
    let delta = 0;
    if (axis === 'x') delta = currentPos.x - this.initialPos.x;
    if (axis === 'y') delta = currentPos.y - this.initialPos.y;
    if (axis === 'z') delta = currentPos.z - this.initialPos.z;

    // Normalize to 0-1 based on length (-length/2 to length/2)
    // Constraint min = -length/2, max = length/2
    // Value 0 = min, Value 1 = max

    // Position relative to center (initialPos) runs from -L/2 to L/2
    // So Value = (delta - (-L/2)) / L = (delta + L/2) / L

    let value = (delta + length / 2) / length;
    value = Math.max(0, Math.min(1, value)); // Clamp

    if (Math.abs(value - this.lastValue) > 0.01) {
      node.properties.value = value;
      context.emit('ui_value_change', { nodeId: node.id, value });

      // Haptic Tick
      // trigger every 10% change?
      if (Math.floor(value * 10) !== Math.floor(this.lastValue * 10)) {
        context.haptics.rumble('right', 0.2); // TODO: Hand detection
        context.haptics.rumble('left', 0.2);
      }

      this.lastValue = value;
    }
  }
}

// ── Handler (delegates to SlidableTrait) ──
import type { TraitHandler } from './TraitTypes';

export const slidableHandler = {
  name: 'slidable',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    const instance = new SlidableTrait();
    node.__slidable_instance = instance;
    ctx.emit('slidable_attached', { node, config });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    const instance = node.__slidable_instance;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('slidable_detached', { node });
    delete node.__slidable_instance;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    const instance = node.__slidable_instance;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'slidable_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('slidable_configured', { node });
    }
  },
  onUpdate(node: any, _config: any, ctx: any, dt: number): void {
    const instance = node.__slidable_instance;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
