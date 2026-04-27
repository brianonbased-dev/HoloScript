/**
 * DeadlockFreeTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { deadlockFreeHandler } from '../DeadlockFreeTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __dlState: undefined as unknown,
});

const defaultConfig = { max_resources: 100 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DeadlockFreeTrait — metadata', () => {
  it('has name "deadlock_free"', () => {
    expect(deadlockFreeHandler.name).toBe('deadlock_free');
  });

  it('defaultConfig max_resources is 100', () => {
    expect(deadlockFreeHandler.defaultConfig?.max_resources).toBe(100);
  });
});

describe('DeadlockFreeTrait — lifecycle', () => {
  it('onAttach initializes empty locks map', () => {
    const node = makeNode();
    deadlockFreeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__dlState as { locks: Map<string, unknown>; nextOrder: number };
    expect(state.locks).toBeInstanceOf(Map);
    expect(state.nextOrder).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    deadlockFreeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deadlockFreeHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__dlState).toBeUndefined();
  });
});

describe('DeadlockFreeTrait — onEvent', () => {
  it('dl:acquire locks a free resource and emits dl:acquired', () => {
    const node = makeNode();
    deadlockFreeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deadlockFreeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'dl:acquire', resourceId: 'res1', ownerId: 'thread-A',
    } as never);
    const state = node.__dlState as { locks: Map<string, { owner: string }> };
    expect(state.locks.get('res1')?.owner).toBe('thread-A');
    expect(node.emit).toHaveBeenCalledWith('dl:acquired', { resourceId: 'res1', ownerId: 'thread-A' });
  });

  it('dl:acquire on contested resource emits dl:contention', () => {
    const node = makeNode();
    deadlockFreeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deadlockFreeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'dl:acquire', resourceId: 'res2', ownerId: 'thread-A',
    } as never);
    node.emit.mockClear();
    deadlockFreeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'dl:acquire', resourceId: 'res2', ownerId: 'thread-B',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('dl:contention', expect.objectContaining({
      resourceId: 'res2', currentOwner: 'thread-A', requestedBy: 'thread-B',
    }));
  });

  it('dl:release removes lock and emits dl:released', () => {
    const node = makeNode();
    deadlockFreeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deadlockFreeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'dl:acquire', resourceId: 'res3', ownerId: 'owner',
    } as never);
    node.emit.mockClear();
    deadlockFreeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'dl:release', resourceId: 'res3',
    } as never);
    const state = node.__dlState as { locks: Map<string, unknown> };
    expect(state.locks.has('res3')).toBe(false);
    expect(node.emit).toHaveBeenCalledWith('dl:released', { resourceId: 'res3' });
  });

  it('dl:check_cycle emits cycle check with deadlockFree=true', () => {
    const node = makeNode();
    deadlockFreeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deadlockFreeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'dl:check_cycle',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('dl:cycle_check', expect.objectContaining({
      deadlockFree: true,
    }));
  });

  it('dl:acquire increments nextOrder per lock', () => {
    const node = makeNode();
    deadlockFreeHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    deadlockFreeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'dl:acquire', resourceId: 'a', ownerId: 'x',
    } as never);
    deadlockFreeHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'dl:acquire', resourceId: 'b', ownerId: 'y',
    } as never);
    const state = node.__dlState as { locks: Map<string, { order: number }>; nextOrder: number };
    expect(state.locks.get('a')?.order).toBe(0);
    expect(state.locks.get('b')?.order).toBe(1);
    expect(state.nextOrder).toBe(2);
  });
});
