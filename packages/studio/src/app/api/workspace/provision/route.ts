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
import {
  createGitHubHeaders,
  getGitHubToken,
  GITHUB_API_BASE_URL,
} from '@/app/api/github/_shared';

import { corsHeaders } from '../../_lib/cors';

/**
 * GitHub's own answer to "who holds this credential", for a session that did
 * not sign in through GitHub.
 *
 * Studio can hold a GitHub credential without a GitHub sign-in: the device
 * flow stores one against this browser, so someone signed in with Google may
 * have linked the account provisioning needs. Turning those callers away would
 * close the door on people who did exactly what Studio asked them to do.
 *
 * `userOnly` is the whole safety of this path. Without it `getGitHubToken` may
 * fall back to a SERVER credential outside production, and asking GitHub who
 * that belongs to would hand its owner's identity — login, numeric id and all —
 * to whoever happens to be signed in.
 *
 * What comes back is GitHub answering about a credential this caller controls,
 * which is the same authority an OAuth profile carries, including the numeric
 * id that the founder-tier branch inside provisionUser is gated on.
 */
async function linkedGitHubAccount(
  request: NextRequest
): Promise<{ login: string; accountId: string } | null> {
  const userToken = await getGitHubToken(request, { userOnly: true });
  if (!userToken) return null;

  try {
    const response = await fetch(`${GITHUB_API_BASE_URL}/user`, {
      headers: createGitHubHeaders(userToken),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return null;

    const profile = (await response.json()) as { login?: unknown; id?: unknown };
    const login = typeof profile.login === 'string' ? profile.login.trim() : '';
    if (!login) return null;
    const accountId =
      typeof profile.id === 'number' || typeof profile.id === 'string'
        ? String(profile.id).trim()
        : '';
    return { login, accountId };
  } catch {
    // A timeout, a network failure or a body that is not a profile is not an
    // identity. Fall through to the refusal rather than provisioning blind.
    return null;
  }
}

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
  let githubLogin = signedInWithGitHub ? (session.user.githubUsername ?? '').trim() : '';
  let githubAccountId = signedInWithGitHub ? (session.user.providerAccountId ?? '').trim() : '';

  // A Google sign-in is still a legitimate caller when the person linked their
  // GitHub account afterwards. Ask GitHub who that linked credential belongs to
  // before refusing — the door closes on callers with no GitHub account at all,
  // not on callers who connected one the other way round.
  if (!githubLogin) {
    const linked = await linkedGitHubAccount(request);
    if (linked) {
      githubLogin = linked.login;
      githubAccountId = linked.accountId;
    }
  }

  if (!githubLogin) {
    return NextResponse.json(
      {
        error:
          'Provisioning needs your GitHub account. Sign in with GitHub, or connect GitHub to this session, then try again.',
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
