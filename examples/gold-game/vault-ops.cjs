// THE GOLD GAME - Gate 2 vault operations (the "graduate" verb, for real).
// Operates on a WRITABLE SANDBOX vault (examples/gold-game/vault-sandbox), never on
// the governed D:/GOLD. A play-action (carry a gem up a tier) calls graduate() ->
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

// Starting state -- the entries already in the game, real IDs from D:/GOLD/INDEX.md.
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
  if ((found.entry.lineage_links || 0) < 1) return { ok: false, error: id + ' has no lineage links -- cannot graduate' };

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
  return { ok: true, receipt, vaultWrite: 'sandbox only -- promotion to D:/GOLD is founder-gated' };
}

function readState(dir) {
  const out = {};
  for (const tier of ALL_TIERS) {
    const d = path.join(dir, tier);
    out[tier] = fs.existsSync(d) ? fs.readdirSync(d).filter((x) => x.endsWith('.json')).map((f) => f.replace('.json', '')) : [];
  }
  return { tiers: out, stateDigest: stateDigest(dir) };
}

// -----------------------------------------------------------------------
// GATE 27 -- live-vault SAFE MUTATION FLOW (governance layer over graduate()).
//
// graduate() above writes immediately. That is fine for the sandbox, but a
// curation GAME that proposes changes to the REAL D:/GOLD vault must never write
// silently. This layer adds the governance contract:
//   proposeMutation()  -- an AI curator (or human) PROPOSES a change. NOTHING is
//                         written to the vault. The proposal is queued + a diff
//                         preview is computed (before/after tier, post-digest).
//   applyMutation()    -- FOUNDER-GATED. Without a matching approval token the
//                         apply is REFUSED and the vault is untouched. With the
//                         token the change is applied to the SANDBOX (promotion
//                         to real D:/GOLD remains a separate founder gate) and a
//                         hash-sealed cael-vault-mutation-v1 receipt is written
//                         carrying the pre-state digest (the rollback anchor).
//   rollbackMutation() -- restores the EXACT pre-apply state from the receipt's
//                         snapshot; the restored digest must equal the receipt's
//                         preDigest (proven, not asserted). Reversible by design.
//
// The AI<->human connection: the AI proposes; the human (founder) ratifies; the
// vault is the shared world state both act on; every step leaves a receipt.
// -----------------------------------------------------------------------

const PROPOSALS = path.join.bind(path);

function proposalsDir(dir) { return path.join(dir, 'proposals'); }

// Snapshot every entry json (id -> {tier, body}) -- the rollback anchor.
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

// PROPOSE -- compute the diff preview WITHOUT touching the vault. Queue it.
function proposeMutation(dir, { verb, id, by }) {
  const found = findEntry(dir, id);
  if (!found) return { ok: false, error: 'entry not found: ' + id };
  if (verb !== 'graduate') return { ok: false, error: 'unsupported verb: ' + verb };
  const to = nextTier(found.tier);
  if (!to) return { ok: false, error: id + ' is already at the top tier (' + found.tier + ')' };
  if ((found.entry.lineage_links || 0) < 1) return { ok: false, error: id + ' has no lineage links -- cannot graduate' };

  const preDigest = stateDigest(dir); // unchanged -- proposing must not mutate
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
    note: 'founder-gated -- call applyMutation with the matching approvalToken to apply; vault is UNTOUCHED until then',
    timestamp: new Date().toISOString(),
  };
  fs.mkdirSync(proposalsDir(dir), { recursive: true });
  fs.writeFileSync(path.join(proposalsDir(dir), proposalId + '.json'), JSON.stringify(proposal, null, 2));
  // The approvalToken is returned to the FOUNDER channel, never persisted in the
  // queued proposal -- possessing the token IS the approval.
  return { ok: true, proposal, approvalToken, vaultWrite: 'NONE -- proposal queued, vault untouched' };
}

// APPLY -- founder-gated. Refuses without the matching approval token.
function applyMutation(dir, proposalId, approvalToken, by) {
  const pPath = path.join(proposalsDir(dir), proposalId + '.json');
  if (!fs.existsSync(pPath)) return { ok: false, error: 'no such proposal: ' + proposalId };
  const proposal = JSON.parse(fs.readFileSync(pPath, 'utf8'));

  // The vault may have moved since the proposal -- refuse stale applies (digest fence).
  const curDigest = stateDigest(dir);
  if (curDigest !== proposal.preDigest) {
    return { ok: false, error: 'vault changed since proposal (stale) -- re-propose', expected: proposal.preDigest, actual: curDigest };
  }
  // FOUNDER GATE: the apply token must match. No token, no write.
  const expectedToken = sha256(['APPROVE', proposalId, proposal.preDigest].join('|'));
  if (approvalToken !== expectedToken) {
    return { ok: false, error: 'REFUSED -- invalid or missing founder approval token; vault untouched', vaultWrite: 'NONE' };
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
    vaultWrite: 'sandbox only -- promotion to D:/GOLD is a separate founder gate',
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

// ROLLBACK -- restore the exact pre-apply state from a mutation receipt.
function rollbackMutation(dir, receipt, by) {
  if (!receipt || receipt.schema !== 'cael-vault-mutation-v1' || !receipt.preSnapshot) {
    return { ok: false, error: 'invalid mutation receipt -- no preSnapshot to roll back to' };
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

// -----------------------------------------------------------------------
// GATE 28 -- FULL-VAULT BROWSER (catalog over the REAL governed D:/GOLD).
//
// The seeded gems (4 SEED entries) and the HoloGraph constellation (Gate 31)
// only surface a handful of entries. A real curation game must let the player
// search/filter/open EVERY entry in the vault, follow lineage links, read raw
// markdown, and see the provenance/receipt history each entry carries.
//
// This is READ-ONLY over the real vault (no writes -- graduate/mutate stay on
// the sandbox). The "receipt history" for a graduated entry is the provenance
// it carries in its own frontmatter -- graduated date, sha256 seal, source_ids,
// status, parent -- which IS the cael-graduation record of record. We surface
// that, plus any matching sandbox graduation receipts when present.
// -----------------------------------------------------------------------

const CATALOG_ROOTS = [
  'wisdom', 'patterns', 'gotchas', 'architectures', 'protocols',
  'bronze', 'silver', 'gold', 'platinum', 'diamond', 'graduated',
];

// Minimal frontmatter parser (vault entries use a YAML-ish `key: value` block).
function parseFrontmatterBlock(markdown) {
  const lines = String(markdown || '').split(/\r?\n/);
  if (lines[0] !== '---') return {};
  const out = {};
  for (let i = 1; i < lines.length; i++) {
    if (lines[i] === '---') break;
    const idx = lines[i].indexOf(':');
    if (idx > 0) out[lines[i].slice(0, idx).trim()] = lines[i].slice(idx + 1).trim();
  }
  return out;
}

// Pull entry IDs out of a frontmatter value like "[W.GOLD.001, F.020]" or "W.GOLD.002".
function extractRefs(value) {
  if (!value) return [];
  const ids = String(value).match(/\b[A-Z]+(?:\.[A-Z0-9]+)+\b/g) || [];
  return Array.from(new Set(ids));
}

// Build the lineage (links out) for an entry from its frontmatter.
function lineageOf(meta) {
  const out = [];
  if (meta.parent) out.push(...extractRefs(meta.parent));
  if (meta.references) out.push(...extractRefs(meta.references));
  if (meta.source_ids) {
    // source_ids holds GOLD IDs too (e.g. W.GOLD.x), keep only entry-shaped ones.
    out.push(...extractRefs(meta.source_ids).filter((id) => /\.(GOLD|TEAM)\./i.test(id) || /^[WPFBG]\.[A-Z]+\./.test(id)));
  }
  return Array.from(new Set(out));
}

// The provenance "receipt history" an entry carries in its own record.
function provenanceOf(meta) {
  return {
    graduated: meta.graduated || null,
    sha256: meta.sha256 || null,
    status: meta.status || null,
    tier: meta.tier || null,
    type: meta.type || null,
    domain: meta.domain || null,
    parent: meta.parent ? extractRefs(meta.parent) : [],
    sourceIds: meta.source_ids ? String(meta.source_ids).replace(/^\[|\]$/g, '').split(',').map((s) => s.trim()).filter(Boolean) : [],
  };
}

// Enumerate the WHOLE vault. Returns one summary row per entry (no full body --
// bodies are fetched on demand via vaultEntry). Drive-letter independent: the
// caller passes the resolved vault root.
function readVaultCatalog(vaultRoot) {
  const entries = [];
  const seenIds = new Set();
  const walk = (dir) => {
    let items = [];
    try { items = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
    for (const item of items) {
      if (item.name === '.git') continue;
      const p = path.join(dir, item.name);
      if (item.isDirectory()) { walk(p); continue; }
      if (!item.name.toLowerCase().endsWith('.md')) continue;
      let content = '';
      try { content = fs.readFileSync(p, 'utf8'); } catch (_) { continue; }
      const meta = parseFrontmatterBlock(content);
      const id = meta.id;
      if (!id || !/^[A-Z]+(\.[A-Z0-9]+)+$/.test(id)) continue; // only real, ID-bearing entries
      // The SHA-256 seal IS the graduation record of record: an entry without one
      // is a staged candidate awaiting graduation (e.g. the I.015-held trio in
      // graduated/staging/), not yet governed vault content. The full-vault browser
      // surfaces the VAULT, so unsealed candidates are excluded -- they enter the
      // catalog only once they carry a seal. (Skip BEFORE the seenIds guard so a
      // sealed copy elsewhere still wins over an unsealed staging duplicate.)
      if (!meta.sha256) continue;
      if (seenIds.has(id)) continue;
      seenIds.add(id);
      entries.push({
        id,
        title: meta.title || id,
        tier: (meta.tier || '').toLowerCase() || inferTierFromDir(vaultRoot, p),
        type: meta.type || '',
        domain: meta.domain || '',
        relativePath: path.relative(vaultRoot, p).replace(/\\/g, '/'),
        lineage: lineageOf(meta),
        provenance: provenanceOf(meta),
      });
    }
  };
  for (const root of CATALOG_ROOTS) {
    const dir = path.join(vaultRoot, root);
    if (fs.existsSync(dir)) walk(dir);
  }
  entries.sort((a, b) => a.id.localeCompare(b.id));
  // facet counts for filter UI
  const tiers = {}, types = {}, domains = {};
  for (const e of entries) {
    if (e.tier) tiers[e.tier] = (tiers[e.tier] || 0) + 1;
    if (e.type) types[e.type] = (types[e.type] || 0) + 1;
    if (e.domain) domains[e.domain] = (domains[e.domain] || 0) + 1;
  }
  return { count: entries.length, entries, facets: { tiers, types, domains } };
}

function inferTierFromDir(vaultRoot, filePath) {
  const rel = path.relative(vaultRoot, filePath).replace(/\\/g, '/');
  const seg = rel.split('/')[0];
  return ALL_TIERS.includes(seg) ? seg : '';
}

// Pure search/filter over a catalog (shared by server + offline build + verifier,
// so the offline embedded catalog behaves identically to the live endpoint).
function filterCatalog(catalog, { q, tier, type, domain } = {}) {
  const needle = String(q || '').trim().toLowerCase();
  return (catalog.entries || []).filter((e) => {
    if (tier && e.tier !== tier) return false;
    if (type && e.type !== type) return false;
    if (domain && e.domain !== domain) return false;
    if (needle) {
      const hay = (e.id + ' ' + e.title + ' ' + e.domain + ' ' + e.type).toLowerCase();
      if (!hay.includes(needle)) return false;
    }
    return true;
  });
}

module.exports = {
  nextTier, ALL_TIERS, SEED, stateDigest, buildSandbox, findEntry, graduate, readState,
  snapshotVault, restoreSnapshot, proposeMutation, applyMutation, rollbackMutation, listProposals,
  readVaultCatalog, filterCatalog, lineageOf, provenanceOf, extractRefs, parseFrontmatterBlock,
};
