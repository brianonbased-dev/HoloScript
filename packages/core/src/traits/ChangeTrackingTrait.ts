/**
 * ChangeTrackingTrait — v5.1
 * Entity change history tracking.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface ChangeTrackingConfig {
  max_history: number;
}
export const changeTrackingHandler: TraitHandler<ChangeTrackingConfig> = {
  name: 'change_tracking',
  defaultConfig: { max_history: 100 },
  onAttach(node: HSPlusNode): void {
    node.__changeState = {
      history: [] as Array<{
        entityId: string;
        field: string;
        oldValue: unknown;
        newValue: unknown;
        ts: number;
      }>,
    };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__changeState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: ChangeTrackingConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__changeState as
      | {
          history: Array<{
            entityId: string;
            field: string;
            oldValue: unknown;
            newValue: unknown;
            ts: number;
          }>;
        }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'change:record': {
        const entry = {
          entityId: event.entityId as string,
          field: event.field as string,
          oldValue: event.oldValue,
          newValue: event.newValue,
          ts: Date.now(),
        };
        state.history.push(entry);
        if (state.history.length > config.max_history) state.history.shift();
        context.emit?.('change:recorded', entry);
        break;
      }
      case 'change:query': {
        const results = state.history.filter((e: any) => e.entityId === (event.entityId as string));
        context.emit?.('change:history', { entityId: event.entityId, changes: results });
        break;
      }
    }
  },
};
export default changeTrackingHandler;
