'use client';

/**
 * CollabCursors — renders remote user cursors as floating SVG arrows with name badges.
 * Must be placed as a fixed overlay (pointer-events: none) over the Studio viewport.
 *
 * @deprecated Use CollabCursorsV2 from '@/components/collab/CollabCursorsV2' instead.
 * V2 uses useMultiplayerRoom with deterministic HSL colors and smoother transitions.
 * This V1 implementation is kept for backward compatibility during migration.
 *
 * NOTE: CollabStatusDot (exported below) is NOT deprecated and remains the canonical
 * collaboration status indicator.
 */

import { useEffect } from 'react';
import { useCollabStore } from '@/lib/collabStore';

/** @deprecated Use CollabCursorsV2 instead */
export function CollabCursors() {
  const { cursors, pruneStale, connected } = useCollabStore();

  // Prune stale cursors every 5 s
  useEffect(() => {
    const t = setInterval(() => pruneStale(8_000), 5_000);
    return () => clearInterval(t);
  }, [pruneStale]);

  if (!connected) return null;

  const remoteCursors = Object.values(cursors);
  if (remoteCursors.length === 0) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-40 overflow-hidden">
      {remoteCursors.map((c) => {
        const xPct = `${(c.x * 100).toFixed(2)}%`;
        const yPct = `${(c.y * 100).toFixed(2)}%`;

        return (
          <div
            key={c.userId}
            className="absolute flex flex-col items-start"
            style={{ left: xPct, top: yPct, transform: 'translate(0, 0)' }}
          >
            {/* Cursor arrow */}
            <svg width="16" height="20" viewBox="0 0 16 20" fill="none">
              <path
                d="M0 0 L0 16 L4.5 12 L8 20 L10 19 L6.5 11 L12 11 Z"
                fill={c.color}
                stroke="rgba(0,0,0,0.4)"
                strokeWidth="1"
              />
            </svg>
            {/* Name badge */}
            <div
              className="ml-3 -mt-1 whitespace-nowrap rounded-full px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-lg"
              style={{ backgroundColor: c.color }}
            >
              {c.name}
              {c.selectedId && (
                <span className="ml-1 opacity-80">· {c.selectedId.slice(0, 6)}</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Collab status dot ─────────────────────────────────────────────────────

export function CollabStatusDot() {
  const { connected, cursors } = useCollabStore();
  const count = Object.keys(cursors).length;

  return (
    <div className="flex items-center gap-1">
      <div
        className={`h-2 w-2 rounded-full ${
          connected ? 'bg-green-400 animate-pulse' : 'bg-studio-muted'
        }`}
        title={
          connected
            ? `${count} collaborator${count !== 1 ? 's' : ''} online`
            : 'Collab disconnected'
        }
      />
      {connected && count > 0 && <span className="text-[9px] text-studio-muted">{count}</span>}
    </div>
  );
}
