/**
 * QueryTrait — v5.1
 *
 * Structured query builder with filter, sort, and paginate.
 *
 * Events:
 *  query:execute   { collection, filter, sort, limit, offset }
 *  query:result    { collection, rows, total, elapsed }
 *
 * @version 1.0.0
 */

import type { TraitHandler } from './TraitTypes';

export interface QueryConfig {
  default_limit: number;
  max_limit: number;
}

export const queryHandler: TraitHandler<QueryConfig> = {
  name: 'query' as any,
  defaultConfig: { default_limit: 50, max_limit: 1000 },

  onAttach(node: any): void {
    node.__queryState = { totalQueries: 0 };
  },
  onDetach(node: any): void { delete node.__queryState; },
  onUpdate(): void {},

  onEvent(node: any, config: QueryConfig, context: any, event: any): void {
    const state = node.__queryState as { totalQueries: number } | undefined;
    if (!state) return;
    const eventType = typeof event === 'string' ? event : event.type;

    if (eventType === 'query:execute') {
      state.totalQueries++;
      const limit = Math.min((event.limit as number) ?? config.default_limit, config.max_limit);
      context.emit?.('query:result', {
        collection: event.collection ?? 'default',
        filter: event.filter,
        sort: event.sort,
        limit,
        offset: (event.offset as number) ?? 0,
        queryNumber: state.totalQueries,
      });
    }
  },
};

export default queryHandler;
