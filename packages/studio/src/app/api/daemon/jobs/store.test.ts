import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

function runGit(cwd: string, args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function baseJob(workspacePath: string, patch: Record<string, unknown>): Record<string, unknown> {
  const now = new Date().toISOString();
  return {
    id: 'dj-test',
    projectId: 'project-1',
    profile: 'balanced',
    projectDna: {
      kind: 'frontend',
      confidence: 0.9,
      detectedStack: ['typescript'],
      recommendedProfile: 'balanced',
      notes: [],
    },
    status: 'completed',
    createdAt: now,
    updatedAt: now,
    progress: 100,
    projectPath: workspacePath,
    patches: [patch],
  };
}

describe('daemon job store patch application', () => {
  let tempHome: string;
  let savedHome: string | undefined;
  let savedUserProfile: string | undefined;
  let savedWorkspacesDir: string | undefined;

  beforeEach(() => {
    vi.resetModules();
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
    savedWorkspacesDir = process.env.HOLOSCRIPT_WORKSPACES_DIR;
    delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    tempHome = fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-store-test-'));
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;
  });

  afterEach(() => {
    vi.resetModules();
    if (savedHome === undefined) {
      delete process.env.HOME;
    } else {
      process.env.HOME = savedHome;
    }
    if (savedUserProfile === undefined) {
      delete process.env.USERPROFILE;
    } else {
      process.env.USERPROFILE = savedUserProfile;
    }
    if (savedWorkspacesDir === undefined) {
      delete process.env.HOLOSCRIPT_WORKSPACES_DIR;
    } else {
      process.env.HOLOSCRIPT_WORKSPACES_DIR = savedWorkspacesDir;
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function createWorkspace(
    workspacePath: string = path.join(tempHome, '.holoscript', 'workspaces', 'project-1')
  ): string {
    fs.mkdirSync(path.join(workspacePath, 'src'), { recursive: true });
    runGit(workspacePath, ['init']);
    runGit(workspacePath, ['config', 'user.email', 'studio@example.test']);
    runGit(workspacePath, ['config', 'user.name', 'Studio Test']);
    fs.writeFileSync(path.join(workspacePath, 'src', 'app.ts'), 'export const value = 1;\n');
    runGit(workspacePath, ['add', 'src/app.ts']);
    runGit(workspacePath, ['commit', '-m', 'initial']);
    runGit(workspacePath, ['remote', 'add', 'origin', 'https://github.com/acme/repo.git']);
    return workspacePath;
  }

  function writeStoreSnapshot(job: Record<string, unknown>): void {
    const storeDir = path.join(tempHome, '.holoscript', 'studio');
    fs.mkdirSync(storeDir, { recursive: true });
    fs.writeFileSync(
      path.join(storeDir, 'daemon-jobs.json'),
      JSON.stringify({ jobs: [job], telemetryLog: [] }, null, 2),
      'utf8'
    );
  }

  it('applies selected patches to a workspace branch and returns PR metadata', async () => {
    const workspacePath = createWorkspace();
    writeStoreSnapshot(
      baseJob(workspacePath, {
        id: 'patch-1',
        filePath: 'src/app.ts',
        action: 'modify',
        diff: null,
        proposedContent: 'export const value = 2;\n',
        description: 'Update value',
        confidence: 0.9,
        category: 'typefix',
      })
    );

    const { applyPatchesToWorkspaceBranch } = await import('./store');
    const result = applyPatchesToWorkspaceBranch('dj-test', ['patch-1']);

    expect(result.branchName).toBe('studio/project-1/dj-test');
    expect(result.commitHash).toMatch(/^[a-f0-9]+$/);
    expect(result.files).toEqual(['src/app.ts']);
    expect(result.pushRequest).toMatchObject({
      workspacePath,
      remote: 'origin',
      branch: 'studio/project-1/dj-test',
      force: false,
    });
    expect(result.pullRequest).toMatchObject({
      owner: 'acme',
      repo: 'repo',
      head: 'studio/project-1/dj-test',
      draft: true,
    });
    expect(fs.readFileSync(path.join(workspacePath, 'src', 'app.ts'), 'utf8')).toBe(
      'export const value = 2;\n'
    );
    expect(runGit(workspacePath, ['status', '--porcelain'])).toBe('');
  }, 30_000);

  it('rejects patch paths that escape the workspace', async () => {
    const workspacePath = createWorkspace();
    writeStoreSnapshot(
      baseJob(workspacePath, {
        id: 'patch-escape',
        filePath: '../outside.ts',
        action: 'modify',
        diff: null,
        proposedContent: 'escape',
        description: 'Escape workspace',
        confidence: 0.9,
        category: 'typefix',
      })
    );

    const { applyPatchesToWorkspaceBranch } = await import('./store');

    expect(() => applyPatchesToWorkspaceBranch('dj-test', ['patch-escape'])).toThrow(
      /escapes workspace/i
    );
    expect(fs.existsSync(path.join(tempHome, '.holoscript', 'workspaces', 'outside.ts'))).toBe(
      false
    );
  }, 30_000);

  it('honors HOLOSCRIPT_WORKSPACES_DIR for workspaces outside ~/.holoscript/workspaces', async () => {
    // Production mounts imported repos on a volume (e.g. /data/workspaces/ws-…/Repo)
    // rather than under $HOME; apply-patches must accept that root.
    const volumeRoot = path.join(tempHome, 'data', 'workspaces');
    process.env.HOLOSCRIPT_WORKSPACES_DIR = volumeRoot;
    const workspacePath = createWorkspace(path.join(volumeRoot, 'ws-test', 'HoloScript'));
    writeStoreSnapshot(
      baseJob(workspacePath, {
        id: 'patch-1',
        filePath: 'src/app.ts',
        action: 'modify',
        diff: null,
        proposedContent: 'export const value = 3;\n',
        description: 'Update value',
        confidence: 0.9,
        category: 'typefix',
      })
    );

    const { applyPatchesToWorkspaceBranch } = await import('./store');
    const result = applyPatchesToWorkspaceBranch('dj-test', ['patch-1']);

    expect(result.commitHash).toMatch(/^[a-f0-9]+$/);
    expect(result.pushRequest.workspacePath).toBe(workspacePath);
    expect(fs.readFileSync(path.join(workspacePath, 'src', 'app.ts'), 'utf8')).toBe(
      'export const value = 3;\n'
    );
  }, 30_000);

  it('rejects workspaces outside HOLOSCRIPT_WORKSPACES_DIR when it is set', async () => {
    process.env.HOLOSCRIPT_WORKSPACES_DIR = path.join(tempHome, 'data', 'workspaces');
    // Lives under the legacy ~/.holoscript/workspaces default, which no longer applies.
    const workspacePath = createWorkspace();
    writeStoreSnapshot(
      baseJob(workspacePath, {
        id: 'patch-1',
        filePath: 'src/app.ts',
        action: 'modify',
        diff: null,
        proposedContent: 'export const value = 4;\n',
        description: 'Update value',
        confidence: 0.9,
        category: 'typefix',
      })
    );

    const { applyPatchesToWorkspaceBranch } = await import('./store');

    expect(() => applyPatchesToWorkspaceBranch('dj-test', ['patch-1'])).toThrow(
      /inside the workspaces root/i
    );
  }, 30_000);
});

describe('daemon job store — tenant scoping and no cwd fallback', () => {
  let tempHome: string;
  const saved: Record<string, string | undefined> = {};
  const KEYS = [
    'HOME',
    'USERPROFILE',
    'HOLOSCRIPT_WORKSPACES_DIR',
    'TMPDIR',
    'HOLOHEAL_RUN_REPO_TOOLS',
  ];

  beforeEach(() => {
    vi.resetModules();
    for (const k of KEYS) saved[k] = process.env[k];
    tempHome = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'daemon-tenant-test-')));
    process.env.HOME = tempHome;
    process.env.USERPROFILE = tempHome;
    process.env.HOLOSCRIPT_WORKSPACES_DIR = path.join(tempHome, 'workspaces');
    process.env.TMPDIR = path.join(tempHome, 'tmp');
    fs.mkdirSync(process.env.TMPDIR, { recursive: true });
    delete process.env.HOLOHEAL_RUN_REPO_TOOLS;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.resetModules();
    for (const k of KEYS) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function snapshot(jobs: Array<Record<string, unknown>>): void {
    const storeDir = path.join(tempHome, '.holoscript', 'studio');
    fs.mkdirSync(storeDir, { recursive: true });
    fs.writeFileSync(
      path.join(storeDir, 'daemon-jobs.json'),
      JSON.stringify({ jobs, telemetryLog: [] }),
      'utf8'
    );
  }

  function job(id: string, userId?: string): Record<string, unknown> {
    const now = new Date().toISOString();
    return {
      id,
      projectId: `p-${id}`,
      profile: 'quick',
      projectDna: {
        kind: 'unknown',
        confidence: 0.5,
        detectedStack: [],
        recommendedProfile: 'quick',
        notes: [],
      },
      status: 'completed',
      createdAt: now,
      updatedAt: now,
      progress: 100,
      projectPath: `/data/workspaces/${id}`,
      logs: [{ timestamp: now, level: 'info', message: `secret log of ${id}` }],
      ...(userId ? { userId } : {}),
    };
  }

  it("user B cannot list, open, or read the logs/patches of user A's jobs; ownerless jobs are hidden", async () => {
    snapshot([job('dj-a', 'user-A'), job('dj-b', 'user-B'), job('dj-legacy')]);
    const store = await import('./store');

    expect(store.listDaemonJobs('user-B').map((j) => j.id)).toEqual(['dj-b']);
    expect(store.listDaemonJobs('user-A').map((j) => j.id)).toEqual(['dj-a']);
    expect(store.getDaemonJob('dj-a', 'user-B')).toBeNull();
    expect(store.getDaemonJob('dj-a', 'user-A')?.id).toBe('dj-a');
    expect(store.getDaemonJob('dj-legacy', 'user-A')).toBeNull();
    expect(store.getDaemonJob('dj-legacy', 'user-B')).toBeNull();
  });

  it('a job created without projectPath fails with "no projectPath" — it never scans process.cwd()', async () => {
    // Make the server cwd a perfectly valid workspace: a cwd fallback would scan it.
    const cwdWorkspace = path.join(tempHome, 'workspaces', 'ws-cwd');
    fs.mkdirSync(cwdWorkspace, { recursive: true });
    fs.writeFileSync(path.join(cwdWorkspace, 'README.md'), '# would be scanned');
    vi.spyOn(process, 'cwd').mockReturnValue(cwdWorkspace);

    const store = await import('./store');
    const created = store.createDaemonJob({
      projectId: 'p-nopath',
      profile: 'quick',
      projectDna: {
        kind: 'unknown',
        confidence: 0.5,
        detectedStack: [],
        recommendedProfile: 'quick',
        notes: [],
      },
      userId: 'user-A',
    });
    let final = store.getDaemonJob(created.id, 'user-A');
    for (
      let i = 0;
      i < 100 && final && (final.status === 'queued' || final.status === 'running');
      i++
    ) {
      await new Promise((r) => setTimeout(r, 20));
      final = store.getDaemonJob(created.id, 'user-A');
    }
    expect(final?.status).toBe('failed');
    expect(final?.error).toMatch(/^Blocked: projectPath refused — no projectPath/);
    expect(final?.absorb).toBeUndefined();
  }, 20_000);
});
