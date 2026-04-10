'use client';

/**
 * GameHUD — In-game heads-up display overlay
 *
 * Shows score, lives, level, timer, and inventory during play mode.
 * Positioned as an overlay on top of the 3D viewport.
 * Only visible when playState !== 'editing' and showHUD is true.
 */

import { usePlayMode } from '@/lib/stores/playModeStore';
import { Heart, Trophy, Layers, Clock, Package } from 'lucide-react';

export function GameHUD() {
  const playState = usePlayMode((s) => s.playState);
  const showHUD = usePlayMode((s) => s.showHUD);
  const { score, lives, level, timer, inventory } = usePlayMode((s) => s.gameState);

  if (playState === 'editing' || !showHUD) return null;

  const inventoryItems = Object.entries(inventory);

  const fmt = (s: number) =>
    `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;

  return (
    <div className="pointer-events-none absolute inset-0 z-50">
      {/* Top bar: Score + Level + Timer */}
      <div className="flex items-start justify-between p-4">
        {/* Score */}
        <div className="flex items-center gap-2 rounded-xl bg-black/60 px-4 py-2 backdrop-blur-sm">
          <Trophy className="h-4 w-4 text-amber-400" />
          <span className="font-mono text-lg font-bold text-white">{score.toLocaleString()}</span>
        </div>

        {/* Level + Timer */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-2 backdrop-blur-sm">
            <Layers className="h-3.5 w-3.5 text-indigo-400" />
            <span className="text-sm font-semibold text-indigo-300">Lv.{level}</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-xl bg-black/60 px-3 py-2 backdrop-blur-sm">
            <Clock className="h-3.5 w-3.5 text-sky-400" />
            <span className="font-mono text-sm text-sky-300">{fmt(timer)}</span>
          </div>
        </div>
      </div>

      {/* Left side: Lives */}
      <div className="absolute left-4 top-16">
        <div className="flex items-center gap-1">
          {Array.from({ length: 3 }).map((_, i) => (
            <Heart
              key={i}
              className={`h-5 w-5 transition-all duration-300 ${
                i < lives
                  ? 'fill-red-500 text-red-500 drop-shadow-[0_0_6px_rgba(239,68,68,0.5)]'
                  : 'text-gray-600/40'
              }`}
            />
          ))}
          {lives > 3 && <span className="ml-1 text-xs font-bold text-red-400">+{lives - 3}</span>}
        </div>
      </div>

      {/* Bottom right: Inventory */}
      {inventoryItems.length > 0 && (
        <div className="absolute bottom-20 right-4">
          <div className="flex flex-col gap-1 rounded-xl bg-black/60 p-3 backdrop-blur-sm">
            <div className="mb-1 flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
              <Package className="h-3 w-3" />
              Inventory
            </div>
            {inventoryItems.map(([item, count]) => (
              <div key={item} className="flex items-center justify-between gap-3 text-sm">
                <span className="text-gray-300">{item}</span>
                <span className="font-mono text-xs text-amber-400">×{count}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
