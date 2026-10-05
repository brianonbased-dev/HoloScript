/**
 * ABSORB_EMBEDDING_SHARDS=1 end to end: an absorb publishes the HoloEmbed
 * index as per-area shards, semantic search serves from them shard by shard,
 * and a one-file change rewrites only that area's shard.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';
import { handleGraphRagTool, resetGraphRAGStateForTests } from './graph-rag-tools';
import { EMBEDDING_SHARD_MANIFEST, type EmbeddingShardManifest } from '../engine/ShardedEmbeddingIndex';

const saved = { ...process.env };
afterEach(() => {
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

function write(root: string, rel: string, body: string): void {
  fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
  fs.writeFileSync(path.join(root, rel), body);
}

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-sharded-embed-repo-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, windowsHide: true });
  git('init');
  git('config', 'user.email', 'codex@example.test');
  git('config', 'user.name', 'Codex Test');
  write(repo, 'packages/alpha/src/alpha.ts', 'export function parseAlphaTree(): number { return 1; }\n');
  write(repo, 'packages/beta/src/beta.ts', 'export function renderBetaScene(): number { return 2; }\n');
  write(repo, 'services/gamma/index.ts', 'export function absorbGammaGraph(): number { return 3; }\n');
  git('add', '.');
  git('commit', '-m', 'init');
  return repo;
}

function shardManifest(cacheDir: string): { dir: string; manifest: EmbeddingShardManifest } {
  const generation = JSON.parse(
    fs.readFileSync(path.join(cacheDir, 'cache-generation.json'), 'utf-8')
  ) as { embeddingsFile: string | null };
  expect(generation.embeddingsFile).toBeTruthy();
  const dir = path.join(cacheDir, 'generations', generation.embeddingsFile!);
  return {
    dir,
    manifest: JSON.parse(fs.readFileSync(path.join(dir, EMBEDDING_SHARD_MANIFEST), 'utf-8')),
  };
}

describe('sharded HoloEmbed publication', () => {
  it('publishes shards, serves search from them, and rewrites only the changed area', async () => {
    resetCodebaseToolStateForTests();
    resetGraphRAGStateForTests();
    const repo = makeRepo();
    const cacheDir = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-sharded-embed-cache-'));
    Object.assign(process.env, {
      HOLOSCRIPT_CACHE_DIR: cacheDir,
      HOLOSCRIPT_CACHE_LAYOUT: 'flat',
      HOLOSCRIPT_WORKSPACE_ROOT: repo,
      ABSORB_AUTO_BACKGROUND: '0',
      ABSORB_REQUIRE_ISOLATION: '0',
      ABSORB_MIN_SYSTEM_FREE_MB: '64',
      ABSORB_EMBEDDING_SHARDS: '1',
      ABSORB_EMBEDDING_MEMORY_MB: '1',
    });

    const first = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repo,
      force: true,
      outputFormat: 'graph',
    })) as { error?: string };
    expect(first.error, JSON.stringify(first)).toBeUndefined();
    const before = shardManifest(cacheDir);
    expect(before.manifest.shards.map((s) => s.key).sort()).toEqual([
      'packages/alpha',
      'packages/beta',
      'services/gamma',
    ]);
    expect(fs.existsSync(path.join(path.dirname(before.dir), 'embeddings-cache.bin'))).toBe(false);

    resetCodebaseToolStateForTests();
    resetGraphRAGStateForTests();
    // After a restart, status must see the shard set on disk as ready. It used
    // to compare the directory's stat (0 bytes on Windows) and say "not ready".
    const status = (await handleCodebaseTool('holo_graph_status', {})) as {
      semanticIndex?: { diskHydratable?: boolean; diskEmbeddingGenerationMatchesGraph?: boolean };
    };
    expect(status.semanticIndex?.diskEmbeddingGenerationMatchesGraph, JSON.stringify(status.semanticIndex)).toBe(true);
    expect(status.semanticIndex?.diskHydratable).toBe(true);
    const search = (await handleGraphRagTool('holo_semantic_search', {
      query: 'renderBetaScene',
      topK: 3,
    })) as { error?: string; results?: Array<{ name: string }> };
    expect(search.error, JSON.stringify(search)).toBeUndefined();
    expect(search.results?.[0]?.name).toBe('renderBetaScene');

    write(repo, 'packages/beta/src/beta.ts', 'export function renderBetaSceneTwice(): number { return 4; }\n');
    const second = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repo,
      outputFormat: 'graph',
    })) as { error?: string };
    expect(second.error, JSON.stringify(second)).toBeUndefined();
    const after = shardManifest(cacheDir);
    expect(after.dir).not.toBe(before.dir);
    const changed = after.manifest.shards
      .filter((s) => before.manifest.shards.find((b) => b.key === s.key)?.sha256 !== s.sha256)
      .map((s) => s.key);
    expect(changed).toEqual(['packages/beta']);
    // Unchanged shards are the same file on disk (hard link), not a copy.
    const alphaBefore = before.manifest.shards.find((s) => s.key === 'packages/alpha')!;
    const alphaAfter = after.manifest.shards.find((s) => s.key === 'packages/alpha')!;
    expect(fs.statSync(path.join(after.dir, alphaAfter.file)).nlink).toBeGreaterThan(1);
    expect(alphaAfter.sha256).toBe(alphaBefore.sha256);
  }, 120_000);
});
