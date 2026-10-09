import { describe, expect, it } from 'vitest';
import { GIT_HARDENING_ARGS, hardenedGitArgs, runGitSync } from '../safeGit';

describe('lib/git/safeGit', () => {
  it('pins fsmonitor, hooksPath and protocol.ext before the subcommand', () => {
    expect(GIT_HARDENING_ARGS).toEqual([
      '-c',
      'core.fsmonitor=false',
      '-c',
      'core.hooksPath=/dev/null',
      '-c',
      'protocol.ext.allow=never',
    ]);
    expect(hardenedGitArgs(['status', '--porcelain'])).toEqual([
      ...GIT_HARDENING_ARGS,
      'status',
      '--porcelain',
    ]);
  });

  it('actually disables fsmonitor at runtime (real git config read)', () => {
    expect(runGitSync(['config', '--get', 'core.fsmonitor']).trim()).toBe('false');
  });
});
