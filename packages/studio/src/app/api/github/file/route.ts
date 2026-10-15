export const maxDuration = 300;

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
import { corsHeaders } from '../../_lib/cors';
import {
  createGitHubHeaders,
  encodeGitHubPath,
  getGitHubAuthRequiredMessage,
  getGitHubToken,
  githubFetchWithRetry,
  GITHUB_API_BASE_URL,
} from '../_shared';

export async function GET(req: NextRequest) {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      return NextResponse.json({ error: getGitHubAuthRequiredMessage() }, { status: 401 });
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

    const encodedPath = encodeGitHubPath(filePath);
    const url = new URL(
      `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`
    );
    if (ref) url.searchParams.set('ref', ref);

    const response = await githubFetchWithRetry(url.toString(), {
      headers: createGitHubHeaders(token),
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

// PUT and DELETE were removed (Oct 15, 2026). They committed straight to a
// repo through the GitHub Contents API, defaulting to the default branch when
// `branch` was omitted, and ignored the per-workspace direct-ship setting. No
// Studio code called them (Brittney's read_file uses GET only). Writes go
// through a workspace clone and /api/git/push, which enforces direct ship.

export function OPTIONS(request: Request) {
  return new Response(null, {
    status: 204,
    headers: corsHeaders(request, { methods: 'GET, OPTIONS' }),
  });
}
