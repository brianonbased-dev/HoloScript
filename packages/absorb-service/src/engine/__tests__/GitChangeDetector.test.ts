/**
 * Tests for GitChangeDetector
 *
 * Verifies git change detection for incremental absorb pipeline.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { GitChangeDetector } from '../GitChangeDetector';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { execFileSync } from 'child_process';

describe('GitChangeDetector', () => {
  let detector: GitChangeDetector;
  let repoRoot: string;

  beforeAll(() => {
    repoRoot = path.join(os.tmpdir(), `holoscript-git-detector-${Date.now()}`);
    fs.mkdirSync(repoRoot, { recursive: true });
    fs.writeFileSync(path.join(repoRoot, 'package.json'), '{"name":"fixture"}\n');
    fs.writeFileSync(path.join(repoRoot, 'README.md'), '# Fixture\n');

    execFileSync('git', ['init'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync('git', ['add', 'package.json', 'README.md'], { cwd: repoRoot, stdio: 'ignore' });
    execFileSync(
      'git',
      [
        '-c',
        'user.email=holoscript-tests@example.invalid',
        '-c',
        'user.name=HoloScript Tests',
        'commit',
        '-m',
        'initial fixture',
      ],
      { cwd: repoRoot, stdio: 'ignore' }
    );

    detector = new GitChangeDetector(repoRoot);
  });

  afterAll(() => {
    fs.rmSync(repoRoot, { recursive: true, force: true });
  });

  describe('isGitRepo', () => {
    it('returns true for a git repo fixture', () => {
      expect(detector.isGitRepo()).toBe(true);
    }, 15_000);

    it('returns false for non-git directory', () => {
      const tempDir = path.join(os.tmpdir(), `holoscript-test-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const nonGitDetector = new GitChangeDetector(tempDir);
      expect(nonGitDetector.isGitRepo()).toBe(false);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }, 15_000);
  });

  describe('getHeadCommit', () => {
    it('returns 40-character hex string', () => {
      const headCommit = detector.getHeadCommit();
      expect(headCommit).toBeTruthy();
      expect(headCommit).toMatch(/^[0-9a-f]{40}$/);
    }, 15_000);
  });

  describe('detectChanges', () => {
    it('returns storedCommitMissing=true when storedCommit is null', () => {
      const result = detector.detectChanges(null);
      expect(result.storedCommitMissing).toBe(true);
      expect(result.notGitRepo).toBe(false);
    }, 15_000);

    it('returns no committed changes when comparing HEAD to itself', () => {
      const headCommit = detector.getHeadCommit()!;
      const result = detector.detectChanges(headCommit);
      expect(result.headCommit).toBe(headCommit);
      // modified + deleted should be 0 (no committed diff)
      // added may include untracked files in a dirty working tree
      expect(result.modified.length).toBe(0);
      expect(result.deleted.length).toBe(0);
      expect(result.storedCommitMissing).toBe(false);
    }, 15_000);

    it('returns storedCommitMissing=true for non-existent commit', () => {
      const fakeCommit = '0000000000000000000000000000000000000000';
      const result = detector.detectChanges(fakeCommit);
      expect(result.storedCommitMissing).toBe(true);
    }, 15_000);

    it('returns notGitRepo=true for non-git directory', () => {
      const tempDir = path.join(os.tmpdir(), `holoscript-test-${Date.now()}`);
      fs.mkdirSync(tempDir, { recursive: true });
      const nonGitDetector = new GitChangeDetector(tempDir);
      const result = nonGitDetector.detectChanges(null);
      expect(result.notGitRepo).toBe(true);
      fs.rmSync(tempDir, { recursive: true, force: true });
    }, 15_000);
  });

  describe('computeFileHashes', () => {
    it('returns correct SHA-256 hashes for known files', () => {
      const files = ['package.json', 'README.md'];
      const hashes = detector.computeFileHashes(files);

      expect(hashes.length).toBeGreaterThan(0);
      for (const h of hashes) {
        expect(h.filePath).toMatch(/package\.json|README\.md/);
        expect(h.hash).toMatch(/^[0-9a-f]{64}$/); // SHA-256 is 64 hex chars
      }
    });

    it('skips non-existent files', () => {
      const files = ['__does_not_exist__.txt'];
      const hashes = detector.computeFileHashes(files);
      expect(hashes.length).toBe(0);
    });
  });

  describe('filterByContentHash', () => {
    it('correctly identifies unchanged files', () => {
      const files = ['package.json'];
      const currentHashes = detector.computeFileHashes(files);
      const storedHashes: Record<string, string> = {};
      for (const h of currentHashes) {
        storedHashes[h.filePath] = h.hash;
      }

      const result = detector.filterByContentHash(files, storedHashes);

      expect(result.trulyChanged.length).toBe(0);
      expect(result.unchanged).toEqual(files);
    });

    it('identifies truly changed files', () => {
      const files = ['package.json'];
      const storedHashes: Record<string, string> = {
        'package.json': 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      };

      const result = detector.filterByContentHash(files, storedHashes);

      expect(result.trulyChanged).toEqual(files);
      expect(result.unchanged.length).toBe(0);
    });

    it('treats non-existent files as truly changed', () => {
      const files = ['__does_not_exist__.txt'];
      const storedHashes: Record<string, string> = {};

      const result = detector.filterByContentHash(files, storedHashes);

      expect(result.trulyChanged).toEqual(files);
    });
  });

  describe('getUntrackedFiles', () => {
    it('returns array (may be empty)', () => {
      const untracked = detector.getUntrackedFiles();
      expect(Array.isArray(untracked)).toBe(true);
    }, 15_000);

    it('returns forward-slash normalized paths', () => {
      const untracked = detector.getUntrackedFiles();
      for (const f of untracked) {
        expect(f).not.toMatch(/\\/); // No backslashes
      }
    }, 15_000);
  });
});
