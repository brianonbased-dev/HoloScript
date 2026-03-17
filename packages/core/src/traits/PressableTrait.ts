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
import { TraitContext } from './VRTraitSystem';

export class PressableTrait implements Trait {
  name = 'pressable';
  private isPressed: boolean = false;
  private initialPos: { x: number; y: number; z: number } | null = null; // Local offset?

  onAttach(node: any, context: TraitContext): void {
    const distance = node.properties.distance || 0.01;
    const stiffness = node.properties.stiffness || 100;
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

  onUpdate(node: any, context: TraitContext, _delta: number): void {
    if (!this.initialPos) {
      // Capture initial position on first update (assuming simulation settled or static start)
      // Better: capture onAttach, but onAttach might be before physics/layout settle.
      // Let's rely on node.properties.position for initial reference if not set.
      this.initialPos = node.properties.position
        ? { ...node.properties.position }
        : { x: 0, y: 0, z: 0 };
    }

    const currentPos = context.physics.getBodyPosition(node.id);
    if (!currentPos || !this.initialPos) return;

    // Calculate depression along Z axis (local)
    // Assumptions: Button moves along Positive Z or Negative Z?
    // Prismatic setup was local Z (0,0,1).
    // Depression = difference in Z.
    // TODO: Handle rotation! For now assume world-aligned or use local transform logic.
    // If we assume the button only moves along Z, we can check distance.

    const dist = Math.abs((currentPos as any).z - this.initialPos.z);

    // Config
    const maxDist = node.properties.distance || 0.01;
    const triggerPoint = node.properties.triggerPoint || 0.5; // 50% max distance
    const releasePoint = node.properties.releasePoint || 0.3; // Hysteresis

    const depression = Math.min(dist / maxDist, 1.0);

    // Check State
    if (!this.isPressed && depression > triggerPoint) {
      this.isPressed = true;
      context.emit('ui_press_start', { nodeId: node.id });
      context.haptics.pulse('left', 0.5, 20); // TODO: Which hand pressed? We don't know from physics alone.
      context.haptics.pulse('right', 0.5, 20); // Pulse both for now or track collision contacts.
    } else if (this.isPressed && depression < releasePoint) {
      this.isPressed = false;
      context.emit('ui_press_end', { nodeId: node.id });
      context.haptics.pulse('left', 0.3, 10);
      context.haptics.pulse('right', 0.3, 10);
    }
  }
}

// ── Handler (delegates to PressableTrait) ──
import type { TraitHandler } from './TraitTypes';

export const pressableHandler = {
  name: 'pressable',
  defaultConfig: {},
  onAttach(node: any, config: any, ctx: any): void {
    const instance = new PressableTrait();
    node.__pressable_instance = instance;
    ctx.emit('pressable_attached', { node, config });
  },
  onDetach(node: any, _config: any, ctx: any): void {
    const instance = node.__pressable_instance;
    if (instance) {
      if (typeof instance.onDetach === 'function') instance.onDetach(node, ctx);
      else if (typeof instance.dispose === 'function') instance.dispose();
      else if (typeof instance.cleanup === 'function') instance.cleanup();
    }
    ctx.emit('pressable_detached', { node });
    delete node.__pressable_instance;
  },
  onEvent(node: any, _config: any, ctx: any, event: any): void {
    const instance = node.__pressable_instance;
    if (!instance) return;
    if (typeof instance.onEvent === 'function') instance.onEvent(event);
    else if (typeof instance.emit === 'function' && event.type) instance.emit(event);
    if (event.type === 'pressable_configure' && event.payload) {
      Object.assign(instance, event.payload);
      ctx.emit('pressable_configured', { node });
    }
  },
  onUpdate(node: any, _config: any, ctx: any, dt: number): void {
    const instance = node.__pressable_instance;
    if (!instance) return;
    if (typeof instance.onUpdate === 'function') instance.onUpdate(node, ctx, dt);
  },
} as const satisfies TraitHandler;
