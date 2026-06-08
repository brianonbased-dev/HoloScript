import { describe, expect, it } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  buildToolManifest,
  suggestToolsForGoal,
  handleBatchToolCall,
  buildToolHealthReport,
} from '../tooling-discovery-tools';

/**
 * Minimal Tool fixture that satisfies the MCP Tool type without `as any`.
 * All optional fields (description, annotations, outputSchema, etc.) are omitted.
 * Only `name` and `inputSchema` are required by the SDK schema.
 */
function tool(name: string, description?: string): Tool {
  return {
    name,
    ...(description !== undefined ? { description } : {}),
    inputSchema: { type: 'object' },
  };
}

/**
 * Typed dispatch stub: accepts a name and returns a value or null.
 * Avoids cast workarounds at call-sites — the function signature already
 * matches what buildToolHealthReport expects.
 */
type DispatchFn = (name: string, args: Record<string, unknown>) => Promise<unknown>;

function makeDispatch(handler: (name: string) => unknown): DispatchFn {
  return async (name) => handler(name);
}

describe('tooling discovery and batch dispatch', () => {
  it('builds a tool manifest with inferred output schemas', () => {
    const manifest = buildToolManifest(
      [
        tool('parse_hs', 'Parse code into AST'),
        tool('compile_holoscript', 'Compile HoloScript to targets'),
      ],
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
        tool('parse_hs', 'Parse HoloScript into AST'),
        tool('validate_holoscript', 'Validate HoloScript syntax'),
        tool('compile_holoscript', 'Compile HoloScript code'),
      ],
      { includeInputSchema: false, includeOutputSchema: false }
    );

    const result = suggestToolsForGoal('parse validate and compile this HoloScript scene', manifest, 10);

    expect(result.suggestions.length).toBeGreaterThan(0);
    expect(result.suggestedBundles.some((b) => b.name === 'parse-validate-compile')).toBe(true);
  });

  it('suggests control-plane and surface-audit tools for MCP/REST/CLI/canary goals', () => {
    const manifest = buildToolManifest(
      [
        tool('get_tool_manifest', 'Return a machine-readable manifest of all available tools'),
        tool('get_api_reference', 'Get API reference docs'),
        tool('get_circuit_breaker_status', 'Check circuit breaker status for control plane'),
        tool('get_agent_health', 'Get agent health metrics'),
        tool('holoscript_code_health', 'Run code health checks'),
        tool('discover_agents', 'Discover available agents'),
        tool('execute_holotest', 'Execute holotest canary runner'),
        tool('holo_estimate_task_duration', 'Estimate task duration'),
        tool('holomesh_team_form', 'Form a HoloMesh team'),
        tool('browser_screenshot', 'Take a browser screenshot'),
        tool('compile_to_mcp_config', 'Compile to MCP config'),
        tool('holoscript_discover_tools', 'Discover HoloScript tools'),
      ],
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
      [tool('parse_hs', 'Parse HoloScript into AST')],
      { includeInputSchema: false, includeOutputSchema: false }
    );

    const result = suggestToolsForGoal('foobar xyzqwerty nonexistent domain', manifest, 10);
    expect(result.suggestions.length).toBe(0);
    expect(result.noToolExplanation).toBeDefined();
    expect(result.noToolExplanation).toContain('No tools matched');
    expect(result.noToolExplanation).toContain('get_tool_manifest');
  });

  // ---------------------------------------------------------------------------
  // get_tool_health
  // ---------------------------------------------------------------------------

  it('classifies tools as live when dispatch returns a non-null result', async () => {
    const allRegistered = ['parse_hs', 'compile_holoscript'];
    const dispatch = makeDispatch((name) => ({ name, success: true }));

    const report = await buildToolHealthReport(['parse_hs', 'compile_holoscript'], allRegistered, dispatch, true);

    expect(report.total).toBe(2);
    expect(report.live).toBe(2);
    expect(report.scaffold).toBe(0);
    expect(report.stub).toBe(0);
    expect(report.tools.every((t) => t.status === 'live')).toBe(true);
    expect(typeof report.checked_at).toBe('string');
  });

  it('classifies tools as scaffold when dispatch returns success:false', async () => {
    const allRegistered = ['some_tool'];
    const dispatch = makeDispatch(() => ({ success: false, error: 'backend not ready' }));

    const report = await buildToolHealthReport(['some_tool'], allRegistered, dispatch, true);

    expect(report.scaffold).toBe(1);
    expect(report.tools[0]?.status).toBe('scaffold');
    expect(report.tools[0]?.reason).toContain('backend not ready');
  });

  it('classifies tools as stub when dispatch returns null', async () => {
    const allRegistered = ['wired_tool', 'unwired_tool'];
    const dispatch = makeDispatch((name) => (name === 'wired_tool' ? { success: true } : null));

    const report = await buildToolHealthReport(
      ['wired_tool', 'unwired_tool'],
      allRegistered,
      dispatch,
      true
    );

    expect(report.live).toBe(1);
    expect(report.stub).toBe(1);
    const stubEntry = report.tools.find((t) => t.tool === 'unwired_tool');
    expect(stubEntry?.status).toBe('stub');
  });

  it('classifies tools as stub when the tool is not in the registered set', async () => {
    const allRegistered: string[] = [];
    const dispatch = makeDispatch(() => ({ success: true }));

    const report = await buildToolHealthReport(['phantom_tool'], allRegistered, dispatch, true);

    expect(report.stub).toBe(1);
    const entry = report.tools[0];
    expect(entry?.status).toBe('stub');
    expect(entry?.reason).toContain('not found in MCP tool registry');
  });

  it('classifies as scaffold when dispatch throws with a non-stub error message', async () => {
    const allRegistered = ['bad_tool'];
    const dispatch: DispatchFn = async () => { throw new Error('timeout connecting to upstream service'); };

    const report = await buildToolHealthReport(['bad_tool'], allRegistered, dispatch, true);

    expect(report.scaffold).toBe(1);
    expect(report.tools[0]?.status).toBe('scaffold');
    expect(report.tools[0]?.reason).toContain('handler reachable but threw');
  });

  it('classifies as stub when dispatch throws with "not implemented"', async () => {
    const allRegistered = ['stub_tool'];
    const dispatch: DispatchFn = async () => { throw new Error('not implemented'); };

    const report = await buildToolHealthReport(['stub_tool'], allRegistered, dispatch, true);

    expect(report.stub).toBe(1);
  });

  it('filters out stub entries when includeStubs is false', async () => {
    const allRegistered = ['live_tool', 'dead_tool'];
    const dispatch = makeDispatch((name) => (name === 'live_tool' ? { success: true } : null));

    const report = await buildToolHealthReport(
      ['live_tool', 'dead_tool'],
      allRegistered,
      dispatch,
      false
    );

    expect(report.tools.every((t) => t.status !== 'stub')).toBe(true);
    expect(report.total).toBe(1);
  });

  it('surfaces get_tool_health in canary/gap/scaffold/wired goal suggestions', () => {
    const manifest = buildToolManifest(
      [
        tool('get_tool_health', 'Probe each MCP tool category and return wiring status: live, scaffold, or stub'),
        tool('get_tool_manifest', 'Return a machine-readable manifest of all available tools'),
        tool('holo_self_diagnose', 'Diagnose improvement opportunities'),
        tool('parse_hs', 'Parse HoloScript'),
      ],
      { includeInputSchema: false, includeOutputSchema: false }
    );

    for (const goal of [
      'check which tools are wired vs scaffold',
      'find gap in tool coverage',
      'is this tool live or a stub',
    ]) {
      const result = suggestToolsForGoal(goal, manifest, 8);
      const names = result.suggestions.map((s) => s.name);
      expect(names).toContain('get_tool_health');
    }
  });

  it('includes get_tool_health in the control-plane-and-surface-audit bundle', () => {
    const manifest = buildToolManifest(
      [
        tool('get_tool_health', 'Probe tool wiring status'),
        tool('get_tool_manifest', 'Return tool manifest'),
        tool('get_api_reference', 'Get API reference'),
        tool('get_circuit_breaker_status', 'Check circuit breaker status'),
        tool('get_agent_health', 'Get agent health'),
        tool('holoscript_code_health', 'Code health checks'),
        tool('discover_agents', 'Discover agents'),
        tool('execute_holotest', 'Run holotest'),
      ],
      { includeInputSchema: false, includeOutputSchema: false }
    );

    const result = suggestToolsForGoal('audit MCP health and canary surfaces', manifest, 8);
    const bundle = result.suggestedBundles.find((b) => b.name === 'control-plane-and-surface-audit');
    expect(bundle).toBeDefined();
    expect(bundle?.tools).toContain('get_tool_health');
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
