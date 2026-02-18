/**
 * HashCalculator
 *
 * Computes SHA-256 content hashes for files and arbitrary values.
 * Used by CacheManager to determine whether source files have changed.
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';

export class HashCalculator {
  /**
   * Hash a string of content. Returns a 64-char hex string.
   */
  hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  /**
   * Hash a file on disk. Returns null if the file cannot be read.
   */
  hashFile(filePath: string): string | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.hashContent(content);
    } catch {
      return null;
    }
  }

  /**
   * Hash multiple files. Missing files are omitted from the result.
   */
  hashFiles(filePaths: string[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const fp of filePaths) {
      const h = this.hashFile(fp);
      if (h !== null) result.set(fp, h);
    }
    return result;
  }

  /**
   * Stable hash of any JSON-serialisable value.
   */
  hashObject(obj: unknown): string {
    return this.hashContent(JSON.stringify(obj));
  }
}
