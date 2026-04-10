'use client';

import { AlertCircle, Shield, Zap } from 'lucide-react';
import type { ProjectDNA } from '@/lib/stores/workspaceStore';
import { KIND_META } from './importWizardConstants';

interface AbsorbStats {
  totalFiles: number;
  totalSymbols: number;
  totalLoc: number;
  durationMs: number;
}

interface Step3ProjectDNAProps {
  dna: ProjectDNA | null;
  absorbStats: AbsorbStats | null;
}

export function Step3ProjectDNA({ dna, absorbStats }: Step3ProjectDNAProps) {
  if (!dna) return null;

  return (
    <div className="flex flex-col gap-4">
      {/* Kind badge */}
      <div className="flex items-center gap-3 rounded-xl border border-blue-500/30 bg-blue-500/5 p-4">
        <span className="text-3xl">{KIND_META[dna.kind]?.emoji ?? '❓'}</span>
        <div>
          <p className={`text-sm font-semibold ${KIND_META[dna.kind]?.color ?? 'text-studio-text'}`}>
            {KIND_META[dna.kind]?.label ?? dna.kind}
          </p>
          <p className="text-[11px] text-studio-muted">
            {Math.round(dna.confidence * 100)}% confidence
            {dna.repoShape !== 'unknown' && ` · ${dna.repoShape}`}
          </p>
        </div>
      </div>

      {/* Stats */}
      {absorbStats && (
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border border-studio-border bg-black/20 p-2.5 text-center">
            <p className="text-lg font-bold text-studio-text">
              {absorbStats.totalFiles.toLocaleString()}
            </p>
            <p className="text-[10px] text-studio-muted">Files</p>
          </div>
          <div className="rounded-lg border border-studio-border bg-black/20 p-2.5 text-center">
            <p className="text-lg font-bold text-studio-text">
              {absorbStats.totalSymbols.toLocaleString()}
            </p>
            <p className="text-[10px] text-studio-muted">Symbols</p>
          </div>
          <div className="rounded-lg border border-studio-border bg-black/20 p-2.5 text-center">
            <p className="text-lg font-bold text-studio-text">
              {absorbStats.totalLoc.toLocaleString()}
            </p>
            <p className="text-[10px] text-studio-muted">Lines</p>
          </div>
        </div>
      )}

      {/* Languages + frameworks */}
      <div className="flex flex-col gap-2">
        {dna.languages.length > 0 && (
          <div>
            <p className="text-xs font-medium text-studio-text mb-1">Languages</p>
            <div className="flex flex-wrap gap-1.5">
              {dna.languages.slice(0, 8).map((lang) => (
                <span
                  key={lang}
                  className="rounded-md bg-white/5 border border-studio-border px-2 py-0.5 text-[10px] text-studio-muted"
                >
                  {lang}
                </span>
              ))}
            </div>
          </div>
        )}
        {dna.frameworks.length > 0 && (
          <div>
            <p className="text-xs font-medium text-studio-text mb-1">Frameworks</p>
            <div className="flex flex-wrap gap-1.5">
              {dna.frameworks.map((fw) => (
                <span
                  key={fw}
                  className="rounded-md bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 text-[10px] text-blue-400"
                >
                  {fw}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Strengths + risks */}
      <div className="grid grid-cols-2 gap-2">
        {dna.strengths.length > 0 && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-2.5">
            <p className="text-[10px] font-medium text-emerald-400 mb-1 flex items-center gap-1">
              <Shield className="h-3 w-3" /> Strengths
            </p>
            {dna.strengths.map((s) => (
              <p key={s} className="text-[10px] text-studio-muted">
                {s}
              </p>
            ))}
          </div>
        )}
        {dna.riskSignals.length > 0 && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-2.5">
            <p className="text-[10px] font-medium text-amber-400 mb-1 flex items-center gap-1">
              <AlertCircle className="h-3 w-3" /> Risks
            </p>
            {dna.riskSignals.map((r) => (
              <p key={r} className="text-[10px] text-studio-muted">
                {r}
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Recommended daemon */}
      <div className="flex items-center gap-2 rounded-lg border border-studio-border bg-black/20 p-3">
        <Zap className="h-4 w-4 text-amber-400 shrink-0" />
        <div>
          <p className="text-xs font-medium text-studio-text">
            Recommended: <span className="text-blue-400">{dna.recommendedProfile}</span> daemon
          </p>
          <p className="text-[10px] text-studio-muted">
            Mode: {dna.recommendedMode} · Based on project DNA analysis
          </p>
        </div>
      </div>
    </div>
  );
}
