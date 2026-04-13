import type { INeuralPacket } from './NetworkTypes.js';
import type { GaussianSplatSorter, CameraState } from '@holoscript/engine/gpu';
import type { WebGPUContext } from '@holoscript/engine/gpu';
import {
  NeuralStreamingTransport,
  StreamingTransportConfig,
  ISignalingBridge,
} from './NeuralStreamingTransport.js';
import { GaussianSplatExtractor } from '@holoscript/engine/gpu';

export interface NeuralStreamingConfig extends StreamingTransportConfig {
  maxSplats: number;
}

/**
 * NeuralStreamingService
 * Integrates directly with the UAALVirtualMachine to relay cognitive state (`NeuralPacket`),
 * and interfaces with the `GaussianSplatSorter` to route visual topology via WebRTC/WebSocket.
 *
 * This fundamentally enables Pillar 2: Native Neural Streaming for thin-device clients.
 */
export class NeuralStreamingService {
  private transport: NeuralStreamingTransport;
  private extractor: GaussianSplatExtractor | null = null;
  private isStreaming = false;

  constructor(private config: NeuralStreamingConfig) {
    this.transport = new NeuralStreamingTransport(config);
  }

  /**
   * Boots up the streaming transport layer. Optionally takes a signaling bridge to
   * negotiate dynamic connection handshakes.
   */
  public async initialize(signalingBridge?: ISignalingBridge): Promise<void> {
    await this.transport.connect(signalingBridge);
  }

  /**
   * Hooks into the WebGPU context to pull out raw Gaussian splat data.
   */
  public attachSplatExtractor(context: WebGPUContext): void {
    this.extractor = new GaussianSplatExtractor(context, { maxSplats: this.config.maxSplats });
  }

  /**
   * Ingests and routes a cognitive telemetry packet (`NeuralPacket`) from the UAAL Virtual Machine.
   */
  public streamCognitiveTelemetry(packet: INeuralPacket): void {
    if (!this.isStreaming) return;
    this.transport.broadcastNeuralPacket(packet);
  }

  /**
   * Processes the output of the GaussianSplatSorter for the current frame and streams it.
   */
  public async streamVisualTopology(
    sorter: GaussianSplatSorter,
    camera: CameraState,
    compressedSource: GPUBuffer,
    indicesSource: GPUBuffer
  ): Promise<void> {
    if (!this.isStreaming || !this.extractor) return;

    // 1. Pull the data from GPU onto the CPU
    const packet = await this.extractor.extractFrame(
      sorter,
      camera,
      compressedSource,
      indicesSource
    );

    // 2. Dispatch the payload via the transport stream
    if (packet) {
      this.transport.broadcastSplatPacket(packet);
    }
  }

  public startStreaming(): void {
    this.isStreaming = true;
  }

  public stopStreaming(): void {
    this.isStreaming = false;
  }

  public shutdown(): void {
    this.stopStreaming();
    this.transport.disconnect();
    this.extractor = null;
  }
}
