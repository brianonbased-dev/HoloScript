/**
 * WebRTC P2P Transport for HoloScript Network Synchronization
 *
 * Provides peer-to-peer communication for networked traits.
 * Used as fallback when WebSocket is unavailable or for low-latency P2P scenarios.
 *
 * @version 1.0.0
 * Features:
 * - Direct peer-to-peer connections
 * - Signaling via WebSocket
 * - Data channel for message passing
 * - ICE candidate gathering
 */

export interface WebRTCTransportConfig {
  /** Signaling server URL for WebRTC negotiation */
  signalingServerUrl: string;
  
  /** Room ID for peer discovery */
  roomId: string;
  
  /** Peer ID (auto-generated if not provided) */
  peerId?: string;
  
  /** ICE servers for NAT traversal */
  iceServers?: RTCIceServer[];
}

export type SocialPacketType = 'SOCIAL_REQUEST' | 'SOCIAL_ACCEPT' | 'SOCIAL_REJECT' | 'SOCIAL_STATUS';

export interface SocialPacket {
  type: SocialPacketType;
  payload: any;
  fromPeerId?: string;
}

export interface WebRTCPeer {
  peerId: string;
  connection: RTCPeerConnection;
  dataChannels: Map<string, RTCDataChannel>;
  isConnected: boolean;
}

export class WebRTCTransport {
  private config: WebRTCTransportConfig;
  private peerId: string;
  private peers = new Map<string, WebRTCPeer>();
  private messageHandlers = new Map<string, (msg: unknown) => void>();
  private signalingWs: WebSocket | null = null;
  private socialMessageHandlers: Set<(packet: SocialPacket) => void> = new Set();
  
  // Batching
  private socialBatchQueue: SocialPacket[] = [];
  private batchInterval: any = null;
  private readonly BATCH_DELAY_MS = 50;

  private localStream: MediaStream | null = null;
  private eventHandlers: Map<string, ((...args: any[]) => void)[]> = new Map();

  constructor(config: WebRTCTransportConfig) {
    this.config = config;
    this.peerId = config.peerId || this.generatePeerId();
  }

  /**
   * Add local media stream (audio/video)
   */
  addStream(stream: MediaStream): void {
    this.localStream = stream;
    
    // Add tracks to all existing peers
    this.peers.forEach((peer) => {
      stream.getTracks().forEach(track => {
        peer.connection.addTrack(track, stream);
      });
      // Re-negotiate if needed (simplified for this implementation)
      // In a real impl, we'd check negotiationneeded
    });
  }

  /**
   * Enable or disable local microphone tracks
   */
  setMicrophoneEnabled(enabled: boolean): void {
    if (this.localStream) {
        this.localStream.getAudioTracks().forEach(track => {
            track.enabled = enabled;
        });
    }
  }

  /**
   * Register event handler
   */
  on(event: string, handler: (...args: any[]) => void): void {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, []);
    }
    this.eventHandlers.get(event)!.push(handler);
  }

  private emit(event: string, ...args: any[]): void {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach(h => h(...args));
    }
  }

  /**
   * Initialize WebRTC transport
   */
  async initialize(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.signalingWs = new WebSocket(this.config.signalingServerUrl);

        this.signalingWs.onopen = () => {
          console.log(
            `✓ WebRTC signaling connected to ${this.config.signalingServerUrl}`
          );
          
          // Announce presence in room
          this.signalingWs?.send(
            JSON.stringify({
              type: 'join-room',
              roomId: this.config.roomId,
              peerId: this.peerId,
            })
          );

          resolve();
        };

        this.signalingWs.onmessage = (evt) => {
          this.handleSignalingMessage(JSON.parse(evt.data));
        };

        this.signalingWs.onerror = (evt) => {
          console.error('Signaling WebSocket error:', evt);
          reject(new Error('Signaling connection failed'));
        };

        this.signalingWs.onclose = () => {
          console.warn('Signaling WebSocket closed');
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Connect to a peer
   */
  async connectToPeer(removalPeerId: string): Promise<void> {
    if (this.peers.has(removalPeerId)) {
      return; // Already connected
    }

    const config: RTCConfiguration = {
      iceServers: this.config.iceServers || [
        { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
      ],
    };

    const pc = new RTCPeerConnection(config);
    
    // Add local stream tracks to new connection
    if (this.localStream) {
      this.localStream.getTracks().forEach(track => {
        pc.addTrack(track, this.localStream!);
      });
    }

    this.peers.set(removalPeerId, {
      peerId: removalPeerId,
      connection: pc,
      dataChannels: new Map(),
      isConnected: false,
    });

    // Handle incoming tracks (Voice Chat)
    pc.ontrack = (evt) => {
      this.emit('stream-added', {
        peerId: removalPeerId,
        stream: evt.streams[0],
        track: evt.track
      });
    };

    // Handle ICE candidates
    pc.onicecandidate = (evt) => {
      if (evt.candidate) {
        this.signalingWs?.send(
          JSON.stringify({
            type: 'ice-candidate',
            from: this.peerId,
            to: removalPeerId,
            candidate: evt.candidate,
          })
        );
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      const peer = this.peers.get(removalPeerId);
      if (peer) peer.isConnected = pc.connectionState === 'connected';
    };

    // Handle incoming data channels
    pc.ondatachannel = (evt) => {
      this.setupDataChannel(removalPeerId, evt.channel);
    };

    // Create offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send offer via signaling
      this.signalingWs?.send(
        JSON.stringify({
          type: 'offer',
          from: this.peerId,
          to: removalPeerId,
          offer: offer,
        })
      );
    } catch (err) {
      console.error('Failed to create WebRTC offer:', err);
      this.peers.delete(removalPeerId);
    }
  }

  /**
   * Send message to peer(s)
   */
  sendMessage(targetPeerId: string | null, msg: unknown): void {
    const data = JSON.stringify(msg);

    if (targetPeerId) {
      // Unicast to specific peer
      const peer = this.peers.get(targetPeerId);
      if (peer && peer.isConnected) {
        const channel = peer.dataChannels.get('default');
        if (channel?.readyState === 'open') {
          channel.send(data);
        }
      }
    } else {
      // Broadcast to all connected peers
      this.peers.forEach((peer) => {
        if (peer.isConnected) {
          const channel = peer.dataChannels.get('default');
          if (channel?.readyState === 'open') {
            channel.send(data);
          }
        }
      });
    }
  }

  /**
   * Send a social system message
   */
  sendSocialMessage(packet: SocialPacket, targetPeerId?: string): void {
    // Batch status updates to reduce overhead
    if (packet.type === 'SOCIAL_STATUS') {
        this.socialBatchQueue.push(packet);
        if (!this.batchInterval) {
            this.batchInterval = setInterval(() => this.flushBatch(), this.BATCH_DELAY_MS);
        }
        return;
    }

    const msg = {
      _system: true,
      ...packet
    };
    this.sendMessage(targetPeerId || null, msg); // Targeted or Broadcast
  }

  private flushBatch(): void {
    if (this.socialBatchQueue.length === 0) {
        clearInterval(this.batchInterval);
        this.batchInterval = null;
        return;
    }

    // Deduplicate status updates for same user (last wins)
    // Only beneficial if we were sending multiple updates for same user, 
    // but here we are sending OUR status to multiple people.
    // Actually, if we have multiple packets, we should bundle them.
    // BUT current protocol expects single packet. 
    // Optimization: Just send the latest one if multiple updates queued for same user (us).
    // Start simple: send all as individual messages (batching network calls is harder without protocol change)
    // WAIT: To truly batch, we need a SOCIAL_BATCH packet type.
    // For now, let's just use the interval to throttle the *sending* calls on the socket.
    
    // Better Optimization for now: Throttle/Debounce outgoing status
    // If we have multiple SOCIAL_STATUS in queue, only send the last one.
    
    const lastStatus = this.socialBatchQueue.pop(); // Get latest
    this.socialBatchQueue = []; // Clear rest (intermediate states don't matter)
    
    if (lastStatus) {
        const msg = {
            _system: true,
            ...lastStatus
        };
        this.sendMessage(null, msg);
    }
  }

  /**
   * Register handler for social messages
   */
  onSocialMessage(handler: (packet: SocialPacket) => void): void {
    this.socialMessageHandlers.add(handler);
  }

  /**
   * Register message handler
   */
  onMessage(handler: (msg: unknown) => void): void {
    this.messageHandlers.set('default', handler);
  }

  /**
   * Disconnect from all peers
   */
  disconnect(): void {
    this.peers.forEach((peer) => {
      peer.dataChannels.forEach((channel) => channel.close());
      peer.connection.close();
    });
    this.peers.clear();

    if (this.signalingWs) {
      this.signalingWs.close();
      this.signalingWs = null;
    }
  }

  // Private helpers

  private handleSignalingMessage(msg: any): void {
    switch (msg.type) {
      case 'offer': {
        this.handleOffer(msg.from, msg.offer);
        break;
      }
      case 'answer': {
        this.handleAnswer(msg.from, msg.answer);
        break;
      }
      case 'ice-candidate': {
        this.handleIceCandidate(msg.from, msg.candidate);
        break;
      }
      case 'peer-list': {
        // Connect to all peers in room
        msg.peers.forEach((peerId: string) => {
          if (peerId !== this.peerId && !this.peers.has(peerId)) {
            this.connectToPeer(peerId);
          }
        });
        break;
      }
    }
  }

  private async handleOffer(peerId: string, offer: RTCSessionDescriptionInit): Promise<void> {
    // Ensure peer connection exists
    if (!this.peers.has(peerId)) {
      await this.connectToPeer(peerId);
    }

    const peer = this.peers.get(peerId)!;
    try {
      await peer.connection.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await peer.connection.createAnswer();
      await peer.connection.setLocalDescription(answer);

      this.signalingWs?.send(
        JSON.stringify({
          type: 'answer',
          from: this.peerId,
          to: peerId,
          answer: answer,
        })
      );
    } catch (err) {
      console.error('Failed to handle WebRTC offer:', err);
    }
  }

  private async handleAnswer(
    peerId: string,
    answer: RTCSessionDescriptionInit
  ): Promise<void> {
    const peer = this.peers.get(peerId);
    if (peer) {
      try {
        await peer.connection.setRemoteDescription(new RTCSessionDescription(answer));
      } catch (err) {
        console.error('Failed to handle WebRTC answer:', err);
      }
    }
  }

  private handleIceCandidate(peerId: string, candidate: RTCIceCandidateInit): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connection.addIceCandidate(new RTCIceCandidate(candidate));
    }
  }

  private setupDataChannel(peerId: string, channel: RTCDataChannel): void {
    const peer = this.peers.get(peerId);
    if (!peer) return;

    peer.dataChannels.set(channel.label, channel);

    channel.onmessage = (evt) => {
      try {
        const msg = JSON.parse(evt.data);
        
        // Intercept system messages
        if (msg._system && this.socialMessageHandlers.size > 0) {
           this.socialMessageHandlers.forEach(handler => handler(msg));
           return;
        }

        const handler = this.messageHandlers.get('default');
        if (handler) handler(msg);
      } catch (err) {
        console.error('Failed to parse WebRTC message:', err);
      }
    };

    channel.onerror = (evt) => {
      console.error('Data channel error:', evt);
    };

    channel.onclose = () => {
      peer.dataChannels.delete(channel.label);
    };
  }

  private generatePeerId(): string {
    return `peer-${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Create a WebRTC transport instance
 */
export function createWebRTCTransport(config: WebRTCTransportConfig): WebRTCTransport {
  return new WebRTCTransport(config);
}
