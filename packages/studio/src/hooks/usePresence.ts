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
      } catch (_err) {
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
      } catch (_err) {
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
      } catch (_err) {
        // Client not initialized - ignore
      }
    },
    [enabled]
  );

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Poll for connected users
  useEffect(() => {
    if (!enabled) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    
    intervalRef.current = setInterval(() => {
      try {
        const client = getCollaborationClient();
        const connectedUsers = client.getConnectedUsers();
        setUsers(connectedUsers);
      } catch (_err) {
        // Client not initialized - ignore
      }
    }, 1000); // Update every second

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [enabled]);

  return {
    users,
    updateCursor,
    updateSelection,
    updateStatus,
  };
}
