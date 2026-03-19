'use client';

/**
 * HoloDaemon — /holodaemon
 *
 * Native HoloScript-driven daemon dashboard. The UI surface is defined in
 * compositions/holodaemon.hsplus and rendered by HoloSurfaceRenderer.
 * This page only handles API integration and event bridging.
 *
 * This is the first studio page to hydrate from a native .hsplus composition,
 * proving that HoloScript can drive its own frontend (G.ARCH.001 Phase 1).
 *
 * @module holodaemon/page
 */

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import { HoloSurfaceRenderer, useHoloComposition } from '@/components/holo-surface';
import {
  useDaemonJobs,
  useDaemonJobPoller,
  type DaemonJob,
  type DaemonProfile,
  type DaemonTelemetrySummary,
} from '@/hooks/useDaemonJobs';

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function HoloDaemonPage() {
  // Load and parse the holodaemon.hsplus composition
  const composition = useHoloComposition('/api/daemon/surface?kind=dashboard');

  // API integration — these hooks bridge real daemon data into the composition
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<DaemonJob[]>([]);
  const [telemetry, setTelemetry] = useState<DaemonTelemetrySummary | null>(null);
  const [daemonMode, setDaemonMode] = useState<DaemonProfile>('balanced');
  const { createJob, listJobs, getTelemetry, creating, error } = useDaemonJobs();
  const { job: polledJob } = useDaemonJobPoller(selectedJobId);

  // Load initial state from API
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const [jobList, tel] = await Promise.all([listJobs(), getTelemetry()]);
        if (mounted) {
          setJobs(jobList);
          setTelemetry(tel);
        }
      } catch {
        // API not available yet
      }
    };
    void load();
    return () => { mounted = false; };
  }, [listJobs, getTelemetry]);

  // Bridge API data → composition state
  useEffect(() => {
    if (!composition.loading && telemetry) {
      composition.setState({
        totalJobsRun: telemetry.totalJobs ?? 0,
        totalPatchesProposed: telemetry.totalPatches ?? 0,
        costUSD: telemetry.totalCostUSD ?? 0,
        cyclesCompleted: telemetry.completedJobs ?? 0,
      });
    }
  }, [telemetry, composition.loading]); // eslint-disable-line react-hooks/exhaustive-deps

  // Bridge polled job → composition state
  useEffect(() => {
    if (polledJob) {
      setJobs((prev) => {
        const idx = prev.findIndex((j) => j.id === polledJob.id);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = polledJob;
          return next;
        }
        return [polledJob, ...prev];
      });

      // Update composition state with live job data
      composition.setState({
        daemonStatus: polledJob.status === 'running' ? 'running' : polledJob.status === 'failed' ? 'error' : 'idle',
        activeJobId: polledJob.id,
        activeJobProgress: polledJob.progress ?? 0,
        activeJobStatus: polledJob.statusMessage || polledJob.summary || 'Processing...',
        qualityScore: polledJob.metrics?.qualityAfter ?? 0,
        qualityDelta: polledJob.metrics?.qualityDelta ?? 0,
        typeErrorCount: polledJob.metrics?.typeErrors ?? 0,
      });
    }
  }, [polledJob]); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh telemetry periodically
  useEffect(() => {
    const interval = setInterval(async () => {
      try {
        const tel = await getTelemetry();
        setTelemetry(tel);
      } catch {
        // ignore
      }
    }, 10000);
    return () => clearInterval(interval);
  }, [getTelemetry]);

  // Start daemon handler
  const handleStartDaemon = useCallback(async () => {
    try {
      const job = await createJob({
        projectId: 'holoscript',
        profile: daemonMode,
        projectDna: {
          kind: 'spatial',
          confidence: 0.95,
          detectedStack: ['typescript', 'react', 'holoscript', 'three.js'],
          recommendedProfile: daemonMode,
          notes: ['HoloScript monorepo — self-improvement daemon run'],
        },
      });
      setSelectedJobId(job.id);
      setJobs((prev) => [job, ...prev]);
      composition.setState({
        daemonStatus: 'running',
        activeJobId: job.id,
        activeJobProgress: 0,
        activeJobStatus: 'Job created, starting pipeline...',
      });
    } catch {
      // Error handled by hook
    }
  }, [createJob, daemonMode, composition]);

  const daemonStatus = polledJob?.status === 'running' ? 'running' : polledJob?.status === 'failed' ? 'error' : 'idle';

  // Render
  return (
    <div className="min-h-screen bg-studio-bg">
      {/* Header — kept in React for interactive controls */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-studio-border bg-[#0f172a] px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-studio-muted hover:text-studio-text transition text-xs">
            Studio
          </Link>
          <span className="text-studio-muted">/</span>
          <h1 className="text-lg font-bold text-studio-text">HoloDaemon</h1>
          <span className="rounded bg-studio-surface px-2 py-0.5 text-[10px] text-studio-muted">
            v1.0.0 — Native Surface
          </span>
          <div className="flex items-center gap-2 ml-4">
            <div className={`h-3 w-3 rounded-full ${
              daemonStatus === 'running' ? 'bg-emerald-500 animate-pulse' :
              daemonStatus === 'error' ? 'bg-red-500' : 'bg-amber-500'
            }`} />
            <span className={`text-xs ${
              daemonStatus === 'running' ? 'text-emerald-400' :
              daemonStatus === 'error' ? 'text-red-400' : 'text-amber-400'
            }`}>
              {daemonStatus}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <select
            value={daemonMode}
            onChange={(e) => setDaemonMode(e.target.value as DaemonProfile)}
            className="rounded-md border border-studio-border bg-studio-surface px-2 py-1 text-xs text-studio-text"
            title="Daemon profile"
          >
            <option value="quick">Quick</option>
            <option value="balanced">Balanced</option>
            <option value="deep">Deep</option>
          </select>

          <button
            onClick={handleStartDaemon}
            disabled={creating || daemonStatus === 'running'}
            className="rounded-lg bg-emerald-600 px-4 py-1.5 text-xs font-medium text-white transition hover:bg-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {creating ? 'Starting...' : daemonStatus === 'running' ? 'Running...' : 'Start Daemon'}
          </button>
        </div>
      </header>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Native HoloScript Surface */}
      <main className="p-6">
        {composition.loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-studio-muted">
            Loading composition surface...
          </div>
        ) : composition.error ? (
          <div className="flex h-64 flex-col items-center justify-center gap-2 text-sm text-red-400">
            <span>Failed to load composition: {composition.error}</span>
            <span className="text-xs text-studio-muted">Falling back to static view</span>
          </div>
        ) : (
          <HoloSurfaceRenderer
            nodes={composition.nodes}
            state={composition.state}
            computed={composition.computed}
            templates={composition.templates}
            onEmit={composition.emit}
            className="holo-surface-holodaemon"
          />
        )}
      </main>
    </div>
  );
}
