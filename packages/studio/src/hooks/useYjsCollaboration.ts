// @ts-nocheck
/**
 * Yjs-based Collaboration Hook
 *
 * Manages real-time collaborative workflow editing with Yjs CRDT and WebSockets
 */

import { useEffect, useState, useCallback } from 'react';
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
  useEffect(() => {
    workflowsRef.current = workflows;
  });

  const connect = useCallback(async () => {
    if (!enabled) return;

    try {
      setConnectionStatus('connecting');
      setError(null);

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

      // Observe changes from other users
      const unobserve = client.observeWorkflow(() => {
        const state = client.getWorkflowState();
        updateWorkflow(workflowId, {
          nodes: state.nodes,
          edges: state.edges,
          metadata: state.metadata,
        });
      });

      // Cleanup on unmount
      return () => {
        unobserve();
      };
    } catch (err) {
      logger.error('Collaboration connection error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error');
      setConnectionStatus('failed');
    }
  }, [enabled, user, workflowId, updateWorkflow]);

  const disconnect = useCallback(() => {
    try {
      const client = getCollaborationClient();
      client.disconnect();
      setConnectionStatus('disconnected');
      setUsers([]);
    } catch (err) {
      logger.error('Collaboration disconnect error:', err);
    }
  }, []);

  const updateCursor = useCallback((x: number, y: number, nodeId?: string) => {
    try {
      const client = getCollaborationClient();
      client.updateCursor(x, y, nodeId);
    } catch (err) {
      logger.error('Update cursor error:', err);
    }
  }, []);

  const updateSelection = useCallback((nodeIds: string[]) => {
    try {
      const client = getCollaborationClient();
      client.updateSelection(nodeIds);
    } catch (err) {
      logger.error('Update selection error:', err);
    }
  }, []);

  // Auto-connect when enabled
  useEffect(() => {
    let unobservePromise: Promise<(() => void) | undefined> | undefined;

    if (enabled) {
      unobservePromise = connect();
    }

    return () => {
      if (enabled) {
        disconnect();
      }
      if (unobservePromise) {
        unobservePromise.then((unobserve) => {
          if (typeof unobserve === 'function') unobserve();
        });
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
