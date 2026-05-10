export const maxDuration = 300;

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

import { corsHeaders } from '../../_lib/cors';
import { isSafeGitRef, isSafeGitRemote, resolveWorkspaceGitPath } from '../_shared';
import { getGitHubToken } from '@/app/api/github/_shared';
const execFileAsync = promisify(execFile);

export async function POST(req: NextRequest) {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const token = await getGitHubToken(req);
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

  const validated = resolveWorkspaceGitPath(workspacePath);
  if (!validated.ok) {
    return NextResponse.json({ error: validated.error }, { status: validated.status });
  }
  const { resolved } = validated;
  if (!isSafeGitRemote(remote)) {
    return NextResponse.json({ error: 'remote is not a valid git remote name' }, { status: 400 });
  }
  if (branch && !isSafeGitRef(branch)) {
    return NextResponse.json({ error: 'branch is not a valid git ref name' }, { status: 400 });
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
    // SEC-T04: log the original error server-side (operators need the real
    // details) but never return raw git errors to the client — they can
    // include the fully-authenticated remote URL.
    console.error('[git push]', err);

    // Always restore original URL on error
    try {
      const { stdout: origUrl } = await execFileAsync('git', ['remote', 'get-url', remote], {
        cwd: resolved,
      });
      if (origUrl.includes('@github.com')) {
        const clean = origUrl.replace(/https:\/\/[^@]+@/, 'https://');
        await execFileAsync('git', ['remote', 'set-url', remote, clean.trim()], { cwd: resolved });
      }
    } catch (cleanupErr) {
      console.error('[git push] cleanup failed', cleanupErr);
    }

    // SEC-T04: never return raw git stderr/stdout — they can echo the authed URL.
    const e = err as NodeJS.ErrnoException & { status?: number };
    const code =
      e?.code != null ? String(e.code) : e?.status != null ? String(e.status) : 'unknown';
    return NextResponse.json({ error: 'Git push failed', code }, { status: 500 });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
