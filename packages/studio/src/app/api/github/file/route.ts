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
import {
  createGitHubHeaders,
  encodeGitHubPath,
  getGitHubToken,
  githubFetchWithRetry,
  GITHUB_API_BASE_URL,
} from '../_shared';

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

/**
 * PUT /api/github/file — Create or update a file via the GitHub Contents API.
 *
 * Body: { owner, repo, path, content, message, sha?, branch? }
 *   - sha is required when updating an existing file (omit for new files)
 *   - content is the raw UTF-8 string to write (will be base64-encoded)
 */
export async function PUT(req: NextRequest) {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated. Sign in with GitHub or set GITHUB_TOKEN.' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      owner: string;
      repo: string;
      path: string;
      content: string;
      message: string;
      sha?: string;
      branch?: string;
    };

    const { owner, repo, path: filePath, content, message, sha, branch } = body;
    if (!owner || !repo || !filePath || content === undefined || !message) {
      return NextResponse.json(
        { error: 'Required: owner, repo, path, content, message' },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = {
      message,
      content: Buffer.from(content, 'utf-8').toString('base64'),
    };
    if (sha) payload.sha = sha;
    if (branch) payload.branch = branch;

    const encodedPath = encodeGitHubPath(filePath);
    const url = `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
    const response = await githubFetchWithRetry(url, {
      method: 'PUT',
      headers: createGitHubHeaders(token, { contentTypeJson: true }),
      body: JSON.stringify(payload),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return NextResponse.json(
        { error: (data.message as string) ?? `GitHub API returned ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json({
      sha: (data.content as Record<string, unknown>)?.sha,
      path: filePath,
      commit: (data.commit as Record<string, unknown>)?.sha,
      url: (data.content as Record<string, unknown>)?.html_url,
    });
  } catch (error) {
    logger.error('[api/github/file PUT] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to write file' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/github/file — Delete a file via the GitHub Contents API.
 *
 * Body: { owner, repo, path, message, sha, branch? }
 */
export async function DELETE(req: NextRequest) {
  try {
    const token = await getGitHubToken(req);
    if (!token) {
      return NextResponse.json(
        { error: 'Not authenticated. Sign in with GitHub or set GITHUB_TOKEN.' },
        { status: 401 }
      );
    }

    const body = (await req.json()) as {
      owner: string;
      repo: string;
      path: string;
      message: string;
      sha: string;
      branch?: string;
    };

    const { owner, repo, path: filePath, message, sha, branch } = body;
    if (!owner || !repo || !filePath || !message || !sha) {
      return NextResponse.json(
        { error: 'Required: owner, repo, path, message, sha' },
        { status: 400 }
      );
    }

    const payload: Record<string, unknown> = { message, sha };
    if (branch) payload.branch = branch;

    const encodedPath = encodeGitHubPath(filePath);
    const url = `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${encodedPath}`;
    const response = await githubFetchWithRetry(url, {
      method: 'DELETE',
      headers: createGitHubHeaders(token, { contentTypeJson: true }),
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
      return NextResponse.json(
        { error: (data.message as string) ?? `GitHub API returned ${response.status}` },
        { status: response.status }
      );
    }

    return NextResponse.json({ deleted: true, path: filePath });
  } catch (error) {
    logger.error('[api/github/file DELETE] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to delete file' },
      { status: 500 }
    );
  }
}


export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-mcp-api-key',
    },
  });
}
