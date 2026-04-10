/**
 * StreamingProtocol.test.ts
 *
 * Comprehensive tests for the Streaming Protocol system.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  // Constants
  PROTOCOL_VERSION,
  MAX_MESSAGE_SIZE,
  MAX_CHUNK_SIZE,
  HEARTBEAT_INTERVAL,
  TIMEOUT_INTERVAL,

  // Types
  MessageType,
  StreamMessage,
  HandshakeMessage,
  HeartbeatMessage,
  WorldJoinMessage,
  WorldStateMessage,
  EntityState,
  EntityDelta,
  EntitySpawnMessage,
  EntityUpdateMessage,
  AssetRequestMessage,
  AssetResponseMessage,
  AssetChunkMessage,
  PlayerJoinMessage,
  PlayerUpdateMessage,
  ChatMessage,
  VoiceDataMessage,
  WorldEvent,
  StreamHandler,

  // Protocol Class
  StreamProtocol,
  getStreamProtocol,
  createMessage,
} from '../hololand/StreamingProtocol';

// ============================================================================
// Mock WebSocket
// ============================================================================

class MockWebSocket {
  static CONNECTING = 0;
  static OPEN = 1;
  static CLOSING = 2;
  static CLOSED = 3;

  url: string;
  readyState: number = MockWebSocket.CONNECTING;
  binaryType: string = 'blob';

  onopen: ((event: any) => void) | null = null;
  onmessage: ((event: any) => void) | null = null;
  onerror: ((event: any) => void) | null = null;
  onclose: ((event: any) => void) | null = null;

  private sent: ArrayBuffer[] = [];
  private openTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(url: string) {
    this.url = url;
    // Simulate async connection
    this.openTimeout = setTimeout(() => {
      if (this.readyState === MockWebSocket.CONNECTING) {
        this.readyState = MockWebSocket.OPEN;
        this.onopen?.({ type: 'open' });
      }
    }, 10);
  }

  send(data: ArrayBuffer): void {
    if (this.readyState !== MockWebSocket.OPEN) {
      throw new Error('WebSocket is not open');
    }
    this.sent.push(data);
  }

  close(code?: number, reason?: string): void {
    if (this.openTimeout) {
      clearTimeout(this.openTimeout);
      this.openTimeout = null;
    }
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code: code ?? 1000, reason: reason ?? '' });
  }

  // Test helpers
  getSentMessages(): ArrayBuffer[] {
    return this.sent;
  }

  simulateMessage(data: string | ArrayBuffer): void {
    this.onmessage?.({ data });
  }

  simulateError(): void {
    this.onerror?.({ type: 'error' });
  }

  simulateClose(code = 1000, reason = ''): void {
    if (this.openTimeout) {
      clearTimeout(this.openTimeout);
      this.openTimeout = null;
    }
    this.readyState = MockWebSocket.CLOSED;
    this.onclose?.({ code, reason });
  }
}

// Store original WebSocket
const OriginalWebSocket = globalThis.WebSocket;

// ============================================================================
// Protocol Constants Tests
// ============================================================================

describe('StreamingProtocol Constants', () => {
  it('should have correct protocol version', () => {
    expect(PROTOCOL_VERSION).toBe('1.0.0');
  });

  it('should have reasonable message size limits', () => {
    expect(MAX_MESSAGE_SIZE).toBe(64 * 1024); // 64KB
    expect(MAX_CHUNK_SIZE).toBe(16 * 1024); // 16KB
    expect(MAX_CHUNK_SIZE).toBeLessThan(MAX_MESSAGE_SIZE);
  });

  it('should have correct timing constants', () => {
    expect(HEARTBEAT_INTERVAL).toBe(5000); // 5 seconds
    expect(TIMEOUT_INTERVAL).toBe(15000); // 15 seconds
    expect(TIMEOUT_INTERVAL).toBeGreaterThan(HEARTBEAT_INTERVAL);
  });
});

// ============================================================================
// Message Type Tests
// ============================================================================

describe('StreamingProtocol Message Types', () => {
  describe('MessageType', () => {
    it('should include connection messages', () => {
      const connectionTypes: MessageType[] = [
        'handshake',
        'handshake_ack',
        'heartbeat',
        'heartbeat_ack',
        'disconnect',
      ];
      // All should compile without error
      expect(connectionTypes).toHaveLength(5);
    });

    it('should include world messages', () => {
      const worldTypes: MessageType[] = [
        'world_join',
        'world_leave',
        'world_state',
        'world_update',
      ];
      expect(worldTypes).toHaveLength(4);
    });

    it('should include entity messages', () => {
      const entityTypes: MessageType[] = [
        'entity_spawn',
        'entity_despawn',
        'entity_update',
        'entity_batch_update',
        'entity_rpc',
      ];
      expect(entityTypes).toHaveLength(5);
    });

    it('should include asset messages', () => {
      const assetTypes: MessageType[] = [
        'asset_request',
        'asset_response',
        'asset_chunk',
        'asset_complete',
        'asset_error',
      ];
      expect(assetTypes).toHaveLength(5);
    });

    it('should include player messages', () => {
      const playerTypes: MessageType[] = [
        'player_join',
        'player_leave',
        'player_update',
        'player_input',
      ];
      expect(playerTypes).toHaveLength(4);
    });

    it('should include communication messages', () => {
      const commTypes: MessageType[] = ['voice_data', 'chat_message'];
      expect(commTypes).toHaveLength(2);
    });
  });
});

// ============================================================================
// Message Interface Tests
// ============================================================================

describe('StreamingProtocol Message Interfaces', () => {
  describe('StreamMessage', () => {
    it('should create valid base message', () => {
      const message: StreamMessage = {
        type: 'custom',
        seq: 1,
        timestamp: Date.now(),
        reliable: false,
        priority: 128,
        payload: { test: true },
      };

      expect(message.type).toBe('custom');
      expect(message.seq).toBe(1);
      expect(message.reliable).toBe(false);
      expect(message.priority).toBe(128);
    });

    it('should support optional channel', () => {
      const message: StreamMessage = {
        type: 'custom',
        seq: 1,
        timestamp: Date.now(),
        channel: 'lobby',
        reliable: true,
        priority: 200,
        payload: {},
      };

      expect(message.channel).toBe('lobby');
    });
  });

  describe('EntityState', () => {
    it('should create valid entity state', () => {
      const state: EntityState = {
        id: 'entity_123',
        type: 'npc',
        position: [10, 0, 20],
        rotation: [0, 0, 0, 1],
        scale: [1, 1, 1],
        parent: undefined,
        components: {
          health: { current: 100, max: 100 },
          inventory: { items: [] },
        },
        traits: ['walkable', 'interactable'],
      };

      expect(state.id).toBe('entity_123');
      expect(state.position).toEqual([10, 0, 20]);
      expect(state.traits).toContain('walkable');
    });
  });

  describe('EntityDelta', () => {
    it('should create valid entity delta', () => {
      const delta: EntityDelta = {
        id: 'entity_123',
        changes: {
          position: [15, 0, 25],
          'components.health.current': 80,
        },
        version: 5,
        timestamp: Date.now(),
      };

      expect(delta.id).toBe('entity_123');
      expect(delta.changes.position).toEqual([15, 0, 25]);
      expect(delta.version).toBe(5);
    });
  });

  describe('WorldEvent', () => {
    it('should create valid world event', () => {
      const event: WorldEvent = {
        id: 'event_001',
        type: 'explosion',
        source: 'entity',
        sourceId: 'bomb_1',
        data: { radius: 10, damage: 50 },
        timestamp: Date.now(),
      };

      expect(event.type).toBe('explosion');
      expect(event.source).toBe('entity');
      expect(event.data.radius).toBe(10);
    });
  });
});

// ============================================================================
// Factory Function Tests
// ============================================================================

describe('StreamingProtocol Factory Functions', () => {
  afterEach(() => {
    StreamProtocol.resetInstance();
  });

  describe('getStreamProtocol', () => {
    it('should return singleton instance', () => {
      const instance1 = getStreamProtocol();
      const instance2 = getStreamProtocol();
      expect(instance1).toBe(instance2);
    });
  });

  describe('createMessage', () => {
    it('should create message with defaults', () => {
      const message = createMessage('custom', { test: true });

      expect(message.type).toBe('custom');
      expect(message.payload).toEqual({ test: true });
      expect(message.priority).toBe(128);
      expect(message.reliable).toBe(false);
    });

    it('should create reliable message for RPC types', () => {
      const message = createMessage('entity_rpc', { method: 'attack' });
      expect(message.reliable).toBe(true);
    });

    it('should create reliable message for request types', () => {
      const message = createMessage('asset_request', { assetId: 'model_1' });
      expect(message.reliable).toBe(true);
    });

    it('should apply custom options', () => {
      const message = createMessage(
        'chat_message',
        { content: 'Hello' },
        {
          reliable: true,
          priority: 200,
          channel: 'team',
        }
      );

      expect(message.reliable).toBe(true);
      expect(message.priority).toBe(200);
      expect(message.channel).toBe('team');
    });
  });
});

// ============================================================================
// StreamProtocol Class Tests
// ============================================================================

describe('StreamProtocol Class', () => {
  let mockWs: MockWebSocket | null = null;

  beforeEach(() => {
    // Replace global WebSocket with mock
    (globalThis as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWs = this;
      }
    };
    StreamProtocol.resetInstance();
  });

  afterEach(() => {
    // Close any active connection before reset
    try {
      StreamProtocol.getInstance().close();
    } catch (e) {
      // Ignore
    }
    StreamProtocol.resetInstance();
    (globalThis as any).WebSocket = OriginalWebSocket;
    mockWs = null;
  });

  describe('Singleton Pattern', () => {
    it('should return same instance', () => {
      const a = StreamProtocol.getInstance();
      const b = StreamProtocol.getInstance();
      expect(a).toBe(b);
    });

    it('should reset instance', () => {
      const a = StreamProtocol.getInstance();
      StreamProtocol.resetInstance();
      const b = StreamProtocol.getInstance();
      expect(a).not.toBe(b);
    });
  });

  describe('Connection State', () => {
    it('should start disconnected', () => {
      const protocol = StreamProtocol.getInstance();
      expect(protocol.isConnected()).toBe(false);
    });

    it('should report stats', () => {
      const protocol = StreamProtocol.getInstance();
      const stats = protocol.getStats();

      expect(stats.connectionState).toBe('disconnected');
      expect(stats.messagesSent).toBe(0);
      expect(stats.messagesReceived).toBe(0);
      expect(stats.pendingAcks).toBe(0);
    });
  });

  describe('Connection Management', () => {
    it('should connect successfully', async () => {
      const protocol = StreamProtocol.getInstance();

      const connectPromise = protocol.connect('ws://localhost:8080', {
        clientId: 'test_client',
        clientVersion: '1.0.0',
      });

      // Wait for WebSocket to "open"
      await new Promise((r) => setTimeout(r, 20));

      // Simulate handshake ack
      const ackMessage = JSON.stringify({
        type: 'handshake_ack',
        seq: 0,
        timestamp: Date.now(),
        reliable: true,
        priority: 255,
        payload: {
          success: true,
          sessionId: 'session_123',
          serverVersion: '1.0.0',
        },
      });
      mockWs?.simulateMessage(ackMessage);

      await connectPromise;

      expect(protocol.isConnected()).toBe(true);
    });

    it('should throw if already connecting', async () => {
      const protocol = StreamProtocol.getInstance();

      protocol.connect('ws://localhost:8080', {
        clientId: 'test',
        clientVersion: '1.0.0',
      });

      await expect(
        protocol.connect('ws://localhost:8080', {
          clientId: 'test2',
          clientVersion: '1.0.0',
        })
      ).rejects.toThrow('Already connected');
    });

    it('should close connection', async () => {
      const protocol = StreamProtocol.getInstance();

      const connectPromise = protocol.connect('ws://localhost:8080', {
        clientId: 'test',
        clientVersion: '1.0.0',
      });

      await new Promise((r) => setTimeout(r, 20));
      mockWs?.simulateMessage(
        JSON.stringify({
          type: 'handshake_ack',
          seq: 0,
          timestamp: Date.now(),
          reliable: true,
          priority: 255,
          payload: { success: true },
        })
      );

      await connectPromise;

      protocol.close();

      expect(protocol.isConnected()).toBe(false);
    });
  });

  describe('Event Subscription', () => {
    it('should subscribe to events', () => {
      const protocol = StreamProtocol.getInstance();
      const handler = vi.fn();

      const unsubscribe = protocol.on('entity_update', handler);

      expect(typeof unsubscribe).toBe('function');
    });

    it('should unsubscribe from events', () => {
      const protocol = StreamProtocol.getInstance();
      const handler = vi.fn();

      const unsubscribe = protocol.on('entity_update', handler);
      unsubscribe();

      // Handler should not be called after unsubscribe
    });

    it('should call handler on message', async () => {
      const protocol = StreamProtocol.getInstance();
      const handler = vi.fn();

      protocol.on('entity_update', handler);

      const connectPromise = protocol.connect('ws://localhost:8080', {
        clientId: 'test',
        clientVersion: '1.0.0',
      });

      await new Promise((r) => setTimeout(r, 20));
      mockWs?.simulateMessage(
        JSON.stringify({
          type: 'handshake_ack',
          seq: 0,
          timestamp: Date.now(),
          reliable: true,
          priority: 255,
          payload: { success: true },
        })
      );

      await connectPromise;

      // Simulate entity update
      mockWs?.simulateMessage(
        JSON.stringify({
          type: 'entity_update',
          seq: 1,
          timestamp: Date.now(),
          reliable: false,
          priority: 128,
          payload: { id: 'entity_1', changes: { position: [0, 0, 0] } },
        })
      );

      expect(handler).toHaveBeenCalled();
    });
  });
});

// ============================================================================
// Message Sending Tests (require connected state)
// ============================================================================

describe('StreamProtocol Message Sending', () => {
  let mockWs: MockWebSocket | null = null;
  let protocol: StreamProtocol;

  beforeEach(async () => {
    (globalThis as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWs = this;
      }
    };
    StreamProtocol.resetInstance();
    protocol = StreamProtocol.getInstance();

    const connectPromise = protocol.connect('ws://localhost:8080', {
      clientId: 'test',
      clientVersion: '1.0.0',
    });

    await new Promise((r) => setTimeout(r, 20));
    mockWs?.simulateMessage(
      JSON.stringify({
        type: 'handshake_ack',
        seq: 0,
        timestamp: Date.now(),
        reliable: true,
        priority: 255,
        payload: { success: true },
      })
    );

    await connectPromise;
  });

  afterEach(() => {
    protocol.close();
    StreamProtocol.resetInstance();
    (globalThis as any).WebSocket = OriginalWebSocket;
    mockWs = null;
  });

  it('should send entity update', () => {
    protocol.sendEntityUpdate('entity_123', { position: [10, 0, 20] });

    const sent = mockWs?.getSentMessages() ?? [];
    expect(sent.length).toBeGreaterThan(1); // Handshake + update
  });

  it('should send player input', () => {
    protocol.sendPlayerInput({ moveX: 1, moveY: 0, jump: 1 });

    const sent = mockWs?.getSentMessages() ?? [];
    expect(sent.length).toBeGreaterThan(1);
  });

  it('should send voice data', () => {
    const audioData = new ArrayBuffer(1024);
    protocol.sendVoiceData(audioData, 'opus');

    const sent = mockWs?.getSentMessages() ?? [];
    expect(sent.length).toBeGreaterThan(1);
  });

  it('should throw when sending while disconnected', () => {
    protocol.close();

    expect(() => {
      protocol.sendEntityUpdate('entity_1', {});
    }).toThrow('Not connected');
  });
});

// ============================================================================
// Reliable Message Tests
// ============================================================================

describe('StreamProtocol Reliable Messages', () => {
  let mockWs: MockWebSocket | null = null;
  let protocol: StreamProtocol;

  beforeEach(async () => {
    (globalThis as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWs = this;
      }
    };
    StreamProtocol.resetInstance();
    protocol = StreamProtocol.getInstance();

    const connectPromise = protocol.connect('ws://localhost:8080', {
      clientId: 'test',
      clientVersion: '1.0.0',
    });

    await new Promise((r) => setTimeout(r, 20));
    mockWs?.simulateMessage(
      JSON.stringify({
        type: 'handshake_ack',
        seq: 0,
        timestamp: Date.now(),
        reliable: true,
        priority: 255,
        payload: { success: true },
      })
    );

    await connectPromise;
  });

  afterEach(() => {
    protocol.close();
    StreamProtocol.resetInstance();
    (globalThis as any).WebSocket = OriginalWebSocket;
    mockWs = null;
  });

  // Helper to simulate ack for any pending message
  const simulateAck = (seqNum: number) => {
    mockWs?.simulateMessage(
      JSON.stringify({
        type: 'heartbeat_ack',
        seq: seqNum,
        ack: true,
        ackSeq: seqNum,
        timestamp: Date.now(),
        reliable: false,
        priority: 128,
        payload: {},
      })
    );
  };

  it('should join world (reliable)', async () => {
    // Get current stats to know the next seq number
    const stats = protocol.getStats();
    const nextSeq = stats.messagesSent;

    const joinPromise = protocol.joinWorld('world_1', 'spawn_point_a');

    // Simulate ack
    await new Promise((r) => setTimeout(r, 10));
    simulateAck(nextSeq);

    await joinPromise;
    expect(protocol.getStats().messagesSent).toBeGreaterThan(nextSeq);
  });

  it('should leave world (reliable)', async () => {
    const stats = protocol.getStats();
    const nextSeq = stats.messagesSent;

    const leavePromise = protocol.leaveWorld();

    await new Promise((r) => setTimeout(r, 10));
    simulateAck(nextSeq);

    await leavePromise;
  });

  it('should send entity RPC (reliable)', async () => {
    const stats = protocol.getStats();
    const nextSeq = stats.messagesSent;

    const rpcPromise = protocol.sendEntityRPC('entity_1', 'attack', [100]);

    await new Promise((r) => setTimeout(r, 10));
    simulateAck(nextSeq);

    await rpcPromise;
  });

  it('should request asset (reliable)', async () => {
    const stats = protocol.getStats();
    const nextSeq = stats.messagesSent;

    const requestPromise = protocol.requestAsset('model_character', {
      priority: 200,
      acceptedFormats: ['glb'],
      maxQuality: 'high',
    });

    await new Promise((r) => setTimeout(r, 10));
    simulateAck(nextSeq);

    await requestPromise;
  });

  it('should send chat message (reliable)', async () => {
    const stats = protocol.getStats();
    const nextSeq = stats.messagesSent;

    const chatPromise = protocol.sendChat('Hello, world!', 'world');

    await new Promise((r) => setTimeout(r, 10));
    simulateAck(nextSeq);

    await chatPromise;
  });

  it('should timeout reliable message', async () => {
    vi.useFakeTimers();

    const rpcPromise = protocol.sendEntityRPC('entity_1', 'action', []);

    // Advance time past timeout
    vi.advanceTimersByTime(6000);

    await expect(rpcPromise).rejects.toThrow('Message timeout');

    vi.useRealTimers();
  });
});

// ============================================================================
// Protocol Statistics Tests
// ============================================================================

describe('StreamProtocol Statistics', () => {
  afterEach(() => {
    try {
      StreamProtocol.getInstance().close();
    } catch (e) {
      // Ignore
    }
    StreamProtocol.resetInstance();
  });

  it('should track message counts', async () => {
    let mockWs: MockWebSocket | null = null;
    (globalThis as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWs = this;
      }
    };

    const protocol = StreamProtocol.getInstance();

    const connectPromise = protocol.connect('ws://localhost:8080', {
      clientId: 'test',
      clientVersion: '1.0.0',
    });

    await new Promise((r) => setTimeout(r, 20));
    mockWs?.simulateMessage(
      JSON.stringify({
        type: 'handshake_ack',
        seq: 0,
        timestamp: Date.now(),
        reliable: true,
        priority: 255,
        payload: { success: true },
      })
    );

    await connectPromise;

    // Send some messages
    protocol.sendEntityUpdate('entity_1', { x: 1 });
    protocol.sendEntityUpdate('entity_2', { x: 2 });
    protocol.sendPlayerInput({ jump: 1 });

    const stats = protocol.getStats();
    expect(stats.messagesSent).toBeGreaterThanOrEqual(4); // Handshake + 3 updates
    expect(stats.connectionState).toBe('connected');

    protocol.close();
    (globalThis as any).WebSocket = OriginalWebSocket;
  });
});

// ============================================================================
// Error Handling Tests
// ============================================================================

describe('StreamProtocol Error Handling', () => {
  let mockWs: MockWebSocket | null = null;

  beforeEach(() => {
    (globalThis as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWs = this;
      }
    };
    StreamProtocol.resetInstance();
  });

  afterEach(() => {
    try {
      StreamProtocol.getInstance().close();
    } catch (e) {
      // Ignore
    }
    StreamProtocol.resetInstance();
    (globalThis as any).WebSocket = OriginalWebSocket;
    mockWs = null;
  });

  it('should emit error event on WebSocket error', async () => {
    const protocol = StreamProtocol.getInstance();
    const errorHandler = vi.fn();

    protocol.on('error', errorHandler);

    const connectPromise = protocol.connect('ws://localhost:8080', {
      clientId: 'test',
      clientVersion: '1.0.0',
    });

    await new Promise((r) => setTimeout(r, 20));
    mockWs?.simulateMessage(
      JSON.stringify({
        type: 'handshake_ack',
        seq: 0,
        timestamp: Date.now(),
        reliable: true,
        priority: 255,
        payload: { success: true },
      })
    );

    await connectPromise;

    mockWs?.simulateError();

    expect(errorHandler).toHaveBeenCalled();
  });

  it('should emit close event on WebSocket close', async () => {
    const protocol = StreamProtocol.getInstance();
    const closeHandler = vi.fn();

    protocol.on('close', closeHandler);

    const connectPromise = protocol.connect('ws://localhost:8080', {
      clientId: 'test',
      clientVersion: '1.0.0',
    });

    await new Promise((r) => setTimeout(r, 20));
    mockWs?.simulateMessage(
      JSON.stringify({
        type: 'handshake_ack',
        seq: 0,
        timestamp: Date.now(),
        reliable: true,
        priority: 255,
        payload: { success: true },
      })
    );

    await connectPromise;

    mockWs?.simulateClose(1001, 'Going away');

    expect(closeHandler).toHaveBeenCalled();
    expect(protocol.isConnected()).toBe(false);
  });
});

// ============================================================================
// Integration Tests
// ============================================================================

describe('StreamProtocol Integration', () => {
  let mockWs: MockWebSocket | null = null;

  beforeEach(() => {
    (globalThis as any).WebSocket = class extends MockWebSocket {
      constructor(url: string) {
        super(url);
        mockWs = this;
      }
    };
    StreamProtocol.resetInstance();
  });

  afterEach(() => {
    try {
      StreamProtocol.getInstance().close();
    } catch (e) {
      // Ignore
    }
    StreamProtocol.resetInstance();
    (globalThis as any).WebSocket = OriginalWebSocket;
    mockWs = null;
  });

  it('should handle full connection lifecycle', async () => {
    const protocol = StreamProtocol.getInstance();
    const entityHandler = vi.fn();
    const closeHandler = vi.fn();

    protocol.on('entity_update', entityHandler);
    protocol.on('close', closeHandler);

    // 1. Connect
    const connectPromise = protocol.connect('ws://localhost:8080', {
      clientId: 'player_1',
      clientVersion: '2.0.0',
      capabilities: ['entity_sync', 'voice'],
    });

    await new Promise((r) => setTimeout(r, 20));
    mockWs?.simulateMessage(
      JSON.stringify({
        type: 'handshake_ack',
        seq: 0,
        timestamp: Date.now(),
        reliable: true,
        priority: 255,
        payload: { success: true, sessionId: 'sess_123' },
      })
    );

    await connectPromise;
    expect(protocol.isConnected()).toBe(true);

    // 2. Receive entity updates
    mockWs?.simulateMessage(
      JSON.stringify({
        type: 'entity_update',
        seq: 1,
        timestamp: Date.now(),
        reliable: false,
        priority: 128,
        payload: { id: 'npc_1', changes: { position: [5, 0, 10] } },
      })
    );

    expect(entityHandler).toHaveBeenCalledTimes(1);

    // 3. Send updates
    protocol.sendEntityUpdate('player_1', { position: [0, 0, 0] });
    protocol.sendPlayerInput({ moveX: 1 });

    const stats = protocol.getStats();
    expect(stats.messagesSent).toBeGreaterThanOrEqual(3);

    // 4. Disconnect
    protocol.close();

    expect(protocol.isConnected()).toBe(false);
    expect(closeHandler).toHaveBeenCalled();
  });

  it('should use createMessage with protocol', async () => {
    const protocol = StreamProtocol.getInstance();

    const connectPromise = protocol.connect('ws://localhost:8080', {
      clientId: 'test',
      clientVersion: '1.0.0',
    });

    await new Promise((r) => setTimeout(r, 20));
    mockWs?.simulateMessage(
      JSON.stringify({
        type: 'handshake_ack',
        seq: 0,
        timestamp: Date.now(),
        reliable: true,
        priority: 255,
        payload: { success: true },
      })
    );

    await connectPromise;

    // Create message using factory
    const message = createMessage(
      'entity_update',
      {
        id: 'entity_1',
        changes: { health: 100 },
      },
      { priority: 192 }
    );

    // Should be sendable (matches expected interface)
    expect(message.type).toBe('entity_update');
    expect(message.priority).toBe(192);
    expect(message.payload).toEqual({ id: 'entity_1', changes: { health: 100 } });
  });
});
