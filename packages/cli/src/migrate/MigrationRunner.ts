/** Compare two semver strings. Returns -1, 0, or 1. */
function compareSemver(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] < pb[i]) return -1;
    if (pa[i] > pb[i]) return 1;
  }
  return 0;
}

export interface Transform {
  name: string;
  description: string;
  transform(source: string, filePath: string): string;
}

export interface Migration {
  from: string;
  to: string;
  transforms: Transform[];
}

export interface MigrationChange {
  filePath: string;
  originalContent: string;
  migratedContent: string;
  changesCount: number;
  changeDescriptions: string[];
}

export interface MigrationResult {
  migration: Migration;
  changes: MigrationChange[];
  totalFiles: number;
  modifiedFiles: number;
  skippedFiles: number;
}

export class MigrationRunner {
  constructor(private migrations: Migration[]) {}

  findMigrationPath(from: string, to: string): Migration[] {
    const sorted = [...this.migrations].sort((a, b) => compareSemver(a.from, b.from));
    const path: Migration[] = [];
    let current = from;
    while (compareSemver(current, to) < 0) {
      const next = sorted.find((m) => m.from === current && compareSemver(m.to, to) <= 0);
      if (!next) break;
      path.push(next);
      current = next.to;
    }
    return path;
  }

  dryRun(files: Map<string, string>, from: string, to: string): MigrationResult[] {
    const migrationPath = this.findMigrationPath(from, to);
    const results: MigrationResult[] = [];
    let currentFiles = new Map(files);
    for (const migration of migrationPath) {
      const changes: MigrationChange[] = [];
      const nextFiles = new Map<string, string>();
      for (const [filePath, content] of currentFiles) {
        const originalContent = content;
        let migratedContent = content;
        const changeDescriptions: string[] = [];
        for (const transform of migration.transforms) {
          const before = migratedContent;
          migratedContent = transform.transform(migratedContent, filePath);
          if (migratedContent !== before) changeDescriptions.push(transform.description);
        }
        nextFiles.set(filePath, migratedContent);
        if (migratedContent !== originalContent) {
          changes.push({
            filePath,
            originalContent,
            migratedContent,
            changesCount: changeDescriptions.length,
            changeDescriptions,
          });
        }
      }
      results.push({
        migration,
        changes,
        totalFiles: currentFiles.size,
        modifiedFiles: changes.length,
        skippedFiles: currentFiles.size - changes.length,
      });
      currentFiles = nextFiles;
    }
    return results;
  }

  apply(files: Map<string, string>, from: string, to: string): Map<string, string> {
    const migrationPath = this.findMigrationPath(from, to);
    let currentFiles = new Map(files);
    for (const migration of migrationPath) {
      const nextFiles = new Map<string, string>();
      for (const [filePath, content] of currentFiles) {
        let migratedContent = content;
        for (const transform of migration.transforms)
          migratedContent = transform.transform(migratedContent, filePath);
        nextFiles.set(filePath, migratedContent);
      }
      currentFiles = nextFiles;
    }
    return currentFiles;
  }

  formatReport(results: MigrationResult[]): string {
    if (results.length === 0) return 'No migrations to apply.\n';
    const lines: string[] = [];
    for (const result of results) {
      lines.push('Migration: ' + result.migration.from + ' => ' + result.migration.to);
      lines.push(
        '  Files: ' +
          result.totalFiles +
          ' total, ' +
          result.modifiedFiles +
          ' modified, ' +
          result.skippedFiles +
          ' skipped'
      );
      if (result.changes.length === 0) {
        lines.push('  No changes.');
      } else {
        for (const change of result.changes) {
          lines.push('  ' + change.filePath + ': ' + change.changesCount + ' change(s)');
          for (const desc of change.changeDescriptions) lines.push('    - ' + desc);
        }
      }
      lines.push('');
    }
    return lines.join('\n');
  }
}
