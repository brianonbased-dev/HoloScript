import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  StreamProtocol,
  createMessage,
  getStreamProtocol,
  PROTOCOL_VERSION,
  HEARTBEAT_INTERVAL,
  TIMEOUT_INTERVAL,
} from '../StreamingProtocol';

describe('StreamProtocol', () => {
  beforeEach(() => {
    StreamProtocol.resetInstance();
  });

  it('getInstance returns singleton', () => {
    const a = StreamProtocol.getInstance();
    const b = StreamProtocol.getInstance();
    expect(a).toBe(b);
  });

  it('starts disconnected', () => {
    const proto = StreamProtocol.getInstance();
    expect(proto.isConnected()).toBe(false);
  });

  it('getStats returns initial values', () => {
    const proto = StreamProtocol.getInstance();
    const stats = proto.getStats();
    expect(stats.connectionState).toBe('disconnected');
    expect(stats.messagesSent).toBe(0);
    expect(stats.pendingAcks).toBe(0);
  });

  it('resetInstance clears singleton', () => {
    const a = StreamProtocol.getInstance();
    StreamProtocol.resetInstance();
    const b = StreamProtocol.getInstance();
    expect(a).not.toBe(b);
  });

  it('on registers handler and returns unsubscribe', () => {
    const proto = StreamProtocol.getInstance();
    const handler = vi.fn();
    const unsub = proto.on('heartbeat', handler);
    expect(typeof unsub).toBe('function');
    unsub();
  });

  it('getStreamProtocol is a factory alias', () => {
    const proto = getStreamProtocol();
    expect(proto).toBe(StreamProtocol.getInstance());
  });
});

describe('createMessage', () => {
  it('creates a message with type and payload', () => {
    const msg = createMessage('entity_update', { id: 'e1', changes: {} });
    expect(msg.type).toBe('entity_update');
    expect(msg.payload).toEqual({ id: 'e1', changes: {} });
  });

  it('sets reliable based on type for RPC', () => {
    const msg = createMessage('entity_rpc', { method: 'test' });
    expect(msg.reliable).toBe(true);
  });

  it('sets reliable to false for non-rpc types', () => {
    const msg = createMessage('entity_update', {});
    expect(msg.reliable).toBe(false);
  });

  it('allows overriding reliable and priority', () => {
    const msg = createMessage('heartbeat', {}, { reliable: true, priority: 255 });
    expect(msg.reliable).toBe(true);
    expect(msg.priority).toBe(255);
  });

  it('sets channel when provided', () => {
    const msg = createMessage('chat_message', {}, { channel: 'world' });
    expect(msg.channel).toBe('world');
  });
});

describe('StreamingProtocol constants', () => {
  it('exports protocol version', () => {
    expect(PROTOCOL_VERSION).toBeDefined();
    expect(typeof PROTOCOL_VERSION).toBe('string');
  });

  it('exports heartbeat interval', () => {
    expect(HEARTBEAT_INTERVAL).toBeGreaterThan(0);
  });

  it('exports timeout interval', () => {
    expect(TIMEOUT_INTERVAL).toBeGreaterThan(0);
  });
});
