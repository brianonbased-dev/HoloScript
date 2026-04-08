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

const GITHUB_API_BASE_URL = (
  process.env.GITHUB_API_URL || process.env.GITHUB_API_BASE_URL || 'https://api.github.com'
).replace(/\/+$/, '');

const GITHUB_API_VERSION = process.env.GITHUB_API_VERSION || '2022-11-28';

type GitHubRole = 'owner' | 'maintainer' | 'contributor' | 'viewer' | 'unknown';

function classifyRole(userLogin: string | null, ownerLogin: string | null, perms?: { admin?: boolean; push?: boolean; pull?: boolean }): GitHubRole {
  if (userLogin && ownerLogin && userLogin.toLowerCase() === ownerLogin.toLowerCase()) return 'owner';
  if (perms?.admin) return 'maintainer';
  if (perms?.push) return 'contributor';
  if (perms?.pull) return 'viewer';
  return 'unknown';
}

export async function GET(req: NextRequest) {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  const token = session?.accessToken ?? process.env.GITHUB_TOKEN;

  if (!token) {
    return NextResponse.json(
      { error: 'Not authenticated. Sign in with GitHub.' },
      { status: 401 }
    );
  }

  const owner = req.nextUrl.searchParams.get('owner');
  const repo = req.nextUrl.searchParams.get('repo');
  if (!owner || !repo) {
    return NextResponse.json(
      { error: 'Required query params: owner, repo' },
      { status: 400 }
    );
  }

  const [userResp, repoResp] = await Promise.all([
    fetch(`${GITHUB_API_BASE_URL}/user`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': 'HoloScript-Studio',
      },
      signal: AbortSignal.timeout(10_000),
    }),
    fetch(`${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': 'HoloScript-Studio',
      },
      signal: AbortSignal.timeout(10_000),
    }),
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
