/**
 * @soft_body_pro Trait — PBD Deformation with Parametric Tearing
 *
 * Extends the base PBD soft body with tearing mechanics: when strain
 * exceeds a threshold, constraints are removed and mesh topology updates.
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';

interface SoftBodyProConfig {
  /** Tear threshold: strain ratio before constraint removal (default: 0.8) */
  tear_threshold: number;
  /** Color of torn surfaces (default: '#8b0000') */
  tear_color: string;
  /** Solver iterations (default: 10) */
  solver_iterations: number;
  /** Compliance (softness, default: 0.001) */
  compliance: number;
  /** Enable self-collision (default: true) */
  self_collision: boolean;
  /** Damping factor 0-1 (default: 0.99) */
  damping: number;
}

interface SoftBodyProState {
  active: boolean;
  tornConstraints: number;
  totalConstraints: number;
  deformation: number;
}

export const softBodyProHandler: TraitHandler<SoftBodyProConfig> = {
  name: 'soft_body_pro' as any,
  defaultConfig: {
    tear_threshold: 0.8,
    tear_color: '#8b0000',
    solver_iterations: 10,
    compliance: 0.001,
    self_collision: true,
    damping: 0.99,
  },

  onAttach(node, config, context) {
    const state: SoftBodyProState = {
      active: true,
      tornConstraints: 0,
      totalConstraints: 0,
      deformation: 0,
    };
    (node as any).__softBodyProState = state;

    context.emit('soft_body_pro_create', {
      tearThreshold: config.tear_threshold,
      tearColor: config.tear_color,
      solverIterations: config.solver_iterations,
      compliance: config.compliance,
      selfCollision: config.self_collision,
      damping: config.damping,
    });
  },

  onDetach(node, _config, context) {
    if ((node as any).__softBodyProState) {
      context.emit('soft_body_pro_destroy', { nodeId: node.id });
      delete (node as any).__softBodyProState;
    }
  },

  onUpdate(node, config, context, delta) {
    const state = (node as any).__softBodyProState as SoftBodyProState | undefined;
    if (!state?.active) return;

    context.emit('soft_body_pro_step', {
      deltaTime: delta,
      tearThreshold: config.tear_threshold,
    });
  },

  onEvent(node, config, context, event) {
    const state = (node as any).__softBodyProState as SoftBodyProState | undefined;
    if (!state) return;

    switch (event.type) {
      case 'soft_body_pro_tear_report': {
        const e = event as any;
        state.tornConstraints = e.tornCount ?? state.tornConstraints;
        state.totalConstraints = e.totalCount ?? state.totalConstraints;
        context.emit('on_soft_body_tear', {
          tornConstraints: state.tornConstraints,
          tearRatio:
            state.totalConstraints > 0 ? state.tornConstraints / state.totalConstraints : 0,
        });
        break;
      }
      case 'soft_body_pro_apply_force':
        context.emit('soft_body_pro_impulse', {
          position: (event as any).position,
          force: (event as any).force,
          radius: (event as any).radius ?? 1.0,
        });
        break;
      case 'soft_body_pro_reset':
        state.tornConstraints = 0;
        state.deformation = 0;
        context.emit('soft_body_pro_reset', {});
        break;
    }
  },
};
