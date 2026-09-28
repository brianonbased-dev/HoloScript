/**
 * holomesh_invoke_tool must run the target tool as the REAL caller, not as trusted local
 * stdio (task_1790204588326_myvj).
 *
 * Before this fix: handleInvokeTool -> invokePublishedMeshTool -> defaultLocalInvoker never
 * received the caller's signingCtx (nothing in the chain accepted or forwarded it), so a
 * locally-published tool's re-entrant handleTool(name, args, undefined) call hit handlers.ts's
 * stdio-local admin bridge (any signingCtx-less call + HOLOSCRIPT_API_KEY set = admin:*) and,
 * on top of that, handleTool never checks scope itself -- Gate 2 runs once, at the HTTP layer,
 * against the OUTER tool name (holomesh_invoke_tool, which needs only tools:write). A caller
 * with tools:write alone could therefore run any locally-published tool -- including one
 * needing tools:admin -- at full trust.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const WORK = mkdtempSync(join(tmpdir(), 'mesh-invoke-signing-ctx-'));
afterEach(() => rmSync(WORK, { recursive: true, force: true }));

const { _handleSingleToolLogic } = await import('../../index');
const { buildMeshToolManifest, clearMeshToolRegistry, publishMeshToolManifest } = await import(
  '../mesh-tool-registry'
);

const publisher = { agentId: 'agent_test_publisher', name: 'test-publisher' };
const TOOLS_WRITE_ONLY = { signedRequest: true, signingValid: true, signer: 'attacker', scopes: ['tools:write'] };
const ADMIN = { signedRequest: true, signingValid: true, signer: 'owner-agent', scopes: ['admin:*'] };

function publishLocalWriteFileManifest() {
  return publishMeshToolManifest(
    buildMeshToolManifest(
      {
        tool_name: 'holo_write_file',
        description: 'test manifest for holo_write_file',
        capability_tags: ['write', 'file'],
        allow_transitive_invocation: true,
      },
      publisher
    )
  );
}

async function invoke(manifestId: string, target: string, signingCtx: unknown) {
  return (await _handleSingleToolLogic(
    'holomesh_invoke_tool',
    { mesh_tool_id: manifestId, args: { filePath: target, content: 'PLANTED-VIA-MESH-INVOKE' }, allow_high_risk: true },
    signingCtx as never
  )) as { content?: Array<{ text?: string }>; isError?: boolean };
}

describe('holomesh_invoke_tool runs the target tool as the real caller', () => {
  beforeEach(() => clearMeshToolRegistry());

  it('a tools:write-only caller cannot reach holo_write_file (which needs tools:admin) through it', async () => {
    const manifest = publishLocalWriteFileManifest();
    const target = join(WORK, 'planted.txt');

    const res = await invoke(manifest.id, target, TOOLS_WRITE_ONLY);

    expect(existsSync(target)).toBe(false);
    const text = res.content?.[0]?.text ?? '';
    expect(text).toMatch(/authorization denied|insufficient scope/i);
  });

  it('control: an admin-scoped caller still reaches it, and the file is written', async () => {
    const manifest = publishLocalWriteFileManifest();
    const target = join(WORK, 'admin-wrote.txt');

    const res = await invoke(manifest.id, target, ADMIN);

    expect(res.isError).toBeFalsy();
    expect(existsSync(target)).toBe(true);
    expect(readFileSync(target, 'utf8')).toContain('PLANTED-VIA-MESH-INVOKE');
  });

  it('keeps local trust: no signingCtx at all (genuine stdio) still reaches it', async () => {
    const manifest = publishLocalWriteFileManifest();
    const target = join(WORK, 'stdio-wrote.txt');

    const res = await invoke(manifest.id, target, undefined);

    expect(res.isError).toBeFalsy();
    expect(existsSync(target)).toBe(true);
  });
});
