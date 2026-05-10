export interface GitHubRepoRef {
  owner: string;
  repo: string;
  fullName: string;
  cloneUrl: string;
}

export class RepoConsentError extends Error {
  readonly status: 400 | 403;

  constructor(message: string, status: 400 | 403 = 403) {
    super(message);
    this.name = 'RepoConsentError';
    this.status = status;
  }
}

const GITHUB_OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/;
const GITHUB_REPO_RE = /^[A-Za-z0-9._-]{1,100}$/;

function normalizeKey(owner: string, repo: string): string {
  return `${owner}/${repo}`.toLowerCase();
}

export function normalizeGitHubRepo(value: string): GitHubRepoRef | null {
  const trimmed = value.trim();
  if (!trimmed || /[\x00-\x1f]/.test(trimmed)) return null;

  let owner: string | undefined;
  let repo: string | undefined;

  const sshMatch = trimmed.match(/^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/i);
  const shorthandMatch = trimmed.match(/^([^/\s]+)\/([^/\s]+?)(?:\.git)?$/);

  if (sshMatch) {
    owner = sshMatch[1];
    repo = sshMatch[2];
  } else if (shorthandMatch) {
    owner = shorthandMatch[1];
    repo = shorthandMatch[2];
  } else {
    try {
      const url = new URL(trimmed);
      if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') return null;
      if (url.username || url.password || url.search || url.hash) return null;
      const parts = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
      if (parts.length !== 2) return null;
      owner = parts[0];
      repo = parts[1]?.replace(/\.git$/i, '');
    } catch {
      return null;
    }
  }

  if (!owner || !repo) return null;
  repo = repo.replace(/\.git$/i, '');
  if (!GITHUB_OWNER_RE.test(owner) || !GITHUB_REPO_RE.test(repo)) return null;
  if (repo === '.' || repo === '..') return null;

  return {
    owner,
    repo,
    fullName: `${owner}/${repo}`,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

export function isGitHubRepoApproved(
  repo: GitHubRepoRef,
  approvedRepos: readonly string[]
): boolean {
  const repoKey = normalizeKey(repo.owner, repo.repo);
  return approvedRepos.some((approved) => {
    const normalized = normalizeGitHubRepo(approved);
    return normalized ? normalizeKey(normalized.owner, normalized.repo) === repoKey : false;
  });
}

export function requireApprovedGitHubRepo(
  repoUrl: string,
  approvedRepos: readonly string[]
): GitHubRepoRef {
  const repo = normalizeGitHubRepo(repoUrl);
  if (!repo) {
    throw new RepoConsentError(`Invalid GitHub repository: ${repoUrl}`, 400);
  }
  if (!isGitHubRepoApproved(repo, approvedRepos)) {
    throw new RepoConsentError(
      `Repository ${repo.fullName} is not approved for Studio access.`,
      403
    );
  }
  return repo;
}
