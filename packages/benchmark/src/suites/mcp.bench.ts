/**
 * MCP Throughput Benchmarks
 *
 * Measures tool-call latency and throughput for the MCP server layer.
 * These are in-process benchmarks (no HTTP overhead) that exercise
 * the registry, serialization, and dispatch path.
 */

import { Bench } from 'tinybench';

// ---------------------------------------------------------------------------
// Minimal stubs — mirrors the actual MCP server tool call pipeline shape
// ---------------------------------------------------------------------------

interface ToolRequest {
  tool: string;
  params: Record<string, unknown>;
}

interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

type ToolHandler = (params: Record<string, unknown>) => Promise<ToolResult>;

/** Lightweight in-process tool registry (matches mcp-server dispatch shape). */
class InProcessRegistry {
  private readonly handlers = new Map<string, ToolHandler>();

  register(name: string, handler: ToolHandler): void {
    this.handlers.set(name, handler);
  }

  async dispatch(req: ToolRequest): Promise<ToolResult> {
    const handler = this.handlers.get(req.tool);
    if (!handler) {
      return { content: [{ type: 'text', text: `Unknown tool: ${req.tool}` }], isError: true };
    }
    return handler(req.params);
  }

  serialize(result: ToolResult): string {
    return JSON.stringify(result);
  }
}

// ---------------------------------------------------------------------------
// Test tools that mirror real workload shapes
// ---------------------------------------------------------------------------

const registry = new InProcessRegistry();

registry.register('holoscript_validate', async (params) => {
  // Simulate lightweight validation (string ops, no I/O)
  const source = String(params.source ?? '');
  const hasErrors = source.includes('ERROR');
  return {
    content: [{ type: 'text', text: JSON.stringify({ valid: !hasErrors, errors: [] }) }],
  };
});

registry.register('holoscript_suggest', async (params) => {
  // Simulate trait suggestion — list lookup
  const context = String(params.context ?? '');
  const suggestions = context.length > 10
    ? ['@grabbable', '@collidable', '@networked', '@physics', '@animated']
    : ['@glowing', '@transparent'];
  return {
    content: [{ type: 'text', text: JSON.stringify({ suggestions }) }],
  };
});

registry.register('holoscript_parse_snippet', async (params) => {
  // Simulate snippet parse with JSON round-trip (serialization cost)
  const snippet = String(params.snippet ?? 'object Ball @physics { geometry: "sphere" }');
  const fakeAst = {
    type: 'ObjectDecl',
    name: 'Ball',
    traits: ['@physics'],
    properties: { geometry: 'sphere' },
    source: snippet.length,
  };
  return {
    content: [{ type: 'text', text: JSON.stringify(fakeAst) }],
  };
});

// ---------------------------------------------------------------------------
// Benchmark suite
// ---------------------------------------------------------------------------

const bench = new Bench({ time: 1500 });

const smallSnippet = 'object Ball @physics { geometry: "sphere" }';
const mediumSnippet = `
  object Table @physics @collidable {
    geometry: "box"
    physics: { mass: 5.0, restitution: 0.2 }
    onGrab: { haptic.feedback() }
  }
`.trim();

bench
  .add('mcp-dispatch: validate (no errors)', async () => {
    await registry.dispatch({ tool: 'holoscript_validate', params: { source: smallSnippet } });
  })
  .add('mcp-dispatch: validate + serialize', async () => {
    const result = await registry.dispatch({
      tool: 'holoscript_validate',
      params: { source: mediumSnippet },
    });
    registry.serialize(result);
  })
  .add('mcp-dispatch: suggest (short context)', async () => {
    await registry.dispatch({ tool: 'holoscript_suggest', params: { context: 'obj' } });
  })
  .add('mcp-dispatch: suggest (long context)', async () => {
    await registry.dispatch({
      tool: 'holoscript_suggest',
      params: { context: mediumSnippet },
    });
  })
  .add('mcp-dispatch: parse-snippet + serialize', async () => {
    const result = await registry.dispatch({
      tool: 'holoscript_parse_snippet',
      params: { snippet: mediumSnippet },
    });
    registry.serialize(result);
  })
  .add('mcp-serial: 10x dispatches (burst)', async () => {
    for (let i = 0; i < 10; i++) {
      await registry.dispatch({ tool: 'holoscript_validate', params: { source: smallSnippet } });
    }
  });

export async function runMcpBench() {
  await bench.run();
  return bench;
}
