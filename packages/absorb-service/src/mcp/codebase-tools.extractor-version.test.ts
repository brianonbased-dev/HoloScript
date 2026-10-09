/**
 * A graph cache built by an older graph extractor is not used (task epcn).
 * Re-export import edges and .js -> .ts resolution (4ffa25628) changed what is
 * extracted from files that did not change; an incremental patch rescans only
 * changed files, so an old cache would keep missing those edges forever while
 * still reading as authoritative. Old caches are now read as missing, status
 * says why, and the next absorb is a full scan that writes the current version.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { createHash } from 'crypto';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import {
  GRAPH_EXTRACTOR_VERSION,
  handleCodebaseTool,
  resetCodebaseToolStateForTests,
} from './codebase-tools';

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

function jsonFilesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...jsonFilesUnder(full));
    else if (entry.name.endsWith('.json')) out.push(full);
  }
  return out;
}

/** Rewrite every graph envelope as if an older extractor wrote it, keeping manifests consistent. */
function downgradeExtractor(cacheDir: string): number {
  const files = jsonFilesUnder(cacheDir);
  const rewritten = new Map<string, { sha: string; bytes: number }>();
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (typeof parsed.graphJson !== 'string') continue;
    const oldSha = createHash('sha256').update(raw, 'utf-8').digest('hex');
    delete parsed.extractorVersion;
    const next = JSON.stringify(parsed);
    fs.writeFileSync(file, next);
    rewritten.set(oldSha, {
      sha: createHash('sha256').update(next, 'utf-8').digest('hex'),
      bytes: Buffer.byteLength(next, 'utf-8'),
    });
  }
  for (const file of files) {
    const raw = fs.readFileSync(file, 'utf-8');
    if (!raw.includes('graphCacheSha256')) continue;
    const manifest = JSON.parse(raw) as Record<string, unknown>;
    const update = rewritten.get(String(manifest.graphCacheSha256));
    if (!update) continue;
    manifest.graphCacheSha256 = update.sha;
    manifest.graphCacheBytes = update.bytes;
    fs.writeFileSync(file, JSON.stringify(manifest));
  }
  return rewritten.size;
}

describe('graph extractor version', () => {
  it('reads a cache from an older extractor as missing, says why, and rebuilds it in full', async () => {
    resetCodebaseToolStateForTests();
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-extractor-repo-'));
    const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, windowsHide: true });
    git('init');
    git('config', 'user.email', 'codex@example.test');
    git('config', 'user.name', 'Codex Test');
    fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
    fs.writeFileSync(path.join(repo, 'src', 'a.ts'), 'export function a(): number { return 1; }\n');
    fs.writeFileSync(path.join(repo, 'src', 'index.ts'), "export { a } from './a';\n");
    git('add', '.');
    git('commit', '-m', 'init');
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-extractor-cache-'));
    Object.assign(process.env, {
      HOLOSCRIPT_CACHE_DIR: cacheDir,
      HOLOSCRIPT_WORKSPACE_ROOT: repo,
      ABSORB_AUTO_BACKGROUND: '0',
      ABSORB_REQUIRE_ISOLATION: '0',
      ABSORB_MIN_SYSTEM_FREE_MB: '64',
    });

    const first = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repo,
      force: true,
      outputFormat: 'stats',
    })) as { error?: string };
    expect(first.error, JSON.stringify(first).slice(0, 300)).toBeUndefined();
    const written = jsonFilesUnder(cacheDir)
      .map((file) => JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>)
      .filter((envelope) => typeof envelope.graphJson === 'string');
    expect(written.length).toBeGreaterThan(0);
    for (const envelope of written) expect(envelope.extractorVersion).toBe(GRAPH_EXTRACTOR_VERSION);

    expect(downgradeExtractor(cacheDir)).toBeGreaterThan(0);
    resetCodebaseToolStateForTests();

    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      diskCache?: { exists?: boolean; hint?: string; outdatedExtractor?: { found: number } };
    };
    expect(status.diskCache?.exists, JSON.stringify(status.diskCache)).toBe(false);
    expect(status.diskCache?.outdatedExtractor?.found).toBe(1);
    expect(status.diskCache?.hint).toContain('full scan');

    const second = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repo,
      outputFormat: 'stats',
    })) as Record<string, unknown>;
    expect(second.error, JSON.stringify(second).slice(0, 300)).toBeUndefined();
    expect(second.incremental).not.toBe(true);
    const rewritten = jsonFilesUnder(cacheDir)
      .map((file) => JSON.parse(fs.readFileSync(file, 'utf-8')) as Record<string, unknown>)
      .filter((envelope) => typeof envelope.graphJson === 'string');
    expect(
      rewritten.some((envelope) => envelope.extractorVersion === GRAPH_EXTRACTOR_VERSION)
    ).toBe(true);
  }, 120_000);
});
