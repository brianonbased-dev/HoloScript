#!/usr/bin/env node
/**
 * determinism-repro.mjs — faithful standalone reproduction of the engine's semantic-novelty
 * determinism fingerprint (scope 2026-05-23 P1), for running on a bare fleet node that has
 * node + npm but not the full HoloScript monorepo toolchain.
 *
 * FAITHFULNESS: this computes the IDENTICAL fingerprint as SemanticDeterminismGate.vectorFingerprint:
 *   - same model id, same pipeline config { pooling:'mean', normalize:true }
 *   - same quantizeToken (toFixed(6) + negative-zero normalization)
 *   - same canonical string `${MODEL}|p${precision}|${tokens.join(',')}`
 *   - SHA-256 over UTF-8 bytes (node crypto == engine sha256Bytes, cross-checked in sha256.ts)
 *   - same probe texts in the same order
 * Proof it is faithful: run locally first — its fingerprints MUST equal the committed engine
 * manifest (determinism-manifest.local-win-x64.json). If they match, the node's output is a
 * valid second-machine measurement. Pin @huggingface/transformers@3.8.1 to match the engine.
 *
 *   npm i @huggingface/transformers@3.8.1
 *   node determinism-repro.mjs --label <machine-label>
 */
import { createHash } from 'node:crypto';
import { hostname, platform, arch, release } from 'node:os';
import { pipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const PRECISION = 6;
const REPEATS = 3;
const TEXTS = [
  'For every convex polyhedron, vertices minus edges plus faces equals two.',
  'In a right triangle the hypotenuse squared equals the sum of the squares of the other two sides.',
  'For every integer n>=2, 4/n equals 1/x + 1/y + 1/z.',
  'Two generic plane curves of degrees d1 and d2 intersect in d1*d2 points.',
  'The cat sat on the warm windowsill in the afternoon sun.',
];

function quantizeToken(x) {
  if (!Number.isFinite(x)) throw new Error('non-finite component');
  const t = x.toFixed(PRECISION);
  const z = (0).toFixed(PRECISION);
  return t === `-${z}` ? z : t;
}
function vectorFingerprint(vec) {
  const tokens = vec.map(quantizeToken);
  const canonical = `${MODEL}|p${PRECISION}|${tokens.join(',')}`;
  return `sha-${createHash('sha256').update(canonical, 'utf8').digest('hex')}`;
}
function argValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const label =
  argValue('--label') ??
  `${hostname()}|${platform()}-${arch()}|node${process.version}|kernel${release()}`;
const extractor = await pipeline('feature-extraction', MODEL);
async function embed(text) {
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(out.data);
}

const entries = [];
let dim = 0;
let allStable = true;
for (const text of TEXTS) {
  const first = await embed(text);
  dim = first.length;
  let stable = true;
  for (let r = 1; r < REPEATS; r++) {
    const again = await embed(text);
    if (again.length !== first.length || !again.every((v, i) => v === first[i])) {
      stable = false;
      break;
    }
  }
  if (!stable) allStable = false;
  entries.push({ text, fingerprint: vectorFingerprint(first), sameMachineStable: stable });
}

const manifest = {
  manifestVersion: 1,
  modelId: MODEL,
  machineLabel: label,
  precision: PRECISION,
  dim,
  repeats: REPEATS,
  sameMachineStable: allStable,
  entries,
};
console.log(JSON.stringify(manifest, null, 2));
