/**
 * BufferTrait — comprehensive tests
 */
import { describe, it, expect, vi } from 'vitest';
import { bufferHandler } from '../BufferTrait';

const makeNode = () => ({
  id: 'node-1',
  traits: new Set<string>(),
  emit: vi.fn(),
  __bufferState: undefined as unknown,
});

const makeCtx = (node: ReturnType<typeof makeNode>) => ({
  emit: (type: string, data: unknown) => node.emit(type, data),
});

const singleChannelConfig = {
  channels: [
    {
      id: 'ch1',
      source_event: 'sensor:reading',
      output_event: 'sensor:batch',
      max_count: 3,
      max_wait_ms: 0,
      max_size: 10,
      enabled: true,
    },
  ],
};

describe('BufferTrait — metadata', () => {
  it('has name "buffer"', () => {
    expect(bufferHandler.name).toBe('buffer');
  });

  it('defaultConfig has empty channels array', () => {
    expect(bufferHandler.defaultConfig?.channels).toEqual([]);
  });
});

describe('BufferTrait — lifecycle', () => {
  it('onAttach initializes channels map', () => {
    const node = makeNode();
    bufferHandler.onAttach!(node as never, singleChannelConfig, makeCtx(node) as never);
    const state = node.__bufferState as { channels: Map<string, unknown>; totalFlushed: number };
    expect(state.channels.size).toBe(1);
    expect(state.channels.has('ch1')).toBe(true);
    expect(state.totalFlushed).toBe(0);
  });

  it('onDetach removes state', () => {
    const node = makeNode();
    bufferHandler.onAttach!(node as never, singleChannelConfig, makeCtx(node) as never);
    bufferHandler.onDetach!(node as never, singleChannelConfig, makeCtx(node) as never);
    expect(node.__bufferState).toBeUndefined();
  });
});

describe('BufferTrait — onEvent: channel management', () => {
  it('buffer:add_channel adds a new channel', () => {
    const node = makeNode();
    bufferHandler.onAttach!(node as never, { channels: [] }, makeCtx(node) as never);
    bufferHandler.onEvent!(node as never, { channels: [] }, makeCtx(node) as never, {
      type: 'buffer:add_channel',
      id: 'ch-new',
      source_event: 'evt:in',
      output_event: 'evt:out',
      max_count: 5,
      max_wait_ms: 0,
      max_size: 20,
      enabled: true,
    } as never);
    const state = node.__bufferState as { channels: Map<string, unknown> };
    expect(state.channels.has('ch-new')).toBe(true);
  });

  it('buffer:remove_channel removes an existing channel', () => {
    const node = makeNode();
    bufferHandler.onAttach!(node as never, singleChannelConfig, makeCtx(node) as never);
    bufferHandler.onEvent!(node as never, singleChannelConfig, makeCtx(node) as never, {
      type: 'buffer:remove_channel', id: 'ch1',
    } as never);
    const state = node.__bufferState as { channels: Map<string, unknown> };
    expect(state.channels.has('ch1')).toBe(false);
  });

  it('buffer:get_status emits buffer:status', () => {
    const node = makeNode();
    bufferHandler.onAttach!(node as never, singleChannelConfig, makeCtx(node) as never);
    node.emit.mockClear();
    bufferHandler.onEvent!(node as never, singleChannelConfig, makeCtx(node) as never, {
      type: 'buffer:get_status',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('buffer:status', expect.objectContaining({
      channelCount: 1,
      totalFlushed: 0,
    }));
  });
});

describe('BufferTrait — onEvent: buffering', () => {
  it('source event accumulates in channel buffer', () => {
    const node = makeNode();
    bufferHandler.onAttach!(node as never, singleChannelConfig, makeCtx(node) as never);
    bufferHandler.onEvent!(node as never, singleChannelConfig, makeCtx(node) as never, {
      type: 'sensor:reading', value: 1,
    } as never);
    bufferHandler.onEvent!(node as never, singleChannelConfig, makeCtx(node) as never, {
      type: 'sensor:reading', value: 2,
    } as never);
    // Only 2/3 items — no flush yet
    expect(node.emit).not.toHaveBeenCalledWith('buffer:flush', expect.anything());
  });

  it('flushes when max_count is reached', () => {
    const node = makeNode();
    bufferHandler.onAttach!(node as never, singleChannelConfig, makeCtx(node) as never);
    for (let i = 0; i < 3; i++) {
      bufferHandler.onEvent!(node as never, singleChannelConfig, makeCtx(node) as never, {
        type: 'sensor:reading', value: i,
      } as never);
    }
    expect(node.emit).toHaveBeenCalledWith('buffer:flush', expect.objectContaining({
      bufferId: 'ch1',
      count: 3,
    }));
    expect(node.emit).toHaveBeenCalledWith('sensor:batch', expect.objectContaining({
      count: 3,
    }));
  });

  it('buffer:force_flush flushes channel with items', () => {
    const node = makeNode();
    bufferHandler.onAttach!(node as never, singleChannelConfig, makeCtx(node) as never);
    bufferHandler.onEvent!(node as never, singleChannelConfig, makeCtx(node) as never, {
      type: 'sensor:reading', value: 42,
    } as never);
    node.emit.mockClear();
    bufferHandler.onEvent!(node as never, singleChannelConfig, makeCtx(node) as never, {
      type: 'buffer:force_flush', id: 'ch1',
    } as never);
    expect(node.emit).toHaveBeenCalledWith('buffer:flush', expect.objectContaining({
      bufferId: 'ch1',
      count: 1,
    }));
  });

  it('emits buffer:overflow when max_size exceeded', () => {
    const node = makeNode();
    const cfg = {
      channels: [{
        id: 'ch-tiny',
        source_event: 'tick',
        output_event: 'tick:batch',
        max_count: 100,
        max_wait_ms: 0,
        max_size: 2,
        enabled: true,
      }],
    };
    bufferHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    for (let i = 0; i < 4; i++) {
      bufferHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
        type: 'tick', i,
      } as never);
    }
    expect(node.emit).toHaveBeenCalledWith('buffer:overflow', expect.objectContaining({
      bufferId: 'ch-tiny',
    }));
  });

  it('disabled channel is not buffered', () => {
    const node = makeNode();
    const cfg = {
      channels: [{
        id: 'ch-off',
        source_event: 'sensor:reading',
        output_event: 'sensor:batch',
        max_count: 1,
        max_wait_ms: 0,
        max_size: 10,
        enabled: false,
      }],
    };
    bufferHandler.onAttach!(node as never, cfg, makeCtx(node) as never);
    bufferHandler.onEvent!(node as never, cfg, makeCtx(node) as never, {
      type: 'sensor:reading', value: 99,
    } as never);
    expect(node.emit).not.toHaveBeenCalledWith('buffer:flush', expect.anything());
  });
});
