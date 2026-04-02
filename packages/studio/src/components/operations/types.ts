export type BuildTarget = 'web' | 'ios' | 'android' | 'visionos' | 'quest' | 'desktop' | 'wasm';

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
