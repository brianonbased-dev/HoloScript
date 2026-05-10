'use client';

import { useState, useCallback, useEffect } from 'react';
import { BookOpen, Check, FlaskConical, Loader2, Lock, ScrollText, Sparkles } from 'lucide-react';
import type { PaperUnlockState, PublishWorthinessSummary } from '@/lib/stores/workspaceStore';

interface ResearchLanePromptProps {
  workspaceId: string;
  localPath: string;
  publishWorthiness?: PublishWorthinessSummary | null;
  paperUnlockState?: PaperUnlockState | null;
  teamId?: string;
  onOptIn?: (workspaceId: string, state: PaperUnlockState) => void;
}

export function ResearchLanePrompt({
  workspaceId,
  localPath,
  publishWorthiness,
  paperUnlockState,
  teamId,
  onOptIn,
}: ResearchLanePromptProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optedIn, setOptedIn] = useState(paperUnlockState?.status === 'opted-in');

  const pw = publishWorthiness;
  const eligible = pw?.hiddenPaperProgramUnlocked === true && !optedIn;

  useEffect(() => {
    setOptedIn(paperUnlockState?.status === 'opted-in');
  }, [paperUnlockState?.status, workspaceId]);

  const handleOptIn = useCallback(async () => {
    if (!localPath) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/workspace/paper-opt-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          workspaceId,
          localPath,
          teamId: teamId || undefined,
          createBoardTasks: Boolean(teamId?.trim()),
          syncPublicKnowledge: false,
          preparePublication: false,
        }),
      });
      const data = (await res.json()) as {
        success?: boolean;
        paperUnlockState?: PaperUnlockState;
        error?: string;
      };
      if (!res.ok || data.error) {
        throw new Error(data.error || `Request failed (${res.status})`);
      }
      setOptedIn(true);
      if (data.paperUnlockState && onOptIn) {
        onOptIn(workspaceId, data.paperUnlockState);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId, localPath, teamId, onOptIn]);

  if (!pw) return null;

  if (optedIn || paperUnlockState?.status === 'opted-in') {
    return (
      <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-medium text-emerald-300">
          <Sparkles className="h-4 w-4" />
          Research lane active
        </div>
        <p className="mt-1 text-xs text-slate-400">
          Paper cell, D.011 checklist, and evidence references are available in the workspace
          {' '}
          <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-300">research/</code>
          {' '}directory.
        </p>
      </div>
    );
  }

  if (!eligible) return null;

  return (
    <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-sm font-medium text-amber-300">
            <FlaskConical className="h-4 w-4" />
            Research lane available
          </div>
          <p className="mt-1 text-xs text-slate-400">
            This workspace scored{' '}
            <span className="font-mono text-amber-200">{pw.finalScore.toFixed(1)}</span>
            /{pw.threshold} on publish-worthiness. Opt in to unlock the paper-program research
            packet (D.011 checklist, evidence tracking, local memory, and scoped board tasks when a
            team is connected).
          </p>
          {pw.requiredGateFailures.length > 0 && (
            <div className="mt-2 space-y-1">
              {pw.requiredGateFailures.map((failure) => (
                <div
                  key={failure}
                  className="flex items-center gap-1.5 text-[11px] text-slate-500"
                >
                  <Lock className="h-3 w-3 text-slate-600" />
                  {failure}
                </div>
              ))}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => void handleOptIn()}
          disabled={loading}
          className="shrink-0 inline-flex h-8 items-center gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 text-xs font-medium text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Unlocking...
            </>
          ) : (
            <>
              <BookOpen className="h-3.5 w-3.5" />
              Opt in
            </>
          )}
        </button>
      </div>
      {error && (
        <div className="mt-2 rounded-md border border-rose-500/20 bg-rose-500/10 px-3 py-1.5 text-[11px] text-rose-300">
          {error}
        </div>
      )}
    </div>
  );
}

export function ResearchLaneArtifacts({
  paperUnlockState,
}: {
  paperUnlockState?: PaperUnlockState | null;
}) {
  const optedIn = paperUnlockState?.status === 'opted-in';
  if (!optedIn) return null;

  return (
    <div className="rounded-lg border border-slate-800 bg-slate-900/60 p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs font-medium text-slate-200">
        <ScrollText className="h-4 w-4 text-emerald-300" />
        Research artifacts
      </div>
      <div className="grid gap-1.5">
        {[
          { name: 'paper-cell.json', desc: 'Paper metadata + milestones' },
          { name: 'd011-checklist.json', desc: 'D.011 feasibility gates' },
          { name: 'evidence-refs.json', desc: 'Evidence path tracker' },
          { name: 'memory/research-packet.json', desc: 'Workspace-local memory entry' },
        ].map((item) => (
          <div
            key={item.name}
            className="flex items-center justify-between gap-2 rounded-md border border-slate-800 bg-slate-950 px-2.5 py-1.5"
          >
            <span className="text-xs text-slate-300">{item.name}</span>
            <span className="text-[10px] text-slate-500">{item.desc}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 text-[10px] text-emerald-400">
        <Check className="h-3 w-3" />
        Created in workspace
        {' '}
        <code className="rounded bg-slate-800 px-1 py-0.5 text-slate-300">research/</code>
      </div>
    </div>
  );
}
