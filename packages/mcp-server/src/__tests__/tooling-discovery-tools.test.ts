import { describe, expect, it } from 'vitest';
import {
  buildToolManifest,
  suggestToolsForGoal,
  handleBatchToolCall,
} from '../tooling-discovery-tools';

describe('tooling discovery and batch dispatch', () => {
  it('builds a tool manifest with inferred output schemas', () => {
    const manifest = buildToolManifest(
      [
        {
          name: 'parse_hs',
          description: 'Parse code into AST',
          inputSchema: { type: 'object', properties: { code: { type: 'string' } }, required: ['code'] },
        },
        {
          name: 'compile_holoscript',
          description: 'Compile HoloScript to targets',
          inputSchema: { type: 'object', properties: { code: { type: 'string' }, target: { type: 'string' } } },
        },
      ] as any,
      { includeInputSchema: true, includeOutputSchema: true }
    );

    expect(manifest.length).toBe(2);
    const parseEntry = manifest.find((t) => t.name === 'parse_hs');
    expect(parseEntry).toBeDefined();
    expect(parseEntry?.outputSchema).toBeDefined();
  });

  it('suggests tool plans for natural language goals', () => {
    const manifest = buildToolManifest(
      [
        { name: 'parse_hs', description: 'Parse HoloScript into AST', inputSchema: { type: 'object' } },
        { name: 'validate_holoscript', description: 'Validate HoloScript syntax', inputSchema: { type: 'object' } },
        { name: 'compile_holoscript', description: 'Compile HoloScript code', inputSchema: { type: 'object' } },
      ] as any,
      { includeInputSchema: false, includeOutputSchema: false }
    );

    const result = suggestToolsForGoal('parse validate and compile this HoloScript scene', manifest, 10);

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestedBundles.some((b) => b.name === 'parse-validate-compile')).toBe(true);
  });

  it('suggests control-plane and surface-audit tools for MCP/REST/CLI/canary goals', () => {
    const manifest = buildToolManifest(
      [
        { name: 'get_tool_manifest', description: 'Return a machine-readable manifest of all available tools', inputSchema: { type: 'object' } },
        { name: 'get_api_reference', description: 'Get API reference docs', inputSchema: { type: 'object' } },
        { name: 'get_circuit_breaker_status', description: 'Check circuit breaker status for control plane', inputSchema: { type: 'object' } },
        { name: 'get_agent_health', description: 'Get agent health metrics', inputSchema: { type: 'object' } },
        { name: 'holoscript_code_health', description: 'Run code health checks', inputSchema: { type: 'object' } },
        { name: 'discover_agents', description: 'Discover available agents', inputSchema: { type: 'object' } },
        { name: 'execute_holotest', description: 'Execute holotest canary runner', inputSchema: { type: 'object' } },
        { name: 'holo_estimate_task_duration', description: 'Estimate task duration', inputSchema: { type: 'object' } },
        { name: 'holomesh_team_form', description: 'Form a HoloMesh team', inputSchema: { type: 'object' } },
        { name: 'browser_screenshot', description: 'Take a browser screenshot', inputSchema: { type: 'object' } },
        { name: 'compile_to_mcp_config', description: 'Compile to MCP config', inputSchema: { type: 'object' } },
        { name: 'holoscript_discover_tools', description: 'Discover HoloScript tools', inputSchema: { type: 'object' } },
      ] as any,
      { includeInputSchema: false, includeOutputSchema: false }
    );

    const goal = 'as an external agent test MCP REST control plane RCP and CLI surfaces for gaps';
    const result = suggestToolsForGoal(goal, manifest, 8);

    const names = result.suggestions.map((s) => s.name);

    // Must surface relevant tools
    expect(names).toContain('get_tool_manifest');
    expect(names).toContain('get_api_reference');
    expect(names).toContain('get_circuit_breaker_status');
    expect(names).toContain('get_agent_health');
    expect(names).toContain('holoscript_code_health');
    expect(names).toContain('execute_holotest');
    expect(names).toContain('compile_to_mcp_config');
    expect(names).toContain('holoscript_discover_tools');

    // Must NOT surface unrelated tools that the canary repro flagged
    expect(names).not.toContain('holo_estimate_task_duration');
    expect(names).not.toContain('holomesh_team_form');
    expect(names).not.toContain('browser_screenshot');

    // Must include the control-plane-and-surface-audit bundle
    expect(result.suggestedBundles.some((b) => b.name === 'control-plane-and-surface-audit')).toBe(true);
    const bundle = result.suggestedBundles.find((b) => b.name === 'control-plane-and-surface-audit');
    expect(bundle?.tools).toContain('get_tool_manifest');
    expect(bundle?.tools).toContain('get_api_reference');
    expect(bundle?.tools).toContain('get_circuit_breaker_status');
    expect(bundle?.tools).toContain('get_agent_health');
    expect(bundle?.tools).toContain('holoscript_code_health');
    expect(bundle?.tools).toContain('discover_agents');
    expect(bundle?.tools).toContain('execute_holotest');

    // No noToolExplanation when matches exist
    expect(result.noToolExplanation).toBeUndefined();
  });

  it('returns noToolExplanation when no tools match', () => {
    const manifest = buildToolManifest(
      [
        { name: 'parse_hs', description: 'Parse HoloScript into AST', inputSchema: { type: 'object' } },
      ] as any,
      { includeInputSchema: false, includeOutputSchema: false }
    );

    const result = suggestToolsForGoal('foobar xyzqwerty nonexistent domain', manifest, 10);
    expect(result.suggestions.length).toBe(0);
    expect(result.noToolExplanation).toBeDefined();
    expect(result.noToolExplanation).toContain('No tools matched');
    expect(result.noToolExplanation).toContain('get_tool_manifest');
  });

  it('executes batched calls and returns structured per-call results', async () => {
    const payload = await handleBatchToolCall(
      {
        calls: [
          { name: 'parse_hs', args: { code: 'ok' } },
          { name: 'validate_holoscript', args: { code: 'ok' } },
          { name: 'compile_holoscript', args: { code: 'ok', target: 'r3f' } },
        ],
      },
      async (name, args) => ({ name, args, success: true })
    );

    expect(payload.summary.total).toBe(3);
    expect(payload.summary.failed).toBe(0);
    expect(payload.results.every((r) => r.ok)).toBe(true);
    expect(payload.results.map((r) => r.name)).toEqual([
      'parse_hs',
      'validate_holoscript',
      'compile_holoscript',
    ]);
  });
});
