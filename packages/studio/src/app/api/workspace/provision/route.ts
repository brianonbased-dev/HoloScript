/**
 * POST /api/workspace/provision — Auto-provision a user's full HoloScript workspace.
 *
 * Called after GitHub OAuth completes. Provisions API key, creates/connects repo,
 * seeds .claude/ structure, starts daemon. The user clicks "Sign in with GitHub"
 * and everything else is automatic.
 */

import { getServerSession } from 'next-auth';
import { NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { provisionUser } from '@/lib/workspace/provisionUser';

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: { repoUrl?: string; projectName?: string; intent?: string };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Get the GitHub access token from the session
  // NextAuth stores it if we configure the jwt callback
  const accessToken = (session as Record<string, unknown>).accessToken as string | undefined;
  if (!accessToken) {
    return NextResponse.json(
      { error: 'GitHub access token not available. Please re-authenticate.' },
      { status: 403 }
    );
  }

  const result = await provisionUser({
    githubAccessToken: accessToken,
    githubUsername: session.user.name || session.user.id,
    email: session.user.email || '',
    repoUrl: body.repoUrl,
    projectName: body.projectName,
    intent: body.intent,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, steps: result.steps },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    user: {
      workspaceId: result.user?.workspaceId,
      repoUrl: result.user?.repoUrl,
      repoName: result.user?.repoName,
      scaffolded: result.user?.scaffolded,
      daemonStarted: result.user?.daemonStarted,
    },
    steps: result.steps,
  });
}
