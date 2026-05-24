#!/usr/bin/env node
/**
 * determinism-precision-analysis.mjs — measures cross-machine float divergence of the
 * semantic-novelty embeddings across N fleet machines and finds (a) the minimum quantization
 * precision at which the determinism fingerprints unify and (b) the tolerance verdict at a
 * chosen ε (scope 2026-05-23 P1 follow-up). Generalized to 2+ raw-vector dumps.
 *
 * Input: 2+ raw-vector dumps from determinism-raw.mjs.
 *   node determinism-precision-analysis.mjs rawA.json rawB.json [rawC.json ...] [--out r.json] [--eps 1e-5]
 *
 * All machines are compared against the first (the reference). Reports per-probe max |Δ| (worst
 * over all machines), the global max, a precision table (decimals → probes that unify across
 * ALL machines), the candidate receipt-binding precision, and the tolerance verdict at ε.
 * Unification on this probe set/these machines is necessary, not sufficient, for the whole
 * fleet — a true ARM / non-CPU-EP machine must still confirm before flipping receipt-binding.
 */
import { readFileSync, writeFileSync } from 'node:fs';

const FLAG_VALUE = new Set(['--out', '--eps']);
const rawArgs = process.argv.slice(2);
const files = rawArgs.filter((a, i) => !a.startsWith('--') && !(i > 0 && FLAG_VALUE.has(rawArgs[i - 1])));
if (files.length < 2) {
  console.error('usage: determinism-precision-analysis.mjs <rawA.json> <rawB.json> [rawC.json ...] [--out r.json] [--eps 1e-5]');
  process.exit(2);
}
const argVal = (name) => { const i = process.argv.indexOf(name); return i !== -1 ? process.argv[i + 1] : undefined; };
const outPath = argVal('--out');
const EPS = parseFloat(argVal('--eps') ?? '1e-5');

const manifests = files.map((f) => JSON.parse(readFileSync(f, 'utf8')));
const ref = manifests[0];
const others = manifests.slice(1);
const texts = Object.keys(ref.vectors);

function qtok(x, p) { const t = x.toFixed(p); const z = (0).toFixed(p); return t === `-${z}` ? z : t; }
function fp(v, p) { return v.map((x) => qtok(x, p)).join(','); }

// per-probe worst delta over all non-reference machines
const perProbe = [];
let globalMax = 0;
for (const t of texts) {
  const a = ref.vectors[t];
  let mx = 0;
  for (const m of others) {
    const b = m.vectors[t];
    if (!b || b.length !== a.length) { mx = Infinity; break; }
    for (let i = 0; i < a.length; i++) { const d = Math.abs(a[i] - b[i]); if (d > mx) mx = d; }
  }
  if (mx > globalMax) globalMax = mx;
  perProbe.push({ textPrefix: t.slice(0, 48), maxDelta: mx });
}

// fingerprint agreement: a probe "unifies" iff every machine matches the reference at precision p
const precisionTable = [];
let candidatePrecision = null;
for (const p of [8, 7, 6, 5, 4, 3, 2, 1]) {
  let agree = 0;
  for (const t of texts) {
    const refFp = fp(ref.vectors[t], p);
    if (others.every((m) => m.vectors[t] && fp(m.vectors[t], p) === refFp)) agree++;
  }
  const allUnify = agree === texts.length;
  precisionTable.push({ precision: p, agree, total: texts.length, allUnify });
  if (allUnify && candidatePrecision === null) candidatePrecision = p; // highest p that unifies
}

const results = {
  machines: manifests.map((m) => m.machineLabel),
  machineCount: manifests.length,
  modelId: ref.modelId,
  dim: ref.dim,
  probes: texts.length,
  globalMaxAbsDelta: globalMax,
  globalMaxAbsDeltaExp: Number.isFinite(globalMax) ? globalMax.toExponential(4) : 'Infinity',
  perProbe,
  precisionTable,
  candidatePrecision,
  epsilon: EPS,
  toleranceVerdict: globalMax <= EPS ? 'within-tolerance' : 'divergent',
  note:
    'Divergence at this scale is float ULP noise, not semantic. candidatePrecision + toleranceVerdict ' +
    'are for THESE machines; a true ARM / non-CPU-EP machine must also confirm before promoting.',
};

const json = JSON.stringify(results, null, 2);
if (outPath) writeFileSync(outPath, json, 'utf8');
console.log(json);
