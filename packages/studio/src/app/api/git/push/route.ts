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
import { runGit } from '@/lib/git/safeGit';

import { corsHeaders } from '../../_lib/cors';
import { isSafeGitRef, isSafeGitRemote, resolveWorkspaceGitPath } from '../_shared';
import { getGitHubToken } from '@/app/api/github/_shared';
import { assertWorkspaceOwner } from '@/lib/workspace/workspaceOwner';
import {
  evaluatePush,
  resolveDefaultBranchForPush,
  resolveTargetRef,
  unsafeBranchInput,
  workspaceDirectShipEnabled,
} from '@/lib/workspace/shipPolicy';

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

  const validated = resolveWorkspaceGitPath(workspacePath, session);
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

  const unsafeBranch = unsafeBranchInput(branch);
  if (unsafeBranch) {
    return NextResponse.json({ error: unsafeBranch, reason: 'unsafe_branch' }, { status: 400 });
  }

  // Direct ship is a per-workspace setting, OFF by default. With it off this
  // route (which the daemon/agent patch flow also uses) never pushes the
  // default branch. Checked before the token touches the remote.
  const owned = assertWorkspaceOwner(session, resolved);
  const project = owned.ok ? owned.project : null;
  let pushBranch = branch ?? null;
  if (!pushBranch) {
    try {
      const { stdout } = await runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: resolved });
      pushBranch = stdout.trim() || null;
    } catch {
      pushBranch = null;
    }
  }
  let remoteForPolicy: string | null = null;
  try {
    remoteForPolicy = (await runGit(['remote', 'get-url', remote], { cwd: resolved })).stdout.trim();
  } catch {
    remoteForPolicy = null;
  }
  const decision = evaluatePush({
    directShip: workspaceDirectShipEnabled(project),
    branch: pushBranch,
    targetRef: pushBranch ? resolveTargetRef(resolved, pushBranch) : null,
    force,
    // GitHub's current default_branch first (renames), then recorded metadata.
    defaultBranch: await resolveDefaultBranchForPush({
      token,
      remoteUrl: remoteForPolicy,
      cwd: resolved,
      project,
    }),
  });
  if (!decision.ok) {
    return NextResponse.json({ error: decision.error, reason: decision.reason }, { status: 403 });
  }

  try {
    // Get current remote URL to inject OAuth token
    const { stdout: remoteUrl } = await runGit(['remote', 'get-url', remote], {
      cwd: resolved,
    });
    const originalUrl = remoteUrl.trim();

    // Inject OAuth token for HTTPS remotes
    let authedUrl = originalUrl;
    if (originalUrl.startsWith('https://github.com/')) {
      authedUrl = originalUrl.replace('https://', `https://${token}@`);
      await runGit(['remote', 'set-url', remote, authedUrl], { cwd: resolved });
    }

    // Build push args
    const args = ['push', remote];
    if (pushBranch) args.push(pushBranch);
    if (force) args.push('--force');

    const { stdout, stderr } = await runGit(args, { cwd: resolved });

    // Restore original URL (don't leave token in git config)
    if (authedUrl !== originalUrl) {
      await runGit(['remote', 'set-url', remote, originalUrl], { cwd: resolved });
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
      const { stdout: origUrl } = await runGit(['remote', 'get-url', remote], {
        cwd: resolved,
      });
      if (origUrl.includes('@github.com')) {
        const clean = origUrl.replace(/https:\/\/[^@]+@/, 'https://');
        await runGit(['remote', 'set-url', remote, clean.trim()], { cwd: resolved });
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
