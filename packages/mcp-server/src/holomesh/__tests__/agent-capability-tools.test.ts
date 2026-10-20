import { afterEach, describe, expect, it } from 'vitest';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  agentCapabilityTools,
  extractAgentCapabilities,
  handleAgentCapabilityTool,
  resolveMarketplaceSearchUrl,
} from '../agent-capability-tools';

/** Run `fn` with HOLOSCRIPT_MCP_TRANSPORT set (undefined = unset), then put it back. */
async function withTransport<T>(transport: string | undefined, fn: () => T | Promise<T>) {
  const saved = process.env.HOLOSCRIPT_MCP_TRANSPORT;
  if (transport === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
  else process.env.HOLOSCRIPT_MCP_TRANSPORT = transport;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env.HOLOSCRIPT_MCP_TRANSPORT;
    else process.env.HOLOSCRIPT_MCP_TRANSPORT = saved;
  }
}

describe('agent capability tools', () => {
  it('exports capability and marketplace search tool definitions', () => {
    expect(agentCapabilityTools.map((tool) => tool.name)).toEqual([
      'holomesh_agent_capabilities',
      'holomesh_marketplace_search',
    ]);
  });

  it('extracts capability tags, traits, tools, and capability block names from .hsplus', () => {
    const source = `
      composition "CodexBrain" {
        identity {
          name: "codex-brain"
          domain: "hardware-validation"
          capability_tags: ["webgpu", "wasm-simd", "local-validation"]
        }

        traits [
          "hardware_oracle",
          "build_gatekeeper"
        ]

        scope hot {
          mcp_client {
            tools: ["holo_query_codebase", "holo_compile_webgpu"]
          }
        }

        capabilities {
          verify_build: {
            description: "Run the build"
          }
          audit_gpu: {
            description: "Check GPU runtime"
          }
        }

        @capability_build_done_when {
          check: "local validation passes"
        }
      }
    `;

    const summary = extractAgentCapabilities(source);

    expect(summary.compositionName).toBe('CodexBrain');
    expect(summary.identityName).toBe('codex-brain');
    expect(summary.domain).toBe('hardware-validation');
    expect(summary.capabilityTags).toEqual(['webgpu', 'wasm-simd', 'local-validation']);
    expect(summary.traits).toContain('hardware_oracle');
    expect(summary.traits).toContain('capability_build_done_when');
    expect(summary.tools).toEqual(['holo_query_codebase', 'holo_compile_webgpu']);
    expect(summary.capabilities).toEqual(['verify_build', 'audit_gpu']);
    expect(summary.marketplaceTags).toContain('tool:holo_compile_webgpu');
  });

  it('returns a team formation roster hint for inline brain source', async () => {
    const result = (await handleAgentCapabilityTool('holomesh_agent_capabilities', {
      brain_source: `
        composition "LeanTheoristBrain" {
          identity {
            name: "lean-theorist"
            capability_tags: ["lean4", "formal-methods"]
          }
        }
      `,
      agent_id: 'agent_lean',
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    expect(result.agent).toMatchObject({ id: 'agent_lean', name: 'lean-theorist' });
    expect(result.teamFormationRosterHint).toMatchObject({
      agentId: 'agent_lean',
      agentName: 'lean-theorist',
    });
  });

  it('requires explicit allow_file_read for brain_path', async () => {
    const result = (await handleAgentCapabilityTool('holomesh_agent_capabilities', {
      brain_path: 'compositions/codex-brain.hsplus',
    })) as Record<string, unknown>;

    expect(result.error).toMatch(/allow_file_read/);
  });

  it('scores marketplace templates by capability and tool match', async () => {
    const result = (await handleAgentCapabilityTool('holomesh_marketplace_search', {
      include_remote: false,
      capability_query: 'compiler webgpu',
      capability_tags: ['webgpu'],
      tool_names: ['holo_compile_webgpu'],
      items: [
        {
          id: 'template_visual',
          name: 'Visual Critic',
          description: 'Review spatial UI composition',
          capabilities: ['visual-audit'],
          tools: ['holo_query_codebase'],
        },
        {
          id: 'template_webgpu',
          name: 'WebGPU Compiler Builder',
          description: 'Build compiler targets for GPU runtimes',
          capabilities: ['webgpu', 'compiler'],
          tools: ['holo_compile_webgpu'],
        },
      ],
    })) as Record<string, unknown>;

    expect(result.success).toBe(true);
    const results = result.results as Array<{
      item: { id: string };
      score: number;
      matched: string[];
    }>;
    expect(results[0].item.id).toBe('template_webgpu');
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].matched).toContain('capability:webgpu');
  });

  it('returns null for unrelated tool names', async () => {
    await expect(handleAgentCapabilityTool('holomesh_unknown', {})).resolves.toBeNull();
  });
});

describe('resolveMarketplaceSearchUrl SSRF protection', () => {
  // --- Allowed cases ---
  it('allows https URLs to allowed hosts', () => {
    expect(resolveMarketplaceSearchUrl('https://mcp.holoscript.net/search')).toBe(
      'https://mcp.holoscript.net/search'
    );
    expect(
      resolveMarketplaceSearchUrl(
        'https://mcp-orchestrator-production-45f9.up.railway.app/marketplace/search'
      )
    ).toBe('https://mcp-orchestrator-production-45f9.up.railway.app/marketplace/search');
  });

  it('allows http URLs to loopback hosts (localhost, 127.0.0.1) on stdio, the local machine', async () => {
    await withTransport('stdio', () => {
      expect(resolveMarketplaceSearchUrl('http://localhost:4555/marketplace/search')).toBe(
        'http://localhost:4555/marketplace/search'
      );
      expect(resolveMarketplaceSearchUrl('http://127.0.0.1:4555/marketplace/search')).toBe(
        'http://127.0.0.1:4555/marketplace/search'
      );
    });
  });

  it('allows https URLs to loopback hosts on stdio', async () => {
    await withTransport('stdio', () => {
      expect(resolveMarketplaceSearchUrl('https://localhost/search')).toBe(
        'https://localhost/search'
      );
    });
  });

  // task uhom: on the hosted server, loopback is the server's own container, and the search
  // sends HOLOSCRIPT_API_KEY to the port and path the caller names.
  it('refuses a loopback override unless this server runs on stdio', async () => {
    for (const transport of ['http', undefined]) {
      await withTransport(transport, () => {
        for (const url of [
          'http://127.0.0.1:4555/marketplace/search',
          'http://localhost:3000/api/admin',
          'https://localhost/search',
        ]) {
          expect(() => resolveMarketplaceSearchUrl(url), `${transport}: ${url}`).toThrow(
            /only when this server runs on stdio/
          );
        }
      });
    }
  });

  it('returns env default when no override is provided', () => {
    const original = process.env.HOLOMESH_MARKETPLACE_SEARCH_URL;
    process.env.HOLOMESH_MARKETPLACE_SEARCH_URL = 'https://mcp.holoscript.net/search';
    try {
      expect(resolveMarketplaceSearchUrl(undefined)).toBe('https://mcp.holoscript.net/search');
    } finally {
      if (original === undefined) {
        delete process.env.HOLOMESH_MARKETPLACE_SEARCH_URL;
      } else {
        process.env.HOLOMESH_MARKETPLACE_SEARCH_URL = original;
      }
    }
  });

  // --- Rejected schemes ---
  it('rejects file:// scheme', () => {
    expect(() => resolveMarketplaceSearchUrl('file:///etc/passwd')).toThrow('scheme not allowed');
  });

  it('rejects data: scheme', () => {
    expect(() => resolveMarketplaceSearchUrl('data:text/html,<script>alert(1)</script>')).toThrow(
      'scheme not allowed'
    );
  });

  it('rejects ftp:// scheme', () => {
    expect(() => resolveMarketplaceSearchUrl('ftp://mcp.holoscript.net/pub/exploit')).toThrow(
      'scheme not allowed'
    );
  });

  it('rejects javascript: scheme', () => {
    expect(() => resolveMarketplaceSearchUrl('javascript:alert(1)')).toThrow('scheme not allowed');
  });

  it('rejects gopher:// scheme (classic SSRF vector)', () => {
    expect(() => resolveMarketplaceSearchUrl('gopher://169.254.169.254:80/')).toThrow(
      'scheme not allowed'
    );
  });

  // --- Host allowlist ---
  it('rejects arbitrary host even with https', () => {
    expect(() => resolveMarketplaceSearchUrl('https://evil.example.com/search')).toThrow(
      'host not allowed'
    );
  });

  it('rejects AWS instance metadata (non-loopback http:// blocked before host check)', () => {
    // http:// on a non-loopback host is rejected by the scheme check, not the host allowlist.
    // Either error is a correct SSRF block; the http: check fires first.
    expect(() => resolveMarketplaceSearchUrl('http://169.254.169.254/latest/meta-data/')).toThrow();
  });

  it('rejects internal Redis (non-loopback http:// blocked before host check)', () => {
    expect(() => resolveMarketplaceSearchUrl('http://10.0.0.5:6379/')).toThrow();
  });

  // --- http on non-loopback ---
  it('rejects http:// on non-loopback allowed hosts (MITM protection)', () => {
    expect(() => resolveMarketplaceSearchUrl('http://mcp.holoscript.net/search')).toThrow(
      'must use https'
    );
    expect(() =>
      resolveMarketplaceSearchUrl('http://mcp-orchestrator-production-45f9.up.railway.app/search')
    ).toThrow('must use https');
  });

  // --- Invalid input ---
  it('rejects malformed URL', () => {
    expect(() => resolveMarketplaceSearchUrl('not a url at all')).toThrow('not a valid URL');
  });

  it('returns env default for empty string override', () => {
    // Empty string is falsy, so it should fall through to env default
    const original = process.env.HOLOMESH_MARKETPLACE_SEARCH_URL;
    process.env.HOLOMESH_MARKETPLACE_SEARCH_URL = 'https://mcp.holoscript.net/search';
    try {
      expect(resolveMarketplaceSearchUrl('')).toBe('https://mcp.holoscript.net/search');
    } finally {
      if (original === undefined) {
        delete process.env.HOLOMESH_MARKETPLACE_SEARCH_URL;
      } else {
        process.env.HOLOMESH_MARKETPLACE_SEARCH_URL = original;
      }
    }
  });
});

// task uhom, end to end: a stand-in on 127.0.0.1 counts what the search sends it.
describe('holomesh_marketplace_search sends nothing to a loopback override on the hosted server', () => {
  const closers: Array<() => Promise<void>> = [];
  afterEach(async () => {
    while (closers.length) await closers.pop()!();
  });

  async function standIn(): Promise<{ url: string; hits: () => number }> {
    let hits = 0;
    const server = createServer((_req, res) => {
      hits += 1;
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{"results":[]}');
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const { port } = server.address() as AddressInfo;
    closers.push(() => new Promise<void>((resolve) => server.close(() => resolve())));
    return { url: `http://127.0.0.1:${port}/marketplace/search`, hits: () => hits };
  }

  it('on http the call is refused before any request leaves; on stdio it still reaches a local marketplace', async () => {
    const savedKey = process.env.HOLOSCRIPT_API_KEY;
    process.env.HOLOSCRIPT_API_KEY = 'test-operator-key';
    try {
      const server = await standIn();
      const args = { marketplace_url: server.url, capability_query: 'compiler' };

      await withTransport('http', async () => {
        await expect(
          handleAgentCapabilityTool('holomesh_marketplace_search', args)
        ).rejects.toThrow(/only when this server runs on stdio/);
      });
      expect(server.hits()).toBe(0);

      await withTransport('stdio', () =>
        handleAgentCapabilityTool('holomesh_marketplace_search', args)
      );
      expect(server.hits()).toBe(1);
    } finally {
      if (savedKey === undefined) delete process.env.HOLOSCRIPT_API_KEY;
      else process.env.HOLOSCRIPT_API_KEY = savedKey;
    }
  });
});
