/**
 * A caller that may not read code (on the hosted server: a customer key with
 * only tools:codebase) gets graph answers with no source in them: no `source`
 * query, no quoted excerpts, no code in the answer prompt. claude6's review of
 * #501/#513: the absorbed graph and its roots are shared between callers there.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';
import { handleGraphRagTool, resetGraphRAGStateForTests } from './graph-rag-tools';
import { codeReadAllowed, runWithCodeReadAccess, setCodeReadDefault } from './code-read-access';

const CODE_LINE = 'return headMatches && fingerprintMatches;';
const saved = { ...process.env };
afterEach(() => {
  vi.restoreAllMocks();
  setCodeReadDefault(true);
  for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
  Object.assign(process.env, saved);
});

async function absorbFixture(): Promise<void> {
  resetCodebaseToolStateForTests();
  resetGraphRAGStateForTests();
  const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-code-read-repo-'));
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
      `  ${CODE_LINE}`,
      '}',
      '',
    ].join('\n')
  );
  git('add', '.');
  git('commit', '-m', 'init');
  Object.assign(process.env, {
    HOLOSCRIPT_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-code-read-cache-')),
    HOLOSCRIPT_WORKSPACE_ROOT: repo,
    ABSORB_AUTO_BACKGROUND: '0',
    ABSORB_REQUIRE_ISOLATION: '0',
    ABSORB_MIN_SYSTEM_FREE_MB: '64',
  });
  const absorb = (await handleCodebaseTool('holo_absorb_repo', {
    rootDir: repo,
    force: true,
    outputFormat: 'graph',
  })) as { error?: string };
  expect(absorb.error, JSON.stringify(absorb).slice(0, 300)).toBeUndefined();
}

describe('code read access', () => {
  it('is decided per call, with a process default the hosted server turns off', () => {
    expect(codeReadAllowed()).toBe(true);
    expect(runWithCodeReadAccess(false, () => codeReadAllowed())).toBe(false);
    setCodeReadDefault(false);
    expect(codeReadAllowed()).toBe(false);
    expect(runWithCodeReadAccess(true, () => codeReadAllowed())).toBe(true);
  });

  it('a caller that may not read code gets no source query and no quoted code in an ask answer', async () => {
    await absorbFixture();
    // Every answer route (registered devices, resolver) fails, so ask falls
    // back to the extractive answer, which is where code used to be quoted.
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const refused = (await runWithCodeReadAccess(false, () =>
      handleCodebaseTool('holo_query_codebase', {
        query: 'isCachedMapFresh',
        queryType: 'source',
        symbolName: 'isCachedMapFresh',
      })
    )) as Record<string, unknown>;
    expect(refused.error).toBe('code_read_not_allowed');
    expect(JSON.stringify(refused)).not.toContain(CODE_LINE);

    const answer = (await runWithCodeReadAccess(false, () =>
      handleGraphRagTool('holo_ask_codebase', { question: 'how is a cached map judged fresh', topK: 3 })
    )) as Record<string, unknown>;
    expect(answer.fallback, JSON.stringify(answer).slice(0, 400)).toBe('extractive-graphrag');
    expect(answer.excerpts ?? []).toEqual([]);
    expect(JSON.stringify(answer)).not.toContain(CODE_LINE);

    // The same calls from a caller that may read code still get it.
    const allowed = (await runWithCodeReadAccess(true, () =>
      handleCodebaseTool('holo_query_codebase', {
        query: 'isCachedMapFresh',
        queryType: 'source',
        symbolName: 'isCachedMapFresh',
      })
    )) as Record<string, unknown>;
    expect(JSON.stringify(allowed)).toContain(CODE_LINE);
    const allowedAnswer = (await runWithCodeReadAccess(true, () =>
      handleGraphRagTool('holo_ask_codebase', { question: 'how is a cached map judged fresh', topK: 3 })
    )) as Record<string, unknown>;
    expect(JSON.stringify(allowedAnswer)).toContain(CODE_LINE);
  }, 120_000);
});
