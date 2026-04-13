/**
 * NeuralStreamingTransport Test Suite
 *
 * Tests for WebSocket/WebRTC transport, chunked binary streaming,
 * signaling bridge integration, and reconnection logic.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  NeuralStreamingTransport,
  type StreamingTransportConfig,
  type ISignalingBridge,
  type NeuralSignalPayload,
} from '../NeuralStreamingTransport';
import type { INeuralPacket, INeuralSplatPacket } from '../NetworkTypes';

// =========================================================================
// Mock WebSocket
// =========================================================================

class MockWebSocket {
  static OPEN = 1;
  static CLOSED = 3;
  binaryType = 'blob';
  readyState = MockWebSocket.OPEN;
  onopen: (() => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  onclose: (() => void) | null = null;
  sentMessages: unknown[] = [];

  constructor(public url: string) {
    // Auto-connect after microtask
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: unknown) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = MockWebSocket.CLOSED;
  }
}

// =========================================================================
// Mock RTCPeerConnection + DataChannel
// =========================================================================

class MockRTCDataChannel {
  static instances: MockRTCDataChannel[] = [];
  readyState = 'open';
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  sentMessages: unknown[] = [];
  label: string;
  ordered: boolean;
  maxRetransmits: number | undefined;

  constructor(label: string, options?: RTCDataChannelInit) {
    this.label = label;
    this.ordered = options?.ordered ?? true;
    this.maxRetransmits = options?.maxRetransmits;
    MockRTCDataChannel.instances.push(this);
    // Auto-open after microtask
    setTimeout(() => this.onopen?.(), 0);
  }

  send(data: unknown) {
    this.sentMessages.push(data);
  }

  close() {
    this.readyState = 'closed';
  }
}

class MockRTCPeerConnection {
  static instances: MockRTCPeerConnection[] = [];
  iceConnectionState = 'new';
  onicecandidate: ((event: { candidate: unknown }) => void) | null = null;
  oniceconnectionstatechange: (() => void) | null = null;
  private channels: MockRTCDataChannel[] = [];
  localDescription: RTCSessionDescriptionInit | null = null;
  remoteDescription: RTCSessionDescriptionInit | null = null;
  addedCandidates: unknown[] = [];

  constructor(public config?: RTCConfiguration) {
    MockRTCPeerConnection.instances.push(this);
  }

  createDataChannel(label: string, options?: RTCDataChannelInit): MockRTCDataChannel {
    const channel = new MockRTCDataChannel(label, options);
    this.channels.push(channel);
    return channel;
  }

  async createOffer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'offer', sdp: 'mock-offer-sdp' };
  }

  async createAnswer(): Promise<RTCSessionDescriptionInit> {
    return { type: 'answer', sdp: 'mock-answer-sdp' };
  }

  async setLocalDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.localDescription = desc;
  }

  async setRemoteDescription(desc: RTCSessionDescriptionInit): Promise<void> {
    this.remoteDescription = desc;
  }

  async addIceCandidate(candidate: unknown): Promise<void> {
    this.addedCandidates.push(candidate);
  }

  close() {
    this.iceConnectionState = 'closed';
  }
}

// RTCSessionDescription and RTCIceCandidate constructors used in handleSignalingMessage
class MockRTCSessionDescription {
  type: string;
  sdp: string;
  constructor(init: RTCSessionDescriptionInit) {
    this.type = init.type!;
    this.sdp = init.sdp ?? '';
  }
}

class MockRTCIceCandidate {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
  constructor(init: RTCIceCandidateInit) {
    this.candidate = init.candidate ?? '';
    this.sdpMid = init.sdpMid ?? null;
    this.sdpMLineIndex = init.sdpMLineIndex ?? null;
  }
}

// =========================================================================
// Test helpers
// =========================================================================

function createMockSignalingBridge(overrides?: Partial<ISignalingBridge>): ISignalingBridge {
  return {
    targetPeerId: 'remote-peer',
    onReceiveSignal: vi.fn(),
    sendSignal: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeNeuralPacket(overrides?: Partial<INeuralPacket>): INeuralPacket {
  return {
    agentId: 'agent-1',
    timestamp: Date.now(),
    cognitiveLoad: 0.5,
    attentionVector: [0.1, 0.2, 0.3],
    emotionalValence: 0.7,
    actionPrediction: { type: 'move', confidence: 0.9 },
    ...overrides,
  } as INeuralPacket;
}

function makeSplatPacket(bufferSize = 256): INeuralSplatPacket {
  return {
    frameId: 1,
    splatCount: 100,
    cameraState: { position: [0, 0, 0], rotation: [0, 0, 0, 1], fov: 60 },
    compressedSplatsBuffer: new ArrayBuffer(bufferSize),
    sortedIndicesBuffer: new ArrayBuffer(bufferSize),
  } as INeuralSplatPacket;
}

// =========================================================================
// Tests
// =========================================================================

describe('NeuralStreamingTransport', () => {
  let originalWebSocket: typeof globalThis.WebSocket;
  let originalRTCPeerConnection: typeof globalThis.RTCPeerConnection;
  let originalRTCSessionDescription: typeof globalThis.RTCSessionDescription;
  let originalRTCIceCandidate: typeof globalThis.RTCIceCandidate;

  beforeEach(() => {
    // Save originals (may not exist in Node)
    originalWebSocket = globalThis.WebSocket as any;
    originalRTCPeerConnection = globalThis.RTCPeerConnection as any;
    originalRTCSessionDescription = globalThis.RTCSessionDescription as any;
    originalRTCIceCandidate = globalThis.RTCIceCandidate as any;

    // Install mocks
    (globalThis as any).WebSocket = MockWebSocket;
    (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
    (globalThis as any).RTCSessionDescription = MockRTCSessionDescription;
    (globalThis as any).RTCIceCandidate = MockRTCIceCandidate;

    MockRTCDataChannel.instances = [];
    MockRTCPeerConnection.instances = [];
  });

  afterEach(() => {
    // Restore
    (globalThis as any).WebSocket = originalWebSocket;
    (globalThis as any).RTCPeerConnection = originalRTCPeerConnection;
    (globalThis as any).RTCSessionDescription = originalRTCSessionDescription;
    (globalThis as any).RTCIceCandidate = originalRTCIceCandidate;
  });

  // =========================================================================
  // Construction
  // =========================================================================

  describe('construction', () => {
    it('should create with minimal config', () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: false });
      expect(transport).toBeDefined();
    });

    it('should apply default values for optional fields', () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      // Access private config through bracket notation
      const config = (transport as any).config;
      expect(config.endpointUrl).toBe('ws://localhost:8080/neural');
      expect(config.chunkSize).toBe(16384);
      expect(config.rtcConfiguration).toBeDefined();
    });

    it('should accept custom endpoint URL', () => {
      const transport = new NeuralStreamingTransport({
        useWebRTC: false,
        endpointUrl: 'ws://custom:9090/stream',
      });
      expect((transport as any).config.endpointUrl).toBe('ws://custom:9090/stream');
    });

    it('should accept custom chunk size', () => {
      const transport = new NeuralStreamingTransport({
        useWebRTC: false,
        chunkSize: 8192,
      });
      expect((transport as any).config.chunkSize).toBe(8192);
    });
  });

  // =========================================================================
  // WebSocket connection
  // =========================================================================

  describe('WebSocket connection', () => {
    it('should connect via WebSocket when useWebRTC is false', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: false });
      await transport.connect();

      expect((transport as any).socket).toBeInstanceOf(MockWebSocket);
    });

    it('should set binaryType to arraybuffer on WebSocket', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: false });
      await transport.connect();

      const socket = (transport as any).socket as MockWebSocket;
      expect(socket.binaryType).toBe('arraybuffer');
    });

    it('should fallback to WebSocket when RTCPeerConnection is undefined', async () => {
      // Temporarily remove RTC
      delete (globalThis as any).RTCPeerConnection;

      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      expect((transport as any).socket).toBeInstanceOf(MockWebSocket);

      // Restore
      (globalThis as any).RTCPeerConnection = MockRTCPeerConnection;
    });

    it('should not reconnect if already connected', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: false });
      await transport.connect();

      // After connect, isConnected is true — second connect should be a no-op
      expect((transport as any).isConnected).toBe(true);
      const firstSocket = (transport as any).socket;
      await transport.connect();
      expect((transport as any).socket).toBe(firstSocket);
    });
  });

  // =========================================================================
  // WebRTC connection
  // =========================================================================

  describe('WebRTC connection', () => {
    it('should create RTCPeerConnection when useWebRTC is true', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      expect(MockRTCPeerConnection.instances.length).toBeGreaterThan(0);
    });

    it('should create a data channel named neural-streaming', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      const channel = MockRTCDataChannel.instances[0];
      expect(channel).toBeDefined();
      expect(channel.label).toBe('neural-streaming');
    });

    it('should configure data channel for real-time (unordered, no retransmits)', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      const channel = MockRTCDataChannel.instances[0];
      expect(channel.ordered).toBe(false);
      expect(channel.maxRetransmits).toBe(0);
    });

    it('should become connected when data channel opens', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      expect((transport as any).isConnected).toBe(true);
    });
  });

  // =========================================================================
  // Signaling bridge
  // =========================================================================

  describe('signaling bridge integration', () => {
    it('should register signal handler on bridge', async () => {
      const bridge = createMockSignalingBridge();
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect(bridge);

      expect(bridge.onReceiveSignal).toHaveBeenCalledOnce();
      expect(bridge.onReceiveSignal).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should send offer via bridge when initiating WebRTC', async () => {
      const bridge = createMockSignalingBridge();
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect(bridge);

      // Wait for the async offer creation
      await vi.waitFor(() => {
        expect(bridge.sendSignal).toHaveBeenCalledWith(expect.objectContaining({ type: 'offer' }));
      });
    });

    it('should forward ICE candidates through bridge', async () => {
      const bridge = createMockSignalingBridge();
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect(bridge);

      // Simulate ICE candidate event
      const pc = MockRTCPeerConnection.instances[0];
      const mockCandidate = { candidate: 'candidate:1...', sdpMid: '0', sdpMLineIndex: 0 };
      pc.onicecandidate?.({ candidate: mockCandidate });

      expect(bridge.sendSignal).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'ice-candidate', candidate: mockCandidate })
      );
    });

    it('should handle incoming offer signal', async () => {
      const bridge = createMockSignalingBridge();
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect(bridge);

      // Get the registered handler
      const handler = (bridge.onReceiveSignal as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
        p: NeuralSignalPayload
      ) => Promise<void>;

      const incomingOffer: NeuralSignalPayload = {
        type: 'offer',
        sdp: { type: 'offer', sdp: 'remote-offer-sdp' },
      };
      await handler(incomingOffer);

      const pc = MockRTCPeerConnection.instances[0];
      expect(pc.remoteDescription).toEqual(expect.objectContaining({ type: 'offer' }));

      // Should have sent an answer
      expect(bridge.sendSignal).toHaveBeenCalledWith(expect.objectContaining({ type: 'answer' }));
    });

    it('should handle incoming answer signal', async () => {
      const bridge = createMockSignalingBridge();
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect(bridge);

      const handler = (bridge.onReceiveSignal as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
        p: NeuralSignalPayload
      ) => Promise<void>;

      await handler({ type: 'answer', sdp: { type: 'answer', sdp: 'remote-answer-sdp' } });

      const pc = MockRTCPeerConnection.instances[0];
      expect(pc.remoteDescription).toEqual(expect.objectContaining({ type: 'answer' }));
    });

    it('should handle incoming ICE candidate signal', async () => {
      const bridge = createMockSignalingBridge();
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect(bridge);

      const handler = (bridge.onReceiveSignal as ReturnType<typeof vi.fn>).mock.calls[0][0] as (
        p: NeuralSignalPayload
      ) => Promise<void>;

      const candidate: RTCIceCandidateInit = {
        candidate: 'candidate:1...',
        sdpMid: '0',
        sdpMLineIndex: 0,
      };
      await handler({ type: 'ice-candidate', candidate });

      const pc = MockRTCPeerConnection.instances[0];
      expect(pc.addedCandidates).toHaveLength(1);
    });
  });

  // =========================================================================
  // Broadcasting neural packets
  // =========================================================================

  describe('broadcastNeuralPacket', () => {
    it('should send JSON via WebSocket when connected', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: false });
      await transport.connect();
      // Mark connected manually since our mock auto-resolves
      (transport as any).isConnected = true;

      const packet = makeNeuralPacket();
      transport.broadcastNeuralPacket(packet);

      const socket = (transport as any).socket as MockWebSocket;
      expect(socket.sentMessages).toHaveLength(1);

      const sent = JSON.parse(socket.sentMessages[0] as string);
      expect(sent.type).toBe('neural');
      expect(sent.data.agentId).toBe('agent-1');
    });

    it('should send JSON via DataChannel when connected via WebRTC', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      const packet = makeNeuralPacket();
      transport.broadcastNeuralPacket(packet);

      const channel = MockRTCDataChannel.instances[0];
      expect(channel.sentMessages.length).toBeGreaterThan(0);

      const sent = JSON.parse(channel.sentMessages[0] as string);
      expect(sent.type).toBe('neural');
    });

    it('should silently no-op when not connected', () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: false });
      // Never called connect()
      expect(() => transport.broadcastNeuralPacket(makeNeuralPacket())).not.toThrow();
    });
  });

  // =========================================================================
  // Broadcasting splat packets
  // =========================================================================

  describe('broadcastSplatPacket', () => {
    it('should send header + chunked buffers via WebSocket', async () => {
      const transport = new NeuralStreamingTransport({
        useWebRTC: false,
        chunkSize: 128,
      });
      await transport.connect();
      (transport as any).isConnected = true;

      const packet = makeSplatPacket(256); // 256 bytes / 128 chunk = 2 chunks per buffer
      transport.broadcastSplatPacket(packet);

      const socket = (transport as any).socket as MockWebSocket;
      // 1 header + 2 chunks (compressed) + 2 chunks (indices) = 5 messages
      expect(socket.sentMessages).toHaveLength(5);

      // First message should be the JSON header
      const header = JSON.parse(socket.sentMessages[0] as string);
      expect(header.type).toBe('splat_header');
      expect(header.splatCount).toBe(100);
      expect(header.compressedBytes).toBe(256);
      expect(header.indicesBytes).toBe(256);
    });

    it('should send header + chunked buffers via DataChannel', async () => {
      const transport = new NeuralStreamingTransport({
        useWebRTC: true,
        chunkSize: 128,
      });
      await transport.connect();

      const packet = makeSplatPacket(256);
      transport.broadcastSplatPacket(packet);

      const channel = MockRTCDataChannel.instances[0];
      // 1 header + 2 + 2 = 5
      expect(channel.sentMessages).toHaveLength(5);
    });

    it('should handle single-chunk buffers', async () => {
      const transport = new NeuralStreamingTransport({
        useWebRTC: false,
        chunkSize: 16384, // default, larger than buffer
      });
      await transport.connect();
      (transport as any).isConnected = true;

      const packet = makeSplatPacket(100); // Smaller than chunk size
      transport.broadcastSplatPacket(packet);

      const socket = (transport as any).socket as MockWebSocket;
      // 1 header + 1 chunk (compressed) + 1 chunk (indices) = 3 messages
      expect(socket.sentMessages).toHaveLength(3);
    });

    it('should silently no-op when not connected', () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: false });
      expect(() => transport.broadcastSplatPacket(makeSplatPacket())).not.toThrow();
    });
  });

  // =========================================================================
  // Disconnect
  // =========================================================================

  describe('disconnect', () => {
    it('should close WebSocket on disconnect', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: false });
      await transport.connect();

      transport.disconnect();

      const socket = (transport as any).socket as MockWebSocket;
      expect(socket.readyState).toBe(MockWebSocket.CLOSED);
    });

    it('should close PeerConnection and DataChannel on disconnect', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      transport.disconnect();

      const pc = MockRTCPeerConnection.instances[0];
      const channel = MockRTCDataChannel.instances[0];
      expect(pc.iceConnectionState).toBe('closed');
      expect(channel.readyState).toBe('closed');
    });

    it('should set isConnected to false', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: false });
      await transport.connect();
      (transport as any).isConnected = true;

      transport.disconnect();

      expect((transport as any).isConnected).toBe(false);
    });
  });

  // =========================================================================
  // ICE reconnection
  // =========================================================================

  describe('ICE reconnection', () => {
    it('should set isConnected to false on ICE disconnection', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      const pc = MockRTCPeerConnection.instances[0];
      pc.iceConnectionState = 'disconnected';
      pc.oniceconnectionstatechange?.();

      expect((transport as any).isConnected).toBe(false);
    });

    it('should set isConnected to false on ICE failure', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      const pc = MockRTCPeerConnection.instances[0];
      pc.iceConnectionState = 'failed';
      pc.oniceconnectionstatechange?.();

      expect((transport as any).isConnected).toBe(false);
    });

    it('should set isConnected to true when ICE connects', async () => {
      const transport = new NeuralStreamingTransport({ useWebRTC: true });
      await transport.connect();

      // Simulate connected event
      const pc = MockRTCPeerConnection.instances[0];
      pc.iceConnectionState = 'connected';
      pc.oniceconnectionstatechange?.();

      expect((transport as any).isConnected).toBe(true);
    });
  });
});
