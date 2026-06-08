/**
 * Arm-C LIVE offload at scale (the honest C2 stress test).
 *
 * `curatedOffload` is a PERFECT oracle: it hands Arm C exactly its scene's contract
 * rules, nothing else. Real retrieval is not perfect — at scale you query a store of
 * many similar contracts and get back a top-k that contains the right one ALONGSIDE
 * competing distractors. This module simulates that: a corpus of every suite contract
 * PLUS trait-overlapping distractors (same trait names, different bounds, plausible
 * ids), and a real token-overlap retriever that returns the top-k candidates. Arm C
 * must then APPLY the candidate whose id matches the scene — using a distractor's
 * bounds fails the contract.
 *
 * This exposes the failure mode the curated oracle hides: does a SMALL model stay
 * correct when offload carries noise? If Arm C degrades under liveOffload but not
 * curatedOffload, the C2 "ecosystem offload" claim is contingent on retrieval
 * quality — an honest, load-bearing caveat. Selectable via EXP1_OFFLOAD=live.
 */

import { EXP1_FULL_SUITE } from './tasks-extended';
import { EXP1_COMPUTE_SUITE } from './tasks-compute';
import type { BenchTask } from './types';
import type { ResolvedContract } from '../../brittney/SimContractGate';

const TRAITS = [
  'glow',
  'audio',
  'rigidbody',
  'motion',
  'particle',
  'transform',
  'thermal',
  'material',
  'surface',
];
const PROP_OF: Record<string, string> = {
  glow: 'intensity',
  audio: 'volume',
  rigidbody: 'mass',
  motion: 'speed',
  particle: 'rate',
  transform: 'scale',
  thermal: 'temp',
  material: 'opacity',
  surface: 'friction',
};

/** Deterministic distractor contracts: real trait names, DIFFERENT bounds, plausible ids. */
function buildDistractors(): ResolvedContract[] {
  const out: ResolvedContract[] = [];
  const suffixes = ['safety', 'cap', 'limit', 'rig', 'safe', 'bound', 'guard', 'spec'];
  for (const trait of TRAITS) {
    const prop = PROP_OF[trait];
    for (let i = 0; i < 5; i++) {
      const max = (i + 2) * 3; // 6, 9, 12, 15, 18 — none likely to match a real bound
      out.push({
        id: `${trait}-${suffixes[i % suffixes.length]}-v${i + 1}`,
        propertyBounds: { [trait]: { [prop]: { min: 0, max } } },
      });
    }
  }
  return out;
}

/** All real suite contracts + distractors, deduped by id. */
function buildCorpus(): ResolvedContract[] {
  const byId = new Map<string, ResolvedContract>();
  for (const t of [...EXP1_FULL_SUITE, ...EXP1_COMPUTE_SUITE]) {
    if (t.contract) byId.set(t.contract.id, t.contract);
  }
  for (const d of buildDistractors()) if (!byId.has(d.id)) byId.set(d.id, d);
  return [...byId.values()];
}

const CORPUS = buildCorpus();

function tokens(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1)
  );
}

/** Token-overlap (Jaccard-ish) score between a query and a contract's id+traits. */
function score(query: Set<string>, c: ResolvedContract): number {
  const ct = tokens(c.id);
  for (const trait of Object.keys(c.propertyBounds ?? {})) ct.add(trait);
  let hits = 0;
  for (const q of query) if (ct.has(q)) hits++;
  return hits / Math.sqrt(ct.size || 1);
}

function formatContract(c: ResolvedContract): string {
  const lines = [`contract "${c.id}":`];
  for (const [trait, props] of Object.entries(c.propertyBounds ?? {})) {
    for (const [key, b] of Object.entries(props)) {
      lines.push(`  - @${trait}.${key} ∈ [${b.min ?? '-inf'}, ${b.max ?? 'inf'}]`);
    }
  }
  return lines.join('\n');
}

/** Live retrieval: top-k candidates by token overlap with the scene. Includes noise. */
export function liveOffload(task: BenchTask, topK = 4): string | undefined {
  if (!task.contract) return undefined;
  // Query = the scene's declared id tokens + trait names present in the scene.
  const q = tokens(task.contract.id);
  for (const trait of TRAITS) if (task.sceneContext.includes(`@${trait}`)) q.add(trait);

  const ranked = CORPUS.map((c) => ({ c, s: score(q, c) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
    .map((r) => r.c);

  // Safety: ensure the true contract is present (a real store would return it; this
  // guarantees the test measures NOISE-robustness, not pure retrieval miss).
  if (!ranked.some((c) => c.id === task.contract!.id)) ranked.unshift(task.contract);

  return [
    `Retrieved ${ranked.length} candidate contracts (top-${topK} by relevance). APPLY ONLY the one whose id matches the scene's simulation_contract:`,
    ...ranked.map(formatContract),
  ].join('\n');
}
