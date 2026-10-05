import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaemonProjectDNA } from '@/lib/daemon/types';

// The in-process Absorb engine is replaced per test: each test decides what
// the scanner returns or throws.
const engineState = vi.hoisted(() => ({
  scan: null as null | ((rootDir: string) => Promise<unknown>),
}));

vi.mock('@holoscript/absorb-service/engine', () => {
  class CodebaseScanner {
    async scan(options: { rootDir: string }) {
      if (!engineState.scan) throw new Error('test did not configure the scanner');
      return engineState.scan(options.rootDir);
    }
  }
  class CodebaseGraph {
    private files: Array<{ path: string }> = [];
    buildFromScanResult(result: { files: Array<{ path: string }> }) {
      this.files = result.files;
    }
    detectCommunities() {
      return new Map<string, string[]>([['c0', this.files.map((f) => f.path)]]);
    }
    getStats() {
      return { totalFiles: this.files.length, totalSymbols: 0 };
    }
    serialize() {
      return JSON.stringify({ files: this.files.map((f) => f.path) });
    }
  }
  return { CodebaseScanner, CodebaseGraph };
});

import {
  countSourceFiles,
  createIsolatedWorkspace,
  isExcludedFromWorkspaceCopy,
  isRunnerArtifact,
  runDaemonJob,
} from './runner';
import { describeJobOutcome } from '@/components/projects/workbenchHonesty';
import type { DaemonJob } from '@/lib/daemon/types';

const DNA: DaemonProjectDNA = {
  kind: 'unknown',
  confidence: 0.5,
  detectedStack: [],
  recommendedProfile: 'quick',
  notes: [],
};

function listFiles(root: string, base = ''): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(path.join(root, base), { withFileTypes: true })) {
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(root, rel));
    else out.push(rel);
  }
  return out.sort();
}

function writeFile(root: string, rel: string, content = 'x'): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content, 'utf-8');
}

describe('daemon runner — copy, absorb, honesty (fail loudly)', () => {
  let project: string;
  let tmpRoot: string;
  let savedTmp: string | undefined;

  beforeEach(() => {
    tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-'));
    project = path.join(tmpRoot, 'project');
    writeFile(project, 'README.md', '# box');
    writeFile(project, 'game/box-01.holo', 'composition "Box" {}');
    writeFile(project, 'decisions/a.md', 'a');
    // Excluded entries (same set the old rsync call excluded).
    writeFile(project, 'node_modules/dep/index.js', 'x');
    writeFile(project, '.git/HEAD', 'ref: refs/heads/main');
    writeFile(project, 'dist/out.js', 'x');
    writeFile(project, '.next/cache.json', '{}');
    writeFile(project, '.env.local', 'SECRET=1');
    writeFile(project, 'certs/server.pem', 'x');
    writeFile(project, 'certs/server.key', 'x');
    // Daemon temp workspaces land under TMPDIR; keep them inside the test dir.
    savedTmp = process.env.TMPDIR;
    process.env.TMPDIR = path.join(tmpRoot, 'tmp');
    fs.mkdirSync(process.env.TMPDIR, { recursive: true });
    engineState.scan = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (savedTmp === undefined) delete process.env.TMPDIR;
    else process.env.TMPDIR = savedTmp;
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('copies with fs.promises.cp and keeps the rsync excludes', async () => {
    const { workDir, cleanup } = await createIsolatedWorkspace(project, 'run_copy_ok');
    const copied = listFiles(workDir);
    expect(copied).toEqual([
      '.daemon-workspace.json',
      'README.md',
      'decisions/a.md',
      'game/box-01.holo',
    ]);
    expect(countSourceFiles(workDir)).toBe(3);
    await cleanup();
    expect(fs.existsSync(workDir)).toBe(false);
    for (const name of [
      'node_modules',
      '.git',
      'dist',
      '.next',
      '.env',
      '.env.local',
      'a.pem',
      'a.key',
    ]) {
      expect(isExcludedFromWorkspaceCopy(name)).toBe(true);
    }
    expect(isExcludedFromWorkspaceCopy('src')).toBe(false);
  });

  it('does not propose files the quality checks wrote as patches', () => {
    expect(isRunnerArtifact('.vitest/json/output.json')).toBe(true);
    expect(isRunnerArtifact('packages/a/.vitest/json/output.json')).toBe(true);
    expect(isRunnerArtifact('.eslintcache')).toBe(true);
    expect(isRunnerArtifact('tsconfig.tsbuildinfo')).toBe(true);
    expect(isRunnerArtifact('coverage/lcov.info')).toBe(true);
    expect(isRunnerArtifact('src/index.ts')).toBe(false);
    expect(isRunnerArtifact('game/box-01.holo')).toBe(false);
  });

  it('(i) a copy failure fails the job with the real error text and leaves no partial copy', async () => {
    vi.spyOn(fs.promises, 'cp').mockRejectedValueOnce(
      Object.assign(new Error("EACCES: permission denied, opendir '/data/workspaces/x/locked'"), {
        code: 'EACCES',
      })
    );
    engineState.scan = async () => {
      throw new Error('scanner must not run after a failed copy');
    };

    const result = await runDaemonJob(project, 'quick', DNA, () => {});

    expect(result.success).toBe(false);
    expect(result.error).toContain(
      "EACCES: permission denied, opendir '/data/workspaces/x/locked'"
    );
    expect(result.summary).toContain('could not create isolated workspace');
    expect(result.summary).toContain('EACCES');
    expect(result.logs.some((l) => l.level === 'error' && l.message.includes('EACCES'))).toBe(true);
    const daemonTmp = path.join(process.env.TMPDIR!, 'holoscript-daemon');
    const leftovers = fs.existsSync(daemonTmp)
      ? fs.readdirSync(daemonTmp).filter((n) => n.startsWith('run_'))
      : [];
    expect(leftovers).toEqual([]);
  });

  it('(i) a missing projectPath fails the job with the real ENOENT', async () => {
    const result = await runDaemonJob(path.join(tmpRoot, 'does-not-exist'), 'quick', DNA, () => {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/ENOENT/);
    expect(result.summary).toMatch(/could not create isolated workspace.*ENOENT/);
  });

  it('(ii) an Absorb engine error fails the job with the engine message', async () => {
    let scannedRoot = '';
    engineState.scan = async (rootDir) => {
      scannedRoot = rootDir;
      throw new Error('tree-sitter grammar failed to load: tree-sitter-typescript');
    };

    const result = await runDaemonJob(project, 'quick', DNA, () => {});

    expect(scannedRoot).toContain(path.join('holoscript-daemon', 'run_'));
    expect(result.success).toBe(false);
    expect(result.error).toBe('tree-sitter grammar failed to load: tree-sitter-typescript');
    expect(result.summary).toBe(
      'Blocked: Absorb failed — tree-sitter grammar failed to load: tree-sitter-typescript'
    );
    expect(
      result.logs.some(
        (l) => l.level === 'error' && l.message.includes('Absorb phase failed: tree-sitter grammar')
      )
    ).toBe(true);
  });

  it('(iii) an empty graph with N files says "Blocked — Absorb empty (N files scanned)" — runner and UI', async () => {
    engineState.scan = async () => ({ files: [], stats: { errors: [] } });

    const result = await runDaemonJob(project, 'quick', DNA, () => {});

    expect(result.success).toBe(false);
    expect(result.absorb?.totalFiles).toBe(0);
    expect(result.absorb?.filesScanned).toBe(3);
    expect(result.summary.startsWith('Blocked — Absorb empty (3 files scanned)')).toBe(true);
    expect(result.summary).not.toMatch(/0 source files/);

    // Same words on the job card, never green, for a failed and a completed job.
    const base: DaemonJob = {
      id: 'dj_empty',
      projectId: 'ws-1',
      profile: 'quick',
      projectDna: DNA,
      status: 'failed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 7,
      statusMessage: result.summary,
      summary: result.summary,
      error: result.error,
      patches: [],
      absorb: {
        leafFirstOrder: [],
        inDegree: {},
        communities: {},
        totalFiles: 0,
        totalSymbols: 0,
        filesScanned: 121,
        durationMs: 5,
        graphJson: '{}',
        hubFiles: [],
      },
    };
    for (const status of ['failed', 'completed'] as const) {
      const view = describeJobOutcome({ ...base, status });
      expect(view.headline).toBe('Blocked — Absorb empty (121 files scanned)');
      expect(view.tone).toBe('blocked');
      expect(view.tone).not.toBe('ready');
    }
  });

  it('an empty copy of a non-empty source is reported as a copy failure, not an import problem', async () => {
    // cp "succeeds" but copies nothing (e.g. a filter or mount bug). The source
    // count is the raw non-ignored count: 3 project files + .env.local + 2 certs.
    vi.spyOn(fs.promises, 'cp').mockResolvedValueOnce(undefined);
    engineState.scan = async () => {
      throw new Error('scanner must not run on an empty copy');
    };

    const result = await runDaemonJob(project, 'quick', DNA, () => {});

    expect(result.success).toBe(false);
    expect(result.summary).toMatch(
      /^Blocked: workspace copy failed — projectPath has 6 source files but the copy has 0/
    );
  });
});
