/**
 * CspChannelTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { cspChannelHandler } from '../CspChannelTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __cspState: undefined as unknown,
});

const defaultConfig = { buffer_size: 3 };

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

describe('CspChannelTrait — metadata', () => {
  it('has name "csp_channel"', () => {
    expect(cspChannelHandler.name).toBe('csp_channel');
  });

  it('defaultConfig buffer_size is 10', () => {
    expect(cspChannelHandler.defaultConfig?.buffer_size).toBe(10);
  });
});

describe('CspChannelTrait — lifecycle', () => {
  it('onAttach initializes empty channels map', () => {
    const node = makeNode();
    cspChannelHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    const state = node.__cspState as { channels: Map<string, unknown[]> };
    expect(state.channels).toBeInstanceOf(Map);
    expect(state.channels.size).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    cspChannelHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cspChannelHandler.onDetach!(node as never, defaultConfig, makeCtx(node) as never);
    expect(node.__cspState).toBeUndefined();
  });
});

describe('CspChannelTrait — onEvent', () => {
  it('csp:create adds channel and emits csp:created', () => {
    const node = makeNode();
    cspChannelHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:create', channelId: 'ch-a',
    } as never);
    const state = node.__cspState as { channels: Map<string, unknown[]> };
    expect(state.channels.has('ch-a')).toBe(true);
    expect(state.channels.get('ch-a')).toEqual([]);
    expect(node.emit).toHaveBeenCalledWith('csp:created', { channelId: 'ch-a' });
  });

  it('csp:send buffers value and emits csp:sent', () => {
    const node = makeNode();
    cspChannelHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:create', channelId: 'ch-1',
    } as never);
    node.emit.mockClear();
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:send', channelId: 'ch-1', value: 42,
    } as never);
    const state = node.__cspState as { channels: Map<string, unknown[]> };
    expect(state.channels.get('ch-1')).toEqual([42]);
    expect(node.emit).toHaveBeenCalledWith('csp:sent', { channelId: 'ch-1', bufferUsed: 1 });
  });

  it('csp:send drops message when buffer is full', () => {
    const node = makeNode();
    cspChannelHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:create', channelId: 'ch-full',
    } as never);
    for (let i = 0; i < 3; i++) {
      cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'csp:send', channelId: 'ch-full', value: i,
      } as never);
    }
    const prevCallCount = node.emit.mock.calls.length;
    // This send should be dropped (buffer_size=3)
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:send', channelId: 'ch-full', value: 'overflow',
    } as never);
    expect(node.emit.mock.calls.length).toBe(prevCallCount); // no new emit
    const state = node.__cspState as { channels: Map<string, unknown[]> };
    expect(state.channels.get('ch-full')?.length).toBe(3);
  });

  it('csp:recv dequeues value and emits csp:received with hasValue=true', () => {
    const node = makeNode();
    cspChannelHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:create', channelId: 'ch-r',
    } as never);
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:send', channelId: 'ch-r', value: 'hello',
    } as never);
    node.emit.mockClear();
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:recv', channelId: 'ch-r',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('csp:received', {
      channelId: 'ch-r', value: 'hello', hasValue: true,
    });
  });

  it('csp:recv on empty channel emits csp:received with hasValue=false', () => {
    const node = makeNode();
    cspChannelHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:create', channelId: 'ch-empty',
    } as never);
    node.emit.mockClear();
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:recv', channelId: 'ch-empty',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('csp:received', expect.objectContaining({
      channelId: 'ch-empty', hasValue: false,
    }));
  });

  it('csp:recv is FIFO', () => {
    const node = makeNode();
    cspChannelHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'csp:create', channelId: 'fifo',
    } as never);
    for (const v of ['a', 'b', 'c']) {
      cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'csp:send', channelId: 'fifo', value: v,
      } as never);
    }
    const recvValues: unknown[] = [];
    for (let i = 0; i < 3; i++) {
      node.emit.mockClear();
      cspChannelHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
        type: 'csp:recv', channelId: 'fifo',
      } as never);
      recvValues.push((node.emit.mock.calls[0][1] as { value: unknown }).value);
    }
    expect(recvValues).toEqual(['a', 'b', 'c']);
  });
});
