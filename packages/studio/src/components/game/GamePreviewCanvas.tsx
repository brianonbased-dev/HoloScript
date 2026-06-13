'use client';

/**
 * GamePreviewCanvas
 *
 * Center-viewport playable preview for /create?mode=game.
 *
 * Mirrors SimPreviewCanvas/PartPreviewCanvas (isolated, full-bleed center view)
 * but the canvas2d-game output is a self-contained HTML document, so the playable
 * surface is an <iframe srcDoc> rather than an R3F <Canvas>. The compiled game
 * runs its own keydown loop inside the sandboxed frame.
 *
 * sandbox="allow-scripts" — the game runs JS but cannot reach the parent origin,
 * navigate top, or read cookies. srcDoc content has a null origin, so this is a
 * tight sandbox around our own deterministically-compiled output.
 */

import React, { useRef } from 'react';
import { Gamepad2, RefreshCw } from 'lucide-react';
import type { GameBuildResult } from './useGameState';

export interface GamePreviewCanvasProps {
  result: GameBuildResult | null;
  building?: boolean;
}

export function GamePreviewCanvas({ result, building = false }: GamePreviewCanvasProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const html = result?.html ?? null;

  const handleFocus = () => {
    // Click-to-focus so keyboard input reaches the game loop immediately.
    iframeRef.current?.focus();
  };

  return (
    <div className="relative w-full h-full bg-[#06060c]">
      {/* Label */}
      <div className="absolute top-3 left-3 z-10 flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur text-[10px] text-white/40 font-mono">
        Game Preview
        {result && (
          <span className="text-indigo-400/70">{result.report.title}</span>
        )}
      </div>

      {/* Controls hint */}
      {html && (
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-10 rounded-lg border border-white/10 bg-black/40 px-2.5 py-1 backdrop-blur text-[10px] text-white/40 font-mono">
          Click the game, then use ← → / arrows + space
        </div>
      )}

      {!html ? (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
          {building ? (
            <>
              <div className="w-8 h-8 rounded-full border-2 border-white/10 border-t-indigo-400 animate-spin" />
              <div className="flex items-center gap-1.5 text-xs text-white/30">
                <RefreshCw className="h-3 w-3 animate-spin" aria-hidden="true" />
                Compiling your game…
              </div>
            </>
          ) : (
            <>
              <Gamepad2 className="h-10 w-10 text-white/10" aria-hidden="true" />
              <div className="text-xs text-white/30">Build a game to play it here…</div>
            </>
          )}
        </div>
      ) : (
        <iframe
          ref={iframeRef}
          title="Playable HoloScript 2D game preview"
          srcDoc={html}
          sandbox="allow-scripts"
          onLoad={handleFocus}
          onClick={handleFocus}
          className="absolute inset-0 w-full h-full border-0"
          style={{ background: '#06060c' }}
        />
      )}
    </div>
  );
}
