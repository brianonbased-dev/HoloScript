/**
 * Round 6 doors audit: what Brittney's model is handed when it calls a tool
 * outside a founder session.
 *
 * #299 cut premium text on knowledge_query only. mcp_call_tool is a wildcard
 * onto any non-reserved tool behind the same service, and every answer is
 * relayed to the user, so the cut belongs on all of them.
 *
 * Nothing leaves this process: a stand-in answers every outbound call.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { executeMCPTool } from '../MCPToolExecutor';

const PAID_TAIL = 'BRITTNEY-PAID-TAIL-NOBODY-READS-FREE';
const SHORT_SECRET = 'Short paid secret';
const FREE_TEXT = 'Free wisdom stays whole';

function upstreamRows(): Array<Record<string, unknown>> {
  return [
    {
      id: 'p-long',
      content: `${'Paid body. '.repeat(12)}${PAID_TAIL}`,
      price: 0.05,
      metadata: { title: `Title ${PAID_TAIL}` },
    },
    { id: 'p-short', content: SHORT_SECRET, metadata: { price: 0.05 } },
    { id: 'p-flagged', content: SHORT_SECRET, premium: true, price: 0 },
    { id: 'f-free', content: FREE_TEXT, price: 0 },
  ];
}

function reply(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

function expectNoPaidText(payload: unknown): void {
  const text = JSON.stringify(payload);
  expect(text).not.toContain(PAID_TAIL);
  expect(text).not.toContain(SHORT_SECRET);
}

beforeEach(() => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => reply({ results: upstreamRows() }))
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Brittney tool answers outside a founder session', () => {
  it('cuts premium text out of an mcp_call_tool answer', async () => {
    const result = await executeMCPTool(
      'mcp_call_tool',
      { server: 'holoscript-tools', tool: 'knowledge_search', args: { query: 'paid' } },
      {}
    );

    expect(result.success).toBe(true);
    const text = JSON.stringify(result.data);
    // The rows still arrive — only the text that was paid for is withheld.
    expect(text).toContain('p-long');
    expect(text).toContain(FREE_TEXT);
    expectNoPaidText(result.data);
  });

  it('cuts premium text out of every other routed answer, not just knowledge_query', async () => {
    for (const toolName of ['mcp_discover_tools', 'mcp_list_servers', 'knowledge_query']) {
      const result = await executeMCPTool(toolName, { search: 'paid' }, {});

      expect(result.success).toBe(true);
      expect(JSON.stringify(result.data)).toContain(FREE_TEXT);
      expectNoPaidText(result.data);
    }
  });

  it('leaves a verified founder session its whole read', async () => {
    const result = await executeMCPTool(
      'mcp_call_tool',
      { server: 'holoscript-tools', tool: 'knowledge_search', args: { query: 'paid' } },
      { allowFounderWorkspace: true }
    );

    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).toContain(PAID_TAIL);
  });

  it('still refuses a founder-reserved target through the wildcard', async () => {
    const result = await executeMCPTool(
      'mcp_call_tool',
      { server: 'holoscript-tools', tool: 'sim_run_paid', args: {} },
      {}
    );

    expect(result.success).toBe(false);
    expect(result.error ?? '').toContain('founder-reserved');
  });
});
