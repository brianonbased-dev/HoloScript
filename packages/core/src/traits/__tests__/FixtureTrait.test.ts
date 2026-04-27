/**
 * FixtureTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { fixtureHandler } from '../FixtureTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __fixtureState: undefined as unknown,
});

const defaultConfig = { auto_teardown: true };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('FixtureTrait — metadata', () => {
  it('has name "fixture"', () => {
    expect(fixtureHandler.name).toBe('fixture');
  });

  it('defaultConfig auto_teardown is true', () => {
    expect(fixtureHandler.defaultConfig?.auto_teardown).toBe(true);
  });
});

describe('FixtureTrait — lifecycle', () => {
  it('onAttach initializes empty fixtures map', () => {
    const node = makeNode();
    fixtureHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__fixtureState as { fixtures: Map<string, unknown> };
    expect(state.fixtures).toBeInstanceOf(Map);
    expect(state.fixtures.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    fixtureHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fixtureHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__fixtureState).toBeUndefined();
  });
});

describe('FixtureTrait — onEvent', () => {
  it('fixture:setup stores fixture and emits fixture:ready', () => {
    const node = makeNode();
    fixtureHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fixtureHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fixture:setup', name: 'user-db', data: { userId: 42 },
    } as never);
    const state = node.__fixtureState as { fixtures: Map<string, { data: unknown; active: boolean }> };
    expect(state.fixtures.get('user-db')?.active).toBe(true);
    expect(state.fixtures.get('user-db')?.data).toEqual({ userId: 42 });
    expect(node.emit).toHaveBeenCalledWith('fixture:ready', { name: 'user-db' });
  });

  it('fixture:teardown removes fixture and emits fixture:torn_down', () => {
    const node = makeNode();
    fixtureHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fixtureHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fixture:setup', name: 'cache', data: {},
    } as never);
    node.emit.mockClear();
    fixtureHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'fixture:teardown', name: 'cache',
    } as never);
    const state = node.__fixtureState as { fixtures: Map<string, unknown> };
    expect(state.fixtures.has('cache')).toBe(false);
    expect(node.emit).toHaveBeenCalledWith('fixture:torn_down', { name: 'cache' });
  });

  it('can set up multiple fixtures independently', () => {
    const node = makeNode();
    fixtureHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    fixtureHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'fixture:setup', name: 'a', data: 1 } as never);
    fixtureHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, { type: 'fixture:setup', name: 'b', data: 2 } as never);
    const state = node.__fixtureState as { fixtures: Map<string, unknown> };
    expect(state.fixtures.size).toBe(2);
  });
});
