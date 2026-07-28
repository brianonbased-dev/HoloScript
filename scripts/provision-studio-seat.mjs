#!/usr/bin/env node
// provision-studio-seat.mjs — mint + register the Studio operate-surface seat.
//
// Gives HoloScript Studio a scoped secp256k1 seat so its server-side board
// signer (packages/studio/src/lib/boardSigner.ts) can file SIGNED board-task
// requests that the Phase-3-strict MCP board route accepts (the Capabilities
// surface "Request run" → /api/operations/request-run path).
//
// Mirrors the x402 challenge/register flow of provision-seat-wallets-x402.mjs
// (the SAME server endpoints + EIP-712 typed-data the other seats register
// with), but for a fresh, RANDOM key whose PRIVATE half is written ONLY to a
// gitignored operator file — never to the repo, never to .env in this repo,
// never printed.
//
// Flow:
//   1. Generate a random secp256k1 wallet (the Studio seat). PRIVATE key stays local.
//   2. POST /api/holomesh/register/challenge { wallet_address } → nonce
//   3. Sign EIP-712 { domain:{HoloMesh,v1}, Registration:[nonce:string], {nonce} }
//   4. POST /api/holomesh/register { name, wallet_address, nonce, signature } → agent + api_key
//   5. Write the PRIVATE key + address to C:\tmp\studio-seat-key.txt (gitignored),
//      labeled, for the operator to set as STUDIO_SEAT_SIGNING_KEY.
//
// The board signing gate is the EIP-191 signature recovery (the attestation
// registry is empty in prod — Phase-1 in-memory only), so registering the agent
// here is what gives the seat a HoloMesh identity; the SIGNATURE is what the
// board verifies. Registration also yields an api_key the operator MAY use if a
// dedicated Studio team Bearer is ever wanted (the board POST currently reuses
// Studio's existing HOLOMESH_API_KEY membership Bearer — see request-run route).
//
// Usage (from HoloScript root, needs ethers + the team key in ~/.ai-ecosystem/.env):
//   node scripts/provision-studio-seat.mjs            # dry-run (no network, no file)
//   node scripts/provision-studio-seat.mjs --execute  # challenge+register, write key file
//
// SAFETY: the private key NEVER touches stdout. Only the PUBLIC address is logged.

import { writeFileSync, readFileSync, existsSync, mkdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { request as httpsRequest } from 'node:https';
import { pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
const EXECUTE = args.includes('--execute');

const HOLOSCRIPT_ROOT =
  process.env.HOLOSCRIPT_ROOT || join(homedir(), 'Documents', 'GitHub', 'HoloScript');
const ethersPath = join(HOLOSCRIPT_ROOT, 'node_modules', 'ethers', 'lib.esm', 'index.js');
if (!existsSync(ethersPath)) {
  console.error(`[fatal] ethers not found at ${ethersPath}. Set HOLOSCRIPT_ROOT.`);
  process.exit(1);
}
const { Wallet } = await import(pathToFileURL(ethersPath).href);

// --- env (team Bearer is needed only to satisfy the register endpoint's auth) ---
function loadEnv() {
  const envPath = join(homedir(), '.ai-ecosystem', '.env');
  if (!existsSync(envPath)) return;
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (process.env[m[1]]) continue;
    process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}
loadEnv();

const HOLOMESH_KEY = process.env.HOLOMESH_API_KEY;
const SEAT_NAME = 'studio-operate-x402';
// Gitignored operator drop for the private key. C:\tmp is an additional working
// directory and is NOT inside any repo tree.
const KEY_OUT_PATH = process.env.STUDIO_SEAT_KEY_OUT || 'C:\\tmp\\studio-seat-key.txt';

function req(method, path, body, apiKey = HOLOMESH_KEY) {
  return new Promise((resolvePromise, reject) => {
    const r = httpsRequest(
      {
        host: 'mcp.holoscript.net',
        port: 443,
        method,
        path,
        headers: {
          ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
          'Content-Type': 'application/json',
        },
      },
      (res) => {
        let d = '';
        res.on('data', (c) => (d += c));
        res.on('end', () => resolvePromise({ status: res.statusCode, body: d }));
      }
    );
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

async function registerStudioSeat(wallet) {
  console.log(`[x402] requesting challenge for ${SEAT_NAME} (${wallet.address})...`);
  const chal = await req('POST', '/api/holomesh/register/challenge', {
    wallet_address: wallet.address,
  });
  if (chal.status === 404) {
    console.error('[fail] /register/challenge 404 — x402 register flow not deployed.');
    return { aborted: 'server-not-deployed' };
  }
  if (chal.status !== 200) {
    console.error(`[fail] challenge: ${chal.status} ${String(chal.body).slice(0, 300)}`);
    return { aborted: 'challenge-failed', status: chal.status };
  }
  const nonce = JSON.parse(chal.body).nonce;
  console.log('[x402] nonce received; signing EIP-712...');

  const signature = await wallet.signTypedData(
    { name: 'HoloMesh', version: '1' },
    { Registration: [{ name: 'nonce', type: 'string' }] },
    { nonce }
  );

  const reg = await req('POST', '/api/holomesh/register', {
    name: SEAT_NAME,
    wallet_address: wallet.address,
    nonce,
    signature,
  });
  const parsed = (() => {
    try {
      return JSON.parse(reg.body);
    } catch {
      return { raw: reg.body };
    }
  })();
  console.log(`[x402] register status ${reg.status}`);
  if (reg.status !== 201) {
    console.error(`[fail] register: ${JSON.stringify(parsed).slice(0, 300)}`);
    return { aborted: 'register-failed', status: reg.status, parsed };
  }
  console.log(`[x402] ✓ agent_id=${parsed.agent?.id}`);
  return { parsed };
}

/** Write the private key to the gitignored operator drop. NEVER logs the key. */
function writeKeyFile(wallet, agent) {
  const dir = KEY_OUT_PATH.replace(/[\\/][^\\/]*$/, '');
  if (dir && !existsSync(dir)) mkdirSync(dir, { recursive: true });
  const contents = [
    '# HoloScript Studio seat signing key — DO NOT COMMIT, DO NOT SHARE.',
    '# Set this as STUDIO_SEAT_SIGNING_KEY in the Studio environment (.env SSOT + Railway).',
    `# Generated: ${new Date().toISOString()}`,
    `# Seat name: ${SEAT_NAME}`,
    `# Public address (safe to share): ${wallet.address}`,
    agent?.id
      ? `# HoloMesh agent id: ${agent.id}`
      : '# HoloMesh agent id: (registration incomplete)',
    '',
    `STUDIO_SEAT_SIGNING_KEY=${wallet.privateKey}`,
    '',
  ].join('\n');
  writeFileSync(KEY_OUT_PATH, contents, 'utf8');
  try {
    chmodSync(KEY_OUT_PATH, 0o600);
  } catch {
    /* best effort on Windows */
  }
  console.log(`[key] private key written to ${KEY_OUT_PATH} (address ${wallet.address})`);
}

(async () => {
  console.log(`\n=== Studio seat provisioning (x402) — ${EXECUTE ? 'EXECUTE' : 'DRY-RUN'} ===`);
  if (!EXECUTE) {
    // Dry-run: derive a throwaway address to show the shape; do NOT keep it,
    // do NOT hit the network, do NOT write a file.
    const w = Wallet.createRandom();
    console.log(`[dry-run] would generate a random secp256k1 seat wallet`);
    console.log(`[dry-run] would POST /register/challenge + /register (name=${SEAT_NAME})`);
    console.log(`[dry-run] would write STUDIO_SEAT_SIGNING_KEY to ${KEY_OUT_PATH}`);
    console.log(`[dry-run] sample address shape: ${w.address} (DISCARDED — not used)`);
    console.log(`\n(re-run with --execute to mint + register + write the key file)`);
    return;
  }

  if (!HOLOMESH_KEY) {
    console.error(
      '[fatal] HOLOMESH_API_KEY not in ~/.ai-ecosystem/.env — needed for register auth.'
    );
    process.exit(1);
  }
  if (existsSync(KEY_OUT_PATH)) {
    console.error(
      `[fatal] ${KEY_OUT_PATH} already exists — refusing to overwrite a prior seat key.`
    );
    console.error(`[fatal] Move/delete it first if you intend to re-provision.`);
    process.exit(1);
  }

  const wallet = Wallet.createRandom();
  console.log(`[gen] studio seat address: ${wallet.address} (random secp256k1)`);

  const reg = await registerStudioSeat(wallet);
  if (reg.aborted) {
    console.error(`[fatal] registration aborted: ${reg.aborted}`);
    process.exit(1);
  }

  writeKeyFile(wallet, reg.parsed?.agent);

  console.log(`\n=== Studio seat provisioned ===`);
  console.log(`  Public address : ${wallet.address}`);
  console.log(`  Agent id       : ${reg.parsed?.agent?.id}`);
  console.log(`  Private key    : written to ${KEY_OUT_PATH} (NOT printed)`);
  console.log(`\nNext (operator): set STUDIO_SEAT_SIGNING_KEY from that file in Studio's`);
  console.log(`.env SSOT + Railway, then the Capabilities "Request run" works end-to-end.`);
})().catch((e) => {
  console.error('FAIL:', e?.message || e);
  process.exit(1);
});
