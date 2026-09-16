export const maxDuration = 300;

/**
 * POST /api/workspace/provision — Auto-provision a user's full HoloScript workspace.
 *
 * Called after GitHub OAuth completes. Provisions API key, creates/connects repo,
 * seeds .claude/ structure, starts daemon. The user clicks "Sign in with GitHub"
 * and everything else is automatic.
 */

import { getServerSession } from 'next-auth';
import { NextRequest, NextResponse } from 'next/server';
import { authOptions } from '@/lib/auth';
import { provisionUser } from '@/lib/workspace/provisionUser';
import { putUserSecret } from '@/lib/secrets/userSecretStore';
import { getGitHubToken } from '@/app/api/github/_shared';

import { corsHeaders } from '../../_lib/cors';
export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  let body: {
    repoUrl?: string;
    projectName?: string;
    intent?: string;
    consent?: {
      repos?: string[];
      scaffold?: boolean;
      absorb?: boolean;
      publishKnowledge?: boolean;
      daemon?: boolean;
    };
  };
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  // Extract consent gates with safe defaults
  const consent = body.consent ?? {};
  const approvedRepos = Array.isArray(consent.repos) ? consent.repos : [];
  const approvedScaffold = consent.scaffold !== false;
  const approvedAbsorb = consent.absorb !== false;
  const approvedPublishKnowledge = consent.publishKnowledge === true;
  const approvedDaemon = consent.daemon !== false;

  const accessToken = await getGitHubToken(request);
  if (!accessToken) {
    return NextResponse.json(
      { error: 'GitHub access token not available. Please re-authenticate.' },
      { status: 403 }
    );
  }

  // Provisioning creates or connects a GitHub repo and can mint a founder-tier
  // orchestrator key, so the GitHub identity must come from the OAuth profile.
  // This used to pass `session.user.name || session.user.id` into a field
  // called `githubUsername` — a DISPLAY NAME, chosen freely by whoever signs
  // in, standing in for a login. That is what let a typed name reach the
  // founder branch. Nothing here falls back to the name.
  const signedInWithGitHub = session.user.provider === 'github';
  const githubLogin = signedInWithGitHub ? (session.user.githubUsername ?? '').trim() : '';
  const githubAccountId = signedInWithGitHub ? (session.user.providerAccountId ?? '').trim() : '';

  if (!githubLogin) {
    return NextResponse.json(
      {
        error:
          'Provisioning needs your GitHub login. Sign in with GitHub, then try again.',
      },
      { status: 400 }
    );
  }

  const result = await provisionUser({
    githubAccessToken: accessToken,
    githubUsername: githubLogin,
    githubAccountId,
    email: session.user.email || '',
    repoUrl: body.repoUrl,
    projectName: body.projectName,
    intent: body.intent,
    approvedRepos,
    approvedScaffold,
    approvedAbsorb,
    approvedPublishKnowledge,
    approvedDaemon,
  });

  if (!result.success) {
    return NextResponse.json(
      { error: result.error, steps: result.steps },
      { status: result.errorStatus ?? 500 }
    );
  }

  let holomeshCredentialStored = false;
  const holomeshApiKey = result.user?.holomeshApiKey;
  if (typeof holomeshApiKey === 'string' && holomeshApiKey.length > 0) {
    try {
      await putUserSecret({
        ownerId: session.user.id,
        name: 'HOLOMESH_API_KEY',
        value: holomeshApiKey,
      });
      holomeshCredentialStored = true;
    } catch {
      // Provisioning predates the optional encrypted vault. Keep the existing
      // one-time credential response available when vault custody is absent or
      // temporarily unavailable, without logging or returning vault details.
    }
  }

  return NextResponse.json({
    success: true,
    holomeshCredentialStored,
    user: {
      workspaceId: result.user?.workspaceId,
      repoUrl: result.user?.repoUrl,
      repoName: result.user?.repoName,
      tier: result.user?.tier,
      capabilities: result.user?.capabilities,
      accountWorkspace: result.user?.accountWorkspace,
      scaffolded: result.user?.scaffolded,
      daemonStarted: result.user?.daemonStarted,
      // HoloMesh agent identity — display once to user so they can store in .env
      holomeshAgentId: result.user?.holomeshAgentId,
      holomeshApiKey,
      holomeshWalletAddress: result.user?.holomeshWalletAddress,
    },
    steps: result.steps,
  });
}

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
