export type DaemonProjectKind =
  | 'service'
  | 'frontend'
  | 'data'
  | 'automation'
  | 'agent-backend'
  | 'library'
  | 'spatial'
  | 'unknown';

export type DaemonPlanProfile =
  | 'service'
  | 'frontend'
  | 'data'
  | 'automation'
  | 'agent-backend'
  | 'spatial';

// Current Studio job execution presets.
export type DaemonProfile = 'quick' | 'balanced' | 'deep';

export type DaemonPass =
  | 'absorb'
  | 'typefix'
  | 'docs'
  | 'coverage'
  | 'complexity'
  | 'target-sweep'
  | 'trait-sampling'
  | 'runtime-matrix'
  | 'absorb-roundtrip'
  | 'security-scan'
  | 'contract-check'
  | 'retry-backoff-check';

export type DaemonJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export interface ProjectDNA {
  kind: DaemonProjectKind;
  confidence: number;
  languages: string[];
  frameworks: string[];
  packageManagers: string[];
  runtimes: string[];
  repoShape: 'single-package' | 'monorepo' | 'polyglot' | 'unknown';
  riskSignals: string[];
  strengths: string[];
  recommendedProfile: DaemonPlanProfile;
  recommendedMode: DaemonProfile;
}

export interface ManifestData {
  fileName: string;
  buildSystem: string;
  dependencyCount: number;
  devDependencyCount: number;
  keyDependencies: string[];
  scripts: string[];
}

// Backward-compatible Studio upload/job DNA shape already used by the UI.
export interface DaemonProjectDNA {
  kind: Exclude<DaemonProjectKind, 'library' | 'agent-backend'> | 'unknown';
  confidence: number;
  detectedStack: string[];
  recommendedProfile: DaemonProfile;
  notes: string[];
  manifests?: ManifestData[];
  projectDNA?: ProjectDNA;
}

export interface DaemonPlan {
  profile: DaemonPlanProfile;
  mode: DaemonProfile;
  passes: DaemonPass[];
  maxFiles: number;
  maxCycles: number;
  tokenBudget: number;
  requiresHumanReview: boolean;
}

export interface PatchProposal {
  id: string;
  filePath: string;
  action: 'create' | 'modify' | 'delete';
  diff: string | null;
  proposedContent: string | null;
  description: string;
  confidence: number;
  category: 'typefix' | 'test' | 'docs' | 'lint' | 'refactor' | 'coverage';
}

export interface DaemonLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error';
  message: string;
}

export interface DaemonJobLimits {
  maxCycles: number;
  maxTokens: number;
  maxFilesChanged: number;
  timeoutMs: number;
  protectedPaths: string[];
}

export interface DaemonJobMetrics {
  qualityDelta: number;
  qualityBefore: number;
  qualityAfter: number;
  filesChanged: number;
  filesAnalyzed: number;
  cycles: number;
  durationMs: number;
}

export interface DaemonJob {
  id: string;
  projectId: string;
  profile: DaemonProfile;
  plan?: DaemonPlan;
  projectDna: DaemonProjectDNA;
  status: DaemonJobStatus;
  createdAt: string;
  updatedAt: string;
  progress: number;
  statusMessage?: string;
  summary?: string;
  metrics?: DaemonJobMetrics;
  patches?: PatchProposal[];
  logs?: DaemonLogEntry[];
  limits?: DaemonJobLimits;
  projectPath?: string;
  error?: string;
}

export interface CreateDaemonJobInput {
  projectId: string;
  profile: DaemonProfile;
  projectDna: DaemonProjectDNA;
  projectPath?: string;
  customLimits?: Partial<DaemonJobLimits>;
}
