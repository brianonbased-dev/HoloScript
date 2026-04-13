/**
 * NeuralStreamingService Test Suite
 *
 * Tests for the high-level streaming service that coordinates
 * NeuralStreamingTransport, GaussianSplatExtractor, and telemetry routing.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// All mock functions must be hoisted so vi.mock factories can reference them
const {
  mockConnect,
  mockDisconnect,
  mockBroadcastNeuralPacket,
  mockBroadcastSplatPacket,
  mockExtractFrame,
  MockTransportClass,
  MockExtractorClass,
} = vi.hoisted(() => {
  const mockConnect = vi.fn().mockResolvedValue(undefined);
  const mockDisconnect = vi.fn();
  const mockBroadcastNeuralPacket = vi.fn();
  const mockBroadcastSplatPacket = vi.fn();
  const mockExtractFrame = vi.fn();

  // vi.fn() with mockImplementation supports `new` invocation
  const MockTransportClass = vi.fn(function (this: any) {
    this.connect = mockConnect;
    this.disconnect = mockDisconnect;
    this.broadcastNeuralPacket = mockBroadcastNeuralPacket;
    this.broadcastSplatPacket = mockBroadcastSplatPacket;
  });

  const MockExtractorClass = vi.fn(function (this: any) {
    this.extractFrame = mockExtractFrame;
  });

  return {
    mockConnect,
    mockDisconnect,
    mockBroadcastNeuralPacket,
    mockBroadcastSplatPacket,
    mockExtractFrame,
    MockTransportClass,
    MockExtractorClass,
  };
});

vi.mock('../NeuralStreamingTransport', () => ({
  NeuralStreamingTransport: MockTransportClass,
}));

vi.mock('../../gpu/GaussianSplatExtractor', () => ({
  GaussianSplatExtractor: MockExtractorClass,
}));

import { NeuralStreamingService, type NeuralStreamingConfig } from '@holoscript/core';
import type { ISignalingBridge } from '@holoscript/core';
import type { INeuralPacket } from '@holoscript/core';

describe('NeuralStreamingService', () => {
  let service: NeuralStreamingService;
  let config: NeuralStreamingConfig;

  beforeEach(() => {
    vi.clearAllMocks();

    config = {
      useWebRTC: false,
      maxSplats: 50000,
    };

    service = new NeuralStreamingService(config);
  });

  // =========================================================================
  // Construction
  // =========================================================================

  describe('construction', () => {
    it('should create a NeuralStreamingService', () => {
      expect(service).toBeDefined();
    });

    it('should create transport with provided config', () => {
      // MockTransportClass was called as constructor — verify via the hoisted fn
      expect(MockTransportClass).toHaveBeenCalled();
    });

    it('should not be streaming initially', () => {
      expect((service as any).isStreaming).toBe(false);
    });

    it('should not have an extractor initially', () => {
      expect((service as any).extractor).toBeNull();
    });
  });

  // =========================================================================
  // Initialize
  // =========================================================================

  describe('initialize', () => {
    it('should call transport.connect()', async () => {
      await service.initialize();
      expect(mockConnect).toHaveBeenCalledOnce();
    });

    it('should pass signaling bridge to transport.connect()', async () => {
      const bridge: ISignalingBridge = {
        targetPeerId: 'peer-1',
        onReceiveSignal: vi.fn(),
        sendSignal: vi.fn().mockResolvedValue(undefined),
      };

      await service.initialize(bridge);
      expect(mockConnect).toHaveBeenCalledWith(bridge);
    });

    it('should call transport.connect() without bridge when none provided', async () => {
      await service.initialize();
      expect(mockConnect).toHaveBeenCalledWith(undefined);
    });
  });

  // =========================================================================
  // Streaming lifecycle
  // =========================================================================

  describe('streaming lifecycle', () => {
    it('should start streaming', () => {
      service.startStreaming();
      expect((service as any).isStreaming).toBe(true);
    });

    it('should stop streaming', () => {
      service.startStreaming();
      service.stopStreaming();
      expect((service as any).isStreaming).toBe(false);
    });

    it('should allow restart after stop', () => {
      service.startStreaming();
      service.stopStreaming();
      service.startStreaming();
      expect((service as any).isStreaming).toBe(true);
    });
  });

  // =========================================================================
  // Cognitive telemetry
  // =========================================================================

  describe('streamCognitiveTelemetry', () => {
    const mockPacket: INeuralPacket = {
      agentId: 'agent-1',
      timestamp: Date.now(),
      cognitiveLoad: 0.5,
      attentionVector: [0.1, 0.2, 0.3],
      emotionalValence: 0.7,
      actionPrediction: { type: 'move', confidence: 0.9 },
    } as INeuralPacket;

    it('should not broadcast when not streaming', () => {
      service.streamCognitiveTelemetry(mockPacket);
      expect(mockBroadcastNeuralPacket).not.toHaveBeenCalled();
    });

    it('should broadcast when streaming', () => {
      service.startStreaming();
      service.streamCognitiveTelemetry(mockPacket);
      expect(mockBroadcastNeuralPacket).toHaveBeenCalledWith(mockPacket);
    });

    it('should stop broadcasting after stopStreaming', () => {
      service.startStreaming();
      service.streamCognitiveTelemetry(mockPacket);
      service.stopStreaming();
      service.streamCognitiveTelemetry(mockPacket);
      expect(mockBroadcastNeuralPacket).toHaveBeenCalledTimes(1);
    });

    it('should broadcast multiple packets in sequence', () => {
      service.startStreaming();
      service.streamCognitiveTelemetry(mockPacket);
      service.streamCognitiveTelemetry({ ...mockPacket, cognitiveLoad: 0.9 } as INeuralPacket);
      expect(mockBroadcastNeuralPacket).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Visual topology streaming
  // =========================================================================

  describe('streamVisualTopology', () => {
    const mockSorter = {} as any;
    const mockCamera = { position: [0, 0, 0], rotation: [0, 0, 0, 1], fov: 60 } as any;
    const mockCompressedBuf = {} as GPUBuffer;
    const mockIndicesBuf = {} as GPUBuffer;

    it('should not stream when not streaming', async () => {
      service.attachSplatExtractor({} as any);
      await service.streamVisualTopology(mockSorter, mockCamera, mockCompressedBuf, mockIndicesBuf);
      expect(mockExtractFrame).not.toHaveBeenCalled();
    });

    it('should not stream when extractor not attached', async () => {
      service.startStreaming();
      await service.streamVisualTopology(mockSorter, mockCamera, mockCompressedBuf, mockIndicesBuf);
      expect(mockExtractFrame).not.toHaveBeenCalled();
    });

    it('should extract and broadcast when streaming with extractor', async () => {
      const mockSplatPacket = {
        frameId: 1,
        splatCount: 100,
        cameraState: mockCamera,
        compressedSplatsBuffer: new ArrayBuffer(64),
        sortedIndicesBuffer: new ArrayBuffer(64),
      };
      mockExtractFrame.mockResolvedValueOnce(mockSplatPacket);

      service.attachSplatExtractor({} as any);
      service.startStreaming();
      await service.streamVisualTopology(mockSorter, mockCamera, mockCompressedBuf, mockIndicesBuf);

      expect(mockExtractFrame).toHaveBeenCalledWith(
        mockSorter,
        mockCamera,
        mockCompressedBuf,
        mockIndicesBuf
      );
      expect(mockBroadcastSplatPacket).toHaveBeenCalledWith(mockSplatPacket);
    });

    it('should not broadcast if extractFrame returns null', async () => {
      mockExtractFrame.mockResolvedValueOnce(null);

      service.attachSplatExtractor({} as any);
      service.startStreaming();
      await service.streamVisualTopology(mockSorter, mockCamera, mockCompressedBuf, mockIndicesBuf);

      expect(mockExtractFrame).toHaveBeenCalled();
      expect(mockBroadcastSplatPacket).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Shutdown
  // =========================================================================

  describe('shutdown', () => {
    it('should stop streaming on shutdown', () => {
      service.startStreaming();
      service.shutdown();
      expect((service as any).isStreaming).toBe(false);
    });

    it('should disconnect transport on shutdown', () => {
      service.shutdown();
      expect(mockDisconnect).toHaveBeenCalledOnce();
    });

    it('should null out extractor on shutdown', () => {
      service.attachSplatExtractor({} as any);
      expect((service as any).extractor).not.toBeNull();
      service.shutdown();
      expect((service as any).extractor).toBeNull();
    });

    it('should be safe to call shutdown multiple times', () => {
      service.shutdown();
      service.shutdown();
      expect(mockDisconnect).toHaveBeenCalledTimes(2);
    });
  });

  // =========================================================================
  // Attach splat extractor
  // =========================================================================

  describe('attachSplatExtractor', () => {
    it('should create extractor when attached', () => {
      service.attachSplatExtractor({} as any);
      expect((service as any).extractor).not.toBeNull();
      expect(MockExtractorClass).toHaveBeenCalled();
    });

    it('should replace extractor on subsequent calls', () => {
      service.attachSplatExtractor({} as any);
      const first = (service as any).extractor;

      service.attachSplatExtractor({} as any);
      const second = (service as any).extractor;

      expect(first).not.toBe(second);
    });
  });
});
