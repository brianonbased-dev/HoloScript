/**
 * Git Change Detector
 *
 * Wraps git commands to detect what files changed since a stored commit hash.
 * Used by the incremental absorb pipeline to skip re-parsing unchanged files.
 *
 * @version 1.0.0
 */

import { execSync } from 'child_process';
import { createHash } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

// =============================================================================
// TYPES
// =============================================================================

export interface GitChangeResult {
  /** Current HEAD commit hash */
  headCommit: string;
  /** Files added since the stored commit */
  added: string[];
  /** Files modified since the stored commit */
  modified: string[];
  /** Files deleted since the stored commit */
  deleted: string[];
  /** True if the directory is not a git repository */
  notGitRepo: boolean;
  /** True if the stored commit no longer exists (force push, rebase) */
  storedCommitMissing: boolean;
}

export interface FileContentHash {
  /** Relative file path (forward-slash normalized) */
  filePath: string;
  /** SHA-256 hex digest of file content */
  hash: string;
}

// =============================================================================
// GIT CHANGE DETECTOR
// =============================================================================

export class GitChangeDetector {
  private rootDir: string;

  constructor(rootDir: string) {
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * Check if rootDir is inside a git repository.
   */
  isGitRepo(): boolean {
    try {
      const result = execSync('git rev-parse --is-inside-work-tree', {
        cwd: this.rootDir,
        encoding: 'utf-8',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.trim() === 'true';
    } catch {
      return false;
    }
  }

  /**
   * Get current HEAD commit hash.
   */
  getHeadCommit(): string | null {
    try {
      return execSync('git rev-parse HEAD', {
        cwd: this.rootDir,
        encoding: 'utf-8',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch {
      return null;
    }
  }

  /**
   * Get untracked files (not yet git add-ed) that match supported extensions.
   * Returns forward-slash normalized relative paths.
   */
  getUntrackedFiles(): string[] {
    try {
      const output = execSync('git ls-files --others --exclude-standard', {
        cwd: this.rootDir,
        encoding: 'utf-8',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return output
        .trim()
        .split('\n')
        .filter(line => line.length > 0)
        .map(line => line.replace(/\\/g, '/'));
    } catch {
      return [];
    }
  }

  /**
   * Detect changed files between a stored commit and HEAD.
   *
   * If storedCommit is null or the commit no longer exists,
   * sets storedCommitMissing=true signaling a full scan is needed.
   */
  detectChanges(storedCommit: string | null): GitChangeResult {
    const empty: GitChangeResult = {
      headCommit: '',
      added: [],
      modified: [],
      deleted: [],
      notGitRepo: false,
      storedCommitMissing: false,
    };

    if (!this.isGitRepo()) {
      return { ...empty, notGitRepo: true };
    }

    const headCommit = this.getHeadCommit();
    if (!headCommit) {
      return { ...empty, notGitRepo: true };
    }

    empty.headCommit = headCommit;

    if (!storedCommit) {
      return { ...empty, storedCommitMissing: true };
    }

    // Same commit → zero changes
    if (storedCommit === headCommit) {
      // Still check for untracked files
      const untracked = this.getUntrackedFiles();
      return { ...empty, added: untracked };
    }

    // Verify stored commit exists
    try {
      execSync(`git cat-file -t ${storedCommit}`, {
        cwd: this.rootDir,
        encoding: 'utf-8',
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
    } catch {
      return { ...empty, storedCommitMissing: true };
    }

    // Get diff
    try {
      const output = execSync(
        `git diff --name-status ${storedCommit} ${headCommit}`,
        {
          cwd: this.rootDir,
          encoding: 'utf-8',
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
          maxBuffer: 10 * 1024 * 1024, // 10MB for large repos
        },
      );

      const added: string[] = [];
      const modified: string[] = [];
      const deleted: string[] = [];

      for (const line of output.trim().split('\n')) {
        if (!line) continue;
        const parts = line.split('\t');
        const status = parts[0];
        const filePath = (parts[1] ?? '').replace(/\\/g, '/');

        if (status === 'A') {
          added.push(filePath);
        } else if (status === 'M') {
          modified.push(filePath);
        } else if (status === 'D') {
          deleted.push(filePath);
        } else if (status.startsWith('R')) {
          // Rename: old path deleted, new path added
          deleted.push(filePath);
          const newPath = (parts[2] ?? '').replace(/\\/g, '/');
          if (newPath) added.push(newPath);
        } else if (status === 'C') {
          // Copy: new path added
          const newPath = (parts[2] ?? '').replace(/\\/g, '/');
          if (newPath) added.push(newPath);
        }
      }

      // Also include untracked files as added
      const untracked = this.getUntrackedFiles();
      for (const f of untracked) {
        if (!added.includes(f)) added.push(f);
      }

      return { headCommit, added, modified, deleted, notGitRepo: false, storedCommitMissing: false };
    } catch {
      return { ...empty, storedCommitMissing: true };
    }
  }

  /**
   * Compute SHA-256 content hashes for a list of relative file paths.
   * Returns only files that exist and are readable.
   */
  computeFileHashes(relativePaths: string[]): FileContentHash[] {
    const results: FileContentHash[] = [];
    for (const rel of relativePaths) {
      const absPath = path.join(this.rootDir, rel.replace(/\//g, path.sep));
      try {
        const content = fs.readFileSync(absPath);
        const hash = createHash('sha256').update(content).digest('hex');
        results.push({ filePath: rel, hash });
      } catch {
        // File doesn't exist or not readable — skip
      }
    }
    return results;
  }

  /**
   * Given files that git reports as changed, filter to those whose content
   * actually changed (by comparing stored vs current SHA-256 hashes).
   * Filters out timestamp-only changes.
   */
  filterByContentHash(
    gitChangedFiles: string[],
    storedHashes: Record<string, string>,
  ): { trulyChanged: string[]; unchanged: string[] } {
    const trulyChanged: string[] = [];
    const unchanged: string[] = [];

    const currentHashes = this.computeFileHashes(gitChangedFiles);
    const currentMap = new Map(currentHashes.map(h => [h.filePath, h.hash]));

    for (const file of gitChangedFiles) {
      const stored = storedHashes[file];
      const current = currentMap.get(file);

      if (!current) {
        // File doesn't exist on disk — treat as truly changed
        trulyChanged.push(file);
      } else if (!stored || stored !== current) {
        trulyChanged.push(file);
      } else {
        unchanged.push(file);
      }
    }

    return { trulyChanged, unchanged };
  }
}
