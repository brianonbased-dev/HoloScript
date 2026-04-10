import { createHash } from 'crypto';
import { readFileSync } from 'fs';

export class HashCalculator {
  hashContent(content: string): string {
    return createHash('sha256').update(content, 'utf8').digest('hex');
  }

  hashFile(filePath: string): string | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      return this.hashContent(content);
    } catch {
      return null;
    }
  }

  hashFiles(filePaths: string[]): Map<string, string> {
    const result = new Map<string, string>();
    for (const fp of filePaths) {
      const h = this.hashFile(fp);
      if (h !== null) result.set(fp, h);
    }
    return result;
  }

  hashObject(obj: unknown): string {
    return this.hashContent(JSON.stringify(obj));
  }
}
