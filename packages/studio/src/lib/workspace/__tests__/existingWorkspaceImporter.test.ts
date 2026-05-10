import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

import {
  ExistingWorkspaceImportError,
  importExistingWorkspace,
} from '../existingWorkspaceImporter';

type ExecFileCallback = (
  error: NodeJS.ErrnoException | null,
  stdout?: string | Buffer,
  stderr?: string | Buffer
) => void;

let rootPath: string;
let cacheRoot: string;

function writeFile(relPath: string, content: string): void {
  const fullPath = path.join(rootPath, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

function mockCleanGit(commitSha = 'abc123def4567890'): void {
  execFileMock.mockImplementation(
    (_cmd: string, args: string[], _options: unknown, callback?: ExecFileCallback) => {
      if (!callback) throw new Error('Expected execFile callback');
      if (args.includes('rev-parse')) {
        callback(null, `${commitSha}\n`, '');
        return {};
      }
      if (args.includes('status')) {
        callback(null, '', '');
        return {};
      }
      callback(null, '', '');
      return {};
    }
  );
}

describe('importExistingWorkspace', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'existing-workspace-'));
    cacheRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'existing-workspace-cache-'));
    mockCleanGit();
  });

  afterEach(() => {
    fs.rmSync(rootPath, { recursive: true, force: true });
    fs.rmSync(cacheRoot, { recursive: true, force: true });
  });

  it('imports safe ai-ecosystem artifacts and excludes secrets, seats, caches, and machine-local files', async () => {
    writeFile(
      '.holoscript/workspace-import.json',
      JSON.stringify({
        workspaceId: 'ai-ecosystem',
        include: ['custom/**/*.md'],
        exclude: ['research/private/**'],
        categories: { docs: ['custom/**/*.md'] },
      })
    );
    writeFile('AGENTS.md', '# Agents');
    writeFile('.agents/skills/room/SKILL.md', '# Room skill');
    writeFile('knowledge/W.001.md', '# Knowledge');
    writeFile('docs/guide.md', '# Guide');
    writeFile('research/paper.md', '# Paper');
    writeFile('board.json', '{"tasks":[]}');
    writeFile('tasks/open.json', '{"id":"task"}');
    writeFile('custom/account.md', '# Account profile');

    writeFile('.env', 'TOKEN=secret');
    writeFile('.env.local', 'TOKEN=local-secret');
    writeFile('secrets/api.txt', 'secret');
    writeFile('.seats/codex.json', '{"privateKey":"secret"}');
    writeFile('cache/snapshot.json', '{"cached":true}');
    writeFile('node_modules/pkg/index.js', 'module.exports = true');
    writeFile('research/private/secret.md', '# private');

    const result = await importExistingWorkspace({
      rootPath,
      cacheRoot,
      workspaceId: 'ai-ecosystem',
    });

    const paths = result.artifacts.map((artifact) => artifact.path);
    expect(result.workspaceId).toBe('ai-ecosystem');
    expect(result.commitSha).toBe('abc123def4567890');
    expect(result.cacheStatus).toBe('miss');
    expect(paths).toEqual(
      expect.arrayContaining([
        '.agents/skills/room/SKILL.md',
        '.holoscript/workspace-import.json',
        'AGENTS.md',
        'board.json',
        'custom/account.md',
        'docs/guide.md',
        'knowledge/W.001.md',
        'research/paper.md',
        'tasks/open.json',
      ])
    );
    expect(paths).not.toEqual(expect.arrayContaining(['.env', '.env.local']));
    expect(paths.some((p) => p.includes('secrets') || p.includes('.seats'))).toBe(false);
    expect(paths.some((p) => p.includes('node_modules') || p.includes('cache/'))).toBe(false);
    expect(paths).not.toContain('research/private/secret.md');
    expect(result.counts.agents).toBeGreaterThan(0);
    expect(result.counts.knowledge).toBe(1);
    expect(result.counts.research).toBe(1);
    expect(result.counts.tasks).toBe(2);
    expect(result.counts.docs).toBeGreaterThanOrEqual(1);
  });

  it('returns a clean commit cache hit on repeat imports', async () => {
    writeFile('AGENTS.md', '# Agents');
    const first = await importExistingWorkspace({
      rootPath,
      cacheRoot,
      workspaceId: 'ai-ecosystem',
    });
    writeFile('docs/new.md', '# Added after cache');
    const second = await importExistingWorkspace({
      rootPath,
      cacheRoot,
      workspaceId: 'ai-ecosystem',
    });

    expect(first.cacheStatus).toBe('miss');
    expect(second.cacheStatus).toBe('hit');
    expect(second.artifacts.map((artifact) => artifact.path)).not.toContain('docs/new.md');
    expect(second.cachePath).toBe(first.cachePath);
  });

  it('rejects manifest paths outside the workspace root', async () => {
    await expect(
      importExistingWorkspace({
        rootPath,
        cacheRoot,
        manifestPath: '../workspace-import.json',
      })
    ).rejects.toBeInstanceOf(ExistingWorkspaceImportError);
  });
});
