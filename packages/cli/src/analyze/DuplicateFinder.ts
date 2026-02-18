import { createHash } from 'crypto';

export interface DuplicateGroup {
  hash: string;
  size: number;
  files: string[];
  preview: string;
}

export class DuplicateFinder {
  analyze(files: Map<string, string>, minSize = 64): DuplicateGroup[] {
    const byHash = new Map<string, { files: string[]; size: number; preview: string }>();

    for (const [filePath, content] of files) {
      const size = Buffer.byteLength(content, 'utf8');
      if (size < minSize) continue;
      const hash = createHash('sha256').update(content, 'utf8').digest('hex');
      if (!byHash.has(hash)) {
        byHash.set(hash, { files: [], size, preview: content.slice(0, 120) });
      }
      byHash.get(hash)!.files.push(filePath);
    }

    const groups: DuplicateGroup[] = [];
    for (const [hash, info] of byHash) {
      if (info.files.length > 1) {
        groups.push({ hash, size: info.size, files: info.files.sort(), preview: info.preview });
      }
    }
    return groups.sort((a, b) => b.size * (b.files.length - 1) - a.size * (a.files.length - 1));
  }

  wastedBytes(groups: DuplicateGroup[]): number {
    return groups.reduce((sum, g) => sum + g.size * (g.files.length - 1), 0);
  }
}
