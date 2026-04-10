/**
 * GraphqlTrait — v5.1
 * GraphQL schema/resolver management.
 */
import type { TraitHandler, HSPlusNode, TraitContext, TraitEvent } from './TraitTypes';
export interface GraphqlConfig {
  depth_limit: number;
}
export const graphqlHandler: TraitHandler<GraphqlConfig> = {
  name: 'graphql',
  defaultConfig: { depth_limit: 10 },
  onAttach(node: HSPlusNode): void {
    node.__gqlState = { resolvers: new Map<string, string>(), queries: 0 };
  },
  onDetach(node: HSPlusNode): void {
    delete node.__gqlState;
  },
  onUpdate(): void {},
  onEvent(node: HSPlusNode, _config: GraphqlConfig, context: TraitContext, event: TraitEvent): void {
    const state = node.__gqlState as
      | { resolvers: Map<string, string>; queries: number }
      | undefined;
    if (!state) return;
    const t = typeof event === 'string' ? event : event.type;
    switch (t) {
      case 'gql:register':
        state.resolvers.set(event.typeName as string, (event.field as string) ?? '');
        context.emit?.('gql:registered', { typeName: event.typeName, total: state.resolvers.size });
        break;
      case 'gql:query':
        state.queries++;
        context.emit?.('gql:result', { query: event.query, queryCount: state.queries });
        break;
    }
  },
};
export default graphqlHandler;
