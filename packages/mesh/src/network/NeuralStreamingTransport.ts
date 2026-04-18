import type { INeuralPacket, INeuralSplatPacket } from './NetworkTypes.js';

export interface StreamingTransportConfig {
  useWebRTC: boolean;
  endpointUrl?: string; // For WebSockets
  rtcConfiguration?: RTCConfiguration;
  chunkSize?: number; // Default 16KB for UDP-safe transmission over DataChannels
}

/**
 * Payload structure for out-of-band WebRTC signaling messages.
 */
export interface NeuralSignalPayload {
  type: 'offer' | 'answer' | 'ice-candidate';
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit;
}

/**
 * Interface for out-of-band WebRTC signaling, typically fulfilled by HoloMesh A2A messaging.
 */
export interface ISignalingBridge {
  targetPeerId: string;
  onReceiveSignal: (handler: (payload: NeuralSignalPayload) => void) => void;
  sendSignal: (payload: NeuralSignalPayload) => Promise<void>;
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
  private signalingBridge: ISignalingBridge | null = null;
  private isReconnecting = false;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private isManuallyDisconnected = false;

  constructor(config: StreamingTransportConfig) {
    this.config = {
      useWebRTC: config.useWebRTC,
      endpointUrl: config.endpointUrl ?? 'ws://localhost:8080/neural',
      rtcConfiguration: config.rtcConfiguration ?? {
        iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
      },
      chunkSize: config.chunkSize ?? 16384, // 16KB safe limit for WebRTC
    };
  }

  public async connect(signalingBridge?: ISignalingBridge): Promise<void> {
    if (this.isConnected) return;
    this.isManuallyDisconnected = false;

    if (signalingBridge) {
      this.signalingBridge = signalingBridge;
      this.signalingBridge.onReceiveSignal(this.handleSignalingMessage.bind(this));
    }

    if (this.config.useWebRTC && typeof RTCPeerConnection !== 'undefined') {
      await this.initWebRTC();
    } else {
      await this.initWebSocket();
    }

    // Note: isConnected becomes true only after data channel or socket opens
  }

  private initWebSocket(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.config.endpointUrl);
      this.socket.binaryType = 'arraybuffer';

      this.socket.onopen = () => {
        this.isConnected = true;
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

      this.peerConnection.onicecandidate = (event) => {
        if (event.candidate && this.signalingBridge) {
          this.signalingBridge.sendSignal({ type: 'ice-candidate', candidate: event.candidate });
        }
      };

      this.peerConnection.oniceconnectionstatechange = () => {
        const state = this.peerConnection?.iceConnectionState;
        if (state === 'disconnected' || state === 'failed') {
          console.warn(
            '[NeuralStreamingTransport] ICE connection failed/disconnected. Attempting autonomous reconnect...'
          );
          this.isConnected = false;
          this.attemptReconnect();
        } else if (state === 'connected' || state === 'completed') {
          this.isConnected = true;
        }
      };

      // Assume DataChannel initiation from our side for streaming out
      this.dataChannel = this.peerConnection.createDataChannel('neural-streaming', {
        ordered: false, // Out of order is fine for streaming, we drop old frames
        maxRetransmits: 0, // Drop instead of retry for real-time
      });

      this.dataChannel.onopen = () => {
        this.isConnected = true;
        resolve();
      };

      // If we have a signaling bridge, initiate the offer immediately
      if (this.signalingBridge && !this.isReconnecting) {
        this.peerConnection
          .createOffer()
          .then((offer) => {
            return this.peerConnection!.setLocalDescription(offer).then(() => {
              this.signalingBridge!.sendSignal({ type: 'offer', sdp: offer });
            });
          })
          .catch((err) => {
            console.error('[NeuralStreamingTransport] Failed to create offer', err);
          });
      }
    });
  }

  /**
   * Handles incoming signaling messages from the ISignalingBridge.
   */
  private async handleSignalingMessage(payload: NeuralSignalPayload): Promise<void> {
    if (!this.peerConnection) return;

    try {
      if (payload.type === 'offer' && payload.sdp) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        if (this.signalingBridge) {
          await this.signalingBridge.sendSignal({ type: 'answer', sdp: answer });
        }
      } else if (payload.type === 'answer' && payload.sdp) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
      } else if (payload.type === 'ice-candidate' && payload.candidate) {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    } catch (err) {
      console.error('[NeuralStreamingTransport] Signaling handling error', err);
    }
  }

  private async attemptReconnect(): Promise<void> {
    if (this.isReconnecting) return;
    this.isReconnecting = true;

    // Teardown
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.dataChannel = null;
    this.peerConnection = null;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    // Backoff reconnect
    this.reconnectTimer = setTimeout(async () => {
      this.reconnectTimer = null;

      // If transport was intentionally disconnected, do not auto-reconnect.
      if (this.isManuallyDisconnected) {
        this.isReconnecting = false;
        return;
      }

      // In Node/test teardown, RTCPeerConnection may no longer exist.
      if (typeof RTCPeerConnection === 'undefined') {
        this.isReconnecting = false;
        return;
      }

      try {
        await this.initWebRTC();
      } catch (err) {
        console.error('[NeuralStreamingTransport] Reconnect failed', err);
      } finally {
        this.isReconnecting = false;
      }
    }, 2000);
  }

  /**
   * Broadcasts a cognitive/telemetry packet.
   */
  public broadcastNeuralPacket(packet: INeuralPacket): void {
    if (!this.isConnected) return;

    const payload = JSON.stringify({
      type: 'neural',
      data: packet,
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
      indicesBytes: packet.sortedIndicesBuffer.byteLength,
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
    this.isManuallyDisconnected = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.isReconnecting = false;
    this.signalingBridge = null;
    this.socket?.close();
    this.dataChannel?.close();
    this.peerConnection?.close();
    this.isConnected = false;
  }
}
