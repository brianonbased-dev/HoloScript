'use client';

/**
 * StudioOperationsHub — Centralized operations dashboard for HoloScript Studio
 *
 * Combines build status, deployment pipeline, and error log viewer into one
 * unified panel. Provides real-time visibility into the full build-deploy-debug
 * lifecycle from a single location.
 *
 * Sub-components:
 *   - BuildStatusPanel: Live build progress, target status, artifact sizes
 *   - DeploymentPipeline: Multi-stage deployment visualization and control
 *   - ErrorLogViewer: Filterable, searchable error/warning log stream
 *
 * @version 1.0.0
 */

import React, { useState, useCallback, useEffect, useRef, useMemo } from 'react';

// =============================================================================
// TYPES
// =============================================================================

export type BuildTarget =
  | 'web'
  | 'ios'
  | 'android'
  | 'visionos'
  | 'quest'
  | 'desktop'
  | 'wasm';

export type BuildStatus = 'idle' | 'queued' | 'building' | 'success' | 'failed' | 'cancelled';

export type DeployStage =
  | 'validate'
  | 'bundle'
  | 'optimize'
  | 'upload'
  | 'provision'
  | 'health_check'
  | 'live';

export type DeployStageStatus = 'pending' | 'running' | 'passed' | 'failed' | 'skipped';

export type LogLevel = 'error' | 'warning' | 'info' | 'debug';

export interface BuildTargetStatus {
  target: BuildTarget;
  status: BuildStatus;
  progress: number; // 0-100
  artifactSize?: number; // bytes
  startedAt?: number;
  completedAt?: number;
  errorCount: number;
  warningCount: number;
}

export interface DeployPipelineState {
  id: string;
  name: string;
  environment: 'staging' | 'production' | 'preview';
  stages: DeployStageState[];
  triggeredAt: number;
  triggeredBy: string;
  commitHash: string;
  status: 'running' | 'succeeded' | 'failed' | 'cancelled';
}

export interface DeployStageState {
  stage: DeployStage;
  status: DeployStageStatus;
  startedAt?: number;
  completedAt?: number;
  logs: string[];
  metadata?: Record<string, string>;
}

export interface LogEntry {
  id: string;
  timestamp: number;
  level: LogLevel;
  source: string;
  message: string;
  details?: string;
  file?: string;
  line?: number;
  column?: number;
}

export interface StudioOperationsHubProps {
  onClose?: () => void;
  initialTab?: 'build' | 'deploy' | 'logs';
}

// =============================================================================
// CONSTANTS
// =============================================================================

const TARGET_ICONS: Record<BuildTarget, string> = {
  web: 'W',
  ios: 'I',
  android: 'A',
  visionos: 'V',
  quest: 'Q',
  desktop: 'D',
  wasm: 'WA',
};

const STAGE_LABELS: Record<DeployStage, string> = {
  validate: 'Validate',
  bundle: 'Bundle',
  optimize: 'Optimize',
  upload: 'Upload',
  provision: 'Provision',
  health_check: 'Health Check',
  live: 'Go Live',
};

const LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'text-red-400 bg-red-500/10',
  warning: 'text-yellow-400 bg-yellow-500/10',
  info: 'text-blue-400 bg-blue-500/10',
  debug: 'text-gray-400 bg-gray-500/10',
};

const STATUS_COLORS: Record<BuildStatus, string> = {
  idle: 'bg-gray-500/20 text-gray-400',
  queued: 'bg-purple-500/20 text-purple-400',
  building: 'bg-blue-500/20 text-blue-400',
  success: 'bg-emerald-500/20 text-emerald-400',
  failed: 'bg-red-500/20 text-red-400',
  cancelled: 'bg-orange-500/20 text-orange-400',
};

// =============================================================================
// UTILITY HELPERS
// =============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// HOOKS
// =============================================================================

function useBuildStatus() {
  const [targets, setTargets] = useState<BuildTargetStatus[]>(() =>
    (['web', 'ios', 'android', 'visionos', 'quest', 'desktop', 'wasm'] as BuildTarget[]).map(
      (target) => ({
        target,
        status: 'idle' as BuildStatus,
        progress: 0,
        errorCount: 0,
        warningCount: 0,
      }),
    ),
  );
  const [isBuilding, setIsBuilding] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const startBuild = useCallback(
    (selectedTargets: BuildTarget[]) => {
      if (isBuilding) return;
      setIsBuilding(true);

      setTargets((prev) =>
        prev.map((t) =>
          selectedTargets.includes(t.target)
            ? {
                ...t,
                status: 'queued',
                progress: 0,
                startedAt: Date.now(),
                completedAt: undefined,
                errorCount: 0,
                warningCount: 0,
              }
            : t,
        ),
      );

      // Simulate progressive build
      let tick = 0;
      intervalRef.current = setInterval(() => {
        tick += 1;
        setTargets((prev) => {
          const updated = prev.map((t) => {
            if (!selectedTargets.includes(t.target)) return t;
            if (t.status === 'success' || t.status === 'failed') return t;

            const newProgress = Math.min(100, t.progress + Math.random() * 15 + 5);
            const newStatus: BuildStatus =
              newProgress >= 100
                ? Math.random() > 0.15
                  ? 'success'
                  : 'failed'
                : newProgress > 5
                  ? 'building'
                  : 'queued';

            return {
              ...t,
              status: newStatus,
              progress: newProgress >= 100 ? 100 : newProgress,
              completedAt: newProgress >= 100 ? Date.now() : undefined,
              artifactSize:
                newProgress >= 100 ? Math.floor(Math.random() * 5_000_000) + 500_000 : undefined,
              errorCount: newStatus === 'failed' ? Math.floor(Math.random() * 5) + 1 : 0,
              warningCount: Math.floor(Math.random() * 3),
            };
          });

          const allDone = updated
            .filter((t) => selectedTargets.includes(t.target))
            .every((t) => t.status === 'success' || t.status === 'failed');

          if (allDone) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setIsBuilding(false);
          }
          return updated;
        });
      }, 600);
    },
    [isBuilding],
  );

  const cancelBuild = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsBuilding(false);
    setTargets((prev) =>
      prev.map((t) =>
        t.status === 'building' || t.status === 'queued'
          ? { ...t, status: 'cancelled', completedAt: Date.now() }
          : t,
      ),
    );
  }, []);

  const resetAll = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsBuilding(false);
    setTargets((prev) =>
      prev.map((t) => ({
        ...t,
        status: 'idle',
        progress: 0,
        artifactSize: undefined,
        startedAt: undefined,
        completedAt: undefined,
        errorCount: 0,
        warningCount: 0,
      })),
    );
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { targets, isBuilding, startBuild, cancelBuild, resetAll };
}

function useDeploymentPipeline() {
  const [pipelines, setPipelines] = useState<DeployPipelineState[]>([]);

  const triggerDeploy = useCallback(
    (name: string, environment: 'staging' | 'production' | 'preview') => {
      const stages: DeployStage[] = [
        'validate',
        'bundle',
        'optimize',
        'upload',
        'provision',
        'health_check',
        'live',
      ];
      const pipeline: DeployPipelineState = {
        id: generateId(),
        name,
        environment,
        stages: stages.map((stage) => ({
          stage,
          status: 'pending',
          logs: [],
        })),
        triggeredAt: Date.now(),
        triggeredBy: 'studio-user',
        commitHash: Math.random().toString(16).slice(2, 10),
        status: 'running',
      };

      setPipelines((prev) => [pipeline, ...prev]);

      // Simulate pipeline progression
      let currentStageIdx = 0;
      const advanceStage = () => {
        setPipelines((prev) =>
          prev.map((p) => {
            if (p.id !== pipeline.id) return p;
            if (currentStageIdx >= p.stages.length) return p;

            const newStages = [...p.stages];

            // Complete current stage
            if (newStages[currentStageIdx].status === 'running') {
              const passed = Math.random() > 0.1;
              newStages[currentStageIdx] = {
                ...newStages[currentStageIdx],
                status: passed ? 'passed' : 'failed',
                completedAt: Date.now(),
                logs: [
                  ...newStages[currentStageIdx].logs,
                  passed
                    ? `Stage ${STAGE_LABELS[newStages[currentStageIdx].stage]} completed successfully`
                    : `Stage ${STAGE_LABELS[newStages[currentStageIdx].stage]} failed: check configuration`,
                ],
              };

              if (!passed) {
                return {
                  ...p,
                  stages: newStages,
                  status: 'failed',
                };
              }

              currentStageIdx += 1;
              if (currentStageIdx >= p.stages.length) {
                return { ...p, stages: newStages, status: 'succeeded' };
              }
            }

            // Start next stage
            newStages[currentStageIdx] = {
              ...newStages[currentStageIdx],
              status: 'running',
              startedAt: Date.now(),
              logs: [`Starting ${STAGE_LABELS[newStages[currentStageIdx].stage]}...`],
            };

            return { ...p, stages: newStages };
          }),
        );

        setPipelines((prev) => {
          const target = prev.find((p) => p.id === pipeline.id);
          if (
            target &&
            target.status === 'running' &&
            currentStageIdx < target.stages.length
          ) {
            setTimeout(advanceStage, 800 + Math.random() * 1200);
          }
          return prev;
        });
      };

      setTimeout(advanceStage, 300);
    },
    [],
  );

  const cancelPipeline = useCallback((pipelineId: string) => {
    setPipelines((prev) =>
      prev.map((p) =>
        p.id === pipelineId
          ? {
              ...p,
              status: 'cancelled',
              stages: p.stages.map((s) =>
                s.status === 'running' || s.status === 'pending'
                  ? { ...s, status: 'skipped' as DeployStageStatus }
                  : s,
              ),
            }
          : p,
      ),
    );
  }, []);

  return { pipelines, triggerDeploy, cancelPipeline };
}

function useErrorLogs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [filter, setFilter] = useState<LogLevel | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Simulate incoming log stream
  useEffect(() => {
    const sources = ['compiler', 'bundler', 'deploy', 'runtime', 'lsp', 'trait-system'];
    const sampleMessages: Record<LogLevel, string[]> = {
      error: [
        'Failed to resolve module "@holoscript/core/traits"',
        'Compilation error in scene.holo:42 — unexpected token',
        'Deployment target unreachable: timeout after 30s',
        'RBAC check failed: insufficient permissions for trait @physics',
        'WebGPU context lost during shader compilation',
      ],
      warning: [
        'Deprecated API usage: TraitContextFactory.legacy()',
        'Bundle size exceeds 2MB threshold (2.4MB)',
        'Unused trait @glow detected in composition',
        'Slow build detected: visionos target took 45s',
        'Certificate expires in 7 days',
      ],
      info: [
        'Build completed for web target (1.2MB, 12.3s)',
        'Hot-reload triggered for scene.holo',
        'Deployment health check passed (staging)',
        'New trait registered: @particle-v2',
        'Cache cleared: 847 entries removed',
      ],
      debug: [
        'Module resolution: @holoscript/core -> node_modules/@holoscript/core/dist/index.js',
        'Trait compilation order: [@transform, @material, @physics, @interact]',
        'CRDT sync delta: 3 operations, 148 bytes',
        'Shader variant generated: pbr_iridescence_sss',
        'Worker pool: 4/8 threads active',
      ],
    };

    const addRandomLog = () => {
      const levels: LogLevel[] = ['error', 'warning', 'info', 'debug'];
      const weights = [0.1, 0.2, 0.4, 0.3];
      const r = Math.random();
      let cumulative = 0;
      let level: LogLevel = 'info';
      for (let i = 0; i < weights.length; i++) {
        cumulative += weights[i];
        if (r <= cumulative) {
          level = levels[i];
          break;
        }
      }

      const msgs = sampleMessages[level];
      const source = sources[Math.floor(Math.random() * sources.length)];

      const entry: LogEntry = {
        id: generateId(),
        timestamp: Date.now(),
        level,
        source,
        message: msgs[Math.floor(Math.random() * msgs.length)],
        file: level === 'error' || level === 'warning' ? `src/scenes/main.holo` : undefined,
        line: level === 'error' ? Math.floor(Math.random() * 200) + 1 : undefined,
      };

      setLogs((prev) => [entry, ...prev].slice(0, 500));
    };

    const interval = setInterval(addRandomLog, 2000 + Math.random() * 3000);
    // Seed initial logs
    for (let i = 0; i < 8; i++) addRandomLog();

    return () => clearInterval(interval);
  }, []);

  const filteredLogs = useMemo(() => {
    let result = logs;
    if (filter !== 'all') {
      result = result.filter((l) => l.level === filter);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (l) =>
          l.message.toLowerCase().includes(q) ||
          l.source.toLowerCase().includes(q) ||
          (l.file && l.file.toLowerCase().includes(q)),
      );
    }
    return result;
  }, [logs, filter, searchQuery]);

  const clearLogs = useCallback(() => setLogs([]), []);

  const counts = useMemo(() => {
    const c = { error: 0, warning: 0, info: 0, debug: 0 };
    for (const log of logs) c[log.level]++;
    return c;
  }, [logs]);

  return { logs: filteredLogs, filter, setFilter, searchQuery, setSearchQuery, clearLogs, counts };
}

// =============================================================================
// SUB-COMPONENT: BuildStatusPanel
// =============================================================================

interface BuildStatusPanelProps {
  targets: BuildTargetStatus[];
  isBuilding: boolean;
  onStartBuild: (targets: BuildTarget[]) => void;
  onCancel: () => void;
  onReset: () => void;
}

function BuildStatusPanel({
  targets,
  isBuilding,
  onStartBuild,
  onCancel,
  onReset,
}: BuildStatusPanelProps) {
  const [selectedTargets, setSelectedTargets] = useState<Set<BuildTarget>>(
    new Set(['web', 'wasm']),
  );

  const toggleTarget = (target: BuildTarget) => {
    setSelectedTargets((prev) => {
      const next = new Set(prev);
      if (next.has(target)) next.delete(target);
      else next.add(target);
      return next;
    });
  };

  const successCount = targets.filter((t) => t.status === 'success').length;
  const failedCount = targets.filter((t) => t.status === 'failed').length;

  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-studio-text">Build Status</span>
          {(successCount > 0 || failedCount > 0) && (
            <span className="text-[10px] text-studio-muted">
              {successCount} passed / {failedCount} failed
            </span>
          )}
        </div>
        <div className="flex gap-1.5">
          <button
            onClick={() => onStartBuild(Array.from(selectedTargets))}
            disabled={isBuilding || selectedTargets.size === 0}
            className="px-2 py-1 text-[11px] bg-emerald-500/20 text-emerald-400 rounded hover:bg-emerald-500/30 transition disabled:opacity-50"
          >
            {isBuilding ? 'Building...' : 'Build'}
          </button>
          {isBuilding && (
            <button
              onClick={onCancel}
              className="px-2 py-1 text-[11px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
            >
              Cancel
            </button>
          )}
          <button
            onClick={onReset}
            className="px-2 py-1 text-[11px] bg-studio-panel text-studio-muted rounded hover:text-studio-text transition"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Target selector grid */}
      <div className="grid grid-cols-4 gap-1.5">
        {targets.map((t) => {
          const isSelected = selectedTargets.has(t.target);
          return (
            <button
              key={t.target}
              onClick={() => toggleTarget(t.target)}
              disabled={isBuilding}
              className={`relative px-2 py-2 rounded text-[10px] text-center transition-all ${
                isSelected
                  ? 'ring-1 ring-studio-accent/40 bg-studio-accent/10 text-studio-accent'
                  : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'
              } disabled:cursor-not-allowed`}
            >
              <div className="font-mono font-bold text-xs">{TARGET_ICONS[t.target]}</div>
              <div className="mt-0.5">{t.target}</div>

              {/* Status badge */}
              {t.status !== 'idle' && (
                <div
                  className={`absolute top-0.5 right-0.5 px-1 rounded text-[8px] ${STATUS_COLORS[t.status]}`}
                >
                  {t.status === 'building' ? `${Math.round(t.progress)}%` : t.status}
                </div>
              )}

              {/* Progress bar */}
              {t.status === 'building' && (
                <div className="mt-1 h-0.5 bg-gray-700 rounded overflow-hidden">
                  <div
                    className="h-full bg-blue-400 transition-all duration-300"
                    style={{ width: `${t.progress}%` }}
                  />
                </div>
              )}

              {/* Artifact size */}
              {t.artifactSize != null && t.status === 'success' && (
                <div className="text-[8px] text-studio-muted mt-0.5">
                  {formatBytes(t.artifactSize)}
                </div>
              )}
            </button>
          );
        })}
      </div>

      {/* Completed build summary */}
      {targets.some((t) => t.completedAt && t.startedAt) && (
        <div className="flex gap-2 flex-wrap">
          {targets
            .filter((t) => t.completedAt && t.startedAt)
            .map((t) => (
              <div
                key={t.target}
                className={`flex items-center gap-1.5 px-2 py-1 rounded text-[10px] ${STATUS_COLORS[t.status]}`}
              >
                <span className="font-mono">{t.target}</span>
                <span>{formatDuration(t.completedAt! - t.startedAt!)}</span>
                {t.errorCount > 0 && (
                  <span className="text-red-400">{t.errorCount}E</span>
                )}
                {t.warningCount > 0 && (
                  <span className="text-yellow-400">{t.warningCount}W</span>
                )}
              </div>
            ))}
        </div>
      )}
    </div>
  );
}

// =============================================================================
// SUB-COMPONENT: DeploymentPipeline
// =============================================================================

interface DeploymentPipelineProps {
  pipelines: DeployPipelineState[];
  onTrigger: (name: string, env: 'staging' | 'production' | 'preview') => void;
  onCancel: (id: string) => void;
}

function DeploymentPipeline({ pipelines, onTrigger, onCancel }: DeploymentPipelineProps) {
  const [selectedEnv, setSelectedEnv] = useState<'staging' | 'production' | 'preview'>('staging');

  const stageStatusIcon = (status: DeployStageStatus): string => {
    switch (status) {
      case 'pending':
        return '-';
      case 'running':
        return '~';
      case 'passed':
        return '+';
      case 'failed':
        return 'x';
      case 'skipped':
        return '/';
    }
  };

  const stageStatusColor = (status: DeployStageStatus): string => {
    switch (status) {
      case 'pending':
        return 'bg-gray-500/20 text-gray-400';
      case 'running':
        return 'bg-blue-500/20 text-blue-400 animate-pulse';
      case 'passed':
        return 'bg-emerald-500/20 text-emerald-400';
      case 'failed':
        return 'bg-red-500/20 text-red-400';
      case 'skipped':
        return 'bg-gray-500/10 text-gray-500';
    }
  };

  return (
    <div className="space-y-3">
      {/* Header + trigger */}
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-studio-text">Deployment Pipeline</span>
        <div className="flex items-center gap-1.5">
          <select
            value={selectedEnv}
            onChange={(e) =>
              setSelectedEnv(e.target.value as 'staging' | 'production' | 'preview')
            }
            className="px-2 py-1 text-[10px] bg-studio-panel border border-studio-border rounded text-studio-text"
          >
            <option value="preview">Preview</option>
            <option value="staging">Staging</option>
            <option value="production">Production</option>
          </select>
          <button
            onClick={() => onTrigger(`deploy-${Date.now()}`, selectedEnv)}
            className="px-2 py-1 text-[11px] bg-sky-500/20 text-sky-400 rounded hover:bg-sky-500/30 transition"
          >
            Deploy
          </button>
        </div>
      </div>

      {/* Pipeline list */}
      {pipelines.length === 0 && (
        <div className="text-center text-studio-muted text-[11px] py-6">
          No deployments yet. Trigger a deployment above.
        </div>
      )}

      <div className="space-y-2 max-h-[300px] overflow-y-auto">
        {pipelines.map((pipeline) => (
          <div
            key={pipeline.id}
            className="bg-studio-panel/50 rounded-lg border border-studio-border/50 p-2.5"
          >
            {/* Pipeline header */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${
                    pipeline.environment === 'production'
                      ? 'bg-red-500/20 text-red-400'
                      : pipeline.environment === 'staging'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-blue-500/20 text-blue-400'
                  }`}
                >
                  {pipeline.environment.toUpperCase()}
                </span>
                <span className="text-[10px] font-mono text-studio-muted">
                  {pipeline.commitHash}
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <span
                  className={`text-[9px] px-1.5 py-0.5 rounded ${
                    pipeline.status === 'running'
                      ? 'bg-blue-500/20 text-blue-400'
                      : pipeline.status === 'succeeded'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : pipeline.status === 'failed'
                          ? 'bg-red-500/20 text-red-400'
                          : 'bg-gray-500/20 text-gray-400'
                  }`}
                >
                  {pipeline.status}
                </span>
                {pipeline.status === 'running' && (
                  <button
                    onClick={() => onCancel(pipeline.id)}
                    className="text-[9px] px-1 py-0.5 bg-red-500/10 text-red-400 rounded hover:bg-red-500/20"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>

            {/* Stages visualization */}
            <div className="flex gap-0.5 items-center">
              {pipeline.stages.map((s, idx) => (
                <React.Fragment key={s.stage}>
                  <div
                    className={`flex-1 px-1 py-1 rounded text-center text-[8px] ${stageStatusColor(s.status)}`}
                    title={`${STAGE_LABELS[s.stage]}: ${s.status}`}
                  >
                    <div className="font-mono font-bold">{stageStatusIcon(s.status)}</div>
                    <div className="truncate">{STAGE_LABELS[s.stage]}</div>
                  </div>
                  {idx < pipeline.stages.length - 1 && (
                    <div className="text-studio-muted text-[8px]">&rarr;</div>
                  )}
                </React.Fragment>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// SUB-COMPONENT: ErrorLogViewer
// =============================================================================

interface ErrorLogViewerProps {
  logs: LogEntry[];
  filter: LogLevel | 'all';
  onFilterChange: (filter: LogLevel | 'all') => void;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onClear: () => void;
  counts: Record<LogLevel, number>;
}

function ErrorLogViewer({
  logs,
  filter,
  onFilterChange,
  searchQuery,
  onSearchChange,
  onClear,
  counts,
}: ErrorLogViewerProps) {
  const logContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);

  useEffect(() => {
    if (autoScroll && logContainerRef.current) {
      logContainerRef.current.scrollTop = 0;
    }
  }, [logs, autoScroll]);

  const formatTime = (ts: number) => {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-US', { hour12: false }) + '.' + String(d.getMilliseconds()).padStart(3, '0');
  };

  return (
    <div className="space-y-2">
      {/* Controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          {(['all', 'error', 'warning', 'info', 'debug'] as const).map((level) => (
            <button
              key={level}
              onClick={() => onFilterChange(level)}
              className={`px-1.5 py-0.5 rounded text-[10px] transition ${
                filter === level
                  ? level === 'all'
                    ? 'bg-studio-accent/20 text-studio-accent'
                    : LEVEL_COLORS[level as LogLevel]
                  : 'bg-studio-panel/40 text-studio-muted hover:text-studio-text'
              }`}
            >
              {level === 'all' ? 'All' : `${level} (${counts[level as LogLevel]})`}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <label className="flex items-center gap-1 text-[10px] text-studio-muted">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="h-3 w-3"
            />
            Auto-scroll
          </label>
          <button
            onClick={onClear}
            className="px-2 py-0.5 text-[10px] bg-red-500/10 text-red-400 rounded hover:bg-red-500/20 transition"
          >
            Clear
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        type="text"
        value={searchQuery}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search logs..."
        className="w-full px-2 py-1 text-[11px] bg-studio-panel/60 border border-studio-border/50 rounded text-studio-text placeholder:text-studio-muted/50 focus:outline-none focus:ring-1 focus:ring-studio-accent/40"
      />

      {/* Log stream */}
      <div
        ref={logContainerRef}
        className="max-h-[250px] overflow-y-auto space-y-0.5 font-mono text-[10px]"
      >
        {logs.length === 0 && (
          <div className="text-center text-studio-muted py-4">
            No log entries match current filters.
          </div>
        )}
        {logs.map((entry) => (
          <div
            key={entry.id}
            className={`flex flex-col rounded px-2 py-0.5 cursor-pointer transition hover:brightness-110 ${LEVEL_COLORS[entry.level]}`}
            onClick={() => setExpandedLog(expandedLog === entry.id ? null : entry.id)}
          >
            <div className="flex items-center gap-2">
              <span className="text-[9px] opacity-60 shrink-0 w-[80px]">
                {formatTime(entry.timestamp)}
              </span>
              <span className="text-[9px] opacity-70 shrink-0 w-[70px] truncate">
                [{entry.source}]
              </span>
              <span className="truncate flex-1">{entry.message}</span>
              {entry.file && (
                <span className="text-[8px] opacity-50 shrink-0">
                  {entry.file}
                  {entry.line ? `:${entry.line}` : ''}
                </span>
              )}
            </div>
            {expandedLog === entry.id && entry.details && (
              <div className="mt-1 ml-[152px] text-[9px] opacity-70 whitespace-pre-wrap">
                {entry.details}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT: StudioOperationsHub
// =============================================================================

export function StudioOperationsHub({
  onClose,
  initialTab = 'build',
}: StudioOperationsHubProps) {
  const [activeTab, setActiveTab] = useState<'build' | 'deploy' | 'logs'>(initialTab);
  const build = useBuildStatus();
  const deploy = useDeploymentPipeline();
  const errorLogs = useErrorLogs();

  const tabs = [
    {
      id: 'build' as const,
      label: 'Build',
      badge: build.targets.filter((t) => t.status === 'failed').length || undefined,
    },
    {
      id: 'deploy' as const,
      label: 'Deploy',
      badge: deploy.pipelines.filter((p) => p.status === 'running').length || undefined,
    },
    {
      id: 'logs' as const,
      label: 'Logs',
      badge: errorLogs.counts.error || undefined,
    },
  ];

  return (
    <div className="flex flex-col bg-studio-surface rounded-lg border border-studio-border shadow-xl overflow-hidden">
      {/* Title bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-studio-border bg-studio-panel/50">
        <h2 className="text-sm font-bold text-studio-text">Operations Hub</h2>
        <div className="flex items-center gap-2">
          {/* Tab buttons */}
          <div className="flex bg-studio-panel rounded-md p-0.5">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`relative px-3 py-1 text-[11px] rounded transition ${
                  activeTab === tab.id
                    ? 'bg-studio-accent/20 text-studio-accent font-semibold'
                    : 'text-studio-muted hover:text-studio-text'
                }`}
              >
                {tab.label}
                {tab.badge != null && tab.badge > 0 && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[8px] rounded-full w-3.5 h-3.5 flex items-center justify-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
          {onClose && (
            <button
              onClick={onClose}
              className="text-studio-muted hover:text-studio-text transition p-1"
              title="Close"
            >
              X
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="p-4 min-h-[320px]">
        {activeTab === 'build' && (
          <BuildStatusPanel
            targets={build.targets}
            isBuilding={build.isBuilding}
            onStartBuild={build.startBuild}
            onCancel={build.cancelBuild}
            onReset={build.resetAll}
          />
        )}
        {activeTab === 'deploy' && (
          <DeploymentPipeline
            pipelines={deploy.pipelines}
            onTrigger={deploy.triggerDeploy}
            onCancel={deploy.cancelPipeline}
          />
        )}
        {activeTab === 'logs' && (
          <ErrorLogViewer
            logs={errorLogs.logs}
            filter={errorLogs.filter}
            onFilterChange={errorLogs.setFilter}
            searchQuery={errorLogs.searchQuery}
            onSearchChange={errorLogs.setSearchQuery}
            onClear={errorLogs.clearLogs}
            counts={errorLogs.counts}
          />
        )}
      </div>
    </div>
  );
}

export default StudioOperationsHub;
