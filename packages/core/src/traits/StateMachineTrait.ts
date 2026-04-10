/**
 * StateMachineTrait — v5.1
 * Finite state machine with transitions.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface StateMachineConfig {
  initial_state: string;
}

export const stateMachineHandler: TraitHandler<StateMachineConfig> = {
  name: 'state_machine',
  defaultConfig: { initial_state: 'idle' },
  onAttach(node: HSPlusNode, config: unknown): void {
    node.__smState = {
      // @ts-expect-error
      current: config.initial_state || 'idle',
      transitions: 0,
      history: [] as string[],
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__smState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: StateMachineConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__smState as
      | { current: string; transitions: number; history: string[] }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'sm:transition': {
        const from = state.current;
        state.current = event.to as string;
        state.transitions++;
        state.history.push(from);
        context.emit?.('sm:transitioned', {
          from,
          to: state.current,
          transitions: state.transitions,
        });
        break;
      }
      case 'sm:query':
        context.emit?.('sm:state', {
          current: state.current,
          transitions: state.transitions,
          history: [...state.history],
        });
        break;
    }
  },
};
export default stateMachineHandler;
