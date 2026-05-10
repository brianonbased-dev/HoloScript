import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const execFileMock = vi.hoisted(() => vi.fn());

vi.mock('child_process', () => ({
  execFile: execFileMock,
}));

import {
  buildFounderWorkspaceBackfill,
  persistFounderWorkspaceBackfill,
} from '../founderWorkspaceBackfill';

type ExecFileCallback = (
  error: NodeJS.ErrnoException | null,
  stdout?: string | Buffer,
  stderr?: string | Buffer
) => void;

let rootPath: string;
let outputRoot: string;

function writeFile(relPath: string, content: string): void {
  const fullPath = path.join(rootPath, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, 'utf-8');
}

function mockGit(commitSha = 'abc123def4567890'): void {
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
      if (args.includes('config') && args.includes('remote.origin.url')) {
        callback(null, 'git@github.com:brianonbased-dev/ai-ecosystem.git\n', '');
        return {};
      }
      callback(null, '', '');
      return {};
    }
  );
}

describe('buildFounderWorkspaceBackfill', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    rootPath = fs.mkdtempSync(path.join(os.tmpdir(), 'founder-backfill-'));
    outputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'founder-backfill-output-'));
    mockGit();

    writeFile(
      'knowledge/W.TEST.001.md',
      [
        '---',
        'id: W.TEST.001',
        '---',
        '# Wisdom',
        'Founders need provenance.',
        'token=ghp_abcdefghijklmnopqrstuvwxyz1234567890',
      ].join('\n')
    );
    writeFile(
      'knowledge/P.TEST.002.md',
      ['---', 'id: P.TEST.002', '---', '# Pattern', 'Backfill path-backed entries.'].join('\n')
    );
    writeFile(
      'knowledge/G.TEST.003.md',
      ['---', 'id: G.TEST.003', '---', '# Gotcha', 'board.json is only a snapshot.'].join('\n')
    );
    writeFile(
      'docs/repos.md',
      [
        '# Linked repos',
        'Use https://github.com/brianonbased-dev/HoloScript/blob/main/README.md',
        'Mirror git@github.com:brianonbased-dev/ai-ecosystem.git',
      ].join('\n')
    );
    writeFile('board.json', JSON.stringify({ tasks: [{ id: 'a' }, { id: 'b' }] }));
    writeFile(
      'research/2026-05-09_lotus-paper-state.md',
      [
        '# Lotus Paper State',
        'TVCG reviewer response is HELD while the Lotus evidence bundle is updated.',
      ].join('\n')
    );
    writeFile('.env', 'GITHUB=https://github.com/secret/not-imported.git');
  });

  afterEach(() => {
    fs.rmSync(rootPath, { recursive: true, force: true });
    fs.rmSync(outputRoot, { recursive: true, force: true });
  });

  it('hydrates knowledge, live board authority, linked repos, and founder-only paper state', async () => {
    const result = await buildFounderWorkspaceBackfill({
      rootPath,
      workspaceId: 'ai-ecosystem',
      teamId: 'team-test',
      importPersist: false,
    });

    expect(result.workspaceId).toBe('ai-ecosystem');
    expect(result.commitSha).toBe('abc123def4567890');

    expect(result.knowledgeSyncPayload.workspace_id).toBe('ai-ecosystem');
    expect(result.knowledgeSyncPayload.entries).toHaveLength(3);
    expect(result.knowledgeSyncPayload.entries.map((entry) => entry.type).sort()).toEqual([
      'gotcha',
      'pattern',
      'wisdom',
    ]);
    expect(JSON.stringify(result.knowledgeSyncPayload.entries)).not.toContain(
      'ghp_abcdefghijklmnopqrstuvwxyz1234567890'
    );
    expect(result.knowledgeSyncPayload.entries[0]).toEqual(
      expect.objectContaining({
        workspace_id: 'ai-ecosystem',
        workspaceId: 'ai-ecosystem',
        metadata: expect.objectContaining({
          commitSha: 'abc123def4567890',
          path: expect.stringMatching(/^knowledge\//),
          artifactSha256: expect.any(String),
        }),
      })
    );

    expect(result.boardState).toEqual(
      expect.objectContaining({
        authoritativeSource: 'holomesh-live-board',
        liveEndpoint: '/api/holomesh/team/team-test/board',
        snapshotPath: 'board.json',
        snapshotTaskCount: 2,
        snapshotIsAuthoritative: false,
      })
    );

    const cloneUrls = result.linkedRepos.map((repo) => repo.cloneUrl);
    expect(cloneUrls).toEqual(
      expect.arrayContaining([
        'https://github.com/brianonbased-dev/HoloScript.git',
        'https://github.com/brianonbased-dev/ai-ecosystem.git',
      ])
    );
    const holoScriptRepo = result.linkedRepos.find((repo) =>
      repo.cloneUrl.endsWith('/HoloScript.git')
    );
    expect(holoScriptRepo?.absorbProject).toMatchObject({
      source_type: 'github',
      source_url: 'https://github.com/brianonbased-dev/HoloScript.git',
      workspace_id: 'ai-ecosystem',
    });
    expect(holoScriptRepo?.sourcePaths).toContain('docs/repos.md');
    expect(JSON.stringify(result.linkedRepos)).not.toContain('secret/not-imported');

    expect(result.paperResearchState).toHaveLength(1);
    expect(result.paperResearchState[0]).toEqual(
      expect.objectContaining({
        title: 'Lotus Paper State',
        founderOnly: true,
        visibility: 'founder-only',
        path: 'research/2026-05-09_lotus-paper-state.md',
        signals: expect.arrayContaining(['lotus', 'tvcg', 'review-state']),
      })
    );
  });

  it('persists the founder backfill manifest beside the account workspace', async () => {
    const result = await buildFounderWorkspaceBackfill({
      rootPath,
      workspaceId: 'ai-ecosystem',
      importPersist: false,
    });

    const manifestPath = persistFounderWorkspaceBackfill({
      workspaceDir: outputRoot,
      backfill: result,
    });

    expect(fs.existsSync(manifestPath)).toBe(true);
    const persisted = JSON.parse(fs.readFileSync(manifestPath, 'utf-8')) as {
      backfill: { workspaceId: string; knowledgeSyncPayload: { entries: unknown[] } };
    };
    expect(persisted.backfill.workspaceId).toBe('ai-ecosystem');
    expect(persisted.backfill.knowledgeSyncPayload.entries).toHaveLength(3);
  });
});
