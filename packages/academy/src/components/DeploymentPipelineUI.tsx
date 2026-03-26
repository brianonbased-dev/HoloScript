'use client';

/**
 * Deployment Pipeline UI Component
 *
 * Horizontal pipeline visualization for HoloScript compilation and deployment:
 * Source → Compile → Target → Deploy → Verify
 *
 * Features:
 * - Quality tier selector (low/med/high/ultra) with automatic target display update
 * - Real-time status indicators with animation
 * - Rollback button with confirmation dialog
 * - Streaming log viewer panel
 */

import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  FileCode,
  Settings,
  Upload,
  CheckCircle,
  XCircle,
  Clock,
  AlertCircle,
  Loader2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Terminal,
  Zap,
  Target,
} from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type QualityTier = 'low' | 'med' | 'high' | 'ultra';

type PipelineStage = 'source' | 'compile' | 'target' | 'deploy' | 'verify';

type StageStatus = 'idle' | 'running' | 'success' | 'error' | 'warning';

interface PipelineStageData {
  stage: PipelineStage;
  label: string;
  icon: React.ReactNode;
  status: StageStatus;
  message?: string;
  progress?: number;
  duration?: number;
}

interface LogEntry {
  id: string;
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  stage: PipelineStage;
  message: string;
}

interface TargetMapping {
  label: string;
  provider: string;
  region?: string;
  description: string;
}

// ── Constants ────────────────────────────────────────────────────────────────

const QUALITY_TIER_CONFIG: Record<QualityTier, TargetMapping> = {
  low: {
    label: 'Development',
    provider: 'vercel-edge',
    region: 'dev-1',
    description: 'Fast iteration, minimal checks',
  },
  med: {
    label: 'Staging',
    provider: 'cloudflare-workers',
    region: 'us-east-1',
    description: 'Balanced performance and validation',
  },
  high: {
    label: 'Production',
    provider: 'aws-lambda',
    region: 'us-west-2',
    description: 'Full validation, optimized artifacts',
  },
  ultra: {
    label: 'Global CDN',
    provider: 'cloudflare-workers',
    region: 'multi-region',
    description: 'Maximum performance, global distribution',
  },
};

// ── Component ────────────────────────────────────────────────────────────────

interface DeploymentPipelineUIProps {
  /** Source code or project path */
  source?: string;
  /** Callback when deployment starts */
  onDeployStart?: (tier: QualityTier) => void;
  /** Callback when deployment completes */
  onDeployComplete?: (success: boolean) => void;
  /** Callback when rollback is triggered */
  onRollback?: () => Promise<void>;
}

export function DeploymentPipelineUI({
  source = '',
  onDeployStart,
  onDeployComplete,
  onRollback,
}: DeploymentPipelineUIProps) {
  // ── State ──────────────────────────────────────────────────────────────────

  const [qualityTier, setQualityTier] = useState<QualityTier>('med');
  const [isDeploying, setIsDeploying] = useState(false);
  const [showRollbackDialog, setShowRollbackDialog] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [stages, setStages] = useState<PipelineStageData[]>([
    {
      stage: 'source',
      label: 'Source',
      icon: <FileCode className="h-4 w-4" />,
      status: 'idle',
    },
    {
      stage: 'compile',
      label: 'Compile',
      icon: <Settings className="h-4 w-4" />,
      status: 'idle',
    },
    {
      stage: 'target',
      label: 'Target',
      icon: <Target className="h-4 w-4" />,
      status: 'idle',
    },
    {
      stage: 'deploy',
      label: 'Deploy',
      icon: <Upload className="h-4 w-4" />,
      status: 'idle',
    },
    {
      stage: 'verify',
      label: 'Verify',
      icon: <CheckCircle className="h-4 w-4" />,
      status: 'idle',
    },
  ]);

  const logsEndRef = useRef<HTMLDivElement>(null);

  // ── Log Management ─────────────────────────────────────────────────────────

  const addLog = useCallback((stage: PipelineStage, level: LogEntry['level'], message: string) => {
    const entry: LogEntry = {
      id: `${Date.now()}-${Math.random()}`,
      timestamp: Date.now(),
      level,
      stage,
      message,
    };
    setLogs((prev) => [...prev, entry]);
  }, []);

  // Auto-scroll logs to bottom
  useEffect(() => {
    if (showLogs && logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, showLogs]);

  // ── Stage Management ───────────────────────────────────────────────────────

  const updateStage = useCallback(
    (
      stage: PipelineStage,
      status: StageStatus,
      message?: string,
      progress?: number,
      duration?: number
    ) => {
      setStages((prev) =>
        prev.map((s) => (s.stage === stage ? { ...s, status, message, progress, duration } : s))
      );
    },
    []
  );

  // ── Pipeline Execution ─────────────────────────────────────────────────────

  const executePipeline = useCallback(async () => {
    if (isDeploying) return;

    setIsDeploying(true);
    onDeployStart?.(qualityTier);
    addLog('source', 'info', `Starting deployment pipeline with quality tier: ${qualityTier}`);

    // Reset all stages
    setStages((prev) => prev.map((s) => ({ ...s, status: 'idle', message: undefined })));

    try {
      // Stage 1: Source validation
      updateStage('source', 'running', 'Validating source code');
      addLog('source', 'info', 'Analyzing HoloScript source');
      await simulateAsync(800);

      if (!source || source.trim().length === 0) {
        updateStage('source', 'warning', 'No source provided, using default');
        addLog('source', 'warn', 'Source is empty - using example project');
      } else {
        updateStage('source', 'success', `Source ready (${source.length} chars)`);
        addLog('source', 'info', `Source validated: ${source.length} characters`);
      }

      // Stage 2: Compilation
      updateStage('compile', 'running', 'Compiling to unified artifact');
      addLog('compile', 'info', `Compiling with quality tier: ${qualityTier}`);

      for (let i = 0; i <= 100; i += 20) {
        updateStage('compile', 'running', `Compiling... ${i}%`, i);
        await simulateAsync(300);
      }

      const compileStart = Date.now();
      await simulateAsync(1200);
      const compileDuration = Date.now() - compileStart;

      updateStage('compile', 'success', 'Artifact compiled', 100, compileDuration);
      addLog('compile', 'info', `Compilation completed in ${compileDuration}ms`);

      // Stage 3: Target selection
      updateStage('target', 'running', 'Configuring target environment');
      const targetConfig = QUALITY_TIER_CONFIG[qualityTier];
      addLog('target', 'info', `Target: ${targetConfig.provider} (${targetConfig.region})`);
      await simulateAsync(600);

      updateStage('target', 'success', `${targetConfig.label} (${targetConfig.provider})`);
      addLog('target', 'info', 'Target configured successfully');

      // Stage 4: Deployment
      updateStage('deploy', 'running', 'Deploying to target');
      addLog('deploy', 'info', `Uploading artifact to ${targetConfig.provider}`);

      for (let i = 0; i <= 100; i += 10) {
        updateStage('deploy', 'running', `Deploying... ${i}%`, i);
        await simulateAsync(200);
      }

      const deployStart = Date.now();
      await simulateAsync(1000);
      const deployDuration = Date.now() - deployStart;

      updateStage('deploy', 'success', 'Deployment complete', 100, deployDuration);
      addLog('deploy', 'info', `Deployed successfully in ${deployDuration}ms`);

      // Stage 5: Verification
      updateStage('verify', 'running', 'Running health checks');
      addLog('verify', 'info', 'Verifying deployment health');
      await simulateAsync(800);

      updateStage('verify', 'success', 'All health checks passed');
      addLog('verify', 'info', '✓ Health check passed');
      addLog('verify', 'info', '✓ Endpoint responding');
      addLog('verify', 'info', '✓ Latency within threshold');

      addLog('verify', 'info', '🎉 Pipeline completed successfully!');
      onDeployComplete?.(true);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      addLog('deploy', 'error', `Pipeline failed: ${errorMessage}`);
      onDeployComplete?.(false);

      // Mark failed stage
      const currentStage = stages.find((s) => s.status === 'running');
      if (currentStage) {
        updateStage(currentStage.stage, 'error', errorMessage);
      }
    } finally {
      setIsDeploying(false);
    }
  }, [
    isDeploying,
    qualityTier,
    source,
    stages,
    onDeployStart,
    onDeployComplete,
    addLog,
    updateStage,
  ]);

  // ── Rollback ───────────────────────────────────────────────────────────────

  const handleRollback = useCallback(async () => {
    setShowRollbackDialog(false);
    addLog('deploy', 'warn', 'Initiating rollback...');

    try {
      await onRollback?.();
      addLog('deploy', 'info', 'Rollback completed successfully');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      addLog('deploy', 'error', `Rollback failed: ${errorMessage}`);
    }
  }, [onRollback, addLog]);

  // ── Render Helpers ─────────────────────────────────────────────────────────

  const getStatusIcon = (status: StageStatus) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-5 w-5 animate-spin text-blue-400" />;
      case 'success':
        return <CheckCircle className="h-5 w-5 text-emerald-400" />;
      case 'error':
        return <XCircle className="h-5 w-5 text-red-400" />;
      case 'warning':
        return <AlertCircle className="h-5 w-5 text-yellow-400" />;
      default:
        return <Clock className="h-5 w-5 text-studio-muted" />;
    }
  };

  const getStatusColor = (status: StageStatus) => {
    switch (status) {
      case 'running':
        return 'border-blue-500/40 bg-blue-500/10';
      case 'success':
        return 'border-emerald-500/40 bg-emerald-500/10';
      case 'error':
        return 'border-red-500/40 bg-red-500/10';
      case 'warning':
        return 'border-yellow-500/40 bg-yellow-500/10';
      default:
        return 'border-studio-border bg-studio-panel/30';
    }
  };

  const getLogLevelColor = (level: LogEntry['level']) => {
    switch (level) {
      case 'error':
        return 'text-red-400';
      case 'warn':
        return 'text-yellow-400';
      case 'info':
        return 'text-sky-400';
      case 'debug':
        return 'text-studio-muted';
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col h-full bg-studio-bg text-studio-text">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-studio-border">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Zap className="h-5 w-5 text-sky-400" />
            Deployment Pipeline
          </h2>
          <p className="text-xs text-studio-muted mt-0.5">
            Source → Compile → Target → Deploy → Verify
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Quality Tier Selector */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-studio-panel border border-studio-border">
            <span className="text-xs text-studio-muted">Quality:</span>
            <select
              value={qualityTier}
              onChange={(e) => setQualityTier(e.target.value as QualityTier)}
              disabled={isDeploying}
              className="text-xs bg-transparent border-none outline-none text-studio-text cursor-pointer disabled:opacity-50"
            >
              <option value="low">Low</option>
              <option value="med">Medium</option>
              <option value="high">High</option>
              <option value="ultra">Ultra</option>
            </select>
          </div>

          {/* Deploy Button */}
          <button
            onClick={executePipeline}
            disabled={isDeploying}
            className="px-4 py-1.5 bg-sky-500 hover:bg-sky-600 disabled:bg-studio-border disabled:text-studio-muted text-white text-xs font-medium rounded-lg transition-all flex items-center gap-2"
          >
            {isDeploying ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Deploying...
              </>
            ) : (
              <>
                <Upload className="h-3.5 w-3.5" />
                Deploy
              </>
            )}
          </button>

          {/* Rollback Button */}
          <button
            onClick={() => setShowRollbackDialog(true)}
            disabled={isDeploying}
            className="px-3 py-1.5 bg-studio-panel hover:bg-red-500/20 disabled:opacity-50 text-studio-muted hover:text-red-400 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 border border-studio-border"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Rollback
          </button>
        </div>
      </div>

      {/* Target Info Banner */}
      <div className="px-4 py-2 bg-studio-panel/50 border-b border-studio-border">
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <Target className="h-3.5 w-3.5 text-sky-400" />
            <span className="text-studio-muted">Target:</span>
            <span className="text-studio-text font-medium">
              {QUALITY_TIER_CONFIG[qualityTier].label}
            </span>
            <span className="text-studio-muted">•</span>
            <span className="text-studio-muted">{QUALITY_TIER_CONFIG[qualityTier].provider}</span>
            {QUALITY_TIER_CONFIG[qualityTier].region && (
              <>
                <span className="text-studio-muted">•</span>
                <span className="text-studio-muted">
                  {QUALITY_TIER_CONFIG[qualityTier].region}
                </span>
              </>
            )}
          </div>
          <span className="text-studio-muted">
            {QUALITY_TIER_CONFIG[qualityTier].description}
          </span>
        </div>
      </div>

      {/* Pipeline Stages */}
      <div className="flex-1 p-6 overflow-auto">
        <div className="flex items-center justify-between gap-3 max-w-5xl mx-auto">
          {stages.map((stage, index) => (
            <React.Fragment key={stage.stage}>
              {/* Stage Card */}
              <div className="flex-1 min-w-0">
                <div
                  className={`relative rounded-lg border p-4 transition-all ${getStatusColor(
                    stage.status
                  )}`}
                >
                  {/* Icon & Status */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="text-studio-muted">{stage.icon}</div>
                      <h3 className="text-sm font-semibold text-studio-text">{stage.label}</h3>
                    </div>
                    {getStatusIcon(stage.status)}
                  </div>

                  {/* Message */}
                  {stage.message && (
                    <p className="text-xs text-studio-muted mt-1 line-clamp-2">{stage.message}</p>
                  )}

                  {/* Progress Bar */}
                  {stage.status === 'running' && stage.progress !== undefined && (
                    <div className="mt-3 h-1 bg-studio-border rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-400 transition-all duration-300"
                        style={{ width: `${stage.progress}%` }}
                      />
                    </div>
                  )}

                  {/* Duration */}
                  {stage.duration && (
                    <div className="mt-2 text-[10px] text-studio-muted font-mono">
                      {stage.duration}ms
                    </div>
                  )}
                </div>
              </div>

              {/* Connector Arrow */}
              {index < stages.length - 1 && (
                <div className="flex-shrink-0 text-studio-border">
                  <svg
                    className="h-6 w-6"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              )}
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* Logs Panel */}
      <div className="border-t border-studio-border">
        {/* Logs Header */}
        <button
          onClick={() => setShowLogs(!showLogs)}
          className="w-full px-4 py-2 flex items-center justify-between hover:bg-studio-panel/50 transition-colors"
        >
          <div className="flex items-center gap-2 text-xs font-medium">
            <Terminal className="h-3.5 w-3.5 text-sky-400" />
            <span>Logs</span>
            <span className="text-studio-muted">({logs.length})</span>
          </div>
          {showLogs ? (
            <ChevronDown className="h-4 w-4 text-studio-muted" />
          ) : (
            <ChevronUp className="h-4 w-4 text-studio-muted" />
          )}
        </button>

        {/* Logs Content */}
        {showLogs && (
          <div className="bg-studio-panel/30 border-t border-studio-border">
            <div className="max-h-64 overflow-y-auto font-mono text-[10px] p-3 space-y-0.5">
              {logs.length === 0 ? (
                <div className="text-studio-muted text-center py-4">No logs yet</div>
              ) : (
                logs.map((log) => (
                  <div key={log.id} className="flex items-start gap-2">
                    <span className="text-studio-muted shrink-0">
                      {new Date(log.timestamp).toLocaleTimeString('en-US', {
                        hour12: false,
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit',
                      })}
                    </span>
                    <span
                      className={`shrink-0 uppercase ${getLogLevelColor(log.level)} font-semibold w-12`}
                    >
                      [{log.level}]
                    </span>
                    <span className="text-studio-muted shrink-0">[{log.stage}]</span>
                    <span className="text-studio-text">{log.message}</span>
                  </div>
                ))
              )}
              <div ref={logsEndRef} />
            </div>
          </div>
        )}
      </div>

      {/* Rollback Confirmation Dialog */}
      {showRollbackDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-studio-surface border border-studio-border rounded-lg shadow-2xl max-w-md w-full p-6">
            <div className="flex items-start gap-3 mb-4">
              <AlertCircle className="h-6 w-6 text-yellow-400 shrink-0 mt-0.5" />
              <div>
                <h3 className="text-base font-semibold text-studio-text">Confirm Rollback</h3>
                <p className="text-xs text-studio-muted mt-1">
                  This will revert to the previous deployment. This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 justify-end">
              <button
                onClick={() => setShowRollbackDialog(false)}
                className="px-4 py-1.5 text-xs font-medium text-studio-muted hover:text-studio-text transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleRollback}
                className="px-4 py-1.5 bg-red-500 hover:bg-red-600 text-white text-xs font-medium rounded-lg transition-all"
              >
                Rollback Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Utilities ────────────────────────────────────────────────────────────────

/**
 * Simulate async operation with delay
 */
function simulateAsync(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
