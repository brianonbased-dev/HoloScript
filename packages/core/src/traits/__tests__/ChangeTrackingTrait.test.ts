/**
 * ChangeTrackingTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { changeTrackingHandler } from '../ChangeTrackingTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __changeState: undefined as unknown,
});

const defaultConfig = { max_history: 100 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('ChangeTrackingTrait — metadata', () => {
  it('has name "change_tracking"', () => {
    expect(changeTrackingHandler.name).toBe('change_tracking');
  });

  it('defaultConfig max_history is 100', () => {
    expect(changeTrackingHandler.defaultConfig?.max_history).toBe(100);
  });
});

describe('ChangeTrackingTrait — lifecycle', () => {
  it('onAttach initializes empty history', () => {
    const node = makeNode();
    changeTrackingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__changeState as { history: unknown[] };
    expect(Array.isArray(state.history)).toBe(true);
    expect(state.history.length).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    changeTrackingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    changeTrackingHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__changeState).toBeUndefined();
  });
});

describe('ChangeTrackingTrait — onEvent', () => {
  it('change:record adds entry and emits change:recorded', () => {
    const node = makeNode();
    changeTrackingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    changeTrackingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'change:record',
      entityId: 'e1',
      field: 'color',
      oldValue: 'red',
      newValue: 'blue',
    } as never);
    const state = node.__changeState as { history: Array<Record<string, unknown>> };
    expect(state.history.length).toBe(1);
    expect(state.history[0].entityId).toBe('e1');
    expect(state.history[0].field).toBe('color');
    expect(state.history[0].oldValue).toBe('red');
    expect(state.history[0].newValue).toBe('blue');
    expect(node.emit).toHaveBeenCalledWith('change:recorded', expect.objectContaining({
      entityId: 'e1', field: 'color',
    }));
  });

  it('history is capped at max_history', () => {
    const node = makeNode();
    const cfg = { max_history: 3 };
    changeTrackingHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    for (let i = 0; i < 5; i++) {
      changeTrackingHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
        type: 'change:record',
        entityId: 'e1',
        field: `f${i}`,
        oldValue: i - 1,
        newValue: i,
      } as never);
    }
    const state = node.__changeState as { history: Array<Record<string, unknown>> };
    expect(state.history.length).toBe(3);
    // First entry should be f2 (f0 and f1 shifted out)
    expect(state.history[0].field).toBe('f2');
  });

  it('change:query returns filtered history for entity', () => {
    const node = makeNode();
    changeTrackingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    changeTrackingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'change:record', entityId: 'e1', field: 'x', oldValue: 0, newValue: 1,
    } as never);
    changeTrackingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'change:record', entityId: 'e2', field: 'y', oldValue: 0, newValue: 2,
    } as never);
    node.emit.mockClear();
    changeTrackingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'change:query', entityId: 'e1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('change:history', expect.objectContaining({
      entityId: 'e1',
      changes: expect.arrayContaining([
        expect.objectContaining({ entityId: 'e1', field: 'x' }),
      ]),
    }));
  });

  it('change:query returns empty array for unknown entity', () => {
    const node = makeNode();
    changeTrackingHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    changeTrackingHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'change:query', entityId: 'nobody',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('change:history', expect.objectContaining({
      entityId: 'nobody',
      changes: [],
    }));
  });
});
