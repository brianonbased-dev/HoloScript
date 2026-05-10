export const maxDuration = 300;

/**
 * POST /api/git/branch — Create or checkout a branch in a workspace clone.
 *
 * Body: {
 *   workspacePath: string   absolute path to the cloned workspace
 *   branch:        string   branch name
 *   base?:         string   base branch/SHA (default: current HEAD)
 *   checkout?:     boolean  checkout after creating (default true)
 * }
 *
 * GET /api/git/branch?workspacePath= — List branches.
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';

import { corsHeaders } from '../../_lib/cors';
import { isSafeGitRef, resolveWorkspaceGitPath } from '../_shared';
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
    branch: string;
    base?: string;
    checkout?: boolean;
  } | null;

  if (!body?.workspacePath || !body?.branch) {
    return NextResponse.json({ error: 'Required: workspacePath, branch' }, { status: 400 });
  }

  const { workspacePath, branch, base, checkout = true } = body;
  const validated = resolveWorkspaceGitPath(workspacePath);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  if (!isSafeGitRef(branch)) {
    return NextResponse.json({ error: 'branch is not a valid git ref name' }, { status: 400 });
  }
  if (base && !isSafeGitRef(base)) {
    return NextResponse.json({ error: 'base is not a valid git ref name' }, { status: 400 });
  }
  const { resolved } = validated;

  try {
    const args = checkout
      ? ['checkout', '-b', branch, ...(base ? [base] : [])]
      : ['branch', branch, ...(base ? [base] : [])];

    await execFileAsync('git', args, { cwd: resolved });

    const { stdout: currentBranch } = await execFileAsync(
      'git',
      ['rev-parse', '--abbrev-ref', 'HEAD'],
      { cwd: resolved }
    );

    return NextResponse.json({ ok: true, branch, current: currentBranch.trim() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'git branch failed' },
      { status: 500 }
    );
  }
}

export async function GET(req: NextRequest) {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const workspacePath = req.nextUrl.searchParams.get('workspacePath');
  if (!workspacePath) {
    return NextResponse.json({ error: 'Required: workspacePath' }, { status: 400 });
  }

  const validated = resolveWorkspaceGitPath(workspacePath);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const { resolved } = validated;

  try {
    const { stdout } = await execFileAsync('git', ['branch', '-a', '--format=%(refname:short)'], {
      cwd: resolved,
    });
    const { stdout: current } = await execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
      cwd: resolved,
    });
    const branches = stdout.trim().split('\n').filter(Boolean);
    return NextResponse.json({ branches, current: current.trim() });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'git branch list failed' },
      { status: 500 }
    );
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
