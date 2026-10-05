import { describe, expect, it } from 'vitest';
import { briefForAgent, resultLine, type FollowUp } from './agent-brief';

/** The agent-facing shape as these tests read it. */
interface Brief {
  detail: 'brief';
  answer?: string;
  error?: unknown;
  hint?: unknown;
  autoRefresh?: unknown;
  count?: number;
  unavailable?: unknown;
  results?: string[];
  resultsTotal?: number;
  omitted: string[];
  followUps: FollowUp[];
}

const brief = (tool: string, args: Record<string, unknown>, result: unknown): Brief =>
  briefForAgent(tool, args, result) as Brief;

const callers = Array.from({ length: 30 }, (_, i) => ({
  callerId: `src/a.ts:fn${i}`,
  calleeName: 'target',
  filePath: 'src/a.ts',
  line: i + 1,
  column: 0,
}));

describe('briefForAgent', () => {
  it('keeps every decisive field verbatim and names everything it leaves out', () => {
    const result = {
      error: 'A codebase graph exists on disk but no longer provably matches the checkout.',
      hint: 'Run holo_absorb_repo ...',
      autoRefresh: { jobId: 'absorb-1', coalesced: false, pollTool: 'holo_get_absorb_status' },
      graphUnavailableReceipt: {
        reason: 'cache_stale',
        requestedPath: '/repo',
        cacheAgeHuman: '13m ago',
        localAdapter: { command: 'x'.repeat(500) },
      },
      coverage: { exactFileSetMatch: true, trackedExclusions: { pathPolicy: 588 } },
    };
    const out = brief('holo_query_codebase', { query: 'callers', symbol: 'x' }, result);
    expect(out.error).toBe(result.error);
    expect(out.hint).toBe(result.hint);
    expect(out.autoRefresh).toEqual(result.autoRefresh);
    expect(out.unavailable).toEqual({ reason: 'cache_stale', requestedPath: '/repo', cacheAge: '13m ago' });
    expect(out.omitted).toEqual(expect.arrayContaining(['coverage']));
    expect(out.followUps).toEqual(
      expect.arrayContaining([
        {
          tool: 'holo_query_codebase',
          args: { query: 'callers', symbol: 'x', detail: 'full' },
          why: expect.any(String),
        },
      ])
    );
    expect(JSON.stringify(out).length).toBeLessThan(JSON.stringify(result).length);
  });

  it('turns long result lists into lines, states the true total, and offers the next questions', () => {
    const out = brief(
      'holo_query_codebase',
      { query: 'callers', symbol: 'target' },
      { query: 'callers of target', results: callers, count: 30 }
    );
    expect(out.count).toBe(30);
    expect(out.results).toHaveLength(20);
    expect(out.resultsTotal).toBe(30);
    expect(out.results?.[0]).toBe('src/a.ts:1 src/a.ts:fn0');
    expect(out.omitted).toEqual(['results beyond the first 20 of 30']);
    expect(out.followUps.map((f) => f.tool)).toEqual([
      'holo_query_codebase',
      'holo_impact_analysis',
      'holo_query_codebase',
    ]);
    expect(out.followUps.at(-1)?.args.detail).toBe('full');
  });

  it('answers graph status in one sentence and says how to fix a stale map', () => {
    const out = brief('holo_graph_status', {}, {
      rootDir: '/repo',
      graphAuthoritative: false,
      semanticIndexReady: false,
      cacheWarm: { inProgress: true, phase: 'Building cached embeddings batch 10/100' },
      diskCache: {
        authoritative: false,
        ageHuman: '2h ago',
        stats: { totalFiles: 10, totalSymbols: 99 },
        hint: 'Call holo_absorb_repo.',
      },
      coverage: { big: 'x'.repeat(2000) },
      embeddingPolicy: { policy: 'x'.repeat(500) },
    });
    expect(out.answer).toBe(
      'Codebase map for /repo is NOT current (10 files, 99 symbols, built 2h ago). Semantic search: index building (Building cached embeddings batch 10/100). Call holo_absorb_repo.'
    );
    expect(out.followUps[0]).toMatchObject({
      tool: 'holo_absorb_repo',
      args: { rootDir: '/repo', force: false },
    });
    // The served workspace needs no path at all (the host-path gate refuses absolute ones).
    const prior = process.env.HOLOSCRIPT_WORKSPACE_ROOT;
    process.env.HOLOSCRIPT_WORKSPACE_ROOT = '/repo';
    try {
      const own = brief('holo_graph_status', {}, { rootDir: '/repo', graphAuthoritative: false });
      expect(own.followUps[0].args).toEqual({ force: false, outputFormat: 'graph' });
    } finally {
      if (prior === undefined) delete process.env.HOLOSCRIPT_WORKSPACE_ROOT;
      else process.env.HOLOSCRIPT_WORKSPACE_ROOT = prior;
    }
    expect(out.omitted).toEqual(
      expect.arrayContaining(['coverage', 'embeddingPolicy', 'diskCache', 'cacheWarm'])
    );
  });

  it('makes absorb-status polls tiny and turns a cancel into a resumable retry', () => {
    const out = brief('holo_get_absorb_status', { jobId: 'j1' }, {
      jobId: 'j1',
      status: 'cancelled',
      progress: 91,
      phase: 'Cancelled',
      rootDir: '/elsewhere',
      cancellation: { reason: 'system_memory_reserve_exhausted', message: 'fell below the floor', requestedAt: 'x' },
      embeddingPolicy: { policy: 'x'.repeat(800) },
      memoryBudget: { a: 1 }, sourceDriftRetry: { b: 2 }, spill: { c: 3 }, phaseMetrics: [], writerKey: 'k', policyHash: 'h', startedAt: 's',
    });
    expect(out).toMatchObject({ jobId: 'j1', status: 'cancelled', progress: 91, rootDir: '/elsewhere' });
    expect((out as unknown as { cancellation: unknown }).cancellation).toEqual({
      reason: 'system_memory_reserve_exhausted',
      message: 'fell below the floor',
    });
    expect(out.followUps[0]).toMatchObject({ tool: 'holo_absorb_repo', args: { rootDir: '/elsewhere', force: false } });
    expect(out.omitted.length).toBeLessThanOrEqual(7);
    expect(out.omitted.at(-1)).toMatch(/^\+\d+ more/);
  });

  it('returns the original object for detail:"full", other tools, and non-objects', () => {
    const result = { results: callers };
    expect(briefForAgent('holo_query_codebase', { detail: 'full' }, result)).toBe(result);
    expect(briefForAgent('parse_hs', {}, result)).toBe(result);
    expect(briefForAgent('holo_query_codebase', {}, 'text')).toBe('text');
  });

  it('renders symbol, semantic, and caller items as readable lines', () => {
    expect(
      resultLine({ symbol: { name: 'run', owner: 'Svc', type: 'method', filePath: 'a.ts', line: 3 }, score: 0.91 })
    ).toBe('a.ts:3 Svc.run (method) score 0.91');
    expect(resultLine({ name: 'parse', type: 'function', file: 'b.ts', line: 7 })).toBe('b.ts:7 parse (function)');
  });

  it('suggests follow-ups with the parameter names the tools actually take', () => {
    const out = brief(
      'holo_query_codebase',
      { query: 'find', symbolName: 'target' },
      { results: [{ name: 'target', type: 'function', filePath: 'src/a.ts', line: 1 }] }
    );
    expect(out.followUps.slice(0, 2)).toEqual([
      { tool: 'holo_query_codebase', args: { query: 'callers', symbolName: 'target' }, why: 'who calls target' },
      { tool: 'holo_impact_analysis', args: { changedSymbol: 'target' }, why: 'what breaks if target changes' },
    ]);
  });

  it('lists real code before tests and benches in an unranked list, and counts the tests', () => {
    const mixed = [
      ...Array.from({ length: 25 }, (_, i) => ({ callerId: `t${i}`, filePath: `src/__tests__/t${i}.test.ts`, line: 1 })),
      { callerId: 'realCaller', filePath: 'src/server.ts', line: 9 },
    ];
    const out = brief('holo_query_codebase', { query: 'callers', symbolName: 'x' }, { results: mixed }) as Brief & {
      resultsTestOrBench?: number;
    };
    expect(out.results?.[0]).toBe('src/server.ts:9 realCaller');
    expect(out.resultsTestOrBench).toBe(25);
  });
});
