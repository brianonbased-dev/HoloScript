/**
 * GET /api/github/repos — List authenticated user's GitHub repositories.
 *
 * Requires GitHub OAuth session. Returns repos sorted by most recently pushed.
 * Supports ?q= search filter and ?per_page= pagination.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  html_url: string;
  clone_url: string;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  updated_at: string;
  pushed_at: string;
  private: boolean;
  fork: boolean;
  size: number;
}

interface RepoListItem {
  id: number;
  name: string;
  fullName: string;
  description: string | null;
  cloneUrl: string;
  defaultBranch: string;
  language: string | null;
  stars: number;
  pushedAt: string;
  isPrivate: boolean;
  isFork: boolean;
  sizeKB: number;
}

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return NextResponse.json(
      { error: 'Not authenticated. Sign in with GitHub first.' },
      { status: 401 },
    );
  }

  // Get the GitHub access token from the session/account
  // NextAuth stores it via the GitHub provider
  const accessToken = (session as any).accessToken;

  if (!accessToken) {
    // Fallback: list from GitHub API using server-side token if configured
    const serverToken = process.env.GITHUB_TOKEN;
    if (!serverToken) {
      return NextResponse.json(
        { error: 'No GitHub access token available. Re-authenticate with GitHub.' },
        { status: 401 },
      );
    }
    return fetchRepos(req, serverToken);
  }

  return fetchRepos(req, accessToken);
}

async function fetchRepos(req: NextRequest, token: string) {
  const q = req.nextUrl.searchParams.get('q')?.toLowerCase() ?? '';
  const perPage = Math.min(
    parseInt(req.nextUrl.searchParams.get('per_page') ?? '30', 10),
    100,
  );

  try {
    const res = await fetch(
      `https://api.github.com/user/repos?sort=pushed&per_page=${perPage}&type=all`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github.v3+json',
          'User-Agent': 'HoloScript-Studio',
        },
      },
    );

    if (!res.ok) {
      const body = await res.text();
      return NextResponse.json(
        { error: `GitHub API error: ${res.status}`, detail: body },
        { status: res.status },
      );
    }

    const ghRepos = (await res.json()) as GitHubRepo[];

    let repos: RepoListItem[] = ghRepos.map((r) => ({
      id: r.id,
      name: r.name,
      fullName: r.full_name,
      description: r.description,
      cloneUrl: r.clone_url,
      defaultBranch: r.default_branch,
      language: r.language,
      stars: r.stargazers_count,
      pushedAt: r.pushed_at,
      isPrivate: r.private,
      isFork: r.fork,
      sizeKB: r.size,
    }));

    if (q) {
      repos = repos.filter(
        (r) =>
          r.name.toLowerCase().includes(q) ||
          r.fullName.toLowerCase().includes(q) ||
          (r.description?.toLowerCase().includes(q) ?? false),
      );
    }

    return NextResponse.json({ repos, total: repos.length });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to fetch repos' },
      { status: 500 },
    );
  }
}
