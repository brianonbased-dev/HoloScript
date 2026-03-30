'use client';

import { useEffect, useState } from 'react';
import { useDaemonJobs, type OperationsSurfaceResponse } from '@/hooks/useDaemonJobs';
import { useScenePipeline } from '@/hooks/useScenePipeline';
import { SceneRenderer } from '@/components/scene/SceneRenderer';

interface OperationsSurfacePanelProps {
  onClose: () => void;
}

export function OperationsSurfacePanel({ onClose }: OperationsSurfacePanelProps) {
  const { getOperationsSurface } = useDaemonJobs();
  const [data, setData] = useState<OperationsSurfaceResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kind, setKind] = useState<OperationsSurfaceResponse['kind']>('dashboard');

  const previewCode = data?.kind === 'dashboard' && data.validation.valid ? data.code : '';
  const { r3fTree, errors: previewErrors } = useScenePipeline(previewCode, {
    formatHint: 'hsplus',
  });

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await getOperationsSurface(kind);
        if (mounted) setData(result);
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => {
      mounted = false;
    };
  }, [getOperationsSurface, kind]);

  return (
    <div className="fixed inset-0 z-[65] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-7xl rounded-xl border border-studio-border bg-studio-panel p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-studio-text">2D Operations Surface</h2>
            <p className="text-xs text-studio-muted">
              Loaded from native `.hsplus` compositions and hydrated with live Studio daemon state.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as OperationsSurfaceResponse['kind'])}
              className="rounded-md border border-studio-border bg-studio-surface px-2 py-1 text-xs text-studio-text"
              title="Select native Studio surface"
            >
              <option value="dashboard">Dashboard</option>
              <option value="orchestration">Orchestration</option>
            </select>
            <button
              onClick={onClose}
              className="rounded-md bg-studio-surface px-3 py-1 text-xs text-studio-muted hover:text-studio-text"
            >
              Close
            </button>
          </div>
        </div>

        {loading && (
          <p className="text-sm text-studio-muted">Loading native HoloScript surface...</p>
        )}
        {error && <p className="text-sm text-red-400">{error}</p>}

        {data && (
          <div className="space-y-4">
            <div className="rounded border border-sky-500/40 bg-sky-500/10 p-2 text-xs text-sky-200">
              Source: {data.sourcePath || 'unavailable'}
              <div className="mt-1 text-sky-100">
                Mode: {data.generation?.mode ?? 'unknown'} / hydrated:{' '}
                {data.generation?.hydrated ? 'yes' : 'no'}
              </div>
            </div>

            <div
              className={`rounded border p-2 text-xs ${data.validation.valid ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300' : 'border-red-500/40 bg-red-500/10 text-red-300'}`}
            >
              Validation:{' '}
              {data.validation.valid
                ? 'valid HoloScript composition'
                : 'invalid HoloScript composition'}
              {!data.validation.valid && data.validation.errors.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {data.validation.errors.map((issue) => (
                    <li key={issue}>{issue}</li>
                  ))}
                </ul>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Jobs
                <div className="text-lg font-semibold text-studio-text">
                  {data.telemetry.totalJobs}
                </div>
              </div>
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Completed
                <div className="text-lg font-semibold text-green-400">
                  {data.telemetry.completedJobs}
                </div>
              </div>
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Failed
                <div className="text-lg font-semibold text-red-400">
                  {data.telemetry.failedJobs}
                </div>
              </div>
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Patches
                <div className="text-lg font-semibold text-studio-text">
                  {data.telemetry.totalPatches}
                </div>
              </div>
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Avg Delta
                <div className="text-lg font-semibold text-studio-text">
                  {data.telemetry.avgQualityDelta}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Activity
                <div className="text-lg font-semibold text-studio-text">
                  {data.summary.activityCount}
                </div>
              </div>
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Agents
                <div className="text-lg font-semibold text-studio-text">
                  {data.summary.agentCount}
                </div>
              </div>
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Forks
                <div className="text-lg font-semibold text-studio-text">
                  {data.summary.forkCount}
                </div>
              </div>
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Running
                <div className="text-lg font-semibold text-studio-text">
                  {data.summary.runningJobs}
                </div>
              </div>
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Queued
                <div className="text-lg font-semibold text-studio-text">
                  {data.summary.queuedJobs}
                </div>
              </div>
              <div className="rounded border border-studio-border bg-studio-surface p-3 text-xs text-studio-muted">
                Review
                <div className="text-lg font-semibold text-studio-text">
                  {data.summary.reviewJobs}
                </div>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
              <div>
                <p className="mb-2 text-xs font-medium text-studio-muted">Loaded Surface Preview</p>
                <div className="h-[420px] overflow-hidden rounded border border-studio-border bg-[#050816]">
                  {data.kind === 'dashboard' && r3fTree ? (
                    <SceneRenderer r3fTree={r3fTree} />
                  ) : data.kind === 'dashboard' && previewErrors.length > 0 ? (
                    <div className="p-4 text-xs text-red-300">
                      {previewErrors.map((issue) => (
                        <div key={issue.message}>{issue.message}</div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-full items-center justify-center px-6 text-center text-xs text-studio-muted">
                      Orchestration is loaded and driven from the app, but it does not project a
                      visual dashboard scene on its own.
                    </div>
                  )}
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-studio-muted">
                  Loaded HoloScript Surface ({data.format})
                </p>
                <pre className="max-h-[420px] overflow-auto rounded border border-studio-border bg-[#0b1020] p-3 text-[11px] text-sky-100">
                  {data.code}
                </pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default OperationsSurfacePanel;
