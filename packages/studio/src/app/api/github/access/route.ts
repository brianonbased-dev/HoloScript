export const maxDuration = 300;

/**
 * GET /api/github/access — Determine current user's access level for a repo.
 *
 * Query params:
 *   owner: string
 *   repo:  string
 *
 * Returns:
 *   {
 *     role: 'owner' | 'maintainer' | 'contributor' | 'viewer' | 'unknown',
 *     canDirectShip: boolean,
 *     recommendedFlow: 'direct-ship' | 'branch-pr',
 *     user: string | null,
 *     owner: string | null,
 *   }
 */

import { NextRequest, NextResponse } from 'next/server';
import { corsHeaders } from '../../_lib/cors';
import {
  createGitHubHeaders,
  getGitHubToken,
  githubFetchWithRetry,
  GITHUB_API_BASE_URL,
} from '../_shared';

type GitHubRole = 'owner' | 'maintainer' | 'contributor' | 'viewer' | 'unknown';

function classifyRole(
  userLogin: string | null,
  ownerLogin: string | null,
  perms?: { admin?: boolean; push?: boolean; pull?: boolean }
): GitHubRole {
  if (userLogin && ownerLogin && userLogin.toLowerCase() === ownerLogin.toLowerCase())
    return 'owner';
  if (perms?.admin) return 'maintainer';
  if (perms?.push) return 'contributor';
  if (perms?.pull) return 'viewer';
  return 'unknown';
}

export async function GET(req: NextRequest) {
  const token = await getGitHubToken(req);

  if (!token) {
    return NextResponse.json({ error: 'Not authenticated. Sign in with GitHub.' }, { status: 401 });
  }

  const owner = req.nextUrl.searchParams.get('owner');
  const repo = req.nextUrl.searchParams.get('repo');
  if (!owner || !repo) {
    return NextResponse.json({ error: 'Required query params: owner, repo' }, { status: 400 });
  }

  const [userResp, repoResp] = await Promise.all([
    githubFetchWithRetry(`${GITHUB_API_BASE_URL}/user`, {
      headers: createGitHubHeaders(token),
    }),
    githubFetchWithRetry(
      `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      {
        headers: createGitHubHeaders(token),
      }
    ),
  ]);

  if (!userResp.ok || !repoResp.ok) {
    return NextResponse.json(
      { error: 'Unable to resolve GitHub access for this repository.' },
      { status: 502 }
    );
  }

  const user = (await userResp.json()) as { login?: string };
  const repoInfo = (await repoResp.json()) as {
    owner?: { login?: string };
    permissions?: { admin?: boolean; push?: boolean; pull?: boolean };
  };

  const userLogin = user?.login ?? null;
  const ownerLogin = repoInfo?.owner?.login ?? null;
  const role = classifyRole(userLogin, ownerLogin, repoInfo?.permissions);
  const canDirectShip = role === 'owner' || role === 'maintainer';

  return NextResponse.json({
    role,
    canDirectShip,
    recommendedFlow: canDirectShip ? 'direct-ship' : 'branch-pr',
    user: userLogin,
    owner: ownerLogin,
  });
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
