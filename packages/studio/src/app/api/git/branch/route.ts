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
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

function validatePath(
  workspacePath: string
): { ok: true; resolved: string } | { ok: false; error: string } {
  const allowedRoot = path.join(
    process.env.HOME ?? process.env.USERPROFILE ?? '',
    '.holoscript',
    'workspaces'
  );
  const resolved = path.resolve(workspacePath);
  if (!resolved.startsWith(allowedRoot)) {
    return { ok: false, error: 'workspacePath must be inside ~/.holoscript/workspaces' };
  }
  if (!fs.existsSync(path.join(resolved, '.git'))) {
    return { ok: false, error: 'workspacePath does not contain a git repository' };
  }
  return { ok: true, resolved };
}

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
  const validated = validatePath(workspacePath);
  if (!validated.ok) {
    return NextResponse.json(
      { error: validated.error },
      { status: validated.error.includes('allowed') ? 403 : 400 }
    );
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

  const validated = validatePath(workspacePath);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: 400 });
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
