// @ts-nocheck
/**
 * Yjs-based Collaboration Hook
 *
 * Manages real-time collaborative workflow editing with Yjs CRDT and WebSockets
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getCollaborationClient } from '@/lib/collaboration/client';
import type { User, UserPresence, ConnectionStatus } from '@/lib/collaboration/types';
import { useOrchestrationStore } from '@/lib/orchestrationStore';
import { logger } from '@/lib/logger';

export interface UseYjsCollaborationOptions {
  workflowId: string;
  user: User;
  enabled?: boolean;
}

export interface UseYjsCollaborationReturn {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  users: UserPresence[];
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  updateCursor: (x: number, y: number, nodeId?: string) => void;
  updateSelection: (nodeIds: string[]) => void;
}

export function useYjsCollaboration({
  workflowId,
  user,
  enabled = true,
}: UseYjsCollaborationOptions): UseYjsCollaborationReturn {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [users, setUsers] = useState<UserPresence[]>([]);
  const [error, setError] = useState<string | null>(null);

  const { workflows, updateWorkflow } = useOrchestrationStore();
  const workflowsRef = useRef(workflows);
  const unobserveRef = useRef<(() => void) | null>(null);
  useEffect(() => {
    workflowsRef.current = workflows;
  });

  const isConnectingRef = useRef(false);

  const connect = useCallback(async () => {
    if (!enabled || isConnectingRef.current) return;
    
    // Skip if already connected
    if (connectionStatus === 'connected') return;

    try {
      isConnectingRef.current = true;
      setConnectionStatus('connecting');
      setError(null);

      // Clean up any existing observer before creating new connection
      if (unobserveRef.current) {
        unobserveRef.current();
        unobserveRef.current = null;
      }
      
      // Ensure we disconnect the prior client instance from sending callbacks
      try {
        const existingClient = getCollaborationClient();
        existingClient.disconnect();
      } catch (_err) {
        // Ignore if uninitialized
      }

      const client = getCollaborationClient({
        user,
        onConnectionChange: (status) => {
          setConnectionStatus(status);
          if (status === 'failed') {
            setError('Failed to connect to collaboration server');
          }
        },
        onPresenceChange: (presenceUsers) => {
          setUsers(Array.from(presenceUsers.values()));
        },
      });

      await client.connect(workflowId);

      // Sync initial workflow state to Yjs
      const workflow = workflowsRef.current.get(workflowId);
      if (workflow) {
        client.syncWorkflow({
          nodes: workflow.nodes,
          edges: workflow.edges,
          metadata: workflow.metadata || {},
        });
      }

      // Observe changes from other users — remove previous observer first
      if (unobserveRef.current) {
        unobserveRef.current();
        unobserveRef.current = null;
      }
      const unobserve = client.observeWorkflow(() => {
        const state = client.getWorkflowState();
        updateWorkflow(workflowId, {
          nodes: state.nodes,
          edges: state.edges,
          metadata: state.metadata,
        });
      });
      unobserveRef.current = unobserve;
    } catch (err) {
      logger.error('[useYjsCollaboration] Collaboration connection error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setConnectionStatus('failed');
    } finally {
      isConnectingRef.current = false;
    }
  }, [enabled, user, workflowId, updateWorkflow, connectionStatus]);

  const disconnect = useCallback(() => {
    try {
      const client = getCollaborationClient();
      client.disconnect();
      setConnectionStatus('disconnected');
      setUsers([]);
    } catch (err) {
      logger.error('[useYjsCollaboration] Collaboration disconnect error:', err);
    }
  }, []);

  const updateCursor = useCallback((x: number, y: number, nodeId?: string) => {
    try {
      const client = getCollaborationClient();
      client.updateCursor(x, y, nodeId);
    } catch (err) {
      logger.error('[useYjsCollaboration] Update cursor error:', err);
    }
  }, []);

  const updateSelection = useCallback((nodeIds: string[]) => {
    try {
      const client = getCollaborationClient();
      client.updateSelection(nodeIds);
    } catch (err) {
      logger.error('[useYjsCollaboration] Update selection error:', err);
    }
  }, []);

  // Auto-connect when enabled
  useEffect(() => {
    if (enabled) {
      void connect();
    }

    return () => {
      // Tear down active observer synchronously before disconnecting
      if (unobserveRef.current) {
        unobserveRef.current();
        unobserveRef.current = null;
      }
      if (enabled) {
        disconnect();
      }
    };
  }, [enabled, connect, disconnect]);

  return {
    isConnected: connectionStatus === 'connected',
    connectionStatus,
    users,
    error,
    connect,
    disconnect,
    updateCursor,
    updateSelection,
  };
}
