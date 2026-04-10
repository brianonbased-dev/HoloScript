/**
 * Collaboration client using Yjs CRDT
 *
 * Manages real-time synchronization of workflows across multiple users
 */

import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import type { Awareness } from 'y-protocols/awareness';
import type {
  User,
  UserPresence,
  AwarenessState,
  ConnectionStatus,
  ChatMessage,
} from './types';
import type { GraphNode, GraphEdge } from '@/hooks/useNodeGraph';

export interface CollaborationClientConfig {
  wsUrl?: string;
  user: User;
  onConnectionChange?: (status: ConnectionStatus) => void;
  onPresenceChange?: (users: Map<number, UserPresence>) => void;
  onChatMessage?: (message: ChatMessage) => void;
}

export class CollaborationClient {
  private ydoc: Y.Doc;
  private provider: WebsocketProvider | null = null;
  private config: CollaborationClientConfig;
  private sessionId: string | null = null;
  private awareness: Awareness | null = null;

  constructor(config: CollaborationClientConfig) {
    this.config = config;
    this.ydoc = new Y.Doc();
  }

  // ── Session Management ────────────────────────────────────────────────────

  /**
   * Connect to a collaboration session
   */
  async connect(sessionId: string): Promise<void> {
    this.disconnect(); // Ensure previous provider is cleaned up to prevent stacking
    this.sessionId = sessionId;
    const wsUrl = this.config.wsUrl || 'wss://collab.holoscript.net';

    // Create WebSocket provider
    this.provider = new WebsocketProvider(wsUrl, sessionId, this.ydoc, {
      connect: true,
      params: {
        userId: this.config.user.id,
        userName: this.config.user.name,
      },
    });

    this.awareness = this.provider.awareness;

    // Set local user awareness
    this.awareness.setLocalState({
      user: this.config.user,
      presence: {
        user: this.config.user,
        lastSeen: Date.now(),
        status: 'active',
      },
    });

    // Listen to connection changes
    this.provider.on('status', (event: { status: string }) => {
      const status = event.status as ConnectionStatus;
      this.config.onConnectionChange?.(status);
    });

    // Listen to awareness changes (user presence)
    this.awareness.on('change', () => {
      const users = new Map<number, UserPresence>();
      this.awareness!.getStates().forEach((state: { [x: string]: unknown }, clientId: number) => {
        const typedState = state as unknown as AwarenessState;
        if (typedState.presence && clientId !== this.awareness!.clientID) {
          users.set(clientId, typedState.presence);
        }
      });
      this.config.onPresenceChange?.(users);
    });
  }

  /**
   * Disconnect from the collaboration session
   */
  disconnect(): void {
    if (this.provider) {
      this.provider.disconnect();
      this.provider.destroy();
      this.provider = null;
    }
    this.sessionId = null;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.provider?.wsconnected ?? false;
  }

  // ── Document Synchronization ──────────────────────────────────────────────

  /**
   * Get a shared map for workflow data
   */
  getWorkflowMap(): Y.Map<unknown> {
    return this.ydoc.getMap('workflow');
  }

  /**
   * Get a shared array for nodes
   */
  getNodesArray(): Y.Array<GraphNode> {
    return this.ydoc.getArray('nodes');
  }

  /**
   * Get a shared array for edges
   */
  getEdgesArray(): Y.Array<GraphEdge> {
    return this.ydoc.getArray('edges');
  }

  /**
   * Get a shared map for metadata
   */
  getMetadataMap(): Y.Map<unknown> {
    return this.ydoc.getMap('metadata');
  }

  /**
   * Sync workflow state to Yjs
   */
  syncWorkflow(workflow: { nodes: GraphNode[]; edges: GraphEdge[]; metadata: Record<string, unknown> }): void {
    this.ydoc.transact(() => {
      const nodesArray = this.getNodesArray();
      const edgesArray = this.getEdgesArray();
      const metadataMap = this.getMetadataMap();

      // Clear and set nodes
      nodesArray.delete(0, nodesArray.length);
      workflow.nodes.forEach((node) => nodesArray.push([node]));

      // Clear and set edges
      edgesArray.delete(0, edgesArray.length);
      workflow.edges.forEach((edge) => edgesArray.push([edge]));

      // Set metadata
      Object.entries(workflow.metadata).forEach(([key, value]) => {
        metadataMap.set(key, value);
      });
    });
  }

  /**
   * Get current workflow state from Yjs
   */
  getWorkflowState(): {
    nodes: GraphNode[];
    edges: GraphEdge[];
    metadata: Record<string, unknown>;
  } {
    const nodesArray = this.getNodesArray();
    const edgesArray = this.getEdgesArray();
    const metadataMap = this.getMetadataMap();

    return {
      nodes: nodesArray.toArray(),
      edges: edgesArray.toArray(),
      metadata: Object.fromEntries(metadataMap.entries()),
    };
  }

  /**
   * Observe changes to the workflow
   */
  observeWorkflow(callback: (event: Y.YEvent<Y.AbstractType<unknown>>) => void): () => void {
    const nodesArray = this.getNodesArray();
    const edgesArray = this.getEdgesArray();
    const metadataMap = this.getMetadataMap();

    const nodesCallback = (event: Y.YArrayEvent<GraphNode>) => callback(event as Y.YEvent<Y.AbstractType<unknown>>);
    const edgesCallback = (event: Y.YArrayEvent<GraphEdge>) => callback(event as Y.YEvent<Y.AbstractType<unknown>>);
    const metaCallback = (event: Y.YMapEvent<unknown>) => callback(event as Y.YEvent<Y.AbstractType<unknown>>);

    nodesArray.observe(nodesCallback);
    edgesArray.observe(edgesCallback);
    metadataMap.observe(metaCallback);

    return () => {
      nodesArray.unobserve(nodesCallback);
      edgesArray.unobserve(edgesCallback);
      metadataMap.unobserve(metaCallback);
    };
  }

  // ── User Presence ─────────────────────────────────────────────────────────

  /**
   * Update local user presence
   */
  updatePresence(presence: Partial<UserPresence>): void {
    if (!this.awareness) return;

    const current = this.awareness.getLocalState() as AwarenessState;
    this.awareness.setLocalStateField('presence', {
      ...current?.presence,
      ...presence,
      lastSeen: Date.now(),
    });
  }

  /**
   * Update cursor position
   */
  updateCursor(x: number, y: number, nodeId?: string): void {
    this.updatePresence({
      cursor: { x, y, nodeId },
    });
  }

  /**
   * Update selection
   */
  updateSelection(nodeIds: string[]): void {
    this.updatePresence({
      selection: { nodeIds },
    });
  }

  /**
   * Get all connected users
   */
  getConnectedUsers(): UserPresence[] {
    if (!this.awareness) return [];

    const users: UserPresence[] = [];
    this.awareness.getStates().forEach((state: { [x: string]: unknown }, clientId: number) => {
      const typedState = state as unknown as AwarenessState;
      if (typedState.presence && clientId !== this.awareness!.clientID) {
        users.push(typedState.presence);
      }
    });

    return users;
  }

  // ── Chat ──────────────────────────────────────────────────────────────────

  /**
   * Get chat messages array
   */
  getChatArray(): Y.Array<ChatMessage> {
    return this.ydoc.getArray('chat');
  }

  /**
   * Send a chat message
   */
  sendMessage(message: string, replyTo?: string, mentions?: string[]): void {
    const chatArray = this.getChatArray();
    const chatMessage: ChatMessage = {
      id: `msg-${Date.now()}-${Math.random()}`,
      sessionId: this.sessionId!,
      userId: this.config.user.id,
      userName: this.config.user.name,
      userColor: this.config.user.color,
      message,
      timestamp: Date.now(),
      replyTo,
      mentions,
    };

    chatArray.push([chatMessage]);
    this.config.onChatMessage?.(chatMessage);
  }

  /**
   * Observe chat messages
   */
  observeChat(callback: (event: Y.YArrayEvent<ChatMessage>) => void): () => void {
    const chatArray = this.getChatArray();
    chatArray.observe(callback);
    return () => chatArray.unobserve(callback);
  }

  // ── Undo/Redo ─────────────────────────────────────────────────────────────

  /**
   * Create undo manager for collaborative editing
   */
  createUndoManager(scope?: Y.AbstractType<unknown>[]): Y.UndoManager {
    const scopes = scope || [this.getNodesArray(), this.getEdgesArray(), this.getMetadataMap()];

    return new Y.UndoManager(scopes, {
      trackedOrigins: new Set([this.awareness?.clientID]),
    });
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  destroy(): void {
    this.disconnect();
    this.ydoc.destroy();
  }
  updateConfig(newConfig: Partial<CollaborationClientConfig>) {
    this.config = { ...this.config, ...newConfig };
  }
}

// ── Singleton Instance ────────────────────────────────────────────────────────

let collaborationClientInstance: CollaborationClient | null = null;

export function getCollaborationClient(config?: CollaborationClientConfig): CollaborationClient {
  if (!collaborationClientInstance && config) {
    collaborationClientInstance = new CollaborationClient(config);
  } else if (collaborationClientInstance && config) {
    collaborationClientInstance.updateConfig(config);
  }
  if (!collaborationClientInstance) {
    throw new Error('CollaborationClient not initialized');
  }
  return collaborationClientInstance;
}

export function setCollaborationClient(client: CollaborationClient) {
  collaborationClientInstance = client;
}
