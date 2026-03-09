/**
 * CollaborationSession.ts
 *
 * Manages a collaborative editing session for a HoloScript workspace.
 * Coordinates multiple CRDTDocuments, handles peer connections,
 * and bridges to the hot-reload pipeline for live scene updates.
 *
 * Architecture:
 * ```
 * Peer A (VR)  ←→  CollaborationSession  ←→  Peer B (IDE)
 *                         ↓
 *                   CRDTDocument per file
 *                         ↓
 *                   HoloScriptHotReloader
 *                         ↓
 *                   Live scene patch
 * ```
 *
 * @module collaboration
 */

import {
  CRDTDocument,
  CRDTDocumentConfig,
  DocumentChange,
  DocumentEvent,
  DocumentIdentifier,
  DocumentSnapshot,
  PeerAwareness,
} from './CRDTDocument';

// =============================================================================
// TYPES
// =============================================================================

export type SessionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting';

export interface SessionPeer {
  peerId: string;
  displayName: string;
  color: string;
  avatarId?: string;
  /** Which documents this peer has open */
  openDocuments: string[];
  /** Connection quality (0-1) */
  connectionQuality: number;
  /** Peer's platform */
  platform: 'vr' | 'ide' | 'web' | 'mobile';
  /** When the peer joined */
  joinedAt: number;
}

export interface SessionConfig {
  /** Session identifier (room ID) */
  sessionId: string;
  /** Workspace identifier */
  workspaceId: string;
  /** Local peer info */
  localPeer: {
    peerId: string;
    displayName: string;
    color: string;
    avatarId?: string;
    platform: 'vr' | 'ide' | 'web' | 'mobile';
  };
  /** WebSocket server URL for sync */
  syncServerUrl?: string;
  /** Document config defaults */
  documentConfig?: Partial<CRDTDocumentConfig>;
  /** Auto-save interval (ms, 0 = disabled) */
  autoSaveInterval: number;
  /** Reconnect on disconnect */
  autoReconnect: boolean;
  /** Max reconnect attempts */
  maxReconnectAttempts: number;
  /** Reconnect backoff base (ms) */
  reconnectBackoffMs: number;
  /** Conflict resolution strategy */
  conflictStrategy: 'crdt-merge' | 'last-writer-wins' | 'manual';
}

export interface SessionStats {
  state: SessionState;
  peerCount: number;
  documentCount: number;
  totalEdits: number;
  totalSyncMessages: number;
  avgSyncLatencyMs: number;
  uptime: number;
  bytesTransferred: number;
}

export type SessionEventType =
  | 'state-change'
  | 'peer-joined'
  | 'peer-left'
  | 'document-opened'
  | 'document-closed'
  | 'document-changed'
  | 'sync-complete'
  | 'conflict'
  | 'error'
  | 'save';

export interface SessionEvent {
  type: SessionEventType;
  sessionId: string;
  timestamp: number;
  data: Record<string, unknown>;
}

/** Callback type for file change integration with hot-reloader */
export interface FileChangeCallback {
  (change: { filePath: string; content: string; timestamp: number; peerId: string }): void;
}

const DEFAULT_SESSION_CONFIG: SessionConfig = {
  sessionId: '',
  workspaceId: 'default',
  localPeer: {
    peerId: `peer-${Date.now().toString(36)}`,
    displayName: 'Anonymous',
    color: '#00d4ff',
    platform: 'ide',
  },
  autoSaveInterval: 30000,
  autoReconnect: true,
  maxReconnectAttempts: 10,
  reconnectBackoffMs: 1000,
  conflictStrategy: 'crdt-merge',
};

// =============================================================================
// COLLABORATION SESSION
// =============================================================================

/**
 * A collaborative editing session managing multiple CRDTDocuments.
 *
 * Usage:
 * ```ts
 * const session = new CollaborationSession({
 *   sessionId: 'hololand-main',
 *   workspaceId: 'hololand',
 *   localPeer: {
 *     peerId: 'alice-123',
 *     displayName: 'Alice',
 *     color: '#00d4ff',
 *     platform: 'vr',
 *   },
 *   syncServerUrl: 'ws://localhost:4444',
 * });
 *
 * // Connect and open a document
 * await session.connect();
 * const doc = session.openDocument('zones/main_plaza.hsplus');
 *
 * // Bridge to hot-reloader
 * session.onFileChange((change) => {
 *   hotReloader.handleExternalChange({
 *     filePath: change.filePath,
 *     timestamp: change.timestamp,
 *     type: 'change',
 *   });
 * });
 *
 * // Edit collaboratively
 * doc.insert(100, '  object "NewOrb" { position: [0, 2, 0] }\n');
 * ```
 */
export class CollaborationSession {
  private config: SessionConfig;
  private state: SessionState = 'disconnected';
  private documents: Map<string, CRDTDocument> = new Map();
  private peers: Map<string, SessionPeer> = new Map();
  private listeners: Map<SessionEventType, Set<(event: SessionEvent) => void>> = new Map();
  private fileChangeCallbacks: Set<FileChangeCallback> = new Set();

  // Stats
  private startTime = 0;
  private totalEdits = 0;
  private totalSyncMessages = 0;
  private syncLatencies: number[] = [];
  private bytesTransferred = 0;

  // Auto-save
  private autoSaveTimer: ReturnType<typeof setInterval> | null = null;
  private dirtyDocuments: Set<string> = new Set();

  // Reconnection
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;

  // Message queue (for offline/reconnect scenarios)
  private pendingMessages: Array<{ type: string; data: Uint8Array; timestamp: number }> = [];

  constructor(config: Partial<SessionConfig> = {}) {
    this.config = { ...DEFAULT_SESSION_CONFIG, ...config };

    // Register local peer
    this.peers.set(this.config.localPeer.peerId, {
      ...this.config.localPeer,
      openDocuments: [],
      connectionQuality: 1.0,
      joinedAt: Date.now(),
    });
  }

  // ---------------------------------------------------------------------------
  // Connection Lifecycle
  // ---------------------------------------------------------------------------

  /** Connect to the sync server */
  async connect(): Promise<void> {
    if (this.state === 'connected') return;

    this.setState('connecting');
    this.startTime = Date.now();

    try {
      // In a full implementation, this would establish a WebSocket connection
      // to the sync server and perform the Yjs handshake
      if (this.config.syncServerUrl) {
        await this.connectToSyncServer(this.config.syncServerUrl);
      }

      this.setState('connected');
      this.reconnectAttempts = 0;

      // Start auto-save
      if (this.config.autoSaveInterval > 0) {
        this.autoSaveTimer = setInterval(() => {
          this.autoSave();
        }, this.config.autoSaveInterval);
      }

      // Flush pending messages
      this.flushPendingMessages();

      this.emit({
        type: 'sync-complete',
        sessionId: this.config.sessionId,
        timestamp: Date.now(),
        data: { peerCount: this.peers.size },
      });
    } catch (error) {
      this.setState('disconnected');
      this.emit({
        type: 'error',
        sessionId: this.config.sessionId,
        timestamp: Date.now(),
        data: { error: String(error), phase: 'connect' },
      });

      if (this.config.autoReconnect) {
        this.scheduleReconnect();
      }

      throw error;
    }
  }

  /** Disconnect from the sync server */
  async disconnect(): Promise<void> {
    if (this.state === 'disconnected') return;

    // Auto-save before disconnecting
    await this.autoSave();

    // Clean up
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.setState('disconnected');
  }

  /** Get current session state */
  getState(): SessionState {
    return this.state;
  }

  // ---------------------------------------------------------------------------
  // Document Management
  // ---------------------------------------------------------------------------

  /** Open a document for collaborative editing */
  openDocument(filePath: string, initialContent?: string): CRDTDocument {
    const key = this.docKey(filePath);

    // Return existing document if already open
    let doc = this.documents.get(key);
    if (doc) return doc;

    const documentId: DocumentIdentifier = {
      filePath,
      workspaceId: this.config.workspaceId,
    };

    doc = new CRDTDocument(
      documentId,
      this.config.localPeer.peerId,
      {
        displayName: this.config.localPeer.displayName,
        color: this.config.localPeer.color,
        avatarId: this.config.localPeer.avatarId,
      },
      this.config.documentConfig
    );

    if (initialContent) {
      doc.setText(initialContent);
    }

    // Listen for document changes to bridge to hot-reloader
    doc.on('change', (event: DocumentEvent) => {
      this.totalEdits++;
      this.dirtyDocuments.add(key);

      const change = event.data as unknown as DocumentChange;

      // Notify hot-reloader callbacks for remote changes
      if (change.origin === 'remote') {
        for (const cb of this.fileChangeCallbacks) {
          cb({
            filePath,
            content: doc!.getText(),
            timestamp: event.timestamp,
            peerId: change.peerId,
          });
        }
      }

      // Broadcast local changes to peers
      if (change.origin === 'local') {
        this.broadcastDocumentUpdate(key, doc!);
      }

      this.emit({
        type: 'document-changed',
        sessionId: this.config.sessionId,
        timestamp: event.timestamp,
        data: {
          filePath,
          origin: change.origin,
          peerId: change.peerId,
        },
      });
    });

    this.documents.set(key, doc);

    // Track locally opened document
    const localPeer = this.peers.get(this.config.localPeer.peerId);
    if (localPeer) {
      localPeer.openDocuments.push(filePath);
    }

    this.emit({
      type: 'document-opened',
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
      data: { filePath },
    });

    return doc;
  }

  /** Close a document */
  closeDocument(filePath: string): void {
    const key = this.docKey(filePath);
    const doc = this.documents.get(key);
    if (!doc) return;

    doc.dispose();
    this.documents.delete(key);
    this.dirtyDocuments.delete(key);

    // Remove from local peer's open documents
    const localPeer = this.peers.get(this.config.localPeer.peerId);
    if (localPeer) {
      localPeer.openDocuments = localPeer.openDocuments.filter((d) => d !== filePath);
    }

    this.emit({
      type: 'document-closed',
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
      data: { filePath },
    });
  }

  /** Get an open document */
  getDocument(filePath: string): CRDTDocument | undefined {
    return this.documents.get(this.docKey(filePath));
  }

  /** Get all open document paths */
  getOpenDocuments(): string[] {
    return Array.from(this.documents.keys());
  }

  // ---------------------------------------------------------------------------
  // Peer Management
  // ---------------------------------------------------------------------------

  /** Handle a remote peer joining */
  addPeer(peer: SessionPeer): void {
    this.peers.set(peer.peerId, { ...peer, joinedAt: Date.now() });

    // Sync existing documents to the new peer
    for (const [key, doc] of this.documents) {
      doc.applyAwarenessUpdate(peer.peerId, {
        displayName: peer.displayName,
        color: peer.color,
        avatarId: peer.avatarId,
        isActive: true,
      });
    }

    this.emit({
      type: 'peer-joined',
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
      data: {
        peerId: peer.peerId,
        displayName: peer.displayName,
        platform: peer.platform,
      },
    });
  }

  /** Handle a remote peer leaving */
  removePeer(peerId: string): void {
    if (peerId === this.config.localPeer.peerId) return;

    this.peers.delete(peerId);

    // Remove peer from all documents
    for (const doc of this.documents.values()) {
      doc.removePeer(peerId);
    }

    this.emit({
      type: 'peer-left',
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
      data: { peerId },
    });
  }

  /** Get all peers */
  getPeers(): SessionPeer[] {
    return Array.from(this.peers.values());
  }

  /** Get a specific peer */
  getPeer(peerId: string): SessionPeer | undefined {
    return this.peers.get(peerId);
  }

  /** Get peer count (including local) */
  getPeerCount(): number {
    return this.peers.size;
  }

  // ---------------------------------------------------------------------------
  // Remote Sync
  // ---------------------------------------------------------------------------

  /** Apply a sync message from a remote peer */
  applyRemoteUpdate(filePath: string, update: Uint8Array, remotePeerId: string): void {
    const key = this.docKey(filePath);
    let doc = this.documents.get(key);

    // Auto-open document if not open locally
    if (!doc) {
      doc = this.openDocument(filePath);
    }

    const start = performance.now();
    doc.applyUpdate(update, remotePeerId);
    const elapsed = performance.now() - start;

    this.totalSyncMessages++;
    this.syncLatencies.push(elapsed);
    this.bytesTransferred += update.byteLength;

    // Keep only last 100 latency measurements
    if (this.syncLatencies.length > 100) {
      this.syncLatencies.shift();
    }

    // Notify hot-reloader
    for (const cb of this.fileChangeCallbacks) {
      cb({
        filePath,
        content: doc.getText(),
        timestamp: Date.now(),
        peerId: remotePeerId,
      });
    }
  }

  /** Apply a remote awareness update */
  applyRemoteAwareness(filePath: string, peerId: string, awareness: Partial<PeerAwareness>): void {
    const doc = this.documents.get(this.docKey(filePath));
    if (doc) {
      doc.applyAwarenessUpdate(peerId, awareness);
    }
  }

  // ---------------------------------------------------------------------------
  // Hot-Reloader Integration
  // ---------------------------------------------------------------------------

  /** Register a callback for file changes (bridge to HoloScriptHotReloader) */
  onFileChange(callback: FileChangeCallback): void {
    this.fileChangeCallbacks.add(callback);
  }

  /** Unregister a file change callback */
  offFileChange(callback: FileChangeCallback): void {
    this.fileChangeCallbacks.delete(callback);
  }

  // ---------------------------------------------------------------------------
  // Snapshots & Persistence
  // ---------------------------------------------------------------------------

  /** Get snapshots of all open documents */
  getSnapshots(): DocumentSnapshot[] {
    return Array.from(this.documents.values()).map((doc) => doc.getSnapshot());
  }

  /** Load snapshots (restore session) */
  loadSnapshots(snapshots: DocumentSnapshot[]): void {
    for (const snapshot of snapshots) {
      const doc = this.openDocument(snapshot.documentId.filePath);
      doc.loadSnapshot(snapshot);
    }
  }

  /** Auto-save dirty documents */
  private async autoSave(): Promise<void> {
    if (this.dirtyDocuments.size === 0) return;

    const snapshots: DocumentSnapshot[] = [];
    for (const key of this.dirtyDocuments) {
      const doc = this.documents.get(key);
      if (doc) {
        snapshots.push(doc.getSnapshot());
      }
    }

    this.dirtyDocuments.clear();

    this.emit({
      type: 'save',
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
      data: {
        documentCount: snapshots.length,
        snapshots,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------

  getStats(): SessionStats {
    const avgLatency =
      this.syncLatencies.length > 0
        ? this.syncLatencies.reduce((a, b) => a + b, 0) / this.syncLatencies.length
        : 0;

    return {
      state: this.state,
      peerCount: this.peers.size,
      documentCount: this.documents.size,
      totalEdits: this.totalEdits,
      totalSyncMessages: this.totalSyncMessages,
      avgSyncLatencyMs: Math.round(avgLatency * 100) / 100,
      uptime: this.startTime > 0 ? Date.now() - this.startTime : 0,
      bytesTransferred: this.bytesTransferred,
    };
  }

  // ---------------------------------------------------------------------------
  // Events
  // ---------------------------------------------------------------------------

  on(event: SessionEventType, handler: (event: SessionEvent) => void): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  off(event: SessionEventType, handler: (event: SessionEvent) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose(): void {
    if (this.autoSaveTimer) {
      clearInterval(this.autoSaveTimer);
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    for (const doc of this.documents.values()) {
      doc.dispose();
    }
    this.documents.clear();
    this.peers.clear();
    this.listeners.clear();
    this.fileChangeCallbacks.clear();
    this.pendingMessages = [];
    this.state = 'disconnected';
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private docKey(filePath: string): string {
    return `${this.config.workspaceId}:${filePath}`;
  }

  private setState(state: SessionState): void {
    const prev = this.state;
    this.state = state;
    this.emit({
      type: 'state-change',
      sessionId: this.config.sessionId,
      timestamp: Date.now(),
      data: { from: prev, to: state },
    });
  }

  private async connectToSyncServer(_url: string): Promise<void> {
    // In production, this establishes a WebSocket connection:
    // 1. Connect to ws://server/session/{sessionId}
    // 2. Send handshake with peer info
    // 3. Receive existing peers + document state
    // 4. Begin Yjs sync protocol

    // For now, we simulate a successful connection
    await new Promise((resolve) => setTimeout(resolve, 50));
  }

  private broadcastDocumentUpdate(key: string, doc: CRDTDocument): void {
    const update = doc.getEncodedState();
    const filePath = doc.documentId.filePath;

    if (this.state === 'connected') {
      // In production: send via WebSocket
      this.totalSyncMessages++;
      this.bytesTransferred += update.byteLength;
    } else {
      // Queue for later
      this.pendingMessages.push({
        type: `doc-update:${filePath}`,
        data: update,
        timestamp: Date.now(),
      });
    }
  }

  private flushPendingMessages(): void {
    for (const msg of this.pendingMessages) {
      this.totalSyncMessages++;
      this.bytesTransferred += msg.data.byteLength;
    }
    this.pendingMessages = [];
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit({
        type: 'error',
        sessionId: this.config.sessionId,
        timestamp: Date.now(),
        data: { error: 'Max reconnect attempts reached', attempts: this.reconnectAttempts },
      });
      return;
    }

    const delay = this.config.reconnectBackoffMs * Math.pow(2, this.reconnectAttempts);
    this.reconnectAttempts++;

    this.setState('reconnecting');
    this.reconnectTimer = setTimeout(async () => {
      try {
        await this.connect();
      } catch {
        // connect() handles its own retry scheduling
      }
    }, delay);
  }

  private emit(event: SessionEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[CollaborationSession] Event handler error for '${event.type}':`, err);
        }
      }
    }
  }
}
