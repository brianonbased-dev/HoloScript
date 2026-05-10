import { describe, expect, it } from 'vitest';
import {
  isGitHubRepoApproved,
  normalizeGitHubRepo,
  RepoConsentError,
  requireApprovedGitHubRepo,
} from '../repoConsent';

describe('repo consent normalization', () => {
  it.each([
    ['https://github.com/acme/private-repo', 'https://github.com/acme/private-repo.git'],
    ['https://github.com/acme/private-repo.git', 'https://github.com/acme/private-repo.git'],
    ['git@github.com:acme/private-repo.git', 'https://github.com/acme/private-repo.git'],
    ['acme/private-repo', 'https://github.com/acme/private-repo.git'],
  ])('normalizes %s to a canonical clone URL', (input, cloneUrl) => {
    expect(normalizeGitHubRepo(input)).toMatchObject({
      owner: 'acme',
      repo: 'private-repo',
      fullName: 'acme/private-repo',
      cloneUrl,
    });
  });

  it('rejects non-github, credentialed, and decorated URLs', () => {
    for (const input of [
      'https://evil.example/acme/repo.git',
      'https://github.com/acme/repo.git?upload-pack=touch-pwned',
      'https://token@github.com/acme/repo.git',
      'https://github.com/acme/repo/tree/main',
    ]) {
      expect(normalizeGitHubRepo(input)).toBeNull();
    }
  });

  it('matches approved repos across supported GitHub URL forms', () => {
    const repo = requireApprovedGitHubRepo('https://github.com/acme/private-repo.git', [
      'git@github.com:ACME/private-repo.git',
    ]);

    expect(isGitHubRepoApproved(repo, ['acme/private-repo'])).toBe(true);
    expect(isGitHubRepoApproved(repo, ['acme/other-repo'])).toBe(false);
  });

  it('throws a consent error when the repo was not approved', () => {
    expect(() =>
      requireApprovedGitHubRepo('https://github.com/acme/private-repo.git', ['acme/other-repo'])
    ).toThrow(RepoConsentError);
  });
});
