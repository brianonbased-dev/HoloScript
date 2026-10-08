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
import { createHash } from 'crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from './codebase-tools';
import { handleGraphRagTool, readSymbolLines, resetGraphRAGStateForTests } from './graph-rag-tools';
import { codeReadAllowed, runWithCodeReadAccess, setCodeReadDefault } from './code-read-access';

const TENANT_A_FILE = {
  path: 'src/tenantA.ts',
  content: 'export function tenantAlphaPricingRule(): number { return 42; }\n',
};

/** A LocalCodebaseSnapshotReceipt.v1 as HoloShell's local adapter emits it: unsigned, roots chosen by the sender. */
function snapshotReceipt(
  files: Array<{ path: string; content: string }>,
  roots: string[]
): Record<string, unknown> {
  const now = new Date().toISOString();
  const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
  return {
    schema: 'LocalCodebaseSnapshotReceipt.v1',
    version: '0.1.0',
    emittedAt: now,
    agent: 'code-read-access-test',
    surface: 'vitest',
    roots,
    sourceFiles: files.map((file) => ({
      ...file,
      size: Buffer.byteLength(file.content, 'utf-8'),
      hash: sha256(file.content),
      mtime: now,
    })),
    stats: {
      totalFiles: files.length,
      totalBytes: files.reduce((sum, file) => sum + Buffer.byteLength(file.content, 'utf-8'), 0),
      skippedCount: 0,
    },
    replayCommand: 'holo_absorb_repo --sourceFiles <this-payload>',
    privacyClass: 'local-test',
    freshness: { generatedAt: now },
  };
}

function isolatedAbsorbEnv(workspace: string, extra: Record<string, string> = {}): void {
  Object.assign(process.env, {
    HOLOSCRIPT_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-code-read-cache-')),
    HOLOSCRIPT_WORKSPACE_ROOT: workspace,
    ABSORB_AUTO_BACKGROUND: '0',
    ABSORB_REQUIRE_ISOLATION: '0',
    ABSORB_MIN_SYSTEM_FREE_MB: '64',
    ...extra,
  });
}

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
    // tenant-a may not name this server's folders, so it uploads without a
    // root: the upload gets its own temp folder (round 2: a named root is
    // refused for such a caller, see the test below).
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

  it.each(['graph', 'stats'])(
    'an upload carrying a snapshot receipt answers only its uploader, in every tool family (outputFormat %s)',
    async (outputFormat) => {
      // claude4's round 2 review: (P1) the owner check ran only before the
      // semantic tools, and a self-asserted receipt made the upload trusted
      // for everyone, so holo_query_codebase symbols/find answered tenant B
      // from tenant A's upload; (P1) the outputFormat 'stats' install carried
      // no owner tag and no uploaded text at all.
      resetCodebaseToolStateForTests();
      resetGraphRAGStateForTests();
      const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-owner-workspace-'));
      const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-owner-upload-root-'));
      // The named root holds different text on disk: an upload is read from what was sent.
      fs.mkdirSync(path.join(uploadRoot, 'src'), { recursive: true });
      fs.writeFileSync(
        path.join(uploadRoot, TENANT_A_FILE.path),
        'export function tenantAlphaPricingRule(): string { return "DISK_ONLY_SECRET"; }\n'
      );
      isolatedAbsorbEnv(workspace, {
        ABSORB_ALLOWED_ROOTS: [workspace, uploadRoot].join(path.delimiter),
      });

      // Tenant A may name this server's folders (an admin or the local user).
      const upload = (await runWithCodeReadAccess(
        true,
        () =>
          handleCodebaseTool('holo_absorb_repo', {
            localCodebaseSnapshotReceipt: snapshotReceipt([TENANT_A_FILE], [uploadRoot]),
            outputFormat,
          }),
        'tenant-a'
      )) as { error?: string };
      expect(upload.error, JSON.stringify(upload).slice(0, 300)).toBeUndefined();

      // The uploader is answered from its upload, its code from the uploaded text.
      const own = await runWithCodeReadAccess(
        true,
        () =>
          handleCodebaseTool('holo_query_codebase', {
            query: 'source',
            symbolName: 'tenantAlphaPricingRule',
          }),
        'tenant-a'
      );
      expect(JSON.stringify(own).slice(0, 600)).toContain('return 42');
      expect(JSON.stringify(own)).not.toContain('DISK_ONLY_SECRET');

      // Tenant B gets none of it from the structural tools.
      for (const args of [
        { query: 'symbols', filePath: TENANT_A_FILE.path },
        { query: 'find', symbol: 'tenantAlphaPricingRule' },
      ]) {
        const other = await runWithCodeReadAccess(
          false,
          () => handleCodebaseTool('holo_query_codebase', args),
          'tenant-b'
        );
        expect(JSON.stringify(other), JSON.stringify(args)).not.toContain('tenantAlphaPricingRule');
      }
      const impact = await runWithCodeReadAccess(
        false,
        () => handleCodebaseTool('holo_impact_analysis', { symbol: 'tenantAlphaPricingRule' }),
        'tenant-b'
      );
      expect(JSON.stringify(impact)).not.toContain('src/tenantA.ts');
    },
    120_000
  );

  it("an ask keeps the engine it started with: another caller's upload during the model wait never answers it", async () => {
    // claude4's round 2 review: holo_ask_codebase checked the owner once, then
    // reread the shared engine after model calls of up to 120 s, so an upload
    // landing in between answered this caller from another caller's code.
    await absorbFixture();
    let swapped = false;
    let swapError: string | undefined;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
      if (!swapped) {
        swapped = true;
        // While tenant B waits on its first model call, tenant A uploads.
        const upload = (await runWithCodeReadAccess(
          false,
          () =>
            handleCodebaseTool('holo_absorb_repo', {
              sourceFiles: [TENANT_A_FILE],
              outputFormat: 'graph',
            }),
          'tenant-a'
        )) as { error?: string };
        swapError = upload.error;
      }
      throw new Error('fetch failed');
    });
    const answer = await runWithCodeReadAccess(
      false,
      () =>
        handleGraphRagTool('holo_ask_codebase', {
          question: 'what does this code decide',
          topK: 3,
        }),
      'tenant-b'
    );
    expect(swapped, 'no model call happened, so nothing could swap the engine').toBe(true);
    expect(swapError).toBeUndefined();
    expect(JSON.stringify(answer)).not.toContain('tenantAlphaPricingRule');
    expect(JSON.stringify(answer).slice(0, 2000)).toContain('isCachedMapFresh');
  }, 120_000);

  it("a semantic index warmed over an upload is not installed once that upload was evicted", async () => {
    // claude4's round 2 review: a background warm installed its engine over
    // whatever graph it started from, even after another caller's call evicted
    // that upload, and every caller's semantic tools then answered from it.
    resetCodebaseToolStateForTests();
    resetGraphRAGStateForTests();
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-warm-workspace-'));
    const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-warm-upload-root-'));
    isolatedAbsorbEnv(workspace);
    const asTenantA = <T>(fn: () => T) => runWithCodeReadAccess(true, fn, 'tenant-a');
    const asTenantB = <T>(fn: () => T) => runWithCodeReadAccess(false, fn, 'tenant-b');
    const upload = (await asTenantA(() =>
      handleCodebaseTool('holo_absorb_repo', {
        localCodebaseSnapshotReceipt: snapshotReceipt([TENANT_A_FILE], [uploadRoot]),
        outputFormat: 'stats',
      })
    )) as { error?: string };
    expect(upload.error, JSON.stringify(upload).slice(0, 300)).toBeUndefined();
    // Tenant A's semantic search starts a background warm over its upload...
    const building = (await asTenantA(() =>
      handleGraphRagTool('holo_semantic_search', { query: 'tenantAlphaPricingRule', topK: 3 })
    )) as { error?: string; warmJobId?: string };
    expect(building.error, JSON.stringify(building).slice(0, 300)).toBe('semantic_index_building');
    // ...tenant B's call evicts the upload while the warm runs...
    await asTenantB(() => handleCodebaseTool('holo_query_codebase', { query: 'find', symbol: 'x' }));
    // ...and the warm finishes afterwards.
    let warm: Record<string, unknown> = {};
    for (let i = 0; i < 200; i++) {
      warm = (await handleCodebaseTool('holo_get_absorb_status', {
        jobId: building.warmJobId,
      })) as Record<string, unknown>;
      if (['complete', 'error', 'cancelled'].includes(String(warm.status))) break;
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    expect(warm.status, JSON.stringify(warm).slice(0, 300)).toBe('complete');
    const other = await asTenantB(() =>
      handleGraphRagTool('holo_semantic_search', { query: 'tenantAlphaPricingRule', topK: 3 })
    );
    expect(JSON.stringify(other)).not.toContain('tenantAlphaPricingRule');
  }, 120_000);

  it("refuses a named root on an upload from a caller that may not name this server's folders", async () => {
    // Pre-existing on main (claude4's round 2 review): rootDir '.' or a
    // receipt's roots resolved against the server workspace and the upload was
    // published as that folder's cache, which every caller then reloaded from
    // disk without the owner tag, trusted through the uploader's own receipt.
    resetCodebaseToolStateForTests();
    resetGraphRAGStateForTests();
    const workspace = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-named-upload-workspace-'));
    isolatedAbsorbEnv(workspace);
    for (const named of [
      { rootDir: '.', sourceFiles: [TENANT_A_FILE] },
      { rootDirs: ['.'], sourceFiles: [TENANT_A_FILE] },
      { localCodebaseSnapshotReceipt: snapshotReceipt([TENANT_A_FILE], ['.']) },
    ]) {
      const refused = (await runWithCodeReadAccess(
        false,
        () => handleCodebaseTool('holo_absorb_repo', { ...named, outputFormat: 'stats' }),
        'tenant-a'
      )) as { error?: string };
      expect(refused.error, JSON.stringify(Object.keys(named))).toBe('upload_root_not_allowed');
    }
    // Nothing was published for the server's folder: another caller finds none of it.
    const other = await runWithCodeReadAccess(
      false,
      () =>
        handleCodebaseTool('holo_query_codebase', { query: 'symbols', filePath: TENANT_A_FILE.path }),
      'tenant-b'
    );
    expect(JSON.stringify(other)).not.toContain('tenantAlphaPricingRule');
    // The same upload without a root is accepted.
    const plain = (await runWithCodeReadAccess(
      false,
      () =>
        handleCodebaseTool('holo_absorb_repo', { sourceFiles: [TENANT_A_FILE], outputFormat: 'stats' }),
      'tenant-a'
    )) as { error?: string };
    expect(plain.error, JSON.stringify(plain).slice(0, 300)).toBeUndefined();
  }, 120_000);

  it('says a match on a definition whose file cannot be read could not be read, not that no line matched', async () => {
    await absorbFixture();
    // The file now sits outside the folders this server may read.
    process.env.ABSORB_ALLOWED_ROOTS = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-elsewhere-'));
    const matched = (await runWithCodeReadAccess(true, () =>
      handleCodebaseTool('holo_query_codebase', {
        query: 'source',
        symbolName: 'isCachedMapFresh',
        match: 'return',
      })
    )) as { count?: number; note?: string };
    expect(matched.count).toBe(0);
    expect(matched.note).toContain('could not be read');
    expect(matched.note).not.toContain('No line of');
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
