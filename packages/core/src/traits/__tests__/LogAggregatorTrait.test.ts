/**
 * LogAggregatorTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { logAggregatorHandler } from '../LogAggregatorTrait';

const makeNode = () => ({
  id: 'n1', traits: new Set<string>(), emit: vi.fn(),
  __logAggregatorState: undefined as unknown,
});
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});
const defaultConfig = { max_entries: 5000, min_level: 'info' as const };

describe('LogAggregatorTrait', () => {
  it('has name "log_aggregator"', () => {
    expect(logAggregatorHandler.name).toBe('log_aggregator');
  });

  it('defaultConfig max_entries=5000, min_level="info"', () => {
    expect(logAggregatorHandler.defaultConfig?.max_entries).toBe(5000);
    expect(logAggregatorHandler.defaultConfig?.min_level).toBe('info');
  });

  it('onAttach creates empty entries array', () => {
    const node = makeNode();
    logAggregatorHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__logAggregatorState as { entries: unknown[] };
    expect(state.entries).toEqual([]);
  });

  it('log:write stores entry above min_level', () => {
    const node = makeNode();
    logAggregatorHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    logAggregatorHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'log:write', level: 'error', message: 'Crash!', source: 'api',
    } as never);
    const state = node.__logAggregatorState as { entries: { level: string }[] };
    expect(state.entries.length).toBe(1);
    expect(state.entries[0].level).toBe('error');
  });

  it('log:write ignores entries below min_level', () => {
    const node = makeNode();
    logAggregatorHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    logAggregatorHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'log:write', level: 'debug', message: 'verbose', source: 'app',
    } as never);
    const state = node.__logAggregatorState as { entries: unknown[] };
    expect(state.entries.length).toBe(0);
  });

  it('log:query emits log:result with filtered entries', () => {
    const node = makeNode();
    logAggregatorHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    logAggregatorHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'log:write', level: 'warn', message: 'Slow query', source: 'db',
    } as never);
    logAggregatorHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'log:write', level: 'error', message: 'Crash', source: 'api',
    } as never);
    node.emit.mockClear();
    logAggregatorHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'log:query', level: 'warn',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('log:result', expect.objectContaining({
      count: 1,
    }));
  });

  it('log:flush clears entries', () => {
    const node = makeNode();
    logAggregatorHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    logAggregatorHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'log:write', level: 'info', message: 'Hello', source: 'app',
    } as never);
    logAggregatorHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'log:flush',
    } as never);
    const state = node.__logAggregatorState as { entries: unknown[] };
    expect(state.entries.length).toBe(0);
  });
});
