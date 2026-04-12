export const maxDuration = 300;

/**
 * POST /api/git/commit — Stage all changed files and commit in a workspace clone.
 *
 * Body: {
 *   workspacePath: string   absolute path to the cloned workspace (from /api/workspace/import)
 *   message:       string   commit message
 *   files?:        string[] specific files to stage (default: all changed files)
 *   author?:       { name: string; email: string }
 * }
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as {
    workspacePath: string;
    message: string;
    files?: string[];
    author?: { name: string; email: string };
  } | null;

  if (!body?.workspacePath || !body?.message) {
    return NextResponse.json({ error: 'Required: workspacePath, message' }, { status: 400 });
  }

  const { workspacePath, message, files, author } = body;

  // Security: workspacePath must be inside ~/.holoscript/workspaces
  const allowedRoot = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? '',
    '.holoscript',
    'workspaces'
  );
  const resolved = path.resolve(workspacePath);
  if (!resolved.startsWith(allowedRoot)) {
    return NextResponse.json(
      { error: 'workspacePath must be inside ~/.holoscript/workspaces' },
      { status: 403 }
    );
  }

  if (!fs.existsSync(path.join(resolved, '.git'))) {
    return NextResponse.json(
      { error: 'workspacePath does not contain a git repository' },
      { status: 400 }
    );
  }

  const env: NodeJS.ProcessEnv = { ...process.env };
  if (author?.name) env.GIT_AUTHOR_NAME = author.name;
  if (author?.email) env.GIT_AUTHOR_EMAIL = author.email;
  if (!env.GIT_AUTHOR_NAME) env.GIT_AUTHOR_NAME = session.user.name ?? 'HoloScript Agent';
  if (!env.GIT_AUTHOR_EMAIL) env.GIT_AUTHOR_EMAIL = session.user.email ?? 'agent@holoscript.net';
  env.GIT_COMMITTER_NAME = env.GIT_AUTHOR_NAME;
  env.GIT_COMMITTER_EMAIL = env.GIT_AUTHOR_EMAIL;

  try {
    // Stage files
    const addArgs = files?.length ? files : ['.'];
    await execFileAsync('git', ['add', ...addArgs], { cwd: resolved, env });

    // Check if there's anything to commit
    const { stdout: statusOut } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd: resolved,
      env,
    });
    if (!statusOut.trim()) {
      return NextResponse.json({ ok: true, sha: null, message: 'Nothing to commit.' });
    }

    // Commit
    const { stdout: commitOut } = await execFileAsync('git', ['commit', '-m', message], {
      cwd: resolved,
      env,
    });

    // Get commit SHA
    const { stdout: shaOut } = await execFileAsync('git', ['rev-parse', 'HEAD'], {
      cwd: resolved,
      env,
    });

    return NextResponse.json({
      ok: true,
      sha: shaOut.trim(),
      message: commitOut.trim().split('\n')[0],
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'git commit failed' },
      { status: 500 }
    );
  }
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
