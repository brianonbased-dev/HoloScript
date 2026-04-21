'use client';

/**
 * Collaboration Toolbar Component
 *
 * Controls for managing collaborative editing features
 */

import { useState } from 'react';
import { Users, MessageCircle, UserCircle, Settings, Play, StopCircle } from 'lucide-react';
import { useYjsCollaboration } from '@/hooks/useYjsCollaboration';
import { PresenceIndicator } from './PresenceIndicator';
import { ChatPanel } from './ChatPanel';
import type { User } from '@/lib/collaboration/types';

export interface CollaborationToolbarProps {
  workflowId: string;
  currentUser: User;
}

export function CollaborationToolbar({ workflowId, currentUser }: CollaborationToolbarProps) {
  const [chatOpen, setChatOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);

  const { isConnected, connectionStatus, users, connect, disconnect } = useYjsCollaboration({
    workflowId,
    user: currentUser,
    enabled,
  });

  const handleToggleCollaboration = () => {
    if (enabled) {
      disconnect();
      setEnabled(false);
    } else {
      setEnabled(true);
      connect();
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Collaboration toggle */}
        <button
          onClick={handleToggleCollaboration}
          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
            enabled
              ? 'border-sky-500/40 bg-sky-500/20 text-sky-300'
              : 'border-studio-border bg-studio-surface text-studio-muted hover:border-sky-500/40 hover:text-sky-400'
          }`}
          title={enabled ? 'Disable collaboration' : 'Enable collaboration'}
        >
          {enabled ? (
            <>
              <StopCircle className="h-3.5 w-3.5" />
              <span>Disconnect</span>
            </>
          ) : (
            <>
              <Play className="h-3.5 w-3.5" />
              <span>Collaborate</span>
            </>
          )}
        </button>

        {/* Presence indicator (only when enabled) */}
        {enabled && <PresenceIndicator users={users} connectionStatus={connectionStatus} />}

        {/* Chat button (only when connected) */}
        {isConnected && (
          <button
            onClick={() => setChatOpen(!chatOpen)}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
              chatOpen
                ? 'border-sky-500/40 bg-sky-500/20 text-sky-300'
                : 'border-studio-border bg-studio-surface text-studio-muted hover:border-sky-500/40 hover:text-sky-400'
            }`}
            title="Toggle chat"
          >
            <MessageCircle className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Chat</span>
          </button>
        )}

        {/* Settings button (only when enabled) */}
        {enabled && (
          <button
            onClick={() => setSettingsOpen(!settingsOpen)}
            className={`rounded-lg border border-studio-border bg-studio-surface p-1.5 text-studio-muted hover:border-sky-500/40 hover:text-sky-400 transition ${
              settingsOpen ? 'border-sky-500/40 text-sky-400' : ''
            }`}
            title="Collaboration settings"
          >
            <Settings className="h-3.5 w-3.5" />
          </button>
        )}

        {/* Settings dropdown */}
        {settingsOpen && (
          <div className="absolute top-full right-0 mt-2 w-64 rounded-lg border border-studio-border bg-studio-panel shadow-xl z-50">
            <div className="p-4 space-y-3">
              <h3 className="text-sm font-bold text-studio-text">Collaboration Settings</h3>

              <div className="space-y-2">
                <label className="flex items-center justify-between">
                  <span className="text-xs text-studio-text">Show user cursors</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-xs text-studio-text">Show selections</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </label>
                <label className="flex items-center justify-between">
                  <span className="text-xs text-studio-text">Enable chat</span>
                  <input type="checkbox" defaultChecked className="rounded" />
                </label>
              </div>

              <div className="pt-2 border-t border-studio-border">
                <div className="flex items-center gap-2">
                  <UserCircle className="h-4 w-4 text-studio-muted" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-studio-text truncate">
                      {currentUser.name}
                    </p>
                    <p className="text-[10px] text-studio-muted truncate">{currentUser.email}</p>
                  </div>
                  <div
                    className="h-3 w-3 rounded-full"
                    style={{ backgroundColor: currentUser.color }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Chat panel */}
      {chatOpen && <ChatPanel onClose={() => setChatOpen(false)} />}
    </>
  );
}
