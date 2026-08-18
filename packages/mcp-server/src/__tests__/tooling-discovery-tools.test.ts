import { describe, expect, it } from 'vitest';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import {
  buildToolManifest,
  suggestToolsForGoal,
  handleBatchToolCall,
  buildToolHealthReport,
  handleToolingDiscoveryTool,
  synthesizeCanaryArgs,
  mayMutate,
  isDenial,
  mayCost,
  registerHolonTools,
  setToolHealthDispatcher,
  getToolHealthDispatcher,
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

    const result = suggestToolsForGoal(
      'parse validate and compile this HoloScript scene',
      manifest,
      10
    );

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
    expect(result.suggestedBundles.some((b) => b.name === 'control-plane-and-surface-audit')).toBe(
      true
    );
    const bundle = result.suggestedBundles.find(
      (b) => b.name === 'control-plane-and-surface-audit'
    );
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
    const manifest = buildToolManifest([tool('parse_hs', 'Parse HoloScript into AST')], {
      includeInputSchema: false,
      includeOutputSchema: false,
    });

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

    const report = await buildToolHealthReport(
      ['parse_hs', 'compile_holoscript'],
      allRegistered,
      dispatch,
      true
    );

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

  // Regression, 2026-08-16 (customer journey `trust-a-tool-before-using-it`).
  // The live anchor advertised holo_write_file in tools/list, its own health tool
  // threw "Unknown graph tool: holo_write_file", and it labelled that SCAFFOLD.
  // The stub check was a literal `includes('unknown tool')` and the word "graph"
  // sits between the two — so an absent tool was reported as partially built.
  // A customer reads scaffold as "half-done", not "does not exist".
  it('classifies an unroutable tool as stub, whatever words the error uses', async () => {
    const unroutable = [
      'Unknown graph tool: holo_write_file', // the exact live message
      'Unknown tool: x',
      'Unsupported codebase tool: y',
      'No such tool: z',
      'Tool not implemented',
      'handler not wired',
      'unrecognized tool',
    ];

    for (const msg of unroutable) {
      const dispatch = makeDispatch(() => {
        throw new Error(msg);
      });
      const report = await buildToolHealthReport(['t'], ['t'], dispatch, true);
      expect(report.tools[0]?.status, `"${msg}" should be stub, not scaffold`).toBe('stub');
      expect(report.stub).toBe(1);
    }
  });

  it('keeps a routed-but-incomplete tool as scaffold rather than sweeping it into stub', async () => {
    // The opposite direction. Widening the stub match must not swallow tools that
    // ARE wired and failed for an ordinary reason — note "no such file" must not
    // be caught by the "no such tool" pattern.
    const incomplete = [
      'Missing required argument: path',
      'Parser error at line 3',
      'ENOENT: no such file or directory',
      'graph not ready — run holo_absorb_repo first',
      'timeout after 30000ms',
    ];

    for (const msg of incomplete) {
      const dispatch = makeDispatch(() => {
        throw new Error(msg);
      });
      const report = await buildToolHealthReport(['t'], ['t'], dispatch, true);
      expect(report.tools[0]?.status, `"${msg}" should stay scaffold`).toBe('scaffold');
    }
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
    const dispatch: DispatchFn = async () => {
      throw new Error('timeout connecting to upstream service');
    };

    const report = await buildToolHealthReport(['bad_tool'], allRegistered, dispatch, true);

    expect(report.scaffold).toBe(1);
    expect(report.tools[0]?.status).toBe('scaffold');
    expect(report.tools[0]?.reason).toContain('handler reachable but threw');
  });

  it('classifies as stub when dispatch throws with "not implemented"', async () => {
    const allRegistered = ['stub_tool'];
    const dispatch: DispatchFn = async () => {
      throw new Error('not implemented');
    };

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
        tool(
          'get_tool_health',
          'Probe each MCP tool category and return wiring status: live, scaffold, or stub'
        ),
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
    const bundle = result.suggestedBundles.find(
      (b) => b.name === 'control-plane-and-surface-audit'
    );
    expect(bundle).toBeDefined();
    expect(bundle?.tools).toContain('get_tool_health');
  });

  // ---------------------------------------------------------------------------
  // holon field (board task_1783967615617_deaf — holon registry discovery wiring)
  // ---------------------------------------------------------------------------

  it('tags tools with their holon brand via the curated prefix map', () => {
    const manifest = buildToolManifest(
      [
        tool('holo_secrets_grant', 'Grant a scoped secret lease'),
        tool('holo_secrets_resolve', 'Resolve a secret value'),
        tool('holo_secrets_revoke', 'Revoke a secret lease'),
        tool('holo_tunnel_create', 'Open a HoloTunnel share'),
        tool('holo_tunnel_status', 'Check tunnel status'),
        tool('holo_tunnel_close', 'Close a tunnel'),
        tool('parse_hs', 'Parse HoloScript into AST'),
      ],
      { includeInputSchema: false, includeOutputSchema: false }
    );

    // Spot check from the board task: holo_secrets_* -> HoloKey, holo_tunnel_* -> HoloTunnel.
    for (const name of ['holo_secrets_grant', 'holo_secrets_resolve', 'holo_secrets_revoke']) {
      expect(manifest.find((t) => t.name === name)?.holon).toBe('HoloKey');
    }
    for (const name of ['holo_tunnel_create', 'holo_tunnel_status', 'holo_tunnel_close']) {
      expect(manifest.find((t) => t.name === name)?.holon).toBe('HoloTunnel');
    }

    // A tool with no known holon mapping gets no `holon` field at all (not a
    // falsy placeholder) so JSON output stays clean for the common case.
    expect(manifest.find((t) => t.name === 'parse_hs')?.holon).toBeUndefined();
    expect(
      Object.prototype.hasOwnProperty.call(
        manifest.find((t) => t.name === 'parse_hs') ?? {},
        'holon'
      )
    ).toBe(false);
  });

  /**
   * HoloAbsorb is a registered, active holon whose own registry entry says
   * "legacy references to Absorb or Codebase Intelligence refer to this same
   * product" and whose advertised_surfaces.mcp_tools is true — while no tool in the
   * manifest carried the name. Its tools share a package, not a prefix, so the brand
   * is registered from the real tool arrays at startup.
   */
  it('brands absorb-service tools as HoloAbsorb, by package not by prefix', () => {
    // Provenance registration: names that share no prefix at all.
    registerHolonTools('HoloAbsorb', [
      'holo_query_codebase',
      'holo_semantic_search',
      'holo_ask_codebase',
      'holo_graph_status',
    ]);

    const manifest = buildToolManifest(
      [
        tool('holo_query_codebase', 'Query the codebase graph'),
        tool('holo_semantic_search', 'Semantic search over the codebase'),
        tool('holo_ask_codebase', 'Ask a question about the codebase'),
        tool('absorb_query', 'GraphRAG query'),
        tool('holo_absorb_repo', 'Absorb a repository'),
        tool('holo_get_absorb_status', 'Absorb job status'),
        tool('parse_hs', 'Parse HoloScript'),
      ],
      { includeInputSchema: false, includeOutputSchema: false }
    );

    const holonOfTool = (name: string) => manifest.find((t) => t.name === name)?.holon;

    // Registered by provenance…
    expect(holonOfTool('holo_query_codebase')).toBe('HoloAbsorb');
    expect(holonOfTool('holo_semantic_search')).toBe('HoloAbsorb');
    expect(holonOfTool('holo_ask_codebase')).toBe('HoloAbsorb');
    // …and by prefix for the ones that ship from this package instead.
    expect(holonOfTool('absorb_query')).toBe('HoloAbsorb');
    expect(holonOfTool('holo_absorb_repo')).toBe('HoloAbsorb');
    expect(holonOfTool('holo_get_absorb_status')).toBe('HoloAbsorb');
    // An unrelated tool is not swept into the brand.
    expect(holonOfTool('parse_hs')).toBeUndefined();
  });

  it('lets provenance override a prefix guess', () => {
    // holo_graph_* maps to HoloGraph by prefix, but holo_graph_status ships from
    // absorb-service. The registry's own note puts HoloGraph *beneath* HoloAbsorb,
    // so the package a tool actually comes from has to win over the name pattern.
    registerHolonTools('HoloAbsorb', ['holo_graph_status']);
    const manifest = buildToolManifest(
      [tool('holo_graph_status', 'Graph status'), tool('holo_graph_diff', 'Graph diff')],
      { includeInputSchema: false, includeOutputSchema: false }
    );
    expect(manifest.find((t) => t.name === 'holo_graph_status')?.holon).toBe('HoloAbsorb');
    expect(manifest.find((t) => t.name === 'holo_graph_diff')?.holon).toBe('HoloGraph');
  });

  it('resolves an exact-name holon mapping without prefix collision', () => {
    const manifest = buildToolManifest(
      [
        tool('holo_ci_dispatch', 'Dispatch remote CI'),
        tool('compile_to_holob', 'Compile to HoloVM bytecode'),
      ],
      { includeInputSchema: false, includeOutputSchema: false }
    );
    expect(manifest.find((t) => t.name === 'holo_ci_dispatch')?.holon).toBe('HoloCI');
    expect(manifest.find((t) => t.name === 'compile_to_holob')?.holon).toBe('HoloVM');
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

/**
 * get_tool_manifest used to return every tool unconditionally. On 2026-08-04 that
 * was 429 tools / 152,579 bytes WITH every optional field already switched off —
 * unusable by the LLM that is this tool's primary consumer, and the reason the
 * `discover-the-surface-in-context` customer journey blocked.
 *
 * The budget below is that journey's assertion, not a number picked here. These
 * tests exist so the response can never quietly grow back past it.
 */
/**
 * get_tool_health exists so a customer can ask "is this tool real?" before relying
 * on it. On 2026-08-16 it was wrong in both directions at once, and the errors
 * pointed the same way — condemning tools that work:
 *
 *  1. It probed through handlers.ts's switch instead of the registry that serves
 *     customers, so all 65 compiler tools answered "Unknown tool". compile_to_r3f
 *     and compile_to_unity were reported "not routed" and both worked when called.
 *  2. Only 34 of 429 tools had curated arguments; the other 395 were called with
 *     `{}`. A tool that correctly rejects an empty call was recorded as broken —
 *     the probe was punishing input validation.
 */
describe('get_tool_health probes tools the way a customer calls them', () => {
  const schemaOf = (required: string[], properties: Record<string, unknown>) => ({
    type: 'object' as const,
    properties,
    required,
  });

  it('derives arguments from the tool schema instead of calling with nothing', () => {
    const args = synthesizeCanaryArgs(
      schemaOf(['code', 'target'], {
        code: { type: 'string' },
        target: { type: 'string', enum: ['r3f', 'unity'] },
      })
    );
    expect(args).not.toBeNull();
    expect(typeof args!.code).toBe('string');
    expect((args!.code as string).length).toBeGreaterThan(0);
    // An enum has one honest answer already written down — use it, don't invent one.
    expect(args!.target).toBe('r3f');
  });

  it('refuses to invent an object argument rather than manufacture a failure', () => {
    // Whatever we made up, the tool would try to interpret it, and a wrong guess
    // looks exactly like a broken tool. Not knowing is the honest verdict.
    expect(synthesizeCanaryArgs(schemaOf(['spans'], { spans: { type: 'object' } }))).toBeNull();
    expect(synthesizeCanaryArgs(schemaOf(['calls'], {}))).toBeNull();
  });

  it('returns empty args for a tool that requires none', () => {
    expect(synthesizeCanaryArgs(schemaOf([], { verbose: { type: 'boolean' } }))).toEqual({});
    expect(synthesizeCanaryArgs(undefined)).toEqual({});
  });

  it('does not convict a tool for rejecting arguments the probe invented', async () => {
    const tools = [tool('needs_real_input', 'Wants a genuine document')];
    tools[0].inputSchema = schemaOf(['code'], { code: { type: 'string' } });

    const report = await buildToolHealthReport(
      ['needs_real_input'],
      ['needs_real_input'],
      async () => {
        throw new Error('code must be a valid document, got "orb Cube { geometry: \\"cube\\" }"');
      },
      true,
      tools
    );

    const entry = report.tools[0];
    expect(entry.status).toBe('unprobed');
    expect(entry.reason).toMatch(/invented arguments/i);
    // "unprobed" must not be quietly counted as working.
    expect(report.live).toBe(0);
    expect(report.scaffold).toBe(0);
  });

  it('still convicts a tool that needs no arguments and throws anyway', async () => {
    // The narrowing above must not become an excuse that swallows real breakage:
    // this tool was called exactly as documented and still failed.
    const tools = [tool('takes_nothing', 'No arguments required')];
    tools[0].inputSchema = schemaOf([], {});

    const report = await buildToolHealthReport(
      ['takes_nothing'],
      ['takes_nothing'],
      async () => {
        throw new Error('ENOENT: no such file or directory');
      },
      true,
      tools
    );

    expect(report.tools[0].status).toBe('scaffold');
    expect(report.scaffold).toBe(1);
  });

  it('reports a genuinely unrouted tool as stub, not as unknown-argument noise', async () => {
    const tools = [tool('ghost_tool', 'Advertised but never wired')];
    tools[0].inputSchema = schemaOf(['code'], { code: { type: 'string' } });

    const report = await buildToolHealthReport(
      ['ghost_tool'],
      ['ghost_tool'],
      async () => {
        throw new Error('Unknown tool: ghost_tool');
      },
      true,
      tools
    );

    expect(report.tools[0].status).toBe('stub');
    expect(report.stub).toBe(1);
  });

  it('never invents arguments for a tool that can change state', async () => {
    // Schema-derived probing made this check able to actually EXECUTE tools, not
    // just fail to call them. holo_write_file requires two plain strings, which the
    // synthesizer fills in happily. Nothing was written when this was caught, but a
    // diagnostic that can write a file is a worse problem than the one it diagnoses.
    expect(mayMutate('holo_write_file')).toBe(true);
    expect(mayMutate('holo_git_commit')).toBe(true);
    expect(mayMutate('settle_creator_payout')).toBe(true);
    expect(mayMutate('delete_world')).toBe(true);
    expect(mayMutate('hololand_revoke_player')).toBe(true);
    expect(mayMutate('quiet_name', 'Persists the record to disk.')).toBe(true);

    // …while read-only tools stay probeable, or the check would blind itself.
    expect(mayMutate('get_workspace_info')).toBe(false);
    expect(mayMutate('parse_holo')).toBe(false);
    expect(mayMutate('list_export_targets')).toBe(false);
    expect(mayMutate('explain_trait')).toBe(false);
  });

  it('refuses to probe a mutating tool even when its arguments are easy to invent', async () => {
    const tools = [tool('holo_write_file', 'Write content to a file')];
    tools[0].inputSchema = schemaOf(['filePath', 'content'], {
      filePath: { type: 'string' },
      content: { type: 'string' },
    });

    let called = false;
    const report = await buildToolHealthReport(
      ['holo_write_file'],
      ['holo_write_file'],
      async () => {
        called = true;
        return { success: true };
      },
      true,
      tools
    );

    expect(called).toBe(false); // the whole point
    expect(report.tools[0].status).toBe('unprobed');
    expect(report.tools[0].reason).toMatch(/change state/i);
  });

  it('will not probe a payout tool even when the canary table names it', async () => {
    // `settle_creator_payout: {}` sat in the canary table, so every health check
    // called a payout function and only a capability gate stood between a
    // diagnostic and moving money. A curated entry must not buy an exemption.
    const tools = [tool('settle_creator_payout', 'Pay a creator their balance')];
    tools[0].inputSchema = { type: 'object', properties: {} };

    let called = false;
    const report = await buildToolHealthReport(
      ['settle_creator_payout'],
      ['settle_creator_payout'],
      async () => {
        called = true;
        return { success: true };
      },
      true,
      tools
    );

    expect(called).toBe(false);
    expect(report.tools[0].status).toBe('unprobed');
    expect(report.tools[0].reason).toMatch(/never do that|change state/i);
  });

  /**
   * Loosening a safety guard to raise a coverage number is the exact move this
   * codebase distrusts, so the loosening gets a tighter test than the tightening did.
   * Every genuinely destructive tool on the live surface is listed here by name: if
   * a future refinement of mayMutate lets any of them through, this fails.
   */
  it('still refuses every destructive tool after the guard was narrowed', () => {
    const mustRefuse = [
      'delete_world', 'delete_shard', 'delete_zone', 'absorb_delete_project',
      'update_world', 'update_zone', 'update_place', 'create_world', 'create_share_link',
      'hololand_revoke_player', 'hololand_revoke_creator', 'twin_earth_revoke_identity',
      'twin_earth_grant_permission', 'holo_secrets_grant', 'twin_earth_robot_actuate',
      'hololand_publish_zone', 'holo_protocol_publish', 'holomesh_publish_agent_template',
      'holo_git_commit', 'holo_write_file', 'holo_edit_file', 'workflow_memory_write',
      'install_plugin', 'install_domain_plugin', 'holomesh_send_message',
      'holo_hologram_send', 'settle_creator_payout', 'holotune_promote',
      'holotune_launch', 'holo_memory_store', 'holo_memory_graduate', 'train_rom',
      'holomesh_board_claim', 'holomesh_slot_assign', 'holomesh_mode_set',
      'absorb_run_absorb', 'absorb_create_project', 'holoshell_download_recovery_quarantine',
      // Found only by auditing what was still unprobed: these form a team, admit an
      // artifact and resume a download. All three change something; none of their
      // verbs was in the original list, so all three were sitting in the probeable pile.
      'holomesh_team_form', 'conformance_admit_artifact', 'holoshell_download_recovery_resume',
    ];
    const leaked = mustRefuse.filter((t) => !mayMutate(t));
    expect(leaked).toEqual([]);
  });

  it('keeps the read-only sibling of an admit/form tool probeable', () => {
    // The guard must not swallow the whole family: checking an artifact is a read,
    // admitting one is not. A guard that blocks both is as useless as one that
    // blocks neither.
    expect(mayMutate('conformance_check_artifact')).toBe(false);
    expect(mayMutate('conformance_list_rules')).toBe(false);
    expect(mayMutate('conformance_admit_artifact')).toBe(true);
  });

  it('stops reading a product name as a verb', () => {
    // "absorb" is the product, not the operation. These three are reads and were
    // blocked for seventeen tools' worth of no reason.
    expect(mayMutate('absorb_query')).toBe(false);
    expect(mayMutate('absorb_diff')).toBe(false);
    expect(mayMutate('absorb_list_projects')).toBe(false);
    // …but the operation still wins when there is a real verb after the prefix.
    expect(mayMutate('absorb_run_absorb')).toBe(true);
    expect(mayMutate('absorb_delete_project')).toBe(true);
  });

  it('lets a read verb outrank a description that mentions creating', () => {
    // holo_get_node_connections parses code and walks a graph. Its description
    // mentions what gets created in the graph, and that classed it as a mutation.
    expect(mayMutate('holo_get_node_connections', 'Shows nodes it creates edges between')).toBe(
      false
    );
    expect(mayMutate('list_worlds', 'Lists every world a creator created')).toBe(false);
    // A bland name with an honest description is still caught.
    expect(mayMutate('holo_snapshot', 'Persists the current state to disk.')).toBe(true);
  });

  it('separates costs-money from changes-state', () => {
    // generate_* changes nothing — it computes and returns — but a 429-tool sweep
    // would bill an inference provider for every one of them, every run.
    expect(mayCost('generate_object')).toBe(true);
    expect(mayCost('generate_scene')).toBe(true);
    expect(mayCost('sim_run_paid')).toBe(true);
    expect(mayCost('twin_earth_ai_invoke')).toBe(true);
    expect(mayCost('parse_holo')).toBe(false);
    expect(mayCost('get_workspace_info')).toBe(false);
  });

  it('reads a permission refusal as a working gate, not a broken tool', () => {
    expect(isDenial('ForkSandboxGate denied tool "get_creator_earnings": Capability missing')).toBe(
      true
    );
    expect(isDenial('Unauthorized')).toBe(true);
    expect(isDenial('Insufficient scope. Required one of: [tools:read]')).toBe(true);
    // …without swallowing genuine faults, which is the failure mode of a broad match.
    expect(isDenial('Cannot read properties of undefined')).toBe(false);
    expect(isDenial('ENOENT: no such file or directory')).toBe(false);
    expect(isDenial('No robotics {} block found in composition')).toBe(false);
  });

  it('files a denied tool as unprobed rather than scaffold', async () => {
    const tools = [tool('gated_tool', 'Reads earnings')];
    tools[0].inputSchema = { type: 'object', properties: {} };

    const report = await buildToolHealthReport(
      ['gated_tool'],
      ['gated_tool'],
      async () => ({
        success: false,
        error: 'ForkSandboxGate denied tool "gated_tool": Capability missing',
      }),
      true,
      tools
    );

    expect(report.tools[0].status).toBe('unprobed');
    expect(report.scaffold).toBe(0);
    expect(report.tools[0].reason).toMatch(/not permitted/i);
  });

  it('installs and reads back the customer-facing dispatcher', () => {
    expect(getToolHealthDispatcher()).toBeNull();
    const dispatch = async () => ({ ok: true });
    setToolHealthDispatcher(dispatch);
    expect(getToolHealthDispatcher()).toBe(dispatch);
    setToolHealthDispatcher(null);
    expect(getToolHealthDispatcher()).toBeNull();
  });
});

describe('get_tool_manifest stays inside a context budget', () => {
  const BUDGET_BYTES = 60_000;
  const bytes = (payload: unknown) => Buffer.byteLength(JSON.stringify(payload), 'utf8');
  const dispatch = async () => null;

  /** 429 tools with realistic descriptions — the shape that overflowed in production. */
  const bigSurface: Tool[] = Array.from({ length: 429 }, (_, i) => {
    const prefixes = ['compile_to_', 'holomesh_', 'holo_graph_', 'hs_', 'holotune_', 'get_'];
    const prefix = prefixes[i % prefixes.length];
    return tool(
      `${prefix}fixture_${i}`,
      `Fixture tool ${i}. Description padded to the length real tool descriptions run to, ` +
        `because the defect being guarded here is total response size and a fixture with ` +
        `one-word descriptions would pass a budget the real surface blows straight through.`
    );
  });

  const manifestArgs = {
    includeInputSchema: false,
    includeOutputSchema: false,
    includeExamples: false,
  };

  const callManifest = (args: Record<string, unknown>) =>
    handleToolingDiscoveryTool('get_tool_manifest', { ...manifestArgs, ...args }, bigSurface, dispatch);

  it('would blow the budget if every tool were returned — the fixture is honest', async () => {
    const all = (await callManifest({ all: true })) as { tools: unknown[] };
    expect(all.tools).toHaveLength(429);
    expect(bytes(all)).toBeGreaterThan(BUDGET_BYTES);
  });

  it('returns the category index, not 151 kB of tools, when called with no scope', async () => {
    const payload = (await callManifest({})) as {
      count: number;
      categories: Record<string, number>;
      tools: unknown[];
      note?: string;
    };

    expect(bytes(payload)).toBeLessThan(BUDGET_BYTES);
    expect(payload.tools).toHaveLength(0);
    // The full count is still stated. Withholding entries is not the same as
    // pretending the surface is smaller than it is.
    expect(payload.count).toBe(429);
    expect(Object.values(payload.categories).reduce((a, b) => a + b, 0)).toBe(429);
    expect(payload.note).toMatch(/category|scope/i);
  });

  it('pages a scoped request and says what it withheld', async () => {
    const category = Object.entries(
      ((await callManifest({})) as { categories: Record<string, number> }).categories
    ).sort((a, b) => b[1] - a[1])[0][0];

    const first = (await callManifest({ category })) as {
      count: number;
      tools: Array<{ name: string }>;
      note?: string;
      nextOffset?: number;
    };

    expect(bytes(first)).toBeLessThan(BUDGET_BYTES);
    expect(first.tools.length).toBeGreaterThan(0);
    expect(first.tools.length).toBeLessThanOrEqual(first.count);

    if (first.tools.length < first.count) {
      // Silent truncation reads as "that is everything". It must not be silent.
      expect(first.note).toMatch(/not shown/i);
      expect(first.nextOffset).toBe(first.tools.length);

      const second = (await callManifest({ category, offset: first.nextOffset })) as {
        tools: Array<{ name: string }>;
      };
      expect(second.tools.length).toBeGreaterThan(0);
      expect(second.tools[0].name).not.toBe(first.tools[0].name);
    }
  });

  it('says a category does not exist rather than returning a bare empty list', async () => {
    const payload = (await callManifest({ category: 'no-such-category' })) as {
      count: number;
      tools: unknown[];
      note?: string;
    };
    expect(payload.count).toBe(0);
    expect(payload.tools).toHaveLength(0);
    expect(payload.note).toMatch(/no category "no-such-category"/i);
  });

  it('filters by pattern across name, description and tags', async () => {
    const payload = (await callManifest({ pattern: 'fixture_7' })) as {
      count: number;
      tools: Array<{ name: string }>;
    };
    expect(payload.count).toBeGreaterThan(0);
    expect(payload.tools.every((t) => t.name.includes('fixture_7'))).toBe(true);
  });
});
