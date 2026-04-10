/**
 * SchemaMigrateTrait — v5.1
 * Schema migration versioning.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface SchemaMigrateConfig {
  auto_rollback: boolean;
}
export const schemaMigrateHandler: TraitHandler<SchemaMigrateConfig> = {
  name: 'schema_migrate',
  defaultConfig: { auto_rollback: true },
  onAttach(node: HSPlusNode): void {
    node.__migrateState = { version: 0, history: [] as number[] };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__migrateState;
  },
  onUpdate(): void {},
  onEvent(
    node: HSPlusNode,
    _config: SchemaMigrateConfig,
    context: TraitContext,
    event: TraitEvent
  ): void {
    const state = node.__migrateState as { version: number; history: number[] } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'migrate:up':
        state.history.push(state.version);
        state.version = (event.version as number) ?? state.version + 1;
        context.emit?.('migrate:applied', { version: state.version });
        break;
      case 'migrate:down': {
        const prev = state.history.pop();
        if (prev !== undefined) state.version = prev;
        context.emit?.('migrate:rolled_back', { version: state.version });
        break;
      }
    }
  },
};
export default schemaMigrateHandler;
