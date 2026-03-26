/**
 * Collaborative editing types for HoloScript Studio
 *
 * Real-time multi-user editing using Yjs CRDT and WebSockets
 */

// ── User Presence ─────────────────────────────────────────────────────────────

export interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  color: string;
}

export interface UserPresence {
  user: User;
  cursor?: {
    x: number;
    y: number;
    nodeId?: string;
  };
  selection?: {
    nodeIds: string[];
  };
  lastSeen: number;
  status: 'active' | 'idle' | 'away';
}

// ── Collaboration Session ─────────────────────────────────────────────────────

export interface CollaborationSession {
  id: string;
  workflowId: string;
  name: string;
  createdBy: string;
  createdAt: number;
  participants: User[];
  isActive: boolean;
}

export interface SessionPermissions {
  userId: string;
  role: 'owner' | 'editor' | 'viewer';
  canEdit: boolean;
  canInvite: boolean;
  canManagePermissions: boolean;
}

// ── Real-Time Updates ─────────────────────────────────────────────────────────

export type UpdateType =
  | 'node-added'
  | 'node-updated'
  | 'node-deleted'
  | 'edge-added'
  | 'edge-deleted'
  | 'workflow-renamed'
  | 'user-joined'
  | 'user-left';

export interface CollaborationUpdate {
  id: string;
  type: UpdateType;
  userId: string;
  timestamp: number;
  data: any;
  previousState?: any;
}

// ── Chat Messages ─────────────────────────────────────────────────────────────

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  userName: string;
  userColor: string;
  message: string;
  timestamp: number;
  replyTo?: string;
  mentions?: string[];
}

// ── Awareness State ───────────────────────────────────────────────────────────

export interface AwarenessState {
  user: User;
  presence: UserPresence;
  viewport?: {
    x: number;
    y: number;
    zoom: number;
  };
}

// ── Conflict Resolution ───────────────────────────────────────────────────────

export interface Conflict {
  id: string;
  nodeId: string;
  property: string;
  localValue: any;
  remoteValue: any;
  resolvedWith?: 'local' | 'remote' | 'merged';
  resolvedAt?: number;
}

// ── Connection Status ─────────────────────────────────────────────────────────

export type ConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed';

export interface ConnectionState {
  status: ConnectionStatus;
  lastConnected?: number;
  lastDisconnected?: number;
  reconnectAttempts: number;
  error?: string;
}
