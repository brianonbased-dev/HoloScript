export const maxDuration = 300;

/**
 * POST /api/workspace/import — Clone a GitHub repo and create a workspace.
 *
 * Body: { repoUrl: string, branch?: string, name?: string, approvedRepos?: string[] }
 *
 * Clones into ~/.holoscript/workspaces/<id>/, then kicks off absorb.
 * Returns workspace metadata immediately (absorb runs async via the absorb endpoint).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession, type Session } from 'next-auth';
import { authOptions } from '@/lib/auth';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import type { ExecFileOptions } from 'child_process';
import { runGit } from '@/lib/git/safeGit';
import { randomUUID } from 'crypto';
import {
  buildConversionCandidates,
  persistConversionCandidates,
} from '@/lib/workspace/conversionAdvisor';
import {
  assessPublishWorthiness,
  type PublishWorthinessAbsorbGraph,
  type PublishWorthinessEvidencePath,
  type PublishWorthinessLLMReview,
  type PublishWorthinessProjectDNA,
} from '@/lib/workspace/publishWorthinessDetector';
import {
  findDurableAbsorbProject,
  listDurableAbsorbProjects,
  removeUnabsorbedAbsorbProject,
  upsertDurableAbsorbProject,
  isAbsorbStateLockTimeout,
} from '@/lib/absorb/projectState';
import { absorbStateLockedResponse, withAbsorbStateLock503 } from '@/lib/absorb/stateLockResponse';
import { resolveInsideWorkspace } from '@/lib/workspace/workspaceFs';
import { assertWorkspaceOwner, callerUserId } from '@/lib/workspace/workspaceOwner';
import { getGitHubToken } from '@/app/api/github/_shared';
import { isFounderWorkspaceIdentity } from '@/lib/workspace/workspaceIdentity';
import { isGitHubRepoApproved, normalizeGitHubRepo } from '@/lib/workspace/repoConsent';

import { corsHeaders } from '../../_lib/cors';

function getWorkspacesDir(): string {
  return (
    process.env.HOLOSCRIPT_WORKSPACES_DIR ?? path.join(os.homedir(), '.holoscript', 'workspaces')
  );
}

interface ImportRequest {
  repoUrl: string;
  branch?: string;
  name?: string;
  approvedRepos?: string[];
  consent?: {
    repos?: string[];
  };
  intent?: string;
  projectDNA?: PublishWorthinessProjectDNA;
  absorbGraph?: PublishWorthinessAbsorbGraph;
  noveltyClaims?: string[];
  differentiators?: string[];
  baselineComparisons?: string[];
  evidence?: PublishWorthinessEvidencePath;
  llmReview?: PublishWorthinessLLMReview;
}

function generateId(): string {
  return `ws-${randomUUID()}`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
}

const BRANCH_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

function normalizeBranch(branch: string | undefined): string | null | undefined {
  if (branch === undefined) return undefined;
  const trimmed = branch.trim();
  if (!trimmed) return null;
  if (!BRANCH_REF_RE.test(trimmed)) return null;
  if (trimmed.startsWith('-')) return null;
  if (trimmed.includes('..') || trimmed.includes('//') || trimmed.includes('@{')) return null;
  if (trimmed.endsWith('/') || trimmed.endsWith('.') || trimmed.endsWith('.lock')) return null;
  if (trimmed.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock')))
    return null;
  return trimmed;
}

function isInsidePath(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveWorkspacePath(
  id: string,
  safeName: string
): { workspaceDir: string; localPath: string } {
  const workspacesDir = path.resolve(getWorkspacesDir());
  const workspaceDir = path.resolve(workspacesDir, id);
  const localPath = path.resolve(workspaceDir, safeName);
  if (!isInsidePath(workspacesDir, workspaceDir) || !isInsidePath(workspaceDir, localPath)) {
    throw new Error('Resolved workspace path escaped workspace root');
  }
  return { workspaceDir, localPath };
}

function withGitHubAuthEnv(token: string | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  };
  if (!token) return env;

  const parsedCount = Number.parseInt(env.GIT_CONFIG_COUNT ?? '0', 10);
  const index = Number.isFinite(parsedCount) && parsedCount >= 0 ? parsedCount : 0;
  env.GIT_CONFIG_COUNT = String(index + 1);
  env[`GIT_CONFIG_KEY_${index}`] = 'http.https://github.com/.extraheader';
  env[`GIT_CONFIG_VALUE_${index}`] = `Authorization: basic ${Buffer.from(
    `x-access-token:${token}`
  ).toString('base64')}`;
  return env;
}

function execGit(
  args: string[],
  options: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string }> {
  return runGit(args, options);
}

function publicCloneError(err: unknown): { error: string; code?: string; hint: string } {
  const maybe = err as { code?: unknown; status?: unknown };
  const code =
    maybe?.code !== undefined
      ? String(maybe.code)
      : maybe?.status !== undefined
        ? String(maybe.status)
        : undefined;
  return {
    error: 'Clone failed',
    ...(code ? { code } : {}),
    hint: 'Check that git is installed and the GitHub repo is accessible to the signed-in account.',
  };
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === 'string');
}

function approvedReposFromRequest(body: ImportRequest): string[] {
  if (Array.isArray(body.approvedRepos)) {
    return body.approvedRepos.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  if (Array.isArray(body.consent?.repos)) {
    return body.consent.repos.filter((item) => typeof item === 'string' && item.trim().length > 0);
  }
  return [];
}

/**
 * The founder skips the per-repo consent list because his own repos are the
 * ones Studio was built against.
 *
 * The identity handed to the shared rule must carry the PROVIDER fields, or the
 * rule has nothing it is allowed to match on and the bypass is permanently
 * dead. The display NAME is deliberately not passed: it is freely chosen, and
 * treating it as an authority signal is the bug this whole round removed.
 */
function canBypassRepoConsent(session: Session | null): boolean {
  return isFounderWorkspaceIdentity({
    id: session?.user?.id,
    email: session?.user?.email,
    githubUsername: session?.user?.githubUsername,
    provider: session?.user?.provider,
    providerAccountId: session?.user?.providerAccountId,
    emailVerified: session?.user?.emailVerified,
  });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  // The clone is recorded as owned by this user id; without one it would be
  // an ownerless workspace nobody (including its creator) could ever open.
  if (!session?.user || !callerUserId(session)) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  let body: ImportRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { repoUrl } = body;

  if (!repoUrl || typeof repoUrl !== 'string') {
    return NextResponse.json({ error: 'repoUrl is required' }, { status: 400 });
  }

  const repoRef = normalizeGitHubRepo(repoUrl);
  if (!repoRef) {
    return NextResponse.json(
      { error: 'repoUrl must be a github.com repository URL' },
      { status: 400 }
    );
  }

  const branch = normalizeBranch(body.branch);
  if (branch === null) {
    return NextResponse.json({ error: 'branch is not a valid git ref name' }, { status: 400 });
  }

  const approvedRepos = approvedReposFromRequest(body);
  if (!canBypassRepoConsent(session) && !isGitHubRepoApproved(repoRef, approvedRepos)) {
    return NextResponse.json(
      { error: `Repository ${repoRef.fullName} is not approved for Studio import.` },
      { status: 403 }
    );
  }

  const id = generateId();
  const repoName = body.name ?? repoRef.repo;
  const safeName = sanitizeName(repoName) || repoRef.repo;
  const { workspaceDir, localPath } = resolveWorkspacePath(id, safeName);

  try {
    // Ensure workspaces directory exists
    fs.mkdirSync(workspaceDir, { recursive: true });

    const oauthToken = await getGitHubToken(req);
    const env = withGitHubAuthEnv(oauthToken ?? undefined);
    const cloneArgs = ['clone', '--depth', '1'];
    if (branch) cloneArgs.push('--branch', branch);
    cloneArgs.push('--', repoRef.cloneUrl, localPath);

    // Clone with 2-minute timeout
    await execGit(cloneArgs, { timeout: 120_000, env });

    // Read actual branch name from cloned repo
    let actualBranch = branch ?? 'main';
    try {
      const { stdout } = await execGit(['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd: localPath,
        env,
      });
      actualBranch = stdout.trim();
    } catch {
      // fallback to provided branch
    }

    // Count files for quick stats
    let fileCount = 0;
    let trackedFiles: string[] = [];
    try {
      const { stdout } = await execGit(['ls-files'], { cwd: localPath, env });
      trackedFiles = stdout.split(/\r?\n/).filter(Boolean);
      fileCount = trackedFiles.length;
    } catch {
      // non-critical
    }

    let currentCommit: string | null = null;
    try {
      const { stdout } = await execGit(['rev-parse', 'HEAD'], { cwd: localPath, env });
      currentCommit = stdout.trim() || null;
    } catch {
      // non-critical
    }

    const conversionCandidates = buildConversionCandidates({ paths: trackedFiles });
    const publishWorthiness = assessPublishWorthiness({
      userIntent: body.intent ?? body.name ?? `${repoRef.owner}/${repoRef.repo}`,
      projectDNA: body.projectDNA,
      absorbGraph: body.absorbGraph,
      paths: trackedFiles,
      conversionCandidates,
      noveltyClaims: optionalStringArray(body.noveltyClaims),
      differentiators: optionalStringArray(body.differentiators),
      baselineComparisons: optionalStringArray(body.baselineComparisons),
      evidence: body.evidence,
      llmReview: body.llmReview,
    });
    const conversionManifestPath = persistConversionCandidates({
      workspaceDir,
      candidates: conversionCandidates,
      metadata: {
        workspaceId: id,
        repoUrl: repoRef.cloneUrl,
        branch: actualBranch,
        localPath,
        publishWorthiness: {
          verdict: publishWorthiness.verdict,
          hiddenPaperProgramUnlocked: publishWorthiness.hiddenPaperProgramUnlocked,
          deterministicScore: publishWorthiness.deterministicScore,
          finalScore: publishWorthiness.finalScore,
          threshold: publishWorthiness.threshold,
          requiredGateFailures: publishWorthiness.requiredGateFailures,
        },
      },
    });
    const absorbProject = upsertDurableAbsorbProject({
      id,
      name: safeName,
      ownerId: callerUserId(session),
      sourceType: 'github',
      sourceUrl: repoRef.cloneUrl,
      localPath,
      status: 'ready',
      metadata: {
        workspaceId: id,
        workspaceDir,
        repoOwner: repoRef.owner,
        repoName: repoRef.repo,
        branch: actualBranch,
        currentCommit,
        fileCount,
        conversionManifestPath,
        conversionCandidateCount: conversionCandidates.length,
        publishWorthiness: {
          verdict: publishWorthiness.verdict,
          hiddenPaperProgramUnlocked: publishWorthiness.hiddenPaperProgramUnlocked,
          deterministicScore: publishWorthiness.deterministicScore,
          finalScore: publishWorthiness.finalScore,
          threshold: publishWorthiness.threshold,
          requiredGateFailures: publishWorthiness.requiredGateFailures,
        },
      },
    });

    return NextResponse.json({
      id,
      name: safeName,
      repoUrl: repoRef.cloneUrl,
      branch: actualBranch,
      currentCommit,
      localPath,
      status: 'ready',
      fileCount,
      conversionCandidates,
      conversionManifestPath,
      absorbProject,
      publishWorthiness,
      createdAt: new Date().toISOString(),
      hint: `POST /api/daemon/absorb with projectPath="${localPath}" to index this workspace.`,
    });
  } catch (err) {
    // Clean up on failure
    try {
      fs.rmSync(workspaceDir, { recursive: true, force: true });
    } catch {
      /* ignore cleanup failure */
    }

    if (isAbsorbStateLockTimeout(err)) return absorbStateLockedResponse(err.retryAfterSeconds);
    return NextResponse.json(publicCloneError(err), { status: 500 });
  }
}

/**
 * DELETE /api/workspace/import?id=ws-<uuid> — roll back a failed import.
 *
 * Used by the import wizard when absorb fails right after the clone, so a
 * failed import no longer leaves an orphan "stale" workspace behind. It only
 * removes the caller's own workspace, and only one that was never absorbed:
 * a workspace with a successful absorb is refused with 409.
 */
async function deleteImport(req: NextRequest): Promise<Response> {
  const session = await getServerSession(authOptions);
  const ownerId = callerUserId(session);
  if (!session?.user || !ownerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }
  const id = new URL(req.url).searchParams.get('id') ?? '';
  if (!/^ws-[0-9a-f-]{36}$/.test(id)) {
    return NextResponse.json({ error: 'id must be a workspace id' }, { status: 400 });
  }
  const project = findDurableAbsorbProject({ projectId: id });
  if (!project || project.ownerId !== ownerId) {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }
  const absorbed =
    project.lastAbsorbedAt !== null || project.absorbJobs.some((job) => job.status !== 'failed');
  if (absorbed) {
    return NextResponse.json(
      { error: 'Workspace has a completed absorb; it is not a failed import.' },
      { status: 409 }
    );
  }
  let workspaceDir: string;
  try {
    workspaceDir = resolveWorkspacePath(id, 'x').workspaceDir;
  } catch {
    return NextResponse.json({ error: 'id must be a workspace id' }, { status: 400 });
  }
  // N10 (#617): re-check "never absorbed" and remove the row in ONE locked
  // step, before touching files, so an absorb recorded since the check above
  // is never rolled back.
  const removal = removeUnabsorbedAbsorbProject(id, ownerId);
  if (removal === 'missing') {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }
  if (removal === 'pending') {
    return NextResponse.json(
      {
        error:
          'This workspace has an import that may have been charged. Retry the absorb to finish it before removing the workspace.',
        reason: 'import_pending',
      },
      { status: 409 }
    );
  }
  if (removal === 'absorbed') {
    return NextResponse.json(
      { error: 'Workspace has a completed absorb; it is not a failed import.' },
      { status: 409 }
    );
  }
  try {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  } catch (err) {
    console.error('[API workspace/import] rollback rm failed:', err);
    return NextResponse.json({ error: 'Could not remove workspace files' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id, removed: true });
}

/** A state-file lock timeout answers 503 + Retry-After (Mapping N5, #617). */
export const DELETE = withAbsorbStateLock503(deleteImport);

function readPaperUnlockState(localPath: string): Record<string, unknown> | null {
  // Must resolve inside the workspace after symlinks: a cloned repo could ship
  // `research/` as a link to someone else's files.
  const inside = resolveInsideWorkspace(localPath, 'research/paper-unlock-state.json');
  if (!inside.ok) return null;
  const statePath = inside.absolute;
  try {
    if (!fs.existsSync(statePath)) return null;
    const parsed = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as Record<string, unknown>;
    return typeof parsed === 'object' && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * GET /api/workspace/import — List the CALLER's workspaces.
 *
 * P0 2026-10-05: this used to readdir the shared workspaces root and return
 * every account's workspace (id + absolute localPath) with no session check
 * of its own, which handed any caller the exact paths to feed /files. It now
 * requires a session itself (not only the edge gate) and lists only registry
 * rows owned by the caller whose directory still passes the owner check.
 */
export async function GET() {
  const session = await getServerSession(authOptions);
  const ownerId = callerUserId(session);
  if (!session?.user || !ownerId) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const workspaces = listDurableAbsorbProjects(ownerId).flatMap((project) => {
      if (!project.localPath) return [];
      const owned = assertWorkspaceOwner(session, project.localPath);
      if (!owned.ok) return [];
      return [
        {
          id: project.id,
          name: path.basename(owned.resolved),
          localPath: project.localPath,
          paperUnlockState: readPaperUnlockState(owned.resolved),
        },
      ];
    });

    return NextResponse.json({ workspaces });
  } catch {
    return NextResponse.json({ workspaces: [] });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
