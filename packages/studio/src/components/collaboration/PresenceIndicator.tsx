'use client';

/**
 * Presence Indicator Component
 *
 * Shows list of connected users with their status
 */

import { Users, Circle } from 'lucide-react';
import type { UserPresence } from '@/lib/collaboration/types';

export interface PresenceIndicatorProps {
  users: UserPresence[];
  connectionStatus: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed';
}

export function PresenceIndicator({ users, connectionStatus }: PresenceIndicatorProps) {
  const getStatusColor = (status: UserPresence['status']) => {
    switch (status) {
      case 'active':
        return 'text-emerald-400';
      case 'idle':
        return 'text-yellow-400';
      case 'away':
        return 'text-gray-400';
      default:
        return 'text-gray-500';
    }
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'bg-emerald-500';
      case 'connecting':
      case 'reconnecting':
        return 'bg-yellow-500 animate-pulse';
      case 'failed':
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-studio-surface px-3 py-2">
      {/* Connection status */}
      <div className="flex items-center gap-2">
        <div className={`h-2 w-2 rounded-full ${getConnectionStatusColor()}`} />
        <span className="text-xs text-studio-muted capitalize">{connectionStatus}</span>
      </div>

      {/* Divider */}
      {users.length > 0 && <div className="h-4 w-px bg-studio-border" />}

      {/* User count */}
      {users.length > 0 && (
        <div className="flex items-center gap-1.5">
          <Users className="h-3.5 w-3.5 text-studio-muted" />
          <span className="text-xs font-medium text-studio-text">{users.length}</span>
        </div>
      )}

      {/* User list */}
      {users.length > 0 && (
        <div className="flex items-center gap-1">
          {users.slice(0, 5).map((user) => (
            <div
              key={user.user.id}
              className="group relative"
              title={`${user.user.name} (${user.status})`}
            >
              <div
                className="h-6 w-6 rounded-full border-2 border-studio-panel flex items-center justify-center text-[10px] font-bold text-white"
                style={{
                  backgroundColor: user.user.color,
                }}
              >
                {user.user.name.charAt(0).toUpperCase()}
              </div>
              <Circle
                className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 ${getStatusColor(user.status)}`}
                fill="currentColor"
              />

              {/* Tooltip */}
              <div className="invisible absolute top-full left-1/2 -translate-x-1/2 mt-2 z-10 group-hover:visible">
                <div className="rounded bg-studio-panel border border-studio-border px-2 py-1 shadow-lg whitespace-nowrap">
                  <p className="text-xs font-medium text-studio-text">{user.user.name}</p>
                  <p className="text-[10px] text-studio-muted capitalize">{user.status}</p>
                </div>
              </div>
            </div>
          ))}
          {users.length > 5 && (
            <div className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-studio-panel bg-studio-surface text-[10px] font-bold text-studio-text">
              +{users.length - 5}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
