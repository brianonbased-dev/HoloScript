/**
 * StateTrait.ts
 *
 * Declarative FSM attachment to HoloScript+ nodes.
 * Allows nodes to define states and transitions as trait config.
 *
 * @trait state
 */

import type { TraitHandler } from '../traits/TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
import { StateMachine, StateMachineConfig } from './StateMachine';

// =============================================================================
// CONFIG
// =============================================================================

export interface StateTraitConfig {
  machine: StateMachineConfig;
}

// Extended properties interface for state-aware nodes
interface StateAwareProperties {
  _state?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- extensible properties bag
  [key: string]: unknown;
}

// Per-node state machines
const nodeStateMachines = new Map<string, StateMachine>();

export const stateTraitHandler: TraitHandler<StateTraitConfig> = {
  name: 'state' as const,
  defaultConfig: { machine: { initialState: 'idle', states: [], transitions: [] } },

  onAttach(node: HSPlusNode, config: StateTraitConfig, _context: unknown) {
    const nodeId = node.id!;
    const sm = new StateMachine(config.machine);
    nodeStateMachines.set(nodeId, sm);

    // Surface state on node properties
    if (node.properties) {
      (node.properties as StateAwareProperties)._state = sm.getCurrentState();
    }
  },

  onDetach(node: HSPlusNode, _config: StateTraitConfig, _context: unknown) {
    nodeStateMachines.delete(node.id!);
  },

  onUpdate(node: HSPlusNode, _config: StateTraitConfig, _context: unknown, delta: number) {
    const sm = nodeStateMachines.get(node.id!);
    if (!sm) return;

    sm.update(delta);

    if (node.properties) {
      (node.properties as StateAwareProperties)._state = sm.getCurrentState();
    }
  },
};

/**
 * Get the StateMachine for a given node (for external event sending).
 */
export function getNodeStateMachine(nodeId: string): StateMachine | undefined {
  return nodeStateMachines.get(nodeId);
}
