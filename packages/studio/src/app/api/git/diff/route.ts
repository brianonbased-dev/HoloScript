/**
 * GET /api/git/diff — Show diff for a workspace clone.
 *
 * Query params:
 *   workspacePath: string   absolute path to the workspace
 *   file?:         string   limit diff to specific file path
 *   staged?:       "true"   show staged (cached) diff (default: unstaged)
 *   from?:         string   starting ref/SHA for commit-to-commit diff
 *   to?:           string   ending ref/SHA (default HEAD)
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

  const p = req.nextUrl.searchParams;
  const workspacePath = p.get('workspacePath');
  if (!workspacePath) {
    return NextResponse.json({ error: 'Required: workspacePath' }, { status: 400 });
  }

  const allowedRoot = path.join(process.env.HOME ?? process.env.USERPROFILE ?? '', '.holoscript', 'workspaces');
  const resolved = path.resolve(workspacePath);
  if (!resolved.startsWith(allowedRoot)) {
    return NextResponse.json({ error: 'workspacePath must be inside ~/.holoscript/workspaces' }, { status: 403 });
  }
  if (!fs.existsSync(path.join(resolved, '.git'))) {
    return NextResponse.json({ error: 'Not a git repository' }, { status: 400 });
  }

  const file = p.get('file');
  const staged = p.get('staged') === 'true';
  const from = p.get('from');
  const to = p.get('to');

  const args = ['diff', '--unified=3'];
  if (staged) args.push('--cached');
  if (from && to) {
    args.push(`${from}..${to}`);
  } else if (from) {
    args.push(`${from}..HEAD`);
  }
  if (file) args.push('--', file);

  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: resolved,
      maxBuffer: 5 * 1024 * 1024, // 5MB max diff
    });

    // Parse into file-level sections for easier agent consumption
    const sections: Array<{ file: string; diff: string; additions: number; deletions: number }> = [];
    const chunks = stdout.split('\ndiff --git ');
    for (const chunk of chunks) {
      if (!chunk.trim()) continue;
      const headerMatch = chunk.match(/^(?:diff --git )?a\/(.+?) b\//);
      const filePath = headerMatch?.[1] ?? 'unknown';
      const additions = (chunk.match(/^\+[^+]/gm) ?? []).length;
      const deletions = (chunk.match(/^-[^-]/gm) ?? []).length;
      sections.push({ file: filePath, diff: chunk, additions, deletions });
    }

    return NextResponse.json({
      raw: stdout,
      files: sections,
      totalAdditions: sections.reduce((s, f) => s + f.additions, 0),
      totalDeletions: sections.reduce((s, f) => s + f.deletions, 0),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'git diff failed' },
      { status: 500 }
    );
  }
}
