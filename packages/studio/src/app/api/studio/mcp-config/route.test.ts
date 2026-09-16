/**
 * Doors audit 2026-09-15: GET /api/studio/mcp-config.
 *
 * This endpoint is how an outside agent learns to wire itself to us. It handed
 * out the gateway URL in four formats with no credential guidance at all, so an
 * agent that followed it exactly sent no key and met a refusal it could not
 * diagnose — the silent lock-out half of "every door fails closed".
 *
 * Naming the wrong header would be worse than naming none, so these cases pin
 * the header the upstream actually reads.
 */
import { describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';

import { GET } from './route';

const MESH_KEY_HEADER = 'x-mcp-api-key';
const TEST_ORIGIN = 'https://studio.test';

type ServerEntry = { url?: string; headers?: Record<string, string> };
type ConfigBody = {
  authentication?: { header?: string; required?: boolean; how?: string };
  servers?: Array<{ name?: string; auth?: { header?: string; required?: boolean } }>;
  mcpServers?: Record<string, ServerEntry>;
  instructions?: string;
};

function get(format?: string) {
  const url = format
    ? `${TEST_ORIGIN}/api/studio/mcp-config?format=${format}`
    : `${TEST_ORIGIN}/api/studio/mcp-config`;
  return GET(new NextRequest(url));
}

describe('GET /api/studio/mcp-config — what an agent is told to send', () => {
  it.each(['capabilities', 'claude', 'cursor', 'generic'])(
    "the %s format names the header that carries the agent's own key",
    async (format) => {
      const body = (await (await get(format)).json()) as ConfigBody;

      expect(JSON.stringify(body)).toContain(MESH_KEY_HEADER);
    }
  );

  it('states the credential as required, in the header the upstream reads', async () => {
    const body = (await (await get('capabilities')).json()) as ConfigBody;

    expect(body.authentication?.header).toBe(MESH_KEY_HEADER);
    expect(body.authentication?.required).toBe(true);
    expect(body.authentication?.how).toContain(MESH_KEY_HEADER);
  });

  it('marks every advertised server as needing that credential', async () => {
    const body = (await (await get('capabilities')).json()) as ConfigBody;

    expect(body.servers?.length).toBeGreaterThan(0);
    for (const server of body.servers ?? []) {
      expect(server.auth?.header).toBe(MESH_KEY_HEADER);
      expect(server.auth?.required).toBe(true);
    }
  });

  it.each(['claude', 'cursor'])(
    'the %s preset ships the header inside the block it tells you to paste',
    async (format) => {
      const body = (await (await get(format)).json()) as ConfigBody;
      const entries = Object.values(body.mcpServers ?? {});

      expect(entries.length).toBeGreaterThan(0);
      for (const entry of entries) {
        expect(entry.headers?.[MESH_KEY_HEADER]).toBeDefined();
      }
      expect(body.instructions).toContain('your own key');
    }
  );

  it('states that the Studio tool-call entry is not answering yet', async () => {
    const body = (await (await get('capabilities')).json()) as {
      known_issues?: Array<{ endpoint?: string; answering?: boolean }>;
    };

    const issue = body.known_issues?.find((entry) => entry.endpoint === 'POST /api/mcp/call');
    expect(issue).toBeDefined();
    expect(issue?.answering).toBe(false);
  });

  it.each(['claude', 'cursor'])(
    'the %s preset carries that warning inside the block it tells you to paste',
    async (format) => {
      const body = (await (await get(format)).json()) as {
        mcpServers?: Record<string, { note?: string }>;
      };

      // An agent reads the block it is about to paste; that is where a dead
      // entry has to be named, not only in a list it may never scroll to.
      expect(body.mcpServers?.['holoscript-studio']?.note).toBeTruthy();
    }
  );
});
