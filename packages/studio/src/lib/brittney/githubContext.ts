/**
 * GitHub account context for Brittney — so she KNOWS who she's talking to and
 * what repos they have, instead of asking for a generic URL placeholder.
 *
 * The NextAuth GitHub provider stores the user's access token (scope
 * `repo read:user …`, see github-oauth-config.ts) on the session as
 * `session.accessToken`, and the login as `session.user.githubUsername`. This
 * module turns that token into the user's repo list (cached per-user, short
 * TTL) so the Brittney route can inject it into the system prompt.
 *
 * Fail-soft: any error / missing token returns an empty list — Brittney still
 * knows the username, just not the repos. Never blocks or throws into the chat.
 */

export interface GitHubRepoSummary {
  fullName: string;
  description: string | null;
  language: string | null;
  isPrivate: boolean;
  pushedAt: string;
}

const REPO_TTL_MS = 5 * 60 * 1000;
const repoCache = new Map<string, { repos: GitHubRepoSummary[]; at: number }>();

/**
 * Fetch the authenticated user's repos (owner-affiliated, most-recently-pushed
 * first). Cached per-username for REPO_TTL_MS so we don't hit the GitHub API on
 * every chat turn. Returns [] (or the last cached value) on any failure.
 */
export async function fetchUserRepos(
  accessToken: string,
  username: string
): Promise<GitHubRepoSummary[]> {
  const cached = repoCache.get(username);
  if (cached && Date.now() - cached.at < REPO_TTL_MS) return cached.repos;

  try {
    const res = await fetch(
      'https://api.github.com/user/repos?sort=pushed&per_page=30&affiliation=owner',
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(3500),
      }
    );
    if (!res.ok) return cached?.repos ?? [];
    const data = (await res.json()) as Array<Record<string, unknown>>;
    const repos: GitHubRepoSummary[] = data.map((r) => ({
      fullName: String(r.full_name ?? ''),
      description: (r.description as string | null) ?? null,
      language: (r.language as string | null) ?? null,
      isPrivate: Boolean(r.private),
      pushedAt: String(r.pushed_at ?? ''),
    }));
    repoCache.set(username, { repos, at: Date.now() });
    return repos;
  } catch {
    return cached?.repos ?? [];
  }
}
