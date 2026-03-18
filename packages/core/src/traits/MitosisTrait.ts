/**
 * Mitosis Trait
 *
 * Implements Phase 6 'Swarm Mastery'.
 * Enables hierarchical agent spawning, delegation, and state synchronization.
 */

import { TraitHandler } from './TraitTypes';
import { HSPlusNode, VRTraitName } from '../types';

interface MitosisState {
  parent_id: string | null;
  active_children: string[];
  tasks_delegated: number;
  completed_tasks: number;
  last_sync_time: number;
}

interface MitosisConfig {
  strategy: 'collaborative' | 'autonomous' | 'swarm';
  max_children: number;
  auto_cleanup: boolean;
}

interface MitosisHSPlusNode extends HSPlusNode {
  __mitosisState?: MitosisState;
}

export const mitosisHandler: TraitHandler<MitosisConfig> = {
  name: 'mitosis' as VRTraitName,

  defaultConfig: {
    strategy: 'collaborative',
    max_children: 5,
    auto_cleanup: true,
  },

  onAttach(node, config, context) {
    const state: MitosisState = {
      parent_id: ('parent_id' in config ? (config as any).parent_id : null) || null,
      active_children: [],
      tasks_delegated: 0,
      completed_tasks: 0,
      last_sync_time: Date.now(),
    };
    (node as MitosisHSPlusNode).__mitosisState = state;

    context.emit?.('mitosis_init', {
      nodeId: node.id,
      strategy: config.strategy,
      parent_id: state.parent_id,
    });
  },

  onDetach(node, config, context) {
    const state = (node as MitosisHSPlusNode).__mitosisState;
    if (state && config.auto_cleanup) {
      for (const childId of state.active_children) {
        context.emit?.('mitosis_despawn_child', { childId });
      }
    }
    delete (node as MitosisHSPlusNode).__mitosisState;
  },

  onEvent(node, config, context, event) {
    const state = (node as MitosisHSPlusNode).__mitosisState;
    if (!state) return;

    if (event.type === 'mitosis_spawned') {
      const childId = event.childId as string;
      const parentId = event.parentId as string;

      if (node.id === parentId) {
        state.active_children.push(childId);
        state.tasks_delegated++;
        context.emit?.('on_mitosis_spawned', { childId, parentId: node.id });
      }
    } else if (event.type === 'mitosis_child_complete') {
      const childId = 'childId' in event ? event.childId as string : '';
      const parentId = 'parentId' in event ? event.parentId as string : '';
      const result = 'result' in event ? event.result : undefined;

      if (node.id === parentId) {
        state.completed_tasks++;
        state.last_sync_time = Date.now();

        context.emit?.('mitosis_synced', {
          parentId: node.id,
          childId,
          result,
        });

        if (config.strategy === 'collaborative') {
          // Merge child results into parent variables/state
          if (result && typeof result === 'object') {
            Object.assign(node.properties || {}, result);
          }
        }
      }
    } else if (event.type === 'mitosis_child_failed') {
      context.emit?.('on_mitosis_error', {
        parentId: node.id,
        childId: event.childId,
        error: event.error,
      });
    }
  },
};

export default mitosisHandler;
