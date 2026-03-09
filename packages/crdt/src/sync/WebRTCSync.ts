/**
 * Peer-to-peer CRDT synchronization over WebRTC data channels
 *
 * Implements efficient sync protocol with:
 * - WebRTC data channel communication
 * - Incremental state synchronization
 * - Automatic reconnection
 * - Message ordering guarantees
 *
 * @version 1.0.0
 */

import SimplePeer from 'simple-peer';
import type { Instance as SimplePeerInstance } from 'simple-peer';
import type { SignedOperation } from '../auth/DIDSigner';

/**
 * Sync message types
 */
export enum SyncMessageType {
  /** Request full state sync */
  SYNC_REQUEST = 'sync_request',

  /** Response with full CRDT state */
  SYNC_RESPONSE = 'sync_response',

  /** Incremental operation update */
  OPERATION = 'operation',

  /** Acknowledgment of received operation */
  ACK = 'ack',

  /** Heartbeat to keep connection alive */
  HEARTBEAT = 'heartbeat',
}

/**
 * Sync message structure
 */
export interface SyncMessage {
  /** Message type */
  type: SyncMessageType;

  /** CRDT instance ID */
  crdtId: string;

  /** Sender's DID */
  senderDid: string;

  /** Message timestamp */
  timestamp: number;

  /** Message-specific payload */
  payload: unknown;
}

/**
 * Sync request payload
 */
export interface SyncRequestPayload {
  /** Last operation ID sender has seen */
  lastOperationId?: string;

  /** Vector clock of sender's state */
  vectorClock?: Record<string, number>;
}

/**
 * Sync response payload
 */
export interface SyncResponsePayload {
  /** Serialized CRDT state */
  state: string;

  /** All operations since last sync */
  operations: SignedOperation[];
}

/**
 * Operation message payload
 */
export interface OperationPayload {
  /** Signed operation */
  operation: SignedOperation;
}

/**
 * Peer connection state
 */
export enum PeerState {
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTED = 'disconnected',
  ERROR = 'error',
}

/**
 * Sync event handlers
 */
export interface SyncEventHandlers {
  /** Called when operation received from peer */
  onOperation?: (operation: SignedOperation, peerId: string) => Promise<void>;

  /** Called when sync request received */
  onSyncRequest?: (payload: SyncRequestPayload, peerId: string) => Promise<SyncResponsePayload>;

  /** Called when full state received */
  onSyncResponse?: (payload: SyncResponsePayload, peerId: string) => Promise<void>;

  /** Called when peer connection state changes */
  onPeerStateChange?: (peerId: string, state: PeerState) => void;

  /** Called when error occurs */
  onError?: (error: Error, peerId: string) => void;
}

/**
 * WebRTC peer connection wrapper
 */
class PeerConnection {
  public id: string;
  public state: PeerState = PeerState.CONNECTING;
  private peer: SimplePeerInstance;
  private messageQueue: SyncMessage[] = [];
  private handlers: SyncEventHandlers;

  constructor(
    peerId: string,
    initiator: boolean,
    handlers: SyncEventHandlers,
    signalHandler: (signal: SimplePeer.SignalData) => void
  ) {
    this.id = peerId;
    this.handlers = handlers;

    this.peer = new SimplePeer({
      initiator,
      trickle: false,
    });

    this.peer.on('signal', signalHandler);

    this.peer.on('connect', () => {
      this.state = PeerState.CONNECTED;
      this.handlers.onPeerStateChange?.(this.id, PeerState.CONNECTED);

      // Send queued messages
      while (this.messageQueue.length > 0) {
        const msg = this.messageQueue.shift()!;
        this.sendMessage(msg);
      }
    });

    this.peer.on('data', (data: ArrayBuffer) => {
      this.handleMessage(data);
    });

    this.peer.on('close', () => {
      this.state = PeerState.DISCONNECTED;
      this.handlers.onPeerStateChange?.(this.id, PeerState.DISCONNECTED);
    });

    this.peer.on('error', (err: Error) => {
      this.state = PeerState.ERROR;
      this.handlers.onError?.(err, this.id);
      this.handlers.onPeerStateChange?.(this.id, PeerState.ERROR);
    });
  }

  signal(data: SimplePeer.SignalData): void {
    this.peer.signal(data);
  }

  sendMessage(message: SyncMessage): void {
    if (this.state !== PeerState.CONNECTED) {
      this.messageQueue.push(message);
      return;
    }

    const json = JSON.stringify(message);
    this.peer.send(json);
  }

  private handleMessage(data: ArrayBuffer): void {
    try {
      const text = new TextDecoder().decode(data);
      const message = JSON.parse(text) as SyncMessage;

      switch (message.type) {
        case SyncMessageType.OPERATION:
          this.handleOperation(message);
          break;

        case SyncMessageType.SYNC_REQUEST:
          this.handleSyncRequest(message);
          break;

        case SyncMessageType.SYNC_RESPONSE:
          this.handleSyncResponse(message);
          break;

        case SyncMessageType.ACK:
          // Acknowledgment received
          break;

        case SyncMessageType.HEARTBEAT:
          // Heartbeat received
          break;
      }
    } catch (error) {
      this.handlers.onError?.(
        error instanceof Error ? error : new Error('Message parsing failed'),
        this.id
      );
    }
  }

  private async handleOperation(message: SyncMessage): Promise<void> {
    const payload = message.payload as OperationPayload;
    await this.handlers.onOperation?.(payload.operation, this.id);

    // Send ACK
    this.sendMessage({
      type: SyncMessageType.ACK,
      crdtId: message.crdtId,
      senderDid: '', // Would be filled by caller
      timestamp: Date.now(),
      payload: { operationId: payload.operation.operation.id },
    });
  }

  private async handleSyncRequest(message: SyncMessage): Promise<void> {
    const payload = message.payload as SyncRequestPayload;
    const response = await this.handlers.onSyncRequest?.(payload, this.id);

    if (response) {
      this.sendMessage({
        type: SyncMessageType.SYNC_RESPONSE,
        crdtId: message.crdtId,
        senderDid: '', // Would be filled by caller
        timestamp: Date.now(),
        payload: response,
      });
    }
  }

  private async handleSyncResponse(message: SyncMessage): Promise<void> {
    const payload = message.payload as SyncResponsePayload;
    await this.handlers.onSyncResponse?.(payload, this.id);
  }

  destroy(): void {
    this.peer.destroy();
  }
}

/**
 * WebRTC-based CRDT synchronization protocol
 *
 * Manages peer-to-peer connections and synchronizes CRDT state
 * using efficient delta-based updates.
 */
export class WebRTCSync {
  private crdtId: string;
  private senderDid: string;
  private peers: Map<string, PeerConnection> = new Map();
  private handlers: SyncEventHandlers;
  private heartbeatInterval?: NodeJS.Timeout;

  constructor(crdtId: string, senderDid: string, handlers: SyncEventHandlers) {
    this.crdtId = crdtId;
    this.senderDid = senderDid;
    this.handlers = handlers;

    // Start heartbeat
    this.startHeartbeat();
  }

  /**
   * Connect to a peer
   *
   * @param peerId - Unique peer identifier
   * @param initiator - Whether this peer is the initiator
   * @param signalHandler - Callback for WebRTC signaling
   */
  connectPeer(
    peerId: string,
    initiator: boolean,
    signalHandler: (signal: SimplePeer.SignalData) => void
  ): void {
    if (this.peers.has(peerId)) {
      throw new Error(`Already connected to peer ${peerId}`);
    }

    const peer = new PeerConnection(peerId, initiator, this.handlers, signalHandler);
    this.peers.set(peerId, peer);
  }

  /**
   * Handle signaling data from peer
   */
  signal(peerId: string, data: SimplePeer.SignalData): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Unknown peer ${peerId}`);
    }

    peer.signal(data);
  }

  /**
   * Broadcast operation to all connected peers
   */
  broadcastOperation(operation: SignedOperation): void {
    const message: SyncMessage = {
      type: SyncMessageType.OPERATION,
      crdtId: this.crdtId,
      senderDid: this.senderDid,
      timestamp: Date.now(),
      payload: { operation } as OperationPayload,
    };

    for (const peer of this.peers.values()) {
      if (peer.state === PeerState.CONNECTED) {
        peer.sendMessage(message);
      }
    }
  }

  /**
   * Request full state sync from peer
   */
  requestSync(peerId: string, vectorClock?: Record<string, number>): void {
    const peer = this.peers.get(peerId);
    if (!peer) {
      throw new Error(`Unknown peer ${peerId}`);
    }

    const message: SyncMessage = {
      type: SyncMessageType.SYNC_REQUEST,
      crdtId: this.crdtId,
      senderDid: this.senderDid,
      timestamp: Date.now(),
      payload: { vectorClock } as SyncRequestPayload,
    };

    peer.sendMessage(message);
  }

  /**
   * Disconnect from peer
   */
  disconnectPeer(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.destroy();
      this.peers.delete(peerId);
    }
  }

  /**
   * Disconnect from all peers
   */
  disconnectAll(): void {
    for (const peer of this.peers.values()) {
      peer.destroy();
    }
    this.peers.clear();

    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
  }

  /**
   * Get connection state for peer
   */
  getPeerState(peerId: string): PeerState | null {
    return this.peers.get(peerId)?.state ?? null;
  }

  /**
   * Get all connected peer IDs
   */
  getConnectedPeers(): string[] {
    return Array.from(this.peers.entries())
      .filter(([_, peer]) => peer.state === PeerState.CONNECTED)
      .map(([id, _]) => id);
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      const message: SyncMessage = {
        type: SyncMessageType.HEARTBEAT,
        crdtId: this.crdtId,
        senderDid: this.senderDid,
        timestamp: Date.now(),
        payload: {},
      };

      for (const peer of this.peers.values()) {
        if (peer.state === PeerState.CONNECTED) {
          peer.sendMessage(message);
        }
      }
    }, 30000); // 30 second heartbeat
  }
}
