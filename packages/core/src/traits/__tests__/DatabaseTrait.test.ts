/**
 * DatabaseTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { databaseHandler } from '../DatabaseTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __databaseState: undefined as unknown,
});

const defaultConfig = { default_collection: 'default', max_entries: 10, persist_on_detach: false };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DatabaseTrait — metadata', () => {
  it('has name "database"', () => {
    expect(databaseHandler.name).toBe('database');
  });

  it('defaultConfig has expected fields', () => {
    expect(databaseHandler.defaultConfig?.default_collection).toBe('default');
    expect(databaseHandler.defaultConfig?.max_entries).toBe(10000);
  });
});

describe('DatabaseTrait — lifecycle', () => {
  it('onAttach initializes empty collections', () => {
    const node = makeNode();
    databaseHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__databaseState as { collections: Map<string, unknown>; totalOps: number };
    expect(state.collections).toBeInstanceOf(Map);
    expect(state.totalOps).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    databaseHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    databaseHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__databaseState).toBeUndefined();
  });

  it('onDetach emits snapshot when persist_on_detach=true', () => {
    const node = makeNode();
    const cfg = { ...defaultConfig, persist_on_detach: true };
    databaseHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    node.emit.mockClear();
    databaseHandler.onDetach!(node as never, cfg, makeCtx(node) as never);
    expect(node.emit).toHaveBeenCalledWith('database:snapshot', expect.any(Object));
  });
});

describe('DatabaseTrait — onEvent', () => {
  it('database:put stores value and emits result', () => {
    const node = makeNode();
    databaseHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'database:put', key: 'k1', value: 'hello',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('database:result', expect.objectContaining({
      key: 'k1', value: 'hello', found: true, op: 'put',
    }));
  });

  it('database:get retrieves a value', () => {
    const node = makeNode();
    databaseHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'database:put', key: 'x', value: 42,
    } as never);
    node.emit.mockClear();
    databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'database:get', key: 'x',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('database:result', expect.objectContaining({
      key: 'x', value: 42, found: true, op: 'get',
    }));
  });

  it('database:get returns found=false for missing key', () => {
    const node = makeNode();
    databaseHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'database:get', key: 'missing',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('database:result', expect.objectContaining({
      found: false,
    }));
  });

  it('database:delete removes key', () => {
    const node = makeNode();
    databaseHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'database:put', key: 'del', value: 'bye',
    } as never);
    node.emit.mockClear();
    databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'database:delete', key: 'del',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('database:result', expect.objectContaining({
      found: true, op: 'delete',
    }));
  });

  it('database:clear empties collection', () => {
    const node = makeNode();
    databaseHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'database:put', key: 'a', value: 1,
    } as never);
    node.emit.mockClear();
    databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'database:clear',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('database:cleared', expect.objectContaining({
      collection: 'default',
    }));
  });

  it('database:list returns all keys', () => {
    const node = makeNode();
    databaseHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    for (const k of ['p', 'q', 'r']) {
      databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'database:put', key: k, value: k,
      } as never);
    }
    node.emit.mockClear();
    databaseHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'database:list',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('database:result', expect.objectContaining({
      count: 3, op: 'list',
    }));
  });

  it('database:put emits error when max_entries reached', () => {
    const node = makeNode();
    const cfg = { ...defaultConfig, max_entries: 2 };
    databaseHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    databaseHandler.onEvent!(node as never, cfg, makeCtx(node) as never, { type: 'database:put', key: 'a', value: 1 } as never);
    databaseHandler.onEvent!(node as never, cfg, makeCtx(node) as never, { type: 'database:put', key: 'b', value: 2 } as never);
    node.emit.mockClear();
    databaseHandler.onEvent!(node as never, cfg, makeCtx(node) as never, { type: 'database:put', key: 'overflow', value: 3 } as never);
    expect(node.emit).toHaveBeenCalledWith('database:error', expect.any(Object));
  });
});
