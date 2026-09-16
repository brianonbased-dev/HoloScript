/**
 * Doors audit 2026-09-15: what /api/docs tells an outside agent about
 * /api/mcp/call.
 *
 * This spec is how an agent wires itself to us, and it described the gateway
 * with no auth field at all and only 200/503 — so an agent that followed it
 * exactly sent no credential, met a 401 that was not in the list, and had
 * nothing to diagnose it with. A door that fails closed while the spec stays
 * silent is still a silent lock-out.
 */
import { describe, expect, it } from 'vitest';

import { GET } from './route';

type DocumentedOperation = {
  description?: string;
  security?: Array<Record<string, unknown>>;
  responses?: Record<string, unknown>;
};

type Spec = {
  paths: Record<string, { get?: DocumentedOperation; post?: DocumentedOperation }>;
  components?: { securitySchemes?: Record<string, { type?: string; name?: string }> };
};

async function spec(): Promise<Spec> {
  return (await (await GET()).json()) as Spec;
}

describe('GET /api/docs — the credential on /api/mcp/call', () => {
  it('names a credential scheme on both verbs, not just a 200', async () => {
    const call = (await spec()).paths['/api/mcp/call'];

    expect(call.post?.security?.length).toBeGreaterThan(0);
    expect(call.get?.security?.length).toBeGreaterThan(0);
  });

  it('lists the refusals the route can actually return', async () => {
    const post = (await spec()).paths['/api/mcp/call'].post;

    // 401 (no identity) and 403 (signed in, tool not on the allowlist) are both
    // real answers from this route; neither was documented.
    expect(post?.responses?.['401']).toBeDefined();
    expect(post?.responses?.['403']).toBeDefined();
    expect(post?.responses?.['503']).toBeDefined();
  });

  it('names the header that carries the key, and the bearer form it accepts', async () => {
    const post = (await spec()).paths['/api/mcp/call'].post;

    expect(post?.description).toContain('x-mcp-api-key');
    expect(post?.description).toContain('Bearer');
  });

  it('says plainly that the endpoint is not currently answering tool calls', async () => {
    const post = (await spec()).paths['/api/mcp/call'].post;

    // The credential half is now correct, so an agent can authenticate here and
    // still get nothing back. Saying so is the other half of the same promise.
    expect(post?.description).toContain('NOT CURRENTLY ANSWERING');
  });

  it('defines every security scheme the paths reference', async () => {
    const full = await spec();
    const schemes = full.components?.securitySchemes ?? {};
    const referenced = new Set<string>();

    for (const path of Object.values(full.paths)) {
      for (const operation of [path.get, path.post]) {
        for (const requirement of operation?.security ?? []) {
          for (const name of Object.keys(requirement)) referenced.add(name);
        }
      }
    }

    expect(referenced.size).toBeGreaterThan(0);
    for (const name of referenced) {
      expect(schemes[name]).toBeDefined();
    }
    expect(schemes.meshApiKey?.name).toBe('x-mcp-api-key');
  });
});
