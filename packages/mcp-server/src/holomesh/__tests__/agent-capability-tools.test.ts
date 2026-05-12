import { describe, expect, it } from 'vitest';
import {
  agentCapabilityTools,
  extractAgentCapabilities,
  handleAgentCapabilityTool,
} from '../agent-capability-tools';

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
    const results = result.results as Array<{ item: { id: string }; score: number; matched: string[] }>;
    expect(results[0].item.id).toBe('template_webgpu');
    expect(results[0].score).toBeGreaterThan(0);
    expect(results[0].matched).toContain('capability:webgpu');
  });

  it('returns null for unrelated tool names', async () => {
    await expect(handleAgentCapabilityTool('holomesh_unknown', {})).resolves.toBeNull();
  });
});
