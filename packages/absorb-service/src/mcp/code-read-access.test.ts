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
import { handleGraphRagTool, readSymbolLines, resetGraphRAGStateForTests } from './graph-rag-tools';
import { codeReadAllowed, runWithCodeReadAccess, setCodeReadDefault } from './code-read-access';

const CODE_LINE = 'return headMatches && fingerprintMatches;';
const saved = { ...process.env };
afterEach(() => {
  vi.restoreAllMocks();
  setCodeReadDefault(false);
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
  it('is off unless a call or a local entry point turns it on, and every module copy shares it', () => {
    // A host that forgets to decide reads no code (claude4: the absorb host never did).
    expect(codeReadAllowed()).toBe(false);
    expect(runWithCodeReadAccess(true, () => codeReadAllowed())).toBe(true);
    setCodeReadDefault(true);
    expect(codeReadAllowed()).toBe(true);
    expect(runWithCodeReadAccess(false, () => codeReadAllowed())).toBe(false);
    // One gate per process: a second bundled copy finds the same store.
    const shared = (globalThis as unknown as Record<symbol, { defaultAllowed: boolean }>)[
      Symbol.for('holoscript.absorb-service.code-read-gate.v1')
    ];
    expect(shared?.defaultAllowed).toBe(true);
    setCodeReadDefault(false);
    expect(shared?.defaultAllowed).toBe(false);
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

  it("never answers one caller from another caller's sourceFiles upload; the uploader still is", async () => {
    resetCodebaseToolStateForTests();
    resetGraphRAGStateForTests();
    const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-upload-owner-root-'));
    Object.assign(process.env, {
      HOLOSCRIPT_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-upload-owner-cache-')),
      HOLOSCRIPT_WORKSPACE_ROOT: uploadRoot,
      ABSORB_AUTO_BACKGROUND: '0',
      ABSORB_REQUIRE_ISOLATION: '0',
      ABSORB_MIN_SYSTEM_FREE_MB: '64',
    });
    const upload = (await runWithCodeReadAccess(
      false,
      () =>
        handleCodebaseTool('holo_absorb_repo', {
          rootDir: uploadRoot,
          sourceFiles: [
            {
              path: 'src/tenantA.ts',
              content: 'export function tenantAlphaPricingRule(): number { return 42; }\n',
            },
          ],
          outputFormat: 'graph',
        }),
      'tenant-a'
    )) as { error?: string };
    expect(upload.error, JSON.stringify(upload).slice(0, 300)).toBeUndefined();
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));

    const other = await runWithCodeReadAccess(
      false,
      () => handleGraphRagTool('holo_semantic_search', { query: 'tenantAlphaPricingRule', topK: 3 }),
      'tenant-b'
    );
    expect(JSON.stringify(other)).not.toContain('tenantAlphaPricingRule');

    // The uploader asks right after uploading and is answered from its upload
    // (the bug 7b42c3b43 fixed: "No Graph RAG engine initialized").
    const reupload = (await runWithCodeReadAccess(
      false,
      () =>
        handleCodebaseTool('holo_absorb_repo', {
          rootDir: uploadRoot,
          sourceFiles: [
            {
              path: 'src/tenantA.ts',
              content: 'export function tenantAlphaPricingRule(): number { return 42; }\n',
            },
          ],
          outputFormat: 'graph',
        }),
      'tenant-a'
    )) as { error?: string };
    expect(reupload.error).toBeUndefined();
    const own = await runWithCodeReadAccess(
      false,
      () => handleGraphRagTool('holo_semantic_search', { query: 'tenantAlphaPricingRule', topK: 3 }),
      'tenant-a'
    );
    expect(JSON.stringify(own).slice(0, 600)).toContain('tenantAlphaPricingRule');
  }, 120_000);

  it('reads an upload from what was uploaded, never from the disk at a caller-named root', async () => {
    resetCodebaseToolStateForTests();
    resetGraphRAGStateForTests();
    const named = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-named-root-'));
    fs.mkdirSync(path.join(named, 'src'), { recursive: true });
    fs.writeFileSync(
      path.join(named, 'src', 'x.ts'),
      'export function f(): string { return "DISK_ONLY_SECRET"; }\n'
    );
    Object.assign(process.env, {
      HOLOSCRIPT_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-named-root-cache-')),
      HOLOSCRIPT_WORKSPACE_ROOT: named,
      ABSORB_AUTO_BACKGROUND: '0',
      ABSORB_REQUIRE_ISOLATION: '0',
      ABSORB_MIN_SYSTEM_FREE_MB: '64',
    });
    const result = await runWithCodeReadAccess(true, async () => {
      const absorb = (await handleCodebaseTool('holo_absorb_repo', {
        rootDir: named,
        sourceFiles: [{ path: 'src/x.ts', content: 'export function f(): string { return "UPLOADED"; }\n' }],
        outputFormat: 'graph',
      })) as { error?: string };
      expect(absorb.error, JSON.stringify(absorb).slice(0, 300)).toBeUndefined();
      // No model answers, so ask quotes the code it found (excerpts).
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('fetch failed'));
      return handleGraphRagTool('holo_ask_codebase', { question: 'what does f return', topK: 3 });
    });
    expect(JSON.stringify(result)).toContain('UPLOADED');
    expect(JSON.stringify(result)).not.toContain('DISK_ONLY_SECRET');
  }, 120_000);

  it('reads the disk only inside the absorb root allowlist, and not through a symlink out of the root', () => {
    const allowed = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-allowed-root-'));
    const outside = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-outside-root-'));
    fs.writeFileSync(path.join(allowed, 'a.ts'), 'export const a = 1;\n');
    fs.writeFileSync(path.join(outside, 'b.ts'), 'export const OUTSIDE_SECRET = 2;\n');
    process.env.ABSORB_ALLOWED_ROOTS = allowed;
    expect(readSymbolLines(allowed, 'a.ts', 1)?.lines[0]).toBe('export const a = 1;');
    expect(readSymbolLines(outside, 'b.ts', 1)).toBeUndefined();

    let linked = false;
    try {
      fs.symlinkSync(path.join(outside, 'b.ts'), path.join(allowed, 'link.ts'), 'file');
      linked = true;
    } catch {
      // Creating symlinks needs a privilege some Windows accounts lack.
    }
    if (linked) expect(readSymbolLines(allowed, 'link.ts', 1)).toBeUndefined();
  });
});
