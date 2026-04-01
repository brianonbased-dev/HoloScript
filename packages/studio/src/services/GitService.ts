import git from 'isomorphic-git';
import { fs } from 'memfs';
import { logger } from '@/lib/logger';

export interface GitCommitRecord {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
}

export interface GitBlameRecord {
  line: number;
  commitOid: string;
  author: string;
  timestamp: number;
}

/**
 * Service to interface with local .git repositories for Spatial Blame and Version Control.
 */
export class GitService {
  private dir: string;

  constructor(repoPath: string) {
    this.dir = repoPath;
  }

  /**
   * Fetches the commit history for a specific .holo file.
   */
  async getCommitHistory(filepath: string): Promise<GitCommitRecord[]> {
    try {
      const commits = await git.log({
        fs,
        dir: this.dir,
        filepath
      });

      return commits.map((c: any) => ({
        oid: c.oid,
        message: c.commit.message,
        author: {
          name: c.commit.author.name,
          email: c.commit.author.email,
          timestamp: c.commit.author.timestamp
        }
      }));
    } catch (e) {
      logger.warn(`[GitService] Failed to load history for ${filepath}`, e);
      return [];
    }
  }

  /**
   * Retrieves the raw content of a .holo file at a specific commit hash.
   */
  async getFileAtCommit(filepath: string, oid: string): Promise<string | null> {
    try {
      const { blob } = await git.readBlob({
        fs,
        dir: this.dir,
        oid,
        filepath
      });
      return new TextDecoder().decode(blob);
    } catch (e) {
      logger.error(`[GitService] Failed to read ${filepath} at commit ${oid}`, e);
      return null;
    }
  }

  /**
   * Retrieves blame data for a specific HoloNode by finding when its ID was introduced.
   */
  async getBlameForNode(filepath: string, nodeId: string): Promise<GitCommitRecord | null> {
    try {
      const commits = await this.getCommitHistory(filepath);
      if (commits.length === 0) return null;

      let lastFoundCommit: GitCommitRecord | null = null;

      // Search from newest to oldest
      for (const c of commits) {
        const fileContent = await this.getFileAtCommit(filepath, c.oid);
        if (fileContent && fileContent.includes(nodeId)) {
          lastFoundCommit = c; // It existed in this commit
        } else {
          // If it didn't exist in this commit, the last found commit was the one where it was introduced.
          break;
        }
      }

      return lastFoundCommit || commits[0];
    } catch (e) {
      logger.error(`[GitService] Blame failed for node ${nodeId}`, e);
      return null;
    }
  }
}
