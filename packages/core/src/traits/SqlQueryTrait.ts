/**
 * SqlQueryTrait — v5.1
 * Native SQL query execution.
 */
import type { TraitHandler, TraitContext, TraitEvent } from './TraitTypes';
import type { HSPlusNode } from '../types/HoloScriptPlus';
export interface SqlQueryConfig { max_results: number; }
export const sqlQueryHandler: TraitHandler<SqlQueryConfig> = {
  name: 'sql_query', defaultConfig: { max_results: 1000 },
  onAttach(node: HSPlusNode): void { node.__sqlState = { queries: 0, results: [] as unknown[] }; },
  onDetach(node: HSPlusNode): void { delete node.__sqlState; },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, config: SqlQueryConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__sqlState as { queries: number; results: any[] } | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'sql:exec': state.queries++; context.emit?.('sql:result', { query: event.query, queryCount: state.queries, maxResults: config.max_results }); break;
      case 'sql:prepare': context.emit?.('sql:prepared', { statement: event.statement, params: event.params }); break;
    }
  },
};
export default sqlQueryHandler;
