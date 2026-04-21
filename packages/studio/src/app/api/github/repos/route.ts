export const maxDuration = 300;

/**
 * GET /api/github/repos — List authenticated user's GitHub repositories
 *
 * Uses the OAuth access token from the user's session (GitHub sign-in).
 * Falls back to GITHUB_TOKEN env var for dev/CI environments.
 *
 * Query params:
 *   - per_page: Number of repos per page (default: 50, max: 100)
 *   - q: Search query (filters by repo name/description)
 *
 * @module api/github/repos
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import { corsHeaders } from '../../_lib/cors';
import {
  createGitHubHeaders,
  getGitHubToken,
  githubFetchWithRetry,
  GITHUB_API_BASE_URL,
} from '../_shared';

interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  clone_url: string;
  default_branch: string;
  language: string | null;
  stargazers_count: number;
  pushed_at: string;
  private: boolean;
  fork: boolean;
  size: number;
}

export async function GET(req: NextRequest) {
  try {
    // Prefer the authenticated user's OAuth token; fall back to env var for dev/CI
    const token = await getGitHubToken(req);
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated. Sign in with GitHub or set GITHUB_TOKEN.' },
        { status: 401 }
      );
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '50', 10), 100);
    const searchQuery = searchParams.get('q') || '';

    // Fetch repos directly from GitHub API using the resolved token
    const url = new URL(`${GITHUB_API_BASE_URL}/user/repos`);
    url.searchParams.set('type', 'owner');
    url.searchParams.set('sort', 'updated');
    url.searchParams.set('per_page', String(perPage));

    const response = await githubFetchWithRetry(url.toString(), {
      headers: createGitHubHeaders(token),
    });

    if (!response.ok) {
      const body = await response.text();
      logger.error('[api/github/repos] GitHub API error:', response.status, body);
      return NextResponse.json(
        { error: `GitHub API error: ${response.status}` },
        { status: response.status === 401 ? 401 : 502 }
      );
    }

    let repos: GitHubRepo[] = await response.json();

    // Filter by search query if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      repos = repos.filter(
        (repo) =>
          repo.name.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query) ||
          repo.full_name.toLowerCase().includes(query)
      );
    }

    // Transform to studio format
    const transformedRepos = repos.map((repo) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      language: repo.language,
      stars: repo.stargazers_count,
      pushedAt: repo.pushed_at,
      isPrivate: repo.private,
      isFork: repo.fork,
      sizeKB: repo.size,
    }));

    return NextResponse.json({
      repos: transformedRepos,
      total: transformedRepos.length,
    });
  } catch (error) {
    logger.error('[api/github/repos] Error:', error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to fetch repositories',
      },
      { status: 500 }
    );
  }
}


export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' }),
  });
}
