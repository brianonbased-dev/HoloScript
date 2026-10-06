import * as crypto from 'crypto';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DaemonProjectDNA } from '@/lib/daemon/types';

// The in-process Absorb engine is replaced per test: each test decides what
// the scanner returns or throws. absorbRootRefusal is the REAL #483 policy.
const engineState = vi.hoisted(() => ({
  scan: null as
    | null
    | ((rootDir: string, options: { maxFiles?: number; signal?: AbortSignal }) => Promise<unknown>),
  lastOptions: null as null | { rootDir: string; maxFiles?: number; signal?: AbortSignal },
}));

vi.mock('@holoscript/absorb-service/engine', async () => {
  const policy = await import('../../../../../../absorb-service/src/engine/absorb-root-policy');
  class CodebaseScanner {
    async scan(options: { rootDir: string; maxFiles?: number; signal?: AbortSignal }) {
      engineState.lastOptions = options;
      if (!engineState.scan) throw new Error('test did not configure the scanner');
      return engineState.scan(options.rootDir, options);
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
  return { CodebaseScanner, CodebaseGraph, absorbRootRefusal: policy.absorbRootRefusal };
});

// Every way to start a process is a spy. With the tools flag off the runner
// must not call any of them.
type ExecFileCb = (err: Error | null, stdout: string, stderr: string) => void;
const proc = vi.hoisted(() => ({
  execFileImpl: null as
    | null
    | ((
        file: string,
        args: string[],
        opts: { cwd: string; env: NodeJS.ProcessEnv },
        cb: ExecFileCb
      ) => void),
}));
vi.mock('child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('child_process')>();
  const execFile = vi.fn(
    (
      file: string,
      args: string[],
      opts: { cwd: string; env: NodeJS.ProcessEnv },
      cb: ExecFileCb
    ) => {
      if (!proc.execFileImpl) throw new Error(`unexpected execFile ${file} ${args.join(' ')}`);
      proc.execFileImpl(file, args, opts, cb);
    }
  );
  const exec = vi.fn(() => {
    throw new Error('unexpected exec');
  });
  const spawn = vi.fn(() => {
    throw new Error('unexpected spawn');
  });
  const fork = vi.fn(() => {
    throw new Error('unexpected fork');
  });
  const mocked = { ...actual, execFile, exec, spawn, fork };
  return { ...mocked, default: mocked };
});

import * as childProcess from 'child_process';
import {
  countSourceFiles,
  createIsolatedWorkspace,
  isExcludedFromWorkspaceCopy,
  isRunnerArtifact,
  repoToolsEnabled,
  runDaemonJob,
  safeWorkDirTarget,
  scrubbedToolEnv,
} from './runner';
import { describeJobOutcome } from '@/components/projects/workbenchHonesty';
import { CHECKS_SKIPPED_LABEL } from '@/lib/daemon/honestyLabels';
import { checkProjectPath } from '@/lib/daemon/projectPathPolicy';
import type { DaemonJob } from '@/lib/daemon/types';

const DNA: DaemonProjectDNA = {
  kind: 'unknown',
  confidence: 0.5,
  detectedStack: [],
  recommendedProfile: 'quick',
  notes: [],
};

const ENV_KEYS = [
  'TMPDIR',
  'HOLOSCRIPT_WORKSPACES_DIR',
  'HOLOHEAL_RUN_REPO_TOOLS',
  'HOLOHEAL_COPY_MAX_FILES',
  'HOLOHEAL_COPY_MAX_BYTES',
  'HOLOHEAL_COPY_TIMEOUT_MS',
  'HOLOHEAL_SCAN_TIMEOUT_MS',
  'HOLOHEAL_SCAN_MAX_FILES',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
  'NEXTAUTH_SECRET',
];

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

/** Hash of every file (path + bytes) and every link target under root. */
function treeHash(root: string): string {
  const h = crypto.createHash('sha256');
  const walk = (dir: string) => {
    for (const e of fs
      .readdirSync(dir, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))) {
      const full = path.join(dir, e.name);
      h.update(path.relative(root, full));
      if (e.isSymbolicLink()) h.update(`->${fs.readlinkSync(full)}`);
      else if (e.isDirectory()) walk(full);
      else h.update(fs.readFileSync(full));
    }
  };
  walk(root);
  return h.digest('hex');
}

const execFileSpy = () => vi.mocked(childProcess.execFile);
const totalSpawns = () =>
  vi.mocked(childProcess.execFile).mock.calls.length +
  vi.mocked(childProcess.exec).mock.calls.length +
  vi.mocked(childProcess.spawn).mock.calls.length +
  vi.mocked(childProcess.fork).mock.calls.length;

const oneFileGraph = async () => ({
  files: [{ path: 'README.md', imports: [] }],
  stats: { errors: [] },
});

describe('daemon runner — copy, absorb, honesty, confinement, no user code', () => {
  let tmpRoot: string;
  let workspacesRoot: string;
  let project: string;
  let outside: string;
  const saved: Record<string, string | undefined> = {};

  beforeEach(() => {
    for (const k of ENV_KEYS) saved[k] = process.env[k];
    tmpRoot = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'runner-test-')));
    workspacesRoot = path.join(tmpRoot, 'workspaces');
    project = path.join(workspacesRoot, 'ws-1', 'project');
    outside = path.join(tmpRoot, 'outside');
    writeFile(outside, 'secret.ts', 'export const SECRET = "outside the root";');
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
    process.env.HOLOSCRIPT_WORKSPACES_DIR = workspacesRoot;
    // Daemon temp workspaces land under TMPDIR; keep them inside the test dir.
    process.env.TMPDIR = path.join(tmpRoot, 'tmp');
    fs.mkdirSync(process.env.TMPDIR, { recursive: true });
    for (const k of ENV_KEYS) if (k.startsWith('HOLOHEAL_')) delete process.env[k];
    engineState.scan = null;
    engineState.lastOptions = null;
    proc.execFileImpl = null;
    vi.mocked(childProcess.execFile).mockClear();
    vi.mocked(childProcess.exec).mockClear();
    vi.mocked(childProcess.spawn).mockClear();
    vi.mocked(childProcess.fork).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    for (const k of ENV_KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(tmpRoot, { recursive: true, force: true });
  });

  it('copies with fs.promises.cp and keeps the rsync excludes', async () => {
    const { workDir, cleanup } = await createIsolatedWorkspace(project, 'run_copy_ok');
    expect(listFiles(workDir)).toEqual([
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
    expect(result.logs.some((l) => l.level === 'error' && l.message.includes('EACCES'))).toBe(true);
    const daemonTmp = path.join(process.env.TMPDIR!, 'holoscript-daemon');
    const leftovers = fs.existsSync(daemonTmp)
      ? fs.readdirSync(daemonTmp).filter((n) => n.startsWith('run_'))
      : [];
    expect(leftovers).toEqual([]);
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
    expect(result.summary).toContain('handed 3 file(s) (the workspace copy), reported 0 errors');
    expect(result.summary).not.toMatch(/0 source files/);

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
    }
  });

  it('an empty graph WITH scanner errors is a failed Absorb that shows the errors, not "Absorb empty"', async () => {
    engineState.scan = async () => ({
      files: [],
      stats: { errors: ['game/box-01.holo: parser unavailable', 'README.md: EACCES'] },
    });
    const result = await runDaemonJob(project, 'quick', DNA, () => {});
    expect(result.success).toBe(false);
    expect(result.summary).toMatch(
      /^Blocked: Absorb failed — the scanner reported 2 error\(s\) and built no graph: game\/box-01\.holo: parser unavailable \| README\.md: EACCES/
    );
    expect(result.summary).not.toContain('Absorb empty');
  });

  it('an empty copy of a non-empty source is reported as a copy failure, not an import problem', async () => {
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

  // ---------------------------------------------------------------- B2
  it('B2: an escaping symlink inside the project is neither followed nor copied, and is logged', async () => {
    fs.symlinkSync(path.join(outside, 'secret.ts'), path.join(project, 'link.ts'));
    fs.symlinkSync(outside, path.join(project, 'linkdir'));
    fs.symlinkSync('../../../outside/secret.ts', path.join(project, 'game', 'rel-link.ts'));

    const ws = await createIsolatedWorkspace(project, 'run_symlinks');
    const copied = listFiles(ws.workDir);
    expect(copied).not.toContain('link.ts');
    expect(copied).not.toContain('game/rel-link.ts');
    expect(copied.some((f) => f.startsWith('linkdir'))).toBe(false);
    for (const f of copied) {
      expect(fs.lstatSync(path.join(ws.workDir, f)).isSymbolicLink()).toBe(false);
      expect(fs.readFileSync(path.join(ws.workDir, f), 'utf-8')).not.toContain('outside the root');
    }
    expect(ws.skippedSymlinks.sort()).toEqual(
      [
        `link.ts -> ${path.join(outside, 'secret.ts')}`,
        `linkdir -> ${outside}`,
        `${path.join('game', 'rel-link.ts')} -> ../../../outside/secret.ts`,
      ].sort()
    );
    await ws.cleanup();

    engineState.scan = oneFileGraph;
    const result = await runDaemonJob(project, 'quick', DNA, () => {});
    expect(
      result.logs.some((l) => l.level === 'warn' && /Skipped 3 symlink\(s\)/.test(l.message))
    ).toBe(true);
  });

  it('B2: a missing / empty projectPath fails the job — no process.cwd() fallback', async () => {
    // Even when the server's cwd is a valid workspace, nothing falls back to it.
    vi.spyOn(process, 'cwd').mockReturnValue(project);
    const cpSpy = vi.spyOn(fs.promises, 'cp');
    engineState.scan = oneFileGraph;
    for (const missing of ['', '   ', undefined as unknown as string]) {
      const result = await runDaemonJob(missing, 'quick', DNA, () => {});
      expect(result.success).toBe(false);
      expect(result.summary).toMatch(/^Blocked: projectPath refused — no projectPath/);
      expect(result.error).toMatch(/no fallback to the server directory/);
    }
    expect(cpSpy).not.toHaveBeenCalled();
    expect(engineState.lastOptions).toBeNull();
  });

  it('B2: ".." traversal, sibling-prefix roots, the root itself and relative paths are refused', async () => {
    fs.mkdirSync(path.join(tmpRoot, 'etc'), { recursive: true });
    writeFile(path.join(tmpRoot, 'etc'), 'passwd', 'root:x:0:0');
    fs.mkdirSync(`${workspacesRoot}2/ws-evil`, { recursive: true });
    writeFile(`${workspacesRoot}2/ws-evil`, 'a.md', 'a');
    const cases: Array<[string, RegExp]> = [
      [`${workspacesRoot}/ws-1/../../etc`, /outside the workspaces root/],
      [`${workspacesRoot}2/ws-evil`, /outside the workspaces root/],
      [workspacesRoot, /outside the workspaces root/],
      ['ws-1/project', /must be an absolute path/],
    ];
    const cpSpy = vi.spyOn(fs.promises, 'cp');
    engineState.scan = oneFileGraph;
    for (const [p, why] of cases) {
      expect(checkProjectPath(p).ok).toBe(false);
      const result = await runDaemonJob(p, 'quick', DNA, () => {});
      expect(result.success).toBe(false);
      expect(result.summary).toMatch(/^Blocked: projectPath refused — /);
      expect(result.summary).toMatch(why);
      await expect(createIsolatedWorkspace(p, 'run_direct')).rejects.toThrow(/projectPath refused/);
    }
    expect(cpSpy).not.toHaveBeenCalled();
    // A symlinked workspace pointing outside the root is refused after realpath.
    fs.symlinkSync(outside, path.join(workspacesRoot, 'ws-link'));
    expect(checkProjectPath(path.join(workspacesRoot, 'ws-link'))).toMatchObject({ ok: false });
    // A normal workspace is allowed.
    expect(checkProjectPath(project)).toMatchObject({ ok: true, realPath: project });
  });

  // ---------------------------------------------------------------- B1
  it('B1: with HOLOHEAL_RUN_REPO_TOOLS unset, no process is started and the job stops after Absorb + patch proposal', async () => {
    writeFile(project, 'package.json', '{"scripts":{"test":"node -e \\"process.exit(1)\\""}}');
    writeFile(project, 'tsconfig.json', '{}');
    writeFile(project, 'src/a.ts', 'export const f = (x) => x;\n');
    engineState.scan = oneFileGraph;

    const result = await runDaemonJob(project, 'quick', DNA, () => {});

    expect(totalSpawns()).toBe(0);
    expect(result.success).toBe(true);
    expect(result.checksSkipped).toBe(true);
    expect(result.patches).toEqual([]);
    expect(result.summary.startsWith(`${CHECKS_SKIPPED_LABEL}.`)).toBe(true);
    expect(result.logs.some((l) => /Repo checks skipped/.test(l.message))).toBe(true);
    expect(result.logs.some((l) => /baseline quality/i.test(l.message))).toBe(false);

    // Only the exact strings "true" and "1" turn tools on.
    for (const v of [undefined, '', 'yes', 'TRUE', 'on', '0', 'false', ' true']) {
      expect(repoToolsEnabled({ HOLOHEAL_RUN_REPO_TOOLS: v } as NodeJS.ProcessEnv)).toBe(false);
    }
    expect(repoToolsEnabled({ HOLOHEAL_RUN_REPO_TOOLS: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(repoToolsEnabled({ HOLOHEAL_RUN_REPO_TOOLS: '1' } as NodeJS.ProcessEnv)).toBe(true);
  });

  it('B1: the UI says "Absorb done, checks skipped (sandbox not enabled)" — grey, never green', async () => {
    engineState.scan = oneFileGraph;
    const result = await runDaemonJob(project, 'quick', DNA, () => {});
    const job: DaemonJob = {
      id: 'dj_skip',
      projectId: 'ws-1',
      profile: 'quick',
      projectDna: DNA,
      status: 'completed',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      progress: 100,
      statusMessage: CHECKS_SKIPPED_LABEL,
      summary: result.summary,
      patches: [],
      checksSkipped: result.checksSkipped,
      metrics: {
        qualityDelta: 0,
        qualityBefore: 0,
        qualityAfter: 0,
        filesChanged: 0,
        filesAnalyzed: 0,
        cycles: 0,
        durationMs: 1,
      },
      absorb: {
        leafFirstOrder: ['README.md'],
        inDegree: { 'README.md': 0 },
        communities: { 'README.md': 0 },
        totalFiles: 119,
        totalSymbols: 168,
        filesScanned: 121,
        durationMs: 5,
        graphJson: '{}',
        hubFiles: [],
      },
    };
    const view = describeJobOutcome(job);
    expect(view.headline).toBe('Absorb done, checks skipped (sandbox not enabled)');
    expect(view.tone).toBe('degraded');
    expect(view.tone).not.toBe('ready');
    expect(view.honesty).toContain('Not a heal');
  });

  it('B1: with tools ON, every tool runs as `npx --no-install` with a scrubbed env (no Studio secrets)', async () => {
    process.env.HOLOHEAL_RUN_REPO_TOOLS = 'true';
    process.env.ANTHROPIC_API_KEY = 'sk-test-must-not-leak';
    process.env.DATABASE_URL = 'postgres://must-not-leak';
    process.env.NEXTAUTH_SECRET = 'must-not-leak';
    engineState.scan = oneFileGraph;
    proc.execFileImpl = (_file, _args, _opts, cb) => cb(null, 'Found 0 errors', '');

    await runDaemonJob(project, 'quick', DNA, () => {});

    const calls = execFileSpy().mock.calls;
    expect(calls.length).toBeGreaterThan(0);
    for (const [file, args, opts] of calls as unknown as Array<
      [string, string[], { env: NodeJS.ProcessEnv; cwd: string }]
    >) {
      expect(file).toBe('npx');
      expect(args[0]).toBe('--no-install');
      expect(opts.cwd).toContain(path.join('holoscript-daemon', 'run_'));
      expect(Object.keys(opts.env).sort()).toEqual(Object.keys(scrubbedToolEnv('/w')).sort());
      expect(JSON.stringify(opts.env)).not.toContain('must-not-leak');
    }
    expect(vi.mocked(childProcess.exec)).not.toHaveBeenCalled();
  });

  it('B1: fixes are written only inside workDir — never projectPath, never through ../ or absolute tsc paths', async () => {
    process.env.HOLOHEAL_RUN_REPO_TOOLS = '1';
    writeFile(project, 'src/a.ts', 'export const f = (x) => x;\n');
    writeFile(outside, 'victim.ts', 'export const g = (y) => y;\n');
    const victim = path.join(outside, 'victim.ts');
    const projectBefore = treeHash(project);
    const victimBefore = fs.readFileSync(victim, 'utf-8');
    engineState.scan = oneFileGraph;
    proc.execFileImpl = (_file, args, opts, cb) => {
      if (args[1] === 'tsc') {
        const rel = path.relative(opts.cwd, victim);
        cb(
          Object.assign(new Error('tsc exit 2'), { code: 2 }),
          [
            "src/a.ts(1,18): error TS7006: Parameter 'x' implicitly has an 'any' type.",
            `${rel}(1,18): error TS7006: Parameter 'y' implicitly has an 'any' type.`,
            `${victim}(1,18): error TS7006: Parameter 'y' implicitly has an 'any' type.`,
          ].join('\n'),
          ''
        );
      } else {
        cb(null, '', '');
      }
    };

    const result = await runDaemonJob(project, 'quick', DNA, () => {});

    // The fix happened — in the copy — and came back as a proposal.
    expect(result.patches.map((p) => `${p.action} ${p.filePath}`)).toEqual(['modify src/a.ts']);
    expect(result.patches[0].proposedContent).toContain('(x: any) => x');
    // Nothing outside workDir changed.
    expect(treeHash(project)).toBe(projectBefore);
    expect(fs.readFileSync(victim, 'utf-8')).toBe(victimBefore);
    expect(
      result.logs.filter((l) => /Refused fix target outside the workspace copy/.test(l.message))
    ).toHaveLength(2);

    // Unit level: the write-target guard.
    const wd = path.join(tmpRoot, 'tmp', 'wd');
    writeFile(wd, 'ok.ts', 'x');
    fs.symlinkSync(victim, path.join(wd, 'link.ts'));
    expect(safeWorkDirTarget(wd, 'ok.ts')).toBe(path.join(fs.realpathSync(wd), 'ok.ts'));
    expect(safeWorkDirTarget(wd, '../outside/victim.ts')).toBeNull();
    expect(safeWorkDirTarget(wd, victim)).toBeNull();
    expect(safeWorkDirTarget(wd, 'link.ts')).toBeNull();
    expect(safeWorkDirTarget(wd, 'missing.ts')).toBeNull();
  });

  it('a job with tools off leaves projectPath byte-identical', async () => {
    writeFile(project, 'src/a.ts', 'export const f = (x) => x;\n');
    const before = treeHash(project);
    engineState.scan = oneFileGraph;
    await runDaemonJob(project, 'quick', DNA, () => {});
    expect(treeHash(project)).toBe(before);
  });

  // ---------------------------------------------------------------- caps
  it('caps: more files than HOLOHEAL_COPY_MAX_FILES fails the job honestly and cleans up', async () => {
    process.env.HOLOHEAL_COPY_MAX_FILES = '2';
    engineState.scan = oneFileGraph;
    const result = await runDaemonJob(project, 'quick', DNA, () => {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/project has more than 2 files \(cap HOLOHEAL_COPY_MAX_FILES\)/);
    const daemonTmp = path.join(process.env.TMPDIR!, 'holoscript-daemon');
    expect(fs.readdirSync(daemonTmp).filter((n) => n.startsWith('run_'))).toEqual([]);
  });

  it('caps: more bytes than HOLOHEAL_COPY_MAX_BYTES fails the job honestly', async () => {
    process.env.HOLOHEAL_COPY_MAX_BYTES = '10';
    engineState.scan = oneFileGraph;
    const result = await runDaemonJob(project, 'quick', DNA, () => {});
    expect(result.success).toBe(false);
    expect(result.error).toMatch(/larger than 10 bytes \(cap HOLOHEAL_COPY_MAX_BYTES\)/);
  });

  it('caps: a copy past HOLOHEAL_COPY_TIMEOUT_MS fails honestly', async () => {
    process.env.HOLOHEAL_COPY_TIMEOUT_MS = '5000';
    let t = 1_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => (t += 10_000));
    await expect(createIsolatedWorkspace(project, 'run_slow')).rejects.toThrow(
      /copy took longer than 5 s \(cap HOLOHEAL_COPY_TIMEOUT_MS\)/
    );
  });

  it('caps: the scan gets maxFiles + an abort signal, and a timeout fails the job honestly', async () => {
    engineState.scan = oneFileGraph;
    await runDaemonJob(project, 'quick', DNA, () => {});
    expect(engineState.lastOptions?.maxFiles).toBe(10_000);
    expect(engineState.lastOptions?.signal).toBeInstanceOf(AbortSignal);

    process.env.HOLOHEAL_SCAN_TIMEOUT_MS = '20';
    engineState.scan = async (_root, options) => {
      await new Promise((r) => setTimeout(r, 60));
      if (options.signal?.aborted) throw options.signal.reason;
      return oneFileGraph();
    };
    const result = await runDaemonJob(project, 'quick', DNA, () => {});
    expect(result.success).toBe(false);
    expect(result.summary).toBe(
      'Blocked: Absorb failed — scan timed out after 20 ms (cap HOLOHEAL_SCAN_TIMEOUT_MS)'
    );
  });

  it('caps: more files in the copy than HOLOHEAL_SCAN_MAX_FILES is refused, not partially scanned', async () => {
    process.env.HOLOHEAL_SCAN_MAX_FILES = '2';
    engineState.scan = oneFileGraph;
    const result = await runDaemonJob(project, 'quick', DNA, () => {});
    expect(result.success).toBe(false);
    expect(result.summary).toMatch(
      /^Blocked: project too large to scan — more than 2 files in the copy \(cap HOLOHEAL_SCAN_MAX_FILES\)/
    );
    expect(engineState.lastOptions).toBeNull();
  });

  it('the engine is never pointed outside the daemon temp root (#483 absorbRootRefusal)', async () => {
    const engine = await import('@holoscript/absorb-service/engine');
    const daemonRoot = path.join(process.env.TMPDIR!, 'holoscript-daemon');
    expect(
      engine.absorbRootRefusal(path.join(daemonRoot, 'run_x'), { ABSORB_ALLOWED_ROOTS: daemonRoot })
    ).toBeNull();
    expect(engine.absorbRootRefusal(project, { ABSORB_ALLOWED_ROOTS: daemonRoot })).not.toBeNull();
  });
});
