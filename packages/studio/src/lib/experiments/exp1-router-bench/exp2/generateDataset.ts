/**
 * EXP-2 dataset generator — the per-soul / sovereign fine-tune corpus.
 *
 * EXP-1 showed the contract-respecting capability lives in the SUBSTRATE (IR +
 * offload + contract-in-loop), not in the 1.5B's weights: Arm C wins WITH offload,
 * and the NL arm (no offload) collapses. EXP-2 asks the sovereignty question:
 *
 *   Can we MOVE that capability from ecosystem-context into the weights — so a
 *   fine-tuned 1.5B does the contract-respecting / compute-correct mutation from a
 *   PLAIN natural-language prompt, with NO offload and NO IR in context?
 *
 * If yes, the result is a lite, portable, DOWNLOADABLE model that no longer needs
 * the ecosystem in-context for this task class — the D.053 sovereignty endpoint.
 *
 * This module generates the SFT corpus DETERMINISTICALLY (seeded; no GPU, no spend):
 * each example is (system + NL instruction + scene) → the exact correct mutation
 * JSON, with the target derived from the SAME oracle semantics EXP-1 grades on
 * (clamp-to-bound / midpoint / percentage-of-range / delta-then-clamp). The model
 * is trained to emit the correct mutation WITHOUT seeing the bounds — i.e. to
 * internalise the rule. Eval = run the fine-tuned model through Arm A (NL) of the
 * EXP-1 harness and compare to the base model's Arm A.
 *
 * Honest scope: this is a NARROW, synthetic corpus (contract-bounds arithmetic +
 * clamp). It is a capability-relocation probe, not a general-purpose fine-tune.
 */

import { EXP1_SYSTEM_PROMPT } from '../promptAssembly';

export interface SftExample {
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[];
  meta: { family: string; trait: string; op: string; expected: number };
}

/** Deterministic PRNG (mulberry32) — reproducible corpora, no Math.random. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TRAITS: { trait: string; prop: string }[] = [
  { trait: 'glow', prop: 'intensity' }, { trait: 'audio', prop: 'volume' },
  { trait: 'rigidbody', prop: 'mass' }, { trait: 'motion', prop: 'speed' },
  { trait: 'particle', prop: 'rate' }, { trait: 'transform', prop: 'scale' },
  { trait: 'thermal', prop: 'temp' }, { trait: 'material', prop: 'opacity' },
  { trait: 'surface', prop: 'friction' },
];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Ops over a [min,max] range + current value → (NL instruction, exact target). */
const OPS: { op: string; instr: (t: string, p: string) => string; calc: (min: number, max: number, cur: number) => number }[] = [
  { op: 'max', instr: (t) => `Make the ${t} as strong as the scene safely allows.`, calc: (_m, max) => max },
  { op: 'midpoint', instr: (t) => `Set the ${t} to the exact midpoint of its allowed range.`, calc: (min, max) => (min + max) / 2 },
  { op: 'pct75', instr: (t) => `Set the ${t} to 75% of the way up its allowed range.`, calc: (min, max) => min + 0.75 * (max - min) },
  { op: 'pct25', instr: (t) => `Set the ${t} to a quarter of the way up its allowed range.`, calc: (min, max) => min + 0.25 * (max - min) },
  { op: 'plus30clamp', instr: (t) => `Increase the ${t} by 30% of its current value, staying in bounds.`, calc: (_m, max, cur) => Math.min(cur * 1.3, max) },
  { op: 'minus25', instr: (t) => `Reduce the ${t} by 25% of its current value.`, calc: (_m, _x, cur) => cur * 0.75 },
  { op: 'doubleclamp', instr: (t) => `Double the ${t} from its current value, but keep it within bounds.`, calc: (_m, max, cur) => Math.min(cur * 2, max) },
];

/** Generate `count` deterministic SFT examples. The target mutation respects the
 * contract bound WITHOUT the bound appearing in the user message (the model must
 * internalise it). */
export function generateDataset(count: number, seed = 42): SftExample[] {
  const rnd = mulberry32(seed);
  const out: SftExample[] = [];
  for (let i = 0; i < count; i++) {
    const { trait, prop } = TRAITS[Math.floor(rnd() * TRAITS.length)];
    const { op, instr, calc } = OPS[Math.floor(rnd() * OPS.length)];
    const max = round2(2 + rnd() * 18);          // 2..20
    const min = round2(rnd() < 0.5 ? 0 : rnd() * (max * 0.2));
    const cur = round2(min + rnd() * (max - min));
    const expected = round2(Math.max(min, Math.min(max, calc(min, max, cur))));
    const cid = `${trait}-${op}-v${(i % 9) + 1}`;
    const scene = `simulation_contract: "${cid}"\nobj#item {\n  @${trait}(${prop}: ${cur})\n}`;
    const target = JSON.stringify({
      tool: 'set_trait_property',
      input: { trait_name: trait, property_key: prop, property_value: expected },
    });
    out.push({
      messages: [
        { role: 'system', content: EXP1_SYSTEM_PROMPT },
        { role: 'user', content: `${instr(trait, prop)}\n\nScene:\n${scene}` },
        { role: 'assistant', content: target },
      ],
      meta: { family: 'contract-bounds', trait, op, expected },
    });
  }
  return out;
}

/** Serialise to JSONL (one training row per line) — the standard SFT format. */
export function toJsonl(examples: SftExample[]): string {
  return examples.map((e) => JSON.stringify({ messages: e.messages })).join('\n') + '\n';
}
