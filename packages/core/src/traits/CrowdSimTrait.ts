/**
 * @crowd_sim Trait — GPU Crowd Simulation
 *
 * Large-scale crowd simulation using GPU spatial hash and bitonic sort.
 * Supports up to 10K+ agents with flocking, avoidance, and goal-seeking.
 *
 * @module traits
 */

import type { TraitHandler } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';

interface CrowdSimConfig {
  /** Maximum agent count (default: 1000) */
  max_agents: number;
  /** Agent speed in units/sec (default: 1.5) */
  speed: number;
  /** Avoidance radius (default: 1.0) */
  avoidance_radius: number;
  /** Goal-seeking weight (default: 1.0) */
  goal_weight: number;
  /** Flocking separation weight (default: 1.5) */
  separation_weight: number;
  /** Flocking alignment weight (default: 1.0) */
  alignment_weight: number;
  /** Flocking cohesion weight (default: 0.8) */
  cohesion_weight: number;
  /** LOD levels for agent rendering (default: 3) */
  lod_levels: number;
  /** Use GPU spatial hash (default: true) */
  use_gpu: boolean;
}

interface CrowdSimState {
  active: boolean;
  agentCount: number;
  goals: Map<string, [number, number, number]>;
}

/** Module-level state store to avoid casting node to any */
const traitState = new WeakMap<HSPlusNode, CrowdSimState>();

export const crowdSimHandler: TraitHandler<CrowdSimConfig> = {
  name: 'crowd_sim',
  defaultConfig: {
    max_agents: 1000,
    speed: 1.5,
    avoidance_radius: 1.0,
    goal_weight: 1.0,
    separation_weight: 1.5,
    alignment_weight: 1.0,
    cohesion_weight: 0.8,
    lod_levels: 3,
    use_gpu: true,
  },

  onAttach(node, config, context) {
    const state: CrowdSimState = {
      active: true,
      agentCount: 0,
      goals: new Map(),
    };
    traitState.set(node, state);
    node.__crowdSimState = state;

    context.emit('crowd_sim_create', {
      maxAgents: config.max_agents,
      speed: config.speed,
      avoidanceRadius: config.avoidance_radius,
      flocking: {
        separation: config.separation_weight,
        alignment: config.alignment_weight,
        cohesion: config.cohesion_weight,
      },
      lodLevels: config.lod_levels,
      useGPU: config.use_gpu,
    });
  },

  onDetach(node, _config, context) {
    if (traitState.has(node)) {
      context.emit('crowd_sim_destroy', { nodeId: node.id });
      traitState.delete(node);
      delete node.__crowdSimState;
    }
  },

  onUpdate(node, config, context, delta) {
    const state = traitState.get(node);
    if (!state?.active) return;

    context.emit('crowd_sim_step', {
      deltaTime: delta,
      agentCount: state.agentCount,
    });
  },

  onEvent(node, config, context, event) {
    const state = traitState.get(node);
    if (!state) return;

    switch (event.type) {
      case 'crowd_spawn_agents': {
        const count = (event.count as number) ?? 1;
        state.agentCount = Math.min(state.agentCount + count, config.max_agents);
        context.emit('crowd_sim_spawn', {
          count,
          position: event.position,
          agentCount: state.agentCount,
        });
        break;
      }
      case 'crowd_set_goal': {
        const groupId = (event.groupId as string) ?? 'default';
        state.goals.set(groupId, event.position as [number, number, number]);
        context.emit('crowd_sim_goal', {
          groupId,
          position: event.position,
        });
        break;
      }
      case 'crowd_clear':
        state.agentCount = 0;
        state.goals.clear();
        context.emit('crowd_sim_clear', {});
        break;
    }
  },
};
