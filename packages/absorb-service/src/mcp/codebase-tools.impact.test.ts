import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { createHash } from 'crypto';
import { afterEach, describe, expect, it } from 'vitest';
import { CodebaseGraph } from '../engine/CodebaseGraph';
import type { ScannedFile } from '../engine/types';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';

const originalCacheDir = process.env.HOLOSCRIPT_CACHE_DIR;
const originalWorkspaceRoot = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
const temporaryRoots: string[] = [];

function makeFile(filePath: string, imports: ScannedFile['imports'] = []): ScannedFile {
  return {
    path: filePath,
    language: 'typescript',
    symbols: [],
    imports,
    calls: [],
    loc: 1,
    sizeBytes: 1,
  };
}

function makeImpactRepo(): { repoDir: string; cacheDir: string } {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-impact-repo-'));
  const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-impact-cache-'));
  temporaryRoots.push(repoDir, cacheDir);
  execFileSync('git', ['init'], { cwd: repoDir, windowsHide: true });
  execFileSync('git', ['config', 'user.email', 'impact@example.test'], {
    cwd: repoDir,
    windowsHide: true,
  });
  execFileSync('git', ['config', 'user.name', 'Impact Test'], {
    cwd: repoDir,
    windowsHide: true,
  });

  const fileHashes: Record<string, string> = {};
  const files = Array.from({ length: 6 }, (_, index) => {
    const filePath = `src/f${index}.ts`;
    const content = `export const f${index} = ${index};\n`;
    fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, filePath), content, 'utf-8');
    fileHashes[filePath] = createHash('sha256').update(content, 'utf-8').digest('hex');
    return makeFile(
      filePath,
      index === 0
        ? []
        : [
            {
              fromFile: filePath,
              toModule: `./f${index - 1}`,
              resolvedPath: `src/f${index - 1}.ts`,
              line: 1,
            },
          ]
    );
  });
  execFileSync('git', ['add', 'src'], { cwd: repoDir, windowsHide: true });
  execFileSync('git', ['commit', '-m', 'impact fixture'], { cwd: repoDir, windowsHide: true });
  const gitCommitHash = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: repoDir,
    encoding: 'utf-8',
    windowsHide: true,
  }).trim();

  const graph = new CodebaseGraph();
  graph.buildFromScanResult({
    rootDir: repoDir,
    files,
    stats: {
      totalFiles: files.length,
      totalSymbols: 0,
      totalImports: files.length - 1,
      totalCalls: 0,
      totalLoc: files.length,
      durationMs: 0,
      errors: [],
      filesByLanguage: { typescript: files.length },
      symbolsByType: {},
    },
  });
  graph.gitCommitHash = gitCommitHash;
  fs.writeFileSync(
    path.join(cacheDir, 'graph-cache.json'),
    JSON.stringify({
      version: 2,
      rootDir: repoDir,
      timestamp: Date.now(),
      stats: graph.getStats(),
      graphJson: graph.serialize(),
      gitCommitHash,
      fileHashes,
      scanPolicy: { includeUntracked: false, maxFiles: 20_000 },
    }),
    'utf-8'
  );

  return { repoDir, cacheDir };
}

afterEach(() => {
  resetCodebaseToolStateForTests();
  if (originalCacheDir === undefined) delete process.env.HOLOSCRIPT_CACHE_DIR;
  else process.env.HOLOSCRIPT_CACHE_DIR = originalCacheDir;
  if (originalWorkspaceRoot === undefined) delete process.env.HOLOSCRIPT_WORKSPACE_ROOT;
  else process.env.HOLOSCRIPT_WORKSPACE_ROOT = originalWorkspaceRoot;
  while (temporaryRoots.length > 0) {
    fs.rmSync(temporaryRoots.pop()!, { recursive: true, force: true });
  }
});

describe('holo_impact_analysis traversal budgets', () => {
  it('returns explicit complete and bounded-partial receipts from an authoritative cache', async () => {
    const { repoDir, cacheDir } = makeImpactRepo();
    process.env.HOLOSCRIPT_CACHE_DIR = cacheDir;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    resetCodebaseToolStateForTests(false);

    const complete = (await handleCodebaseTool('holo_impact_analysis', {
      changedFiles: ['src/f0.ts'],
    })) as Record<string, any>;
    expect(complete).toMatchObject({
      affectedCount: 6,
      groupedAffectedCount: 6,
      affectedCountIsLowerBound: false,
      totalAffectedCount: 6,
      observedCommunityCount: 1,
      complete: true,
      truncated: false,
      truncationReasons: [],
      resolvedChangedFiles: ['src/f0.ts'],
      unresolvedChangedFiles: [],
      // Parser-light file nodes now warm graph context during index hydration,
      // so the authoritative cache already owns a deterministic community map.
      communityGrouping: 'cached',
      communityGroupingComplete: true,
      ungroupedAffectedFiles: 0,
      traversal: {
        complete: true,
        truncationReasons: [],
        changedFileInputsProcessed: 1,
        changedFileInputsRemaining: 0,
        budgets: {
          maxAffectedFiles: 10_000,
          maxDepth: 64,
          deadlineMs: 20_000,
        },
      },
    });

    const partial = (await handleCodebaseTool('holo_impact_analysis', {
      changedFiles: ['src/f0.ts'],
      maxAffectedFiles: 3,
      maxDepth: 64,
      deadlineMs: 1_000,
    })) as Record<string, any>;
    expect(partial).toMatchObject({
      affectedCount: 3,
      groupedAffectedCount: 3,
      affectedCountIsLowerBound: true,
      totalAffectedCount: null,
      observedCommunityCount: 1,
      complete: false,
      truncated: true,
      truncationReasons: ['max_affected_files'],
      traversal: {
        complete: false,
        truncationReasons: ['max_affected_files'],
        budgets: { maxAffectedFiles: 3, maxDepth: 64, deadlineMs: 1_000 },
      },
    });
    expect(partial.blastRadius).toContain('bounded partial result');
    expect(partial.blastRadius).toContain('At least 3 affected files discovered');
    expect(partial.durationMs).toBeLessThan(1_000);

    const missing = (await handleCodebaseTool('holo_impact_analysis', {
      changedFiles: ['src\\f0.ts', 'src/not-indexed.ts'],
    })) as Record<string, any>;
    expect(missing).toMatchObject({
      affectedCount: 6,
      groupedAffectedCount: 6,
      affectedCountIsLowerBound: true,
      totalAffectedCount: null,
      complete: false,
      truncated: true,
      truncationReasons: ['changed_file_not_indexed'],
      resolvedChangedFiles: ['src/f0.ts'],
      unresolvedChangedFiles: ['src/not-indexed.ts'],
      traversal: {
        complete: false,
        truncationReasons: ['changed_file_not_indexed'],
      },
    });

    const tooMany = (await handleCodebaseTool('holo_impact_analysis', {
      changedFiles: Array.from({ length: 1_001 }, (_, index) => `src/f${index}.ts`),
    })) as Record<string, any>;
    expect(tooMany).toMatchObject({
      error: 'changedFiles_limit_exceeded',
      maxChangedFiles: 1_000,
      receivedChangedFiles: 1_001,
    });
  });
});
