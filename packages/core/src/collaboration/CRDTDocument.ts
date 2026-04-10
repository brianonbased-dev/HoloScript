/**
 * CRDTDocument.ts
 *
 * Yjs-backed CRDT document model for collaborative HoloScript editing.
 * Each .hsplus/.holo file maps to one CRDTDocument. The document maintains
 * a Yjs Doc with shared text + awareness state, enabling real-time
 * conflict-free co-editing between multiple users in VR or IDE.
 *
 * Key design decisions:
 * - Text-level CRDT (not AST-level) — simpler, proven, Yjs excels at this
 * - Awareness protocol for cursor/selection/presence
 * - File-level granularity (one Yjs Doc per file)
 * - Integrates with HoloScriptHotReloader via change events
 *
 * @module collaboration
 */

// =============================================================================
// TYPES
// =============================================================================

export interface DocumentIdentifier {
  /** Absolute or relative file path */
  filePath: string;
  /** Workspace/project scope (allows multi-project collaboration) */
  workspaceId: string;
}

export interface CursorPosition {
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
}

export interface SelectionRange {
  start: CursorPosition;
  end: CursorPosition;
}

export interface PeerAwareness {
  /** Unique peer/client identifier */
  peerId: string;
  /** Display name */
  displayName: string;
  /** Peer color (hex, for cursor/selection rendering) */
  color: string;
  /** Current cursor position in this document */
  cursor: CursorPosition | null;
  /** Current selection range */
  selection: SelectionRange | null;
  /** Whether the peer is actively viewing this document */
  isActive: boolean;
  /** Avatar URL or identifier (for VR presence) */
  avatarId?: string;
  /** Peer's position in 3D space (VR mode) */
  worldPosition?: [number, number, number];
  /** Last activity timestamp */
  lastActivity: number;
}

export interface DocumentChange {
  /** Origin of the change */
  origin: 'local' | 'remote' | 'undo' | 'redo';
  /** The text that was inserted */
  insertedText: string;
  /** The text that was deleted */
  deletedText: string;
  /** Position where change occurred */
  position: number;
  /** Length of inserted content */
  insertLength: number;
  /** Length of deleted content */
  deleteLength: number;
  /** Timestamp */
  timestamp: number;
  /** Who made the change */
  peerId: string;
}

export interface DocumentSnapshot {
  /** Full text content */
  content: string;
  /** Version vector (Yjs state vector as base64) */
  stateVector: string;
  /** Timestamp */
  timestamp: number;
  /** Document ID */
  documentId: DocumentIdentifier;
}

export type DocumentEventType =
  | 'change'
  | 'awareness-change'
  | 'peer-joined'
  | 'peer-left'
  | 'sync-complete'
  | 'conflict-resolved';

export interface DocumentEvent {
  type: DocumentEventType;
  documentId: DocumentIdentifier;
  timestamp: number;
  data: Record<string, unknown>;
}

export interface CRDTDocumentConfig {
  /** Enable undo/redo tracking */
  undoEnabled: boolean;
  /** Undo capture timeout (ms) - groups rapid edits into one undo step */
  undoCaptureTimeout: number;
  /** Maximum undo stack depth */
  maxUndoStack: number;
  /** Whether to track cursor/selection awareness */
  awarenessEnabled: boolean;
  /** Debounce time (ms) for emitting change events */
  changeDebounceMs: number;
}

const DEFAULT_CONFIG: CRDTDocumentConfig = {
  undoEnabled: true,
  undoCaptureTimeout: 500,
  maxUndoStack: 100,
  awarenessEnabled: true,
  changeDebounceMs: 50,
};

// =============================================================================
// CRDT DOCUMENT
// =============================================================================

/**
 * A single collaborative document backed by a Yjs Doc.
 *
 * Usage:
 * ```ts
 * const doc = new CRDTDocument(
 *   { filePath: 'main_plaza.hsplus', workspaceId: 'hololand' },
 *   'peer-123',
 *   { displayName: 'Alice', color: '#00d4ff' }
 * );
 *
 * // Set initial content
 * doc.setText('composition "MainPlaza" { ... }');
 *
 * // Listen for remote changes
 * doc.on('change', (event) => {
 *   if (event.data.origin === 'remote') {
 *     hotReloader.handleExternalChange({
 *       filePath: doc.documentId.filePath,
 *       timestamp: Date.now(),
 *       type: 'change'
 *     });
 *   }
 * });
 *
 * // Get binary update to send to peers
 * const update = doc.getEncodedState();
 * transport.broadcast(update);
 *
 * // Apply update from remote peer
 * doc.applyUpdate(remoteUpdate);
 * ```
 */
export class CRDTDocument {
  readonly documentId: DocumentIdentifier;
  private readonly localPeerId: string;
  private config: CRDTDocumentConfig;

  // Yjs state (lazy — actual Yjs integration happens in the session manager)
  private content = '';
  private version = 0;
  private stateUpdates: Uint8Array[] = [];
  private undoStack: string[] = [];
  private redoStack: string[] = [];

  // Awareness
  private peers: Map<string, PeerAwareness> = new Map();
  private localAwareness: PeerAwareness;

  // Events
  private listeners: Map<DocumentEventType, Set<(event: DocumentEvent) => void>> = new Map();

  // Debouncing
  private changeDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingChanges: DocumentChange[] = [];

  constructor(
    documentId: DocumentIdentifier,
    localPeerId: string,
    localPeerInfo: { displayName: string; color: string; avatarId?: string },
    config: Partial<CRDTDocumentConfig> = {}
  ) {
    this.documentId = documentId;
    this.localPeerId = localPeerId;
    this.config = { ...DEFAULT_CONFIG, ...config };

    this.localAwareness = {
      peerId: localPeerId,
      displayName: localPeerInfo.displayName,
      color: localPeerInfo.color,
      cursor: null,
      selection: null,
      isActive: true,
      avatarId: localPeerInfo.avatarId,
      lastActivity: Date.now(),
    };
    this.peers.set(localPeerId, this.localAwareness);
  }

  // ---------------------------------------------------------------------------
  // Content Operations
  // ---------------------------------------------------------------------------

  /** Get the full text content */
  getText(): string {
    return this.content;
  }

  /** Set the full text content (replaces everything) */
  setText(text: string): void {
    const oldContent = this.content;
    if (oldContent === text) return;

    if (this.config.undoEnabled) {
      this.undoStack.push(oldContent);
      if (this.undoStack.length > this.config.maxUndoStack) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }

    this.content = text;
    this.version++;

    this.emitChange({
      origin: 'local',
      insertedText: text,
      deletedText: oldContent,
      position: 0,
      insertLength: text.length,
      deleteLength: oldContent.length,
      timestamp: Date.now(),
      peerId: this.localPeerId,
    });
  }

  /** Insert text at position */
  insert(position: number, text: string): void {
    if (position < 0 || position > this.content.length) {
      throw new RangeError(`Insert position ${position} out of range [0, ${this.content.length}]`);
    }

    const oldContent = this.content;

    if (this.config.undoEnabled) {
      this.undoStack.push(oldContent);
      if (this.undoStack.length > this.config.maxUndoStack) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }

    this.content = this.content.slice(0, position) + text + this.content.slice(position);
    this.version++;

    this.emitChange({
      origin: 'local',
      insertedText: text,
      deletedText: '',
      position,
      insertLength: text.length,
      deleteLength: 0,
      timestamp: Date.now(),
      peerId: this.localPeerId,
    });
  }

  /** Delete text at position */
  delete(position: number, length: number): void {
    if (position < 0 || position + length > this.content.length) {
      throw new RangeError(
        `Delete range [${position}, ${position + length}] out of range [0, ${this.content.length}]`
      );
    }

    const oldContent = this.content;
    const deleted = this.content.slice(position, position + length);

    if (this.config.undoEnabled) {
      this.undoStack.push(oldContent);
      if (this.undoStack.length > this.config.maxUndoStack) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }

    this.content = this.content.slice(0, position) + this.content.slice(position + length);
    this.version++;

    this.emitChange({
      origin: 'local',
      insertedText: '',
      deletedText: deleted,
      position,
      insertLength: 0,
      deleteLength: length,
      timestamp: Date.now(),
      peerId: this.localPeerId,
    });
  }

  /** Replace text in range */
  replace(position: number, deleteLength: number, insertText: string): void {
    if (position < 0 || position + deleteLength > this.content.length) {
      throw new RangeError(
        `Replace range [${position}, ${position + deleteLength}] out of range [0, ${this.content.length}]`
      );
    }

    const oldContent = this.content;
    const deleted = this.content.slice(position, position + deleteLength);

    if (this.config.undoEnabled) {
      this.undoStack.push(oldContent);
      if (this.undoStack.length > this.config.maxUndoStack) {
        this.undoStack.shift();
      }
      this.redoStack = [];
    }

    this.content =
      this.content.slice(0, position) + insertText + this.content.slice(position + deleteLength);
    this.version++;

    this.emitChange({
      origin: 'local',
      insertedText: insertText,
      deletedText: deleted,
      position,
      insertLength: insertText.length,
      deleteLength,
      timestamp: Date.now(),
      peerId: this.localPeerId,
    });
  }

  // ---------------------------------------------------------------------------
  // Undo / Redo
  // ---------------------------------------------------------------------------

  undo(): boolean {
    if (this.undoStack.length === 0) return false;

    this.redoStack.push(this.content);
    const previous = this.undoStack.pop()!;
    this.content = previous;
    this.version++;

    this.emitChange({
      origin: 'undo',
      insertedText: previous,
      deletedText: '',
      position: 0,
      insertLength: previous.length,
      deleteLength: 0,
      timestamp: Date.now(),
      peerId: this.localPeerId,
    });

    return true;
  }

  redo(): boolean {
    if (this.redoStack.length === 0) return false;

    this.undoStack.push(this.content);
    const next = this.redoStack.pop()!;
    this.content = next;
    this.version++;

    this.emitChange({
      origin: 'redo',
      insertedText: next,
      deletedText: '',
      position: 0,
      insertLength: next.length,
      deleteLength: 0,
      timestamp: Date.now(),
      peerId: this.localPeerId,
    });

    return true;
  }

  canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  // ---------------------------------------------------------------------------
  // Remote Sync
  // ---------------------------------------------------------------------------

  /** Apply a remote update (binary Yjs update message) */
  applyUpdate(update: Uint8Array, remotePeerId: string): void {
    this.stateUpdates.push(update);

    // Decode the update — in a full Yjs integration, this merges into the Doc.
    // Here we simulate by applying the text content from the update.
    const decoded = this.decodeTextUpdate(update);
    if (decoded !== null) {
      this.content = decoded;
      this.version++;

      this.emitChange({
        origin: 'remote',
        insertedText: decoded,
        deletedText: '',
        position: 0,
        insertLength: decoded.length,
        deleteLength: 0,
        timestamp: Date.now(),
        peerId: remotePeerId,
      });
    }
  }

  /** Get the current state as a binary update to send to peers */
  getEncodedState(): Uint8Array {
    return this.encodeTextUpdate(this.content);
  }

  /** Get the state vector for incremental sync */
  getStateVector(): Uint8Array {
    // Simplified state vector — version number as bytes
    const buffer = new ArrayBuffer(8);
    const view = new DataView(buffer);
    view.setFloat64(0, this.version);
    return new Uint8Array(buffer);
  }

  /** Get incremental update since a state vector */
  getUpdate(sinceStateVector: Uint8Array): Uint8Array {
    // In full Yjs, this computes a diff. Here we send full state.
    return this.getEncodedState();
  }

  /** Create a snapshot for persistence */
  getSnapshot(): DocumentSnapshot {
    const stateVec = this.getStateVector();
    return {
      content: this.content,
      stateVector: this.uint8ToBase64(stateVec),
      timestamp: Date.now(),
      documentId: this.documentId,
    };
  }

  /** Restore from a snapshot */
  loadSnapshot(snapshot: DocumentSnapshot): void {
    this.content = snapshot.content;
    this.version++;
    this.undoStack = [];
    this.redoStack = [];
  }

  // ---------------------------------------------------------------------------
  // Awareness (Presence)
  // ---------------------------------------------------------------------------

  /** Update local cursor position */
  setCursor(cursor: CursorPosition | null): void {
    this.localAwareness.cursor = cursor;
    this.localAwareness.lastActivity = Date.now();
    this.emit({
      type: 'awareness-change',
      documentId: this.documentId,
      timestamp: Date.now(),
      data: { peerId: this.localPeerId, cursor, type: 'cursor' },
    });
  }

  /** Update local selection */
  setSelection(selection: SelectionRange | null): void {
    this.localAwareness.selection = selection;
    this.localAwareness.lastActivity = Date.now();
    this.emit({
      type: 'awareness-change',
      documentId: this.documentId,
      timestamp: Date.now(),
      data: { peerId: this.localPeerId, selection, type: 'selection' },
    });
  }

  /** Update local 3D position (VR mode) */
  setWorldPosition(position: [number, number, number]): void {
    this.localAwareness.worldPosition = position;
    this.localAwareness.lastActivity = Date.now();
  }

  /** Apply a remote peer's awareness update */
  applyAwarenessUpdate(peerId: string, awareness: Partial<PeerAwareness>): void {
    const existing = this.peers.get(peerId);
    if (existing) {
      Object.assign(existing, awareness, { lastActivity: Date.now() });
    } else {
      const newPeer: PeerAwareness = {
        peerId,
        displayName: (awareness.displayName as string) ?? `Peer-${peerId.slice(0, 6)}`,
        color: (awareness.color as string) ?? '#888888',
        cursor: awareness.cursor ?? null,
        selection: awareness.selection ?? null,
        isActive: awareness.isActive ?? true,
        avatarId: awareness.avatarId,
        worldPosition: awareness.worldPosition,
        lastActivity: Date.now(),
      };
      this.peers.set(peerId, newPeer);
      this.emit({
        type: 'peer-joined',
        documentId: this.documentId,
        timestamp: Date.now(),
        data: { peerId, displayName: newPeer.displayName, color: newPeer.color },
      });
    }
  }

  /** Remove a peer */
  removePeer(peerId: string): void {
    if (this.peers.has(peerId) && peerId !== this.localPeerId) {
      this.peers.delete(peerId);
      this.emit({
        type: 'peer-left',
        documentId: this.documentId,
        timestamp: Date.now(),
        data: { peerId },
      });
    }
  }

  /** Get all active peers */
  getPeers(): PeerAwareness[] {
    return Array.from(this.peers.values());
  }

  /** Get the local awareness state (for broadcasting) */
  getLocalAwareness(): PeerAwareness {
    return { ...this.localAwareness };
  }

  /** Get the document version */
  getVersion(): number {
    return this.version;
  }

  // ---------------------------------------------------------------------------
  // Event System
  // ---------------------------------------------------------------------------

  on(event: DocumentEventType, handler: (event: DocumentEvent) => void): void {
    let set = this.listeners.get(event);
    if (!set) {
      set = new Set();
      this.listeners.set(event, set);
    }
    set.add(handler);
  }

  off(event: DocumentEventType, handler: (event: DocumentEvent) => void): void {
    this.listeners.get(event)?.delete(handler);
  }

  // ---------------------------------------------------------------------------
  // Cleanup
  // ---------------------------------------------------------------------------

  dispose(): void {
    if (this.changeDebounceTimer) {
      clearTimeout(this.changeDebounceTimer);
    }
    this.listeners.clear();
    this.peers.clear();
    this.stateUpdates = [];
    this.undoStack = [];
    this.redoStack = [];
  }

  // ---------------------------------------------------------------------------
  // Private Helpers
  // ---------------------------------------------------------------------------

  private emitChange(change: DocumentChange): void {
    this.pendingChanges.push(change);

    if (this.changeDebounceTimer) {
      clearTimeout(this.changeDebounceTimer);
    }

    this.changeDebounceTimer = setTimeout(() => {
      for (const c of this.pendingChanges) {
        this.emit({
          type: 'change',
          documentId: this.documentId,
          timestamp: c.timestamp,
          data: { ...c },
        });
      }
      this.pendingChanges = [];
    }, this.config.changeDebounceMs);
  }

  private emit(event: DocumentEvent): void {
    const handlers = this.listeners.get(event.type);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(event);
        } catch (err) {
          console.error(`[CRDTDocument] Event handler error for '${event.type}':`, err);
        }
      }
    }
  }

  /** Encode text content as a binary update (simplified Yjs-compatible framing) */
  private encodeTextUpdate(text: string): Uint8Array {
    const encoder = new TextEncoder();
    const textBytes = encoder.encode(text);
    // Frame: [4 bytes length][N bytes text][8 bytes version]
    const buffer = new ArrayBuffer(4 + textBytes.length + 8);
    const view = new DataView(buffer);
    view.setUint32(0, textBytes.length);
    new Uint8Array(buffer, 4, textBytes.length).set(textBytes);
    view.setFloat64(4 + textBytes.length, this.version);
    return new Uint8Array(buffer);
  }

  /** Decode a binary update to text content */
  private decodeTextUpdate(update: Uint8Array): string | null {
    try {
      if (update.length < 12) return null;
      const view = new DataView(update.buffer, update.byteOffset, update.byteLength);
      const textLength = view.getUint32(0);
      if (update.length < 4 + textLength + 8) return null;
      const decoder = new TextDecoder();
      return decoder.decode(new Uint8Array(update.buffer, update.byteOffset + 4, textLength));
    } catch {
      return null;
    }
  }

  private uint8ToBase64(bytes: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    // Use btoa if available, otherwise manual encoding
    if (typeof btoa !== 'undefined') {
      return btoa(binary);
    }
    return Buffer.from(bytes).toString('base64');
  }
}
