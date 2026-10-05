/**
 * holo_ask_codebase with no reachable answer model (tester agents,
 * 2026-10-05): the reply names the address that was tried and quotes the code
 * of its top matches, so the asking agent can read what the code does instead
 * of getting names and line numbers only.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';
import { handleGraphRagTool, readSymbolExcerpt, resetGraphRAGStateForTests } from './graph-rag-tools';

const saved = { ...process.env };
afterEach(() => {
  vi.restoreAllMocks();
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

function makeRepo(): string {
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-no-model-repo-'));
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, windowsHide: true });
  git('init');
  git('config', 'user.email', 'codex@example.test');
  git('config', 'user.name', 'Codex Test');
  fs.mkdirSync(path.join(repo, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(repo, 'src', 'freshness.ts'),
    [
      '/** Decide whether the cached map still matches the checkout. */',
      'export function isCachedMapFresh(headMatches: boolean, fingerprintMatches: boolean): boolean {',
      '  return headMatches && fingerprintMatches;',
      '}',
      '',
    ].join('\n')
  );
  git('add', '.');
  git('commit', '-m', 'init');
  return repo;
}

describe('holo_ask_codebase without a reachable model', () => {
  it('names the address it tried and quotes the code of its top matches', async () => {
    resetCodebaseToolStateForTests();
    resetGraphRAGStateForTests();
    const repo = makeRepo();
    Object.assign(process.env, {
      HOLOSCRIPT_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-no-model-cache-')),
      HOLOSCRIPT_WORKSPACE_ROOT: repo,
      ABSORB_AUTO_BACKGROUND: '0',
      ABSORB_REQUIRE_ISOLATION: '0',
      ABSORB_MIN_SYSTEM_FREE_MB: '64',
      HOLOLLAMA_ENDPOINT: 'http://127.0.0.1:9/v1',
    });
    const absorb = (await handleCodebaseTool('holo_absorb_repo', {
      rootDir: repo,
      force: true,
      outputFormat: 'graph',
    })) as { error?: string };
    expect(absorb.error, JSON.stringify(absorb).slice(0, 300)).toBeUndefined();

    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
    const answer = (await handleGraphRagTool('holo_ask_codebase', {
      question: 'how is a cached map judged fresh',
      topK: 3,
    })) as {
      error?: string;
      fallback?: string;
      fallbackReason?: string;
      answer?: string;
      excerpts?: Array<{ name: string; file: string; line: number; code: string }>;
    };
    expect(answer.error, JSON.stringify(answer).slice(0, 400)).toBeUndefined();
    expect(answer.fallback).toBe('extractive-graphrag');
    expect(answer.fallbackReason).toBe('fetch failed at http://127.0.0.1:9/v1/chat/completions');
    const excerpt = answer.excerpts?.find((e) => e.name === 'isCachedMapFresh');
    expect(excerpt?.code).toContain('return headMatches && fingerprintMatches;');
    expect(excerpt?.code).toContain('Decide whether the cached map still matches the checkout.');
  }, 120_000);

  it('reads excerpts only inside the graph root, bounded in lines', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-excerpt-root-'));
    fs.writeFileSync(
      path.join(root, 'long.ts'),
      Array.from({ length: 60 }, (_, i) => `line ${i + 1}`).join('\n')
    );
    const outside = path.join(path.dirname(root), `outside-${path.basename(root)}.ts`);
    fs.writeFileSync(outside, 'secret');

    expect(readSymbolExcerpt(root, 'long.ts', 5)?.split('\n')).toHaveLength(20);
    expect(readSymbolExcerpt(root, 'long.ts', 5, 3)).toBe('line 5\nline 6\nline 7');
    expect(readSymbolExcerpt(root, `../${path.basename(outside)}`, 1)).toBeUndefined();
    expect(readSymbolExcerpt(root, outside, 1)).toBeUndefined();
  });
});
