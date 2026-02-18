/**
 * DuplicateFinder
 *
 * Detects duplicate and similar file content in a bundle.
 * Two files are considered exact duplicates when their SHA-256 hashes match.
 * Similar files are detected via token-overlap similarity scoring.
 */

import { createHash } from 'crypto';

export interface DuplicateGroup {
  /** Content hash shared by all files in this group */
  hash: string;
  /** File paths with this content */
  paths: string[];
  /** Size per copy in bytes */
  sizePerCopy: number;
  /** Bytes wasted by having extra copies */
  wastedBytes: number;
}

export class DuplicateFinder {
  /**
   * Find files with identical content.
   */
  findExactDuplicates(files: Map<string, string>): DuplicateGroup[] {
    const byHash = new Map<string, { paths: string[]; sizePerCopy: number }>();

    for (const [filePath, content] of files) {
      const sizePerCopy = Buffer.byteLength(content, 'utf8');
      const hash = createHash('sha256').update(content, 'utf8').digest('hex');
      if (!byHash.has(hash)) {
        byHash.set(hash, { paths: [], sizePerCopy });
      }
      byHash.get(hash)!.paths.push(filePath);
    }

    const groups: DuplicateGroup[] = [];
    for (const [hash, info] of byHash) {
      if (info.paths.length > 1) {
        const wastedBytes = info.sizePerCopy * (info.paths.length - 1);
        groups.push({
          hash,
          paths: info.paths.sort(),
          sizePerCopy: info.sizePerCopy,
          wastedBytes,
        });
      }
    }

    // Sort largest wasted bytes first
    return groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
  }

  /**
   * Find files with similar content above a similarity threshold (0-100%).
   * Uses token overlap (Jaccard similarity on word tokens).
   */
  findSimilarFiles(
    files: Map<string, string>,
    thresholdPct = 80,
  ): Array<{ paths: string[]; similarityPct: number }> {
    const threshold = thresholdPct / 100;
    const entries = Array.from(files.entries());
    const results: Array<{ paths: string[]; similarityPct: number }> = [];

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const sim = this.jaccardSimilarity(entries[i][1], entries[j][1]);
        if (sim >= threshold) {
          results.push({
            paths: [entries[i][0], entries[j][0]],
            similarityPct: Math.round(sim * 100),
          });
        }
      }
    }

    return results.sort((a, b) => b.similarityPct - a.similarityPct);
  }

  /**
   * Format a duplicate report as a human-readable string.
   */
  formatReport(duplicates: DuplicateGroup[]): string {
    if (duplicates.length === 0) {
      return 'No exact duplicates found.';
    }

    const lines: string[] = ['Duplicate files:'];
    for (const g of duplicates) {
      const kb = (g.sizePerCopy / 1024).toFixed(1);
      lines.push(`  [${kb} KB each] Wasted: ${this.formatBytes(g.wastedBytes)}`);
      for (const p of g.paths) {
        lines.push(`    - ${p}`);
      }
    }
    return lines.join('\n');
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private jaccardSimilarity(a: string, b: string): number {
    const tokensA = new Set(a.split(/\s+/).filter(Boolean));
    const tokensB = new Set(b.split(/\s+/).filter(Boolean));
    if (tokensA.size === 0 && tokensB.size === 0) return 1;
    if (tokensA.size === 0 || tokensB.size === 0) return 0;

    let intersection = 0;
    for (const t of tokensA) {
      if (tokensB.has(t)) intersection++;
    }
    const union = tokensA.size + tokensB.size - intersection;
    return intersection / union;
  }

  private formatBytes(bytes: number): string {
    if (bytes >= 1_000_000) return `${(bytes / 1_000_000).toFixed(1)} MB`;
    if (bytes >= 1_000) return `${(bytes / 1_000).toFixed(1)} KB`;
    return `${bytes} B`;
  }
}
