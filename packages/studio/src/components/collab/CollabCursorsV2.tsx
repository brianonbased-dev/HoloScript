'use client';

/**
 * CollabCursorsV2 — named colored cursor overlays for multiplayer presence.
 * Uses useMultiplayerRoom. Each peer gets a deterministic HSL color from their name.
 */

import { useMultiplayerRoom } from '@/hooks/useMultiplayerRoom';

function peerColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) & 0xffffffff;
  return `hsl(${Math.abs(h) % 360}, 80%, 60%)`;
}

function CursorShape({ color }: { color: string }) {
  return (
    <svg width="16" height="20" viewBox="0 0 16 20" fill="none" className="drop-shadow-lg">
      <path d="M2 2 L14 8 L8 10 L6 16 Z" fill={color} stroke="white" strokeWidth="1" />
    </svg>
  );
}

interface CollabCursorsV2Props {
  roomId: string;
  userName: string;
}

export function CollabCursorsV2({ roomId, userName }: CollabCursorsV2Props) {
  const { peers, connected } = useMultiplayerRoom({ roomId, userName, enabled: true });

  if (!connected || peers.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {peers.map((peer) => {
        if (!peer.cursor) return null;
        const color = peerColor(peer.user);
        const { x, y } = peer.cursor;

        return (
          <div
            key={peer.user}
            className="absolute transition-all duration-75"
            style={{ left: `${x}%`, top: `${y}%` }}
          >
            <CursorShape color={color} />
            {/* Name label */}
            <div
              className="absolute left-4 top-4 max-w-[100px] truncate rounded-full px-2 py-0.5 text-[9px] font-semibold text-white shadow"
              style={{ backgroundColor: color }}
            >
              {peer.user}
            </div>
            {/* Selected object indicator */}
            {peer.selectedObject && (
              <div className="absolute left-4 top-9 rounded-full border px-1.5 py-0.5 text-[7px] text-white/80 backdrop-blur-sm"
                style={{ borderColor: color + '66', backgroundColor: color + '22' }}>
                📦 {peer.selectedObject}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
