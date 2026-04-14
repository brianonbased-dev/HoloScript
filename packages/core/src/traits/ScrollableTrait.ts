import { Vector3 } from '../types/HoloScriptPlus';
import type { TraitHandler, HSPlusNode, TraitEvent, TraitContext } from './TraitTypes';
import { SpringAnimator, SpringPresets } from '@holoscript/engine/animation/SpringAnimator';

export interface ScrollableConfig {
  contentHeight: number;
  viewportHeight: number;
  friction?: number;
  elasticity?: number;
  /** Use spring physics for boundary snap-back (rubber-band effect) */
  useSpringBounce?: boolean;
}

interface ScrollState {
  offset: number;
  velocity: number;
  isDragging: boolean;
  lastY: number;
  bounceSpring: SpringAnimator | null;
}

const scrollStates = new Map<string, ScrollState>();

export const scrollableHandler: TraitHandler<ScrollableConfig> = {
  name: 'scrollable',
  defaultConfig: {
    contentHeight: 1.0,
    viewportHeight: 0.5,
    friction: 0.95,
    elasticity: 0.1,
    useSpringBounce: true,
  },

  onAttach(node: HSPlusNode, config: unknown, context: TraitContext) {
    // @ts-expect-error
    const spring = config.useSpringBounce
      ? new SpringAnimator(0, { ...SpringPresets.gentle, precision: 0.005 })
      : null;

    scrollStates.set(node.id!, {
      offset: 0,
      velocity: 0,
      isDragging: false,
      lastY: 0,
      bounceSpring: spring,
    });
  },

  onDetach(node: HSPlusNode, config: unknown, context: TraitContext) {
    scrollStates.delete(node.id!);
  },

  onUpdate(node: HSPlusNode, config: unknown, context: TraitContext, delta: number) {
    const state = scrollStates.get(node.id!);
    if (!state) return;

    // @ts-expect-error
    const maxScroll = Math.max(0, config.contentHeight - config.viewportHeight);

    // Apply inertia if not dragging
    if (!state.isDragging && Math.abs(state.velocity) > 0.001) {
      state.offset += state.velocity * delta;
      // @ts-expect-error
      state.velocity *= config.friction ?? 0.95;
    }

    // Boundary handling
    if (!state.isDragging) {
      if (state.bounceSpring) {
        // Spring-based elastic snap-back
        if (state.offset > 0) {
          state.bounceSpring.setTarget(0);
          state.bounceSpring.setValue(state.offset);
          state.velocity = 0;
        } else if (state.offset < -maxScroll) {
          state.bounceSpring.setTarget(-maxScroll);
          state.bounceSpring.setValue(state.offset);
          state.velocity = 0;
        }

        if (!state.bounceSpring.isAtRest()) {
          state.offset = state.bounceSpring.update(delta);
        }
      } else {
        // Hard clamp
        if (state.offset > 0) {
          state.offset = 0;
          state.velocity = 0;
        } else if (state.offset < -maxScroll) {
          state.offset = -maxScroll;
          state.velocity = 0;
        }
      }
    }

    // Apply offset to content container
    // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
    const contentNode = context.getNode(`${node.id}_content`);
    if (contentNode && contentNode.properties) {
      (contentNode.properties.position as unknown as number[])[1] = state.offset;
      context.emit('property_changed', {
        nodeId: `${node.id}_content`,
        property: 'position',
        value: contentNode.properties.position,
      });
    }
  },

  onEvent(node: HSPlusNode, config: unknown, context: TraitContext, event: TraitEvent) {
    const state = scrollStates.get(node.id!);
    if (!state) return;

    if (event.type === 'ui_press_start') {
      state.isDragging = true;
      state.lastY =
        ((event as Record<string, unknown>).position as { y?: number } | undefined)?.y || 0;
      state.velocity = 0;
    } else if (event.type === 'ui_press_end') {
      state.isDragging = false;
    } else if (event.type === 'ui_drag') {
      if (state.isDragging) {
        const currentY =
          ((event as Record<string, unknown>).position as { y?: number } | undefined)?.y || 0;
        const dy = currentY - state.lastY;
        state.offset += dy;
        state.velocity = dy / 0.016; // Approx velocity
        state.lastY = currentY;

        // Immediate update
        // @ts-expect-error PENDING_STRUCTURAL_HARDENING - Resolving implicit any / unknown property assignment during Singularity V2
        const contentNode = context.getNode(`${node.id}_content`);
        if (contentNode && contentNode.properties) {
          (contentNode.properties.position as unknown as number[])[1] = state.offset;
          context.emit('property_changed', {
            nodeId: `${node.id}_content`,
            property: 'position',
            value: contentNode.properties.position,
          });
        }
      }
    }
  },
};
