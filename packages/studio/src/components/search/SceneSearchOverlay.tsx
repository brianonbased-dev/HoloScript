'use client';

/**
 * SceneSearchOverlay — Cmd+F scene object search popup.
 * Press Escape or click outside to close.
 */

import { useEffect, useRef } from 'react';
import { Search, X, Box, Lightbulb, Layers } from 'lucide-react';
import { useSceneSearch, type SceneSearchResult } from '@/hooks/useSceneSearch';

const TYPE_ICON: Record<SceneSearchResult['type'], React.ReactNode> = {
  object: <Box className="h-3 w-3 text-blue-400" />,
  light:  <Lightbulb className="h-3 w-3 text-yellow-400" />,
  scene:  <Layers className="h-3 w-3 text-purple-400" />,
};

const TYPE_COLOR: Record<SceneSearchResult['type'], string> = {
  object: 'border-blue-500/30 bg-blue-500/10 text-blue-400',
  light:  'border-yellow-500/30 bg-yellow-500/10 text-yellow-400',
  scene:  'border-purple-500/30 bg-purple-500/10 text-purple-400',
};

interface SceneSearchOverlayProps {
  open: boolean;
  onClose: () => void;
  onJump?: (result: SceneSearchResult) => void;
}

export function SceneSearchOverlay({ open, onClose, onJump }: SceneSearchOverlayProps) {
  const { query, setQuery, results, totalObjects } = useSceneSearch();
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) { setTimeout(() => inputRef.current?.focus(), 50); }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if ((e.metaKey || e.ctrlKey) && e.key === 'f') { e.preventDefault(); open ? onClose() : undefined; }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-16" onClick={onClose}>
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-studio-border bg-[#0d0d1a]/95 shadow-2xl backdrop-blur-xl"
        onClick={(e) => e.stopPropagation()}>
        {/* Search bar */}
        <div className="flex items-center gap-2.5 border-b border-studio-border px-3 py-3">
          <Search className="h-4 w-4 shrink-0 text-studio-accent" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search objects, traits, types…"
            className="flex-1 bg-transparent text-[13px] text-studio-text outline-none placeholder-studio-muted/40"
          />
          <button onClick={onClose} className="text-studio-muted hover:text-studio-text">
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Results count */}
        <div className="border-b border-studio-border/50 px-3 py-1.5">
          <span className="text-[9px] text-studio-muted">
            {results.length} of {totalObjects} objects{query ? ` matching "${query}"` : ''}
          </span>
        </div>

        {/* Results list */}
        <div className="max-h-80 overflow-y-auto">
          {results.length === 0 && (
            <p className="py-8 text-center text-[11px] text-studio-muted">No objects found.</p>
          )}
          {results.map((r, i) => (
            <button key={`${r.name}-${r.line}`}
              onClick={() => { onJump?.(r); onClose(); }}
              className="flex w-full items-start gap-3 border-b border-studio-border/30 px-3 py-2.5 text-left transition hover:bg-studio-surface/60">
              <div className="mt-0.5 shrink-0">{TYPE_ICON[r.type]}</div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-semibold text-studio-text truncate">{r.name}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[7px] font-medium ${TYPE_COLOR[r.type]}`}>
                    {r.type}
                  </span>
                </div>
                {r.traits.length > 0 && (
                  <div className="mt-0.5 flex flex-wrap gap-1">
                    {r.traits.slice(0, 5).map((t) => (
                      <span key={t} className="rounded bg-studio-border/60 px-1 py-0.5 text-[7px] text-studio-muted">@{t}</span>
                    ))}
                  </div>
                )}
              </div>
              <span className="shrink-0 text-[8px] text-studio-muted">L{r.line}</span>
            </button>
          ))}
        </div>

        {/* Keyboard hints */}
        <div className="flex gap-3 border-t border-studio-border/50 px-3 py-1.5 text-[8px] text-studio-muted">
          <span>↵ jump to line</span>
          <span>Esc close</span>
        </div>
      </div>
    </div>
  );
}
