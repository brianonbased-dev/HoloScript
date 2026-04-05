/**
 * WebRTC Signaling Client
 *
 * WebSocket-based signaling client for WebRTC connection negotiation.
 * Handles room joining, SDP exchange, and ICE candidate trickling.
 *
 * @version 3.3.0
 * @sprint Sprint 2: Performance Optimization
 */

import { logger } from '../../logger';
import {
  type SignalingPayload,
  type JoinMessage,
  type OfferMessage,
  type AnswerMessage,
  type IceCandidateMessage,
  type RoomStateMessage,
  type PeerJoinedMessage,
  type PeerLeftMessage,
  createSignalingMessage,
  parseSignalingMessage,
  serializeSignalingMessage,
} from './SignalingProtocol';

export interface SignalingClientConfig {
  /** Signaling server URL */
  serverUrl: string;
  /** Room to join */
  roomId: string;
  /** Local peer ID */
  peerId?: string;
  /** Reconnection attempts */
  maxReconnectAttempts?: number;
  /** Reconnection delay (ms) */
  reconnectDelayMs?: number;
  /** Ping interval (ms) */
  pingIntervalMs?: number;
  /** Peer metadata */
  metadata?: Record<string, unknown>;
}

export type SignalingEventType =
  | 'connected'
  | 'disconnected'
  | 'peer-joined'
  | 'peer-left'
  | 'offer'
  | 'answer'
  | 'ice-candidate'
  | 'room-state'
  | 'error';

export interface SignalingEvent {
  type: SignalingEventType;
  peerId?: string;
  sdp?: RTCSessionDescriptionInit;
  candidate?: RTCIceCandidateInit | null;
  peers?: RoomStateMessage['peers'];
  error?: { code: string; message: string };
  metadata?: Record<string, unknown>;
}

type SignalingEventCallback = (event: SignalingEvent) => void;

/**
 * SignalingClient - WebSocket-based signaling for WebRTC
 */
export class SignalingClient {
  private config: Required<SignalingClientConfig>;
  private ws: WebSocket | null = null;
  private eventCallbacks: Map<SignalingEventType, Set<SignalingEventCallback>> = new Map();
  private reconnectAttempts = 0;
  private pingInterval: ReturnType<typeof setInterval> | null = null;
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isConnected = false;
  private intentionalClose = false;

  constructor(config: SignalingClientConfig) {
    this.config = {
      serverUrl: config.serverUrl,
      roomId: config.roomId,
      peerId: config.peerId ?? this.generatePeerId(),
      maxReconnectAttempts: config.maxReconnectAttempts ?? 5,
      reconnectDelayMs: config.reconnectDelayMs ?? 1000,
      pingIntervalMs: config.pingIntervalMs ?? 30000,
      metadata: config.metadata ?? {},
    };
  }

  /**
   * Connect to the signaling server
   */
  async connect(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.intentionalClose = false;
        this.ws = new WebSocket(this.config.serverUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.startPing();

          // Join the room
          this.send(
            createSignalingMessage<JoinMessage>('join', this.config.roomId, this.config.peerId, {
              metadata: this.config.metadata,
            })
          );

          logger.info(`[SignalingClient] Connected to ${this.config.serverUrl}`);
          this.emit('connected', {});
          resolve();
        };

        this.ws.onmessage = (event) => {
          this.handleMessage(event.data as string);
        };

        this.ws.onclose = (event) => {
          this.isConnected = false;
          this.stopPing();

          if (!this.intentionalClose) {
            this.emit('disconnected', {
              error: { code: 'CLOSED', message: event.reason || 'Connection closed' },
            });
            this.attemptReconnect();
          }
        };

        this.ws.onerror = () => {
          logger.error('[SignalingClient] WebSocket error');
          this.emit('error', { error: { code: 'WS_ERROR', message: 'WebSocket error' } });
          reject(new Error('WebSocket connection failed'));
        };
      } catch (err) {
        reject(err);
      }
    });
  }

  /**
   * Disconnect from the signaling server
   */
  disconnect(): void {
    this.intentionalClose = true;
    this.stopPing();

    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.ws) {
      // Send leave message before closing
      if (this.isConnected) {
        this.send(createSignalingMessage('leave', this.config.roomId, this.config.peerId, {}));
      }
      this.ws.close();
      this.ws = null;
    }

    this.isConnected = false;
    logger.info('[SignalingClient] Disconnected');
  }

  /**
   * Send an SDP offer to a peer
   */
  sendOffer(targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.send(
      createSignalingMessage<OfferMessage>('offer', this.config.roomId, this.config.peerId, {
        targetPeerId,
        sdp,
      })
    );
  }

  /**
   * Send an SDP answer to a peer
   */
  sendAnswer(targetPeerId: string, sdp: RTCSessionDescriptionInit): void {
    this.send(
      createSignalingMessage<AnswerMessage>('answer', this.config.roomId, this.config.peerId, {
        targetPeerId,
        sdp,
      })
    );
  }

  /**
   * Send an ICE candidate to a peer
   */
  sendIceCandidate(targetPeerId: string, candidate: RTCIceCandidateInit | null): void {
    this.send(
      createSignalingMessage<IceCandidateMessage>(
        'ice-candidate',
        this.config.roomId,
        this.config.peerId,
        {
          targetPeerId,
          candidate,
        }
      )
    );
  }

  /**
   * Listen for signaling events
   */
  on(event: SignalingEventType, callback: SignalingEventCallback): () => void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, new Set());
    }
    this.eventCallbacks.get(event)!.add(callback);
    return () => this.eventCallbacks.get(event)?.delete(callback);
  }

  /**
   * Get the local peer ID
   */
  getPeerId(): string {
    return this.config.peerId;
  }

  /**
   * Check if connected
   */
  connected(): boolean {
    return this.isConnected;
  }

  // === Private Methods ===

  private handleMessage(data: string): void {
    const message = parseSignalingMessage(data);
    if (!message) {
      logger.warn('[SignalingClient] Invalid message received');
      return;
    }

    // Ignore messages from self
    if (message.peerId === this.config.peerId && message.type !== 'room-state') {
      return;
    }

    switch (message.type) {
      case 'offer': {
        const offer = message as OfferMessage;
        if (offer.targetPeerId === this.config.peerId) {
          this.emit('offer', { peerId: offer.peerId, sdp: offer.sdp });
        }
        break;
      }

      case 'answer': {
        const answer = message as AnswerMessage;
        if (answer.targetPeerId === this.config.peerId) {
          this.emit('answer', { peerId: answer.peerId, sdp: answer.sdp });
        }
        break;
      }

      case 'ice-candidate': {
        const ice = message as IceCandidateMessage;
        if (ice.targetPeerId === this.config.peerId) {
          this.emit('ice-candidate', { peerId: ice.peerId, candidate: ice.candidate });
        }
        break;
      }

      case 'peer-joined': {
        const joined = message as PeerJoinedMessage;
        this.emit('peer-joined', { peerId: joined.newPeerId, metadata: joined.metadata });
        break;
      }

      case 'peer-left': {
        const left = message as PeerLeftMessage;
        this.emit('peer-left', { peerId: left.leftPeerId });
        break;
      }

      case 'room-state': {
        const state = message as RoomStateMessage;
        this.emit('room-state', { peers: state.peers });
        break;
      }

      case 'error': {
        this.emit('error', {
          error: {
            code: (message as unknown as { code: string }).code,
            message: (message as unknown as { message: string }).message,
          },
        });
        break;
      }

      case 'pong':
        // Ignore pong responses
        break;
    }
  }

  private send(message: SignalingPayload): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(serializeSignalingMessage(message));
    }
  }

  private emit(type: SignalingEventType, event: Omit<SignalingEvent, 'type'>): void {
    this.eventCallbacks.get(type)?.forEach((cb) => cb({ type, ...event }));
  }

  private startPing(): void {
    this.pingInterval = setInterval(() => {
      this.send(createSignalingMessage('ping', this.config.roomId, this.config.peerId, {}));
    }, this.config.pingIntervalMs);
  }

  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  private attemptReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      logger.error('[SignalingClient] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelayMs * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(`[SignalingClient] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimeout = setTimeout(() => {
      this.connect().catch(() => {
        logger.error('[SignalingClient] Reconnect failed');
      });
    }, delay);
  }

  private generatePeerId(): string {
    return `peer-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 9)}`;
  }
}
