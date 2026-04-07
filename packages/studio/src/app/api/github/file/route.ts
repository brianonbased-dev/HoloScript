/**
 * GET /api/github/file — Read a file from a GitHub repository
 *
 * Proxies to the GitHub Contents API and decodes base64 content.
 *
 * Query params:
 *   - owner: Repository owner (required)
 *   - repo: Repository name (required)
 *   - path: File path within the repo (required)
 *   - ref: Branch/tag/SHA (optional, defaults to repo default branch)
 *
 * @module api/github/file
 */

import { NextRequest, NextResponse } from 'next/server';
import { logger } from '@/lib/logger';

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
    const filePath = searchParams.get('path');
    const ref = searchParams.get('ref');

    if (!owner || !repo || !filePath) {
      return NextResponse.json(
        { error: 'Missing required query params: owner, repo, path' },
        { status: 400 }
      );
    }

    const url = new URL(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${filePath}`
    );
    if (ref) url.searchParams.set('ref', ref);

    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
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

    const data = (await response.json()) as Record<string, unknown>;

    // GitHub returns base64-encoded content for files
    if (data.type !== 'file' || typeof data.content !== 'string') {
      return NextResponse.json(
        { error: 'Path is not a file or content is unavailable' },
        { status: 422 }
      );
    }

    const content = Buffer.from(data.content as string, 'base64').toString('utf-8');

    return NextResponse.json({
      path: data.path,
      name: data.name,
      sha: data.sha,
      size: data.size,
      encoding: 'utf-8',
      content,
    });
  } catch (error) {
    logger.error('[api/github/file] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to read file' },
      { status: 500 }
    );
  }
}
