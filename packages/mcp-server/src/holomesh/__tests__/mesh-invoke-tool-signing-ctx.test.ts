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

    const res = await onTransport('stdio', () => invoke(manifest.id, target, undefined));

    expect(res.isError).toBeFalsy();
    expect(existsSync(target)).toBe(true);
  });

  // task mplw: off the stdio server "no signingCtx" is a call that lost its caller inside the
  // server, not the local user, so the target tool is checked against no scopes.
  it('over HTTP, no signingCtx is nobody: holo_write_file is refused and nothing is written', async () => {
    const manifest = publishLocalWriteFileManifest();
    const target = join(WORK, 'http-nobody.txt');

    const res = await onTransport('http', () => invoke(manifest.id, target, undefined));

    expect(existsSync(target)).toBe(false);
    expect(res.content?.[0]?.text ?? '').toMatch(/authorization denied|insufficient scope/i);
  });
});

/** Run `body` with HOLOSCRIPT_MCP_TRANSPORT set to `transport`, then restore it. */
async function onTransport<T>(transport: string, body: () => Promise<T>): Promise<T> {
  const saved = process.env.HOLOSCRIPT_MCP_TRANSPORT;
  process.env.HOLOSCRIPT_MCP_TRANSPORT = transport;
  try {
    return await body();
  } finally {
    if (saved === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
    else process.env.HOLOSCRIPT_MCP_TRANSPORT = saved;
  }
}

// claude2 (distinct seat, reviewing this exact vector) confirmed against production that
// gateSecretsBrokerTool's own "no signingCtx -> legacy ungated" branch also matches the
// synthetic stdio-local bridge context handleTool used to fabricate here, so a tools:write
// caller could reach holo_secrets_resolve (tools:admin, risk critical) the same way. Since
// this fix's authorization check runs generically off tool-scopes.ts -- the same map that
// already lists holo_secrets_resolve/grant/revoke at tools:admin -- it is refused before
// handleTool, defaultLocalInvoker's re-authorization, or gateSecretsBrokerTool's own gate
// ever see it, not because of anything secrets-specific.
describe('the same fix also covers the secrets broker (holo_secrets_resolve, critical risk)', () => {
  beforeEach(() => clearMeshToolRegistry());

  function publishLocalSecretsResolveManifest() {
    return publishMeshToolManifest(
      buildMeshToolManifest(
        {
          tool_name: 'holo_secrets_resolve',
          description: 'test manifest for holo_secrets_resolve',
          capability_tags: ['secrets', 'resolve'],
          allow_transitive_invocation: true,
        },
        publisher
      )
    );
  }

  it('a tools:write-only caller cannot reach holo_secrets_resolve through it', async () => {
    const manifest = publishLocalSecretsResolveManifest();
    const res = (await _handleSingleToolLogic(
      'holomesh_invoke_tool',
      { mesh_tool_id: manifest.id, args: { grantId: 'g1' }, allow_high_risk: true },
      TOOLS_WRITE_ONLY as never
    )) as { content?: Array<{ text?: string }>; isError?: boolean };
    const text = res.content?.[0]?.text ?? '';
    expect(text).toMatch(/authorization denied|insufficient scope/i);
  });
});
