// THE GOLD GAME — Gate 2 vault operations (the "graduate" verb, for real).
// Operates on a WRITABLE SANDBOX vault (examples/gold-game/vault-sandbox), never on
// the governed D:/GOLD. A play-action (carry a gem up a tier) calls graduate() →
// a real file move + a hash-sealed graduation receipt. Promoting the sandbox into
// the real GOLD vault stays founder-gated (not done here). CommonJS so server.cjs
// (and the SEA exe) and the verifier can both require it. Node built-ins only.

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

// Honor the real vault: farm.py promote goes Bronze -> GOLD (Silver is fallow).
function nextTier(t) {
  return { bronze: 'gold', silver: 'gold', gold: 'platinum', platinum: 'diamond', diamond: null }[t] ?? null;
}
const ALL_TIERS = ['bronze', 'silver', 'gold', 'platinum', 'diamond'];

// Starting state — the entries already in the game, real IDs from D:/GOLD/INDEX.md.
const SEED = [
  { id: 'B.GRADUATE.001', title: 'graduate-incident-response', tier: 'bronze', lineage_links: 1 },
  { id: 'W.GOLD.535', title: 'secrets-broker-sovereign-primitive', tier: 'gold', lineage_links: 3 },
  { id: 'W.GOLD.534', title: 'audit-as-calibration', tier: 'gold', lineage_links: 2 },
  { id: 'P.GOLD.001', title: 'failure-knowledge-decays-slower', tier: 'diamond', lineage_links: 9 },
];

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Deterministic digest of the whole vault tier-state (id->tier), independent of timestamps.
function stateDigest(dir) {
  const rows = [];
  for (const tier of ALL_TIERS) {
    const d = path.join(dir, tier);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json')).sort()) {
      const e = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      rows.push(e.id + ':' + e.tier);
    }
  }
  rows.sort();
  return sha256(rows.join('|'));
}

function buildSandbox(dir) {
  fs.rmSync(dir, { recursive: true, force: true });
  for (const tier of ALL_TIERS) fs.mkdirSync(path.join(dir, tier), { recursive: true });
  fs.mkdirSync(path.join(dir, 'receipts'), { recursive: true });
  for (const e of SEED) fs.writeFileSync(path.join(dir, e.tier, e.id + '.json'), JSON.stringify(e, null, 2));
  return stateDigest(dir);
}

function findEntry(dir, id) {
  for (const tier of ALL_TIERS) {
    const p = path.join(dir, tier, id + '.json');
    if (fs.existsSync(p)) return { path: p, tier, entry: JSON.parse(fs.readFileSync(p, 'utf8')) };
  }
  return null;
}

// THE VERB. Moves an entry up a tier in the sandbox + emits a sealed receipt.
function graduate(dir, id, by) {
  const found = findEntry(dir, id);
  if (!found) return { ok: false, error: 'entry not found: ' + id };
  const to = nextTier(found.tier);
  if (!to) return { ok: false, error: id + ' is already at the top tier (' + found.tier + ')' };
  // honest gate: an entry needs lineage to ascend (mirrors farm.py lineage-detection promotion)
  if ((found.entry.lineage_links || 0) < 1) return { ok: false, error: id + ' has no lineage links — cannot graduate' };

  const fromTier = found.tier;
  const updated = { ...found.entry, tier: to };
  fs.writeFileSync(path.join(dir, to, id + '.json'), JSON.stringify(updated, null, 2));
  fs.rmSync(found.path);

  const receipt = {
    schema: 'cael-graduation-v1', entry: id, title: updated.title,
    fromTier, toTier: to, lineage_links: updated.lineage_links,
    by: by || 'curator', timestamp: new Date().toISOString(),
    stateDigest: stateDigest(dir), // deterministic post-state hash (the proof)
  };
  receipt.payloadHash = sha256(JSON.stringify({ entry: id, fromTier, toTier: to, stateDigest: receipt.stateDigest }));
  fs.writeFileSync(path.join(dir, 'receipts', 'graduation_' + id + '_' + Date.now() + '.json'), JSON.stringify(receipt, null, 2));
  return { ok: true, receipt, vaultWrite: 'sandbox only — promotion to D:/GOLD is founder-gated' };
}

function readState(dir) {
  const out = {};
  for (const tier of ALL_TIERS) {
    const d = path.join(dir, tier);
    out[tier] = fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.endsWith('.json')).map((f) => f.replace('.json', '')) : [];
  }
  return { tiers: out, stateDigest: stateDigest(dir) };
}

// ───────────────────────────────────────────────────────────────────────────
// GATE 27 — live-vault SAFE MUTATION FLOW (governance layer over graduate()).
//
// graduate() above writes immediately. That is fine for the sandbox, but a
// curation GAME that proposes changes to the REAL D:/GOLD vault must never write
// silently. This layer adds the governance contract:
//   proposeMutation()  — an AI curator (or human) PROPOSES a change. NOTHING is
//                         written to the vault. The proposal is queued + a diff
//                         preview is computed (before/after tier, post-digest).
//   applyMutation()    — FOUNDER-GATED. Without a matching approval token the
//                         apply is REFUSED and the vault is untouched. With the
//                         token the change is applied to the SANDBOX (promotion
//                         to real D:/GOLD remains a separate founder gate) and a
//                         hash-sealed cael-vault-mutation-v1 receipt is written
//                         carrying the pre-state digest (the rollback anchor).
//   rollbackMutation() — restores the EXACT pre-apply state from the receipt's
//                         snapshot; the restored digest must equal the receipt's
//                         preDigest (proven, not asserted). Reversible by design.
//
// The AI↔human connection: the AI proposes; the human (founder) ratifies; the
// vault is the shared world state both act on; every step leaves a receipt.
// ───────────────────────────────────────────────────────────────────────────

const PROPOSALS = path.join.bind(path);

function proposalsDir(dir) { return path.join(dir, 'proposals'); }

// Snapshot every entry json (id -> {tier, body}) — the rollback anchor.
function snapshotVault(dir) {
  const snap = {};
  for (const tier of ALL_TIERS) {
    const d = path.join(dir, tier);
    if (!fs.existsSync(d)) continue;
    for (const f of fs.readdirSync(d).filter((x) => x.endsWith('.json')).sort()) {
      const e = JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'));
      snap[e.id] = { tier, entry: e };
    }
  }
  return snap;
}

// Restore the vault to a snapshot exactly (clear all tiers, rewrite from snap).
function restoreSnapshot(dir, snap) {
  for (const tier of ALL_TIERS) {
    const d = path.join(dir, tier);
    fs.rmSync(d, { recursive: true, force: true });
    fs.mkdirSync(d, { recursive: true });
  }
  for (const id of Object.keys(snap)) {
    const { tier, entry } = snap[id];
    fs.writeFileSync(path.join(dir, tier, id + '.json'), JSON.stringify(entry, null, 2));
  }
  return stateDigest(dir);
}

// PROPOSE — compute the diff preview WITHOUT touching the vault. Queue it.
function proposeMutation(dir, { verb, id, by }) {
  const found = findEntry(dir, id);
  if (!found) return { ok: false, error: 'entry not found: ' + id };
  if (verb !== 'graduate') return { ok: false, error: 'unsupported verb: ' + verb };
  const to = nextTier(found.tier);
  if (!to) return { ok: false, error: id + ' is already at the top tier (' + found.tier + ')' };
  if ((found.entry.lineage_links || 0) < 1) return { ok: false, error: id + ' has no lineage links — cannot graduate' };

  const preDigest = stateDigest(dir); // unchanged — proposing must not mutate
  // Deterministic proposal id from the (verb,id,fromTier,toTier,preDigest) tuple,
  // so the same proposal under the same state reproduces (verifier can re-derive).
  const proposalId = 'prop_' + sha256([verb, id, found.tier, to, preDigest].join('|')).slice(0, 16);
  const approvalToken = sha256(['APPROVE', proposalId, preDigest].join('|')); // founder must present this exact token
  const proposal = {
    schema: 'cael-vault-proposal-v1', proposalId,
    verb, entry: id, title: found.entry.title,
    diff: { fromTier: found.tier, toTier: to, lineage_links: found.entry.lineage_links || 0 },
    preDigest,
    proposedBy: by || 'ai-curator', status: 'PENDING_FOUNDER_APPROVAL',
    note: 'founder-gated — call applyMutation with the matching approvalToken to apply; vault is UNTOUCHED until then',
    timestamp: new Date().toISOString(),
  };
  fs.mkdirSync(proposalsDir(dir), { recursive: true });
  fs.writeFileSync(path.join(proposalsDir(dir), proposalId + '.json'), JSON.stringify(proposal, null, 2));
  // The approvalToken is returned to the FOUNDER channel, never persisted in the
  // queued proposal — possessing the token IS the approval.
  return { ok: true, proposal, approvalToken, vaultWrite: 'NONE — proposal queued, vault untouched' };
}

// APPLY — founder-gated. Refuses without the matching approval token.
function applyMutation(dir, proposalId, approvalToken, by) {
  const pPath = path.join(proposalsDir(dir), proposalId + '.json');
  if (!fs.existsSync(pPath)) return { ok: false, error: 'no such proposal: ' + proposalId };
  const proposal = JSON.parse(fs.readFileSync(pPath, 'utf8'));

  // The vault may have moved since the proposal — refuse stale applies (digest fence).
  const curDigest = stateDigest(dir);
  if (curDigest !== proposal.preDigest) {
    return { ok: false, error: 'vault changed since proposal (stale) — re-propose', expected: proposal.preDigest, actual: curDigest };
  }
  // FOUNDER GATE: the apply token must match. No token, no write.
  const expectedToken = sha256(['APPROVE', proposalId, proposal.preDigest].join('|'));
  if (approvalToken !== expectedToken) {
    return { ok: false, error: 'REFUSED — invalid or missing founder approval token; vault untouched', vaultWrite: 'NONE' };
  }

  const preSnapshot = snapshotVault(dir);          // rollback anchor
  const preDigest = proposal.preDigest;
  const res = graduate(dir, proposal.entry, by || ('founder-approved:' + proposal.proposedBy));
  if (!res.ok) return res;
  const postDigest = stateDigest(dir);

  const receipt = {
    schema: 'cael-vault-mutation-v1', proposalId,
    verb: proposal.verb, entry: proposal.entry, title: proposal.title,
    diff: proposal.diff,
    preDigest, postDigest,
    preSnapshot,                                    // exact pre-state for rollback
    proposedBy: proposal.proposedBy,
    approvedBy: by || 'founder',
    graduationReceipt: res.receipt,
    vaultWrite: 'sandbox only — promotion to D:/GOLD is a separate founder gate',
    timestamp: new Date().toISOString(),
  };
  receipt.payloadHash = sha256(JSON.stringify({ proposalId, entry: proposal.entry, preDigest, postDigest }));
  fs.mkdirSync(path.join(dir, 'receipts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'receipts', 'mutation_' + proposalId + '_' + Date.now() + '.json'), JSON.stringify(receipt, null, 2));
  // proposal consumed
  proposal.status = 'APPLIED';
  fs.writeFileSync(pPath, JSON.stringify(proposal, null, 2));
  return { ok: true, receipt, preDigest, postDigest };
}

// ROLLBACK — restore the exact pre-apply state from a mutation receipt.
function rollbackMutation(dir, receipt, by) {
  if (!receipt || receipt.schema !== 'cael-vault-mutation-v1' || !receipt.preSnapshot) {
    return { ok: false, error: 'invalid mutation receipt — no preSnapshot to roll back to' };
  }
  const restoredDigest = restoreSnapshot(dir, receipt.preSnapshot);
  const ok = restoredDigest === receipt.preDigest; // PROVEN, not asserted
  const rollbackReceipt = {
    schema: 'cael-vault-rollback-v1', ofProposal: receipt.proposalId,
    entry: receipt.entry, restoredDigest, expectedPreDigest: receipt.preDigest,
    restoredExactly: ok, by: by || 'founder', timestamp: new Date().toISOString(),
  };
  rollbackReceipt.payloadHash = sha256(JSON.stringify({ ofProposal: receipt.proposalId, restoredDigest, restoredExactly: ok }));
  fs.mkdirSync(path.join(dir, 'receipts'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'receipts', 'rollback_' + receipt.proposalId + '_' + Date.now() + '.json'), JSON.stringify(rollbackReceipt, null, 2));
  return { ok, rollbackReceipt };
}

function listProposals(dir) {
  const d = proposalsDir(dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(fs.readFileSync(path.join(d, f), 'utf8')));
}

module.exports = {
  nextTier, ALL_TIERS, SEED, stateDigest, buildSandbox, findEntry, graduate, readState,
  snapshotVault, restoreSnapshot, proposeMutation, applyMutation, rollbackMutation, listProposals,
};
