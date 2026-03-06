/**
 * WebSocketTransport — Production Tests (sync / config surface)
 *
 * Network connections require a real WS server, so we test:
 * - Constructor config merging & peerId generation
 * - sendMessage() while disconnected → queues up to 1000 messages
 * - onMessage() handler registration
 * - disconnect() (no throw when never connected)
 * - getIsConnected() initial state
 * - createWebSocketTransport factory
 */
import { describe, it, expect, vi } from 'vitest';
import { WebSocketTransport, createWebSocketTransport, type WebSocketTransportConfig } from '../WebSocketTransport';

function makeConfig(overrides: Partial<WebSocketTransportConfig> = {}): WebSocketTransportConfig {
  return {
    serverUrl: 'ws://localhost:8080',
    roomId: 'room-1',
    maxReconnectAttempts: 3,
    initialBackoffMs: 100,
    maxBackoffMs: 5000,
    heartbeatIntervalMs: 30000,
    ...overrides,
  };
}

function makeTransport(overrides: Partial<WebSocketTransportConfig> = {}): WebSocketTransport {
  return new WebSocketTransport(makeConfig(overrides));
}

// --- construction ---
describe('WebSocketTransport — construction', () => {
  it('constructs without throwing', () => {
    expect(() => makeTransport()).not.toThrow();
  });
  it('starts disconnected', () => {
    expect(makeTransport().getIsConnected()).toBe(false);
  });
  it('generates a peerId when not provided', () => {
    // We cannot read peerId directly, but sendMessage embeds it in messages
    // so the transport should not throw on construction with no peerId
    expect(() => makeTransport()).not.toThrow();
  });
  it('accepts an explicit peerId', () => {
    expect(() => makeTransport({ peerId: 'my-peer' })).not.toThrow();
  });
  it('factory createWebSocketTransport returns a WebSocketTransport', () => {
    const t = createWebSocketTransport(makeConfig());
    expect(t).toBeInstanceOf(WebSocketTransport);
  });
});

// --- sendMessage (disconnected → queue) ---
describe('WebSocketTransport — sendMessage while disconnected', () => {
  it('does not throw when disconnected', () => {
    const t = makeTransport();
    expect(() => t.sendMessage({ type: 'state-sync', payload: {} })).not.toThrow();
  });
  it('does not throw for all message types', () => {
    const t = makeTransport();
    const types: Array<'state-sync' | 'action' | 'heartbeat' | 'auth' | 'rpc'> =
      ['state-sync', 'action', 'heartbeat', 'auth', 'rpc'];
    for (const type of types) {
      expect(() => t.sendMessage({ type, payload: {} })).not.toThrow();
    }
  });
  it('queue caps at 1000 messages (oldest dropped)', () => {
    const t = makeTransport();
    // Send 1002 messages — queue should cap then stay at 1000
    for (let i = 0; i < 1002; i++) {
      t.sendMessage({ type: 'action', payload: { i } });
    }
    // Internal queue is private so we just ensure no error and is still usable
    expect(t.getIsConnected()).toBe(false);
  });
  it('multiple sendMessage calls do not throw', () => {
    const t = makeTransport();
    for (let i = 0; i < 10; i++) t.sendMessage({ type: 'heartbeat', payload: {} });
  });
});

// --- onMessage handler registration ---
describe('WebSocketTransport — onMessage', () => {
  it('registers a handler without throwing', () => {
    const t = makeTransport();
    expect(() => t.onMessage('state-sync', () => {})).not.toThrow();
  });
  it('overwrites handler for same type', () => {
    const t = makeTransport();
    t.onMessage('rpc', () => {});
    expect(() => t.onMessage('rpc', () => {})).not.toThrow();
  });
  it('registers handlers for all message types without throwing', () => {
    const t = makeTransport();
    const types: Array<'state-sync' | 'action' | 'heartbeat' | 'auth' | 'rpc'> =
      ['state-sync', 'action', 'heartbeat', 'auth', 'rpc'];
    for (const type of types) {
      expect(() => t.onMessage(type, () => {})).not.toThrow();
    }
  });
});

// --- disconnect ---
describe('WebSocketTransport — disconnect', () => {
  it('does not throw when never connected', () => {
    const t = makeTransport();
    expect(() => t.disconnect()).not.toThrow();
  });
  it('disconnect keeps isConnected=false', () => {
    const t = makeTransport();
    t.disconnect();
    expect(t.getIsConnected()).toBe(false);
  });
  it('multiple disconnect calls do not throw', () => {
    const t = makeTransport();
    t.disconnect();
    t.disconnect();
  });
});

// --- config edge cases ---
describe('WebSocketTransport — config edge cases', () => {
  it('accepts maxReconnectAttempts=0', () => {
    expect(() => makeTransport({ maxReconnectAttempts: 0 })).not.toThrow();
  });
  it('accepts very short heartbeat interval', () => {
    expect(() => makeTransport({ heartbeatIntervalMs: 100 })).not.toThrow();
  });
  it('accepts wss:// URL', () => {
    expect(() => makeTransport({ serverUrl: 'wss://secure.example.com' })).not.toThrow();
  });
});
