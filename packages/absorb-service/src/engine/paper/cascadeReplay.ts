/**
 * cascadeReplay - local, deterministic keyword -> HoloGraph -> HoloEmbed -> LLM
 * cascade over an absorbed doc/code graph, with a bound replay envelope (A19).
 *
 * - keyword: HybridLexicalIndex (engine/HybridRetrieval)
 * - graph:   CodebaseGraph neighbourhood (parent/child sections, doc links)
 * - embed:   StructuralEmbeddingProvider (local, no network) cosine rerank
 * - llm:     NO model is called. The LLM layer replays a recorded output when
 *            one is given, else records a deterministic extractive answer.
 *            `llmMode` says which. (No spend, no cloud.)
 *
 * `replayAnswer` re-runs the cascade against a snapshot and checks the
 * result set + evidenceHash + graphSnapshotHash against the stored answer.
 */

import { CodebaseGraph } from '../CodebaseGraph';
import { HybridLexicalIndex } from '../HybridRetrieval';
import { StructuralEmbeddingProvider } from '../providers/StructuralEmbeddingProvider';
import {
  CascadeBinder,
  computeEvidenceHash,
  computeGraphSnapshotHash,
  verifyCascadeChain,
  type CascadeVerification,
  type EvidenceItem,
  type ReplayEnvelope,
} from '../AnswerProvenance';
import type { ExternalSymbolDefinition } from '../types';

export const CASCADE_LAYERS = ['keyword', 'graph', 'embed', 'llm'] as const;

export interface RecordedLlmOutput {
  answer: string;
  citations: string[];
}

export interface CascadeAnswer {
  query: string;
  results: string[];
  answer: RecordedLlmOutput;
  llmMode: 'replayed-from-recorded-output' | 'recorded-extractive-no-model';
  embeddingProvider: 'structural';
  envelope: ReplayEnvelope;
}

export function symbolKey(s: Pick<ExternalSymbolDefinition, 'filePath' | 'line' | 'name'>): string {
  return `${s.filePath.replace(/\\/g, '/')}:${s.line}:${s.name}`;
}

const round = (n: number) => Math.round(n * 1e6) / 1e6;

function cosine(a: ArrayLike<number>, b: ArrayLike<number>): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

export function runCascade(
  graph: CodebaseGraph,
  query: string,
  opts: { topK?: number; recordedLlm?: RecordedLlmOutput; gitCommitHash?: string | null } = {}
): CascadeAnswer {
  const topK = opts.topK ?? 8;
  const symbols = graph
    .getAllSymbols()
    .slice()
    .sort((a, b) => symbolKey(a).localeCompare(symbolKey(b)));
  const byKey = new Map(symbols.map((s) => [symbolKey(s), s]));
  const binder = new CascadeBinder(query);

  // 1. keyword
  const lexical = new HybridLexicalIndex(symbols.map((symbol) => ({ symbol })));
  const kw = [...lexical.score(query).entries()]
    .map(([i, m]) => ({ key: symbolKey(symbols[i]), score: round(m.score) }))
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, topK);
  binder.add('keyword', kw);

  // 2. graph neighbourhood
  const graphSet = new Set<string>(kw.map((k) => k.key));
  for (const hit of kw) {
    const s = byKey.get(hit.key);
    if (!s) continue;
    const slug = (s.metadata?.slug as string | undefined) ?? null;
    for (const peer of graph.getSymbolsInFile(s.filePath)) {
      const peerSlug = (peer.metadata?.slug as string | undefined) ?? null;
      if ((s.owner && peerSlug === s.owner) || (slug && peer.owner === slug)) graphSet.add(symbolKey(peer));
    }
    for (const imp of graph.getImportsOf(s.filePath)) {
      if (imp.resolvedPath) {
        const f = graph.getSymbolsInFile(imp.resolvedPath).find((x) => x.type === 'file');
        if (f) graphSet.add(symbolKey(f));
      }
    }
  }
  const graphOut = [...graphSet].sort();
  binder.add('graph', graphOut);

  // 3. structural embedding rerank (local)
  const embed = new StructuralEmbeddingProvider();
  const qv = embed.embedText(query);
  const embedOut = graphOut
    .map((key) => {
      const s = byKey.get(key)!;
      return { key, score: round(cosine(qv, embed.embedText(`${s.name} ${s.signature ?? ''}`))) };
    })
    .sort((a, b) => b.score - a.score || a.key.localeCompare(b.key))
    .slice(0, topK);
  binder.add('embed', embedOut);

  // 4. LLM layer (replayed / recorded; no model call)
  const results = embedOut.map((e) => e.key);
  const llmMode = opts.recordedLlm ? 'replayed-from-recorded-output' : 'recorded-extractive-no-model';
  const answer: RecordedLlmOutput = opts.recordedLlm ?? {
    answer: results
      .slice(0, 3)
      .map((k) => byKey.get(k)!.name)
      .join('; '),
    citations: results.slice(0, 3),
  };
  binder.add('llm', answer, llmMode);

  const evidence: EvidenceItem[] = results.map((k) => {
    const s = byKey.get(k)!;
    return { filePath: s.filePath, name: s.name, line: s.line, type: String(s.type) };
  });
  return {
    query,
    results,
    answer,
    llmMode,
    embeddingProvider: 'structural',
    envelope: {
      graphSnapshotHash: computeGraphSnapshotHash(graph.serialize()),
      gitCommitHash: opts.gitCommitHash ?? null,
      evidenceHash: computeEvidenceHash(evidence),
      cascadeLayers: binder.records(true),
    },
  };
}

export interface ReplayCheck {
  pass: boolean;
  sameResults: boolean;
  sameEvidenceHash: boolean;
  sameSnapshot: boolean;
  sameCommit: boolean;
  chain: CascadeVerification;
  replayed: CascadeAnswer;
}

/** holo_replay_answer core: re-run against the snapshot and compare. */
export function replayAnswer(
  graph: CodebaseGraph,
  stored: Pick<CascadeAnswer, 'query' | 'results' | 'answer' | 'envelope'>,
  currentCommit: string | null
): ReplayCheck {
  const replayed = runCascade(graph, stored.query, {
    recordedLlm: stored.answer,
    gitCommitHash: currentCommit,
  });
  const chain = verifyCascadeChain(stored.envelope.cascadeLayers, {
    query: stored.query,
    expectedLayers: [...CASCADE_LAYERS],
  });
  const sameResults = JSON.stringify(replayed.results) === JSON.stringify(stored.results);
  const sameEvidenceHash = replayed.envelope.evidenceHash === stored.envelope.evidenceHash;
  const sameSnapshot = replayed.envelope.graphSnapshotHash === stored.envelope.graphSnapshotHash;
  const sameCommit = stored.envelope.gitCommitHash === currentCommit;
  return {
    pass: sameResults && sameEvidenceHash && sameSnapshot && sameCommit && chain.ok,
    sameResults,
    sameEvidenceHash,
    sameSnapshot,
    sameCommit,
    chain,
    replayed,
  };
}