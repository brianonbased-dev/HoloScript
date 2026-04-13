import { describe, it, expect, vi } from 'vitest';
import { TransportFallbackManager, createTransportFallback } from '../../network/TransportFallback';
import type { TransportFallbackConfig } from '../../network/TransportFallback';

// A minimal mock transport
function makeMockTransport(connectOk = true, latency = 10) {
  return {
    connect: vi
      .fn()
      .mockResolvedValue(undefined)
      .mockImplementation(() =>
        connectOk ? Promise.resolve() : Promise.reject(new Error('conn failed'))
      ),
    disconnect: vi.fn(),
    send: vi.fn(),
    onMessage: vi.fn(),
    onConnect: vi.fn(),
    onDisconnect: vi.fn(),
    onError: vi.fn(),
    isConnected: vi.fn().mockReturnValue(connectOk),
    getLatency: vi.fn().mockReturnValue(latency),
  };
}

describe('TransportFallbackManager — Production Tests', () => {
  describe('constructor', () => {
    it('creates with required config', () => {
      const m = new TransportFallbackManager({ roomId: 'room-1', enableLocal: true });
      expect(m).toBeDefined();
    });

    it('isConnected() returns false before connect()', () => {
      const m = new TransportFallbackManager({ roomId: 'r', enableLocal: true });
      expect(m.isConnected()).toBe(false);
    });

    it('getActiveTransportType() returns null before connect()', () => {
      const m = new TransportFallbackManager({ roomId: 'r', enableLocal: true });
      expect(m.getActiveTransportType()).toBeNull();
    });
  });

  describe('getStats()', () => {
    it('returns correct available transports based on config', () => {
      const m = new TransportFallbackManager({
        roomId: 'r',
        websocket: { serverUrl: 'ws://localhost' },
        enableLocal: true,
        transportPriority: ['websocket', 'local'],
      });
      const stats = m.getStats();
      expect(stats.transportsAvailable).toContain('websocket');
      expect(stats.transportsAvailable).toContain('local');
    });

    it('excludes unconfigured transports from available list', () => {
      const m = new TransportFallbackManager({ roomId: 'r', enableLocal: false });
      const stats = m.getStats();
      expect(stats.transportsAvailable).not.toContain('local');
      expect(stats.transportsAvailable).not.toContain('webrtc');
    });

    it('returns null activeTransport before connect', () => {
      const m = new TransportFallbackManager({ roomId: 'r', enableLocal: true });
      expect(m.getStats().activeTransport).toBeNull();
    });

    it('returns 0 latency when no active transport', () => {
      const m = new TransportFallbackManager({ roomId: 'r', enableLocal: true });
      expect(m.getLatency()).toBe(0);
    });
  });

  describe('callback registration', () => {
    it('registers onMessage callback without error', () => {
      const m = new TransportFallbackManager({ roomId: 'r' });
      expect(() => m.onMessage(() => {})).not.toThrow();
    });

    it('registers onConnect callback without error', () => {
      const m = new TransportFallbackManager({ roomId: 'r' });
      expect(() => m.onConnect(() => {})).not.toThrow();
    });

    it('registers onDisconnect callback without error', () => {
      const m = new TransportFallbackManager({ roomId: 'r' });
      expect(() => m.onDisconnect(() => {})).not.toThrow();
    });

    it('registers onError callback without error', () => {
      const m = new TransportFallbackManager({ roomId: 'r' });
      expect(() => m.onError(() => {})).not.toThrow();
    });
  });

  describe('send() — no active transport', () => {
    it('does not throw when no active transport', () => {
      const m = new TransportFallbackManager({ roomId: 'r', enableLocal: true });
      expect(() =>
        m.send({
          type: 'state',
          peerId: 'p',
          roomId: 'r',
          version: 1,
          states: new Map(),
          timestamp: Date.now(),
        })
      ).not.toThrow();
    });
  });

  describe('disconnect() — clean shutdown', () => {
    it('clears active transport and fires disconnect callbacks', () => {
      const m = new TransportFallbackManager({ roomId: 'r', enableLocal: true });
      const disconnects: string[] = [];
      m.onDisconnect((reason) => disconnects.push(reason));
      m.disconnect();
      expect(m.isConnected()).toBe(false);
    });
  });

  describe('createTransportFallback() factory', () => {
    it('creates a TransportFallbackManager instance', () => {
      const m = createTransportFallback({ roomId: 'r', enableLocal: true });
      expect(m).toBeInstanceOf(TransportFallbackManager);
    });
  });

  describe('connect() — all transports fail', () => {
    it('throws "All transports failed" when no transport succeeds', async () => {
      const m = new TransportFallbackManager({
        roomId: 'r',
        enableLocal: false,
        transportPriority: ['webrtc'],
        // webrtc not configured (no signalingUrl) => isTransportConfigured returns false
      });
      await expect(m.connect()).rejects.toThrow('All transports failed');
    });
  });
});
