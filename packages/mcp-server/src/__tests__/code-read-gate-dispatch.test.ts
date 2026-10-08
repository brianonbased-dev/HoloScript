/**
 * The code-read gate through the server's real dispatchers (claude4's review of
 * claudecode/absorb-agent-brief, 2026-10-08): a customer key holding only
 * tools:codebase gets no source code from holo_query_codebase queryType
 * "source", an admin does, on both _handleSingleToolLogic (index.ts) and
 * handleTool (handlers.ts). Deleting either wrapper, or making it grant code to
 * everyone, turns this red; the predicate alone is covered in
 * security/__tests__/caller-may-read-code.test.ts.
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
});
