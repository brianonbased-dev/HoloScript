import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
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
});
