import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { execFileSync } from 'node:child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { CodebaseScanner } from '../CodebaseScanner';

const tempRoots: string[] = [];

function makeTempRepo(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-batched-scan-'));
  tempRoots.push(root);
  return root;
}

function writeFixture(root: string, relativePath: string, content = 'fixture\n'): void {
  const filePath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf-8');
}

describe('CodebaseScanner module batching', () => {
  afterEach(() => {
    for (const root of tempRoots.splice(0)) {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('plans scans by monorepo module and chunks oversized modules', () => {
    const root = makeTempRepo();
    writeFixture(root, 'packages/core/src/a.txt');
    writeFixture(root, 'packages/core/src/b.txt');
    writeFixture(root, 'services/api/src/c.txt');
    writeFixture(root, 'docs/overview.md');

    const scanner = new CodebaseScanner(undefined, false);
    const plan = scanner.planScan({ rootDir: root, maxFiles: 10 }, 1);

    expect(plan.rootDir).toBe(path.resolve(root));
    expect(plan.totalFiles).toBe(4);
    expect(plan.batchSize).toBe(1);
    expect(plan.batches).toHaveLength(4);
    expect(plan.batches.map((batch) => batch.label)).toEqual(
      expect.arrayContaining(['packages/core (1/2)', 'packages/core (2/2)', 'services/api', 'docs'])
    );
  });

  it('excludes files larger than the scan max size from discovery plans', () => {
    const root = makeTempRepo();
    writeFixture(root, 'src/a.ts', 'export const a = 1;\n');
    writeFixture(root, 'src/b.ts', 'export const b = 2;\n');
    writeFixture(root, 'src/too-large.ts', `${'x'.repeat(128)}\n`);

    const scanner = new CodebaseScanner(undefined, false);
    const plan = scanner.planScan({ rootDir: root, maxFiles: 10, maxFileSize: 64 }, 10);

    expect(plan.totalFiles).toBe(2);
    expect(plan.batches.flatMap((batch) => batch.files).map((file) => path.basename(file))).toEqual(
      ['a.ts', 'b.ts']
    );
  });

  it('uses Git-visible discovery by default without losing new untracked source', () => {
    const root = makeTempRepo();
    execFileSync('git', ['init'], { cwd: root, windowsHide: true });
    writeFixture(root, '.gitignore', 'generated/\n');
    writeFixture(root, 'src/tracked.ts', 'export const tracked = true;\n');
    writeFixture(root, 'src/untracked.ts', 'export const untracked = true;\n');
    writeFixture(root, 'generated/ignored.ts', 'export const ignored = true;\n');
    execFileSync('git', ['add', '.gitignore', 'src/tracked.ts'], {
      cwd: root,
      windowsHide: true,
    });

    const scanner = new CodebaseScanner(undefined, false);
    const visiblePlan = scanner.planScan({ rootDir: root, maxFiles: 10 });
    const trackedPlan = scanner.planScan({ rootDir: root, maxFiles: 10, includeUntracked: false });
    const filesystemPlan = scanner.planScan({
      rootDir: root,
      maxFiles: 10,
      respectGitIgnore: false,
    });

    expect(visiblePlan.selectionMode).toBe('git-visible');
    expect(visiblePlan.batchSize).toBe(100);
    expect(
      visiblePlan.batches.flatMap((batch) => batch.files).map((file) => path.basename(file))
    ).toEqual(['tracked.ts', 'untracked.ts']);
    expect(trackedPlan.selectionMode).toBe('git-tracked');
    expect(
      trackedPlan.batches.flatMap((batch) => batch.files).map((file) => path.basename(file))
    ).toEqual(['tracked.ts']);
    expect(filesystemPlan.selectionMode).toBe('filesystem');
    expect(
      filesystemPlan.batches
        .flatMap((batch) => batch.files)
        .map((file) => path.basename(file))
        .sort()
    ).toEqual(['ignored.ts', 'tracked.ts', 'untracked.ts']);
  });

  it('scans planned batches and merges them into one ScanResult', async () => {
    const root = makeTempRepo();
    writeFixture(root, 'packages/core/src/a.txt', 'import "./b";\n');
    writeFixture(root, 'packages/core/src/b.txt');
    writeFixture(root, 'services/api/src/c.txt');

    const scanner = new CodebaseScanner(undefined, false);
    const plan = scanner.planScan({ rootDir: root, maxFiles: 10 }, 1);
    const started: string[] = [];
    const completed: string[] = [];
    const progress: Array<{ processed: number; total: number; file: string }> = [];

    const result = await scanner.scanInBatches({
      rootDir: root,
      maxFiles: 10,
      scanBatchSize: 1,
      scanPlan: plan,
      onBatchStart: (batch) => started.push(batch.label),
      onBatchComplete: (batch) => completed.push(batch.label),
      onProgress: (processed, total, file) => progress.push({ processed, total, file }),
    });

    expect(result.rootDir).toBe(path.resolve(root));
    expect(result.rootDirs).toEqual([path.resolve(root)]);
    expect(result.stats.totalFiles).toBe(3);
    expect(result.stats.errors).toHaveLength(0);
    expect(result.files.map((file) => file.path).sort()).toEqual([
      'packages/core/src/a.txt',
      'packages/core/src/b.txt',
      'services/api/src/c.txt',
    ]);
    expect(started).toHaveLength(plan.batches.length);
    expect(completed).toHaveLength(plan.batches.length);
    expect(progress[progress.length - 1]).toMatchObject({ processed: 3, total: 3 });
  });

  it('yields to status polling between scan batches', async () => {
    const root = makeTempRepo();
    writeFixture(root, 'src/a.txt');
    writeFixture(root, 'src/b.txt');

    const scanner = new CodebaseScanner(undefined, false);
    const plan = scanner.planScan({ rootDir: root, maxFiles: 10 }, 1);
    let statusPollRan = false;
    const observedAtSecondBatch: boolean[] = [];

    await scanner.scanInBatches({
      rootDir: root,
      scanPlan: plan,
      readFile: async () => 'fixture\n',
      onBatchComplete: (batch) => {
        if (batch.index === 1) setImmediate(() => (statusPollRan = true));
        if (batch.index === 2) observedAtSecondBatch.push(statusPollRan);
      },
    });

    expect(observedAtSecondBatch).toEqual([true]);
  });

  it('parses native HoloScript files through worker-backed scanFiles', async () => {
    const root = makeTempRepo();
    const relativePath = 'src/workered.hsplus';
    const absolutePath = path.join(root, relativePath);
    writeFixture(
      root,
      relativePath,
      'trait WorkerBackedScan {\n  capability_tags: ["absorb", "worker"]\n}\n'
    );

    const scanner = new CodebaseScanner(undefined, true);
    try {
      const result = await scanner.scanFiles(root, [absolutePath]);

      expect(result.stats.errors).toHaveLength(0);
      expect(result.stats.totalFiles).toBe(1);
      expect(result.files[0]?.path).toBe(relativePath);
      expect(result.files[0]?.symbols.some((symbol) => symbol.type === 'trait')).toBe(true);
      expect(result.files[0]?.symbols[0]?.docComment).toContain('absorb, worker');
    } finally {
      await scanner.dispose();
    }
  });
});
