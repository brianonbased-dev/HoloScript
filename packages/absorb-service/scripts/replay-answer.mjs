#!/usr/bin/env node
// A19 receipt 3: node scripts/replay-answer.mjs --query <q> --runs 2 [--paths a,b]
// Rebuilds the local doc graph each run (no network, structural embeddings, no LLM call),
// pins graphSnapshotHash + gitCommitHash, replays run 1 against each later run, and
// proves tampering fails at the tampered layer.
import { resolve } from 'node:path';
import { defaultRoots, emit, gitCommit, loadPaper, parseArgs, receipt } from './lib/paper-cli.mjs';

const startedAt = new Date().toISOString();
const args = parseArgs(process.argv.slice(2));
if (typeof args.query !== 'string') { console.error('--query is required'); process.exit(2); }
const paper = await loadPaper();
const roots = defaultRoots(args);
const base = resolve(roots.HoloScript, '..');
const paths = (typeof args.paths === 'string' ? args.paths.split(',') : [resolve(roots['ai-ecosystem'], 'research', 'paper-5-data'), resolve(roots['ai-ecosystem'], 'docs', 'handbooks')])
  .map((p) => resolve(process.cwd(), p));
const runs = Math.max(2, Number(args.runs ?? 2));
const commit = gitCommit();
const answers = [];
for (let i = 0; i < runs; i += 1) {
  const { graph } = await paper.buildDocGraph(paths, base);
  answers.push({ graph, ans: paper.runCascade(graph, args.query, { gitCommitHash: commit }) });
}
const first = answers[0].ans;
const replays = answers.slice(1).map(({ graph }) => paper.replayAnswer(graph, first, commit));
const tamperIdx = paper.CASCADE_LAYERS.indexOf('graph');
const tampered = structuredClone(first.envelope.cascadeLayers);
tampered[tamperIdx].output = [...(tampered[tamperIdx].output ?? []), 'tampered:0:x'];
const tamperCheck = paper.verifyCascadeChain(tampered, { query: args.query, expectedLayers: [...paper.CASCADE_LAYERS] });
const result = {
  query: args.query,
  corpus: paths.map((p) => paper.displayPath(p, roots)),
  runs,
  deterministic: replays.every((r) => r.pass),
  envelope: { ...first.envelope, cascadeLayers: first.envelope.cascadeLayers.map(({ output, ...l }) => l) },
  results: first.results,
  llmMode: first.llmMode,
  embeddingProvider: first.embeddingProvider,
  replays: replays.map(({ replayed, ...r }) => r),
  tamper: { layer: 'graph', detected: !tamperCheck.ok, failedLayer: tamperCheck.failedLayer, reason: tamperCheck.reason },
};
emit(receipt(process.argv.slice(1).join(' '), startedAt, result), args);
process.exit(result.deterministic && result.tamper.detected && result.tamper.failedLayer === 'graph' ? 0 : 1);