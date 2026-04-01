/**
 * GET /api/github/repos — List authenticated user's GitHub repositories
 *
 * Uses @holoscript/connector-github to fetch repos via GitHubConnector.
 * Requires GITHUB_TOKEN environment variable (will be replaced by OAuth later).
 *
 * Query params:
 *   - per_page: Number of repos per page (default: 50, max: 100)
 *   - q: Search query (filters by repo name/description)
 *
 * @module api/github/repos
 */

import { NextRequest, NextResponse } from 'next/server';
import { GitHubConnector } from '@holoscript/connector-github';
import { logger } from '@/lib/logger';

export async function GET(req: NextRequest) {
  try {
    // Check if GitHub token is available
    if (!process.env.GITHUB_TOKEN) {
      return NextResponse.json(
        { error: 'GitHub not connected. Set GITHUB_TOKEN environment variable.' },
        { status: 401 }
      );
    }

    // Parse query params
    const searchParams = req.nextUrl.searchParams;
    const perPage = Math.min(parseInt(searchParams.get('per_page') || '50', 10), 100);
    const searchQuery = searchParams.get('q') || '';

    // Initialize GitHub connector
    const github = new GitHubConnector();
    await github.connect();

    // Check health
    const healthy = await github.health();
    if (!healthy) {
      return NextResponse.json(
        { error: 'GitHub connector health check failed' },
        { status: 503 }
      );
    }

    // Fetch repositories
    const result = await github.executeTool('github_repo_list', {
      type: 'owner',
      sort: 'updated',
      per_page: perPage,
    });

    // Type guard
    if (!result || typeof result !== 'object' || !('data' in result)) {
      throw new Error('Invalid response from GitHub connector');
    }

    const data = result.data as any;
    let repos = Array.isArray(data) ? data : [];

    // Filter by search query if provided
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      repos = repos.filter(
        (repo: any) =>
          repo.name?.toLowerCase().includes(query) ||
          repo.description?.toLowerCase().includes(query) ||
          repo.full_name?.toLowerCase().includes(query)
      );
    }

    // Transform to studio format
    const transformedRepos = repos.map((repo: any) => ({
      id: repo.id,
      name: repo.name,
      fullName: repo.full_name,
      description: repo.description,
      cloneUrl: repo.clone_url,
      defaultBranch: repo.default_branch,
      language: repo.language,
      stars: repo.stargazers_count || 0,
      pushedAt: repo.pushed_at,
      isPrivate: repo.private,
      isFork: repo.fork,
      sizeKB: repo.size || 0,
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
