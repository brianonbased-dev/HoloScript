/**
 * POST /api/github/pr — Create a pull request via the GitHub API.
 *
 * Body: {
 *   owner:   string   repository owner
 *   repo:    string   repository name
 *   title:   string   PR title
 *   body?:   string   PR description (markdown)
 *   head:    string   branch with changes (e.g. "feat/my-feature")
 *   base:    string   target branch (e.g. "main")
 *   draft?:  boolean  open as draft PR (default false)
 * }
 *
 * GET /api/github/pr?owner=&repo=&state= — List pull requests.
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  createGitHubHeaders,
  getGitHubToken,
  GITHUB_API_BASE_URL,
  githubFetchWithRetry,
} from '../_shared';

export async function POST(req: NextRequest) {
  const token = await getGitHubToken(req);
  if (!token) {
    return NextResponse.json(
      { error: 'Not authenticated. Sign in with GitHub.' },
      { status: 401 }
    );
  }

  const body = (await req.json().catch(() => null)) as {
    owner: string;
    repo: string;
    title: string;
    body?: string;
    head: string;
    base: string;
    draft?: boolean;
  } | null;

  if (!body?.owner || !body?.repo || !body?.title || !body?.head || !body?.base) {
    return NextResponse.json(
      { error: 'Required: owner, repo, title, head, base' },
      { status: 400 }
    );
  }

  const { owner, repo, title, body: prBody, head, base, draft = false } = body;

  const response = await githubFetchWithRetry(
    `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    {
      method: 'POST',
      headers: createGitHubHeaders(token, { contentTypeJson: true }),
      body: JSON.stringify({ title, body: prBody ?? '', head, base, draft }),
    }
  );

  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    return NextResponse.json(
      { error: (data.message as string) ?? `GitHub API returned ${response.status}` },
      { status: response.status }
    );
  }

  return NextResponse.json({
    number: data.number,
    url: data.html_url,
    state: data.state,
    title: data.title,
    head,
    base,
    draft: data.draft,
    nodeId: data.node_id,
  });
}

export async function GET(req: NextRequest) {
  const token = await getGitHubToken(req);
  if (!token) {
    return NextResponse.json({ error: 'Not authenticated.' }, { status: 401 });
  }

  const p = req.nextUrl.searchParams;
  const owner = p.get('owner');
  const repo = p.get('repo');
  const state = p.get('state') ?? 'open';

  if (!owner || !repo) {
    return NextResponse.json({ error: 'Required: owner, repo' }, { status: 400 });
  }

  const url = new URL(
    `${GITHUB_API_BASE_URL}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`
  );
  url.searchParams.set('state', state);
  url.searchParams.set('per_page', '50');

  const response = await githubFetchWithRetry(url.toString(), {
    headers: createGitHubHeaders(token),
  });

  const data = (await response.json().catch(() => [])) as Record<string, unknown>[];
  if (!response.ok) {
    return NextResponse.json(
      { error: `GitHub API returned ${response.status}` },
      { status: response.status }
    );
  }

  const prs = data.map((pr) => ({
    number: pr.number,
    title: pr.title,
    state: pr.state,
    url: pr.html_url,
    head: (pr.head as Record<string, unknown>)?.ref,
    base: (pr.base as Record<string, unknown>)?.ref,
    draft: pr.draft,
    createdAt: pr.created_at,
    updatedAt: pr.updated_at,
  }));

  return NextResponse.json({ prs, total: prs.length });
}
