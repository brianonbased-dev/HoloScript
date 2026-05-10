import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  isSafeGitRef,
  isSafeGitRemote,
  resolveWorkspaceGitPath,
  validateRelativeGitPaths,
} from './_shared';

describe('git API shared validation', () => {
  let tempRoot: string;
  let workspaceRoot: string;
  let repoPath: string;
  const originalWorkspacesDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-git-shared-'));
    workspaceRoot = path.join(tempRoot, 'workspaces');
    repoPath = path.join(workspaceRoot, 'project-1', 'repo');
    fs.mkdirSync(path.join(repoPath, '.git'), { recursive: true });
    process.env.HOLOSCRIPT_WORKSPACES_DIR = workspaceRoot;
  });

  afterEach(() => {
    process.env.HOLOSCRIPT_WORKSPACES_DIR = originalWorkspacesDir;
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('accepts git repositories inside the configured workspace root', () => {
    expect(resolveWorkspaceGitPath(repoPath)).toEqual({
      ok: true,
      resolved: path.resolve(repoPath),
    });
  });

  it('rejects sibling paths that only share the workspace root prefix', () => {
    const outside = path.join(tempRoot, 'workspaces-other', 'repo');
    fs.mkdirSync(path.join(outside, '.git'), { recursive: true });

    expect(resolveWorkspaceGitPath(outside)).toEqual(
      expect.objectContaining({
        ok: false,
        status: 403,
      })
    );
  });

  it('rejects unsafe git refs and remotes used by mutating routes', () => {
    expect(isSafeGitRef('studio/external-repo-fix')).toBe(true);
    expect(isSafeGitRef('--upload-pack=sh')).toBe(false);
    expect(isSafeGitRef('feature/../main')).toBe(false);
    expect(isSafeGitRef('feature/@{upstream}')).toBe(false);

    expect(isSafeGitRemote('origin')).toBe(true);
    expect(isSafeGitRemote('--mirror')).toBe(false);
    expect(isSafeGitRemote('https://github.com/owner/repo')).toBe(false);
  });

  it('rejects unsafe file pathspecs before git add or diff', () => {
    expect(validateRelativeGitPaths(['src/index.ts'])).toEqual({ ok: true });
    expect(validateRelativeGitPaths(['-p'])).toEqual(expect.objectContaining({ ok: false }));
    expect(validateRelativeGitPaths(['../secret.txt'])).toEqual(
      expect.objectContaining({ ok: false })
    );
  });
});
