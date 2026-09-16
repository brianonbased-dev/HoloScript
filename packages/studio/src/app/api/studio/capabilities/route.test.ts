/**
 * GET /api/studio/capabilities — what an agent is told, and whether it can read it.
 *
 * Two failures, weighted the same. This endpoint advertised the tool gateway
 * with no credential at all, so an agent wired itself up exactly as told and met
 * a refusal it could not diagnose. And it offered a health check on the WRONG
 * service: the gateway forwards to ENDPOINTS.MCP_ORCHESTRATOR, while
 * mcp.holoscript.net is the mesh tools server — that host can be green while
 * this gateway is not answering, which is the state today.
 *
 * The tier is part of the behaviour, so it is asserted here too. After the /api
 * default was flipped closed, this path classified `session` while the PUBLIC
 * /api/docs body advertised it — the one document an agent can read pointing at
 * an endpoint that answers 401.
 */
import { describe, expect, it } from 'vitest';

import { GET } from './route';
import { classifyApiPath } from '@/lib/api-public-paths';

const MESH_KEY_HEADER = 'x-mcp-api-key';

type CapabilitiesBody = {
  access?: Record<string, string>;
  authentication?: { header?: string; required?: boolean; how?: string };
  known_issues?: Array<{ endpoint?: string; answering?: boolean; what_happens?: string }>;
};

async function body(): Promise<CapabilitiesBody> {
  return (await (await GET()).json()) as CapabilitiesBody;
}

describe('GET /api/studio/capabilities — the credential it names', () => {
  it('names the header the upstream actually reads, and marks it required', async () => {
    const payload = await body();

    expect(payload.authentication?.header).toBe(MESH_KEY_HEADER);
    expect(payload.authentication?.required).toBe(true);
    expect(payload.authentication?.how).toContain(MESH_KEY_HEADER);
  });

  it('names that header beside the gateway URL itself', async () => {
    // An agent reads `access.mcp` and wires itself from that one line; a
    // credential named only in a sibling block is a credential it never sees.
    const payload = await body();

    expect(payload.access?.['mcp']).toContain('/api/mcp/call');
    expect(payload.access?.['mcp']).toContain(MESH_KEY_HEADER);
  });

  it('no longer sends an agent to verify this gateway at a different service', async () => {
    const payload = await body();
    const mcp = payload.access?.['mcp'] ?? '';

    // The exact claim that was wrong. mcp.holoscript.net is the mesh tools
    // server, not this gateway; its health says nothing about this route.
    expect(mcp).not.toContain('verify live via mcp.holoscript.net/health');
  });

  it('says the advertised gateway is not answering, rather than leaving it to be discovered', async () => {
    const payload = await body();
    const gateway = payload.known_issues?.find((issue) => issue.endpoint?.includes('/api/mcp/call'));

    expect(gateway).toBeDefined();
    expect(gateway?.answering).toBe(false);
  });

  it('tells an agent that quickstart needs a session, since these two do not', async () => {
    const payload = await body();

    expect(payload.access?.['quickstart']).toContain('session');
  });
});

describe('GET /api/studio/capabilities — who may read it', () => {
  it('is readable with no credential, like the /api/docs that advertises it', () => {
    expect(classifyApiPath('/api/studio/capabilities', 'GET')).toBe('public');
    expect(classifyApiPath('/api/studio/mcp-config', 'GET')).toBe('public');
  });

  it('is open on GET only — a verb added to this file tomorrow inherits nothing', () => {
    // The route exports GET and OPTIONS. If someone adds a POST, it must fall
    // to `session` rather than inheriting a door written for a read.
    expect(classifyApiPath('/api/studio/capabilities', 'POST')).toBe('session');
    expect(classifyApiPath('/api/studio/mcp-config', 'POST')).toBe('session');
  });

  it('leaves quickstart closed, because its POST calls out on every request', () => {
    // Deliberate asymmetry, not an oversight: quickstart makes an outbound mesh
    // call carrying no credential, so opening it anonymously points an
    // amplifier at our own upstream.
    expect(classifyApiPath('/api/studio/quickstart', 'POST')).toBe('session');
  });
});
