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
 *
 * TODO: HOLOLAND INTEGRATION - VRR Multiplayer & VR Voice Chat
 *
 * REQUIRED ENHANCEMENTS FOR HOLOLAND:
 * 1. VRR Twin Multiplayer (1000+ concurrent players per twin)
 *    - Spatial partitioning (divide VRR twin into 100m x 100m cells)
 *    - Interest management (only sync players within 500m radius)
 *    - Relay servers for scalability (mesh topology breaks at 50+ peers)
 *
 * 2. Spatial Audio for VR Worlds
 *    - 3D positional audio (Web Audio API + PannerNode)
 *    - Audio attenuation by distance (inverse square law)
 *    - Occlusion (walls block sound)
 *    - Reverb zones (different acoustics per room)
 *
 * 3. Quest State Synchronization
 *    - Sync quest progress across multiplayer party
 *    - Shared quest objectives (all party members contribute)
 *    - Quest completion rewards distributed to party
 *
 * 4. AR → VRR Layer Transition State
 *    - Persist AR scan data → VRR quest context
 *    - Sync multiplayer state across layer transitions
 *    - Resume party session when entering VRR from AR
 *
 * 5. x402 Payment Integration
 *    - Premium voice chat (paid feature, $1/month)
 *    - Private VR rooms (paid feature, $5/room)
 *    - Verify payment before enabling voice/video
 *
 * 6. AI Agent Voice Synthesis
 *    - Story Weaver AI narrator (TTS for quest dialogue)
 *    - AI NPC voices (generated via ElevenLabs, Replica)
 *    - Lip-sync animation for AI agents
 *
 * 7. Performance Optimizations
 *    - Adaptive bitrate for voice/video (based on bandwidth)
 *    - Simulcast for multi-party (send multiple quality levels)
 *    - Selective forwarding unit (SFU) for 100+ players
 *
 * EXAMPLE USAGE (VRR Twin with 200 Players):
 * ```typescript
 * const transport = createWebRTCTransport({
 *   signalingServerUrl: 'wss://multiplayer.hololand.io',
 *   roomId: 'phoenix_downtown_vrr',
 *   peerId: 'player_123',
 *   iceServers: [{ urls: 'stun:stun.hololand.io:3478' }],
 *   spatialAudio: true, // TODO: Add spatial audio config
 *   interestManagement: { // TODO: Add interest management
 *     enabled: true,
 *     radius: 500, // meters
 *     updateInterval: 100 // ms
 *   }
 * });
 *
 * // Enable spatial audio
 * transport.enableSpatialAudio({
 *   maxDistance: 100, // meters
 *   rolloffFactor: 2, // inverse square
 *   coneInnerAngle: 60, // degrees
 *   coneOuterAngle: 120
 * });
 *
 * // Update player position for spatial audio
 * transport.updatePosition({ x: 100, y: 0, z: 50 });
 * ```
 *
 * INTEGRATION POINTS:
 * - VRRRuntime.ts (multiplayer state sync)
 * - VRRCompiler.ts (generates WebRTC initialization code)
 * - x402PaymentService.ts (verify payment for premium voice)
 * - AgentKitIntegration.ts (AI agent voice synthesis)
 *
 * RESEARCH REFERENCES:
 * - HOLOLAND_INTEGRATION_TODOS.md (WebRTC multiplayer section)
 * - uAA2++_Protocol/5.GROW P.029: "Machine Customers for VR Platforms"
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

  // TODO: Add Hololand VRR multiplayer configuration
  // IMPLEMENTATION: Use Web Audio API PannerNode for 3D positional audio
  // - Create AudioContext and PannerNode per remote peer
  // - Update panner.setPosition() on every peer movement (from social packets)
  // - Apply distance model: panner.distanceModel = 'inverse' (inverse square law)
  // - Add occlusion: reduce gain when walls detected via raycasting
  // - Reference: https://developer.mozilla.org/en-US/docs/Web/API/PannerNode
  // spatialAudio?: {
  //   enabled: boolean;
  //   maxDistance: number; // meters (default: 50m, voice fades beyond this)
  //   rolloffFactor: number; // 1 = linear, 2 = inverse square (default: 2)
  //   coneInnerAngle?: number; // degrees (directional audio, e.g., 60°)
  //   coneOuterAngle?: number; // degrees (outer cone, e.g., 120°)
  //   occlusionEnabled?: boolean; // reduce volume when walls block line-of-sight
  // };
  //
  // TODO: Add interest management for 1000+ player scalability
  // IMPLEMENTATION: Spatial partitioning to reduce O(n²) peer updates to O(log n)
  // - Grid: Divide world into 50m×50m cells, only sync players in same cell + adjacent 8 cells
  // - Quadtree: Hierarchical tree for dynamic player density (better for uneven distribution)
  // - Update visible peers every 100-500ms (not every frame)
  // - Send full state on enter radius, delta updates while in radius, disconnect on exit
  // - Critical for VRR downtown Phoenix (1000+ concurrent players in same zone)
  // - Reference: https://0fps.net/2015/01/07/spatial-data-structures-for-networked-games/
  // interestManagement?: {
  //   enabled: boolean;
  //   radius: number; // meters (default: 500m for VRR, only sync players within radius)
  //   updateInterval: number; // ms (default: 100ms, how often to update visible players)
  //   spatialPartitioning?: 'grid' | 'quadtree'; // algorithm (grid = simpler, quadtree = adaptive)
  // };
  //
  // TODO: Add x402 payment verification for premium features
  // IMPLEMENTATION: HTTP 402 Payment Required verification before enabling features
  // - Before getUserMedia(audio): POST to x402Endpoint with userId + feature='voice'
  // - Response 200 = paid, enable voice; Response 402 = unpaid, show payment modal
  // - Before getUserMedia(video): Same flow for video feature
  // - Before creating private room: Verify payment, charge $5 via x402 protocol
  // - Cache payment status for 1 hour (reduce API calls)
  // - Integration: packages/marketplace-api/src/x402PaymentService.ts
  // - Reference: https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/402
  // premiumFeatures?: {
  //   voiceChat: boolean; // Require payment for voice ($1/month subscription)
  //   videoChat: boolean; // Require payment for video ($5/month subscription)
  //   privateRooms: boolean; // Require payment for private VR rooms ($5/room one-time)
  //   x402Endpoint?: string; // x402 payment verification endpoint (e.g., /api/x402/verify)
  // };
  //
  // TODO: Add VRR layer context (for AR → VRR → VR transitions)
  // IMPLEMENTATION: Persist state across AR → VRR → VR layer transitions
  // - AR layer: User scans QR code at coffee shop → store businessId + questId in localStorage
  // - VRR layer: Load from localStorage, show VRR twin with quest UI, sync progress to backend
  // - VR layer: Load quest state, immersive completion experience, mint NFT reward
  // - On layer shift: Call onLayerShift(prevLayer, nextLayer, state) callback
  // - Integration: packages/runtime/src/VRRRuntime.ts for state persistence
  // - Use IndexedDB for large state (e.g., scanned AR anchor data, quest inventory)
  // layerContext?: {
  //   layer: 'ar' | 'vrr' | 'vr'; // Current layer
  //   previousLayer?: 'ar' | 'vrr'; // Previous layer (for back navigation)
  //   persistedState?: Record<string, any>; // State from previous layer (quest progress, inventory)
  //   businessId?: string; // For VRR business twins (e.g., 'phoenix_brew_coffee')
  //   questId?: string; // For VRR quest context (e.g., 'latte_legend_quest')
  // };
  //
  // TODO: Add AI agent voice synthesis configuration
  // IMPLEMENTATION: TTS for AI agents (NPCs, Story Weaver narrator) via WebRTC
  // - When AI agent speaks: POST text to TTS provider API (ElevenLabs/Replica/PlayHT)
  // - Receive audio stream (MP3/WAV), convert to MediaStream via Web Audio API
  // - Inject into WebRTC peer connection as audio track (same as user voice)
  // - Apply spatial audio to AI agent position (see spatialAudio config above)
  // - Story Weaver narrator mode: Global narration (no spatial audio, heard by all players)
  // - Integration: Use voiceId for consistent AI personality across sessions
  // - Latency optimization: Stream TTS chunks as they arrive (don't wait for full audio)
  // - Reference: https://elevenlabs.io/docs/api-reference/websockets
  // aiAgentVoice?: {
  //   enabled: boolean;
  //   provider: 'elevenlabs' | 'replica' | 'playht'; // TTS provider
  //   voiceId?: string; // AI agent voice profile (e.g., 'rachel_premium' for ElevenLabs)
  //   narrationMode?: boolean; // Story Weaver AI narrator mode (global audio, non-spatial)
  // };
}

export type SocialPacketType =
  | 'SOCIAL_REQUEST'
  | 'SOCIAL_ACCEPT'
  | 'SOCIAL_REJECT'
  | 'SOCIAL_STATUS'
  | 'SOCIAL_MESSAGE'
  | 'PARTY_INVITE'
  | 'PARTY_JOIN'
  | 'PARTY_LEAVE';

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
  async connectToPeer(remotePeerId: string): Promise<void> {
    if (this.peers.has(remotePeerId)) {
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

    this.peers.set(remotePeerId, {
      peerId: remotePeerId,
      connection: pc,
      dataChannels: new Map(),
      isConnected: false,
    });

    // Handle incoming tracks (Voice Chat)
    pc.ontrack = (evt) => {
      this.emit('stream-added', {
        peerId: remotePeerId,
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
            to: remotePeerId,
            candidate: evt.candidate,
          })
        );
      }
    };

    // Handle connection state changes
    pc.onconnectionstatechange = () => {
      const peer = this.peers.get(remotePeerId);
      if (peer) peer.isConnected = pc.connectionState === 'connected';
    };

    // Handle incoming data channels
    pc.ondatachannel = (evt) => {
      this.setupDataChannel(remotePeerId, evt.channel);
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
          to: remotePeerId,
          offer: offer,
        })
      );
    } catch (err) {
      console.error('Failed to create WebRTC offer:', err);
      this.peers.delete(remotePeerId);
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
