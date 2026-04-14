/**
 * Paper #5 Embedding Provider Ablation Benchmark
 *
 * Tests OpenAI vs Xenova vs Ollama for GraphRAG query quality and latency.
 * Scans a subset of the codebase, builds an embedding index with each provider,
 * runs the same query set, and reports P@5, latency, and embedding dimensions.
 */

import { CodebaseScanner, OpenAIEmbeddingProvider, OllamaEmbeddingProvider, XenovaEmbeddingProvider } from './dist/engine/index.js';

async function createEmbeddingProvider(opts) {
  switch (opts.provider) {
    case 'openai': return new OpenAIEmbeddingProvider(opts.openaiApiKey, opts.openaiModel);
    case 'xenova': return new XenovaEmbeddingProvider(opts.xenovaModel);
    case 'ollama': return new OllamaEmbeddingProvider(opts.ollamaUrl, opts.ollamaModel);
    default: throw new Error(`Unknown provider: ${opts.provider}`);
  }
}
import { performance } from 'node:perf_hooks';
import { resolve } from 'node:path';
import { config } from 'dotenv';

config({ path: resolve('../../.env') }); // Load from ai-ecosystem/.env
if (!process.env.OPENAI_API_KEY) {
  config({ path: 'c:/Users/josep/.ai-ecosystem/.env' });
}

const SCAN_DIRS = [
  resolve('../../packages/core/src/compiler'),
  resolve('../../packages/engine/src/simulation'),
  resolve('../../packages/snn-webgpu/src'),
];

// Ground truth: queries where we know the correct top results
const QUERIES = [
  {
    query: 'TropicalShortestPaths',
    category: 'Lookup',
    expectedFiles: ['TropicalShortestPaths.ts', 'TropicalGraphUtils.ts'],
  },
  {
    query: 'hash geometry verification',
    category: 'Dependency',
    expectedFiles: ['SimulationContract.ts', 'CAELRecorder.ts'],
  },
  {
    query: 'spiking neural network neuron model',
    category: 'Semantic',
    expectedFiles: ['lif-simulator.ts', 'SNNCognitionEngine.ts', 'snn-network.ts'],
  },
  {
    query: 'compile HoloScript to Unity C#',
    category: 'Architectural',
    expectedFiles: ['UnityCompiler.ts', 'CompilerBase.ts'],
  },
  {
    query: 'provenance semiring conflict resolution',
    category: 'Reasoning',
    expectedFiles: ['ProvenanceSemiring.ts', 'Semiring.ts'],
  },
];

function computeP5(results, expectedFiles) {
  if (!results || results.length === 0) return 0;
  const top5 = results.slice(0, 5);
  let hits = 0;
  for (const r of top5) {
    const file = r.metadata?.filePath || r.file || '';
    const basename = file.split('/').pop()?.split('\\').pop() || '';
    if (expectedFiles.some(e => basename.includes(e.replace('.ts', '')))) {
      hits++;
    }
  }
  return hits / Math.min(5, expectedFiles.length);
}

function computeMRR(results, expectedFiles) {
  if (!results || results.length === 0) return 0;
  for (let i = 0; i < results.length; i++) {
    const file = results[i].metadata?.filePath || results[i].file || '';
    const basename = file.split('/').pop()?.split('\\').pop() || '';
    if (expectedFiles.some(e => basename.includes(e.replace('.ts', '')))) {
      return 1 / (i + 1);
    }
  }
  return 0;
}

async function run() {
  console.log('=== Paper #5: Embedding Provider Ablation ===\n');

  // 1. Scan codebase
  console.log('Scanning codebase subset...');
  const scanner = new CodebaseScanner();
  const scanStart = performance.now();
  const result = await scanner.scan({ rootDirs: SCAN_DIRS, shallow: true });
  const scanTime = performance.now() - scanStart;
  const graph = result.graph || result;
  const symbols = graph.getAllSymbols?.() ?? [];
  console.log(`Scanned in ${(scanTime / 1000).toFixed(1)}s — ${symbols.length} symbols\n`);

  if (symbols.length === 0) {
    console.log('No symbols extracted. Building text corpus from graph stats instead.');
    // Fallback: use graph file list
  }

  // 2. Test each provider
  const providers = [];

  // OpenAI
  if (process.env.OPENAI_API_KEY) {
    providers.push({ name: 'OpenAI', providerName: 'openai', dims: 1536, model: 'text-embedding-3-small' });
  } else {
    console.log('OPENAI_API_KEY not set — skipping OpenAI provider\n');
  }

  // Xenova (local WASM)
  try {
    await import('@huggingface/transformers');
    providers.push({ name: 'Xenova', providerName: 'xenova', dims: 384, model: 'all-MiniLM-L6-v2' });
  } catch {
    console.log('@huggingface/transformers not installed — skipping Xenova\n');
  }

  // Ollama (local server)
  try {
    const ollamaCheck = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    if (ollamaCheck.ok) {
      providers.push({ name: 'Ollama', providerName: 'ollama', dims: 768, model: 'nomic-embed-text' });
    }
  } catch {
    console.log('Ollama not running — skipping Ollama provider\n');
  }

  if (providers.length === 0) {
    console.log('ERROR: No embedding providers available. Need at least one of:');
    console.log('  - OPENAI_API_KEY in env');
    console.log('  - pnpm add @huggingface/transformers');
    console.log('  - ollama serve + ollama pull nomic-embed-text');
    process.exit(1);
  }

  const allResults = [];

  for (const prov of providers) {
    console.log(`\n--- ${prov.name} (${prov.model}, ${prov.dims}-dim) ---`);

    try {
      const provider = await createEmbeddingProvider({ provider: prov.providerName });

      // Build index
      const indexStart = performance.now();
      const texts = symbols.length > 0
        ? symbols.map(s => `${s.name} ${s.type} ${s.documentation || ''} ${s.filePath || ''}`)
        : ['placeholder'];

      // Embed in batches
      const batchSize = 32;
      const embeddings = [];
      for (let i = 0; i < Math.min(texts.length, 500); i += batchSize) {
        const batch = texts.slice(i, i + batchSize);
        const vecs = await provider.embed(batch);
        embeddings.push(...vecs);
      }
      const indexTime = performance.now() - indexStart;
      console.log(`  Index built: ${embeddings.length} vectors in ${(indexTime / 1000).toFixed(1)}s`);

      // Run queries
      const queryResults = [];
      for (const { query, category, expectedFiles } of QUERIES) {
        const qStart = performance.now();
        const [queryVec] = await provider.embed([query]);

        // Cosine similarity search
        const scores = embeddings.map((vec, idx) => {
          let dot = 0, normA = 0, normB = 0;
          for (let d = 0; d < vec.length; d++) {
            dot += vec[d] * queryVec[d];
            normA += vec[d] * vec[d];
            normB += queryVec[d] * queryVec[d];
          }
          return { idx, score: dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-10), metadata: symbols[idx] };
        });
        scores.sort((a, b) => b.score - a.score);

        const qTime = performance.now() - qStart;
        const p5 = computeP5(scores, expectedFiles);
        const mrr = computeMRR(scores, expectedFiles);

        queryResults.push({ category, query, p5, mrr, latencyMs: qTime, topFile: scores[0]?.metadata?.filePath || '?' });
        console.log(`  ${category.padEnd(15)} | P@5=${p5.toFixed(2)} | MRR=${mrr.toFixed(2)} | ${qTime.toFixed(1)}ms | top: ${scores[0]?.metadata?.name || '?'}`);
      }

      const avgP5 = queryResults.reduce((s, r) => s + r.p5, 0) / queryResults.length;
      const avgMRR = queryResults.reduce((s, r) => s + r.mrr, 0) / queryResults.length;
      const avgLatency = queryResults.reduce((s, r) => s + r.latencyMs, 0) / queryResults.length;

      allResults.push({
        provider: prov.name,
        model: prov.model,
        dims: prov.dims,
        indexTimeS: indexTime / 1000,
        avgP5,
        avgMRR,
        avgLatencyMs: avgLatency,
        vectorCount: embeddings.length,
      });

      console.log(`  AVG: P@5=${avgP5.toFixed(2)} | MRR=${avgMRR.toFixed(2)} | ${avgLatency.toFixed(1)}ms/query`);

    } catch (e) {
      console.log(`  FAILED: ${e.message}`);
      allResults.push({ provider: prov.name, model: prov.model, dims: prov.dims, error: e.message });
    }
  }

  // 3. Print LaTeX table
  console.log('\n\n% === LaTeX: Embedding Provider Comparison (Paper #5) ===');
  console.log('\\begin{table}[h]');
  console.log('\\centering');
  console.log('\\caption{Embedding provider comparison for GraphRAG queries (5 categories, same symbol set).}');
  console.log('\\label{tab:provider-ablation}');
  console.log('\\begin{tabular}{lcccccc}');
  console.log('\\toprule');
  console.log('Provider & Model & Dims & Index (s) & P@5 & MRR & Latency (ms) \\\\');
  console.log('\\midrule');
  for (const r of allResults) {
    if (r.error) {
      console.log(`${r.provider} & ${r.model} & ${r.dims} & \\multicolumn{4}{c}{Failed: ${r.error.substring(0, 40)}} \\\\`);
    } else {
      console.log(`${r.provider} & ${r.model} & ${r.dims} & ${r.indexTimeS.toFixed(1)} & ${r.avgP5.toFixed(2)} & ${r.avgMRR.toFixed(2)} & ${r.avgLatencyMs.toFixed(1)} \\\\`);
    }
  }
  console.log('\\bottomrule');
  console.log('\\end{tabular}');
  console.log('\\end{table}');

  console.log('\n=== Benchmark Complete ===');
}

run().catch(e => {
  console.error('Benchmark failed:', e.message);
  process.exit(1);
});
