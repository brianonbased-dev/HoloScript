import { describe, it, expect } from 'vitest';
import { sanitizeClientGitMessage } from './sanitizeClientGitMessage';

describe('sanitizeClientGitMessage (SEC-T04)', () => {
  it('strips https://token@github.com style URLs', () => {
    const msg =
      'fatal: unable to access https://gho_FAKE_TOKEN_EXAMPLE@github.com/org/repo.git/: The requested URL returned error: 403';
    const out = sanitizeClientGitMessage(msg);
    expect(out).not.toMatch(/gho_/);
    expect(out).toContain('https://github.com/org/repo.git/');
  });

  it('strips user:password@ form', () => {
    const msg = 'remote: error: https://oauth-user:supersecret@github.com/x.git';
    expect(sanitizeClientGitMessage(msg)).toBe(
      'remote: error: https://github.com/x.git'
    );
  });

  it('redacts ghp_ PATs if they appear without a URL', () => {
    const msg = 'Authentication failed for token ghp_abcdefghijklmnopqrst';
    const out = sanitizeClientGitMessage(msg);
    expect(out).toContain('[redacted]');
    expect(out).not.toMatch(/ghp_[a-zA-Z0-9]/);
  });

  it('handles Error objects', () => {
    const err = new Error('see https://x-access-token:abc123def456@github.com/foo');
    const out = sanitizeClientGitMessage(err);
    expect(out).not.toContain('abc123def456');
    expect(out).toContain('https://github.com/foo');
  });
});
