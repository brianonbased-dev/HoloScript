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
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// SEAL THE PROCESS BEFORE index.ts LOADS. Importing it runs utils/load-env.ts, which reads
// ~/.ai-ecosystem/.env and, on the laptop, asks the vault host for keys over ssh. claude3's
// review of #474 (2026-10-04) watched an unsealed run of this file resolve a real orchestrator
// key and attempt a live full-profile submit from the stdio control; it failed only because a
// host name did not resolve. Deleting the key variables AFTER the import (as this file did) was
// too late. Nothing here may reach a .env, the vault, a database or the real orchestrator.
const ORCHESTRATOR_ENV_KEYS = [
  'HOLOSCRIPT_ORCHESTRATOR_API_KEY',
  'MCP_ORCHESTRATOR_API_KEY',
  'ORCHESTRATOR_API_KEY',
  'MCP_API_KEY',
  'HOLOSCRIPT_API_KEY',
  'HOLOSCRIPT_MCP_API_KEY',
  'HOLOMESH_API_KEY',
] as const;
const SEALED: Record<string, string | undefined> = {
  HOLOMESH_NO_DOTENV: '1', // load-env.ts reads no .env and hydrates nothing from the vault
  HOLOKEYD_HOST: '', // and a resolver that ignored that flag would find no vault host
  HOLOKEY_STORE_PATH: undefined,
  DATABASE_URL: undefined,
  // RFC 2606 reserves .invalid: it never resolves, so even an unmocked fetch reaches nothing.
  MCP_ORCHESTRATOR_URL: 'https://orchestrator.invalid',
  ...Object.fromEntries(ORCHESTRATOR_ENV_KEYS.map((key) => [key, undefined])),
};
const savedEnv: Record<string, string | undefined> = {};
for (const key of [
  ...Object.keys(SEALED),
  'HOLOSCRIPT_MCP_TRANSPORT',
  'HOLOMESH_BOARD_BIND_SIGNER',
  'HOLOMESH_DATA_DIR',
]) {
  savedEnv[key] = process.env[key];
}
for (const [key, value] of Object.entries(SEALED)) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

// Every fetch fails here, and is recorded: a refused call must make no orchestrator call at all.
const fetchCalls: string[] = [];
vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
  fetchCalls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  throw new Error('the network is sealed in no-caller-principal.test.ts');
});
const orchestratorCalls = () => fetchCalls.filter((url) => url.includes('/gpu/'));

// daemon-emergence-store reads HOLOMESH_DATA_DIR once, at module load, so pin it before index.ts
// (which loads the daimōn tools) is imported. Nothing here may write to the real corpus.
const TEMP_DATA_DIR = mkdtempSync(join(tmpdir(), 'no-caller-principal-'));
process.env.HOLOMESH_DATA_DIR = TEMP_DATA_DIR;

const { _handleSingleToolLogic } = await import('../index');
const { handleDaemonLifecycleTool } = await import('../daemon-lifecycle-tools');
const { handleTool } = await import('../handlers');
const { callerPrincipal, NO_CALLER_PRINCIPAL } = await import('../security/tool-scopes');
const { publicAnonymousContext } = await import('../holomesh/identity/signing-middleware');
const { resetSubmitLedger, handleHoloCiTool } = await import('../holo-ci-tools');

beforeEach(() => {
  fetchCalls.length = 0;
  resetSubmitLedger();
});

afterEach(() => {
  for (const key of ['HOLOSCRIPT_MCP_TRANSPORT', 'HOLOMESH_BOARD_BIND_SIGNER']) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

afterAll(() => {
  vi.restoreAllMocks();
  for (const [key, value] of Object.entries(savedEnv)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
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

  // Since #407, dispatch checks the caller's scopes for every tool, so a hosted call with no caller
  // (no scopes) or the anonymous caller (tools:read) is refused before holo_ci_dispatch runs. The
  // tool's own no-caller check (#474) stays behind it; the second test calls the tool directly.
  it('a hosted call with no caller, or the anonymous caller, is refused before the tool runs', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    for (const args of [fullSubmit(), { sha: 'b'.repeat(40), profile: 'quick', dryRun: false }, { sha: 'b'.repeat(40), profile: 'quick' }]) {
      for (const ctx of [undefined, publicAnonymousContext()]) {
        const refused = await _handleSingleToolLogic('holo_ci_dispatch', args, ctx);
        expect((refused as { isError?: boolean }).isError).toBe(true);
        expect(String(payloadOf(refused).error)).toMatch(/authorization denied/);
      }
    }
    expect(orchestratorCalls()).toEqual([]);
  });

  it("behind dispatch, the tool's own check still gives nobody no tier and no spend, not even the quick profile", async () => {
    // The restricted tier left one quick submit a day, in ONE bucket every no-caller call
    // shared, so the spend belonged to no one (claude3's review of #474).
    const full = (await handleHoloCiTool('holo_ci_dispatch', fullSubmit(), NO_CALLER_PRINCIPAL)) as Record<string, unknown>;
    expect(full.ok).toBe(false);
    expect(full.tierDenied).toBe(true);
    const quick = (await handleHoloCiTool(
      'holo_ci_dispatch',
      { sha: 'b'.repeat(40), profile: 'quick', dryRun: false },
      NO_CALLER_PRINCIPAL
    )) as Record<string, unknown>;
    expect(quick.ok).toBe(false);
    expect(quick.noCaller).toBe(true);
    expect(quick.dryRunPreview).toBeTruthy();
    // A preview, asked of the tool itself, still works for nobody and spends nothing.
    const preview = (await handleHoloCiTool(
      'holo_ci_dispatch',
      { sha: 'b'.repeat(40), profile: 'quick' },
      NO_CALLER_PRINCIPAL
    )) as Record<string, unknown>;
    expect(preview.dryRun).toBe(true);
    expect(orchestratorCalls()).toEqual([]);
  });

  it('the local stdio user still passes the spend check and stops only at the missing key', async () => {
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const local = payloadOf(await _handleSingleToolLogic('holo_ci_dispatch', fullSubmit()));
    expect(local.tierDenied).toBeUndefined();
    expect(String(local.error)).toMatch(/not provisioned/i);
    // The sealed environment holds no key, so even the trusted path reached no orchestrator.
    expect(orchestratorCalls()).toEqual([]);
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

    // Refused at dispatch (no scopes, #407) or, past it, by the daimōn binding (#474).
    const unnamed = await _handleSingleToolLogic(
      'holo_update_daemon_ritual',
      update('mplw-ritual-registry')
    );
    expect((unnamed as { isError?: boolean }).isError).toBe(true);
    expect(String(payloadOf(unnamed).error)).toMatch(/authorization denied|needs a caller/);

    const posing = await _handleSingleToolLogic(
      'holo_update_daemon_ritual',
      update('mplw-ritual-registry', 'owner-mplw')
    );
    expect((posing as { isError?: boolean }).isError).toBe(true);
    expect(String(payloadOf(posing).error)).toMatch(/authorization denied|needs a caller/);

    // Behind dispatch, the binding itself still refuses nobody, named owner or not.
    for (const args of [update('mplw-ritual-registry'), update('mplw-ritual-registry', 'owner-mplw')]) {
      await expect(handleDaemonLifecycleTool('holo_update_daemon_ritual', args, { signer: NO_CALLER_PRINCIPAL }))
        .rejects.toThrow(/needs a caller/);
    }

    const anonymous = await _handleSingleToolLogic(
      'holo_update_daemon_ritual',
      update('mplw-ritual-registry'),
      publicAnonymousContext()
    );
    expect((anonymous as { isError?: boolean }).isError).toBe(true);
  });

  it('nobody cannot create, feed or speak for a daimōn, even one "owned" by nobody', async () => {
    // claude3's review of #474: one caller with no principal created a daimōn owned by
    // holoscript-mcp:no-caller, and a different one then rewrote it. Nobody is no owner.
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
    const calls: Array<[string, Record<string, unknown>]> = [
      ['holo_create_daemon', { ownerId: NO_CALLER_PRINCIPAL, daemonId: 'mplw-nobody' }],
      ['holo_create_daemon', { ownerId: 'owner-mplw', daemonId: 'mplw-nobody-2' }],
      ['holo_observe_soul', { ownerId: NO_CALLER_PRINCIPAL, delta: { kind: 'note', text: 'x' } }],
      ['holo_update_daemon_ritual', update(`daemon-${NO_CALLER_PRINCIPAL}`)],
      ['holo_daemon_turn', { daemonId: `daemon-${NO_CALLER_PRINCIPAL}`, message: 'hi' }],
      ['holo_daemon_emergence_check', { ownerId: NO_CALLER_PRINCIPAL }],
    ];
    for (const [tool, args] of calls) {
      for (const ctx of [undefined, publicAnonymousContext()]) {
        const refused = await _handleSingleToolLogic(tool, { ...args }, ctx);
        expect((refused as { isError?: boolean }).isError, tool).toBe(true);
        expect(String(payloadOf(refused).error), tool).toMatch(/authorization denied|needs a caller/);
      }
      // Behind dispatch (#407), the binding (#474) still refuses nobody.
      await expect(handleDaemonLifecycleTool(tool, { ...args }, { signer: NO_CALLER_PRINCIPAL }), tool)
        .rejects.toThrow(/needs a caller/);
    }
    // Reads: on the hosted server nobody holds no scope, so dispatch refuses even a list; the
    // stdio user lists, and nobody owns nothing.
    const hostedList = await _handleSingleToolLogic('holo_list_daemons', {});
    expect((hostedList as { isError?: boolean }).isError).toBe(true);
    process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
    const listed = await _handleSingleToolLogic('holo_list_daemons', {});
    expect((listed as { isError?: boolean }).isError).not.toBe(true);
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
