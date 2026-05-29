#!/usr/bin/env node
/**
 * sign-receipt.mjs — Anchor a receipt v2 JSON to OpenTimestamps and
 * (optionally) Base mainnet via the agent wallet.
 *
 * Phase 4 closure of the receipt-v2 schema's `ots_proof_path` and
 * `anchor_chain` fields, both null until signed.
 *
 * Workflow:
 *   1. Read the receipt JSON.
 *   2. Strip any existing `ots_proof_path` / `anchor_chain` (so re-signing
 *      always anchors the unmodified body).
 *   3. Compute SHA-256 of the canonical JSON bytes — this is the digest
 *      that reviewers can verify by hashing the receipt themselves.
 *   4. Invoke ai-ecosystem `scripts/anchor_ots.py` to produce a `.ots`
 *      sidecar next to the receipt. Three public Bitcoin-anchored OTS
 *      calendars receive the digest (free, Bitcoin-confirmed within
 *      hours).
 *   5. Optionally, with `--anchor-chain base-mainnet`, invoke
 *      ai-ecosystem `scripts/anchor_base_x402.mjs` to put the digest on
 *      Base. Spend is autonomy-class per F.071 (agent wallet, benchmark
 *      anchoring authorized).
 *   6. Write the receipt back with `ots_proof_path` and (if requested)
 *      `anchor_chain` populated.
 *
 * Usage:
 *   node scripts/webgpu-capture/sign-receipt.mjs <receipt.json>
 *   node scripts/webgpu-capture/sign-receipt.mjs --anchor-chain base-mainnet <receipt.json>
 *
 * The script delegates the cryptographic work to the existing
 * ai-ecosystem anchor tools so we don't reimplement OTS / RPC handling.
 *
 * Receipt-v2 fields touched:
 *   payload_digest    : sha256 of the canonical (pre-anchor) receipt JSON
 *   ots_proof_path    : path to the `.ots` sidecar, relative to repo root
 *   anchor_chain      : 'base-mainnet:<tx>' | 'base-sepolia:<tx>' | null
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import * as path from 'node:path';

// ── CLI ──────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.length === 0 || args.includes('--help')) {
  console.error('Usage: sign-receipt.mjs [--anchor-chain base-mainnet|base-sepolia] <receipt.json>');
  process.exit(1);
}
const chainIdx = args.indexOf('--anchor-chain');
const chain = chainIdx >= 0 ? args[chainIdx + 1] : null;
const receiptPath = args[args.length - 1];
if (!existsSync(receiptPath)) {
  console.error(`receipt not found: ${receiptPath}`);
  process.exit(1);
}

// ── 1-3. Compute canonical digest ────────────────────────────────────────
const receipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
delete receipt.ots_proof_path;
delete receipt.anchor_chain;
delete receipt.payload_digest;
const canonical = JSON.stringify(receipt, null, 2) + '\n';
const payloadDigest = createHash('sha256').update(canonical).digest('hex');
console.log(`[sign-receipt] receipt: ${receiptPath}`);
console.log(`[sign-receipt] payload_digest: ${payloadDigest}`);

// Re-write the receipt with the canonical bytes we're about to anchor.
// (Re-anchoring of a modified receipt produces a different digest, by design.)
writeFileSync(receiptPath, canonical, 'utf8');

// ── 4. OTS anchor via ai-ecosystem/scripts/anchor_ots.py ─────────────────
const aiEcosystemRoot = findAiEcosystemRoot(receiptPath);
if (!aiEcosystemRoot) {
  console.error('[sign-receipt] cannot locate ai-ecosystem root for anchor_ots.py');
  process.exit(1);
}
const anchorOtsPy = path.join(aiEcosystemRoot, 'scripts', 'anchor_ots.py');
if (!existsSync(anchorOtsPy)) {
  console.error(`[sign-receipt] anchor_ots.py not found at ${anchorOtsPy}`);
  process.exit(1);
}
console.log(`[sign-receipt] OTS anchoring via ${anchorOtsPy}`);
try {
  execFileSync('python', [anchorOtsPy, receiptPath], {
    stdio: 'inherit',
    cwd: aiEcosystemRoot,
  });
} catch (e) {
  console.error(`[sign-receipt] anchor_ots.py failed: ${e.status ?? e.message}`);
  process.exit(2);
}
const otsPath = receiptPath + '.ots';
if (!existsSync(otsPath)) {
  console.error(`[sign-receipt] OTS sidecar not produced at ${otsPath}`);
  process.exit(2);
}
// ots_proof_path is recorded as the basename of the .ots sidecar — the
// sidecar always lives next to the receipt, so a basename is portable
// across repo moves and worktrees.
const otsRel = path.basename(otsPath);
console.log(`[sign-receipt] ots sidecar (relative to receipt dir): ${otsRel}`);

// ── 5. (Optional) Base anchor via anchor_base_x402.mjs ───────────────────
let anchorChain = null;
if (chain) {
  const anchorBaseMjs = path.join(aiEcosystemRoot, 'scripts', 'anchor_base_x402.mjs');
  if (!existsSync(anchorBaseMjs)) {
    console.error(`[sign-receipt] anchor_base_x402.mjs not found; skipping chain anchor`);
  } else {
    console.log(`[sign-receipt] Base anchoring via ${anchorBaseMjs} (chain=${chain})`);
    try {
      const out = execFileSync('node', [anchorBaseMjs, '--digest', payloadDigest, '--chain', chain], {
        encoding: 'utf8',
        cwd: aiEcosystemRoot,
      });
      const txMatch = out.match(/0x[0-9a-f]{64}/i);
      if (txMatch) {
        anchorChain = `${chain}:${txMatch[0]}`;
        console.log(`[sign-receipt] anchor_chain: ${anchorChain}`);
      } else {
        console.error(`[sign-receipt] anchor_base_x402.mjs did not return a tx hash; out:\n${out.slice(0, 800)}`);
      }
    } catch (e) {
      console.error(`[sign-receipt] anchor_base_x402.mjs failed: ${e.message}`);
    }
  }
}

// ── 6. Write receipt with proof fields ───────────────────────────────────
const signed = {
  ...receipt,
  payload_digest: payloadDigest,
  ots_proof_path: otsRel,
  anchor_chain: anchorChain,
};
writeFileSync(receiptPath, JSON.stringify(signed, null, 2) + '\n', 'utf8');
console.log(`[sign-receipt] receipt updated with proof fields → ${receiptPath}`);

// ── helpers ──────────────────────────────────────────────────────────────
function findAiEcosystemRoot(start) {
  // Walk up from the receipt path looking for a sibling .ai-ecosystem dir,
  // OR check the canonical Windows path. Falls back to env var if set.
  if (process.env.HOLOSCRIPT_AI_ECOSYSTEM) return process.env.HOLOSCRIPT_AI_ECOSYSTEM;
  const candidates = [
    'C:/Users/josep/.ai-ecosystem',
    '/c/Users/josep/.ai-ecosystem',
    path.resolve(path.dirname(start), '..', '..', '..', '..', '.ai-ecosystem'),
  ];
  for (const c of candidates) {
    if (existsSync(path.join(c, 'scripts', 'anchor_ots.py'))) return c;
  }
  return null;
}
