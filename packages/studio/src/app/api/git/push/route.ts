/**
 * POST /api/git/push — Push commits from a workspace clone to GitHub.
 *
 * Embeds the OAuth token so private repos work without ssh keys.
 *
 * Body: {
 *   workspacePath: string   absolute path to the cloned workspace
 *   remote?:       string   remote name (default "origin")
 *   branch?:       string   branch to push (default HEAD)
 *   force?:        boolean  force push (default false)
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

  const token = session.accessToken ?? process.env.GITHUB_TOKEN;
  if (!token) {
    return NextResponse.json(
      { error: 'No GitHub token available. Sign in with GitHub.' },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    workspacePath: string;
    remote?: string;
    branch?: string;
    force?: boolean;
  } | null;

  if (!body?.workspacePath) {
    return NextResponse.json({ error: 'Required: workspacePath' }, { status: 400 });
  }

  const { workspacePath, remote = 'origin', branch, force = false } = body;

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

  try {
    // Get current remote URL to inject OAuth token
    const { stdout: remoteUrl } = await execFileAsync('git', ['remote', 'get-url', remote], {
      cwd: resolved,
    });
    const originalUrl = remoteUrl.trim();

    // Inject OAuth token for HTTPS remotes
    let authedUrl = originalUrl;
    if (originalUrl.startsWith('https://github.com/')) {
      authedUrl = originalUrl.replace('https://', `https://${token}@`);
      await execFileAsync('git', ['remote', 'set-url', remote, authedUrl], { cwd: resolved });
    }

    // Build push args
    const args = ['push', remote];
    if (branch) args.push(branch);
    if (force) args.push('--force');

    const { stdout, stderr } = await execFileAsync('git', args, { cwd: resolved });

    // Restore original URL (don't leave token in git config)
    if (authedUrl !== originalUrl) {
      await execFileAsync('git', ['remote', 'set-url', remote, originalUrl], { cwd: resolved });
    }

    return NextResponse.json({
      ok: true,
      output: (stdout + stderr).trim(),
    });
  } catch (err) {
    // Always restore original URL on error
    try {
      const { stdout: origUrl } = await execFileAsync('git', ['remote', 'get-url', remote], {
        cwd: resolved,
      });
      if (origUrl.includes('@github.com')) {
        const clean = origUrl.replace(/https:\/\/[^@]+@/, 'https://');
        await execFileAsync('git', ['remote', 'set-url', remote, clean.trim()], { cwd: resolved });
      }
    } catch {
      /* ignore cleanup failure */
    }

    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'git push failed' },
      { status: 500 }
    );
  }
}
