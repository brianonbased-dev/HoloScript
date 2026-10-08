/**
 * The code-read gate through the server's real dispatchers (claude4's review of
 * claudecode/absorb-agent-brief, 2026-10-08): a customer key holding only
 * tools:codebase gets no source code from holo_query_codebase queryType
 * "source", an admin does, on both _handleSingleToolLogic (index.ts) and
 * handleTool (handlers.ts). Deleting either wrapper, or making it grant code to
 * everyone, turns this red; the predicate alone is covered in
 * security/__tests__/caller-may-read-code.test.ts.
 *
 * Two tenants (claude4's round 2 and round 3 reviews): one tenant's inline
 * sourceFiles upload never answers another tenant, through both dispatchers.
 * The dispatchers name the caller (callerPrincipal of the signing context);
 * dropping that argument makes every caller the same unnamed one, and this
 * turns red.
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { codeReadAllowed } from '@holoscript/absorb-service/mcp';
import { _handleSingleToolLogic } from '../index';
import { handleTool } from '../handlers';

const CODE_LINE = 'return headMatches && fingerprintMatches;';
type Ctx = Parameters<typeof _handleSingleToolLogic>[2];
const TENANT = {
  scopes: ['tools:codebase'],
  signer: 'tenant-under-test',
  signedRequest: false,
  signingValid: false,
} as unknown as Ctx;
const tenantCtx = (signer: string) =>
  ({
    scopes: ['tools:codebase'],
    signer,
    signedRequest: false,
    signingValid: false,
  }) as unknown as Ctx;
const TENANT_A = tenantCtx('tenant-a');
const TENANT_B = tenantCtx('tenant-b');
const TENANT_A_UPLOAD = {
  sourceFiles: [
    {
      path: 'src/tenantA.ts',
      content: 'export function tenantAlphaPricingRule(): number { return 42; }\n',
    },
  ],
  outputFormat: 'graph',
};
const ADMIN = {
  scopes: ['admin:*'],
  signer: 'admin-under-test',
  signedRequest: false,
  signingValid: false,
} as unknown as Ctx;

const saved = { ...process.env };

function text(response: unknown): string {
  if (typeof response === 'string') return response;
  const content = (response as { content?: Array<{ text?: string }> })?.content;
  return content ? content.map((c) => c.text ?? '').join('\n') : JSON.stringify(response);
}

const SOURCE_ARGS = {
  query: 'isCachedMapFresh',
  queryType: 'source',
  symbolName: 'isCachedMapFresh',
  detail: 'full',
};

describe('code-read gate through the server dispatch', () => {
  beforeAll(async () => {
    const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-gate-dispatch-repo-'));
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
      HOLOSCRIPT_MCP_TRANSPORT: 'http',
      HOLOSCRIPT_CACHE_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'holoscript-gate-dispatch-cache-')),
      HOLOSCRIPT_WORKSPACE_ROOT: repo,
      ABSORB_ALLOWED_ROOTS: repo,
      ABSORB_AUTO_BACKGROUND: '0',
      ABSORB_REQUIRE_ISOLATION: '0',
      ABSORB_MIN_SYSTEM_FREE_MB: '64',
    });
    const absorb = text(
      await _handleSingleToolLogic('holo_absorb_repo', { force: true, outputFormat: 'stats' }, ADMIN)
    );
    expect(absorb).not.toContain('"error"');
  }, 120_000);

  afterAll(() => {
    for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key];
    Object.assign(process.env, saved);
  });

  it('reads no code outside a decided call: the library default is "no"', () => {
    expect(codeReadAllowed()).toBe(false);
  });

  it('_handleSingleToolLogic: a tools:codebase key gets no code, an admin does', async () => {
    const tenant = text(await _handleSingleToolLogic('holo_query_codebase', SOURCE_ARGS, TENANT));
    expect(tenant).toContain('code_read_not_allowed');
    expect(tenant).not.toContain(CODE_LINE);
    const admin = text(await _handleSingleToolLogic('holo_query_codebase', SOURCE_ARGS, ADMIN));
    expect(admin).toContain(CODE_LINE);
  }, 60_000);

  it('handleTool: a tools:codebase key gets no code, an admin does', async () => {
    const tenant = text(await handleTool('holo_query_codebase', SOURCE_ARGS, TENANT));
    expect(tenant).toContain('code_read_not_allowed');
    expect(tenant).not.toContain(CODE_LINE);
    const admin = text(await handleTool('holo_query_codebase', SOURCE_ARGS, ADMIN));
    expect(admin).toContain(CODE_LINE);
  }, 60_000);

  it.each([
    ['_handleSingleToolLogic', _handleSingleToolLogic],
    ['handleTool', handleTool],
  ] as const)(
    "%s: one tenant's sourceFiles upload never answers another tenant; the uploader is",
    async (_label, dispatch) => {
      // The workspace gets a semantic index, so tenant B has a real answer to get.
      const absorb = text(
        await dispatch('holo_absorb_repo', { force: true, outputFormat: 'graph' }, ADMIN)
      );
      expect(absorb).not.toContain('"error"');

      const upload = text(await dispatch('holo_absorb_repo', TENANT_A_UPLOAD, TENANT_A));
      expect(upload).not.toContain('"error"');
      // Each answer is checked for what only the upload holds and the question
      // does not echo back: its file when asked by name, its symbol when asked by file.
      for (const [tool, args, leak] of [
        ['holo_semantic_search', { query: 'tenantAlphaPricingRule', topK: 3 }, 'tenantA.ts'],
        ['holo_query_codebase', { query: 'symbols' }, 'tenantA'],
        ['holo_query_codebase', { query: 'symbols', filePath: 'src/tenantA.ts' }, 'tenantAlpha'],
        ['holo_query_codebase', { query: 'find', symbol: 'tenantAlphaPricingRule' }, 'tenantA.ts'],
      ] as const) {
        const other = text(await dispatch(tool, { ...args }, TENANT_B));
        expect(other, `${tool} ${JSON.stringify(args)}`).not.toContain(leak);
      }

      // Tenant B's call evicted the upload; the uploader sends it again and is answered from it.
      const again = text(await dispatch('holo_absorb_repo', TENANT_A_UPLOAD, TENANT_A));
      expect(again).not.toContain('"error"');
      const own = text(
        await dispatch(
          'holo_semantic_search',
          { query: 'tenantAlphaPricingRule', topK: 3 },
          TENANT_A
        )
      );
      expect(own).toContain('tenantA.ts');
    },
    180_000
  );
});
