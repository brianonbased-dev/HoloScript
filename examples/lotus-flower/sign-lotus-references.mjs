#!/usr/bin/env node
/**
 * sign-lotus-references.mjs - Ingest, hash, and wallet-sign Lotus reference photos as CAEL anchors.
 *
 * Orchestrates the full provenance pipeline for the three lotus reference images:
 *   1. Copy raw images into examples/lotus-flower/reference/ with canonical names
 *   2. Compute SHA-256 content hashes
 *   3. Generate unsigned Base L2 anchor transactions (via anchor_base.py)
 *   4. Update reference.anchors.json in-place (status: hashed / wallet_signed)
 *   5. Update reference.material-extract.json to reflect provenance progress
 *
 * Two-phase workflow (mirrors anchor_base.py):
 *   Phase 1 - Prepare (hashes + unsigned txs):
 *     node examples/lotus-flower/sign-lotus-references.mjs photo1.jpg photo2.jpg photo3.jpg
 *
 *   Phase 2 - Record (after founder broadcasts via Trezor/Rabby):
 *     node examples/lotus-flower/sign-lotus-references.mjs --record \
 *       0x<tx1> 0x<tx2> 0x<tx3>
 *
 *   Phase 1.5 - Check status:
 *     node examples/lotus-flower/sign-lotus-references.mjs --status
 *
 * Acceptance:
 *   - Raw reference images are stored in reference/ and content-hashed
 *   - Wallet signatures (Base tx hashes) are recorded on each anchor
 *   - Anchors update from pending_media_ingest -> hashed -> wallet_signed
 *   - BotanicalLotusTrait consumes the signed anchor status via onEvent
 */

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { copyFile, readFile, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const ROOT = dirname(fileURLToPath(import.meta.url));
const REFERENCE_DIR = join(ROOT, 'reference');
const ANCHORS_PATH = join(ROOT, 'reference.anchors.json');
const EXTRACT_PATH = join(ROOT, 'reference.material-extract.json');
const ANCHOR_BASE_PY = resolve(join(ROOT, '..', '..', '..', '.ai-ecosystem', 'scripts', 'anchor_base.py'));

const ANCHOR_IDS = [
  'lotus-reference-2026-05-06-01',
  'lotus-reference-2026-05-06-02',
  'lotus-reference-2026-05-06-03',
];

const ROLES = ['material', 'silhouette', 'leaf_context'];

function sha256Hex(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function writeJson(path, data) {
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}

async function ingestImages(sourcePaths) {
  if (!existsSync(REFERENCE_DIR)) {
    mkdirSync(REFERENCE_DIR, { recursive: true });
  }

  const results = [];
  for (const [index, src] of sourcePaths.entries()) {
    const anchorId = ANCHOR_IDS[index];
    const role = ROLES[index];
    const ext = src.split('.').pop()?.toLowerCase() ?? 'bin';
    const canonicalName = `${anchorId}.${ext}`;
    const dest = join(REFERENCE_DIR, canonicalName);

    await copyFile(src, dest);
    const bytes = await readFile(dest);
    const info = await stat(dest);
    const hash = `sha256:${sha256Hex(bytes)}`;

    results.push({
      anchorId,
      role,
      sourcePath: src,
      localPath: `reference/${canonicalName}`,
      absolutePath: dest,
      contentHash: hash,
      byteLength: info.size,
      mimeType: guessMimeType(ext),
    });
  }
  return results;
}

function guessMimeType(ext) {
  switch (ext) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'png':
      return 'image/png';
    case 'webp':
      return 'image/webp';
    default:
      return 'application/octet-stream';
  }
}

async function generateUnsignedTxs(ingested) {
  // Prefer anchor_base.py when available; fallback to inline JSON generation.
  const usePython = existsSync(ANCHOR_BASE_PY);
  const txs = [];

  for (const item of ingested) {
    const receiptPath = `${item.absolutePath}.base.json`;
    const unsignedPath = `${item.absolutePath}.base-unsigned.json`;

    if (usePython) {
      try {
        await execFileAsync('python', [
          ANCHOR_BASE_PY,
          item.absolutePath,
          '--save-unsigned',
        ]);
      } catch (err) {
        console.error(`ERROR: anchor_base.py failed for ${item.localPath}: ${err.message}`);
        process.exit(1);
      }
    } else {
      // Inline fallback: emit the unsigned tx JSON shape anchor_base.py would produce.
      const tx = {
        chainId: 8453,
        from: '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3',
        to: '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3',
        value: 0,
        data: `0x${item.contentHash.replace('sha256:', '')}`,
        maxPriorityFeePerGas: '0x3e8',
        maxFeePerGas: '0x4c4b40',
        gas: 25000,
        type: 2,
      };
      writeFileSync(unsignedPath, `${JSON.stringify(tx, null, 2)}\n`);
      console.log(`[fallback] wrote unsigned tx to ${unsignedPath}`);
    }

    txs.push({
      ...item,
      unsignedTxPath: unsignedPath,
      receiptPath,
      walletSignature: null,
    });
  }
  return txs;
}

function updateAnchorsManifest(anchors, ingested) {
  const updatedAnchors = anchors.anchors.map((anchor) => {
    const match = ingested.find((i) => i.anchorId === anchor.id);
    if (!match) return anchor;
    const updated = {
      ...anchor,
      status: match.walletSignature ? 'wallet_signed' : 'hashed',
      content_hash: match.contentHash ?? anchor.content_hash,
      wallet_signature: match.walletSignature ?? null,
      note: match.walletSignature
        ? `CAEL-anchored on Base via tx ${match.walletSignature}`
        : 'Content hashed; pending Base tx broadcast by founder anchor.',
    };
    if (match.localPath) {
      updated.uri = `file://${match.localPath}`;
    }
    if (match.mimeType) {
      updated.mime_type = match.mimeType;
    }
    if (typeof match.byteLength === 'number') {
      updated.byte_length = match.byteLength;
    }
    return updated;
  });

  const allSigned = updatedAnchors.every((a) => a.status === 'wallet_signed');
  const allHashed = updatedAnchors.every((a) => a.status === 'hashed' || a.status === 'wallet_signed');

  return {
    ...anchors,
    status: allSigned ? 'wallet_signed' : allHashed ? 'content_hashed' : 'pending_media_ingest',
    wallet_signature_status: allSigned ? 'wallet_signed' : 'pending_cael_anchor',
    anchors: updatedAnchors,
  };
}

function updateExtractManifest(extract, ingested) {
  const allSigned = ingested.every((i) => i.walletSignature);
  const allHashed = ingested.every((i) => i.contentHash);

  return {
    ...extract,
    status: allSigned
      ? 'visual-seed-with-signed-anchors'
      : allHashed
        ? 'visual-seed-with-hashed-anchors'
        : 'visual-seed-with-pending-anchors',
    source: {
      ...extract.source,
      content_hash_status: allHashed ? 'complete' : extract.source.content_hash_status,
      wallet_signature_status: allSigned ? 'complete' : 'pending_cael_anchor',
      note: allSigned
        ? 'All reference anchors are content-hashed and CAEL-signed on Base.'
        : allHashed
          ? 'Reference anchors are content-hashed; Base tx broadcast pending founder action.'
          : extract.source.note,
    },
    renderer_mapping: {
      ...extract.renderer_mapping,
      photorealism_status: allSigned ? 'extractor_available' : 'extractor_available_pending_cael_anchor',
    },
  };
}

async function recordTxHashes(txHashes) {
  if (txHashes.length !== ANCHOR_IDS.length) {
    console.error(`ERROR: Expected ${ANCHOR_IDS.length} tx hashes, got ${txHashes.length}`);
    process.exit(1);
  }

  const anchors = readJson(ANCHORS_PATH);
  const extract = readJson(EXTRACT_PATH);

  const ingested = [];
  for (const [index, anchorId] of ANCHOR_IDS.entries()) {
    const anchor = anchors.anchors.find((a) => a.id === anchorId);
    if (!anchor) {
      console.error(`ERROR: Anchor ${anchorId} not found in ${ANCHORS_PATH}`);
      process.exit(1);
    }
    if (!anchor.content_hash) {
      console.error(`ERROR: Anchor ${anchorId} has no content_hash. Run Phase 1 first.`);
      process.exit(1);
    }

    const txHash = txHashes[index].toLowerCase();
    if (!/^0x[0-9a-f]{64}$/.test(txHash)) {
      console.error(`ERROR: Invalid tx hash: ${txHash}`);
      process.exit(1);
    }

    ingested.push({
      anchorId,
      contentHash: anchor.content_hash,
      walletSignature: txHash,
      role: anchor.role,
    });
  }

  const updatedAnchors = updateAnchorsManifest(anchors, ingested);
  const updatedExtract = updateExtractManifest(extract, ingested);

  writeJson(ANCHORS_PATH, updatedAnchors);
  writeJson(EXTRACT_PATH, updatedExtract);

  console.log(`Recorded ${txHashes.length} Base tx hash(es).`);
  console.log(`  Anchors status: ${updatedAnchors.status}`);
  console.log(`  Extract status: ${updatedExtract.status}`);
  console.log(`  Next: verify on BaseScan, then run BotanicalLotusTrait tests.`);
}

async function printStatus() {
  const anchors = readJson(ANCHORS_PATH);
  const extract = readJson(EXTRACT_PATH);

  console.log('Lotus Reference Anchor Status');
  console.log('');
  console.log(`Manifest:        ${anchors.status}`);
  console.log(`Wallet status:   ${anchors.wallet_signature_status}`);
  console.log(`Extract status:  ${extract.status}`);
  console.log('');
  for (const anchor of anchors.anchors) {
    const sigStatus = anchor.wallet_signature
      ? `signed (${anchor.wallet_signature.slice(0, 18)}...)`
      : anchor.content_hash
        ? 'hashed, pending tx'
        : 'pending media ingest';
    console.log(`  [${anchor.role?.padStart(13)}] ${anchor.id}`);
    console.log(`             uri:  ${anchor.uri}`);
    console.log(`             hash: ${anchor.content_hash ?? 'null'}`);
    console.log(`             sig:  ${sigStatus}`);
    console.log('');
  }
}

async function main() {
  const args = process.argv.slice(2);
  const statusMode = args.includes('--status');
  const recordMode = args.includes('--record');

  if (statusMode) {
    await printStatus();
    return;
  }

  if (recordMode) {
    const txHashes = args.filter((a) => !a.startsWith('--'));
    await recordTxHashes(txHashes);
    return;
  }

  // Phase 1: ingest + hash + generate unsigned txs
  const imagePaths = args.filter((a) => !a.startsWith('--'));
  if (imagePaths.length === 0) {
    console.error(
      'Usage:\n' +
        '  node sign-lotus-references.mjs <photo1> <photo2> <photo3>\n' +
        '  node sign-lotus-references.mjs --record 0x<tx1> 0x<tx2> 0x<tx3>\n' +
        '  node sign-lotus-references.mjs --status'
    );
    process.exit(1);
  }

  if (imagePaths.length !== ANCHOR_IDS.length) {
    console.error(
      `ERROR: Expected exactly ${ANCHOR_IDS.length} image paths (material, silhouette, leaf_context), got ${imagePaths.length}`
    );
    process.exit(1);
  }

  const anchors = readJson(ANCHORS_PATH);
  const extract = readJson(EXTRACT_PATH);

  console.log(`Ingesting ${imagePaths.length} reference image(s) into ${REFERENCE_DIR}...`);
  const ingested = await ingestImages(imagePaths);
  for (const i of ingested) {
    console.log(`  [${i.role}] ${i.anchorId} -> ${i.localPath} (${i.contentHash})`);
  }

  console.log('\nGenerating unsigned Base anchor transactions...');
  const signed = await generateUnsignedTxs(ingested);
  for (const s of signed) {
    console.log(`  [${s.role}] unsigned tx: ${s.unsignedTxPath}`);
  }

  const updatedAnchors = updateAnchorsManifest(anchors, signed);
  const updatedExtract = updateExtractManifest(extract, signed);

  writeJson(ANCHORS_PATH, updatedAnchors);
  writeJson(EXTRACT_PATH, updatedExtract);

  console.log('\nUpdated manifests:');
  console.log(`  ${ANCHORS_PATH} -> ${updatedAnchors.status}`);
  console.log(`  ${EXTRACT_PATH} -> ${updatedExtract.status}`);
  console.log('');
  console.log('Next steps:');
  console.log('  1. Founder: broadcast each unsigned tx via Trezor/Rabby (see .base-unsigned.json files)');
  console.log('  2. Record tx hashes:');
  console.log(
    `     node examples/lotus-flower/sign-lotus-references.mjs --record 0x<tx1> 0x<tx2> 0x<tx3>`
  );
  console.log('  3. Verify: node examples/lotus-flower/sign-lotus-references.mjs --status');
  console.log('  4. Run BotanicalLotusTrait tests to confirm signed-anchor consumption.');
}

main().catch((err) => {
  console.error(err?.stack ?? err);
  process.exit(1);
});
