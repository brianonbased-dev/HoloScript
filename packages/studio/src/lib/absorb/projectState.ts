import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export interface AbsorbJobRecord {
  id: string;
  jobId: string;
  projectId: string;
  status: string;
  source: 'mcp' | 'http' | 'local';
  depth: string;
  tier: string;
  request: Record<string, unknown>;
  result: unknown;
  error: string | null;
  startedAt: string;
  completedAt: string | null;
  updatedAt: string;
}

export interface DurableAbsorbProject {
  id: string;
  name: string;
  sourceType: string;
  sourceUrl: string | null;
  localPath: string | null;
  status: string;
  lastAbsorbedAt: string | null;
  totalSpentCents: number;
  totalOperations: number;
  metadata: Record<string, unknown>;
  absorbJobs: AbsorbJobRecord[];
  createdAt: string;
  updatedAt: string;
  /** Signed-in Studio user id. Null on rows saved before owners were recorded. */
  ownerId: string | null;
}

export interface UpsertDurableAbsorbProjectInput {
  id?: string;
  name: string;
  sourceType?: string;
  sourceUrl?: string | null;
  localPath?: string | null;
  status?: string;
  lastAbsorbedAt?: string | null;
  totalSpentCents?: number;
  totalOperations?: number;
  metadata?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
  ownerId?: string | null;
}

export interface RecordAbsorbJobInput {
  projectId?: string;
  projectPath?: string;
  source: 'mcp' | 'http' | 'local';
  depth?: unknown;
  tier?: unknown;
  request?: Record<string, unknown>;
  result?: unknown;
  error?: unknown;
}

interface AbsorbProjectStateFile {
  version: 1;
  updatedAt: string;
  projects: DurableAbsorbProject[];
}

function getWorkspacesDir(): string {
  return (
    process.env.HOLOSCRIPT_WORKSPACES_DIR ?? path.join(os.homedir(), '.holoscript', 'workspaces')
  );
}

export function getAbsorbProjectStatePath(): string {
  return (
    process.env.HOLOSCRIPT_ABSORB_PROJECTS_STATE_FILE ??
    path.join(getWorkspacesDir(), '.absorb-projects.json')
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() ? value : fallback;
}

function asNullableString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

function emptyState(): AbsorbProjectStateFile {
  return { version: 1, updatedAt: new Date().toISOString(), projects: [] };
}

function normalizeJob(value: unknown, projectId: string): AbsorbJobRecord | null {
  if (!isRecord(value)) return null;
  const now = new Date().toISOString();
  return {
    id: asString(value.id, `job_${randomUUID()}`),
    jobId: asString(value.jobId, asString(value.id, `job_${randomUUID()}`)),
    projectId,
    status: asString(value.status, 'unknown'),
    source:
      value.source === 'mcp' || value.source === 'http' || value.source === 'local'
        ? value.source
        : 'local',
    depth: asString(value.depth, 'medium'),
    tier: asString(value.tier, 'medium'),
    request: asRecord(value.request),
    result: value.result ?? null,
    error: typeof value.error === 'string' ? value.error : null,
    startedAt: asString(value.startedAt, now),
    completedAt: asNullableString(value.completedAt),
    updatedAt: asString(value.updatedAt, now),
  };
}

function normalizeProject(value: unknown): DurableAbsorbProject | null {
  if (!isRecord(value)) return null;
  const id = asString(value.id, '');
  if (!id) return null;
  const now = new Date().toISOString();
  const jobs = Array.isArray(value.absorbJobs)
    ? value.absorbJobs
        .map((job) => normalizeJob(job, id))
        .filter((job): job is AbsorbJobRecord => job !== null)
    : [];
  return {
    id,
    name: asString(value.name, 'Untitled'),
    sourceType: asString(value.sourceType ?? value.source_type, 'github'),
    sourceUrl: asNullableString(value.sourceUrl ?? value.source_url),
    localPath: asNullableString(value.localPath ?? value.local_path),
    status: asString(value.status, 'pending'),
    lastAbsorbedAt: asNullableString(value.lastAbsorbedAt ?? value.last_absorbed_at),
    totalSpentCents: asNumber(value.totalSpentCents ?? value.total_spent_cents, 0),
    totalOperations: asNumber(value.totalOperations ?? value.total_operations, jobs.length),
    metadata: asRecord(value.metadata),
    absorbJobs: jobs,
    createdAt: asString(value.createdAt ?? value.created_at, now),
    updatedAt: asString(value.updatedAt ?? value.updated_at, now),
    ownerId: asNullableString(value.ownerId ?? value.owner_id),
  };
}

function readState(): AbsorbProjectStateFile {
  const statePath = getAbsorbProjectStatePath();
  if (!fs.existsSync(statePath)) return emptyState();
  try {
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as unknown;
    if (!isRecord(parsed) || !Array.isArray(parsed.projects)) return emptyState();
    return {
      version: 1,
      updatedAt: asString(parsed.updatedAt, new Date().toISOString()),
      projects: parsed.projects
        .map(normalizeProject)
        .filter((project): project is DurableAbsorbProject => project !== null),
    };
  } catch {
    return emptyState();
  }
}

function writeState(state: AbsorbProjectStateFile): void {
  const statePath = getAbsorbProjectStatePath();
  fs.mkdirSync(path.dirname(statePath), { recursive: true });
  const nextState: AbsorbProjectStateFile = {
    version: 1,
    updatedAt: new Date().toISOString(),
    projects: state.projects,
  };
  const tempPath = `${statePath}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(nextState, null, 2), 'utf-8');
  fs.renameSync(tempPath, statePath);
}

/**
 * Read-modify-write of the state file under an exclusive lock file
 * (`<state>.lock`, created with O_EXCL), so two Studio processes sharing the
 * volume cannot interleave. Within one process the callers are synchronous,
 * so the lock only matters across processes. A lock older than 30 s is a
 * crashed holder and is taken over.
 */
function withStateLock<T>(fn: () => T): T {
  const lockPath = `${getAbsorbProjectStatePath()}.lock`;
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const deadline = Date.now() + 5_000;
  let fd: number | null = null;
  while (fd === null) {
    try {
      fd = fs.openSync(lockPath, 'wx');
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
      try {
        if (Date.now() - fs.statSync(lockPath).mtimeMs > 30_000) fs.rmSync(lockPath, { force: true });
      } catch {
        /* the holder just released it */
      }
      if (Date.now() > deadline) throw new Error('absorb project state is locked');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
    }
  }
  try {
    return fn();
  } finally {
    fs.closeSync(fd);
    fs.rmSync(lockPath, { force: true });
  }
}

const PENDING_IMPORT_ID_RE = /^[A-Za-z0-9-]{8,100}$/;

/**
 * First writer wins (Mapping N1, #617): store `candidate` as the workspace's
 * pending importId unless one is already stored, and return the stored one.
 * Null when the row is missing or not the caller's.
 */
export function claimPendingAbsorbImportId(
  projectId: string,
  ownerId: string,
  candidate: string
): string | null {
  return withStateLock(() => {
    const state = readState();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || project.ownerId !== ownerId) return null;
    const stored = project.metadata.pendingImportId;
    if (typeof stored === 'string' && PENDING_IMPORT_ID_RE.test(stored)) return stored;
    project.metadata = { ...project.metadata, pendingImportId: candidate };
    project.updatedAt = new Date().toISOString();
    writeState(state);
    return candidate;
  });
}

/** Compare-and-clear: clears the pending importId only if it is still `expected`. */
export function clearPendingAbsorbImportId(projectId: string, ownerId: string, expected: string): boolean {
  return withStateLock(() => {
    const state = readState();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || project.ownerId !== ownerId) return false;
    if (project.metadata.pendingImportId !== expected) return false;
    project.metadata = { ...project.metadata, pendingImportId: null };
    project.updatedAt = new Date().toISOString();
    writeState(state);
    return true;
  });
}

export function listDurableAbsorbProjects(ownerId?: string | null): DurableAbsorbProject[] {
  const caller = typeof ownerId === 'string' && ownerId.trim() ? ownerId : null;
  // No signed-in account, and any row with no stored owner, match nobody.
  if (!caller) return [];
  return readState()
    .projects.filter((project) => project.ownerId === caller)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export function findDurableAbsorbProject(ref: {
  projectId?: string;
  projectPath?: string;
}): DurableAbsorbProject | null {
  const projects = readState().projects;
  if (ref.projectId) {
    const byId = projects.find((project) => project.id === ref.projectId);
    if (byId) return byId;
  }
  if (ref.projectPath) {
    const resolved = path.resolve(ref.projectPath);
    return (
      projects.find(
        (project) => project.localPath && path.resolve(project.localPath) === resolved
      ) ?? null
    );
  }
  return null;
}

export function upsertDurableAbsorbProject(
  input: UpsertDurableAbsorbProjectInput
): DurableAbsorbProject {
  const state = readState();
  const now = new Date().toISOString();
  const id = input.id ?? `local_${randomUUID()}`;
  const index = state.projects.findIndex((project) => project.id === id);
  const existing = index >= 0 ? state.projects[index] : null;
  const requestedOwner = asNullableString(input.ownerId);
  // A legacy row stays ownerless. Someone else's row is not rewritten.
  if (existing && existing.ownerId !== requestedOwner) {
    return existing;
  }
  const project: DurableAbsorbProject = {
    id,
    name: input.name || existing?.name || 'Untitled',
    sourceType: input.sourceType ?? existing?.sourceType ?? 'github',
    sourceUrl: input.sourceUrl ?? existing?.sourceUrl ?? null,
    localPath: input.localPath ?? existing?.localPath ?? null,
    status: input.status ?? existing?.status ?? 'pending',
    lastAbsorbedAt: input.lastAbsorbedAt ?? existing?.lastAbsorbedAt ?? null,
    totalSpentCents: input.totalSpentCents ?? existing?.totalSpentCents ?? 0,
    totalOperations: input.totalOperations ?? existing?.totalOperations ?? 0,
    metadata: {
      ...(existing?.metadata ?? {}),
      ...(input.metadata ?? {}),
    },
    absorbJobs: existing?.absorbJobs ?? [],
    createdAt: input.createdAt ?? existing?.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
    ownerId: existing?.ownerId ?? requestedOwner,
  };
  if (index >= 0) {
    state.projects[index] = project;
  } else {
    state.projects.push(project);
  }
  writeState(state);
  return project;
}

/**
 * Remove one project row, only when `ownerId` is its recorded owner.
 * Returns the removed row, or null when nothing matched.
 */
export function removeDurableAbsorbProject(
  id: string,
  ownerId: string | null | undefined
): DurableAbsorbProject | null {
  const caller = typeof ownerId === 'string' && ownerId.trim() ? ownerId : null;
  if (!caller) return null;
  const state = readState();
  const index = state.projects.findIndex((p) => p.id === id && p.ownerId === caller);
  if (index < 0) return null;
  const [removed] = state.projects.splice(index, 1);
  writeState(state);
  return removed;
}

function resultStringField(result: unknown, key: string): string | null {
  if (!isRecord(result)) return null;
  const value = result[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

function jobStatusFromResult(result: unknown, error: unknown): string {
  if (error) return 'failed';
  return resultStringField(result, 'status') ?? 'complete';
}

function projectStatusFromJob(status: string): string {
  if (status === 'failed') return 'failed';
  if (status === 'queued' || status === 'running' || status === 'scanning') return 'scanning';
  return 'complete';
}

function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 6) return '[MaxDepth]';
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (!isRecord(value)) return value;

  const redacted: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value)) {
    if (/token|secret|password|authorization|api[-_]?key/i.test(key)) {
      redacted[key] = '[REDACTED]';
      continue;
    }
    redacted[key] = redactSecrets(item, depth + 1);
  }
  return redacted;
}

export function recordAbsorbJob(input: RecordAbsorbJobInput): {
  project: DurableAbsorbProject;
  job: AbsorbJobRecord;
} {
  const state = readState();
  const now = new Date().toISOString();
  const resolvedPath = input.projectPath ? path.resolve(input.projectPath) : null;
  let projectIndex = input.projectId
    ? state.projects.findIndex((project) => project.id === input.projectId)
    : -1;

  if (projectIndex < 0 && resolvedPath) {
    projectIndex = state.projects.findIndex(
      (project) => project.localPath && path.resolve(project.localPath) === resolvedPath
    );
  }

  if (projectIndex < 0) {
    const id = input.projectId ?? `local_${randomUUID()}`;
    state.projects.push({
      id,
      name: resolvedPath ? path.basename(resolvedPath) : id,
      sourceType: resolvedPath ? 'local' : 'github',
      sourceUrl: null,
      localPath: resolvedPath,
      status: 'pending',
      lastAbsorbedAt: null,
      totalSpentCents: 0,
      totalOperations: 0,
      metadata: {},
      absorbJobs: [],
      createdAt: now,
      updatedAt: now,
      ownerId: null,
    });
    projectIndex = state.projects.length - 1;
  }

  const project = state.projects[projectIndex];
  const status = jobStatusFromResult(input.result, input.error);
  const jobId =
    resultStringField(input.result, 'jobId') ??
    resultStringField(input.result, 'id') ??
    `job_${randomUUID()}`;
  const existingJobIndex = project.absorbJobs.findIndex((job) => job.jobId === jobId);
  const existingJob = existingJobIndex >= 0 ? project.absorbJobs[existingJobIndex] : null;
  const job: AbsorbJobRecord = {
    id: existingJob?.id ?? `job_${randomUUID()}`,
    jobId,
    projectId: project.id,
    status,
    source: input.source,
    depth: asString(input.depth, 'medium'),
    tier: asString(input.tier, 'medium'),
    request: redactSecrets(input.request ?? {}) as Record<string, unknown>,
    result: redactSecrets(input.result ?? null),
    error: input.error ? String(input.error) : null,
    startedAt: existingJob?.startedAt ?? now,
    completedAt: status === 'queued' || status === 'running' ? null : now,
    updatedAt: now,
  };

  if (existingJobIndex >= 0) {
    project.absorbJobs[existingJobIndex] = job;
  } else {
    project.absorbJobs.unshift(job);
    project.totalOperations += 1;
  }

  project.status = projectStatusFromJob(status);
  project.updatedAt = now;
  if (!input.error) project.lastAbsorbedAt = now;
  state.projects[projectIndex] = project;
  writeState(state);
  return { project, job };
}
