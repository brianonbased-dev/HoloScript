/**
 * The push receiver's branch filter. main admits main/master plus claude/ and
 * codex/ only. These cases are the names that miss that pair, and the names
 * that must stay out.
 */
import { describe, expect, it } from 'vitest';
import { isGithubCiPushRef } from '../github-webhook-dispatch';

describe('isGithubCiPushRef', () => {
  it('admits main and the original two patterns', () => {
    expect(isGithubCiPushRef('refs/heads/main')).toBe(true);
    expect(isGithubCiPushRef('refs/heads/master')).toBe(true);
    expect(isGithubCiPushRef('refs/heads/claude/agent-context-ledger')).toBe(true);
    expect(isGithubCiPushRef('refs/heads/codex/stale-presence-reopen')).toBe(true);
  });

  it('admits agent names that miss claude/ and codex/', () => {
    for (const ref of [
      'refs/heads/claude1/agent-model-pricing-startup',
      'refs/heads/claude2/aibrittney-local-model',
      'refs/heads/claude4/studio-server-key-doors',
      'refs/heads/cursor/restore-frontier-fallback-generic-4e0a',
      'refs/heads/hardware/vast-coding-backup-chain-20260924',
    ]) {
      expect(isGithubCiPushRef(ref), ref).toBe(true);
    }
  });

  it('does not admit non-agent branches', () => {
    for (const ref of [
      'refs/heads/integrate/second-lane-20260921',
      'refs/heads/preserve/laptop-main-20260910',
      'refs/heads/chore/mcp-security-and-webhook',
      'refs/heads/feature/not-an-agent',
    ]) {
      expect(isGithubCiPushRef(ref), ref).toBe(false);
    }
  });
});
