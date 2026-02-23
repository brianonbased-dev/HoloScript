'use client';

/**
 * SceneCritiquePanel — AI-powered scene analysis sidebar.
 *
 * Uses useSceneCritique hook to call /api/critique (Ollama),
 * renders 5 actionable suggestions with copy-to-Brittney button.
 */

import { Lightbulb, Loader2, RefreshCw, X, Send, ArrowRight } from 'lucide-react';
import { useSceneCritique } from '@/hooks/useSceneCritique';

interface SceneCritiquePanelProps {
  onClose: () => void;
  /** Optional: callback to forward a suggestion to Brittney Chat */
  onSendToBrittney?: (text: string) => void;
}

export function SceneCritiquePanel({ onClose, onSendToBrittney }: SceneCritiquePanelProps) {
  const { status, result, analyze, reset } = useSceneCritique();

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Lightbulb className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Scene Critique</span>
        <span className="ml-1 rounded-full bg-studio-accent/15 px-1.5 py-0.5 text-[9px] text-studio-accent">
          AI
        </span>
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-y-auto p-3">
        {status === 'idle' && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Lightbulb className="h-10 w-10 text-studio-muted/30" />
            <p className="text-xs text-studio-muted">
              Brittney will analyze your scene and return 5 actionable improvement tips.
            </p>
            <button
              onClick={analyze}
              className="flex items-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              <Lightbulb className="h-4 w-4" />
              Analyze Scene
            </button>
          </div>
        )}

        {status === 'analyzing' && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-studio-accent" />
            <p className="text-xs text-studio-muted">Brittney is reading your scene…</p>
            <div className="flex gap-1">
              {[0, 150, 300].map((d) => (
                <div
                  key={d}
                  className="h-1.5 w-1.5 animate-bounce rounded-full bg-studio-accent"
                  style={{ animationDelay: `${d}ms` }}
                />
              ))}
            </div>
          </div>
        )}

        {status === 'error' && result?.error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-center">
            <p className="mb-3 text-xs text-red-400">{result.error}</p>
            <button
              onClick={reset}
              className="flex items-center gap-1 mx-auto text-[11px] text-studio-muted hover:text-studio-text"
            >
              <RefreshCw className="h-3 w-3" /> Try again
            </button>
          </div>
        )}

        {status === 'done' && result && (
          <div className="space-y-2.5">
            <p className="text-[10px] uppercase tracking-widest text-studio-muted">
              {result.suggestions.length} suggestions
            </p>

            {result.suggestions.map((tip, i) => (
              <div
                key={i}
                className="group flex gap-2.5 rounded-xl border border-studio-border bg-studio-surface p-3 transition hover:border-studio-accent/30"
              >
                {/* Number badge */}
                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-studio-accent/20 text-[9px] font-bold text-studio-accent">
                  {i + 1}
                </div>
                <p className="flex-1 text-[11px] leading-relaxed text-studio-text">{tip}</p>

                {/* Send to Brittney */}
                {onSendToBrittney && (
                  <button
                    onClick={() => onSendToBrittney(tip)}
                    title="Send to Brittney"
                    className="shrink-0 opacity-0 group-hover:opacity-100 transition rounded p-1 text-studio-muted hover:text-studio-accent"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}

            {/* Re-analyze */}
            <button
              onClick={analyze}
              className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-studio-border py-2 text-[11px] text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-analyze scene
            </button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {status === 'idle' && (
        <div className="shrink-0 border-t border-studio-border px-3 py-2 text-[10px] text-studio-muted">
          <ArrowRight className="mr-1 inline h-3 w-3" />
          Click a suggestion to send it directly to Brittney Chat
        </div>
      )}
    </div>
  );
}
