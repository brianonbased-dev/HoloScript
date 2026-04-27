/**
 * GraphqlTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { graphqlHandler } from '../GraphqlTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __gqlState: undefined as unknown,
});

const defaultConfig = { depth_limit: 10 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('GraphqlTrait — metadata', () => {
  it('has name "graphql"', () => {
    expect(graphqlHandler.name).toBe('graphql');
  });

  it('defaultConfig depth_limit is 10', () => {
    expect(graphqlHandler.defaultConfig?.depth_limit).toBe(10);
  });
});

describe('GraphqlTrait — lifecycle', () => {
  it('onAttach initializes resolvers map and queries counter', () => {
    const node = makeNode();
    graphqlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__gqlState as { resolvers: Map<string, string>; queries: number };
    expect(state.resolvers).toBeInstanceOf(Map);
    expect(state.queries).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    graphqlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    graphqlHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__gqlState).toBeUndefined();
  });
});

describe('GraphqlTrait — onEvent', () => {
  it('gql:register stores resolver and emits gql:registered', () => {
    const node = makeNode();
    graphqlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    graphqlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'gql:register', typeName: 'User', field: 'users',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('gql:registered', { typeName: 'User', total: 1 });
    const state = node.__gqlState as { resolvers: Map<string, string> };
    expect(state.resolvers.get('User')).toBe('users');
  });

  it('gql:query increments counter and emits gql:result', () => {
    const node = makeNode();
    graphqlHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    graphqlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'gql:query', query: '{ users { id name } }',
    } as never);
    graphqlHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'gql:query', query: '{ posts { title } }',
    } as never);
    const state = node.__gqlState as { queries: number };
    expect(state.queries).toBe(2);
    expect(node.emit).toHaveBeenLastCalledWith('gql:result', {
      query: '{ posts { title } }', queryCount: 2,
    });
  });
});
