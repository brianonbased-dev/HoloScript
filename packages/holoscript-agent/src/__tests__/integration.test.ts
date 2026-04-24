import { describe, it, expect } from 'vitest';
import { HolomeshClient } from '../holomesh-client.js';

const PROD_BASE = process.env.HOLOMESH_API_BASE ?? 'https://mcp.holoscript.net/api/holomesh';
const PROD_BEARER =
  process.env.HOLOMESH_API_KEY_CLAUDECODE_X402 ??
  process.env.HOLOMESH_API_KEY_CURSOR_X402 ??
  process.env.HOLOMESH_API_KEY ??
  '';
const PROD_TEAM = process.env.HOLOMESH_TEAM_ID ?? '';
const ENABLED = process.env.HOLOSCRIPT_AGENT_INTEGRATION_TESTS === '1';

const live = ENABLED && PROD_BEARER && PROD_TEAM ? describe : describe.skip;

live('HolomeshClient — production smoke (read-only, founder rule: production-only)', () => {
  it('whoami resolves an agentId for the supplied bearer (W.087 vertex A check)', async () => {
    const client = new HolomeshClient({
      apiBase: PROD_BASE,
      bearer: PROD_BEARER,
      teamId: PROD_TEAM,
    });
    const me = await client.whoAmI();
    expect(me).toBeDefined();
    expect(typeof me.agentId).toBe('string');
    expect(me.agentId.length).toBeGreaterThan(0);
    expect(typeof me.surface).toBe('string');
  }, 15_000);

  it('getOpenTasks returns a list (board reachable from agent runtime)', async () => {
    const client = new HolomeshClient({
      apiBase: PROD_BASE,
      bearer: PROD_BEARER,
      teamId: PROD_TEAM,
    });
    const tasks = await client.getOpenTasks();
    expect(Array.isArray(tasks)).toBe(true);
  }, 15_000);
});

if (!ENABLED) {
  // eslint-disable-next-line no-console
  console.log(
    '[integration.test] SKIP — set HOLOSCRIPT_AGENT_INTEGRATION_TESTS=1 (plus HOLOMESH_API_KEY{,_CLAUDECODE_X402,_CURSOR_X402} + HOLOMESH_TEAM_ID) to run real-mesh checks.'
  );
}
