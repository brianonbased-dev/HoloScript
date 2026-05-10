export const maxDuration = 300;

/**
 * POST /api/workspace/import — Clone a GitHub repo and create a workspace.
 *
 * Body: { repoUrl: string, branch?: string, name?: string }
 *
 * Clones into ~/.holoscript/workspaces/<id>/, then kicks off absorb.
 * Returns workspace metadata immediately (absorb runs async via the absorb endpoint).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import * as path from 'path';
import * as os from 'os';
import * as fs from 'fs';
import { execFile, type ExecFileOptions } from 'child_process';
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

interface GitHubRepoRef {
  owner: string;
  repo: string;
  cloneUrl: string;
}

const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

function normalizeGitHubRepoUrl(repoUrl: string): GitHubRepoRef | null {
  const trimmed = repoUrl.trim();
  if (!trimmed || /[\x00-\x1f]/.test(trimmed)) return null;

  let owner: string | undefined;
  let repo: string | undefined;

  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);
  if (sshMatch) {
    owner = sshMatch[1];
    repo = sshMatch[2];
  } else {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' || url.hostname !== 'github.com') return null;
      if (url.username || url.password || url.search || url.hash) return null;
      const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length !== 2) return null;
      owner = parts[0];
      repo = parts[1]?.replace(/\.git$/i, '');
    } catch {
      return null;
    }
  }

  if (!owner || !repo) return null;
  if (!GITHUB_OWNER_RE.test(owner) || !GITHUB_REPO_RE.test(repo)) return null;
  if (repo === '.' || repo === '..') return null;

  return {
    owner,
    repo,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

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
  return new Promise((resolve, reject) => {
    execFile('git', args, options, (error, stdout, stderr) => {
      if (error) {
        reject(error);
        return;
      }
      resolve({ stdout: String(stdout ?? ''), stderr: String(stderr ?? '') });
    });
  });
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
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

  const repoRef = normalizeGitHubRepoUrl(repoUrl);
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

  const id = generateId();
  const repoName = body.name ?? repoRef.repo;
  const safeName = sanitizeName(repoName) || repoRef.repo;
  const { workspaceDir, localPath } = resolveWorkspacePath(id, safeName);

  try {
    // Ensure workspaces directory exists
    fs.mkdirSync(workspaceDir, { recursive: true });

    const oauthToken = session.accessToken ?? process.env.GITHUB_TOKEN;
    const env = withGitHubAuthEnv(oauthToken);
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

    return NextResponse.json({
      id,
      name: safeName,
      repoUrl: repoRef.cloneUrl,
      branch: actualBranch,
      localPath,
      status: 'ready',
      fileCount,
      conversionCandidates,
      conversionManifestPath,
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

    return NextResponse.json(publicCloneError(err), { status: 500 });
  }
}

/**
 * GET /api/workspace/import — List existing workspaces on disk.
 */
export async function GET() {
  try {
    const workspacesDir = path.resolve(getWorkspacesDir());
    if (!fs.existsSync(workspacesDir)) {
      return NextResponse.json({ workspaces: [] });
    }

    const entries = fs.readdirSync(workspacesDir, { withFileTypes: true });
    const workspaces = entries
      .filter((e) => e.isDirectory())
      .map((e) => {
        const wsDir = path.join(workspacesDir, e.name);
        const subDirs = fs
          .readdirSync(wsDir, { withFileTypes: true })
          .filter((d) => d.isDirectory());
        const repoDir = subDirs[0]?.name;
        return {
          id: e.name,
          name: repoDir ?? e.name,
          localPath: repoDir ? path.join(wsDir, repoDir) : wsDir,
        };
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
