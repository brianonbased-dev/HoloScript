export interface BrittneyWorkspaceDnaContext {
  kind?: string | null;
  confidence?: number | null;
  languages?: string[];
  frameworks?: string[];
  packageManagers?: string[];
  runtimes?: string[];
  repoShape?: string | null;
  riskSignals?: string[];
  strengths?: string[];
  recommendedProfile?: string | null;
  recommendedMode?: string | null;
}

export interface BrittneyWorkspaceStatsContext {
  totalFiles?: number | null;
  totalSymbols?: number | null;
  totalLoc?: number | null;
}

export interface BrittneyWorkspaceSnapshot {
  id: string;
  name?: string | null;
  repoUrl?: string | null;
  sourceUrl?: string | null;
  branch?: string | null;
  localPath?: string | null;
  status?: string | null;
  dna?: BrittneyWorkspaceDnaContext | null;
  absorbedAt?: string | null;
  stats?: BrittneyWorkspaceStatsContext | null;
  currentCommit?: string | null;
  metadata?: Record<string, unknown>;
  conversionCandidates?: unknown[] | null;
  conversionActions?: Record<string, string> | null;
  publishWorthiness?: { verdict?: string | null; finalScore?: number | null } | null;
  paperUnlockState?: { status?: string | null } | null;
}

export interface BrittneyGitContext {
  branch?: string | null;
  upstream?: string | null;
  ahead?: number | null;
  behind?: number | null;
  clean?: boolean | null;
  files?: Array<{ path: string; status: string }>;
  recentCommits?: Array<{ sha: string; message: string }>;
  error?: string;
}

export interface BrittneyBoardTaskContext {
  id: string;
  title: string;
  status?: string;
  priority?: number;
  claimedByName?: string;
}

export interface BrittneyBoardContext {
  mode?: string;
  objective?: string;
  board?: {
    open?: BrittneyBoardTaskContext[];
    claimed?: BrittneyBoardTaskContext[];
    done?: BrittneyBoardTaskContext[];
  };
  tasks?: BrittneyBoardTaskContext[];
  error?: string;
}

export interface BrittneyDaemonJobContext {
  id: string;
  projectId?: string;
  projectPath?: string;
  profile?: string;
  status?: string;
  progress?: number;
  statusMessage?: string;
  summary?: string;
  projectDna?: {
    daemonAgent?: {
      missionProfile?: string;
      agentName?: string;
      skills?: string[];
    };
  };
  metrics?: {
    filesAnalyzed?: number;
    filesChanged?: number;
    qualityDelta?: number;
    cycles?: number;
  };
  absorb?: {
    totalFiles?: number;
    totalSymbols?: number;
    hubFiles?: Array<{ path: string; inDegree: number }>;
    leafFirstOrder?: string[];
  };
}

export interface BrittneyAgentRuntimeContext {
  isRunning: boolean;
  currentPhase?: string;
  currentAction?: string;
  cycleCount?: number;
  lastError?: string | null;
}

export interface BrittneyToolRunContext {
  toolName: string;
  server: string;
  status: string;
  duration?: number;
  triggeredBy?: string;
  error?: string;
}

export interface BuildWorkspaceAssistantContextInput {
  sceneContext: string;
  historyScope: string;
  routeScope?: string | null;
  workspace?: BrittneyWorkspaceSnapshot | null;
  git?: BrittneyGitContext | null;
  board?: BrittneyBoardContext | null;
  teamId?: string | null;
  daemonJobs?: BrittneyDaemonJobContext[];
  agentRuntime?: BrittneyAgentRuntimeContext | null;
  toolCalls?: BrittneyToolRunContext[];
}

function cleanText(value: string | null | undefined): string | null {
  const trimmed = String(value ?? '').trim();
  return trimmed.length > 0 ? trimmed : null;
}

function cleanNumber(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function metadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function compactList(values: string[] | undefined, limit = 5): string {
  const cleaned = (values ?? []).map((value) => value.trim()).filter(Boolean);
  if (cleaned.length === 0) return 'none';
  const shown = cleaned.slice(0, limit);
  const suffix = cleaned.length > shown.length ? `, +${cleaned.length - shown.length} more` : '';
  return shown.join(', ') + suffix;
}

function clip(value: string, limit = 140): string {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed.length > limit ? `${trimmed.slice(0, limit - 1)}...` : trimmed;
}

function formatCommit(sha: string | null | undefined): string | null {
  const clean = cleanText(sha);
  return clean ? clean.slice(0, 12) : null;
}

function buildWorkspaceSection(input: BuildWorkspaceAssistantContextInput): string {
  const lines: string[] = ['--- Workspace Scope ---'];
  lines.push(`Assistant history scope: ${input.historyScope}`);
  if (input.routeScope) lines.push(`Route: ${input.routeScope}`);

  const workspace = input.workspace;
  if (!workspace) {
    lines.push('No active workspace; this turn is scoped to the current project/scene.');
    return lines.join('\n');
  }

  const repoUrl = cleanText(workspace.repoUrl) ?? cleanText(workspace.sourceUrl);
  const branch =
    cleanText(workspace.branch) ?? metadataString(workspace.metadata, 'branch') ?? 'unknown';
  const currentCommit =
    formatCommit(workspace.currentCommit) ??
    formatCommit(metadataString(workspace.metadata, 'currentCommit'));
  const stats = workspace.stats;
  const dna = workspace.dna;

  lines.push(`Workspace: ${workspace.name ?? workspace.id} (${workspace.id})`);
  lines.push(`Repository: ${repoUrl ?? 'local workspace'}`);
  lines.push(`Branch: ${branch}`);
  if (currentCommit) lines.push(`Commit: ${currentCommit}`);
  if (workspace.localPath) {
    lines.push('Local path: available to Studio git APIs (redacted from prompt)');
  }
  if (workspace.status) lines.push(`Workspace status: ${workspace.status}`);

  if (stats) {
    lines.push(
      `Absorb graph: ${stats.totalFiles ?? 0} files, ${stats.totalSymbols ?? 0} symbols, ${
        stats.totalLoc ?? 0
      } LOC`
    );
  }
  if (workspace.absorbedAt) lines.push(`Absorbed at: ${workspace.absorbedAt}`);

  if (dna) {
    const confidence = cleanNumber(dna.confidence);
    lines.push(
      `Project DNA: ${dna.kind ?? 'unknown'}${
        confidence === null ? '' : ` (${Math.round(confidence * 100)}% confidence)`
      }; shape=${dna.repoShape ?? 'unknown'}; mode=${dna.recommendedMode ?? 'unknown'}`
    );
    lines.push(`Languages: ${compactList(dna.languages)}`);
    lines.push(`Frameworks: ${compactList(dna.frameworks)}`);
    lines.push(`Package managers: ${compactList(dna.packageManagers)}`);
    if (dna.riskSignals?.length) lines.push(`Risk signals: ${compactList(dna.riskSignals, 4)}`);
    if (dna.strengths?.length) lines.push(`Strengths: ${compactList(dna.strengths, 4)}`);
  }

  const candidateCount = workspace.conversionCandidates?.length ?? 0;
  if (candidateCount > 0) {
    const actions = Object.values(workspace.conversionActions ?? {});
    const accepted = actions.filter((action) => action === 'accepted').length;
    const dismissed = actions.filter((action) => action === 'dismissed').length;
    lines.push(
      `Conversion candidates: ${candidateCount} total, ${accepted} accepted, ${dismissed} dismissed`
    );
  }
  if (workspace.publishWorthiness?.verdict) {
    const score = cleanNumber(workspace.publishWorthiness.finalScore);
    lines.push(
      `Publish worthiness: ${workspace.publishWorthiness.verdict}${
        score === null ? '' : ` (${score.toFixed(2)})`
      }`
    );
  }
  if (workspace.paperUnlockState?.status) {
    lines.push(`Paper unlock state: ${workspace.paperUnlockState.status}`);
  }

  return lines.join('\n');
}

function buildGitSection(git: BrittneyGitContext | null | undefined): string | null {
  if (!git) return null;
  const lines: string[] = ['--- Git State ---'];
  if (git.error) {
    lines.push(`Git status error: ${git.error}`);
    return lines.join('\n');
  }

  lines.push(
    `Branch: ${git.branch ?? 'unknown'}; upstream=${git.upstream ?? 'none'}; ${
      git.clean === true ? 'clean' : 'dirty'
    }; ahead=${git.ahead ?? 0}; behind=${git.behind ?? 0}`
  );

  const files = git.files ?? [];
  if (files.length > 0) {
    lines.push(
      `Changed files (${files.length}): ${files
        .slice(0, 8)
        .map((file) => `${file.status} ${file.path}`)
        .join('; ')}${files.length > 8 ? `; +${files.length - 8} more` : ''}`
    );
  } else {
    lines.push('Changed files: none');
  }

  const commits = git.recentCommits ?? [];
  if (commits.length > 0) {
    lines.push(
      `Recent commits: ${commits
        .slice(0, 4)
        .map((commit) => `${formatCommit(commit.sha) ?? commit.sha}: ${clip(commit.message, 90)}`)
        .join(' | ')}`
    );
  }
  return lines.join('\n');
}

function taskKey(task: BrittneyBoardTaskContext): string {
  return task.id || `${task.status ?? 'task'}:${task.title}`;
}

function buildBoardSection(
  board: BrittneyBoardContext | null | undefined,
  teamId: string | null | undefined
): string | null {
  if (!board && !teamId) return null;
  const lines: string[] = ['--- Team Board ---'];
  if (teamId) lines.push(`Team: ${teamId}`);
  if (!board) {
    lines.push('Board snapshot is not loaded yet.');
    return lines.join('\n');
  }
  if (board.error) {
    lines.push(`Board error: ${board.error}`);
    return lines.join('\n');
  }
  if (board.mode) lines.push(`Mode: ${board.mode}`);
  if (board.objective) lines.push(`Objective: ${clip(board.objective, 180)}`);

  const deduped = new Map<string, BrittneyBoardTaskContext>();
  for (const task of board.board?.claimed ?? []) {
    deduped.set(taskKey(task), { ...task, status: task.status ?? 'claimed' });
  }
  for (const task of board.board?.open ?? []) {
    deduped.set(taskKey(task), { ...task, status: task.status ?? 'open' });
  }
  for (const task of board.tasks ?? []) {
    deduped.set(taskKey(task), task);
  }

  const tasks = Array.from(deduped.values()).slice(0, 8);
  if (tasks.length === 0) {
    lines.push('Tasks: none returned');
  } else {
    lines.push('Tasks:');
    for (const task of tasks) {
      const owner = task.claimedByName ? ` <- ${task.claimedByName}` : '';
      lines.push(
        `  - [P${task.priority ?? '?'} ${task.status ?? 'task'}] ${clip(task.title, 100)} (${
          task.id
        })${owner}`
      );
    }
  }
  return lines.join('\n');
}

function buildDaemonSection(jobs: BrittneyDaemonJobContext[] | undefined): string | null {
  const scopedJobs = (jobs ?? []).slice(0, 6);
  if (scopedJobs.length === 0) return null;
  const lines: string[] = ['--- Agent Sessions ---'];
  for (const job of scopedJobs) {
    const agent = job.projectDna?.daemonAgent;
    const mission = agent?.missionProfile ?? job.profile ?? 'unknown';
    const status = job.status ?? 'unknown';
    const progress = typeof job.progress === 'number' ? ` ${job.progress}%` : '';
    const summary = job.statusMessage ?? job.summary ?? '';
    lines.push(`  - ${job.id}: ${status}${progress}; mission=${mission}; ${clip(summary, 120)}`);
    if (job.metrics) {
      lines.push(
        `    metrics: files=${job.metrics.filesAnalyzed ?? 0}, changed=${
          job.metrics.filesChanged ?? 0
        }, qualityDelta=${job.metrics.qualityDelta ?? 0}, cycles=${job.metrics.cycles ?? 0}`
      );
    }
    if (job.absorb) {
      lines.push(
        `    absorb: ${job.absorb.totalFiles ?? 0} files, ${
          job.absorb.totalSymbols ?? 0
        } symbols`
      );
    }
  }
  return lines.join('\n');
}

function buildAgentRuntimeSection(
  runtime: BrittneyAgentRuntimeContext | null | undefined
): string | null {
  if (!runtime) return null;
  const lines: string[] = ['--- Local Agent Runtime ---'];
  lines.push(
    `Running: ${runtime.isRunning ? 'yes' : 'no'}; phase=${
      runtime.currentPhase ?? 'idle'
    }; cycles=${runtime.cycleCount ?? 0}`
  );
  if (runtime.currentAction) lines.push(`Current action: ${clip(runtime.currentAction, 140)}`);
  if (runtime.lastError) lines.push(`Last error: ${clip(runtime.lastError, 140)}`);
  return lines.join('\n');
}

function buildToolRunSection(toolCalls: BrittneyToolRunContext[] | undefined): string | null {
  const calls = (toolCalls ?? []).slice(-8);
  if (calls.length === 0) return null;
  const lines: string[] = ['--- Recent Tool Runs ---'];
  for (const call of calls) {
    const duration = typeof call.duration === 'number' ? ` ${Math.round(call.duration)}ms` : '';
    const error = call.error ? ` error=${clip(call.error, 80)}` : '';
    lines.push(
      `  - ${call.toolName} on ${call.server}: ${call.status}${duration}; triggeredBy=${
        call.triggeredBy ?? 'unknown'
      }${error}`
    );
  }
  return lines.join('\n');
}

export function buildWorkspaceAssistantContext(
  input: BuildWorkspaceAssistantContextInput
): string {
  const sections = [
    buildWorkspaceSection(input),
    buildGitSection(input.git),
    buildBoardSection(input.board, input.teamId),
    buildDaemonSection(input.daemonJobs),
    buildAgentRuntimeSection(input.agentRuntime),
    buildToolRunSection(input.toolCalls),
    `--- Scene Context ---\n${input.sceneContext}`,
  ];

  return sections.filter((section): section is string => Boolean(section)).join('\n\n');
}
