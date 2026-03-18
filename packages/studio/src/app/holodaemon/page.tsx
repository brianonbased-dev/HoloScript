'use client';

/**
 * HoloDaemon — /holodaemon
 *
 * The first HoloScript-native daemon dashboard. Bridges the legacy TypeScript
 * daemon runner with a native .hsplus composition that defines both the
 * behavior tree orchestration and the 2D operations surface.
 *
 * Layout:
 *   - Header: daemon status, mode selector, start/stop controls
 *   - Metric cards: quality, type errors, jobs, cost, patches, cycles
 *   - Left panel: active job + BT phase + progress
 *   - Right panel: agent pool + pass configuration
 *   - Bottom: event feed + HoloScript source preview
 *
 * Data flow:
 *   1. Page loads → fetches daemon state from /api/daemon/jobs
 *   2. User clicks Start → POST /api/daemon/jobs creates a new job
 *   3. Poller watches job progress → updates UI in real-time
 *   4. Job completes → patches appear in review panel
 *   5. Composition source is loaded from holodaemon.hsplus + hydrated
 *
 * @module holodaemon/page
 */

import React, { useState, useCallback, useEffect } from 'react';
import Link from 'next/link';
import {
  useDaemonJobs,
  useDaemonJobPoller,
  type DaemonJob,
  type DaemonProfile,
  type DaemonTelemetrySummary,
} from '@/hooks/useDaemonJobs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type DaemonTab = 'dashboard' | 'jobs' | 'patches' | 'composition' | 'logs';

interface MetricCardProps {
  label: string;
  value: string | number;
  subValue?: string;
  color?: string;
  subColor?: string;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function MetricCard({ label, value, subValue, color = 'text-studio-text', subColor = 'text-studio-muted' }: MetricCardProps) {
  return (
    <div className="flex flex-col rounded-lg border border-studio-border bg-[#111827] p-4 min-w-[180px]">
      <span className="text-[10px] uppercase tracking-wider text-studio-muted">{label}</span>
      <span className={`mt-1 text-2xl font-bold ${color}`}>{value}</span>
      {subValue && <span className={`mt-1 text-xs ${subColor}`}>{subValue}</span>}
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'running'
      ? 'bg-emerald-500 animate-pulse'
      : status === 'error' || status === 'failed'
        ? 'bg-red-500'
        : 'bg-amber-500';
  return <div className={`h-3 w-3 rounded-full ${color}`} />;
}

function AgentCard({ agent }: { agent: { id: string; name: string; state: string; role: string } }) {
  const stateColor = agent.state === 'active' ? 'text-emerald-400' : 'text-studio-muted';
  return (
    <div className="flex items-center gap-3 rounded-lg border border-studio-border bg-[#0f172a] p-3">
      <div className={`h-2.5 w-2.5 rounded-full ${agent.state === 'active' ? 'bg-emerald-500 animate-pulse' : 'bg-gray-600'}`} />
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-studio-text">{agent.name}</span>
          <span className={`text-[10px] ${stateColor}`}>{agent.state}</span>
        </div>
        <span className="text-[10px] text-studio-muted">{agent.role}</span>
      </div>
    </div>
  );
}

function EventRow({ event }: { event: { eventType: string; jobId: string; timestamp: string } }) {
  const color =
    event.eventType.includes('failed') || event.eventType.includes('rejected')
      ? 'text-red-400'
      : event.eventType.includes('completed') || event.eventType.includes('applied')
        ? 'text-emerald-400'
        : 'text-sky-400';

  return (
    <div className="flex items-center gap-3 rounded border border-studio-border/50 bg-transparent px-3 py-1.5 text-[11px]">
      <span className={`font-mono ${color}`}>{event.eventType}</span>
      <span className="text-studio-muted">{event.jobId}</span>
      <span className="ml-auto text-studio-muted">
        {new Date(event.timestamp).toLocaleTimeString('en-US', { hour12: false })}
      </span>
    </div>
  );
}

function JobRow({ job, isActive, onClick }: { job: DaemonJob; isActive: boolean; onClick: () => void }) {
  const statusColor =
    job.status === 'completed'
      ? 'text-emerald-400'
      : job.status === 'running'
        ? 'text-sky-400'
        : job.status === 'failed'
          ? 'text-red-400'
          : 'text-amber-400';

  return (
    <button
      onClick={onClick}
      className={`flex w-full items-center gap-3 rounded-lg border px-4 py-2.5 text-left transition ${
        isActive
          ? 'border-studio-accent/40 bg-studio-accent/5'
          : 'border-studio-border bg-[#0f172a] hover:bg-[#111827]'
      }`}
    >
      <StatusDot status={job.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-mono text-studio-text truncate">{job.id}</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded bg-studio-surface ${statusColor}`}>
            {job.status}
          </span>
        </div>
        <span className="text-[10px] text-studio-muted truncate block">
          {job.summary || job.statusMessage || 'No summary'}
        </span>
      </div>
      <div className="shrink-0 text-right">
        <div className="text-xs text-studio-text">{job.progress}%</div>
        <div className="text-[10px] text-studio-muted">{job.profile}</div>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Agents (static definition from holodaemon.hsplus)
// ---------------------------------------------------------------------------

const DAEMON_AGENTS = [
  { id: 'planner', name: 'Planner', state: 'idle', role: 'Analyzes project DNA and plans passes' },
  { id: 'fixer', name: 'Fixer', state: 'idle', role: 'Generates and applies type/lint fixes' },
  { id: 'verifier', name: 'Verifier', state: 'idle', role: 'Runs tsc + vitest + eslint validation' },
  { id: 'reviewer', name: 'Reviewer', state: 'idle', role: 'Produces patch proposals for human review' },
];

// ---------------------------------------------------------------------------
// Main Page Component
// ---------------------------------------------------------------------------

export default function HoloDaemonPage() {
  const [activeTab, setActiveTab] = useState<DaemonTab>('dashboard');
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [jobs, setJobs] = useState<DaemonJob[]>([]);
  const [telemetry, setTelemetry] = useState<DaemonTelemetrySummary | null>(null);
  const [compositionCode, setCompositionCode] = useState<string>('');
  const [daemonMode, setDaemonMode] = useState<DaemonProfile>('balanced');
  const [loading, setLoading] = useState(true);

  const { createJob, listJobs, getTelemetry, creating, error } = useDaemonJobs();
  const { job: polledJob } = useDaemonJobPoller(selectedJobId);

  // Load initial state
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
      if (mounted) setLoading(false);
    };
    void load();
    return () => { mounted = false; };
  }, [listJobs, getTelemetry]);

  // Load composition source
  useEffect(() => {
    let mounted = true;
    const loadComposition = async () => {
      try {
        const res = await fetch('/api/daemon/surface?kind=dashboard');
        const data = await res.json();
        if (mounted && data.code) {
          setCompositionCode(data.code);
        }
      } catch {
        // Composition not available
      }
    };
    void loadComposition();
    return () => { mounted = false; };
  }, []);

  // Update job list when polled job changes
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
    }
  }, [polledJob]);

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
    } catch {
      // Error is handled by the hook
    }
  }, [createJob, daemonMode]);

  // Derived state
  const activeJob = polledJob || jobs.find((j) => j.id === selectedJobId);
  const daemonStatus = activeJob?.status === 'running' ? 'running' : activeJob?.status === 'failed' ? 'error' : 'idle';
  const qualityScore = activeJob?.metrics?.qualityAfter ?? 0;
  const qualityDelta = activeJob?.metrics?.qualityDelta ?? 0;
  const totalPatches = telemetry?.totalPatches ?? 0;
  const totalJobs = telemetry?.totalJobs ?? 0;
  const completedJobs = telemetry?.completedJobs ?? 0;
  const failedJobs = telemetry?.failedJobs ?? 0;
  const recentEvents = telemetry?.recentEvents?.slice(-12) ?? [];

  const TABS: Array<{ id: DaemonTab; label: string; count?: number }> = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'jobs', label: 'Jobs', count: jobs.length },
    { id: 'patches', label: 'Patches', count: totalPatches },
    { id: 'composition', label: 'HoloScript' },
    { id: 'logs', label: 'Events', count: recentEvents.length },
  ];

  return (
    <div className="min-h-screen bg-studio-bg">
      {/* Header */}
      <header className="sticky top-0 z-50 flex items-center justify-between border-b border-studio-border bg-[#0f172a] px-6 py-3">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-studio-muted hover:text-studio-text transition text-xs">
            Studio
          </Link>
          <span className="text-studio-muted">/</span>
          <h1 className="text-lg font-bold text-studio-text">HoloDaemon</h1>
          <span className="rounded bg-studio-surface px-2 py-0.5 text-[10px] text-studio-muted">
            v1.0.0 MVP
          </span>
          <div className="flex items-center gap-2 ml-4">
            <StatusDot status={daemonStatus} />
            <span className={`text-xs ${daemonStatus === 'running' ? 'text-emerald-400' : daemonStatus === 'error' ? 'text-red-400' : 'text-amber-400'}`}>
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

      {/* Tabs */}
      <nav className="flex border-b border-studio-border bg-[#0f172a]/50 px-6">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`relative px-4 py-2.5 text-xs font-medium transition ${
              activeTab === tab.id
                ? 'text-studio-accent'
                : 'text-studio-muted hover:text-studio-text'
            }`}
          >
            {tab.label}
            {tab.count !== undefined && tab.count > 0 && (
              <span className="ml-1.5 rounded-full bg-studio-surface px-1.5 py-0.5 text-[9px]">
                {tab.count}
              </span>
            )}
            {activeTab === tab.id && (
              <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-studio-accent" />
            )}
          </button>
        ))}
      </nav>

      {/* Error Banner */}
      {error && (
        <div className="mx-6 mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-2 text-xs text-red-300">
          {error}
        </div>
      )}

      {/* Content */}
      <main className="p-6">
        {loading ? (
          <div className="flex h-64 items-center justify-center text-sm text-studio-muted">
            Loading daemon state...
          </div>
        ) : (
          <>
            {/* Dashboard Tab */}
            {activeTab === 'dashboard' && (
              <div className="space-y-6">
                {/* Metric Cards */}
                <div className="flex flex-wrap gap-4">
                  <MetricCard
                    label="Quality Score"
                    value={`${Math.round(qualityScore * 100)}%`}
                    subValue={`${qualityDelta >= 0 ? '+' : ''}${Math.round(qualityDelta * 100)}% delta`}
                    color={qualityScore > 0.7 ? 'text-emerald-400' : qualityScore > 0.4 ? 'text-amber-400' : 'text-studio-text'}
                    subColor={qualityDelta >= 0 ? 'text-emerald-400' : 'text-red-400'}
                  />
                  <MetricCard
                    label="Total Jobs"
                    value={totalJobs}
                    subValue={`${completedJobs} completed, ${failedJobs} failed`}
                  />
                  <MetricCard
                    label="Patches"
                    value={totalPatches}
                    subValue={`${telemetry?.appliedPatches ?? 0} applied`}
                    color="text-studio-text"
                    subColor="text-emerald-400"
                  />
                  <MetricCard
                    label="Avg Quality Delta"
                    value={`${telemetry?.avgQualityDelta ?? 0 >= 0 ? '+' : ''}${telemetry?.avgQualityDelta ?? 0}`}
                  />
                  <MetricCard
                    label="Avg Duration"
                    value={formatDuration(telemetry?.avgDurationMs ?? 0)}
                  />
                </div>

                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Active Job Panel */}
                  <div className="rounded-xl border border-studio-border bg-[#0f172a] p-5">
                    <h3 className="mb-3 text-sm font-semibold text-studio-text">Active Job</h3>
                    {activeJob ? (
                      <div className="space-y-3">
                        <div className="flex items-center gap-2">
                          <StatusDot status={activeJob.status} />
                          <span className="text-xs font-mono text-studio-text">{activeJob.id}</span>
                          <span className="ml-auto text-[10px] text-studio-muted">{activeJob.profile}</span>
                        </div>
                        <p className="text-xs text-studio-muted">
                          {activeJob.statusMessage || activeJob.summary || 'Waiting...'}
                        </p>
                        <div className="relative h-2 w-full overflow-hidden rounded-full bg-[#1e293b]">
                          <div
                            className="absolute left-0 top-0 h-full rounded-full bg-blue-500 transition-all duration-300"
                            style={{ width: `${activeJob.progress}%` }}
                          />
                        </div>
                        <span className="text-[10px] text-studio-muted">{activeJob.progress}%</span>

                        {activeJob.metrics && (
                          <div className="mt-4 grid grid-cols-3 gap-3">
                            <div className="rounded border border-studio-border bg-studio-surface p-2">
                              <div className="text-[9px] text-studio-muted">Cycles</div>
                              <div className="text-sm font-bold text-studio-text">{activeJob.metrics.cycles}</div>
                            </div>
                            <div className="rounded border border-studio-border bg-studio-surface p-2">
                              <div className="text-[9px] text-studio-muted">Files</div>
                              <div className="text-sm font-bold text-studio-text">{activeJob.metrics.filesAnalyzed}</div>
                            </div>
                            <div className="rounded border border-studio-border bg-studio-surface p-2">
                              <div className="text-[9px] text-studio-muted">Duration</div>
                              <div className="text-sm font-bold text-studio-text">{formatDuration(activeJob.metrics.durationMs)}</div>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <p className="text-xs text-studio-muted">
                        No active job. Click &quot;Start Daemon&quot; to begin a new improvement cycle.
                      </p>
                    )}
                  </div>

                  {/* Agent Pool */}
                  <div className="rounded-xl border border-studio-border bg-[#0f172a] p-5">
                    <h3 className="mb-3 text-sm font-semibold text-studio-text">Agent Pool</h3>
                    <div className="space-y-2">
                      {DAEMON_AGENTS.map((agent) => (
                        <AgentCard
                          key={agent.id}
                          agent={{
                            ...agent,
                            state: activeJob?.status === 'running'
                              ? (agent.id === 'planner' && (activeJob.progress ?? 0) < 20
                                ? 'active'
                                : agent.id === 'fixer' && (activeJob.progress ?? 0) >= 20 && (activeJob.progress ?? 0) < 60
                                  ? 'active'
                                  : agent.id === 'verifier' && (activeJob.progress ?? 0) >= 60 && (activeJob.progress ?? 0) < 90
                                    ? 'active'
                                    : agent.id === 'reviewer' && (activeJob.progress ?? 0) >= 90
                                      ? 'active'
                                      : 'idle')
                              : 'idle',
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                {/* Event Feed */}
                <div className="rounded-xl border border-studio-border bg-[#0f172a] p-5">
                  <h3 className="mb-3 text-sm font-semibold text-studio-text">Recent Events</h3>
                  {recentEvents.length === 0 ? (
                    <p className="text-xs text-studio-muted">No events yet. Start a daemon job to see activity.</p>
                  ) : (
                    <div className="space-y-1 max-h-[200px] overflow-y-auto">
                      {recentEvents.map((event, idx) => (
                        <EventRow key={`${event.jobId}-${event.timestamp}-${idx}`} event={event} />
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Jobs Tab */}
            {activeTab === 'jobs' && (
              <div className="space-y-3">
                <h3 className="text-sm font-semibold text-studio-text">Job History ({jobs.length})</h3>
                {jobs.length === 0 ? (
                  <p className="text-xs text-studio-muted">No jobs yet. Start a daemon run to see job history.</p>
                ) : (
                  <div className="space-y-2">
                    {jobs.map((job) => (
                      <JobRow
                        key={job.id}
                        job={job}
                        isActive={selectedJobId === job.id}
                        onClick={() => setSelectedJobId(job.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Patches Tab */}
            {activeTab === 'patches' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-studio-text">Patch Proposals</h3>
                {activeJob?.patches && activeJob.patches.length > 0 ? (
                  <div className="space-y-2">
                    {activeJob.patches.map((patch) => (
                      <div
                        key={patch.id}
                        className="rounded-lg border border-studio-border bg-[#0f172a] p-4"
                      >
                        <div className="flex items-center gap-3">
                          <span
                            className={`shrink-0 w-5 h-5 flex items-center justify-center rounded text-[10px] font-mono font-bold ${
                              patch.action === 'create'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : patch.action === 'delete'
                                  ? 'bg-red-500/20 text-red-400'
                                  : 'bg-blue-500/20 text-blue-400'
                            }`}
                          >
                            {patch.action === 'create' ? '+' : patch.action === 'delete' ? '-' : '~'}
                          </span>
                          <span className="text-xs font-mono text-studio-text">{patch.filePath}</span>
                          <span className="text-[10px] text-studio-muted">{patch.description}</span>
                          <span className="ml-auto text-[10px] text-studio-muted">
                            {Math.round(patch.confidence * 100)}% confidence
                          </span>
                        </div>
                        {patch.diff && (
                          <pre className="mt-3 max-h-[200px] overflow-auto rounded border border-studio-border bg-[#0d1117] p-2 font-mono text-[10px] leading-relaxed">
                            {patch.diff.split('\n').map((line, i) => {
                              const cls = line.startsWith('+')
                                ? 'text-emerald-400'
                                : line.startsWith('-')
                                  ? 'text-red-400'
                                  : line.startsWith('@@')
                                    ? 'text-purple-400'
                                    : 'text-gray-400';
                              return (
                                <div key={i} className={cls}>
                                  {line || '\u00A0'}
                                </div>
                              );
                            })}
                          </pre>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-studio-muted">
                    No patches available. Complete a daemon job to see proposed changes.
                  </p>
                )}
              </div>
            )}

            {/* Composition Tab */}
            {activeTab === 'composition' && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-studio-text">HoloScript Composition</h3>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-sky-500/20 px-2 py-0.5 text-[10px] text-sky-400">
                      .hsplus
                    </span>
                    <span className="text-[10px] text-studio-muted">
                      compositions/holodaemon.hsplus
                    </span>
                  </div>
                </div>
                <div className="rounded-xl border border-studio-border bg-[#0f172a] p-1">
                  <pre className="max-h-[600px] overflow-auto rounded bg-[#0b1020] p-4 font-mono text-[11px] leading-relaxed text-sky-100">
                    {compositionCode || '// Loading composition source...'}
                  </pre>
                </div>
                <p className="text-[10px] text-studio-muted">
                  This composition defines the HoloDaemon&apos;s behavior tree, UI surface, agent pool,
                  and event handlers. It is the source of truth for daemon orchestration, bridging
                  legacy TypeScript infrastructure with native HoloScript AI orchestration.
                </p>
              </div>
            )}

            {/* Logs Tab */}
            {activeTab === 'logs' && (
              <div className="space-y-4">
                <h3 className="text-sm font-semibold text-studio-text">Event Feed</h3>
                {recentEvents.length === 0 ? (
                  <p className="text-xs text-studio-muted">No events recorded yet.</p>
                ) : (
                  <div className="space-y-1">
                    {[...recentEvents].reverse().map((event, idx) => (
                      <EventRow key={`${event.jobId}-${event.timestamp}-${idx}`} event={event} />
                    ))}
                  </div>
                )}

                {activeJob?.logs && activeJob.logs.length > 0 && (
                  <div className="mt-6">
                    <h4 className="mb-2 text-xs font-medium text-studio-muted">Job Logs</h4>
                    <div className="max-h-[400px] overflow-y-auto rounded-lg border border-studio-border bg-[#0d1117] p-3 font-mono text-[10px]">
                      {activeJob.logs.map((entry, idx) => {
                        const color =
                          entry.level === 'error'
                            ? 'text-red-400'
                            : entry.level === 'warn'
                              ? 'text-yellow-400'
                              : 'text-blue-400';
                        return (
                          <div key={idx} className={`flex gap-2 ${color}`}>
                            <span className="shrink-0 opacity-60">
                              {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                            </span>
                            <span className="shrink-0 w-[40px] uppercase opacity-70">[{entry.level}]</span>
                            <span>{entry.message}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms === 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
