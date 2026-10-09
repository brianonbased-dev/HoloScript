import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  buildMeshToolManifest,
  clearMeshToolRegistry,
  discoverMeshTools,
  handleMeshToolRegistryTool,
  invokePublishedMeshTool,
  MESH_INVOKE_MAX_RESPONSE_BYTES,
  MESH_SWEEP_MAX_RESPONSE_BYTES,
  meshToolManifestFromKnowledgeContent,
  meshToolManifestToKnowledgeContent,
  publishMeshToolManifest,
  sweepMeshToolRegistry,
  verifyMeshToolAttestation,
  verifyMeshToolInvocationChain,
  type MeshToolInvocationHop,
  type MeshToolManifest,
} from '../mesh-tool-registry';
import {
  _resetHoloMeshClientForTests,
  handleHoloMeshTool,
  moltbookProxyRefusal,
} from '../holomesh-tools';

const publisher = { agentId: 'agent_test', name: 'test-agent' };
const stranger = { agentId: 'agent_stranger', name: 'stranger' };

describe('mesh tool registry', () => {
  beforeEach(() => {
    clearMeshToolRegistry();
  });

  it('publishes hash-attested manifests and discovers them by capability tag', () => {
    const manifest = publishMeshToolManifest(
      buildMeshToolManifest(
        {
          tool_name: 'parse_hs',
          description: 'Parse HoloScript source into an AST.',
          capability_tags: ['parse', 'holo', 'compiler'],
          allow_transitive_invocation: true,
        },
        publisher,
        new Date('2026-05-07T00:00:00.000Z')
      )
    );

    expect(verifyMeshToolAttestation(manifest)).toBe(true);
    expect(discoverMeshTools('compiler parse')).toHaveLength(1);
    expect(discoverMeshTools('compiler parse')[0].id).toBe(manifest.id);
  });

  it('round-trips manifests through HoloMesh knowledge content', () => {
    const manifest = buildMeshToolManifest(
      {
        tool_name: 'get_workspace_info',
        capability_tags: ['workspace', 'introspection'],
      },
      publisher
    );
    const content = meshToolManifestToKnowledgeContent(manifest);

    expect(meshToolManifestFromKnowledgeContent(content)).toEqual(manifest);
    expect(meshToolManifestFromKnowledgeContent('ordinary knowledge')).toBeNull();
  });

  it('refuses invocation when attestation is tampered', async () => {
    const manifest = buildMeshToolManifest(
      {
        tool_name: 'parse_hs',
        capability_tags: ['parse'],
        allow_transitive_invocation: true,
      },
      publisher
    );
    const tampered: MeshToolManifest = { ...manifest, capabilityTags: ['different'] };

    const result = (await invokePublishedMeshTool(tampered, {})) as Record<string, unknown>;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/attestation/i);
  });

  it('invokes an opted-in local tool through the guarded route', async () => {
    const manifest = buildMeshToolManifest(
      {
        tool_name: 'parse_hs',
        capability_tags: ['parse'],
        allow_transitive_invocation: true,
      },
      publisher
    );

    const result = (await invokePublishedMeshTool(
      manifest,
      { code: 'scene Test {}' },
      {
        localInvoker: async (toolName, args) => ({ toolName, args }),
      }
    )) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.result).toEqual({ toolName: 'parse_hs', args: { code: 'scene Test {}' } });
  });

  it('appends verified provenance hops for transitive invocation', async () => {
    const tools = [
      {
        name: 'parse_hs',
        description: 'Parse HoloScript source.',
        inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
      },
      {
        name: 'compile_holoscript',
        description: 'Compile HoloScript source.',
        inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
      },
    ] as const;
    await handleMeshToolRegistryTool(
      'holomesh_publish_tool',
      { tool_name: 'parse_hs', capability_tags: ['parse'] },
      [...tools],
      async () => ({ ok: true })
    );
    await handleMeshToolRegistryTool(
      'holomesh_publish_tool',
      { tool_name: 'compile_holoscript', capability_tags: ['compile'] },
      [...tools],
      async () => ({ ok: true })
    );

    const first = (await handleMeshToolRegistryTool(
      'holomesh_invoke_tool',
      {
        capability_query: 'parse',
        args: { code: 'scene Test {}' },
        invocation_id: 'invoke-1',
        timestamp: '2026-05-07T00:00:00.000Z',
      },
      [...tools],
      async (toolName, args) => ({ toolName, args })
    )) as Record<string, unknown>;
    const firstAttestation = first.attestation as { provenanceChain: Array<{ hopHash: string }> };

    const second = (await handleMeshToolRegistryTool(
      'holomesh_invoke_tool',
      {
        capability_query: 'compile',
        args: { code: 'scene Test {}', target: 'r3f' },
        invocation_id: 'invoke-2',
        timestamp: '2026-05-07T00:00:01.000Z',
        provenance_chain: firstAttestation.provenanceChain,
      },
      [...tools],
      async (toolName, args) => ({ toolName, args })
    )) as Record<string, unknown>;
    const secondAttestation = second.attestation as {
      provenanceChain: Array<{ previousHash: string | null; hopHash: string }>;
    };

    expect(secondAttestation.provenanceChain).toHaveLength(2);
    expect(secondAttestation.provenanceChain[1].previousHash).toBe(
      firstAttestation.provenanceChain[0].hopHash
    );
    expect(
      verifyMeshToolInvocationChain(secondAttestation.provenanceChain as MeshToolInvocationHop[])
        .verified
    ).toBe(true);
  });

  it('rejects tampered provenance before dispatch', async () => {
    const tools = [
      {
        name: 'parse_hs',
        description: 'Parse HoloScript source.',
        inputSchema: { type: 'object', properties: { code: { type: 'string' } } },
      },
    ] as const;
    await handleMeshToolRegistryTool(
      'holomesh_publish_tool',
      { tool_name: 'parse_hs', capability_tags: ['parse'] },
      [...tools],
      async () => ({ ok: true })
    );
    const first = (await handleMeshToolRegistryTool(
      'holomesh_invoke_tool',
      {
        capability_query: 'parse',
        args: { code: 'scene Test {}' },
        invocation_id: 'invoke-1',
        timestamp: '2026-05-07T00:00:00.000Z',
      },
      [...tools],
      async () => ({ ok: true })
    )) as Record<string, unknown>;
    const firstAttestation = first.attestation as {
      provenanceChain: Array<Record<string, unknown>>;
    };
    const tampered = [{ ...firstAttestation.provenanceChain[0], argsHash: 'tampered' }];
    const dispatch = vi.fn().mockResolvedValue({ ok: true });

    await expect(
      handleMeshToolRegistryTool(
        'holomesh_invoke_tool',
        {
          capability_query: 'parse',
          args: { code: 'scene Test {}' },
          provenance_chain: tampered,
        },
        [...tools],
        dispatch
      )
    ).rejects.toThrow(/Invalid provenance chain/);
    expect(dispatch).not.toHaveBeenCalled();
  });
});

describe('holomesh mesh tool handlers', () => {
  const originalApiKey = process.env.HOLOSCRIPT_API_KEY;

  beforeEach(() => {
    clearMeshToolRegistry();
    delete process.env.HOLOSCRIPT_API_KEY;
  });

  afterEach(() => {
    if (originalApiKey) process.env.HOLOSCRIPT_API_KEY = originalApiKey;
    else delete process.env.HOLOSCRIPT_API_KEY;
  });

  it('publishes, discovers, and dry-runs a mesh-native tool without a remote key', async () => {
    const published = (await handleHoloMeshTool('holomesh_publish_tool', {
      tool_name: 'parse_hs',
      description: 'Parse HoloScript source.',
      capability_tags: ['compiler', 'parse'],
      allow_transitive_invocation: true,
    })) as Record<string, unknown>;

    expect(published.success).toBe(true);
    expect(published.meshToolId).toBeTruthy();

    const discovered = (await handleHoloMeshTool('holomesh_discover', {
      include_tools: true,
      capability_query: 'compiler parse',
    })) as Record<string, unknown>;
    expect(discovered.success).toBe(true);
    expect(discovered.toolCount).toBe(1);

    const invoked = (await handleHoloMeshTool('holomesh_invoke_tool', {
      capability_query: 'compiler parse',
      dry_run: true,
    })) as Record<string, unknown>;

    expect(invoked.success).toBe(true);
    expect((invoked.invocation as Record<string, unknown>).dryRun).toBe(true);
    expect((invoked.attestation as Record<string, unknown>).chainLength).toBe(1);
    expect(
      verifyMeshToolInvocationChain(
        (invoked.attestation as { provenanceChain: MeshToolInvocationHop[] }).provenanceChain
      ).verified
    ).toBe(true);
  });
});

// The Moltbook crosspost publishes to a PUBLIC feed tied to the founder's own X
// identity. Its authorized proxy is the only gate between internal build
// telemetry and his public name — and until 2026-09-10 every proxy failure,
// including a 401 or 403 meaning "you are not allowed to publish this", dropped
// through to posting directly with the local key. The permission check could
// only ever be advisory. A refusal is not an outage.
describe('moltbook crosspost: a refusal is final, an outage is not', () => {
  it('THE FAULT: a proxy that answers 401 or 403 must stop the post', () => {
    expect(moltbookProxyRefusal({ response: { status: 401 } })).toBe(401);
    expect(moltbookProxyRefusal({ response: { status: 403 } })).toBe(403);
  });

  it('a proxy that never answered is a transport failure, and may still fall back', () => {
    expect(moltbookProxyRefusal(new Error('ECONNREFUSED'))).toBeNull();
    expect(moltbookProxyRefusal({ code: 'ETIMEDOUT' })).toBeNull();
    expect(moltbookProxyRefusal(undefined)).toBeNull();
    expect(moltbookProxyRefusal(null)).toBeNull();
  });

  it('does not treat a server error or a rate limit as a refusal to publish', () => {
    expect(moltbookProxyRefusal({ response: { status: 500 } })).toBeNull();
    expect(moltbookProxyRefusal({ response: { status: 429 } })).toBeNull();
  });
});

// task cixd: holomesh_invoke_tool POSTed to whatever URL a manifest named and returned the
// answer whole, so a tools:write caller could publish a tool at an internal address, invoke it,
// and read the body. Stand-in servers on 127.0.0.1 count what reaches them.
describe('an mcp-http mesh tool reaches only the public internet unless the caller is an operator', () => {
  const READ_WRITE = {
    signedRequest: false,
    signingValid: true,
    signer: 'client',
    scopes: ['tools:read', 'tools:write'],
  };
  const ADMIN = { ...READ_WRITE, signer: 'owner-agent', scopes: ['admin:*'] };
  const servers: Array<() => Promise<void>> = [];

  beforeEach(() => clearMeshToolRegistry());
  afterEach(async () => {
    while (servers.length) await servers.pop()!();
  });

  async function standIn(
    respond: (path: string) => { status: number; headers?: Record<string, string>; body?: string }
  ): Promise<{ base: string; hits: () => number }> {
    let hits = 0;
    const server = createServer((req, res) => {
      hits += 1;
      const out = respond(req.url ?? '/');
      res.writeHead(out.status, out.headers ?? {});
      res.end(out.body ?? '');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    servers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    return { base: `http://127.0.0.1:${port}`, hits: () => hits };
  }

  function httpTool(url: string, opts: { id?: string; by?: typeof publisher } = {}) {
    return buildMeshToolManifest(
      {
        ...(opts.id ? { id: opts.id } : {}),
        tool_name: 'parse_hs',
        description: 'A tool served over HTTP.',
        endpoint: { transport: 'mcp-http', url, toolName: 'parse_hs' },
        allow_transitive_invocation: true,
      },
      opts.by ?? publisher
    );
  }

  it('a tools:write caller cannot make this server call an internal address and read the answer', async () => {
    const server = await standIn(() => ({ status: 200, body: '{"secret":"internal-only"}' }));
    await expect(
      invokePublishedMeshTool(httpTool(`${server.base}/mcp`), {}, { signingCtx: READ_WRITE })
    ).rejects.toThrow(/is not a public internet address/);
    expect(server.hits()).toBe(0);
  });

  it('control: an operator still reaches a tool published here and reads the answer', async () => {
    const server = await standIn(() => ({ status: 200, body: '{"ok":1}' }));
    const manifest = publishMeshToolManifest(httpTool(`${server.base}/mcp`));
    const res = await invokePublishedMeshTool(manifest, {}, { signingCtx: ADMIN });
    expect(server.hits()).toBe(1);
    expect(res).toMatchObject({ success: true, result: { ok: 1 } });
  });

  it('an operator invoking a manifest NOT published here (as read from the knowledge store) goes through the guard', async () => {
    const server = await standIn(() => ({ status: 200, body: '{"answer":"internal-only"}' }));
    await expect(
      invokePublishedMeshTool(httpTool(`${server.base}/mcp`), {}, { signingCtx: ADMIN })
    ).rejects.toThrow(/is not a public internet address/);
    expect(server.hits()).toBe(0);
  });

  it('an operator invoking a tool published here does not follow a redirect either', async () => {
    const target = await standIn(() => ({ status: 200, body: 'internal' }));
    const first = await standIn(() => ({
      status: 307,
      headers: { location: `${target.base}/secret` },
    }));
    const manifest = publishMeshToolManifest(httpTool(`${first.base}/mcp`));
    await expect(invokePublishedMeshTool(manifest, {}, { signingCtx: ADMIN })).rejects.toThrow();
    expect(first.hits()).toBe(1);
    expect(target.hits()).toBe(0);
  });

  it('the health sweep follows no redirect and reads a bounded answer', async () => {
    const target = await standIn(() => ({ status: 200, body: 'ok' }));
    const redirecting = await standIn(() => ({
      status: 307,
      headers: { location: `${target.base}/health` },
    }));
    const oversized = await standIn(() => ({
      status: 200,
      body: 'x'.repeat(MESH_SWEEP_MAX_RESPONSE_BYTES + 1),
    }));
    publishMeshToolManifest(httpTool(`${redirecting.base}/mcp`, { id: 'parse_hs-redirecting' }));
    publishMeshToolManifest(
      httpTool(`${oversized.base}/mcp`, { id: 'parse_hs-oversized', by: stranger })
    );
    const result = await sweepMeshToolRegistry();
    expect(result.probed).toBe(2);
    expect(redirecting.hits()).toBe(1);
    expect(target.hits()).toBe(0); // the redirect is an answer, not a place to go
    expect(oversized.hits()).toBe(1);
    expect(result.healthy).toBe(1); // the redirect counts; the oversized answer is refused
  });

  it('a public endpoint that redirects is not followed, so it cannot bounce the call inside', async () => {
    const target = await standIn(() => ({ status: 200, body: 'internal' }));
    const first = await standIn(() => ({
      status: 307,
      headers: { location: `${target.base}/secret` },
    }));
    // Every address check passes here, standing in for public hosts: only "no redirects" can stop it.
    await expect(
      invokePublishedMeshTool(
        httpTool(`${first.base}/mcp`),
        {},
        { signingCtx: READ_WRITE, outboundGuard: { isAllowedAddress: () => true } }
      )
    ).rejects.toThrow(/redirects/);
    expect(first.hits()).toBe(1);
    expect(target.hits()).toBe(0);
  });

  it('an answer larger than the cap is refused', async () => {
    const server = await standIn(() => ({
      status: 200,
      body: 'x'.repeat(MESH_INVOKE_MAX_RESPONSE_BYTES + 1),
    }));
    await expect(
      invokePublishedMeshTool(
        httpTool(`${server.base}/mcp`),
        {},
        { signingCtx: READ_WRITE, outboundGuard: { isAllowedAddress: () => true } }
      )
    ).rejects.toThrow(/larger than/);
  });

  it('publishing an mcp-http tool at an internal address is refused for a tools:write caller, allowed for an operator', async () => {
    const args = {
      tool_name: 'parse_hs',
      description: 'A tool served over HTTP.',
      endpoint: { transport: 'mcp-http', url: 'http://127.0.0.1:9/mcp', toolName: 'parse_hs' },
      allow_transitive_invocation: true,
    };
    const refused = await handleHoloMeshTool('holomesh_publish_tool', args, READ_WRITE as never);
    expect(JSON.stringify(refused)).toMatch(/is not a public internet address/);
    expect(discoverMeshTools('parse_hs', 10)).toHaveLength(0);

    const allowed = await handleHoloMeshTool('holomesh_publish_tool', args, ADMIN as never);
    expect(allowed).toMatchObject({ success: true });
  });

  // Through the handlers, the way a request reaches them. HOLOSCRIPT_API_KEY switches on the
  // HoloMesh client, which asks the shared knowledge store for manifests: a stand-in answers for
  // the store, so nothing here leaves this machine.
  describe('through the handlers', () => {
    const saved = {
      key: process.env.HOLOSCRIPT_API_KEY,
      transport: process.env.HOLOSCRIPT_MCP_TRANSPORT,
      orchestrator: process.env.MCP_ORCHESTRATOR_URL,
    };
    let storeRows: Array<Record<string, unknown>> = [];
    let store: { base: string; hits: () => number };

    const json = { 'content-type': 'application/json' };
    const storeHolds = (manifest: MeshToolManifest) =>
      storeRows.push({
        id: `k-${manifest.id}`,
        type: 'pattern',
        content: meshToolManifestToKnowledgeContent(manifest),
        metadata: {},
      });

    beforeEach(async () => {
      storeRows = [];
      store = await standIn((path) =>
        path === '/knowledge/query'
          ? { status: 200, headers: json, body: JSON.stringify({ results: storeRows }) }
          : { status: 200, headers: json, body: '{}' }
      );
      process.env.HOLOSCRIPT_API_KEY = 'test-tool-client-key';
      process.env.MCP_ORCHESTRATOR_URL = store.base;
      _resetHoloMeshClientForTests();
    });

    afterEach(() => {
      for (const [name, value] of [
        ['HOLOSCRIPT_API_KEY', saved.key],
        ['HOLOSCRIPT_MCP_TRANSPORT', saved.transport],
        ['MCP_ORCHESTRATOR_URL', saved.orchestrator],
      ] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
      _resetHoloMeshClientForTests();
    });

    it("a call that lost its caller (an execute_workflow step's batch child) is no operator over HTTP", async () => {
      // handleTool fills a missing context with {signer:'stdio-local', scopes:['admin:*']} when
      // HOLOSCRIPT_API_KEY is set, on the hosted server too (#457 pre-review). That must not open
      // this host's network: only the stdio process the local user launched may.
      const tool = await standIn(() => ({ status: 200, body: '{"answer":"internal-only"}' }));
      const manifest = publishMeshToolManifest(httpTool(`${tool.base}/mcp`));
      const { handleTool } = await import('../../handlers');

      process.env.HOLOSCRIPT_MCP_TRANSPORT = 'http';
      const refused = await handleTool('holomesh_invoke_tool', { mesh_tool_id: manifest.id });
      expect(JSON.stringify(refused)).toMatch(/is not a public internet address/);
      expect(tool.hits()).toBe(0);
      expect(store.hits()).toBeGreaterThan(0); // the store asked was the stand-in

      // Control, same call on stdio: the local user may reach their own network.
      process.env.HOLOSCRIPT_MCP_TRANSPORT = 'stdio';
      const local = await handleTool('holomesh_invoke_tool', { mesh_tool_id: manifest.id });
      expect(tool.hits()).toBe(1);
      expect(local).toMatchObject({ invocation: { result: { answer: 'internal-only' } } });
    });

    it('an operator invoking a knowledge-store manifest reaches no internal address', async () => {
      const tool = await standIn(() => ({ status: 200, body: '{"answer":"internal-only"}' }));
      const remote = httpTool(`${tool.base}/mcp`, { id: 'parse_hs-stranger', by: stranger });
      storeHolds(remote);
      const res = await handleHoloMeshTool(
        'holomesh_invoke_tool',
        { mesh_tool_id: remote.id },
        ADMIN as never
      );
      expect(JSON.stringify(res)).toMatch(/is not a public internet address/);
      expect(tool.hits()).toBe(0);
    });

    it('a knowledge-store entry cannot take over the id of a tool published here', async () => {
      const ours = await standIn(() => ({ status: 200, body: '{"from":"ours"}' }));
      const theirs = await standIn(() => ({ status: 200, body: '{"from":"theirs"}' }));
      publishMeshToolManifest(httpTool(`${ours.base}/mcp`, { id: 'parse_hs-shared' }));
      storeHolds(httpTool(`${theirs.base}/mcp`, { id: 'parse_hs-shared', by: stranger }));
      const res = await handleHoloMeshTool(
        'holomesh_invoke_tool',
        { mesh_tool_id: 'parse_hs-shared' },
        ADMIN as never
      );
      expect(theirs.hits()).toBe(0);
      expect(ours.hits()).toBe(1);
      expect(res).toMatchObject({ invocation: { result: { from: 'ours' } } });
    });
  });
});
