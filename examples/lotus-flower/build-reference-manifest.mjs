#!/usr/bin/env node
/**
 * Build a deterministic CAEL-ready reference manifest from local media files.
 *
 * Usage:
 *   node examples/lotus-flower/build-reference-manifest.mjs photo-a.jpg photo-b.png
 *
 * The script prints JSON to stdout. It does not sign anchors; wallet signing is
 * a later CAEL step and should update wallet_signature/status explicitly.
 */

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const files = process.argv.slice(2);

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

const anchors = [];
for (const [index, filePath] of files.entries()) {
  const absolutePath = path.resolve(filePath);
  const bytes = await readFile(absolutePath);
  const info = await stat(absolutePath);
  const id = `lotus-reference-local-${String(index + 1).padStart(2, '0')}`;
  anchors.push({
    id,
    label: path.basename(filePath),
    uri: `file://${absolutePath.replaceAll('\\', '/')}`,
    role: index === 0 ? 'material' : index === 1 ? 'silhouette' : 'leaf_context',
    status: 'hashed',
    content_hash: `sha256:${sha256Hex(bytes)}`,
    wallet_signature: null,
    mime_type: guessMimeType(filePath),
    byte_length: info.size,
  });
}

const manifest = {
  schema: 'holoscript.lotus.reference.anchors.v0',
  status: 'content_hashed',
  generated_by: 'examples/lotus-flower/build-reference-manifest.mjs',
  wallet_signature_status: 'pending_cael_anchor',
  anchors,
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
