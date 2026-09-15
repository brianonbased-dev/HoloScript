/**
 * Doors audit 2026-09-15 (rework of #299): exits in this package that quote
 * knowledge rows. This MCP sits behind authMiddleware, but a signed-in caller
 * is authenticated, not entitled: premium rows leave as teasers only.
 *
 *  - holo_oracle_consult quoted 200 characters of each row (a short premium
 *    entry came out whole);
 *  - holo_resolve_symbol returned federated rows' content in full;
 *  - knowledge_query sent the full text to a paid-tier caller even when the
 *    5-cent charge did not go through.
 *
 * Every upstream call is answered by a stand-in fetch and the database by a
 * stand-in object; nothing leaves this process. The graph cache points at an
 * empty temporary directory so no real cache is read.
 */
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'fs';

const stand = vi.hoisted(() => {
  const tmp = process.env.TEMP || process.env.TMPDIR || '/tmp';
  const dir = `${tmp}/premium-exits-absorb-side-${process.pid}-${Date.now()}`;
  process.env.ORACLE_TELEMETRY_PATH = `${dir}/oracle-telemetry.jsonl`;
  process.env.HOLOSCRIPT_CACHE_DIR = `${dir}/cache`;
  return { dir, urls: [] as string[] };
});

import { handleOracleTool } from '../oracle-tools';
import { handleCodebaseTool, resetCodebaseToolStateForTests } from '../codebase-tools';
import { handleKnowledgeToolCall, type KnowledgeToolsDeps } from '../knowledge-tools';

const PAID_TAIL = 'SERVICE-SIDE-PAID-TAIL-NOT-FOR-FREE';
const SHORT_SECRET = 'Short paid service tip';
const FREE_TEXT = 'Free service wisdom stays whole';

function upstreamRows(): Array<Record<string, unknown>> {
  return [
    {
      id: 'ap-long',
      type: 'pattern',
      content: `${'Paid pattern text. '.repeat(12)}${PAID_TAIL}`,
      workspace_id: 'ws',
      metadata: { price: 0.05, filePath: 'src/paid.ts', symbolType: 'function' },
    },
    { id: 'ap-short', type: 'gotcha', content: SHORT_SECRET, workspace_id: 'ws', metadata: { price: 0.05 } },
    { id: 'af-free', type: 'wisdom', content: FREE_TEXT, workspace_id: 'ws', metadata: {} },
  ];
}

function expectNoPaidText(body: unknown) {
  const text = JSON.stringify(body);
  expect(text).not.toContain(PAID_TAIL);
  expect(text).not.toContain(SHORT_SECRET);
}

beforeEach(() => {
  stand.urls = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string) => {
      stand.urls.push(String(url));
      return new Response(JSON.stringify({ results: upstreamRows() }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

afterAll(() => {
  fs.rmSync(stand.dir, { recursive: true, force: true });
});

describe('knowledge rows leaving this package (doors audit)', () => {
  it('holo_oracle_consult quotes premium rows from their teaser only', async () => {
    const out = await handleOracleTool('holo_oracle_consult', {
      question: 'how should the knowledge store answer this paid pattern question',
    });

    expect(stand.urls.some((u) => u.endsWith('/knowledge/query'))).toBe(true);
    const text = out.content.map((c) => c.text).join('\n');
    expect(text).toContain('ap-short');
    expect(text).toContain(FREE_TEXT);
    expectNoPaidText(text);
  });

  it('holo_resolve_symbol returns federated premium rows as teasers', async () => {
    resetCodebaseToolStateForTests();
    const out = await handleCodebaseTool('holo_resolve_symbol', { symbolName: 'paidPatternSymbol' });

    expect(stand.urls.some((u) => u.endsWith('/knowledge/query'))).toBe(true);
    const text = JSON.stringify(out);
    expect(text).toContain(FREE_TEXT);
    expect(text).toContain('src/paid.ts');
    expectNoPaidText(text);
  });
});

describe('knowledge_query when the premium charge does not go through (doors audit)', () => {
  type Chain = Record<string, unknown>;
  function chain(result: () => unknown): Chain {
    const handler: ProxyHandler<Chain> = {
      get(_target, prop) {
        if (prop === 'then') {
          return (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
            Promise.resolve(result()).then(resolve, reject);
        }
        return () => proxy;
      },
    };
    const proxy: Chain = new Proxy({}, handler);
    return proxy;
  }

  function deps(charged: boolean): KnowledgeToolsDeps {
    const rows = [
      {
        id: 'kp-1',
        type: 'gotcha',
        workspaceId: 'ws',
        walletAddress: '0x0000000000000000000000000000000000000abc',
        content: SHORT_SECRET,
        isPremium: true,
        metadata: {},
      },
      {
        id: 'kf-1',
        type: 'wisdom',
        workspaceId: 'ws',
        walletAddress: null,
        content: FREE_TEXT,
        isPremium: false,
        metadata: {},
      },
    ];
    return {
      db: { select: () => chain(() => rows), execute: async () => undefined },
      deductCredits: async () => charged,
      addCredits: async () => undefined,
      getTier: async () => 'pro',
    };
  }

  it('a paid-tier caller whose charge fails gets what a free caller gets', async () => {
    const out = await handleKnowledgeToolCall('knowledge_query', { search: 'tip' }, deps(false), 'caller-1');
    const text = out.content[0].text;

    expect(text).toContain(FREE_TEXT);
    expect(text).toContain('"x402_gated": true');
    expectNoPaidText(text);
  });

  it('positive control: when the charge goes through, the paying caller reads the entry', async () => {
    const out = await handleKnowledgeToolCall('knowledge_query', { search: 'tip' }, deps(true), 'caller-1');
    expect(out.content[0].text).toContain(SHORT_SECRET);
  });
});

// Replaced at load: auth headers for the stand-in upstream (no real key is read).
vi.mock('@holoscript/config', async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    mcpAuthHeadersAsync: async () => ({ 'x-mcp-api-key': 'dummy-service-test-key' }),
  };
});
