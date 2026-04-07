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

async function getToken(req: NextRequest): Promise<string | null> {
  const { getServerSession } = await import('next-auth');
  const { authOptions } = await import('@/lib/auth');
  const session = await getServerSession(authOptions);
  void req; // suppress unused param warning — session is request-scoped
  return session?.accessToken ?? process.env.GITHUB_TOKEN ?? null;
}

export async function POST(req: NextRequest) {
  const token = await getToken(req);
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

  const response = await fetch(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'HoloScript-Studio',
      },
      body: JSON.stringify({ title, body: prBody ?? '', head, base, draft }),
      signal: AbortSignal.timeout(15_000),
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
  const token = await getToken(req);
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
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`
  );
  url.searchParams.set('state', state);
  url.searchParams.set('per_page', '50');

  const response = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'HoloScript-Studio',
    },
    signal: AbortSignal.timeout(15_000),
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
