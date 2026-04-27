/**
 * DataRetentionTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { dataRetentionHandler } from '../DataRetentionTrait';

const makeNode = () => ({
  id: 'n1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __retentionState: undefined as unknown,
});

const defaultConfig = { default_ttl_days: 90 };
const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('DataRetentionTrait — metadata', () => {
  it('has name "data_retention"', () => {
    expect(dataRetentionHandler.name).toBe('data_retention');
  });

  it('defaultConfig default_ttl_days is 90', () => {
    expect(dataRetentionHandler.defaultConfig?.default_ttl_days).toBe(90);
  });
});

describe('DataRetentionTrait — lifecycle', () => {
  it('onAttach initializes empty policies map', () => {
    const node = makeNode();
    dataRetentionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__retentionState as { policies: Map<string, unknown> };
    expect(state.policies).toBeInstanceOf(Map);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    dataRetentionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataRetentionHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__retentionState).toBeUndefined();
  });
});

describe('DataRetentionTrait — onEvent', () => {
  it('retention:set stores policy and emits retention:policy_set', () => {
    const node = makeNode();
    dataRetentionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataRetentionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'retention:set', dataType: 'logs', ttl_days: 30,
    } as never);
    const state = node.__retentionState as { policies: Map<string, { ttl: number }> };
    expect(state.policies.get('logs')?.ttl).toBe(30);
    expect(node.emit).toHaveBeenCalledWith('retention:policy_set', { dataType: 'logs' });
  });

  it('retention:set uses default_ttl_days when ttl_days not provided', () => {
    const node = makeNode();
    dataRetentionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataRetentionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'retention:set', dataType: 'events',
    } as never);
    const state = node.__retentionState as { policies: Map<string, { ttl: number }> };
    expect(state.policies.get('events')?.ttl).toBe(90);
  });

  it('retention:purge emits retention:purged with purged list', () => {
    const node = makeNode();
    dataRetentionHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    dataRetentionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'retention:set', dataType: 'metrics', ttl_days: 7,
    } as never);
    node.emit.mockClear();
    dataRetentionHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'retention:purge',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('retention:purged', expect.objectContaining({
      purged: expect.arrayContaining(['metrics']),
    }));
  });
});
