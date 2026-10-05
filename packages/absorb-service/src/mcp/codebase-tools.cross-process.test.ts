/**
 * A background absorb runs in an isolated worker and publishes a new cache
 * generation to disk, while the serving process still holds the superseded
 * graph in memory. The first query after publication must read the new
 * generation, not refuse its own stale copy (2026-10-04). This lives in its
 * own file because it uses vi.resetModules to stand up a second module
 * instance (the "worker"): same disk, separate memory.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

function makeTinyGitRepo(prefix: string): string {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repoDir, windowsHide: true });
  git('init');
  git('config', 'user.email', 'codex@example.test');
  git('config', 'user.name', 'Codex Test');
  fs.mkdirSync(path.join(repoDir, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(repoDir, 'src', 'alpha.ts'),
    'export function alpha(): string { return "alpha"; }\n'
  );
  git('add', 'src/alpha.ts');
  git('commit', '-m', 'init');
  return repoDir;
}

describe('a generation published by another process', () => {
  it('is read by the first query instead of refusing the superseded in-memory graph', async () => {
    resetCodebaseToolStateForTests();
    const repoDir = makeTinyGitRepo('holoscript-cross-process-repo-');
    process.env.HOLOSCRIPT_CACHE_LAYOUT = 'flat';
    process.env.HOLOSCRIPT_CACHE_DIR = fs.mkdtempSync(
      path.join(os.tmpdir(), 'holoscript-cross-process-cache-')
    );
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = repoDir;
    process.env.ABSORB_AUTO_BACKGROUND = '0';
    process.env.ABSORB_REQUIRE_ISOLATION = '0';
    process.env.ABSORB_MIN_SYSTEM_FREE_MB = '64';

    await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
      force: true,
    });
    const warm = (await handleCodebaseTool('holo_query_codebase', {
      query: 'find',
      symbol: 'alpha',
    })) as { count?: number };
    expect(warm.count).toBeGreaterThan(0);

    fs.appendFileSync(
      path.join(repoDir, 'src', 'alpha.ts'),
      'export function delta(): number { return 4; }\n'
    );
    vi.resetModules();
    const worker = await import('./codebase-tools');
    const published = (await worker.handleCodebaseTool('holo_absorb_repo', {
      rootDir: repoDir,
      outputFormat: 'stats',
    })) as Record<string, unknown>;
    expect(published, JSON.stringify(published, null, 2)).not.toHaveProperty('error');

    const first = (await handleCodebaseTool('holo_query_codebase', {
      query: 'find',
      symbol: 'delta',
    })) as { error?: string; count?: number };
    expect(first.error, JSON.stringify(first, null, 2)).toBeUndefined();
    expect(first.count).toBeGreaterThan(0);
  }, 120_000);
});
