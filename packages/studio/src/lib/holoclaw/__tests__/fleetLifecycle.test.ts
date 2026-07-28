/**
 * Tests for the HoloClaw fleet lifecycle helper.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  registerHoloClawFleetAgent,
  deregisterHoloClawFleetAgent,
  isFleetRegistrationEnabled,
  type FleetRegistration,
} from '../fleetLifecycle';

const BASE = 'https://mcp.holoscript.net';
const TEAM = 'team_1777834718247_unr35n';

function ok(body: unknown = { ok: true }): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('isFleetRegistrationEnabled', () => {
  afterEach(() => {
    delete process.env.HOLOCLAW_FLEET_REGISTER;
  });

  it('defaults to enabled', () => {
    expect(isFleetRegistrationEnabled()).toBe(true);
  });

  it('is disabled when HOLOCLAW_FLEET_REGISTER=false', () => {
    process.env.HOLOCLAW_FLEET_REGISTER = 'false';
    expect(isFleetRegistrationEnabled()).toBe(false);
  });
});

describe('registerHoloClawFleetAgent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    delete process.env.HOLOCLAW_FLEET_REGISTER;
  });

  it('returns null when fleet registration is disabled', async () => {
    process.env.HOLOCLAW_FLEET_REGISTER = 'false';
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const reg = await registerHoloClawFleetAgent('research');
    expect(reg).toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('registers with skills:[name] and opens a presence heartbeat', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      calls.push({ url: String(url), init: init as RequestInit });
      return Promise.resolve(ok());
    });

    // Pass an explicit teamId so this assertion is hermetic: the module-level
    // DEFAULT_TEAM_ID captures process.env.HOLOMESH_TEAM_ID at import time, which
    // varies by machine/CI. The default-resolution path lives in the code; the
    // explicit-teamId round-trip is asserted here and in the dedicated test below.
    const reg = await registerHoloClawFleetAgent('research', { teamId: TEAM });
    expect(reg).not.toBeNull();
    expect(reg!.registered).toBe(true);
    expect(reg!.presence).toBe(true);
    expect(reg!.handle).toBe('holoclaw-research');
    expect(reg!.teamId).toBe(TEAM);
    expect(reg!.agentId).toMatch(/^holoclaw-research-[0-9a-f]{8}$/);

    // First call: fleet registry POST with skills:[research]
    expect(calls[0].url).toBe(`${BASE}/api/holomesh/agents/fleet`);
    expect(calls[0].init.method).toBe('POST');
    const regBody = JSON.parse(calls[0].init.body as string);
    expect(regBody.skills).toEqual(['research']);
    expect(regBody.name).toBe('holoclaw-research');
    expect(regBody.id).toBe(reg!.agentId);
    expect(typeof regBody.publicKey).toBe('string');

    // Second call: presence heartbeat POST
    expect(calls[1].url).toBe(`${BASE}/api/holomesh/team/${TEAM}/heartbeat`);
    expect(calls[1].init.method).toBe('POST');
    const hbBody = JSON.parse(calls[1].init.body as string);
    expect(hbBody).toEqual({
      agentId: reg!.agentId,
      agentName: 'holoclaw-research',
      role: 'member',
    });
  });

  it('treats a 404 fleet registry as soft-registered and still heartbeats', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      if (String(url).endsWith('/api/holomesh/agents/fleet')) {
        return Promise.resolve(new Response('not found', { status: 404 }));
      }
      return Promise.resolve(ok());
    });

    const reg = await registerHoloClawFleetAgent('self-improve');
    expect(reg!.registered).toBe(true); // 404 == soft-registered
    expect(reg!.presence).toBe(true);
  });

  it('never throws on fetch rejection; reports flags false', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('network down'));
    const reg = await registerHoloClawFleetAgent('research');
    expect(reg).not.toBeNull();
    expect(reg!.registered).toBe(false);
    expect(reg!.presence).toBe(false);
  });

  it('honors an explicit teamId', async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url) => {
      calls.push(String(url));
      return Promise.resolve(ok());
    });
    const reg = await registerHoloClawFleetAgent('research', { teamId: 'team-42' });
    expect(reg!.teamId).toBe('team-42');
    expect(calls[1]).toBe(`${BASE}/api/holomesh/team/team-42/heartbeat`);
  });
});

describe('deregisterHoloClawFleetAgent', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const reg: FleetRegistration = {
    agentId: 'holoclaw-research-deadbeef',
    teamId: TEAM,
    handle: 'holoclaw-research',
    registered: true,
    presence: true,
  };

  it('closes presence then deregisters the fleet record', async () => {
    const calls: Array<{ url: string; method: string | undefined }> = [];
    vi.spyOn(globalThis, 'fetch').mockImplementation((url, init) => {
      calls.push({ url: String(url), method: (init as RequestInit)?.method });
      return Promise.resolve(ok());
    });

    await deregisterHoloClawFleetAgent(reg, null, 'skill_exit');

    expect(calls[0].url).toBe(`${BASE}/api/holomesh/team/${TEAM}/heartbeat`);
    expect(calls[0].method).toBe('DELETE');
    expect(calls[1].url).toBe(`${BASE}/api/holomesh/agents/fleet/${reg.agentId}`);
    expect(calls[1].method).toBe('DELETE');
  });

  it('never throws when upstream is unreachable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('boom'));
    await expect(deregisterHoloClawFleetAgent(reg)).resolves.toBeUndefined();
  });
});
