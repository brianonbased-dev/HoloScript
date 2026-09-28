import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildMeshToolManifest,
  clearMeshToolRegistry,
  discoverMeshTools,
  handleMeshToolRegistryTool,
  invokePublishedMeshTool,
  meshToolManifestFromKnowledgeContent,
  meshToolManifestToKnowledgeContent,
  publishMeshToolManifest,
  verifyMeshToolAttestation,
  verifyMeshToolInvocationChain,
  type MeshToolInvocationHop,
  type MeshToolManifest,
} from '../mesh-tool-registry';
import { handleHoloMeshTool, moltbookProxyRefusal } from '../holomesh-tools';

const publisher = { agentId: 'agent_test', name: 'test-agent' };

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
