#!/usr/bin/env node
/**
 * determinism-raw.mjs — emits the RAW (un-quantized) embedding vectors for the determinism
 * probe set, so cross-machine divergence can be measured at the float level and the minimum
 * viable quantization precision determined (scope 2026-05-23 P1 follow-up).
 *
 * Same model/config as the engine (Xenova/all-MiniLM-L6-v2, mean-pool, normalize). Output:
 *   { machineLabel, modelId, dim, vectors: { "<probe text>": number[] } }
 *
 *   npm i @huggingface/transformers@3.8.1   # on a bare node
 *   node determinism-raw.mjs --label <machine-label>
 */
import { hostname, platform, arch, release } from 'node:os';
import { pipeline } from '@huggingface/transformers';

const MODEL = 'Xenova/all-MiniLM-L6-v2';
const TEXTS = [
  'For every convex polyhedron, vertices minus edges plus faces equals two.',
  'In a right triangle the hypotenuse squared equals the sum of the squares of the other two sides.',
  'For every integer n>=2, 4/n equals 1/x + 1/y + 1/z.',
  'Two generic plane curves of degrees d1 and d2 intersect in d1*d2 points.',
  'The cat sat on the warm windowsill in the afternoon sun.',
];

function argValue(name) {
  const i = process.argv.indexOf(name);
  return i !== -1 && i + 1 < process.argv.length ? process.argv[i + 1] : undefined;
}

const label = argValue('--label') ?? `${hostname()}|${platform()}-${arch()}|node${process.version}|kernel${release()}`;
const extractor = await pipeline('feature-extraction', MODEL);
const vectors = {};
let dim = 0;
for (const text of TEXTS) {
  const out = await extractor(text, { pooling: 'mean', normalize: true });
  const vec = Array.from(out.data);
  dim = vec.length;
  vectors[text] = vec;
}
console.log(JSON.stringify({ machineLabel: label, modelId: MODEL, dim, vectors }));
