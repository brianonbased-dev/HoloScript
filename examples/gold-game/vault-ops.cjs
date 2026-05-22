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

module.exports = { nextTier, ALL_TIERS, SEED, stateDigest, buildSandbox, findEntry, graduate, readState };
