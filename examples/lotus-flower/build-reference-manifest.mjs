#!/usr/bin/env node
/**
 * Build a deterministic CAEL-ready reference manifest from local media files.
 *
 * Usage:
 *   node examples/lotus-flower/build-reference-manifest.mjs photo-a.jpg photo-b.png
 *   node examples/lotus-flower/build-reference-manifest.mjs --sign photo-a.jpg photo-b.png
 *   node examples/lotus-flower/build-reference-manifest.mjs --out reference.anchors.json photo-a.jpg photo-b.png
 *
 * The script prints JSON to stdout by default. With --sign it also generates
 * unsigned Base L2 anchor transactions (via anchor_base.py or inline fallback)
 * and emits wallet_signature: null with a signing note. Use
 * sign-lotus-references.mjs --record to update anchors after broadcast.
 */

import { createHash } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const args = process.argv.slice(2);
let signMode = false;
let outPath = null;
const files = [];

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--sign') {
    signMode = true;
    continue;
  }
  if (arg === '--out') {
    outPath = args[i + 1] ?? null;
    if (!outPath || outPath.startsWith('--')) {
      console.error('ERROR: --out requires a manifest output path');
      process.exit(1);
    }
    i += 1;
    continue;
  }
  if (arg.startsWith('--')) {
    console.error(`ERROR: Unknown option ${arg}`);
    process.exit(1);
  }
  files.push(arg);
}

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..', '..');
const ANCHOR_BASE_PY = path.resolve(
  path.join(REPO_ROOT, '..', '..', '..', '.ai-ecosystem', 'scripts', 'anchor_base.py')
);

if (files.length === 0) {
  console.error(
    'Usage: node examples/lotus-flower/build-reference-manifest.mjs <media-file> [media-file...]'
  );
  process.exit(1);
}

function guessMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function generateUnsignedTx(filePath, digestHex) {
  const usePython = existsSync(ANCHOR_BASE_PY);
  if (usePython) {
    try {
      await execFileAsync('python', [ANCHOR_BASE_PY, filePath, '--save-unsigned']);
      return `${filePath}.base-unsigned.json`;
    } catch (err) {
      console.error(`WARN: anchor_base.py failed (${err.message}); falling back to inline tx.`);
    }
  }
  const tx = {
    chainId: 8453,
    from: '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3',
    to: '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3',
    value: 0,
    data: `0x${digestHex}`,
    maxPriorityFeePerGas: '0x3e8',
    maxFeePerGas: '0x4c4b40',
    gas: 25000,
    type: 2,
  };
  const outPath = `${filePath}.base-unsigned.json`;
  writeFileSync(outPath, `${JSON.stringify(tx, null, 2)}\n`);
  return outPath;
}

const anchors = [];
for (const [index, filePath] of files.entries()) {
  const absolutePath = path.resolve(filePath);
  const bytes = await readFile(absolutePath);
  const info = await stat(absolutePath);
  const id = `lotus-reference-local-${String(index + 1).padStart(2, '0')}`;
  const contentHash = `sha256:${sha256Hex(bytes)}`;
  const anchor = {
    id,
    label: path.basename(filePath),
    uri: `file://${absolutePath.replaceAll('\\', '/')}`,
    role: index === 0 ? 'material' : index === 1 ? 'silhouette' : 'leaf_context',
    status: 'hashed',
    content_hash: contentHash,
    wallet_signature: null,
    mime_type: guessMimeType(filePath),
    byte_length: info.size,
  };

  if (signMode) {
    const unsignedPath = await generateUnsignedTx(absolutePath, contentHash.replace('sha256:', ''));
    anchor.note = `Unsigned Base tx at ${unsignedPath}; broadcast via founder Trezor, then record tx hash.`;
    console.error(`[sign] ${id} -> unsigned tx: ${unsignedPath}`);
  }

  anchors.push(anchor);
}

const manifest = {
  schema: 'holoscript.lotus.reference.anchors.v0',
  status: 'content_hashed',
  generated_by: 'examples/lotus-flower/build-reference-manifest.mjs',
  wallet_signature_status: 'pending_cael_anchor',
  anchors,
};

const output = `${JSON.stringify(manifest, null, 2)}\n`;
if (outPath) {
  writeFileSync(outPath, output);
  console.error(`Wrote manifest to ${outPath}`);
}
process.stdout.write(output);
