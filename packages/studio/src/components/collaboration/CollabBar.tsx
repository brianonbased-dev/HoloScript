'use client';

/**
 * CollabBar — collaboration status + connected peers display
 *
 * Renders in StudioHeader right cluster:
 *   • Green/amber dot for connection status
 *   • Colored avatar bubbles for each connected peer (max 4 visible)
 *   • "+N" overflow badge when more than 4 peers
 *   • Tooltip on each bubble with peer name
 */

import { useState } from 'react';
import { Wifi, WifiOff } from 'lucide-react';
import { useCollaboration, getLocalName, getLocalColor, setLocalName } from '@/lib/collaboration';

// ─── Avatar bubble ────────────────────────────────────────────────────────────

function Avatar({ name, color, size = 24 }: { name: string; color: string; size?: number }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .slice(0, 2)
    .join('');

  return (
    <div
      title={name}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        border: '2px solid #0a0a12',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.38,
        fontWeight: 700,
        color: '#fff',
        cursor: 'default',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      {initials || '?'}
    </div>
  );
}

// ─── CollabBar ────────────────────────────────────────────────────────────────

interface CollabBarProps {
  enabled?: boolean;
}

export function CollabBar({ enabled = false }: CollabBarProps) {
  const [collabOn, setCollabOn] = useState(enabled);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameInput, setNameInput] = useState(getLocalName());

  const { connected, peers, room } = useCollaboration(collabOn);
  const MAX_SHOWN = 4;

  const handleNameCommit = () => {
    setLocalName(nameInput.trim() || getLocalName());
    setNameEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      {/* Toggle collab */}
      <button
        onClick={() => setCollabOn((v) => !v)}
        title={collabOn ? `Connected to room: ${room}` : 'Enable collaboration'}
        className={`flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs transition ${
          collabOn && connected
            ? 'border border-studio-success/40 bg-studio-success/10 text-studio-success'
            : collabOn
              ? 'border border-studio-warning/40 bg-studio-warning/10 text-studio-warning'
              : 'border border-studio-border/60 bg-studio-surface text-studio-muted hover:text-studio-text'
        }`}
      >
        {collabOn && connected ? <Wifi className="h-3 w-3" /> : <WifiOff className="h-3 w-3" />}
        {collabOn ? (connected ? `${peers.length + 1} online` : 'Connecting…') : 'Collab'}
      </button>

      {/* Peer avatars */}
      {collabOn && (
        <div className="flex items-center" style={{ gap: -4 }}>
          {/* Local user */}
          <div
            className="relative cursor-pointer"
            onClick={() => setNameEditing((v) => !v)}
            style={{ marginRight: 2 }}
          >
            <Avatar name={getLocalName()} color={getLocalColor()} />
            {/* Name edit popover */}
            {nameEditing && (
              <div className="absolute right-0 top-8 z-50 rounded-lg border border-studio-border bg-studio-panel p-2 shadow-xl">
                <input
                  autoFocus
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onBlur={handleNameCommit}
                  onKeyDown={(e) => e.key === 'Enter' && handleNameCommit()}
                  className="w-36 rounded-md border border-studio-border bg-studio-surface px-2 py-1 text-xs text-studio-text outline-none focus:border-studio-accent"
                  placeholder="Your display name"
                />
              </div>
            )}
          </div>

          {/* Remote peers */}
          {peers.slice(0, MAX_SHOWN).map((peer) => (
            <div key={peer.clientId} style={{ marginLeft: -8 }}>
              <Avatar name={peer.name} color={peer.color} />
            </div>
          ))}

          {/* Overflow badge */}
          {peers.length > MAX_SHOWN && (
            <div
              style={{ marginLeft: -8 }}
              className="flex h-6 w-6 items-center justify-center rounded-full border-2 border-studio-panel bg-studio-surface text-[10px] text-studio-muted"
            >
              +{peers.length - MAX_SHOWN}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
