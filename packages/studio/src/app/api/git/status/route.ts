/**
 * GET /api/git/status — Git status of a workspace clone.
 *
 * Query params:
 *   workspacePath: string  absolute path to the workspace
 */

import { NextRequest, NextResponse } from 'next/server';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execFileAsync = promisify(execFile);

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
    return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
  }

  try {
    const [statusResult, branchResult, logResult] = await Promise.all([
      execFileAsync('git', ['status', '--porcelain=v2', '--branch'], { cwd: resolved }),
      execFileAsync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: resolved }),
      execFileAsync('git', ['log', '--oneline', '-10'], { cwd: resolved }),
    ]);

    const lines = statusResult.stdout.split('\n').filter(Boolean);
    const files: Array<{ path: string; status: string }> = [];
    let ahead = 0;
    let behind = 0;
    let upstream: string | null = null;

    for (const line of lines) {
      if (line.startsWith('# branch.ab')) {
        const m = line.match(/\+(\d+) -(\d+)/);
        if (m) {
          ahead = parseInt(m[1], 10);
          behind = parseInt(m[2], 10);
        }
      } else if (line.startsWith('# branch.upstream')) {
        upstream = line.slice('# branch.upstream '.length);
      } else if (line.startsWith('1 ') || line.startsWith('2 ') || line.startsWith('? ')) {
        const parts = line.split(' ');
        const xy = line.startsWith('? ') ? 'U' : parts[1];
        const filePath = parts[line.startsWith('? ') ? 1 : 8] ?? parts[parts.length - 1];
        files.push({ path: filePath, status: xy });
      }
    }

    const recentCommits = logResult.stdout
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((l) => ({ sha: l.slice(0, 7), message: l.slice(8) }));

    return NextResponse.json({
      branch: branchResult.stdout.trim(),
      upstream,
      ahead,
      behind,
      clean: files.length === 0,
      files,
      recentCommits,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'git status failed' },
      { status: 500 }
    );
  }
}
