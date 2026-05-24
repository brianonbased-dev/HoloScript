#!/usr/bin/env node
/**
 * determinism-precision-analysis.mjs — measures cross-machine float divergence of the
 * semantic-novelty embeddings and finds the minimum quantization precision at which the
 * determinism fingerprints unify across machines (scope 2026-05-23 P1 follow-up).
 *
 * Input: two raw-vector dumps from determinism-raw.mjs (different machines).
 *   node determinism-precision-analysis.mjs raw-local-win.json raw-vast-linux.json [--out results.json]
 *
 * Reports per-probe max |Δ| between machines, the global max, and a precision table
 * (decimals → probes that unify). The minimum all-unify precision is the candidate
 * receipt-binding precision — BUT see the boundary-straddle caveat in the scope doc:
 * unification at precision p on THIS probe set is necessary, not sufficient, for the whole
 * fleet (more architectures / ONNX backends must confirm before flipping receipt-binding).
 */
import { readFileSync, writeFileSync } from 'node:fs';

const [fileA, fileB] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
if (!fileA || !fileB) {
  console.error('usage: determinism-precision-analysis.mjs <rawA.json> <rawB.json> [--out results.json]');
  process.exit(2);
}
const outIdx = process.argv.indexOf('--out');
const outPath = outIdx !== -1 ? process.argv[outIdx + 1] : undefined;

const A = JSON.parse(readFileSync(fileA, 'utf8'));
const B = JSON.parse(readFileSync(fileB, 'utf8'));
const texts = Object.keys(A.vectors);

function qtok(x, p) {
  const t = x.toFixed(p);
  const z = (0).toFixed(p);
  return t === `-${z}` ? z : t;
}
function fp(v, p) {
  return v.map((x) => qtok(x, p)).join(',');
}

const perProbe = [];
let globalMax = 0;
for (const t of texts) {
  const a = A.vectors[t];
  const b = B.vectors[t];
  let mx = 0;
  let idx = -1;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > mx) { mx = d; idx = i; }
  }
  if (mx > globalMax) globalMax = mx;
  perProbe.push({ textPrefix: t.slice(0, 48), maxDelta: mx, argMaxDim: idx });
}

const precisionTable = [];
let minUnify = null;
for (const p of [8, 7, 6, 5, 4, 3, 2, 1]) {
  let agree = 0;
  for (const t of texts) if (fp(A.vectors[t], p) === fp(B.vectors[t], p)) agree++;
  const allUnify = agree === texts.length;
  precisionTable.push({ precision: p, agree, total: texts.length, allUnify });
  // The loop descends 8→1; the FIRST all-unify is the HIGHEST precision that works =
  // least coarsening / most fingerprint entropy. That is the candidate precision.
  if (allUnify && minUnify === null) minUnify = p;
}

const results = {
  machineA: A.machineLabel,
  machineB: B.machineLabel,
  modelId: A.modelId,
  dim: A.dim,
  probes: texts.length,
  globalMaxAbsDelta: globalMax,
  globalMaxAbsDeltaExp: globalMax.toExponential(4),
  perProbe,
  precisionTable,
  candidatePrecision: minUnify,
  note:
    'Divergence is float32 ULP-level noise, not semantic. minUnifyingPrecision is the candidate ' +
    'receipt-binding precision for THIS 2-machine x86_64 pair; validate on ARM + other ONNX ' +
    'backends and analyze boundary-straddle margin before promoting the advisory layer.',
};

const json = JSON.stringify(results, null, 2);
if (outPath) writeFileSync(outPath, json, 'utf8');
console.log(json);
