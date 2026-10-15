/**
 * UNMOCKED: real git in a scratch repo under the OS temp dir. Checks that the
 * full-ref resolution behind evaluatePush sees through git's own aliasing.
 */
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { evaluatePush, resolveTargetRef, unsafeBranchInput } from '../shipPolicy';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function decide(cwd: string, branch: string, defaultBranch = 'main') {
  if (unsafeBranchInput(branch)) return { ok: false as const };
  return evaluatePush({
    directShip: false,
    branch,
    defaultBranch,
    targetRef: resolveTargetRef(cwd, branch),
  });
}

describe('ship policy against a real git repo', () => {
  let repo: string;

  beforeEach(() => {
    repo = fs.mkdtempSync(path.join(os.tmpdir(), 'shippolicy-realgit-'));
    git(repo, ['init', '-q', '-b', 'main']);
    git(repo, ['config', 'user.email', 't@example.test']);
    git(repo, ['config', 'user.name', 'T']);
    fs.writeFileSync(path.join(repo, 'a.txt'), 'a\n');
    git(repo, ['add', 'a.txt']);
    git(repo, ['commit', '-q', '-m', 'init']);
  });

  afterEach(() => {
    fs.rmSync(repo, { recursive: true, force: true });
  });

  it('records the git version used', () => {
    expect(git(repo, ['--version'])).toMatch(/^git version /);
  });

  it('resolves a plain branch to its full ref (no stray option line)', () => {
    expect(resolveTargetRef(repo, 'main')).toBe('refs/heads/main');
  });

  it('refuses a symref alias that points at main', () => {
    git(repo, ['symbolic-ref', 'refs/heads/alias', 'refs/heads/main']);
    expect(resolveTargetRef(repo, 'alias')).toBe('refs/heads/main');
    expect(decide(repo, 'alias').ok).toBe(false);
  });

  it('a tag named main does not hide the branch: main still resolves to refs/heads/main and is refused; a tag-only name is refused', () => {
    // Documented behavior (observed on real git): with a branch AND a tag both
    // named "main", rev-parse --symbolic-full-name warns that the name is ambiguous
    // and resolves it to refs/heads/main, the default branch, so it is refused.
    // A name that exists only as a tag resolves to refs/tags/<name>, which is
    // outside refs/heads/, so it is refused too and never treated as a branch.
    git(repo, ['-c', 'tag.gpgSign=false', 'tag', '-a', '-m', 'release', 'main']);
    expect(resolveTargetRef(repo, 'main')).toBe('refs/heads/main');
    expect(decide(repo, 'main').ok).toBe(false);
    // A tag-only name (no branch) is refused the same way.
    git(repo, ['-c', 'tag.gpgSign=false', 'tag', '-a', '-m', 'release', 'v1']);
    expect(resolveTargetRef(repo, 'v1')).toBe('refs/tags/v1');
    expect(decide(repo, 'v1').ok).toBe(false);
  });

  it('refuses the default branch when it is only a packed ref', () => {
    git(repo, ['branch', '-m', 'main', 'trunk']);
    git(repo, ['symbolic-ref', 'refs/heads/alias', 'refs/heads/trunk']);
    git(repo, ['pack-refs', '--all']);
    expect(fs.existsSync(path.join(repo, '.git', 'refs', 'heads', 'trunk'))).toBe(false);
    expect(resolveTargetRef(repo, 'trunk')).toBe('refs/heads/trunk');
    expect(decide(repo, 'trunk', 'trunk').ok).toBe(false);
    expect(decide(repo, 'alias', 'trunk').ok).toBe(false);
  });

  it("refuses 'head' and 'Head' (case-insensitive filesystems)", () => {
    expect(decide(repo, 'head').ok).toBe(false);
    expect(decide(repo, 'Head').ok).toBe(false);
    expect(decide(repo, 'HEAD').ok).toBe(false);
  });

  it('allows a real feature branch', () => {
    git(repo, ['branch', 'studio/fix']);
    expect(resolveTargetRef(repo, 'studio/fix')).toBe('refs/heads/studio/fix');
    expect(decide(repo, 'studio/fix').ok).toBe(true);
  });
});
