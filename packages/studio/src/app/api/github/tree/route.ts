/**
 * GET /api/github/tree — List files in a directory of a GitHub repository
 *
 * Proxies to the GitHub Contents API for directory listings.
 * For root listing, omit the path param or pass empty string.
 *
 * Query params:
 *   - owner: Repository owner (required)
 *   - repo: Repository name (required)
 *   - path: Directory path within the repo (optional, defaults to root)
 *   - ref: Branch/tag/SHA (optional, defaults to repo default branch)
 *
 * @module api/github/tree
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

const GITHUB_API_BASE_URL = (
  process.env.GITHUB_API_URL || process.env.GITHUB_API_BASE_URL || 'https://api.github.com'
).replace(/\/+$/, '');

const GITHUB_API_VERSION = process.env.GITHUB_API_VERSION || '2022-11-28';

interface GitHubContentEntry {
  name: string;
  path: string;
  sha: string;
  size: number;
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  html_url: string;
  download_url: string | null;
}

export async function GET(req: NextRequest) {
  try {
    const { getServerSession } = await import('next-auth');
    const { authOptions } = await import('@/lib/auth');
    const session = await getServerSession(authOptions);
    const token = session?.accessToken ?? process.env.GITHUB_TOKEN;
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated. Sign in with GitHub or set GITHUB_TOKEN.' },
        { status: 401 }
      );
    }

    const searchParams = req.nextUrl.searchParams;
    const owner = searchParams.get('owner');
    const repo = searchParams.get('repo');
    const dirPath = searchParams.get('path') || '';
    const ref = searchParams.get('ref');

    if (!owner || !repo) {
      return NextResponse.json(
        { error: 'Missing required query params: owner, repo' },
        { status: 400 }
      );
    }

    const pathSegment = dirPath ? `/${dirPath}` : '';
    const url = new URL(
      `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents${pathSegment}`
    );
    if (ref) url.searchParams.set('ref', ref);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'X-GitHub-Api-Version': GITHUB_API_VERSION,
        'User-Agent': 'HoloScript-Studio',
      },
      signal: AbortSignal.timeout(15_000),
    });

    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      return NextResponse.json(
        { error: errorBody?.message ?? `GitHub API returned ${response.status}` },
        { status: response.status }
      );
    }

    const data = (await response.json()) as GitHubContentEntry | GitHubContentEntry[];

    // GitHub returns an object for files, array for directories
    if (!Array.isArray(data)) {
      return NextResponse.json(
        { error: 'Path is a file, not a directory. Use /api/github/file instead.' },
        { status: 422 }
      );
    }

    const entries = data.map((entry) => ({
      name: entry.name,
      path: entry.path,
      type: entry.type,
      size: entry.size,
      sha: entry.sha,
    }));

    return NextResponse.json({
      path: dirPath || '/',
      entries,
      total: entries.length,
    });
  } catch (error) {
    logger.error('[api/github/tree] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to list directory' },
      { status: 500 }
    );
  }
}
