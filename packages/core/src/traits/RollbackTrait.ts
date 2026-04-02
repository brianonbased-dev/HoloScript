/**
 * RollbackTrait — v5.1
 *
 * Rollback to a previous deployment version.
 *
 * Events:
 *  rollback:trigger   { deployId, targetVersion }
 *  rollback:complete  { deployId, rolledBackTo }
 *  rollback:history   { entries[] }
 */

import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';

export interface RollbackConfig {
  max_history: number;
}

export const rollbackHandler: TraitHandler<RollbackConfig> = {
  name: 'rollback',
  defaultConfig: { max_history: 20 },

  onAttach(node: HSPlusNode): void {
    node.__rollbackState = { history: [] as Array<{ version: string; timestamp: number }> };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__rollbackState;
  },
  onUpdate(): void {},

  onEvent(node: HSPlusNode, config: RollbackConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__rollbackState as
      | { history: Array<{ version: string; timestamp: number }> }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;

    switch (t) {
      case 'rollback:trigger': {
        const version = (event.targetVersion as string) ?? 'previous';
        state.history.push({ version, timestamp: Date.now() });
        if (state.history.length > config.max_history) state.history.shift();
        context.emit?.('rollback:complete', { deployId: event.deployId, rolledBackTo: version });
        break;
      }
      case 'rollback:get_history': {
        context.emit?.('rollback:history', {
          entries: [...state.history],
          count: state.history.length,
        });
        break;
      }
    }
  },
};

export default rollbackHandler;
