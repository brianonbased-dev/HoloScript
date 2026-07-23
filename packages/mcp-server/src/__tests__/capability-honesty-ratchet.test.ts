import { afterEach, describe, expect, it, vi } from 'vitest';

import { hololandMcpTools } from '../hololand-mcp-tools';
import { handleSovereignTool, sovereignTools } from '../holomesh/sovereign-tools';
import { robotAiMcpTools } from '../robot-ai-mcp-tools';

function description(tools: Array<{ name: string; description?: string }>, name: string): string {
  const tool = tools.find((candidate) => candidate.name === name);
  expect(tool, `missing tool ${name}`).toBeDefined();
  return tool?.description ?? '';
}

describe('capability honesty ratchet', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.HOLOMESH_API_BASE_URL;
  });

  it('describes sovereign topology as a registered modeled route, not live discovery', () => {
    const value = description(sovereignTools, 'holomesh_sovereign_topology');

    expect(value).toContain('registered mcp-server route');
    expect(value).toContain('does not discover deployed clusters');
    expect(value).not.toContain('endpoint which does not exist');
  });

  it('routes sovereign tools to the HoloMesh API service with its key convention', async () => {
    process.env.HOLOMESH_API_BASE_URL = 'https://mesh.example/api/holomesh/';
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    const client = { config: { apiKey: 'mesh-key', orchestratorUrl: 'https://wrong.example' } };

    await handleSovereignTool(
      'holomesh_sovereign_topology',
      { clusters: 2, replicas: 3 },
      client as never
    );

    expect(fetchMock).toHaveBeenCalledWith(
      'https://mesh.example/api/holomesh/sovereign/topology?clusters=2&replicas=3',
      { headers: { 'x-mcp-api-key': 'mesh-key' } }
    );
  });

  it('bounds safety-envelope enforcement to the MCP dispatch seam', () => {
    const value = description(robotAiMcpTools, 'twin_earth_create_safety_envelope');

    expect(value).toContain('MCP dispatch path');
    expect(value).toContain('not a kernel or hardware sandbox');
    expect(value).toContain('AI invocation');
    expect(value).toContain('simulated');
  });

  it('retains honest labels for capabilities that are still thin or simulated', () => {
    expect(description(robotAiMcpTools, 'twin_earth_register_identity')).toContain(
      'never cryptographically verified'
    );
    expect(description(robotAiMcpTools, 'twin_earth_ai_invoke')).toContain(
      'returns simulated:true'
    );
    expect(description(hololandMcpTools, 'hololand_provision_creator')).toContain('in-memory only');
    expect(description(hololandMcpTools, 'hololand_provision_agent')).toContain(
      'in-memory registry only'
    );
  });
});
