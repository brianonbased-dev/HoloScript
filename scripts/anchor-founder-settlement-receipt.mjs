#!/usr/bin/env node
/**
 * anchor-founder-settlement-receipt.mjs — task_1778132312944_bcup.
 *
 * Founder-anchored settlement-receipt broadcaster for xsp6 chain-anchor
 * Phase 2 (the Trezor swap). Produces:
 *
 *   1. The EIP-712 hash for a synthetic founder-anchored SettlementReceipt
 *      (matches the canonical shape in
 *      packages/mcp-server/src/holomesh/signing/chain-anchor.ts).
 *   2. A self-contained HTML broadcaster mirroring
 *      ~/.ai-ecosystem/scripts/broadcast_attest_2026-05-06_seat-via-tx.html
 *      so Joseph can broadcast a Base self-tx via Rabby + Trezor.
 *
 * Pattern (F.041 / W.GOLD.514 — chain-anchor bypass for canonicalization rot):
 *   The Trezor + Rabby + signTypedData_v4 path has known canonicalization
 *   drift. The proven bypass is a self-tx on Base whose calldata equals the
 *   EIP-712 hash. The chain enforces `from` cryptographically, so on-chain
 *   confirmation == signed-by-anchor.
 *
 * Use:
 *   node scripts/anchor-founder-settlement-receipt.mjs            # default: write HTML, print hash
 *   node scripts/anchor-founder-settlement-receipt.mjs --verify <tx_hash>
 *
 * Verify mode polls Base RPC for the tx, asserts:
 *   tx.from   == FOUNDER_ANCHOR
 *   tx.input  == eip712_hash
 *   receipt.status == 0x1
 *
 * Stacks on commit 98b94e0e4 (xsp6 Phase 2 scaffolding) — uses the same
 * SETTLEMENT_RECEIPT_TYPES + settlementDomain shape as the runtime path.
 */

import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { hashTypedData } from 'viem';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, '..');

// ── Constants pinned to the runtime path (chain-anchor.ts) ─────────────

// S-01 fix: wallet address is now configurable via env so rotation does not
// require a code change. Fall back to the legacy hard-pinned value for
// backward compatibility when the env var is absent.
//
//   export HOLOMESH_FOUNDER_ANCHOR=0xYourNewAddress
//   node scripts/anchor-founder-settlement-receipt.mjs
//
const FOUNDER_ANCHOR =
  process.env.HOLOMESH_FOUNDER_ANCHOR?.trim() ||
  '0x0C574397150Ad8d9f7FEF83fe86a2CBdf4A660E3';
const BASE_CHAIN_ID = 8453;
const BASE_CHAIN_ID_HEX = '0x2105';

const DOMAIN = {
  name: 'HoloMeshNegotiation',
  version: '1',
  chainId: BASE_CHAIN_ID,
};

const MARATHON_RESULT_HASH =
  '0x' +
  createHash('sha256')
    .update('founder-anchor-2026-05-06-marathon:agentic-internet-substrate')
    .digest('hex');

// Mirror SETTLEMENT_RECEIPT_TYPES from chain-anchor.ts exactly.
const SETTLEMENT_RECEIPT_TYPES = {
  SettlementReceipt: [
    { name: 'protocol', type: 'string' },
    { name: 'negotiationId', type: 'string' },
    { name: 'initiatorAddress', type: 'address' },
    { name: 'responderAddress', type: 'address' },
    { name: 'initiatorSignature', type: 'string' },
    { name: 'responderSignature', type: 'string' },
    { name: 'resultHash', type: 'string' },
    { name: 'toolName', type: 'string' },
    { name: 'description', type: 'string' },
    { name: 'price', type: 'uint256' },
    { name: 'currency', type: 'string' },
    { name: 'slaSeconds', type: 'uint256' },
    { name: 'expiresAt', type: 'string' },
    { name: 'settledAt', type: 'string' },
  ],
};

// ── The synthetic founder-anchored settlement receipt ──────────────────
//
// This is the FIRST production-anchored xsp6 settlement on Base. It marks
// the transition from placeholder-hex-sig (Phase 1 commit cbdab1387) to
// chain-authoritative settlement (Phase 2 + this Trezor swap).
//
// Semantic content: founder commits to "agentic-internet-substrate" as a
// tool delivery — i.e., this receipt witnesses the 11-task
// shipping marathon of 2026-05-06 itself as the negotiated outcome.

const SETTLEMENT_RECEIPT = {
  protocol: 'holomesh.negotiation.v1',
  negotiationId: 'founder-anchor-2026-05-06-marathon',
  initiatorAddress: FOUNDER_ANCHOR,
  responderAddress: FOUNDER_ANCHOR,
  initiatorSignature: '0xfounder-anchor-attestation-marathon-2026-05-06',
  responderSignature: '0xfounder-anchor-attestation-marathon-2026-05-06',
  resultHash: MARATHON_RESULT_HASH,
  toolName: 'agentic-internet-substrate',
  description:
    'Marathon 2026-05-06: 11 tasks shipped (jira/u8q2/zp7u/xsp6/yqll/qe2i/0mxs/ + Phase 2/3 + scaffolding). Witnesses the substrate.',
  price: '0', // unit-256 string for canonical encoding; this is a non-monetary attestation
  currency: 'NONE',
  slaSeconds: '0', // already delivered — settlement on commit
  expiresAt: '2026-05-13T00:00:00.000Z',
  settledAt: '2026-05-07T06:30:00.000Z',
};

// ── Compute the EIP-712 hash (matches chain-anchor.ts) ─────────────────

function computeEip712Hash() {
  const message = {
    protocol: SETTLEMENT_RECEIPT.protocol,
    negotiationId: SETTLEMENT_RECEIPT.negotiationId,
    initiatorAddress: SETTLEMENT_RECEIPT.initiatorAddress,
    responderAddress: SETTLEMENT_RECEIPT.responderAddress,
    initiatorSignature: SETTLEMENT_RECEIPT.initiatorSignature,
    responderSignature: SETTLEMENT_RECEIPT.responderSignature,
    resultHash: SETTLEMENT_RECEIPT.resultHash,
    toolName: SETTLEMENT_RECEIPT.toolName,
    description: SETTLEMENT_RECEIPT.description,
    price: BigInt(SETTLEMENT_RECEIPT.price),
    currency: SETTLEMENT_RECEIPT.currency,
    slaSeconds: BigInt(SETTLEMENT_RECEIPT.slaSeconds),
    expiresAt: SETTLEMENT_RECEIPT.expiresAt,
    settledAt: SETTLEMENT_RECEIPT.settledAt,
  };
  return hashTypedData({
    domain: DOMAIN,
    types: SETTLEMENT_RECEIPT_TYPES,
    primaryType: 'SettlementReceipt',
    message,
  });
}

// ── Generate the broadcaster HTML ──────────────────────────────────────

function buildBroadcasterHtml(eip712Hash) {
  const cardJson = JSON.stringify(
    {
      negotiationId: SETTLEMENT_RECEIPT.negotiationId,
      toolName: SETTLEMENT_RECEIPT.toolName,
      description: SETTLEMENT_RECEIPT.description,
      currency: SETTLEMENT_RECEIPT.currency,
      price: SETTLEMENT_RECEIPT.price,
      slaSeconds: SETTLEMENT_RECEIPT.slaSeconds,
      settledAt: SETTLEMENT_RECEIPT.settledAt,
    },
    null,
    2
  );

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>xsp6 Settlement Receipt — Trezor anchor on Base</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
         max-width: 820px; margin: 32px auto; padding: 0 20px; color: #1a1a1a; background: #fafafa; }
  h1 { font-size: 22px; margin: 0 0 6px; }
  h1 small { color: #666; font-weight: normal; font-size: 14px; }
  .why { background: #fff; border: 1px solid #ddd; border-left: 4px solid #2563eb; padding: 12px 16px; border-radius: 4px; margin: 14px 0; font-size: 13px; }
  .why b { color: #1e40af; }
  .card { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 16px 18px; margin: 14px 0; }
  .card.active { border-color: #2563eb; box-shadow: 0 0 0 2px rgba(37,99,235,.15); }
  .card.confirmed { border-color: #16a34a; background: #f0fdf4; }
  .card.error { border-color: #dc2626; background: #fef2f2; }
  .row1 { display: flex; align-items: center; gap: 14px; margin-bottom: 8px; }
  .badge { font-size: 11px; font-weight: 700; text-transform: uppercase; padding: 3px 8px; border-radius: 4px; letter-spacing: .5px; white-space: nowrap; }
  .badge.waiting { background: #e5e7eb; color: #6b7280; }
  .badge.ready { background: #dbeafe; color: #1e40af; }
  .badge.pending { background: #fef3c7; color: #92400e; }
  .badge.confirmed { background: #d1fae5; color: #065f46; }
  .badge.error { background: #fecaca; color: #991b1b; }
  .meta { flex: 1; min-width: 0; }
  .meta b { display: block; font-size: 14px; }
  .meta .sub { font-size: 12px; color: #666; font-family: ui-monospace, Menlo, Consolas, monospace; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  button { padding: 8px 14px; font-size: 14px; border: 1px solid #2563eb; background: #2563eb; color: #fff; border-radius: 6px; cursor: pointer; white-space: nowrap; }
  button:disabled { background: #e5e7eb; border-color: #d1d5db; color: #9ca3af; cursor: not-allowed; }
  #connect { padding: 10px 18px; font-size: 15px; }
  #status { background: #fff; border: 1px solid #ddd; border-radius: 8px; padding: 14px 18px; margin-top: 16px; font-size: 13px; }
  #status .row { display: flex; gap: 12px; padding: 3px 0; }
  #status .row b { min-width: 130px; color: #666; font-weight: normal; }
  .warn { background: #fffbeb; border: 1px solid #fbbf24; padding: 10px 14px; border-radius: 6px; margin: 12px 0; font-size: 13px; }
  code, .mono { background: #f1f1f1; padding: 1px 5px; border-radius: 3px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 13px; }
  .field-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; }
  .field-table td { padding: 4px 8px; border-bottom: 1px solid #eee; vertical-align: top; }
  .field-table td:first-child { color: #666; width: 130px; font-weight: 500; }
  .field-table td:nth-child(2) { font-family: ui-monospace, Menlo, Consolas, monospace; word-break: break-all; }
  .hash-box { background: #f6f8fa; border: 1px solid #e5e7eb; padding: 8px 10px; border-radius: 4px; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 11px; word-break: break-all; margin-top: 6px; }
  .lab { font-size: 12px; color: #666; margin-top: 10px; font-weight: 600; }
  a { color: #2563eb; }
  pre.json { background: #f6f8fa; border: 1px solid #e5e7eb; padding: 10px 12px; border-radius: 4px; font-size: 11px; overflow-x: auto; }
</style>
</head>
<body>
<h1>xsp6 Settlement Receipt — Base self-tx <small>F.041 chain-anchor pattern</small></h1>

<div class="why">
<b>Why a tx instead of eth_signTypedData_v4:</b> The EIP-712 sign path has known canonicalization drift on Trezor + Rabby — 17-variant recovery test 2026-05-06 had zero matches (W.GOLD.514). The proven bypass: send a Base self-tx whose calldata equals the EIP-712 hash. Chain enforces <code>tx.from</code>, so on-chain confirmation IS cryptographic proof that <code>0x0C57…660E3</code> signed. Cost: ~$0.0005 on Base. This is the same pattern the seat-attestation broadcaster uses, applied to a SettlementReceipt.
</div>

<div id="connectBar"><button id="connect">Connect Rabby</button> <span style="color:#666; margin-left:10px;">Make sure Rabby is on <b>Base mainnet</b> with the founder-anchor account <code>0x0C57…660E3</code> selected.</span></div>
<div id="chainWarn" class="warn" style="display:none">Wrong network. <button id="switchChain" style="margin-left:10px">Switch to Base</button></div>
<div id="acctWarn" class="warn" style="display:none">Active account does not match expected anchor <code>0x0C57…660E3</code>. Switch in Rabby before signing.</div>

<div class="card" id="card">
  <div class="row1">
    <div class="meta">
      <b>founder-anchor-2026-05-06-marathon</b>
      <div class="sub">tool: agentic-internet-substrate · chain: Base 8453 · self-tx</div>
    </div>
    <span class="badge waiting" id="badge">Waiting</span>
    <button id="anchor" disabled>Anchor on Base</button>
  </div>
  <table class="field-table">
    <tr><td>protocol</td><td>${SETTLEMENT_RECEIPT.protocol}</td></tr>
    <tr><td>negotiationId</td><td>${SETTLEMENT_RECEIPT.negotiationId}</td></tr>
    <tr><td>toolName</td><td>${SETTLEMENT_RECEIPT.toolName}</td></tr>
    <tr><td>description</td><td>${SETTLEMENT_RECEIPT.description}</td></tr>
    <tr><td>currency</td><td>${SETTLEMENT_RECEIPT.currency}</td></tr>
    <tr><td>price</td><td>${SETTLEMENT_RECEIPT.price}</td></tr>
    <tr><td>slaSeconds</td><td>${SETTLEMENT_RECEIPT.slaSeconds}</td></tr>
    <tr><td>settledAt</td><td>${SETTLEMENT_RECEIPT.settledAt}</td></tr>
  </table>
  <div class="lab">EIP-712 hash (this becomes tx.data)</div>
  <div class="hash-box mono" id="hashbox">${eip712Hash}</div>
</div>

<div id="status">
  <div class="row"><b>Wallet</b><span id="s-wallet">—</span></div>
  <div class="row"><b>Network</b><span id="s-chain">—</span></div>
  <div class="row"><b>On-chain nonce</b><span id="s-nonce">—</span></div>
  <div class="row"><b>Balance</b><span id="s-balance">—</span></div>
</div>

<div id="finalize" style="display:none; margin-top:20px;">
  <div class="lab">Anchor confirmed. Tx hash:</div>
  <div class="hash-box mono" id="tx-hash">—</div>
  <p style="font-size:13px; margin-top:14px;"><b>Verify command (run in repo):</b></p>
  <div class="hash-box" id="submit-cmd"></div>
  <p style="font-size:13px; margin-top:14px;">Verify on Basescan: <a id="basescan-link" href="#" target="_blank">view tx</a></p>
  <div class="lab">Settlement receipt JSON (the durable artifact)</div>
  <pre class="json" id="receipt-json"></pre>
</div>

<script>
const EXPECTED_WALLET = "${FOUNDER_ANCHOR}";
const BASE_CHAIN_ID_HEX = "${BASE_CHAIN_ID_HEX}";
const BASE_CHAIN_ID = ${BASE_CHAIN_ID};
const EIP712_HASH = "${eip712Hash}";
const RECEIPT = ${cardJson};

let walletAddress = null;

function formatEther(hexWei) {
  const wei = BigInt(hexWei);
  const whole = wei / 1000000000000000000n;
  const frac = (wei % 1000000000000000000n).toString().padStart(18, "0").slice(0, 6);
  return whole.toString() + "." + frac.replace(/0+$/, "").padEnd(1, "0");
}

async function waitForReceipt(txHash) {
  for (let i = 0; i < 120; i++) {
    const receipt = await window.ethereum.request({
      method: "eth_getTransactionReceipt",
      params: [txHash],
    });
    if (receipt) return receipt;
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Timed out waiting for transaction receipt");
}

async function connect() {
  if (!window.ethereum) {
    alert("No injected wallet detected. Install Rabby (with Trezor backend) and reload.");
    return;
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  walletAddress = accounts[0].toLowerCase();
  const chainIdHex = await window.ethereum.request({ method: "eth_chainId" });
  const chainId = Number.parseInt(chainIdHex, 16);

  document.getElementById("s-wallet").textContent = walletAddress;
  document.getElementById("s-chain").textContent = chainId + " " + (chainId === BASE_CHAIN_ID ? "(Base)" : "(WRONG)");

  if (walletAddress !== EXPECTED_WALLET.toLowerCase()) {
    document.getElementById("acctWarn").style.display = "block";
  }
  if (chainId !== BASE_CHAIN_ID) {
    document.getElementById("chainWarn").style.display = "block";
  } else {
    const nonce = await window.ethereum.request({
      method: "eth_getTransactionCount",
      params: [walletAddress, "latest"],
    });
    const balanceWei = await window.ethereum.request({
      method: "eth_getBalance",
      params: [walletAddress, "latest"],
    });
    document.getElementById("s-nonce").textContent = Number.parseInt(nonce, 16);
    document.getElementById("s-balance").textContent = formatEther(balanceWei) + " ETH";
  }

  if (walletAddress === EXPECTED_WALLET.toLowerCase() && chainId === BASE_CHAIN_ID) {
    document.getElementById("anchor").disabled = false;
    document.getElementById("badge").className = "badge ready";
    document.getElementById("badge").textContent = "Ready";
    document.getElementById("card").className = "card active";
  }

  window.ethereum.on("accountsChanged", () => location.reload());
  window.ethereum.on("chainChanged", () => location.reload());
}

async function switchChain() {
  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: BASE_CHAIN_ID_HEX }],
    });
    location.reload();
  } catch (err) {
    alert("Could not switch chain: " + (err.message || err));
  }
}

async function anchor() {
  const badge = document.getElementById("badge");
  const card = document.getElementById("card");
  badge.className = "badge pending";
  badge.textContent = "Pending Trezor confirmation";
  document.getElementById("anchor").disabled = true;

  try {
    const txHash = await window.ethereum.request({
      method: "eth_sendTransaction",
      params: [{
        from: walletAddress,
        to: walletAddress, // self-tx
        value: "0x0",
        data: EIP712_HASH,
        chainId: BASE_CHAIN_ID_HEX,
      }],
    });
    badge.textContent = "Broadcasting…";
    document.getElementById("tx-hash").textContent = txHash;

    const receipt = await waitForReceipt(txHash);
    const blockNumber = Number.parseInt(receipt.blockNumber, 16);
    badge.className = "badge confirmed";
    badge.textContent = "Confirmed in block " + blockNumber;
    card.className = "card confirmed";

    document.getElementById("finalize").style.display = "block";
    document.getElementById("tx-hash").textContent = txHash;
    document.getElementById("basescan-link").href = "https://basescan.org/tx/" + txHash;

    const submitCmd = "node scripts/anchor-founder-settlement-receipt.mjs --verify " + txHash;
    document.getElementById("submit-cmd").textContent = submitCmd;

    document.getElementById("receipt-json").textContent = JSON.stringify({
      ...RECEIPT,
      eip712Hash: EIP712_HASH,
      settlementTxHash: txHash,
      blockNumber,
      signerAddress: walletAddress,
      chainId: BASE_CHAIN_ID,
    }, null, 2);
  } catch (err) {
    badge.className = "badge error";
    badge.textContent = "Error";
    card.className = "card error";
    document.getElementById("anchor").disabled = false;
    alert("Broadcast failed: " + (err.message || err));
  }
}

document.getElementById("connect").addEventListener("click", connect);
document.getElementById("switchChain").addEventListener("click", switchChain);
document.getElementById("anchor").addEventListener("click", anchor);
</script>
</body>
</html>
`;
}

// ── Verify mode ────────────────────────────────────────────────────────

async function verifyTx(txHash, expectedHash) {
  const RPC = process.env.HOLOMESH_BASE_RPC ?? 'https://mainnet.base.org';
  // S-02 fix: cap each RPC call with an AbortController so the process
  // cannot hang indefinitely on an unresponsive node.
  const RPC_TIMEOUT_MS = Number(process.env.HOLOMESH_RPC_TIMEOUT_MS ?? 15_000);
  const body = (method, params) =>
    JSON.stringify({ jsonrpc: '2.0', id: 1, method, params });

  async function rpc(method, params) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), RPC_TIMEOUT_MS);
    let res;
    try {
      res = await fetch(RPC, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: body(method, params),
        signal: controller.signal,
      });
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(
          `${method} timed out after ${RPC_TIMEOUT_MS}ms — set HOLOMESH_RPC_TIMEOUT_MS to adjust or HOLOMESH_BASE_RPC to a faster endpoint`
        );
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
    const j = await res.json();
    if (j.error) throw new Error(`${method} failed: ${JSON.stringify(j.error)}`);
    return j.result;
  }

  const tx = await rpc('eth_getTransactionByHash', [txHash]);
  if (!tx) {
    console.error(`TX NOT FOUND: ${txHash}`);
    process.exit(2);
  }
  const receipt = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!receipt) {
    console.error(`RECEIPT NOT FOUND: ${txHash}`);
    process.exit(2);
  }

  const checks = {
    'tx.from == FOUNDER_ANCHOR':
      tx.from.toLowerCase() === FOUNDER_ANCHOR.toLowerCase(),
    'tx.to == tx.from (self-tx)':
      tx.to && tx.to.toLowerCase() === tx.from.toLowerCase(),
    'tx.input == eip712_hash':
      tx.input.toLowerCase() === expectedHash.toLowerCase(),
    'receipt.status == 0x1':
      receipt.status === '0x1',
    'tx.chainId == 8453 (Base)':
      Number.parseInt(tx.chainId ?? '0x0', 16) === BASE_CHAIN_ID,
  };

  console.log('CHAIN-ANCHOR VERIFICATION');
  console.log(`  tx hash:    ${txHash}`);
  console.log(`  block:      ${Number.parseInt(receipt.blockNumber, 16)}`);
  console.log(`  from:       ${tx.from}`);
  console.log(`  to:         ${tx.to}`);
  console.log(`  input:      ${tx.input}`);
  console.log(`  expected:   ${expectedHash}`);
  console.log('');
  console.log('CHECKS');
  let allOk = true;
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}`);
    if (!ok) allOk = false;
  }
  console.log('');
  console.log(allOk ? 'VERIFIED' : 'FAILED');
  process.exit(allOk ? 0 : 1);
}

// ── Main ───────────────────────────────────────────────────────────────

const eip712Hash = computeEip712Hash();

const args = process.argv.slice(2);
if (args[0] === '--verify') {
  const txHash = args[1];
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    console.error('usage: --verify <tx_hash> (66-char 0x-prefixed)');
    process.exit(2);
  }
  await verifyTx(txHash, eip712Hash);
} else {
  const outDir = join(REPO_ROOT, '.broadcaster');
  if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });
  const outPath = join(outDir, 'anchor-settlement-receipt-2026-05-06.html');
  writeFileSync(outPath, buildBroadcasterHtml(eip712Hash));

  console.log('FOUNDER-ANCHORED SETTLEMENT RECEIPT — xsp6 Phase 2 Trezor swap');
  console.log('');
  console.log(`  negotiationId:  ${SETTLEMENT_RECEIPT.negotiationId}`);
  console.log(`  toolName:       ${SETTLEMENT_RECEIPT.toolName}`);
  console.log(`  EIP-712 hash:   ${eip712Hash}`);
  console.log(`  founder anchor: ${FOUNDER_ANCHOR}`);
  console.log(`  chain id:       ${BASE_CHAIN_ID} (Base mainnet)`);
  console.log('');
  console.log(`  HTML broadcaster written to:`);
  console.log(`    ${outPath}`);
  console.log('');
  console.log('NEXT (Joseph at Trezor):');
  console.log('  1. Open the HTML file in browser (Chrome/Brave/Firefox with Rabby installed)');
  console.log('  2. Click "Connect Rabby" — Trezor must be unlocked, Base mainnet selected');
  console.log('  3. Verify active account matches the founder anchor 0x0C57…660E3');
  console.log('  4. Click "Anchor on Base" — Rabby pops up, Trezor confirms physically');
  console.log('  5. Tx broadcasts; the page captures the tx hash');
  console.log('  6. Run: node scripts/anchor-founder-settlement-receipt.mjs --verify <tx_hash>');
}
