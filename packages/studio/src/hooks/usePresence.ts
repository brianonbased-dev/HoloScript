/**
 * User Presence Hook
 *
 * Tracks user presence and awareness in collaborative sessions
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { getCollaborationClient } from '@/lib/collaboration/client';
import type { UserPresence } from '@/lib/collaboration/types';

export interface UsePresenceOptions {
  enabled?: boolean;
}

export interface UsePresenceReturn {
  users: UserPresence[];
  updateCursor: (x: number, y: number, nodeId?: string) => void;
  updateSelection: (nodeIds: string[]) => void;
  updateStatus: (status: 'active' | 'idle' | 'away') => void;
}

export function usePresence({ enabled = true }: UsePresenceOptions = {}): UsePresenceReturn {
  const [users, setUsers] = useState<UserPresence[]>([]);

  const updateCursor = useCallback(
    (x: number, y: number, nodeId?: string) => {
      if (!enabled) return;

      try {
        const client = getCollaborationClient();
        client.updateCursor(x, y, nodeId);
      } catch (err) {
        // Client not initialized - ignore
      }
    },
    [enabled]
  );

  const updateSelection = useCallback(
    (nodeIds: string[]) => {
      if (!enabled) return;

      try {
        const client = getCollaborationClient();
        client.updateSelection(nodeIds);
      } catch (err) {
        // Client not initialized - ignore
      }
    },
    [enabled]
  );

  const updateStatus = useCallback(
    (status: 'active' | 'idle' | 'away') => {
      if (!enabled) return;

      try {
        const client = getCollaborationClient();
        client.updatePresence({ status });
      } catch (err) {
        // Client not initialized - ignore
      }
    },
    [enabled]
  );

  // Poll for connected users
  useEffect(() => {
    if (!enabled) return;

    const interval = setInterval(() => {
      try {
        const client = getCollaborationClient();
        const connectedUsers = client.getConnectedUsers();
        setUsers(connectedUsers);
      } catch (err) {
        // Client not initialized - ignore
      }
    }, 1000); // Update every second

    return () => {
      clearInterval(interval);
    };
  }, [enabled]);

  return {
    users,
    updateCursor,
    updateSelection,
    updateStatus,
  };
}
