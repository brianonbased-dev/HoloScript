/**
 * A call with no caller is the local user only on the stdio server (task mplw). Everywhere a
 * binding used "no signer" to mean "local trust", a hosted call with no caller now carries
 * NO_CALLER_PRINCIPAL instead: the board's agent stamp, the daimōn owner binding and the CI spend
 * identity. These tests drive the real dispatch paths (the index.ts registry and handleTool), so
 * they fail if a path goes back to reading the raw signer.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';

// daemon-emergence-store reads HOLOMESH_DATA_DIR once, at module load, so pin it before index.ts
// (which loads the daimōn tools) is imported. Nothing here may write to the real corpus.
const TEMP_DATA_DIR = mkdtempSync(join(tmpdir(), 'no-caller-principal-'));
const PREVIOUS_DATA_DIR = process.env.HOLOMESH_DATA_DIR;
process.env.HOLOMESH_DATA_DIR = TEMP_DATA_DIR;

const { _handleSingleToolLogic } = await import('../index');
const { handleTool } = await import('../handlers');
const { callerPrincipal, NO_CALLER_PRINCIPAL } = await import('../security/tool-scopes');
const { publicAnonymousContext } = await import('../holomesh/identity/signing-middleware');

// Without an orchestrator key nothing can reach the GPU fleet, even if a spend check wrongly passed.
const ORCHESTRATOR_ENV_KEYS = [
  'HOLOSCRIPT_ORCHESTRATOR_API_KEY',
  'MCP_ORCHESTRATOR_API_KEY',
  'ORCHESTRATOR_API_KEY',
  'MCP_API_KEY',
  'HOLOSCRIPT_API_KEY',
  'HOLOSCRIPT_MCP_API_KEY',
  'HOLOMESH_API_KEY',
] as const;
const savedEnv: Record<string, string | undefined> = {};
for (const key of [
  ...ORCHESTRATOR_ENV_KEYS,
  'HOLOSCRIPT_MCP_TRANSPORT',
  'HOLOMESH_BOARD_BIND_SIGNER',
]) {
  savedEnv[key] = process.env[key];
}
for (const key of ORCHESTRATOR_ENV_KEYS) delete process.env[key];

afterEach(() => {
  for (const key of ['HOLOSCRIPT_MCP_TRANSPORT', 'HOLOMESH_BOARD_BIND_SIGNER']) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

afterAll(() => {
  for (const key of ORCHESTRATOR_ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  if (PREVIOUS_DATA_DIR === undefined) delete process.env.HOLOMESH_DATA_DIR;
  else process.env.HOLOMESH_DATA_DIR = PREVIOUS_DATA_DIR;
  rmSync(TEMP_DATA_DIR, { recursive: true, force: true });
});

function payloadOf(response: unknown): Record<string, unknown> {
  const text = (response as { content: Array<{ text: string }> }).content[0].text;
  return JSON.parse(text) as Record<string, unknown>;
}

describe('callerPrincipal', () => {
  it('is undefined only for the local stdio user', () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    expect(callerPrincipal(undefined)).toBeUndefined();
    expect(callerPrincipal({ signer: 'stdio-local' })).toBeUndefined();
    // A context with no signer is not the local user, even on stdio.
    expect(callerPrincipal({ signer: null })).toBe(NO_CALLER_PRINCIPAL);
    expect(callerPrincipal({ signer: '' })).toBe(NO_CALLER_PRINCIPAL);
    expect(callerPrincipal({ signer: 'agent-7' })).toBe('agent-7');

    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    expect(callerPrincipal(undefined)).toBe(NO_CALLER_PRINCIPAL);
    expect(callerPrincipal(publicAnonymousContext())).toBe(NO_CALLER_PRINCIPAL);
    // The bridge only exists on stdio; a stray one elsewhere is nobody.
    expect(callerPrincipal({ signer: 'stdio-local' })).toBe(NO_CALLER_PRINCIPAL);
    expect(callerPrincipal({ signer: 'agent-7' })).toBe('agent-7');

    delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
    expect(callerPrincipal(undefined)).toBe(NO_CALLER_PRINCIPAL);
  });
});

describe('holo_ci_dispatch through the registry', () => {
  const fullSubmit = () => ({ sha: 'a'.repeat(40), profile: 'full', dryRun: false });

  it('a hosted call with no caller, or the anonymous caller, meets the restricted tier', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    const contextless = payloadOf(await _handleSingleToolLogic('holo_ci_dispatch', fullSubmit()));
    expect(contextless.ok).toBe(false);
    expect(contextless.tierDenied).toBe(true);

    const anonymous = payloadOf(
      await _handleSingleToolLogic('holo_ci_dispatch', fullSubmit(), publicAnonymousContext())
    );
    expect(anonymous.ok).toBe(false);
    expect(anonymous.tierDenied).toBe(true);
  });

  it('the local stdio user still passes the spend check and stops only at the missing key', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const local = payloadOf(await _handleSingleToolLogic('holo_ci_dispatch', fullSubmit()));
    expect(local.tierDenied).toBeUndefined();
    expect(String(local.error)).toMatch(/not provisioned/i);
  });
});

describe("a daimōn's rituals, through the registry and through handleTool", () => {
  const ritual = {
    name: 'dawn',
    trigger: 'cron:0 6 * * *',
    description: 'Dawn note',
    enabled: true,
  };
  const update = (profileId: string, callerId?: string) => ({
    profileId,
    operation: 'add',
    rituals: [ritual],
    ...(callerId === undefined ? {} : { callerId }),
  });

  async function createOwned(daemonId: string): Promise<void> {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const created = await _handleSingleToolLogic('holo_create_daemon', {
      ownerId: 'owner-mplw',
      daemonId,
    });
    expect((created as { isError?: boolean }).isError).not.toBe(true);
  }

  it('a hosted call with no caller cannot rewrite them, named owner or not', async () => {
    await createOwned('mplw-ritual-registry');
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';

    const unnamed = await _handleSingleToolLogic(
      'holo_update_daemon_ritual',
      update('mplw-ritual-registry')
    );
    expect((unnamed as { isError?: boolean }).isError).toBe(true);
    expect(String(payloadOf(unnamed).error)).toMatch(/Unauthorized daemon access/);

    const posing = await _handleSingleToolLogic(
      'holo_update_daemon_ritual',
      update('mplw-ritual-registry', 'owner-mplw')
    );
    expect((posing as { isError?: boolean }).isError).toBe(true);
    expect(String(payloadOf(posing).error)).toMatch(/not bound to the authenticated principal/);

    const anonymous = await _handleSingleToolLogic(
      'holo_update_daemon_ritual',
      update('mplw-ritual-registry'),
      publicAnonymousContext()
    );
    expect((anonymous as { isError?: boolean }).isError).toBe(true);
  });

  it('handleTool has no daimōn path of its own, so it cannot skip the binding', async () => {
    await createOwned('mplw-ritual-handler');
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    await expect(
      handleTool('holo_update_daemon_ritual', update('mplw-ritual-handler'))
    ).rejects.toThrow(/Unknown graph tool/);

    // Read back as the owner (local trust on stdio): the profile is there and the ritual is not.
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const read = payloadOf(
      await _handleSingleToolLogic('holo_get_daemon', {
        daemonId: 'mplw-ritual-handler',
        callerId: 'owner-mplw',
      })
    );
    const rituals = (read.profile as { style: { rituals: Array<{ name: string }> } }).style.rituals;
    expect(rituals.map((r) => r.name)).not.toContain('dawn');
  });

  it('the local stdio user keeps local trust', async () => {
    await createOwned('mplw-ritual-local');
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const local = await _handleSingleToolLogic(
      'holo_update_daemon_ritual',
      update('mplw-ritual-local')
    );
    expect((local as { isError?: boolean }).isError).not.toBe(true);
    const profile = payloadOf(local).profile as { style: { rituals: Array<{ name: string }> } };
    expect(profile.style.rituals.map((r) => r.name)).toContain('dawn');
  });
});

describe('the board agent stamp on handleTool', () => {
  // No team_id: every case stops before any network call.
  const claimAs = (agentId?: string): Record<string, unknown> => ({
    task_id: 'task-mplw',
    ...(agentId === undefined ? {} : { agent_id: agentId }),
  });

  it('a hosted call with no caller is stamped, and cannot claim as a named agent under the bind flag', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    process.env.HOLOMESH_BOARD_BIND_SIGNER = '1';

    const posing = claimAs('claude1');
    expect(await handleTool('holomesh_board_claim', posing)).toEqual({
      error: 'agent-id-not-bound-to-caller',
    });
    expect(posing.__authAgentId).toBe(NO_CALLER_PRINCIPAL);

    const unnamed = claimAs();
    expect(await handleTool('holomesh_board_claim', unnamed)).toEqual({
      error: '"team_id" is required.',
    });
    expect(unnamed.__authAgentId).toBe(NO_CALLER_PRINCIPAL);
  });

  it('the local stdio user is not stamped and keeps local trust', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    process.env.HOLOMESH_BOARD_BIND_SIGNER = '1';
    const local = claimAs('claude1');
    expect(await handleTool('holomesh_board_claim', local)).toEqual({
      error: '"team_id" is required.',
    });
    expect(local.__authAgentId).toBeUndefined();
  });
});
