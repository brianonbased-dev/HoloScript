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

  beforeEach(() => {
    vi.resetModules();
    savedHome = process.env.HOME;
    savedUserProfile = process.env.USERPROFILE;
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
    fs.rmSync(tempHome, { recursive: true, force: true });
  });

  function createWorkspace(): string {
    const workspacePath = path.join(tempHome, '.holoscript', 'workspaces', 'project-1');
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
  });

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
  });
});
