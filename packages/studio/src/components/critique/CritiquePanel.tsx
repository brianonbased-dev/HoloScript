'use client';

/**
 * CritiquePanel — AI scene quality analyser with structured findings.
 */

import { Bot, X, Zap, AlertTriangle, Info, CheckCircle2, Copy, RefreshCw } from 'lucide-react';
import { useSceneCritique } from '@/hooks/useSceneCritique';
import type { CritiqueFinding } from '@/app/api/critique/route';

const CATEGORY_LABELS: Record<string, string> = {
  performance: 'Performance', naming: 'Naming', 'missing-trait': 'Missing Trait',
  structure: 'Structure', 'best-practice': 'Best Practice',
};
const CATEGORY_COLORS: Record<string, string> = {
  performance: '#ff6644', naming: '#ffcc44', 'missing-trait': '#aa66ff',
  structure: '#44aaff', 'best-practice': '#44cc88',
};
const SEVERITY_ICON: Record<string, React.FC<{ className?: string }>> = {
  error: AlertTriangle, warning: AlertTriangle, tip: Info,
};
const SEVERITY_COLOR: Record<string, string> = {
  error: 'text-red-400', warning: 'text-yellow-400', tip: 'text-blue-400',
};

function ScoreRing({ score }: { score: number }) {
  const r = 28, circ = 2 * Math.PI * r;
  const progress = (score / 100) * circ;
  const color = score >= 80 ? '#44cc88' : score >= 60 ? '#ffcc44' : '#ff6644';
  return (
    <svg width={72} height={72} className="shrink-0">
      <circle cx={36} cy={36} r={r} fill="none" stroke="#1a1a2e" strokeWidth={6} />
      <circle cx={36} cy={36} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${progress} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 36 36)" />
      <text x="50%" y="50%" dominantBaseline="middle" textAnchor="middle" fill={color}
        fontSize={13} fontWeight="bold">{score}</text>
    </svg>
  );
}

function FindingCard({ f }: { f: CritiqueFinding }) {
  const Icon = SEVERITY_ICON[f.severity] ?? Info;
  const color = SEVERITY_COLOR[f.severity] ?? 'text-studio-muted';
  const catColor = CATEGORY_COLORS[f.category] ?? '#888';

  const copySnippet = async () => {
    if (f.snippet) await navigator.clipboard.writeText(f.snippet);
  };

  return (
    <div className="rounded-xl border border-studio-border bg-studio-surface/50 overflow-hidden">
      {/* Top accent */}
      <div className="h-0.5" style={{ backgroundColor: catColor }} />
      <div className="p-2.5 space-y-1.5">
        <div className="flex items-start gap-2">
          <Icon className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${color}`} />
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-semibold leading-tight">{f.title}</p>
            {f.line && <p className="text-[7px] text-studio-muted/60">Line {f.line}</p>}
          </div>
          <span className="shrink-0 rounded-full px-1.5 py-0.5 text-[7px]"
            style={{ backgroundColor: `${catColor}22`, color: catColor }}>
            {CATEGORY_LABELS[f.category] ?? f.category}
          </span>
        </div>
        <p className="text-[8px] text-studio-muted leading-relaxed">{f.detail}</p>
        <div className="rounded-lg bg-studio-panel/60 p-2">
          <p className="text-[8px] font-medium text-studio-text/80">💡 {f.suggestion}</p>
        </div>
        {f.snippet && (
          <div className="rounded-lg bg-[#080810] p-1.5 flex items-start gap-1.5">
            <pre className="flex-1 text-[7.5px] text-green-300/80 overflow-x-auto leading-relaxed">{f.snippet}</pre>
            <button onClick={copySnippet} className="shrink-0 text-studio-muted hover:text-studio-text">
              <Copy className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

interface CritiquePanelProps { onClose: () => void; }

export function CritiquePanel({ onClose }: CritiquePanelProps) {
  const { result, loading, error, analyse, isStale } = useSceneCritique();

  return (
    <div className="flex h-full flex-col bg-studio-panel text-studio-text">
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Bot className="h-4 w-4 text-studio-accent" />
        <span className="text-[12px] font-semibold">Scene Critique</span>
        {isStale && (
          <span className="rounded-full bg-yellow-600/20 px-1.5 py-0.5 text-[7px] text-yellow-400">Stale</span>
        )}
        <button onClick={onClose} className="ml-auto rounded p-1 text-studio-muted hover:text-studio-text">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Analyse button */}
      <div className="shrink-0 border-b border-studio-border p-2.5">
        <button onClick={analyse} disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-studio-accent py-2.5 text-[11px] font-semibold text-white hover:brightness-110 transition disabled:animate-pulse">
          {loading ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Zap className="h-4 w-4" />}
          {loading ? 'Analysing…' : 'Analyse Scene'}
        </button>
        {error && <p className="mt-1.5 text-center text-[8px] text-red-400">{error}</p>}
      </div>

      {/* Results */}
      {result && (
        <div className="flex-1 overflow-y-auto">
          {/* Score overview */}
          <div className="flex items-center gap-4 border-b border-studio-border p-3">
            <ScoreRing score={result.score} />
            <div className="flex-1 space-y-1">
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-bold">{result.grade}</span>
                <span className="text-[9px] text-studio-muted">/ 100 pts</span>
              </div>
              <p className="text-[8px] text-studio-muted leading-snug">{result.summary}</p>
              <div className="flex gap-2 mt-1">
                <span className="text-[7px] text-studio-muted">{result.objectCount} objects</span>
                <span className="text-[7px] text-studio-muted">
                  {Math.round(result.traitCoverage * 100)}% trait coverage
                </span>
              </div>
            </div>
          </div>

          {/* Severity summary bar */}
          {result.findings.length > 0 && (
            <div className="flex border-b border-studio-border">
              {(['error', 'warning', 'tip'] as const).map((sev) => {
                const n = result.findings.filter((f) => f.severity === sev).length;
                if (n === 0) return null;
                return (
                  <div key={sev} className={`flex-1 flex items-center justify-center gap-1 py-1.5 text-[8px] ${SEVERITY_COLOR[sev]}`}>
                    {sev === 'tip' ? <Info className="h-3 w-3" /> : <AlertTriangle className="h-3 w-3" />}
                    {n} {sev}
                  </div>
                );
              })}
            </div>
          )}

          {/* Findings */}
          <div className="space-y-2 p-2.5">
            {result.findings.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-6">
                <CheckCircle2 className="h-8 w-8 text-green-400" />
                <p className="text-[10px] text-green-400 font-semibold">Perfect score!</p>
              </div>
            )}
            {result.findings.map((f) => <FindingCard key={f.id} f={f} />)}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!result && !loading && (
        <div className="flex-1 flex items-center justify-center">
          <p className="text-[9px] text-studio-muted text-center px-6">
            Click "Analyse Scene" to get quality feedback on your HoloScript code.
          </p>
        </div>
      )}
    </div>
  );
}
