/**
 * SqlQueryTrait — v5.1
 * Native SQL query execution.
 */
import type { TraitHandler } from './TraitTypes';
export interface SqlQueryConfig { max_results: number; }
export const sqlQueryHandler: TraitHandler<SqlQueryConfig> = {
  name: 'sql_query' as any, defaultConfig: { max_results: 1000 },
  onAttach(node: any): void { node.__sqlState = { queries: 0, results: [] as any[] }; },
  onDetach(node: any): void { delete node.__sqlState; },
  onUpdate(): void {},
  onEvent(node: any, config: SqlQueryConfig, context: any, event: any): void {
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
