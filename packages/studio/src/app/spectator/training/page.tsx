'use client';

/**
 * /spectator/training — Real-time training progress spectator.
 *
 * Connects to /api/training/stream?jobId=<jobId> via SSE and renders
 * INeuralTrainingProgressPacket-shaped events as a live dashboard.
 *
 * Features:
 * - Stage timeline with animated transitions
 * - Overall + per-stage progress bars
 * - Live metrics panel (PSNR/SSIM/LPIPS, Gaussian count, GPU, cost)
 * - ETA countdown
 * - Late-join replay via SSE history on connection
 * - Terminal state handling (complete / error)
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Loader2,
  CheckCircle2,
  AlertTriangle,
  Timer,
  Cpu,
  DollarSign,
  Activity,
  BarChart3,
} from 'lucide-react';

interface TrainingProgressPacket {
  jobId: string;
  stage: string;
  previousStage?: string;
  overallProgress: number;
  stageProgress: number;
  message?: string;
  estimatedTimeRemainingMs?: number;
  trainingMetrics?: Record<string, unknown>;
  actualCost?: number;
  timestamp: number;
  terminal?: 'complete' | 'error';
  error?: { stage: string; message: string; code: string; retryable: boolean };
}

const STAGES = [
  'idle',
  'uploading',
  'training',
  'baking',
  'compressing',
  'downloading',
  'complete',
  'failed',
] as const;

function stageIndex(stage: string): number {
  return STAGES.indexOf(stage as (typeof STAGES)[number]);
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const seconds = Math.floor(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs > 0) return `${hrs}h ${mins % 60}m`;
  if (mins > 0) return `${mins}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function useTrainingStream(jobId: string) {
  const [packet, setPacket] = useState<TrainingProgressPacket | null>(null);
  const [history, setHistory] = useState<TrainingProgressPacket[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => {
    const url = `/api/training/stream?jobId=${encodeURIComponent(jobId)}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setConnected(true);
      setError(null);
    };

    es.onmessage = (ev) => {
      if (!ev.data || ev.data.startsWith(':')) return;
      try {
        const p = JSON.parse(ev.data) as TrainingProgressPacket;
        setPacket(p);
        setHistory((prev) => {
          const next = [...prev, p];
          return next.length > 256 ? next.slice(-256) : next;
        });
        if (p.terminal) {
          es.close();
        }
      } catch (e) {
        console.warn('Invalid SSE packet:', ev.data, e);
      }
    };

    es.onerror = () => {
      setConnected(false);
      setError('Stream disconnected. Reconnecting…');
    };

    return () => {
      es.close();
    };
  }, [jobId]);

  return { packet, history, connected, error };
}

export default function TrainingSpectatorPage() {
  const searchParams = useSearchParams();
  const jobId = searchParams.get('jobId') ?? 'demo-job-001';
  const { packet, connected, error } = useTrainingStream(jobId);

  const overallPct = packet?.overallProgress ?? 0;
  const stagePct = packet?.stageProgress ?? 0;
  const currentStage = packet?.stage ?? 'idle';
  const isTerminal = packet?.terminal != null;
  const isError = packet?.terminal === 'error';
  const isComplete = packet?.terminal === 'complete';

  const metrics = useMemo(() => {
    const m = packet?.trainingMetrics ?? {};
    const entries: { label: string; value: string }[] = [];
    if (m.psnr != null) entries.push({ label: 'PSNR', value: `${Number(m.psnr).toFixed(2)} dB` });
    if (m.ssim != null) entries.push({ label: 'SSIM', value: `${Number(m.ssim).toFixed(4)}` });
    if (m.lpips != null) entries.push({ label: 'LPIPS', value: `${Number(m.lpips).toFixed(4)}` });
    if (m.gaussianCount != null)
      entries.push({ label: 'Gaussians', value: `${Number(m.gaussianCount).toLocaleString()}` });
    if (m.gpu != null) entries.push({ label: 'GPU', value: String(m.gpu) });
    return entries;
  }, [packet]);

  return (
    <div className="flex min-h-screen flex-col bg-[#0a0a12] text-slate-200">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-6 w-6 text-indigo-400" />
          <h1 className="text-lg font-semibold tracking-tight">Training Spectator</h1>
        </div>
        <div className="flex items-center gap-4 text-sm text-slate-400">
          <span className="font-mono">{jobId}</span>
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${
              isError
                ? 'bg-red-950 text-red-400'
                : isComplete
                  ? 'bg-emerald-950 text-emerald-400'
                  : connected
                    ? 'bg-indigo-950 text-indigo-400'
                    : 'bg-slate-800 text-slate-400'
            }`}
          >
            {isError ? (
              <>
                <AlertTriangle className="h-3.5 w-3.5" /> Error
              </>
            ) : isComplete ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5" /> Complete
              </>
            ) : connected ? (
              <>
                <Activity className="h-3.5 w-3.5 animate-pulse" /> Live
              </>
            ) : (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Connecting
              </>
            )}
          </span>
        </div>
      </header>

      <main className="flex flex-1 flex-col gap-6 px-6 py-6">
        {/* Stage timeline */}
        <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
          <h2 className="mb-4 text-sm font-medium uppercase tracking-wide text-slate-400">Pipeline Stage</h2>
          <div className="relative flex items-center justify-between">
            {STAGES.filter((s) => s !== 'failed').map((stage, i) => {
              const idx = stageIndex(currentStage);
              const active = i === idx;
              const completed = i < idx;
              return (
                <div key={stage} className="flex flex-1 flex-col items-center gap-2">
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      active
                        ? 'bg-indigo-500 text-white'
                        : completed
                          ? 'bg-emerald-900 text-emerald-400'
                          : 'bg-slate-800 text-slate-500'
                    }`}
                  >
                    {completed ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                  </div>
                  <span
                    className={`text-xs capitalize ${
                      active ? 'text-indigo-300' : completed ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {stage}
                  </span>
                  {i < STAGES.length - 2 && (
                    <div
                      className={`absolute top-4 hidden h-0.5 md:block ${
                        completed ? 'bg-emerald-900' : 'bg-slate-800'
                      }`}
                      style={{
                        left: `calc(${(i / (STAGES.length - 2)) * 100}% + 2rem)`,
                        width: `calc(${100 / (STAGES.length - 2)}% - 4rem)`,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Progress bars */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">Overall Progress</span>
              <span className="font-mono text-sm text-slate-400">{overallPct.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-indigo-500 transition-all duration-500"
                style={{ width: `${overallPct}%` }}
              />
            </div>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-300">Stage: {currentStage}</span>
              <span className="font-mono text-sm text-slate-400">{stagePct.toFixed(1)}%</span>
            </div>
            <div className="h-3 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-500 transition-all duration-500"
                style={{ width: `${stagePct}%` }}
              />
            </div>
          </div>
        </section>

        {/* Status + ETA + Cost */}
        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-400">
              <Activity className="h-4 w-4" /> Status
            </div>
            <p className="text-lg font-medium text-slate-200">{packet?.message ?? 'Waiting for first packet…'}</p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-400">
              <Timer className="h-4 w-4" /> Estimated Remaining
            </div>
            <p className="text-lg font-medium text-slate-200">
              {packet?.estimatedTimeRemainingMs != null
                ? formatDuration(packet.estimatedTimeRemainingMs)
                : '—'}
            </p>
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-1 flex items-center gap-2 text-sm text-slate-400">
              <DollarSign className="h-4 w-4" /> Cost
            </div>
            <p className="text-lg font-medium text-slate-200">
              {packet?.actualCost != null ? `${packet.actualCost.toFixed(4)} RENDER` : '—'}
            </p>
          </div>
        </section>

        {/* Metrics */}
        {metrics.length > 0 && (
          <section className="rounded-xl border border-slate-800 bg-slate-900/50 p-5">
            <div className="mb-3 flex items-center gap-2 text-sm font-medium uppercase tracking-wide text-slate-400">
              <Cpu className="h-4 w-4" /> Training Metrics
            </div>
            <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
              {metrics.map((m) => (
                <div key={m.label} className="rounded-lg bg-slate-800/50 p-3">
                  <div className="text-xs text-slate-500">{m.label}</div>
                  <div className="mt-1 font-mono text-sm font-semibold text-slate-200">{m.value}</div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Error state */}
        {isError && packet?.error && (
          <section className="rounded-xl border border-red-900/50 bg-red-950/20 p-5">
            <div className="flex items-center gap-2 text-red-400">
              <AlertTriangle className="h-5 w-5" />
              <span className="font-semibold">Pipeline Error</span>
            </div>
            <div className="mt-2 text-sm text-red-300">
              <p>Stage: {packet.error.stage}</p>
              <p>Code: {packet.error.code}</p>
              <p>{packet.error.message}</p>
              <p className="mt-1 text-xs text-red-400">
                {packet.error.retryable ? 'Retryable' : 'Non-retryable'}
              </p>
            </div>
          </section>
        )}

        {/* Footer / stream status */}
        <footer className="mt-auto text-center text-xs text-slate-600">
          {error ? (
            <span className="text-amber-500">{error}</span>
          ) : connected ? (
            <span>Streaming live via SSE — {isTerminal ? 'stream ended' : 'connected'}</span>
          ) : (
            <span>Waiting for connection…</span>
          )}
        </footer>
      </main>
    </div>
  );
}
