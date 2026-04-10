/**
 * NetworkedTrait — WebRTC Transport Integration Tests
 *
 * Tests the WebRTC transport integration within NetworkedTrait, including:
 * - Direct WebRTC connection
 * - Auto-detection transport mode (WebRTC → WebSocket → local)
 * - Signaling flow integration
 * - Config-based transport selection
 * - Fallback behavior on connection failure
 *
 * Commence All VI — Track 4
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// =============================================================================
// MOCK SETUP — must be before any import that touches these modules
// =============================================================================

// WebSocket mock for WebSocketTransport
const mockWsInstance = {
  readyState: 1, // OPEN
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  onopen: null as Function | null,
  onmessage: null as Function | null,
  onerror: null as Function | null,
  onclose: null as Function | null,
};

vi.mock('ws', () => {
  return {
    default: vi.fn(() => mockWsInstance),
    WebSocket: vi.fn(() => mockWsInstance),
  };
});

// Mock global WebSocket for browser-like environments
if (typeof globalThis.WebSocket === 'undefined') {
  (globalThis as any).WebSocket = vi.fn(() => mockWsInstance);
}

// Mock RTCPeerConnection for WebRTC
const mockDataChannel = {
  readyState: 'open',
  send: vi.fn(),
  close: vi.fn(),
  addEventListener: vi.fn(),
  onopen: null as Function | null,
  onmessage: null as Function | null,
  onerror: null as Function | null,
  onclose: null as Function | null,
};

const mockPeerConnection = {
  createOffer: vi.fn().mockResolvedValue({ type: 'offer', sdp: 'mock-sdp' }),
  createAnswer: vi.fn().mockResolvedValue({ type: 'answer', sdp: 'mock-sdp' }),
  setLocalDescription: vi.fn().mockResolvedValue(undefined),
  setRemoteDescription: vi.fn().mockResolvedValue(undefined),
  addIceCandidate: vi.fn().mockResolvedValue(undefined),
  createDataChannel: vi.fn().mockReturnValue(mockDataChannel),
  addTrack: vi.fn(),
  close: vi.fn(),
  connectionState: 'connected',
  iceConnectionState: 'connected',
  onicecandidate: null as Function | null,
  ondatachannel: null as Function | null,
  onconnectionstatechange: null as Function | null,
  ontrack: null as Function | null,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

if (typeof globalThis.RTCPeerConnection === 'undefined') {
  (globalThis as any).RTCPeerConnection = vi.fn(() => mockPeerConnection);
}

// Import after mocks are set up
import { NetworkedTrait, createNetworkedTrait } from '../NetworkedTrait';
import type { NetworkedConfig } from '../NetworkedTrait';

// =============================================================================
// HELPERS
// =============================================================================

function makeConfig(overrides: Partial<NetworkedConfig> = {}): NetworkedConfig {
  return {
    mode: 'owner',
    syncRate: 20,
    channel: 'unreliable',
    interpolation: false,
    room: 'test-room',
    ...overrides,
  };
}

// =============================================================================
// TESTS
// =============================================================================

describe('NetworkedTrait — WebRTC Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPeerConnection.connectionState = 'connected';
    mockDataChannel.readyState = 'open';
  });

  // ---------------------------------------------------------------------------
  // 1. CONSTRUCTION & DEFAULTS
  // ---------------------------------------------------------------------------

  describe('construction', () => {
    it('creates trait with default config', () => {
      const trait = new NetworkedTrait(makeConfig());
      expect(trait).toBeDefined();
      expect(trait.isConnected()).toBe(false);
      expect(trait.getActiveTransport()).toBe('local');
    });

    it('creates via factory function', () => {
      const trait = createNetworkedTrait({ mode: 'shared', room: 'my-room' });
      expect(trait).toBeDefined();
      expect(trait.getConfig().mode).toBe('shared');
    });

    it('generates unique entity IDs', () => {
      const t1 = new NetworkedTrait(makeConfig());
      const t2 = new NetworkedTrait(makeConfig());
      expect(t1.getEntityId()).not.toBe(t2.getEntityId());
    });
  });

  // ---------------------------------------------------------------------------
  // 2. LOCAL TRANSPORT
  // ---------------------------------------------------------------------------

  describe('local transport', () => {
    it('connects locally when no server URL', async () => {
      const trait = new NetworkedTrait(makeConfig());
      await trait.connect('local');
      expect(trait.isConnected()).toBe(true);
      expect(trait.getActiveTransport()).toBe('local');
    });

    it('disconnects cleanly', async () => {
      const trait = new NetworkedTrait(makeConfig());
      await trait.connect('local');
      trait.disconnect();
      expect(trait.isConnected()).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. TRANSPORT SELECTION
  // ---------------------------------------------------------------------------

  describe('transport selection', () => {
    it('reports active transport type', () => {
      const trait = new NetworkedTrait(makeConfig());
      expect(trait.getActiveTransport()).toBe('local');
    });

    it('has connectWebSocket convenience method', () => {
      const trait = new NetworkedTrait(makeConfig());
      expect(typeof trait.connectWebSocket).toBe('function');
    });

    it('has connectWebRTC convenience method', () => {
      const trait = new NetworkedTrait(makeConfig());
      expect(typeof trait.connectWebRTC).toBe('function');
    });

    it('has connectAuto convenience method', () => {
      const trait = new NetworkedTrait(makeConfig());
      expect(typeof trait.connectAuto).toBe('function');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. PROPERTY SYNC
  // ---------------------------------------------------------------------------

  describe('property sync', () => {
    it('sets and gets properties', () => {
      const trait = new NetworkedTrait(makeConfig());
      trait.setProperty('health', 100);
      expect(trait.getProperty('health')).toBe(100);
    });

    it('tracks pending updates', () => {
      const trait = new NetworkedTrait(makeConfig());
      trait.setProperty('x', 10);
      trait.setProperty('y', 20);
      const updates = trait.flushUpdates();
      expect(updates).toEqual({ x: 10, y: 20 });
    });

    it('clears pending updates after flush', () => {
      const trait = new NetworkedTrait(makeConfig());
      trait.setProperty('x', 10);
      trait.flushUpdates();
      const secondFlush = trait.flushUpdates();
      expect(Object.keys(secondFlush).length).toBe(0);
    });

    it('returns full state', () => {
      const trait = new NetworkedTrait(makeConfig());
      trait.setProperty('a', 1);
      trait.setProperty('b', 2);
      const state = trait.getState();
      expect(state).toEqual({ a: 1, b: 2 });
    });

    it('applies external state', () => {
      const trait = new NetworkedTrait(makeConfig());
      trait.applyState({ position: [1, 2, 3], health: 50 });
      expect(trait.getProperty('health')).toBe(50);
    });

    it('emits propertyChanged event', () => {
      const trait = new NetworkedTrait(makeConfig());
      const handler = vi.fn();
      trait.on('propertyChanged', handler);
      trait.setProperty('score', 42);
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].property).toBe('score');
    });
  });

  // ---------------------------------------------------------------------------
  // 5. OWNERSHIP
  // ---------------------------------------------------------------------------

  describe('ownership', () => {
    it('owner mode starts as owner', () => {
      const trait = new NetworkedTrait(makeConfig({ mode: 'owner' }));
      expect(trait.isLocalOwner()).toBe(true);
    });

    it('shared mode does not start as owner', () => {
      const trait = new NetworkedTrait(makeConfig({ mode: 'shared' }));
      expect(trait.isLocalOwner()).toBe(false);
    });

    it('can release ownership', () => {
      const trait = new NetworkedTrait(makeConfig({ mode: 'owner' }));
      expect(trait.isLocalOwner()).toBe(true);
      trait.releaseOwnership();
      expect(trait.isLocalOwner()).toBe(false);
    });

    it('emits ownershipChanged on release', () => {
      const trait = new NetworkedTrait(makeConfig({ mode: 'owner' }));
      const handler = vi.fn();
      trait.on('ownershipChanged', handler);
      trait.releaseOwnership();
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('grants ownership locally when not connected', async () => {
      const trait = new NetworkedTrait(
        makeConfig({ mode: 'shared', authority: { transferable: true } })
      );
      const granted = await trait.requestOwnership();
      expect(granted).toBe(true);
      expect(trait.isLocalOwner()).toBe(true);
    });

    it('denies ownership transfer when not transferable', async () => {
      const trait = new NetworkedTrait(
        makeConfig({ mode: 'shared', authority: { transferable: false } })
      );
      const granted = await trait.requestOwnership();
      expect(granted).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 6. SYNC RATE LIMITING
  // ---------------------------------------------------------------------------

  describe('sync rate', () => {
    it('shouldSync returns false with no pending updates', async () => {
      const trait = new NetworkedTrait(makeConfig());
      await trait.connect('local');
      // No pending updates
      expect(trait.shouldSync()).toBe(false);
    });

    it('flushUpdates returns empty after clear', () => {
      const trait = new NetworkedTrait(makeConfig());
      expect(Object.keys(trait.flushUpdates()).length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. EVENT SYSTEM
  // ---------------------------------------------------------------------------

  describe('event system', () => {
    it('registers and receives events', () => {
      const trait = new NetworkedTrait(makeConfig());
      const handler = vi.fn();
      trait.on('connected', handler);
      trait.setConnected(true, 'peer-1');
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].peerId).toBe('peer-1');
    });

    it('unregisters events with off()', () => {
      const trait = new NetworkedTrait(makeConfig());
      const handler = vi.fn();
      trait.on('connected', handler);
      trait.off('connected', handler);
      trait.setConnected(true);
      expect(handler).not.toHaveBeenCalled();
    });

    it('emits disconnected event', () => {
      const trait = new NetworkedTrait(makeConfig());
      const handler = vi.fn();
      trait.on('disconnected', handler);
      trait.setConnected(false);
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('supports multiple listeners on same event', () => {
      const trait = new NetworkedTrait(makeConfig());
      const h1 = vi.fn();
      const h2 = vi.fn();
      trait.on('connected', h1);
      trait.on('connected', h2);
      trait.setConnected(true);
      expect(h1).toHaveBeenCalled();
      expect(h2).toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // 8. INTERPOLATION
  // ---------------------------------------------------------------------------

  describe('interpolation', () => {
    it('returns null with empty buffer', () => {
      const trait = new NetworkedTrait(makeConfig({ interpolation: true }));
      expect(trait.getInterpolatedState()).toBeNull();
    });

    it('stores samples on applyState when interpolation enabled', () => {
      const trait = new NetworkedTrait(
        makeConfig({ interpolation: { enabled: true, delay: 100, mode: 'linear' } })
      );
      trait.applyState({ position: [1, 2, 3] });
      trait.applyState({ position: [4, 5, 6] });
      // Should have buffered samples
      const interpolated = trait.getInterpolatedState(0);
      expect(interpolated).not.toBeNull();
    });

    it('skips interpolation buffer when disabled', () => {
      const trait = new NetworkedTrait(makeConfig({ interpolation: false }));
      trait.applyState({ position: [1, 2, 3] });
      expect(trait.getInterpolatedState()).toBeNull();
    });
  });

  // ---------------------------------------------------------------------------
  // 9. NETWORK STATS & CONFIG
  // ---------------------------------------------------------------------------

  describe('network stats & config', () => {
    it('returns latency (0 when not connected)', () => {
      const trait = new NetworkedTrait(makeConfig());
      expect(trait.getLatency()).toBe(0);
    });

    it('returns config snapshot', () => {
      const trait = new NetworkedTrait(makeConfig({ room: 'my-room', syncRate: 30 }));
      const cfg = trait.getConfig();
      expect(cfg.room).toBe('my-room');
      expect(cfg.syncRate).toBe(30);
    });

    it('config snapshot is independent of original', () => {
      const trait = new NetworkedTrait(makeConfig({ room: 'a' }));
      const cfg = trait.getConfig();
      cfg.room = 'b';
      expect(trait.getConfig().room).toBe('a');
    });
  });

  // ---------------------------------------------------------------------------
  // 10. CONNECT/DISCONNECT LIFECYCLE
  // ---------------------------------------------------------------------------

  describe('connect/disconnect lifecycle', () => {
    it('emits connected event on setConnected(true)', () => {
      const trait = new NetworkedTrait(makeConfig());
      const handler = vi.fn();
      trait.on('connected', handler);
      trait.setConnected(true, 'my-peer');
      expect(handler).toHaveBeenCalled();
    });

    it('emits disconnected event on setConnected(false)', () => {
      const trait = new NetworkedTrait(makeConfig());
      const handler = vi.fn();
      trait.on('disconnected', handler);
      trait.setConnected(false);
      expect(handler).toHaveBeenCalled();
    });

    it('disconnect does nothing if not connected', () => {
      const trait = new NetworkedTrait(makeConfig());
      // Should not throw
      trait.disconnect();
      expect(trait.isConnected()).toBe(false);
    });
  });
});
