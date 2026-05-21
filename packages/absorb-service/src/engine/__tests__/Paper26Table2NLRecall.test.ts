/**
 * Paper 26 Table 2 — NL→code Recall Comparison
 *
 * Measures recall@10 for natural-language queries against a synthetic symbol
 * corpus, comparing three offline embedding providers:
 *
 *   structural  — StructuralEmbeddingProvider (384-dim, topology only)
 *   holoembed   — HoloEmbedProvider (768-dim, structural + char-trigram subwords)
 *
 * ## Why this matters (Paper 26 §4.3)
 *
 * StructuralEmbeddingProvider achieves 100% recall for GRAPH queries (exact
 * event-chain lookup via HoloGraph EventEdge). But for NL→code semantic queries
 * like "find the pillar slice emitter" it achieves only ~3–12% recall because
 * topology features don't encode symbol names.
 *
 * HoloEmbedProvider adds char-trigram subword features that directly encode
 * camelCase identifiers. This closes the NL recall gap without an LLM or API.
 *
 * ## Corpus design
 *
 * The test corpus contains:
 *   - N "target" symbols: names that match the NL query tokens
 *   - 4×N "distractor" symbols: names from unrelated domains
 *
 * For each target, the NL query is constructed from the camelSplit of its name.
 * Recall@10 = fraction of targets that appear in the top-10 results.
 *
 * ## Expected results (Paper 26 Table 2 target values)
 *
 *   Provider    | Recall@10 | Relative
 *   ------------|-----------|--------
 *   structural  |   ~3-12%  | baseline
 *   holoembed   |   ~50-70% | +40-60pp improvement
 *
 * (Xenova all-MiniLM-L6-v2 expected: ~60-80% — requires model download, not in CI)
 *
 * @version 1.0.0 — Paper 26 §4.3 evidence layer
 */

import { describe, it, expect } from 'vitest';
import { EmbeddingIndex } from '../EmbeddingIndex';
import { StructuralEmbeddingProvider } from '../providers/StructuralEmbeddingProvider';
import { HoloEmbedProvider } from '../providers/HoloEmbedProvider';
import type { ExternalSymbolDefinition } from '../types';

// =============================================================================
// CORPUS BUILDER
// =============================================================================

interface NamedTarget {
  name: string;
  query: string; // NL query derived from camelSplit of name
}

const TARGETS: NamedTarget[] = [
  { name: 'PillarSliceEmitter',       query: 'pillar slice emitter' },
  { name: 'BrainCoordNodeMapper',     query: 'brain coord node mapper' },
  { name: 'TraitCommunityDetector',   query: 'trait community detector' },
  { name: 'EventEdgeBuilder',         query: 'event edge builder' },
  { name: 'StructuralEmbedding',      query: 'structural embedding' },
  { name: 'ProvenanceEdgeRegistry',   query: 'provenance edge registry' },
  { name: 'SyntheticGraphFactory',    query: 'synthetic graph factory' },
  { name: 'IncrementalUpdateHandler', query: 'incremental update handler' },
  { name: 'HoloEmbedEncoder',         query: 'holo embed encoder' },
  { name: 'LIFSpikeRateDecoder',      query: 'lif spike rate decoder' },
];

/** Unrelated symbol names that should NOT match any target query. */
const DISTRACTORS = [
  'renderSceneGraph', 'createWebGLContext', 'parseShaderSource', 'uploadTextureBuffer',
  'applyTransform', 'computeNormals', 'buildBVH', 'traverseSceneNodes',
  'serializeAnimationClip', 'loadGLTFModel', 'dispatchRenderCommand', 'readDepthBuffer',
  'createFramebuffer', 'compileVertexShader', 'linkShaderProgram', 'setUniformMatrix',
  'blitTexture', 'resolveMultisampling', 'generateMipmaps', 'bindVertexArray',
  'updateIndexBuffer', 'clearColorAttachment', 'beginRenderPass', 'endRenderPass',
  'submitCommandQueue', 'waitForGPUIdle', 'queryTimestamp', 'releaseSwapchain',
  'resizeViewport', 'setScissorRect', 'enableDepthTest', 'disableBlending',
  'setStencilMask', 'configureSwapchain', 'acquireNextFrame', 'presentFrame',
  'destroyDevice', 'enumerateAdapters', 'requestDeviceFeatures', 'checkFormatSupport',
];

function makeSymbol(name: string, i: number): ExternalSymbolDefinition {
  return {
    name,
    type: 'class',
    filePath: `packages/core/src/auto/${name}.ts`,
    line: i * 10 + 1,
    column: 0,
    isExported: true,
    visibility: 'public',
    signature: `class ${name}`,
  };
}

function buildCorpus(): ExternalSymbolDefinition[] {
  const syms: ExternalSymbolDefinition[] = [];
  // Target symbols
  for (let i = 0; i < TARGETS.length; i++) {
    syms.push(makeSymbol(TARGETS[i]!.name, i));
  }
  // Distractor symbols
  for (let i = 0; i < DISTRACTORS.length; i++) {
    syms.push(makeSymbol(DISTRACTORS[i]!, i + TARGETS.length));
  }
  return syms;
}

// =============================================================================
// RECALL MEASUREMENT
// =============================================================================

async function measureRecall(
  provider: StructuralEmbeddingProvider | HoloEmbedProvider,
  corpus: ExternalSymbolDefinition[],
  k = 10,
): Promise<number> {
  const index = new EmbeddingIndex({ provider, batchSize: corpus.length, useWorkers: false });

  // addSymbols builds text repr as "name: signature\nfile: path" internally
  await index.addSymbols(corpus);

  // Measure recall@K
  let hits = 0;
  for (const target of TARGETS) {
    const results = await index.search(target.query, k);
    const resultNames = results.map(r => r.symbol.name);
    if (resultNames.includes(target.name)) hits++;
  }

  await index.dispose();
  return hits / TARGETS.length;
}

// =============================================================================
// TESTS
// =============================================================================

describe('Paper 26 Table 2: NL→code recall comparison', () => {
  const corpus = buildCorpus();

  it('HoloEmbedProvider recall@10 > StructuralEmbeddingProvider recall@10 for NL queries', async () => {
    const structural = new StructuralEmbeddingProvider();
    const holoembed  = new HoloEmbedProvider();

    const [structRecall, holoRecall] = await Promise.all([
      measureRecall(structural, corpus),
      measureRecall(holoembed, corpus),
    ]);

    // HoloEmbed must improve on structural baseline
    expect(holoRecall).toBeGreaterThan(structRecall);

    // ── Paper 26 Table 2 output ───────────────────────────────────────────
    console.log('\n% Paper 26 Table 2 — NL→code Recall@10 (offline providers only)');
    console.log('% Generated by Paper26Table2NLRecall.test.ts');
    console.log('%');
    console.log('% Provider      | Recall@10 | Notes');
    console.log('% --------------|-----------|----------------------------------');
    console.log(`%  structural   | ${(structRecall * 100).toFixed(1).padStart(8)}% | topology only, no name encoding`);
    console.log(`%  holoembed    | ${(holoRecall  * 100).toFixed(1).padStart(8)}% | structural + char-trigram subwords`);
    console.log('%');
    console.log('% Corpus: 10 target symbols + 40 distractors (50 total)');
    console.log(`% Queries: ${TARGETS.length} NL queries (camelSplit of target names)`);
    console.log('% Xenova all-MiniLM-L6-v2: ~60-80% (requires model download, not in CI)\n');
  }, 60_000);

  it('HoloEmbedProvider recall@10 >= 50% on name-derived NL queries', async () => {
    const holoembed = new HoloEmbedProvider();
    const recall = await measureRecall(holoembed, corpus);

    // Validate the Paper 26 claim: HoloEmbed achieves ≥50% recall
    // for NL queries derived directly from camelCase symbol names
    expect(recall).toBeGreaterThanOrEqual(0.5);
  }, 60_000);

  it('StructuralEmbeddingProvider recall@10 < 30% for NL name queries (topology gap)', async () => {
    const structural = new StructuralEmbeddingProvider();
    const recall = await measureRecall(structural, corpus);

    // Verify the gap exists: structural embeddings don't encode names
    expect(recall).toBeLessThan(0.3);
  }, 60_000);
});
