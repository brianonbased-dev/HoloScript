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

const execFileAsync = promisify(execFile);

function allowedWorkspacePath(workspacePath: string): string | null {
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const allowedRoot = path.join(home, '.holoscript', 'workspaces');
  const resolved = path.resolve(workspacePath);
  if (!resolved.startsWith(allowedRoot)) return null;
  if (!fs.existsSync(path.join(resolved, '.git'))) return null;
  return resolved;
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
    return NextResponse.json(
      { error: 'Required: workspacePath, message' },
      { status: 400 }
    );
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
    const { stdout: statusOut } = await execFileAsync(
      'git', ['status', '--porcelain'], { cwd, env }
    );

    let commitSha: string | null = null;
    if (statusOut.trim()) {
      await execFileAsync('git', ['commit', '-m', body.message], { cwd, env });
      const { stdout: shaOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd, env });
      commitSha = shaOut.trim();
    }

    // Resolve branch
    let branch = body.branch;
    if (!branch) {
      const { stdout: bOut } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd, env });
      branch = bOut.trim();
    }

    // Inject token into remote URL for HTTPS pushes
    const { stdout: remoteOut } = await execFileAsync('git', ['remote', 'get-url', remote], { cwd, env });
    originalRemoteUrl = remoteOut.trim();
    if (originalRemoteUrl.startsWith('https://github.com/')) {
      const authed = originalRemoteUrl.replace('https://', `https://${token}@`);
      await execFileAsync('git', ['remote', 'set-url', remote, authed], { cwd, env });
    }

    // Push
    const pushArgs = ['push', remote, branch];
    if (force) pushArgs.push('--force');
    const { stdout: pushStdout, stderr: pushStderr } = await execFileAsync('git', pushArgs, { cwd, env });

    // Restore clean remote URL
    if (originalRemoteUrl && originalRemoteUrl.startsWith('https://github.com/')) {
      await execFileAsync('git', ['remote', 'set-url', remote, originalRemoteUrl], { cwd, env });
    }

    return NextResponse.json({
      ok: true,
      flow: 'single-dev-direct',
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

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Ship failed' },
      { status: 500 }
    );
  }
}
