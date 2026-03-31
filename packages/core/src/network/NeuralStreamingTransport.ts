import type { INeuralPacket, INeuralSplatPacket } from './NetworkTypes.js';

export interface StreamingTransportConfig {
  useWebRTC: boolean;
  endpointUrl?: string; // For WebSockets
  rtcConfiguration?: RTCConfiguration;
  chunkSize?: number; // Default 16KB for UDP-safe transmission over DataChannels
}

/**
 * Handles the actual transmission of Neural Packets and Splat Buffers.
 * Manages chunking to bypass standard UDP/WebRTC MTU limits.
 */
export class NeuralStreamingTransport {
  private config: Required<StreamingTransportConfig>;
  private socket: WebSocket | null = null;
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private isConnected = false;

  constructor(config: StreamingTransportConfig) {
    this.config = {
      useWebRTC: config.useWebRTC,
      endpointUrl: config.endpointUrl ?? 'ws://localhost:8080/neural',
      rtcConfiguration: config.rtcConfiguration ?? { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] },
      chunkSize: config.chunkSize ?? 16384, // 16KB safe limit for WebRTC
    };
  }

  public async connect(): Promise<void> {
    if (this.isConnected) return;

    if (this.config.useWebRTC && typeof RTCPeerConnection !== 'undefined') {
      await this.initWebRTC();
    } else {
      await this.initWebSocket();
    }
    
    this.isConnected = true;
  }

  private initWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.config.endpointUrl);
      this.socket.binaryType = 'arraybuffer';
      
      this.socket.onopen = () => {
        resolve();
      };
      
      this.socket.onerror = (e) => {
        console.error('NeuralStreamingTransport WebSocket Error', e);
        reject(e);
      };
    });
  }

  private initWebRTC(): Promise<void> {
    return new Promise((resolve) => {
      this.peerConnection = new RTCPeerConnection(this.config.rtcConfiguration);
      
      // Assume DataChannel initiation from our side for streaming out
      this.dataChannel = this.peerConnection.createDataChannel('neural-streaming', {
        ordered: false, // Out of order is fine for streaming, we drop old frames
        maxRetransmits: 0 // Drop instead of retry for real-time
      });

      this.dataChannel.onopen = () => resolve();

      // In a real WebRTC setup, signaling (SDP/ICE) happens here. 
      // For this bridge scaffolding, we assume signaling is managed externally.
    });
  }

  /**
   * Broadcasts a cognitive/telemetry packet.
   */
  public broadcastNeuralPacket(packet: INeuralPacket): void {
    if (!this.isConnected) return;

    const payload = JSON.stringify({
      type: 'neural',
      data: packet
    });

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(payload);
    } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(payload);
    }
  }

  /**
   * Chunks and streams Gaussian Splat buffers.
   */
  public broadcastSplatPacket(packet: INeuralSplatPacket): void {
    if (!this.isConnected) return;

    // We serialize the header as JSON, then send binary chunks for the payload.
    const header = {
      type: 'splat_header',
      frameId: packet.frameId,
      splatCount: packet.splatCount,
      cameraState: packet.cameraState,
      // Total bytes expecting
      compressedBytes: packet.compressedSplatsBuffer.byteLength,
      indicesBytes: packet.sortedIndicesBuffer.byteLength
    };

    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(JSON.stringify(header));
      this.sendInChunks(this.dataChannel, packet.compressedSplatsBuffer);
      this.sendInChunks(this.dataChannel, packet.sortedIndicesBuffer);
    } else if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(header));
      this.sendInChunks(this.socket, packet.compressedSplatsBuffer);
      this.sendInChunks(this.socket, packet.sortedIndicesBuffer);
    }
  }

  /**
   * Helps burst out large ArrayBuffers while avoiding WebRTC channel limits.
   */
  private sendInChunks(transport: RTCDataChannel | WebSocket, buffer: ArrayBuffer) {
    let offset = 0;
    const size = this.config.chunkSize;
    while (offset < buffer.byteLength) {
      const slice = buffer.slice(offset, offset + size);
      transport.send(slice);
      offset += size;
    }
  }

  public disconnect(): void {
    this.socket?.close();
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.isConnected = false;
  }
}
