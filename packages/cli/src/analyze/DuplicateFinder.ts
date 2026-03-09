import { createHash } from 'crypto';

export interface DuplicateGroup {
  hash: string;
  paths: string[];
  sizePerCopy: number;
  wastedBytes: number;
}

export interface SimilarGroup {
  paths: string[];
  similarity: number;
}

export class DuplicateFinder {
  findExactDuplicates(files: Map<string, string>, minSize = 1): DuplicateGroup[] {
    const byHash = new Map<string, { paths: string[]; size: number }>();

    for (const [filePath, content] of files) {
      const size = Buffer.byteLength(content, 'utf8');
      if (size < minSize) continue;
      const hash = createHash('sha256').update(content, 'utf8').digest('hex');
      if (!byHash.has(hash)) {
        byHash.set(hash, { paths: [], size });
      }
      byHash.get(hash)!.paths.push(filePath);
    }

    const groups: DuplicateGroup[] = [];
    for (const [hash, info] of byHash) {
      if (info.paths.length > 1) {
        const sizePerCopy = info.size;
        const wastedBytes = sizePerCopy * (info.paths.length - 1);
        groups.push({ hash, paths: info.paths.sort(), sizePerCopy, wastedBytes });
      }
    }
    return groups.sort((a, b) => b.wastedBytes - a.wastedBytes);
  }

  findSimilarFiles(files: Map<string, string>, threshold = 80): SimilarGroup[] {
    const entries = [...files.entries()];
    const groups: SimilarGroup[] = [];
    const paired = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [pathA, contentA] = entries[i]!;
        const [pathB, contentB] = entries[j]!;
        const key = `${pathA}|${pathB}`;
        if (paired.has(key)) continue;

        const similarity = this.lineSimilarity(contentA, contentB);
        if (similarity >= threshold) {
          paired.add(key);
          groups.push({ paths: [pathA, pathB].sort(), similarity });
        }
      }
    }
    return groups.sort((a, b) => b.similarity - a.similarity);
  }

  formatReport(groups: DuplicateGroup[]): string {
    if (groups.length === 0) return 'No exact duplicates found.';
    const lines: string[] = [`Found ${groups.length} duplicate group(s):`];
    for (const g of groups) {
      lines.push(`  Files: ${g.paths.join(', ')}`);
      lines.push(
        `  Wasted: ${g.wastedBytes} bytes (${g.sizePerCopy} bytes × ${g.paths.length - 1} extra)`
      );
    }
    return lines.join('\n');
  }

  private lineSimilarity(a: string, b: string): number {
    if (a === b) return 100;
    const linesA = a.split('\n').filter((l) => l.trim());
    const linesB = new Set(b.split('\n').filter((l) => l.trim()));
    let common = 0;
    for (const line of linesA) {
      if (linesB.has(line)) common++;
    }
    const total = Math.max(linesA.length, linesB.size);
    return total === 0 ? 100 : Math.round((common / total) * 100);
  }
}
