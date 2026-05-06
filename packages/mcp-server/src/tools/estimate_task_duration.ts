import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';

type PercentileKey = 'min' | 'p50' | 'p90' | 'p99' | 'max' | 'mean';
type WindowKey = 'last7d' | 'last30d';

interface PercentileStats {
  n: number;
  min: number;
  p50: number;
  p90: number;
  p99: number;
  max: number;
  mean: number;
}

interface TaskTypeStats {
  taskType: string;
  commitCount: number;
  boundToTaskPct: number;
  distinctAuthors: number;
  repos: Record<string, number>;
  interCommitGapSecs: PercentileStats | null;
}

interface TaskDurationStats {
  taskCount: number;
  durationSecs: PercentileStats;
}

interface AgentTimeArtifact {
  generatedAt: string;
  windowSinceLabel: string;
  windowSinceGit: string;
  totals?: {
    bindingCoveragePct?: number;
    boundCommits?: number;
    boundTasks?: number;
  };
  taxonomy?: Array<{ taskType: string; n: number }>;
  taskTypeStats: Record<string, TaskTypeStats>;
  taskDurations?: Record<string, TaskDurationStats>;
  caveats?: string[];
}

interface DurationAlternative {
  taskType: string;
  estimateSecs: number | null;
  sampleSize: number;
  commitCount: number;
  basis: EstimateBasis;
}

type EstimateBasis = 'multi_commit_task_duration' | 'inter_commit_gap_proxy' | 'taxonomy_only';

export interface EstimateTaskDurationResult {
  success: boolean;
  status: 'ok' | 'catalog' | 'not_found' | 'no_data';
  requestedTaskType?: string;
  inferredTaskType?: string;
  matchedTaskType?: string;
  percentile: PercentileKey;
  estimateSecs?: number;
  estimateMinutes?: number;
  estimateHours?: number;
  basis?: EstimateBasis;
  confidence: 'none' | 'low' | 'medium' | 'high';
  sampleSize: number;
  commitCount?: number;
  boundToTaskPct?: number;
  window: {
    requested: WindowKey;
    label?: string;
    sinceGit?: string;
    generatedAt?: string;
  };
  sourcePath?: string;
  alternatives: DurationAlternative[];
  caveats: string[];
  message?: string;
}

interface EstimateTaskDurationArgs {
  taskType?: string;
  taskTitle?: string;
  percentile?: PercentileKey;
  window?: WindowKey;
  dataPath?: string;
  sourceRoot?: string;
  maxAlternatives?: number;
  includeCaveats?: boolean;
}

export const estimateTaskDurationTools: Tool[] = [
  {
    name: 'holo_estimate_task_duration',
    description:
      'Estimate agent task duration from the latest agent-time mined artifact. ' +
      'Use taskType for known taxonomy buckets (for example fix-core, feat-mcp, docs-paper), ' +
      'or taskTitle to infer a bucket from a conventional-commit-style title. ' +
      'Returns: JSON with estimate seconds/minutes/hours, evidence basis, confidence, source artifact, alternatives, and caveats.',
    inputSchema: {
      type: 'object',
      properties: {
        taskType: {
          type: 'string',
          description:
            'Agent-time taxonomy bucket, e.g. feat-mcp, fix-core, docs-paper, audit, refactor.',
        },
        taskTitle: {
          type: 'string',
          description:
            'Optional task title or conventional commit subject to classify when taskType is not provided.',
        },
        percentile: {
          type: 'string',
          enum: ['min', 'p50', 'p90', 'p99', 'max', 'mean'],
          description: 'Duration percentile to return. Defaults to p50.',
        },
        window: {
          type: 'string',
          enum: ['last7d', 'last30d'],
          description: 'Agent-time artifact window to use. Defaults to last30d.',
        },
        dataPath: {
          type: 'string',
          description:
            'Optional explicit path to an agent-time JSON artifact. Primarily for deterministic tests.',
        },
        sourceRoot: {
          type: 'string',
          description:
            'Optional ai-ecosystem root containing research/agent-time/*.json. Defaults to AI_ECOSYSTEM_ROOT or ~/.ai-ecosystem.',
        },
        maxAlternatives: {
          type: 'number',
          description: 'Maximum alternative task-type rows to return when no exact match exists. Defaults to 5.',
        },
        includeCaveats: {
          type: 'boolean',
          description: 'Include source artifact caveats. Defaults to true.',
        },
      },
    },
  },
];

export async function handleEstimateTaskDurationTool(
  name: string,
  args: Record<string, unknown>
): Promise<EstimateTaskDurationResult | null> {
  if (name !== 'holo_estimate_task_duration') return null;

  const parsed = parseArgs(args);
  const sourcePath = resolveArtifactPath(parsed);
  if (!sourcePath) {
    return {
      success: false,
      status: 'no_data',
      percentile: parsed.percentile,
      confidence: 'none',
      sampleSize: 0,
      window: { requested: parsed.window },
      alternatives: [],
      caveats: [],
      message:
        'No agent-time JSON artifact found. Run scripts/agent-time-mine.mjs or pass dataPath/sourceRoot.',
    };
  }

  const artifact = loadArtifact(sourcePath);
  const requestedTaskType = parsed.taskType?.trim();
  const inferredTaskType =
    requestedTaskType === undefined && parsed.taskTitle
      ? classifyTaskTitle(parsed.taskTitle)
      : undefined;
  const wanted = normalizeTaskType(requestedTaskType || inferredTaskType || '');
  const alternatives = topAlternatives(artifact, parsed.percentile, parsed.maxAlternatives);
  const caveats = parsed.includeCaveats === false ? [] : buildCaveats(artifact);

  if (!wanted) {
    return {
      success: true,
      status: 'catalog',
      percentile: parsed.percentile,
      confidence: 'none',
      sampleSize: 0,
      window: artifactWindow(parsed.window, artifact),
      sourcePath,
      alternatives,
      caveats,
      message: 'Provide taskType or taskTitle to return a specific estimate.',
    };
  }

  const match = resolveTaskType(artifact, wanted);
  if (!match) {
    return {
      success: false,
      status: 'not_found',
      requestedTaskType,
      inferredTaskType,
      percentile: parsed.percentile,
      confidence: 'none',
      sampleSize: 0,
      window: artifactWindow(parsed.window, artifact),
      sourcePath,
      alternatives,
      caveats,
      message: `No task-type bucket matched "${requestedTaskType || inferredTaskType || wanted}".`,
    };
  }

  const estimate = estimateForTaskType(artifact, match, parsed.percentile);
  if (!estimate || estimate.estimateSecs === null) {
    return {
      success: false,
      status: 'no_data',
      requestedTaskType,
      inferredTaskType,
      matchedTaskType: match,
      percentile: parsed.percentile,
      confidence: 'none',
      sampleSize: 0,
      commitCount: artifact.taskTypeStats[match]?.commitCount,
      boundToTaskPct: artifact.taskTypeStats[match]?.boundToTaskPct,
      window: artifactWindow(parsed.window, artifact),
      sourcePath,
      alternatives,
      caveats,
      message: `Task-type "${match}" exists, but has no usable duration or inter-commit-gap sample.`,
    };
  }

  const stats = artifact.taskTypeStats[match];
  return {
    success: true,
    status: 'ok',
    requestedTaskType,
    inferredTaskType,
    matchedTaskType: match,
    percentile: parsed.percentile,
    estimateSecs: estimate.estimateSecs,
    estimateMinutes: round(estimate.estimateSecs / 60, 2),
    estimateHours: round(estimate.estimateSecs / 3600, 2),
    basis: estimate.basis,
    confidence: confidenceFor(estimate.basis, estimate.sampleSize, stats?.boundToTaskPct || 0),
    sampleSize: estimate.sampleSize,
    commitCount: stats?.commitCount,
    boundToTaskPct: stats?.boundToTaskPct,
    window: artifactWindow(parsed.window, artifact),
    sourcePath,
    alternatives,
    caveats,
  };
}

function parseArgs(args: Record<string, unknown>): EstimateTaskDurationArgs & {
  percentile: PercentileKey;
  window: WindowKey;
  maxAlternatives: number;
} {
  const percentile = isPercentile(args.percentile) ? args.percentile : 'p50';
  const window = args.window === 'last7d' ? 'last7d' : 'last30d';
  return {
    taskType: typeof args.taskType === 'string' ? args.taskType : undefined,
    taskTitle: typeof args.taskTitle === 'string' ? args.taskTitle : undefined,
    percentile,
    window,
    dataPath: typeof args.dataPath === 'string' ? args.dataPath : undefined,
    sourceRoot: typeof args.sourceRoot === 'string' ? args.sourceRoot : undefined,
    maxAlternatives:
      typeof args.maxAlternatives === 'number' && Number.isFinite(args.maxAlternatives)
        ? Math.max(0, Math.min(25, Math.floor(args.maxAlternatives)))
        : 5,
    includeCaveats:
      typeof args.includeCaveats === 'boolean' ? args.includeCaveats : undefined,
  };
}

function isPercentile(value: unknown): value is PercentileKey {
  return (
    value === 'min' ||
    value === 'p50' ||
    value === 'p90' ||
    value === 'p99' ||
    value === 'max' ||
    value === 'mean'
  );
}

function resolveArtifactPath(args: EstimateTaskDurationArgs & { window: WindowKey }): string | null {
  const explicit = firstExistingFile([
    args.dataPath,
    process.env.AGENT_TIME_DATA_PATH,
  ]);
  if (explicit) return explicit;

  const roots = [
    args.sourceRoot,
    process.env.AI_ECOSYSTEM_ROOT,
    process.env.AGENT_TIME_ROOT,
    join(homedir(), '.ai-ecosystem'),
  ].filter((p): p is string => typeof p === 'string' && p.trim().length > 0);

  const dirs = roots.flatMap((root) => {
    const resolvedRoot = resolve(root);
    if (basename(resolvedRoot) === 'agent-time') return [resolvedRoot];
    return [join(resolvedRoot, 'research', 'agent-time'), resolvedRoot];
  });

  return newestArtifact(dirs, args.window);
}

function firstExistingFile(paths: Array<string | undefined>): string | null {
  for (const p of paths) {
    if (!p) continue;
    const resolved = resolve(p);
    try {
      if (existsSync(resolved) && statSync(resolved).isFile()) return resolved;
    } catch {
      // Try the next candidate.
    }
  }
  return null;
}

function newestArtifact(dirs: string[], window: WindowKey): string | null {
  const prefix = `agent-time-${window}-to-`;
  const candidates: Array<{ path: string; mtimeMs: number }> = [];
  for (const dir of dirs) {
    try {
      if (!existsSync(dir) || !statSync(dir).isDirectory()) continue;
      for (const name of readdirSync(dir)) {
        if (!name.startsWith(prefix) || !name.endsWith('.json')) continue;
        const filePath = join(dir, name);
        const stat = statSync(filePath);
        if (stat.isFile()) candidates.push({ path: filePath, mtimeMs: stat.mtimeMs });
      }
    } catch {
      // Ignore unreadable roots.
    }
  }
  candidates.sort((a, b) => b.mtimeMs - a.mtimeMs || b.path.localeCompare(a.path));
  return candidates[0]?.path || null;
}

function loadArtifact(path: string): AgentTimeArtifact {
  const parsed = JSON.parse(readFileSync(path, 'utf-8')) as unknown;
  if (!isRecord(parsed) || !isRecord(parsed.taskTypeStats)) {
    throw new Error(`Invalid agent-time artifact: ${path}`);
  }
  return parsed as AgentTimeArtifact;
}

function artifactWindow(requested: WindowKey, artifact: AgentTimeArtifact): EstimateTaskDurationResult['window'] {
  return {
    requested,
    label: artifact.windowSinceLabel,
    sinceGit: artifact.windowSinceGit,
    generatedAt: artifact.generatedAt,
  };
}

function resolveTaskType(artifact: AgentTimeArtifact, wanted: string): string | null {
  const keys = Object.keys(artifact.taskTypeStats);
  const exact = keys.find((k) => normalizeTaskType(k) === wanted);
  if (exact) return exact;

  const prefix = keys.find((k) => normalizeTaskType(k).startsWith(wanted));
  if (prefix) return prefix;

  return null;
}

function estimateForTaskType(
  artifact: AgentTimeArtifact,
  taskType: string,
  percentile: PercentileKey
): { estimateSecs: number | null; sampleSize: number; basis: EstimateBasis } | null {
  const durationStats = artifact.taskDurations?.[taskType];
  if (durationStats?.durationSecs) {
    return {
      estimateSecs: valueAt(durationStats.durationSecs, percentile),
      sampleSize: durationStats.taskCount,
      basis: 'multi_commit_task_duration',
    };
  }

  const taskStats = artifact.taskTypeStats[taskType];
  if (taskStats?.interCommitGapSecs) {
    return {
      estimateSecs: valueAt(taskStats.interCommitGapSecs, percentile),
      sampleSize: taskStats.interCommitGapSecs.n,
      basis: 'inter_commit_gap_proxy',
    };
  }

  if (taskStats) {
    return {
      estimateSecs: null,
      sampleSize: taskStats.commitCount,
      basis: 'taxonomy_only',
    };
  }

  return null;
}

function topAlternatives(
  artifact: AgentTimeArtifact,
  percentile: PercentileKey,
  maxAlternatives: number
): DurationAlternative[] {
  if (maxAlternatives <= 0) return [];

  const byTaxonomy = new Map((artifact.taxonomy || []).map((t) => [t.taskType, t.n]));
  const rows = Object.keys(artifact.taskTypeStats)
    .map((taskType) => {
      const estimate = estimateForTaskType(artifact, taskType, percentile);
      const stats = artifact.taskTypeStats[taskType];
      return {
        taskType,
        estimateSecs: estimate?.estimateSecs ?? null,
        sampleSize: estimate?.sampleSize ?? 0,
        commitCount: stats?.commitCount ?? byTaxonomy.get(taskType) ?? 0,
        basis: estimate?.basis ?? 'taxonomy_only',
      };
    })
    .sort((a, b) => b.commitCount - a.commitCount || a.taskType.localeCompare(b.taskType));
  return rows.slice(0, maxAlternatives);
}

function confidenceFor(basis: EstimateBasis, sampleSize: number, boundToTaskPct: number): 'low' | 'medium' | 'high' {
  if (basis === 'multi_commit_task_duration') {
    if (sampleSize >= 10) return 'high';
    if (sampleSize >= 3) return 'medium';
    return 'low';
  }
  if (basis === 'inter_commit_gap_proxy') {
    if (sampleSize >= 30 && boundToTaskPct >= 50) return 'medium';
    return 'low';
  }
  return 'low';
}

function buildCaveats(artifact: AgentTimeArtifact): string[] {
  const caveats = [...(artifact.caveats || [])];
  if (Object.keys(artifact.taskDurations || {}).length === 0) {
    caveats.push(
      'No multi-commit task-duration rows are present in this artifact; estimates fall back to clipped inter-commit gaps.'
    );
  }
  if ((artifact.totals?.bindingCoveragePct || 0) < 20) {
    caveats.push('Task-to-commit binding coverage is low; treat estimates as directional planning hints.');
  }
  return [...new Set(caveats)];
}

function classifyTaskTitle(title: string): string | undefined {
  const trimmed = title.trim();
  const conventional = /^([a-z]+)(?:\(([^)]+)\))?:/i.exec(trimmed);
  if (conventional) {
    const type = conventional[1].toLowerCase();
    const scope = (conventional[2] || '').toLowerCase();
    if (type === 'feat') return scopedType('feat', scope);
    if (type === 'fix') return scopedType('fix', scope);
    if (type === 'docs') {
      if (scope.includes('paper')) return 'docs-paper';
      if (scope.includes('research')) return 'docs-research';
      if (scope.includes('memory')) return 'docs-memory';
      if (scope.includes('audit')) return 'docs-audit';
      return 'docs';
    }
    if (['test', 'refactor', 'chore', 'audit', 'paper', 'research', 'perf', 'style'].includes(type)) {
      return type;
    }
  }

  const s = trimmed.toLowerCase();
  if (s.includes('mcp')) return 'feat-mcp';
  if (s.includes('paper-') || s.includes('citation')) return 'docs-paper';
  if (s.includes('research')) return 'docs-research';
  if (s.includes('audit')) return 'audit';
  if (s.includes('hook')) return 'feat-hooks';
  if (s.includes('script')) return 'feat-scripts';
  if (s.includes('refactor')) return 'refactor';
  if (s.includes('test') || s.includes('harness')) return 'test';
  if (s.includes('fix') || s.includes('bug')) return 'fix-other';
  return undefined;
}

function scopedType(type: 'feat' | 'fix', scope: string): string {
  if (scope.includes('core')) return `${type}-core`;
  if (scope.includes('mesh') || scope.includes('holomesh')) return `${type}-mesh`;
  if (scope.includes('mcp')) return `${type}-mcp`;
  if (scope.includes('studio')) return `${type}-studio`;
  if (scope.includes('engine')) return `${type}-engine`;
  if (scope.includes('hooks')) return `${type}-hooks`;
  if (scope.includes('scripts')) return `${type}-scripts`;
  if (type === 'fix' && scope.includes('deploy')) return 'fix-deploy';
  if (type === 'fix' && scope.includes('absorb')) return 'fix-absorb';
  if (type === 'fix' && scope.includes('infra')) return 'fix-infra';
  if (type === 'fix' && scope.includes('security')) return 'fix-security';
  if (type === 'fix' && scope.includes('paper')) return 'fix-paper';
  return `${type}-other`;
}

function normalizeTaskType(value: string): string {
  return value.trim().toLowerCase().replace(/[_\s]+/g, '-');
}

function valueAt(stats: PercentileStats, percentile: PercentileKey): number {
  return stats[percentile];
}

function round(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
