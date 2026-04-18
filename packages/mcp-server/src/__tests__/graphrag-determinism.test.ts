import { describe, test, expect, vi, afterEach } from 'vitest';
import { handleAbsorbProvenanceTool, fetchOrchestratorGraphContext } from '../absorb-provenance-tools';
import { hashBytes } from '../../../core/src/testing/DeterminismHarness';

function calcStats(samples: number[]) {
  const n = samples.length;
  const mean = samples.reduce((a, b) => a + b, 0) / n;
  const variance = samples.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (n - 1 || 1);
  const stddev = Math.sqrt(variance);
  return { mean, stddev };
}

describe('GraphRAG Provenance Determinism (Paper #5)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.HOLOMESH_API_KEY;
    delete process.env.HOLOSCRIPT_API_KEY;
    delete process.env.GITHUB_SHA;
  });

  test('Evidence Hash Determinism (1,000 executions)', async () => {
    // We verify determinism by executing 200 benchmark queries 5 times
    // (1,000 executions total) and comparing evidence hashes.
    
    // Setup 200 diverse mock queries to simulate the GraphRAG answer payload
    const mockQueries = Array.from({ length: 200 }).map((_, i) => ({
      question: `Query ${i}: How does the system resolve dependencies?`,
      mockRaw: {
        answer: `The system uses a graph traversal mechanism across ${i * 10} modules.`,
        citations: [
          { file: `src/module_${i}.ts`, symbol: `resolver_${i}`, snippet: `function resolver_${i}() { ... }` },
          { file: `src/utils_${i}.ts`, symbol: `helper_${i}`, snippet: `const helper_${i} = () => { ... }` }
        ],
        results: Array.from({ length: 5 }).map((_, j) => ({
           id: `W.TEST.${i}.${j}`,
           metadata: { provenanceHash: `ph_${i}_${j}` },
           created_at: `2026-04-${((j % 28) + 1).toString().padStart(2, '0')}T10:00:00.000Z`
        }))
      }
    }));

    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, options: any) => {
        const body = JSON.parse(options.body);
        const qIndex = parseInt(body.search.match(/Query (\\d+)/)?.[1] || '0', 10);
        return {
          ok: true,
          json: async () => ({
            results: mockQueries[qIndex].mockRaw.results
          })
        };
      })
    );
    process.env.HOLOMESH_API_KEY = 'test-key';

    const executionsPerQuery = 5;
    let totalDivergentSets = 0;
    
    const creationTimeSamples: number[] = [];
    
    for (const mq of mockQueries) {
      const hashes = new Set<string>();
      
      for (let e = 0; e < executionsPerQuery; e++) {
        // Measure overhead
        const t0 = performance.now();
        const result = (await handleAbsorbProvenanceTool(
          'absorb_provenance_answer',
          { question: mq.question },
          async () => mq.mockRaw
        )) as Record<string, unknown>;
        const t1 = performance.now();
        
        creationTimeSamples.push((t1 - t0) * 1000); // in microseconds
        
        const provenance = result.provenance as Record<string, unknown>;
        hashes.add(provenance.evidenceHash as string);
      }
      
      if (hashes.size !== 1) {
        totalDivergentSets++;
      }
    }
    
    const stats = calcStats(creationTimeSamples);

    console.log(`\nPaper 5: GraphRAG Provenance Determinism Benchmark`);
    console.log(`Total queries: ${mockQueries.length}`);
    console.log(`Executions per query: ${executionsPerQuery} (Total: ${mockQueries.length * executionsPerQuery})`);
    console.log(`Divergent hash sets: ${totalDivergentSets}`);
    console.log(`Provenance envelope creation overhead: ${stats.mean.toFixed(2)} µs ± ${stats.stddev.toFixed(2)} µs`);
    console.log(`100% Identical evidence hashes: ${totalDivergentSets === 0 ? 'YES' : 'NO'}\n`);

    expect(totalDivergentSets).toBe(0);
    // Overhead should be less than 5ms (the paper claims ~3 microseconds, but JS Date/fetch mocks add overhead).
    expect(stats.mean).toBeLessThan(5000); 
  });
});
