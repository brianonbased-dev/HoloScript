'use client';

/**
 * SceneCritiquePanel — AI-powered scene analysis sidebar.
 *
 * Uses useSceneCritique hook to call /api/critique,
 * renders findings with severity badges + fix suggestions.
 * Updated for Sprint V hook API: { result, loading, error, analyse, isStale }
 */

import {
  Lightbulb,
  Loader2,
  RefreshCw,
  X,
  Send,
  ArrowRight,
  AlertTriangle,
  Info,
  Wrench,
} from 'lucide-react';
import { useSceneCritique } from '@/hooks/useSceneCritique';

interface SceneCritiquePanelProps {
  onClose: () => void;
  onSendToBrittney?: (text: string) => void;
}

export function SceneCritiquePanel({ onClose, onSendToBrittney }: SceneCritiquePanelProps) {
  const { result, loading, error, analyse, isStale } = useSceneCritique();

  const isIdle = !loading && !result && !error;
  const isDone = !loading && result != null;

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Lightbulb className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Scene Critique</span>
        <span className="ml-1 rounded-full bg-studio-accent/15 px-1.5 py-0.5 text-[9px] text-studio-accent">
          AI
        </span>
        {isStale && (
          <span className="rounded-full bg-yellow-600/20 px-1.5 py-0.5 text-[7px] text-yellow-400">
            stale
          </span>
        )}
        <button
          onClick={onClose}
          className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Body */}
      <div className="flex flex-1 flex-col overflow-y-auto p-3">
        {/* Idle */}
        {isIdle && (
          <div className="flex flex-col items-center gap-4 py-8 text-center">
            <Lightbulb className="h-10 w-10 text-studio-muted/30" />
            <p className="text-xs text-studio-muted">
              Analyse your scene and get actionable improvement tips.
            </p>
            <button
              onClick={analyse}
              className="flex items-center gap-2 rounded-lg bg-studio-accent px-4 py-2 text-sm font-semibold text-white transition hover:brightness-110"
            >
              <Lightbulb className="h-4 w-4" />
              Analyze Scene
            </button>
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center gap-3 py-8 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-studio-accent" />
            <p className="text-xs text-studio-muted">Analyzing your scene…</p>
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

        {/* Error */}
        {error && (
          <div className="rounded-xl border border-red-500/20 bg-red-500/10 p-4 text-center">
            <p className="mb-3 text-xs text-red-400">{error}</p>
            <button
              onClick={analyse}
              className="flex items-center gap-1 mx-auto text-[11px] text-studio-muted hover:text-studio-text"
            >
              <RefreshCw className="h-3 w-3" /> Try again
            </button>
          </div>
        )}

        {/* Results */}
        {isDone && result && (
          <div className="space-y-2.5">
            {/* Score summary */}
            <div className="flex items-center gap-3 rounded-xl border border-studio-border bg-studio-surface p-3">
              <div
                className="flex h-10 w-10 items-center justify-center rounded-full"
                style={{
                  backgroundColor:
                    result.score >= 80
                      ? '#16a34a22'
                      : result.score >= 60
                        ? '#d9770622'
                        : '#dc262622',
                }}
              >
                <span
                  className="text-base font-bold"
                  style={{
                    color:
                      result.score >= 80 ? '#4ade80' : result.score >= 60 ? '#fb923c' : '#f87171',
                  }}
                >
                  {result.grade}
                </span>
              </div>
              <div>
                <p className="text-[10px] font-semibold">{result.summary}</p>
                <p className="text-[8px] text-studio-muted">
                  Score {result.score}/100 · {result.objectCount} objects ·{' '}
                  {Math.round(result.traitCoverage * 100)}% trait coverage
                </p>
              </div>
            </div>

            <p className="text-[9px] uppercase tracking-widest text-studio-muted">
              {result.findings.length} findings
            </p>

            {result.findings.map((finding, i) => {
              const Icon =
                finding.severity === 'error'
                  ? AlertTriangle
                  : finding.severity === 'warning'
                    ? Wrench
                    : Info;
              const col =
                finding.severity === 'error'
                  ? '#f87171'
                  : finding.severity === 'warning'
                    ? '#fb923c'
                    : '#60a5fa';
              return (
                <div
                  key={i}
                  className="group flex gap-2.5 rounded-xl border border-studio-border bg-studio-surface p-3 transition hover:border-studio-accent/30"
                >
                  <Icon className="h-3.5 w-3.5 shrink-0 mt-0.5" style={{ color: col }} />
                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-medium">{finding.detail}</p>
                    {finding.suggestion && (
                      <p className="mt-0.5 text-[8px] text-studio-muted italic">
                        {finding.suggestion}
                      </p>
                    )}
                  </div>
                  {onSendToBrittney && finding.suggestion && (
                    <button
                      onClick={() => onSendToBrittney(finding.suggestion!)}
                      title="Send to Brittney"
                      className="shrink-0 opacity-0 group-hover:opacity-100 transition rounded p-1 text-studio-muted hover:text-studio-accent"
                    >
                      <Send className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              );
            })}

            {/* Re-analyze */}
            <button
              onClick={analyse}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-studio-border py-2 text-[11px] text-studio-muted transition hover:bg-studio-surface hover:text-studio-text"
            >
              <RefreshCw className="h-3.5 w-3.5" /> Re-analyze scene
            </button>
          </div>
        )}
      </div>

      {/* Footer hint */}
      {isIdle && (
        <div className="shrink-0 border-t border-studio-border px-3 py-2 text-[10px] text-studio-muted">
          <ArrowRight className="mr-1 inline h-3 w-3" />
          Send a finding to Brittney Chat for instant fixes
        </div>
      )}
    </div>
  );
}
