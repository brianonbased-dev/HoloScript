/**
 * Same-repo agent branches get the quick-profile dispatch. Fork agent
 * branches and pull_request events do not.
 */
import { describe, expect, it } from 'vitest';
import { decideGithubCiDispatch } from '../github-webhook-dispatch';

const SHA = '0123456789abcdef0123456789abcdef01234567';

function decide(
  ref: string,
  extras: { event?: string; repositoryFork?: boolean; sha?: string } = {}
) {
  return decideGithubCiDispatch({
    event: extras.event ?? 'push',
    ref,
    sha: extras.sha ?? SHA,
    repositoryFork: extras.repositoryFork ?? false,
  });
}

describe('decideGithubCiDispatch', () => {
  it('admits same-repo agent prefixes, including numbered sessions', () => {
    for (const ref of [
      'refs/heads/claude/examples-catalog-order',
      'refs/heads/claude1/agent-model-pricing-startup',
      'refs/heads/claude2/aibrittney-local-model',
      'refs/heads/claude4/studio-server-key-doors',
      'refs/heads/codex/stale-presence-reopen',
      'refs/heads/cursor/restore-frontier-fallback-generic-4e0a',
      'refs/heads/hardware/vast-coding-backup-chain-20260924',
    ]) {
      expect(decide(ref), ref).toEqual({ dispatch: true, reason: 'same-repo agent branch' });
    }
  });

  it('still admits the default branch', () => {
    expect(decide('refs/heads/main')).toEqual({ dispatch: true, reason: 'default branch' });
    expect(decide('refs/heads/master')).toEqual({ dispatch: true, reason: 'default branch' });
  });

  it('does not admit non-agent same-repo branches', () => {
    for (const ref of [
      'refs/heads/integrate/second-lane-20260921',
      'refs/heads/preserve/laptop-main-20260910',
      'refs/heads/chore/mcp-security-and-webhook',
      'refs/heads/feature/not-an-agent',
    ]) {
      const decision = decide(ref);
      expect(decision.dispatch, ref).toBe(false);
      expect(decision.reason).toContain('not main/master');
    }
  });

  it('does not admit agent branches when the repository is a fork', () => {
    for (const ref of [
      'refs/heads/claude/examples-catalog-order',
      'refs/heads/claude1/agent-model-pricing-startup',
      'refs/heads/cursor/restore-frontier-fallback-generic-4e0a',
      'refs/heads/hardware/vast-coding-backup-chain-20260924',
    ]) {
      const decision = decide(ref, { repositoryFork: true });
      expect(decision.dispatch, ref).toBe(false);
      expect(decision.reason).toContain('fork');
    }
  });

  it('does not run a fork default branch on our machines', () => {
    const decision = decide('refs/heads/main', { repositoryFork: true });
    expect(decision.dispatch).toBe(false);
    expect(decision.reason).toContain('fork');
  });

  it('does not dispatch pull_request events', () => {
    const decision = decide('refs/heads/cursor/some-fix', { event: 'pull_request' });
    expect(decision.dispatch).toBe(false);
    expect(decision.reason).toContain('pull_request');
  });

  it('skips a deleted agent branch', () => {
    const decision = decide('refs/heads/cursor/gone', { sha: '0'.repeat(40) });
    expect(decision).toEqual({ dispatch: false, reason: 'branch deletion' });
  });
});
