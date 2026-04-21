export const maxDuration = 300;

/**
 * POST /api/git/ship — Single-dev fast path (commit + push in one call).
 *
 * Intended for repo owners / maintainers who want direct shipping without PR ceremony.
 *
 * Body:
 * {
 *   workspacePath: string;           // absolute path under ~/.holoscript/workspaces
 *   message: string;                 // commit message
 *   files?: string[];                // optional subset to stage (default all)
 *   remote?: string;                 // default: origin
 *   branch?: string;                 // default: current branch
 *   force?: boolean;                 // default: false
 *   author?: { name: string; email: string };
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

import { corsHeaders } from '../../_lib/cors';
const GITHUB_API_BASE_URL = (
  process.env.GITHUB_API_URL ||
  process.env.GITHUB_API_BASE_URL ||
  'https://api.github.com'
).replace(/\/+$/, '');

const GITHUB_API_VERSION = process.env.GITHUB_API_VERSION || '2022-11-28';

const execFileAsync = promisify(execFile);

type GitHubRole = 'owner' | 'maintainer' | 'contributor' | 'viewer' | 'unknown';

function allowedWorkspacePath(workspacePath: string): string | null {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const allowedRoot = path.join(home, '.holoscript', 'workspaces');
  const resolved = path.resolve(workspacePath);
  if (!resolved.startsWith(allowedRoot)) return null;
  if (!fs.existsSync(path.join(resolved, '.git'))) return null;
  return resolved;
}

function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  // Supports:
  //   https://github.com/owner/repo.git
  //   https://token@github.com/owner/repo.git
  //   git@github.com:owner/repo.git
  const httpsMatch = remoteUrl.match(/github\.com[/:]([^/]+)\/([^/]+?)(?:\.git)?$/i);
  if (httpsMatch) {
    return { owner: httpsMatch[1], repo: httpsMatch[2] };
  }
  return null;
}

async function detectGitHubRole(token: string, owner: string, repo: string): Promise<GitHubRole> {
  const [userResp, repoResp] = await Promise.all([
    fetch(`${GITHUB_API_BASE_URL}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': 'HoloScript-Studio',
      },
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(`${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': 'HoloScript-Studio',
      },
      signal: AbortSignal.timeout(10_000),
    }),
  ]);

  if (!userResp.ok || !repoResp.ok) return 'unknown';

  const user = (await userResp.json()) as { login?: string };
  const repoInfo = (await repoResp.json()) as {
    owner?: { login?: string };
    permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
  };

  const login = user?.login?.toLowerCase();
  const ownerLogin = repoInfo?.owner?.login?.toLowerCase();
  if (login && ownerLogin && login === ownerLogin) return 'owner';

  const permissions = repoInfo?.permissions;
  if (permissions?.admin) return 'maintainer';
  if (permissions?.push) return 'contributor';
  if (permissions?.pull) return 'viewer';
  return 'unknown';
}

export async function POST(req: NextRequest) {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const token = session.accessToken ?? process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'No GitHub token available. Sign in with GitHub.' },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    workspacePath: string;
    message: string;
    files?: string[];
    remote?: string;
    branch?: string;
    force?: boolean;
    author?: { name: string; email: string };
  } | null;

  if (!body?.workspacePath || !body?.message) {
    return NextResponse.json({ error: 'Required: workspacePath, message' }, { status: 400 });
  }

  const cwd = allowedWorkspacePath(body.workspacePath);
  if (!cwd) {
    return NextResponse.json(
      { error: 'workspacePath must be a git repo under ~/.holoscript/workspaces' },
      { status: 403 }
    );
  }

  const remote = body.remote ?? 'origin';
  const force = body.force === true;

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (body.author?.name) env.GIT_AUTHOR_NAME = body.author.name;
  if (body.author?.email) env.GIT_AUTHOR_EMAIL = body.author.email;
  if (!env.GIT_AUTHOR_NAME) env.GIT_AUTHOR_NAME = session.user.name ?? 'HoloScript Agent';
  if (!env.GIT_AUTHOR_EMAIL) env.GIT_AUTHOR_EMAIL = session.user.email ?? 'agent@holoscript.net';
  env.GIT_COMMITTER_NAME = env.GIT_AUTHOR_NAME;
  env.GIT_COMMITTER_EMAIL = env.GIT_AUTHOR_EMAIL;

  let originalRemoteUrl: string | null = null;

  try {
    // Stage files (or all)
    const addArgs = body.files?.length ? body.files : ['.'];
    await execFileAsync('git', ['add', ...addArgs], { cwd, env });

    // Commit if needed
    const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd,
      env,
    });

    let commitSha: string | null = null;
    if (statusOut.trim()) {
      await execFileAsync('git', ['commit', '-m', body.message], { cwd, env });
      const { stdout: shaOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, env });
      commitSha = shaOut.trim();
    }

    // Resolve branch
    let branch = body.branch;
    if (!branch) {
      const { stdout: bOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
        cwd,
        env,
      });
      branch = bOut.trim();
    }

    // Resolve remote and determine permission role
    const { stdout: remoteOut } = await execFileAsync('git', ['remote', 'get-url', remote], {
      cwd,
      env,
    });
    originalRemoteUrl = remoteOut.trim();

    const remoteRepo = parseGitHubRemote(originalRemoteUrl);
    let role: GitHubRole = 'unknown';
    if (remoteRepo) {
      role = await detectGitHubRole(token, remoteRepo.owner, remoteRepo.repo);
    }

    // Enforce contributor workflow: contributors/viewers open PRs instead of direct ship.
    if (role === 'contributor' || role === 'viewer') {
      return NextResponse.json(
        {
          error: 'Direct ship is reserved for owners/maintainers. Use branch + PR flow.',
          role,
          recommendedFlow: 'branch-pr',
        },
        { status: 403 }
      );
    }

    // Inject token into remote URL for HTTPS pushes
    if (originalRemoteUrl.startsWith('https://github.com/')) {
      const authed = originalRemoteUrl.replace('https://', `https://${token}@`);
      await execFileAsync('git', ['remote', 'set-url', remote, authed], { cwd, env });
    }

    // Push
    const pushArgs = ['push', remote, branch];
    if (force) pushArgs.push('--force');
    const { stdout: pushStdout, stderr: pushStderr } = await execFileAsync('git', pushArgs, {
      cwd,
      env,
    });

    // Restore clean remote URL
    if (originalRemoteUrl && originalRemoteUrl.startsWith('https://github.com/')) {
      await execFileAsync('git', ['remote', 'set-url', remote, originalRemoteUrl], { cwd, env });
    }

    return NextResponse.json({
      ok: true,
      flow: 'single-dev-direct',
      role,
      branch,
      commitSha,
      pushed: true,
      output: `${pushStdout}${pushStderr}`.trim(),
    });
  } catch (err) {
    // best-effort remote URL cleanup
    try {
      if (originalRemoteUrl) {
        await execFileAsync('git', ['remote', 'set-url', remote, originalRemoteUrl], { cwd, env });
      }
    } catch {
      // ignore cleanup error
    }

    console.error('[git ship]', err);

    // SEC-T04: same as /api/git/push — push errors can include OAuth URL with token.
    const e = err as NodeJS.ErrnoException & { status?: number };
    const code =
      e?.code != null
        ? String(e.code)
        : e?.status != null
          ? String(e.status)
          : 'unknown';
    return NextResponse.json({ error: 'Git ship failed', code }, { status: 500 });
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
