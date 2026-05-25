#!/usr/bin/env node
/**
 * provision-depth-model.mjs — fetch the Depth-Anything-V2-Small ONNX model so
 * the HoloGram Node depth path (`runOnnxDepth` in src/depth-infer.ts) runs REAL
 * neural depth instead of the luminance fallback.
 *
 * The model is a public HuggingFace export (~99MB fp32 / ~27MB int8). It is NOT
 * committed (cached under <repo>/.models, gitignored). Idempotent: skips a
 * download when the file already exists at the expected size.
 *
 * Usage:
 *   node packages/hologram-worker/scripts/provision-depth-model.mjs            # fp32
 *   node packages/hologram-worker/scripts/provision-depth-model.mjs --quantized
 *   HOLOGRAM_MODELS_DIR=/abs/dir node .../provision-depth-model.mjs
 *
 * Prints the absolute model path on success; export it as HOLOGRAM_ONNX_MODEL_PATH
 * (or rely on the default resolver in depth-infer.ts which checks this same path).
 */

import { createWriteStream, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..', '..', '..');

const QUANTIZED = process.argv.includes('--quantized');
const REPO = 'onnx-community/depth-anything-v2-small';
const FILE = QUANTIZED ? 'onnx/model_quantized.onnx' : 'onnx/model.onnx';
const EXPECTED_BYTES = QUANTIZED ? 27_258_801 : 99_060_839;
const URL = `https://huggingface.co/${REPO}/resolve/main/${FILE}`;

const modelsDir = process.env.HOLOGRAM_MODELS_DIR
  ? resolve(process.env.HOLOGRAM_MODELS_DIR)
  : join(repoRoot, '.models', 'depth-anything-v2-small');
const outName = QUANTIZED ? 'model_quantized.onnx' : 'model.onnx';
const outPath = join(modelsDir, outName);

function log(msg) {
  process.stderr.write(`[provision-depth-model] ${msg}\n`);
}

async function main() {
  if (existsSync(outPath)) {
    const size = statSync(outPath).size;
    // Allow a small tolerance — HF can re-export with minor size drift.
    if (Math.abs(size - EXPECTED_BYTES) <= EXPECTED_BYTES * 0.02) {
      log(`already provisioned (${size} bytes) — skipping download`);
      process.stdout.write(outPath + '\n');
      return;
    }
    log(`existing file size ${size} != expected ~${EXPECTED_BYTES}; re-downloading`);
  }

  mkdirSync(modelsDir, { recursive: true });
  log(`downloading ${URL}`);
  const res = await fetch(URL, { redirect: 'follow' });
  if (!res.ok || !res.body) {
    throw new Error(`download failed: HTTP ${res.status} ${res.statusText}`);
  }
  const tmp = outPath + '.partial';
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp));

  const { renameSync } = await import('node:fs');
  renameSync(tmp, outPath);
  const size = statSync(outPath).size;
  log(`saved ${size} bytes -> ${outPath}`);
  if (Math.abs(size - EXPECTED_BYTES) > EXPECTED_BYTES * 0.05) {
    throw new Error(`downloaded size ${size} far from expected ${EXPECTED_BYTES} — aborting`);
  }
  process.stdout.write(outPath + '\n');
}

main().catch((err) => {
  log(`ERROR: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
