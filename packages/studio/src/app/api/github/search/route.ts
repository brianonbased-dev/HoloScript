/**
 * GET /api/github/search — Search for code in a GitHub repository
 *
 * Proxies to the GitHub Code Search API scoped to a specific repository.
 *
 * Query params:
 *   - owner: Repository owner (required)
 *   - repo: Repository name (required)
 *   - query: Search query (required)
 *
 * @module api/github/search
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';
import {
  createGitHubHeaders,
  getGitHubToken,
  githubFetchWithRetry,
  GITHUB_API_BASE_URL,
} from '../_shared';

interface GitHubSearchItem {
  name: string;
  path: string;
  sha: string;
  html_url: string;
  repository: { full_name: string };
  text_matches?: Array<{
    fragment: string;
    matches: Array<{ text: string; indices: number[] }>;
  }>;
}

interface GitHubSearchResponse {
  total_count: number;
  incomplete_results: boolean;
  items: GitHubSearchItem[];
}

export async function GET(req: NextRequest) {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated. Sign in with GitHub or set GITHUB_TOKEN.' },
        { status: 401 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const query = searchParams.get('query');

    if (!owner || !repo || !query) {
      return NextResponse.json(
        { error: 'Missing required query params: owner, repo, query' },
        { status: 400 }
      );
    }

    // Scope search to the specific repository
    const scopedQuery = `${query} repo:${owner}/${repo}`;
    const url = new URL(`${GITHUB_API_BASE_URL}/search/code`);
    url.searchParams.set('q', scopedQuery);
    url.searchParams.set('per_page', '30');

    const response = await githubFetchWithRetry(url.toString(), {
      headers: createGitHubHeaders(token, {
        // Request text-match metadata for highlighted snippets
        accept: 'application/vnd.github.text-match+json',
      }),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      return NextResponse.json(
        { error: errorBody?.message ?? `GitHub API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = (await response.json()) as GitHubSearchResponse;

    const results = data.items.map((item) => ({
      name: item.name,
      path: item.path,
      sha: item.sha,
      htmlUrl: item.html_url,
      textMatches: (item.text_matches ?? []).map((tm) => ({
        fragment: tm.fragment,
        matches: tm.matches,
      })),
    }));

    return NextResponse.json({
      totalCount: data.total_count,
      incompleteResults: data.incomplete_results,
      results,
    });
  } catch (error) {
    logger.error('[api/github/search] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to search code' },
      { status: 500 }
    );
  }
}
