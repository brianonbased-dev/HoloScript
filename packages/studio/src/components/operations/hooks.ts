import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { DEBOUNCE_INPUT } from '@/lib/ui-timings';
import {
  BuildTarget,
  BuildStatus,
  BuildTargetStatus,
  DeployStage,
  DeployStageStatus,
  DeployPipelineState,
  DeployStageState,
  LogLevel,
  LogEntry,
} from './types';

// =============================================================================
// CONSTANTS
// =============================================================================

export const TARGET_ICONS: Record<BuildTarget, string> = {
  web: 'W',
  ios: 'I',
  android: 'A',
  visionos: 'V',
  quest: 'Q',
  desktop: 'D',
  wasm: 'WA',
};

export const STAGE_LABELS: Record<DeployStage, string> = {
  validate: 'Validate',
  bundle: 'Bundle',
  optimize: 'Optimize',
  upload: 'Upload',
  provision: 'Provision',
  health_check: 'Health Check',
  live: 'Go Live',
};

export const LEVEL_COLORS: Record<LogLevel, string> = {
  error: 'text-red-400 bg-red-500/10',
  warning: 'text-yellow-400 bg-yellow-500/10',
  info: 'text-blue-400 bg-blue-500/10',
  debug: 'text-gray-400 bg-gray-500/10',
};

export const STATUS_COLORS: Record<BuildStatus, string> = {
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

export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// =============================================================================
// HOOKS
// =============================================================================

export function useBuildStatus() {
  const [targets, setTargets] = useState<BuildTargetStatus[]>(() =>
    (['web', 'ios', 'android', 'visionos', 'quest', 'desktop', 'wasm'] as BuildTarget[]).map(
      (target) => ({
        target,
        status: 'idle' as BuildStatus,
        progress: 0,
        errorCount: 0,
        warningCount: 0,
      })
    )
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
            : t
        )
      );

      // Simulate progressive build
      const _tick = 0;
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
    [isBuilding]
  );

  const cancelBuild = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setIsBuilding(false);
    setTargets((prev) =>
      prev.map((t) =>
        t.status === 'building' || t.status === 'queued'
          ? { ...t, status: 'cancelled', completedAt: Date.now() }
          : t
      )
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
      }))
    );
  }, []);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  return { targets, isBuilding, startBuild, cancelBuild, resetAll };
}

export function useDeploymentPipeline() {
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
          })
        );

        setPipelines((prev) => {
          const target = prev.find((p) => p.id === pipeline.id);
          if (target && target.status === 'running' && currentStageIdx < target.stages.length) {
            setTimeout(advanceStage, 800 + Math.random() * 1200);
          }
          return prev;
        });
      };

      setTimeout(advanceStage, DEBOUNCE_INPUT);
    },
    []
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
                  : s
              ),
            }
          : p
      )
    );
  }, []);

  return { pipelines, triggerDeploy, cancelPipeline };
}

export function useErrorLogs() {
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
          (l.file && l.file.toLowerCase().includes(q))
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
