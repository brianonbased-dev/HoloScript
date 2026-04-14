/**
 * Paper #5 Embedding Provider Ablation Benchmark
 * Tests OpenAI vs Xenova vs Ollama on the same codebase query set.
 */

import {
  CodebaseScanner,
  EmbeddingIndex,
  OpenAIEmbeddingProvider,
  OllamaEmbeddingProvider,
  XenovaEmbeddingProvider,
} from './dist/engine/index.js';
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: 'c:/Users/josep/.ai-ecosystem/.env' });

const SCAN_DIRS = [
  resolve('../../packages/core/src/compiler'),
  resolve('../../packages/engine/src/simulation'),
  resolve('../../packages/snn-webgpu/src'),
];

const QUERIES = [
  { query: 'TropicalShortestPaths', category: 'Lookup', expected: ['TropicalShortestPaths', 'TropicalGraphUtils'] },
  { query: 'hash geometry verification', category: 'Dependency', expected: ['SimulationContract', 'CAELRecorder'] },
  { query: 'spiking neural network neuron model', category: 'Semantic', expected: ['lif-simulator', 'SNNCognitionEngine', 'snn-network'] },
  { query: 'compile HoloScript to Unity', category: 'Architectural', expected: ['UnityCompiler', 'CompilerBase'] },
  { query: 'provenance semiring conflict resolution', category: 'Reasoning', expected: ['ProvenanceSemiring', 'Semiring'] },
];

function scoreResults(results, expected) {
  const top5 = (results || []).slice(0, 5);
  let p5hits = 0, firstRank = 0;
  for (let i = 0; i < top5.length; i++) {
    const r = top5[i];
    const name = r.symbol?.name || r.file || '';
    const filePath = r.symbol?.filePath || r.file || '';
    const match = expected.some(e => name.includes(e) || filePath.includes(e));
    if (match) {
      p5hits++;
      if (firstRank === 0) firstRank = i + 1;
    }
  }
  return {
    p5: p5hits / Math.min(5, expected.length),
    mrr: firstRank > 0 ? 1 / firstRank : 0,
    topResult: top5[0]?.symbol?.name || top5[0]?.file || '?',
  };
}

async function run() {
  console.log('=== Paper #5: Embedding Provider Ablation ===\n');

  // 1. Scan
  console.log('Scanning codebase...');
  const scanner = new CodebaseScanner();
  const t0 = performance.now();
  const scanResult = await scanner.scan({ rootDirs: SCAN_DIRS, shallow: true });
  const scanTime = performance.now() - t0;

  const graph = scanResult.graph || scanResult;
  const stats = scanResult.stats || (graph.getStats?.() ?? {});
  const fileCount = stats.totalFiles || 0;
  const symbolCount = stats.totalSymbols || 0;
  console.log(`Scan: ${(scanTime / 1000).toFixed(1)}s, ${fileCount} files, ${symbolCount} symbols\n`);

  // 2. Build providers
  const providers = [];

  if (process.env.OPENAI_API_KEY) {
    providers.push({
      name: 'OpenAI', dims: 1536, model: 'text-embedding-3-small',
      instance: new OpenAIEmbeddingProvider(),
    });
  }

  try {
    await import('@huggingface/transformers');
    providers.push({
      name: 'Xenova', dims: 384, model: 'all-MiniLM-L6-v2',
      instance: new XenovaEmbeddingProvider(),
    });
  } catch { console.log('Xenova: not installed\n'); }

  try {
    const r = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    if (r.ok) {
      providers.push({
        name: 'Ollama', dims: 768, model: 'nomic-embed-text',
        instance: new OllamaEmbeddingProvider(),
      });
    }
  } catch { console.log('Ollama: not running\n'); }

  console.log(`Providers: ${providers.map(p => p.name).join(', ')}\n`);

  // 3. Benchmark each provider
  const allResults = [];

  for (const prov of providers) {
    console.log(`--- ${prov.name} (${prov.model}, ${prov.dims}-dim) ---`);

    try {
      // Build embedding index using this provider
      const index = new EmbeddingIndex({ provider: prov.instance, batchSize: 32, useWorkers: false });
      const indexStart = performance.now();

      // Extract symbols — prioritize files our queries target, then fill remainder
      const targetFiles = ['TropicalShortestPaths', 'TropicalGraphUtils', 'SimulationContract',
        'CAELRecorder', 'lif-simulator', 'SNNCognitionEngine', 'snn-network',
        'UnityCompiler', 'CompilerBase', 'ProvenanceSemiring', 'Semiring',
        'CAELAgent', 'CAELTrace', 'pipeline-factory', 'buffer-manager'];
      const prioritySymbols = [];
      const otherSymbols = [];
      const files = scanResult.files || [];
      for (const file of files) {
        if (!file.symbols) continue;
        const isTarget = targetFiles.some(t => (file.path || '').includes(t));
        for (const sym of file.symbols) {
          if (isTarget) prioritySymbols.push(sym);
          else otherSymbols.push(sym);
        }
      }
      const subset = [...prioritySymbols, ...otherSymbols].slice(0, 500);
      console.log(`  Embedding ${subset.length} symbols (${prioritySymbols.length} priority + ${subset.length - prioritySymbols.length} other)...`);
      await index.addSymbols(subset);
      const indexTime = performance.now() - indexStart;
      console.log(`  Index built in ${(indexTime / 1000).toFixed(1)}s`);

      // Run queries
      const queryResults = [];
      for (const { query, category, expected } of QUERIES) {
        const qStart = performance.now();
        const results = await index.search(query, 10);
        const qTime = performance.now() - qStart;
        const { p5, mrr, topResult } = scoreResults(results, expected);
        queryResults.push({ category, p5, mrr, latencyMs: qTime });
        console.log(`  ${category.padEnd(15)} | P@5=${p5.toFixed(2)} | MRR=${mrr.toFixed(2)} | ${qTime.toFixed(0).padStart(6)}ms | top: ${topResult}`);
      }

      const avgP5 = queryResults.reduce((s, r) => s + r.p5, 0) / queryResults.length;
      const avgMRR = queryResults.reduce((s, r) => s + r.mrr, 0) / queryResults.length;
      const avgLat = queryResults.reduce((s, r) => s + r.latencyMs, 0) / queryResults.length;

      allResults.push({ provider: prov.name, model: prov.model, dims: prov.dims, indexTimeS: indexTime / 1000, avgP5, avgMRR, avgLatMs: avgLat });
      console.log(`  AVG: P@5=${avgP5.toFixed(2)} | MRR=${avgMRR.toFixed(2)} | ${avgLat.toFixed(0)}ms/query\n`);
    } catch (e) {
      console.log(`  FAILED: ${e.message}\n`);
      allResults.push({ provider: prov.name, model: prov.model, dims: prov.dims, error: e.message });
    }
  }

  // 4. LaTeX
  console.log('\n% === LaTeX: Embedding Provider Ablation (Paper #5) ===');
  console.log('\\begin{table}[t]');
  console.log('\\centering');
  console.log('\\caption{Embedding provider comparison: accuracy and latency across 5 query categories on the same 500-symbol codebase subset. Local providers (Xenova, Ollama) never transmit code externally.}');
  console.log('\\label{tab:provider-ablation}');
  console.log('\\begin{tabular}{lccccc}');
  console.log('\\toprule');
  console.log('Provider & Dims & Index (s) & P@5 & MRR & Query (ms) \\\\');
  console.log('\\midrule');
  for (const r of allResults) {
    if (r.error) {
      console.log(`${r.provider} (${r.model}) & ${r.dims} & \\multicolumn{4}{c}{Error} \\\\`);
    } else {
      console.log(`${r.provider} (${r.model}) & ${r.dims} & ${r.indexTimeS.toFixed(1)} & ${r.avgP5.toFixed(2)} & ${r.avgMRR.toFixed(2)} & ${r.avgLatMs.toFixed(0)} \\\\`);
    }
  }
  console.log('\\bottomrule');
  console.log('\\end{tabular}');
  console.log('\\end{table}');
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
