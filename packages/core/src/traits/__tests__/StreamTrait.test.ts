/**
 * StreamTrait — tests
 */
import { describe, it, expect, vi } from 'vitest';
import { streamHandler } from '../StreamTrait';

const makeNode = () => ({ id: 'n1', traits: new Set<string>(), emit: vi.fn(), __streamState: undefined as unknown });
const makeCtx = (node: ReturnType<typeof makeNode>) => ({ emit: (type: string, data: unknown) => node.emit(type, data) });
const defaultConfig = { max_buffer: 1000, replay_size: 100, enable_backpressure: true };

describe('StreamTrait', () => {
  it('has name "stream"', () => {
    expect(streamHandler.name).toBe('stream');
  });

  it('stream:publish emits stream:message to subscribers', () => {
    const node = makeNode();
    streamHandler.onAttach!(node as never, defaultConfig, makeCtx(node) as never);
    streamHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'stream:subscribe', topic: 'events', subscriberId: 'sub1',
    } as never);
    streamHandler.onEvent!(node as never, defaultConfig, makeCtx(node) as never, {
      type: 'stream:publish', topic: 'events', data: { x: 1 },
    } as never);
    expect(node.emit).toHaveBeenCalledWith('stream:message', expect.objectContaining({ topic: 'events', subscriberId: 'sub1' }));
  });
});
