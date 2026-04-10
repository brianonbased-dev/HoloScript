/**
 * HoloScript Collaboration Module
 *
 * Provides CRDT-based collaborative editing for HoloScript files.
 * Supports real-time multi-peer editing with VR awareness (cursor
 * positions, selections, world positions), undo/redo history,
 * and integration with HoloScriptHotReloader for live scene patching.
 *
 * Architecture:
 * ```
 *    CRDTDocument          - Per-file CRDT document model
 *         ↕
 *    CollaborationSession  - Multi-document session manager
 *         ↕
 *    CollaborationTransport- WebSocket sync transport
 *         ↕
 *    NetworkTransport      - Existing network infrastructure
 * ```
 *
 * Usage:
 * ```ts
 * import {
 *   CollaborationSession,
 *   CRDTDocument,
 *   CollaborationTransport,
 * } from './collaboration';
 *
 * const session = new CollaborationSession({
 *   sessionId: 'hololand-main',
 *   workspaceId: 'hololand',
 *   localPeer: {
 *     peerId: 'alice-123',
 *     displayName: 'Alice',
 *     color: '#00d4ff',
 *     platform: 'vr',
 *   },
 * });
 *
 * await session.connect();
 * const doc = session.openDocument('zones/main_plaza.hsplus');
 * doc.insert(100, '  object "NewOrb" { position: [0, 2, 0] }\n');
 * ```
 *
 * @module collaboration
 */

// CRDT Document Model
export {
  CRDTDocument,
  type CRDTDocumentConfig,
  type CursorPosition,
  type DocumentChange,
  type DocumentEvent,
  type DocumentIdentifier,
  type DocumentSnapshot,
  type PeerAwareness,
  type SelectionRange,
} from './CRDTDocument';

// Session Manager
export {
  CollaborationSession,
  type FileChangeCallback,
  type SessionConfig,
  type SessionEvent,
  type SessionEventType,
  type SessionPeer,
  type SessionState,
  type SessionStats,
} from './CollaborationSession';

// Transport Layer
export {
  CollaborationTransport,
  decodeSyncMessage,
  encodeSyncMessage,
  type SyncMessage,
  type SyncMessageType,
  type TransportConfig,
  type TransportState,
  type TransportStats,
} from './CollaborationTransport';
