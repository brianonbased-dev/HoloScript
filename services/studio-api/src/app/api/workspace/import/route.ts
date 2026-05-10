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

function getWorkspacesDir(): string {
  return (
    process.env.HOLOSCRIPT_WORKSPACES_DIR ?? path.join(os.homedir(), '.holoscript', 'workspaces')
  );
}

interface ImportRequest {
  repoUrl: string;
  branch?: string;
  name?: string;
}

interface GitHubRepoRef {
  owner: string;
  repo: string;
  fullName: string;
  cloneUrl: string;
}

function generateId(): string {
  return `ws-${randomUUID()}`;
}

function sanitizeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 64);
}

const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;
const BRANCH_REF_RE = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,254}$/;

function normalizeGitHubRepo(value: string): GitHubRepoRef | null {
  const trimmed = value.trim();
  if (!trimmed || /[\x00-\x1f]/.test(trimmed)) return null;

  let owner: string | undefined;
  let repo: string | undefined;

  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  if (sshMatch) {
    owner = sshMatch[1];
    repo = sshMatch[2];
  } else {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null;
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
  repo = repo.replace(/\.git$/i, '');
  if (!GITHUB_OWNER_RE.test(owner) || !GITHUB_REPO_RE.test(repo)) return null;
  if (repo === '.' || repo === '..') return null;

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

function normalizeBranch(branch: unknown): string | null | undefined {
  if (branch === undefined) return undefined;
  if (typeof branch !== 'string') return null;
  const trimmed = branch.trim();
  if (!trimmed) return null;
  if (!BRANCH_REF_RE.test(trimmed)) return null;
  if (trimmed.startsWith('-')) return null;
  if (trimmed.includes('..') || trimmed.includes('//') || trimmed.includes('@{')) return null;
  if (trimmed.endsWith('/') || trimmed.endsWith('.') || trimmed.endsWith('.lock')) return null;
  if (trimmed.split('/').some((part) => part.startsWith('.') || part.endsWith('.lock'))) {
    return null;
  }
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

function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...process.env,
    GIT_TERMINAL_PROMPT: '0',
  };
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

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json(
      { error: 'Not authenticated' },
      { status: 401 },
    );
  }

  let body: ImportRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  if (!body || typeof body !== 'object') {
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
      { status: 400 },
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
    fs.mkdirSync(workspaceDir, { recursive: true });

    const env = gitEnv();
    const cloneArgs = ['clone', '--depth', '1'];
    if (branch) cloneArgs.push('--branch', branch);
    cloneArgs.push('--', repoRef.cloneUrl, localPath);

    await execGit(cloneArgs, { timeout: 120_000, env });

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

    let fileCount = 0;
    try {
      const { stdout } = await execGit(['ls-files'], { cwd: localPath, env });
      fileCount = stdout.split(/\r?\n/).filter(Boolean).length;
    } catch {
      // non-critical
    }

    return NextResponse.json({
      id,
      name: safeName,
      repoUrl: repoRef.cloneUrl,
      branch: actualBranch,
      localPath,
      status: 'ready',
      fileCount,
      createdAt: new Date().toISOString(),
      hint: `POST /api/daemon/absorb with projectPath="${localPath}" to index this workspace.`,
    });
  } catch (err) {
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
        const subDirs = fs.readdirSync(wsDir, { withFileTypes: true })
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
