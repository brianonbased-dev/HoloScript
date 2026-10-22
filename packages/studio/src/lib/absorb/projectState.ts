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
  /**
   * H2 (#617): compare-and-clear this pending importId in the SAME locked
   * write as the job record, so a successful charge is never left with the id
   * cleared but no job recorded.
   */
  clearPendingImportId?: { ownerId: string; importId: string; key?: PendingImportKey };
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
 * Thrown when the state-file lock cannot be taken in time. Routes answer it
 * with 503 + Retry-After (stateLockResponse.ts), never 500.
 */
export class AbsorbStateLockTimeoutError extends Error {
  readonly code = 'absorb_state_locked';
  readonly retryAfterSeconds: number;
  constructor(retryAfterSeconds = 2) {
    super('absorb project state is locked');
    this.name = 'AbsorbStateLockTimeoutError';
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function isAbsorbStateLockTimeout(err: unknown): err is AbsorbStateLockTimeoutError {
  return err instanceof AbsorbStateLockTimeoutError;
}

/** Lock timing. Mutable only so tests can shorten it. */
export const __absorbStateLockTiming = { timeoutMs: 5_000, staleMs: 30_000 };

export function getAbsorbStateLockPath(): string {
  return `${getAbsorbProjectStatePath()}.lock`;
}

function readLockToken(file: string): string | null {
  try {
    return fs.readFileSync(file, 'utf-8');
  } catch {
    return null;
  }
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Create the lock holding `token`. The token is written to a private temp file
 * and hard-linked into place, so the lock never exists without its token.
 * False when someone else holds it.
 */
function tryCreateLock(lockPath: string, token: string): boolean {
  const tmp = `${lockPath}.${token}.new`;
  fs.writeFileSync(tmp, token, 'utf-8');
  try {
    fs.linkSync(tmp, lockPath);
    return true;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') return false;
    throw err;
  } finally {
    fs.rmSync(tmp, { force: true });
  }
}

/**
 * Atomically move the lock aside and delete it only if it still holds
 * `expected`. If it holds anything else (a newer holder's lock), put it back
 * untouched. Rename is atomic, so of two callers only one gets a given lock.
 */
function removeLockIfOwnedBy(lockPath: string, expected: string, mover: string): boolean {
  const aside = `${lockPath}.${mover}.${randomUUID()}.aside`;
  try {
    fs.renameSync(lockPath, aside);
  } catch {
    return false; // already gone, or someone else moved it
  }
  if (readLockToken(aside) === expected) {
    fs.rmSync(aside, { force: true });
    return true;
  }
  try {
    fs.linkSync(aside, lockPath); // same inode: token and mtime unchanged
  } catch {
    /* a new holder already took the path; theirs stands */
  }
  fs.rmSync(aside, { force: true });
  return false;
}

/**
 * Take over a lock older than staleMs, but only the exact lock that was
 * observed (`observedToken`). Of two takers that saw the same stale lock, one
 * removes it and the other finds a different token and backs off.
 * Exported for tests.
 */
export function __takeOverStaleLock(
  lockPath: string,
  observedToken: string,
  takerToken: string
): boolean {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(lockPath);
  } catch {
    return false;
  }
  if (Date.now() - stat.mtimeMs <= __absorbStateLockTiming.staleMs) return false;
  return removeLockIfOwnedBy(lockPath, observedToken, takerToken);
}

/** Release only our own lock; a foreign lock is left alone. Exported for tests. */
export function __releaseStateLock(lockPath: string, token: string): boolean {
  return removeLockIfOwnedBy(lockPath, token, token);
}

let heldLockToken: string | null = null;

/**
 * Read-modify-write of the state file under an exclusive lock file
 * (`<state>.lock`), so two Studio processes sharing the volume cannot
 * interleave. Every writer (claim/clear pending importId, upsert, remove,
 * recordAbsorbJob) goes through it (Mapping N5, #617). The lock holds an
 * owner token (pid + random); taking over a lock older than staleMs and
 * releasing both check that token. A timeout throws
 * AbsorbStateLockTimeoutError, which routes answer with 503 + Retry-After.
 *
 * PER PROCESS / PER VOLUME: this coordinates processes that share one
 * volume. Several replicas need a DB-backed lock (follow-up card).
 * Re-entrant within one process (callers are synchronous).
 *
 * N7: the locked body MUST be synchronous. Re-entrancy relies on one
 * in-process holder at a time, and an async body would release the lock at
 * its first await while still writing. A body that returns a thenable throws.
 */
function assertSyncLockBody<T>(result: T): T {
  if (
    result !== null &&
    (typeof result === 'object' || typeof result === 'function') &&
    typeof (result as { then?: unknown }).then === 'function'
  ) {
    throw new Error('withStateLock body must be synchronous (returned a thenable)');
  }
  return result;
}

function withStateLock<T>(fn: () => T): T {
  if (heldLockToken !== null) return assertSyncLockBody(fn());
  const lockPath = getAbsorbStateLockPath();
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  const token = `${process.pid}-${randomUUID()}`;
  const deadline = Date.now() + __absorbStateLockTiming.timeoutMs;
  while (!tryCreateLock(lockPath, token)) {
    const observed = readLockToken(lockPath);
    if (observed !== null && __takeOverStaleLock(lockPath, observed, token)) continue;
    if (Date.now() > deadline) throw new AbsorbStateLockTimeoutError();
    sleepSync(10);
  }
  heldLockToken = token;
  try {
    return assertSyncLockBody(fn());
  } finally {
    heldLockToken = null;
    __releaseStateLock(lockPath, token);
  }
}
const PENDING_IMPORT_ID_RE = /^[A-Za-z0-9-]{8,100}$/;

/**
 * H3 (#623): pending importIds are kept PER REF. The URL import
 * (/api/daemon/absorb, absorb claim ref = repo URL + branch) and the folder
 * scan (/api/absorb/projects/[id]/absorb, ref = path:<folder>) each have their
 * own slot, so one route can never reuse, clear or replace the other's id.
 */
export type PendingImportKey = 'pendingImportId' | 'pendingFolderImportId';
export const PENDING_IMPORT_KEYS: readonly PendingImportKey[] = [
  'pendingImportId',
  'pendingFolderImportId',
];

/**
 * First writer wins (Mapping N1, #617): store `candidate` as the workspace's
 * pending importId unless one is already stored, and return the stored one.
 * Null when the row is missing or not the caller's.
 */
/**
 * N19 (#623): like claimPendingAbsorbImportId, but also says whether THIS call
 * stored `candidate` (storedNow) or found an id stored earlier. A route may
 * clear an id on import_id_reused only when it stored the client's own
 * candidate in this same request.
 */
export function claimPendingAbsorbImportIdDetailed(
  projectId: string,
  ownerId: string,
  candidate: string,
  key: PendingImportKey = 'pendingImportId'
): { importId: string; storedNow: boolean } | null {
  return withStateLock(() => {
    const state = readState();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || project.ownerId !== ownerId) return null;
    const stored = project.metadata[key];
    if (typeof stored === 'string' && PENDING_IMPORT_ID_RE.test(stored)) {
      return { importId: stored, storedNow: false };
    }
    project.metadata = { ...project.metadata, [key]: candidate };
    project.updatedAt = new Date().toISOString();
    writeState(state);
    return { importId: candidate, storedNow: true };
  });
}

export function claimPendingAbsorbImportId(
  projectId: string,
  ownerId: string,
  candidate: string,
  key: PendingImportKey = 'pendingImportId'
): string | null {
  return withStateLock(() => {
    const state = readState();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || project.ownerId !== ownerId) return null;
    const stored = project.metadata[key];
    if (typeof stored === 'string' && PENDING_IMPORT_ID_RE.test(stored)) return stored;
    project.metadata = { ...project.metadata, [key]: candidate };
    project.updatedAt = new Date().toISOString();
    writeState(state);
    return candidate;
  });
}

/** Compare-and-clear: clears the pending importId only if it is still `expected`. */
export function clearPendingAbsorbImportId(
  projectId: string,
  ownerId: string,
  expected: string,
  key: PendingImportKey = 'pendingImportId'
): boolean {
  return withStateLock(() => {
    const state = readState();
    const project = state.projects.find((p) => p.id === projectId);
    if (!project || project.ownerId !== ownerId) return false;
    if (project.metadata[key] !== expected) return false;
    project.metadata = { ...project.metadata, [key]: null };
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
  return withStateLock(() => {
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
  });
}

/**
 * N10 (#617): DELETE /api/workspace/import's "never absorbed" check and the
 * row removal in ONE locked step, so an absorb recorded in between is never
 * deleted. 'absorbed' means a successful absorb is on record (refuse, 409).
 */
export function removeUnabsorbedAbsorbProject(
  id: string,
  ownerId: string
): 'removed' | 'absorbed' | 'pending' | 'missing' {
  return withStateLock(() => {
    const state = readState();
    const index = state.projects.findIndex((p) => p.id === id && p.ownerId === ownerId);
    if (index < 0) return 'missing';
    const project = state.projects[index];
    const absorbed =
      project.lastAbsorbedAt !== null || project.absorbJobs.some((job) => job.status !== 'failed');
    if (absorbed) return 'absorbed';
    // N14 (#617): an import with a pending importId may have been charged
    // (outcome unknown, or charged but not recorded). Not a failed import.
    if (PENDING_IMPORT_KEYS.some((k) => typeof project.metadata[k] === 'string')) return 'pending';
    state.projects.splice(index, 1);
    writeState(state);
    return 'removed';
  });
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
  return withStateLock(() => {
    const state = readState();
    const index = state.projects.findIndex((p) => p.id === id && p.ownerId === caller);
    if (index < 0) return null;
    const [removed] = state.projects.splice(index, 1);
    writeState(state);
    return removed;
  });
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
  return withStateLock(() => {
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
    const clear = input.clearPendingImportId;
    if (
      clear &&
      project.ownerId === clear.ownerId &&
      project.metadata[clear.key ?? 'pendingImportId'] === clear.importId
    ) {
      project.metadata = { ...project.metadata, [clear.key ?? 'pendingImportId']: null };
    }
    state.projects[projectIndex] = project;
    writeState(state);
    return { project, job };
  });
}
