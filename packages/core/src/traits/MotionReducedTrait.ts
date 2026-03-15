/**
 * MotionReduced Trait
 *
 * Reduced motion for vestibular sensitivity and motion sickness prevention.
 * Respects system preferences and provides multiple accommodation levels.
 *
 * @version 2.0.0
 */

import type { TraitHandler } from './TraitTypes';

// =============================================================================
// TYPES
// =============================================================================

interface MotionReducedState {
  isActive: boolean;
  systemPreference: boolean;
  originalAnimations: Map<string, unknown>;
  velocityBuffer: number[];
}

interface MotionReducedConfig {
  disable_parallax: boolean;
  reduce_animations: boolean;
  static_ui: boolean;
  max_velocity: number; // m/s
  disable_camera_shake: boolean;
  teleport_instead_of_smooth: boolean;
  fade_transitions: boolean;
  auto_detect: boolean;
}

// =============================================================================
// HANDLER
// =============================================================================

export const motionReducedHandler: TraitHandler<MotionReducedConfig> = {
  name: 'motion_reduced',

  defaultConfig: {
    disable_parallax: true,
    reduce_animations: true,
    static_ui: false,
    max_velocity: 2,
    disable_camera_shake: true,
    teleport_instead_of_smooth: true,
    fade_transitions: true,
    auto_detect: true,
  },

  onAttach(node, config, context) {
    const state: MotionReducedState = {
      isActive: false,
      systemPreference: false,
      originalAnimations: new Map(),
      velocityBuffer: [],
    };
    (node as any).__motionReducedState = state;

    // Check system preference
    if (config.auto_detect) {
      context.emit?.('motion_reduced_check_system', { node });
    }

    // Register with motion system
    context.emit?.('motion_reduced_register', {
      node,
      config: {
        disableParallax: config.disable_parallax,
        reduceAnimations: config.reduce_animations,
        maxVelocity: config.max_velocity,
        disableCameraShake: config.disable_camera_shake,
        teleportTransitions: config.teleport_instead_of_smooth,
        fadeTransitions: config.fade_transitions,
      },
    });
  },

  onDetach(node, config, context) {
    const state = (node as any).__motionReducedState as MotionReducedState;

    // Restore original animations
    if (state?.isActive && state.originalAnimations.size > 0) {
      context.emit?.('motion_reduced_restore', {
        node,
        animations: Array.from(state.originalAnimations.entries()),
      });
    }

    context.emit?.('motion_reduced_unregister', { node });
    delete (node as any).__motionReducedState;
  },

  onUpdate(node, config, context, _delta) {
    const state = (node as any).__motionReducedState as MotionReducedState;
    if (!state || !state.isActive) return;

    // Velocity limiting
    if ((node as any).velocity) {
      const vel = (node as any).velocity;
      const speed = Math.sqrt(vel.x * vel.x + vel.y * vel.y + vel.z * vel.z);

      if (speed > config.max_velocity) {
        const scale = config.max_velocity / speed;
        vel.x *= scale;
        vel.y *= scale;
        vel.z *= scale;

        context.emit?.('on_motion_clamped', {
          node,
          originalSpeed: speed,
          clampedSpeed: config.max_velocity,
        });
      }
    }

    // Camera shake detection and suppression
    if (config.disable_camera_shake && (node as any).position) {
      state.velocityBuffer.push(Date.now());
      if (state.velocityBuffer.length > 10) {
        state.velocityBuffer.shift();
      }
    }
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__motionReducedState as MotionReducedState;
    if (!state) return;

    if (event.type === 'motion_reduced_system_preference') {
      state.systemPreference = event.prefersReducedMotion as boolean;

      if (config.auto_detect && state.systemPreference) {
        state.isActive = true;
        applyMotionReduction(node, config, state, context);
      }
    } else if (event.type === 'motion_reduced_enable') {
      state.isActive = true;
      applyMotionReduction(node, config, state, context);
    } else if (event.type === 'motion_reduced_disable') {
      state.isActive = false;
      restoreMotion(node, state, context);
    } else if (event.type === 'motion_reduced_toggle') {
      state.isActive = !state.isActive;
      if (state.isActive) {
        applyMotionReduction(node, config, state, context);
      } else {
        restoreMotion(node, state, context);
      }
    } else if (event.type === 'animation_start') {
      // Intercept animation starts when reduced motion is active
      if (state.isActive && config.reduce_animations) {
        const animId = event.animationId as string;
        state.originalAnimations.set(animId, event.animation);

        // Replace with instant transition or fade
        context.emit?.('motion_reduced_replace_animation', {
          node,
          animationId: animId,
          useFade: config.fade_transitions,
        });
      }
    } else if (event.type === 'camera_transition_request') {
      if (state.isActive && config.teleport_instead_of_smooth) {
        // Convert smooth transition to teleport
        context.emit?.('camera_teleport', {
          node,
          target: event.target,
          fade: config.fade_transitions,
          fadeDuration: 200,
        });
        return; // Prevent smooth transition
      }
    } else if (event.type === 'motion_reduced_query') {
      context.emit?.('motion_reduced_info', {
        queryId: event.queryId,
        node,
        isActive: state.isActive,
        systemPreference: state.systemPreference,
        config: {
          disableParallax: config.disable_parallax,
          reduceAnimations: config.reduce_animations,
          maxVelocity: config.max_velocity,
          teleportTransitions: config.teleport_instead_of_smooth,
        },
      });
    }
  },
};

function applyMotionReduction(
  node: any,
  config: MotionReducedConfig,
  state: MotionReducedState,
  context: any
): void {
  context.emit?.('motion_reduced_apply', {
    node,
    disableParallax: config.disable_parallax,
    reduceAnimations: config.reduce_animations,
    staticUI: config.static_ui,
    disableCameraShake: config.disable_camera_shake,
  });

  context.emit?.('on_motion_reduce', {
    node,
    enabled: true,
  });
}

function restoreMotion(node: any, state: MotionReducedState, context: any): void {
  context.emit?.('motion_reduced_restore', {
    node,
    animations: Array.from(state.originalAnimations.entries()),
  });

  state.originalAnimations.clear();

  context.emit?.('on_motion_reduce', {
    node,
    enabled: false,
  });
}

export default motionReducedHandler;
