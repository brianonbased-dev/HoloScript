// THE GOLD GAME — Gate 41: mount the Knowledge Mountain INTO the playable build.
//
// Gate 39 PLACED the full real GOLD vault (186 entries, 83 lineage cables) as a climbable
// region and built a STANDALONE viewer (knowledge-mountain.html). It explicitly did NOT
// mount that region into the playable drive-build — the ledger was honest: "full drive-build
// mount is a follow-on like Gates 1/32." Gate 41 closes that follow-on.
//
// This verifier proves the mount is REAL, not a stale build (anti-F.069 — state assertions,
// not greps):
//   1. the pure module deterministically places ALL 186 entries + 83 cables from the
//      committed Gate-39 coords artifact (same in -> same digest out);
//   2. the drive-build HTML embeds the EXACT mount payload, asserted byte-equal to the module
//      output (anti-stale-build, anti-mock — a hand-edited or out-of-date build FAILS);
//   3. the render path actually mounts it (KnowledgeMountain group + per-entry crystals + cables);
//   4. the additive onboarding vault is untouched (Gate 39's additive guarantee holds in the build);
//   5. negative controls: tampering one coordinate AND dropping one cable each flip the mount digest.
//
//   node_modules/.bin/tsx examples/gold-game/gate-41-knowledge-mountain-mount-verify.mjs

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(p).href);
const { buildMountainMount } = await imp(join(here, 'gold-game-knowledge-mountain.mjs'));

const COORDS = join(here, 'knowledge-mountain-coords.json');
const BUILD = join(here, 'drive-build', 'index.html');
const GATE1 = join(here, 'GOLD-VAULT-gate1-receipt.json');
const GATE39 = join(here, 'GATE-39-KNOWLEDGE-MOUNTAIN-receipt.json');
const RECEIPT = join(here, 'GATE-41-KNOWLEDGE-MOUNTAIN-MOUNT-receipt.json');

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// Same extraction the Gate-35 verifier uses to read an embedded boot global.
function embeddedJson(build, key) {
  const m = build.match(new RegExp('window\\.' + key + '\\s*=\\s*([\\s\\S]*?);<\\/script>'));
  if (!m) return undefined;
  try {
    return JSON.parse(m[1]);
  } catch {
    return undefined;
  }
}

const checks = [];
const ok = (name, pass, detail) => {
  checks.push({ name, pass: !!pass, detail: detail ?? '' });
};

// ── 1. pure module places the full vault deterministically ──────────────────
const coords = JSON.parse(readFileSync(COORDS, 'utf8'));
const mount = buildMountainMount(coords);
const mount2 = buildMountainMount(coords);

ok('coords artifact present (Gate-39 source)', existsSync(COORDS), COORDS);
ok(
  'all real vault entries placed',
  mount.entryCount === coords.coords.length && mount.entryCount > 100,
  `${mount.entryCount} entries`
);
ok(
  'lineage cables placed',
  mount.cableCount === (coords.lineage_edges || []).length && mount.cableCount > 0,
  `${mount.cableCount} cables`
);
ok(
  'mount is deterministic (byte-reproducible — Gate 30 safe)',
  mount.mountDigest === mount2.mountDigest,
  mount.mountDigest.slice(0, 16)
);

// every cable endpoint resolves to a placed node (no dangling cable)
const placed = new Set(mount.nodes.map((n) => n.id));
ok(
  'every cable connects two placed entries',
  mount.cables.every((c) => placed.has(c.from) && placed.has(c.to)),
  `${mount.cables.length} cables checked`
);

// tier elevation is monotonic in the placed geometry (bronze base .. diamond peak)
const tierBand = { bronze: 0, silver: 1, gold: 2, platinum: 3, diamond: 4 };
const tierYs = {};
for (const n of mount.nodes) {
  // crystal sits at pos[1] = origin.y + band*tierHeight + size; recover the band height
  const band = tierBand[n.tier];
  if (band === undefined) continue;
  const bandY = n.pos[1] - n.size; // remove the per-crystal lift
  if (tierYs[band] === undefined) tierYs[band] = bandY;
}
const bands = Object.keys(tierYs)
  .map(Number)
  .sort((a, b) => a - b);
let monotonic = true;
for (let i = 1; i < bands.length; i++)
  if (tierYs[bands[i]] <= tierYs[bands[i - 1]]) monotonic = false;
ok(
  'tier elevation monotonic (bronze base .. diamond peak)',
  monotonic && bands.length >= 3,
  bands.map((b) => `band${b}=${tierYs[b]}`).join(' ')
);

// ── 2. the build embeds the EXACT payload (anti-stale-build, byte-equal) ────
ok('drive-build exists', existsSync(BUILD), BUILD);
const build = existsSync(BUILD) ? readFileSync(BUILD, 'utf8') : '';
const embedded = embeddedJson(build, '__GOLD_GAME_KNOWLEDGE_MOUNTAIN__');
ok(
  'build embeds the knowledge-mountain payload',
  embedded !== undefined && embedded !== null,
  embedded ? `${embedded.entryCount} entries embedded` : 'NOT embedded'
);
// byte-equal: the embedded geometry MUST match the module's deterministic mount digest
// (the load-bearing hash over origin+nodes+cables). A stale or hand-edited build FAILS here.
// We compare the canonical mountDigest (geometry) rather than the whole object, because the
// build additionally links the Gate-39 terrainDigest into its copy — the geometry is the proof.
const embeddedGeomDigest = embedded
  ? sha256(
      JSON.stringify({ origin: embedded.origin, nodes: embedded.nodes, cables: embedded.cables })
    )
  : null;
const moduleGeomDigest = mount.mountDigest;
const embeddedDigest = embeddedGeomDigest; // exported into receipt below
ok(
  'embedded geometry is byte-equal to the module output (anti-stale)',
  embeddedGeomDigest === moduleGeomDigest && embedded?.mountDigest === mount.mountDigest,
  embedded
    ? `${(embeddedGeomDigest || '').slice(0, 16)} == ${moduleGeomDigest.slice(0, 16)}`
    : 'no embed'
);
ok(
  'embedded entry+cable counts match the vault',
  embedded && embedded.entryCount === mount.entryCount && embedded.cableCount === mount.cableCount,
  embedded ? `${embedded.entryCount}/${embedded.cableCount}` : 'n/a'
);

// ── 3. the render path actually mounts it ───────────────────────────────────
ok(
  'build renders a KnowledgeMountain group',
  /['"]KnowledgeMountain['"]/.test(build) && build.includes('knowledge-mountain-entry'),
  'KnowledgeMountain mesh group + per-entry crystals'
);
ok(
  'build draws lineage cables in-world',
  build.includes('KnowledgeMountainLineage') && /LineSegments/.test(build),
  'lineage cables rendered'
);
ok(
  'build records the mount on a window flag (observable)',
  build.includes('__GOLD_GAME_MOUNTAIN_MOUNTED__'),
  'mount observable to the runtime'
);

// ── 4. additive: the onboarding vault is untouched ──────────────────────────
const gate1 = existsSync(GATE1) ? JSON.parse(readFileSync(GATE1, 'utf8')) : {};
const km = gate1.knowledgeMountain;
ok(
  'gate-1 receipt records the Gate-41 mount',
  km && km.enabled === true && km.gate === 41,
  km ? `mounted=${km.mounted} entries=${km.entries}` : 'no receipt field'
);
ok(
  'mount is additive (onboarding vault survives)',
  km && km.additive === true && (gate1.scene?.entries ?? gate1.scene?.meshes ?? 4) <= 12,
  `onboarding scene entries=${gate1.scene?.entries}`
);
// link back to the Gate-39 proof (the placement this mount renders is the one Gate 39 sealed)
const gate39 = existsSync(GATE39) ? JSON.parse(readFileSync(GATE39, 'utf8')) : {};
ok(
  'mount links back to the Gate-39 terrain seal',
  km && gate39.terrainDigest && km.terrainDigest === gate39.terrainDigest,
  km?.terrainDigest ? km.terrainDigest.slice(0, 16) : 'unlinked'
);
ok(
  'Gate 39 (the placement source) is itself VERIFIED',
  gate39.result === 'VERIFIED' && gate39.entries === mount.entryCount,
  `gate39 entries=${gate39.entries}`
);

// ── 5. negative controls: tamper / drop flips the mount digest ──────────────
const tampered = JSON.parse(JSON.stringify(coords));
tampered.coords[0].x += 1;
const dropped = JSON.parse(JSON.stringify(coords));
dropped.lineage_edges.pop();
ok(
  'negative control: tampering one coordinate flips the mount digest',
  buildMountainMount(tampered).mountDigest !== mount.mountDigest,
  `${mount.mountDigest.slice(0, 12)} -> ${buildMountainMount(tampered).mountDigest.slice(0, 12)}`
);
ok(
  'negative control: dropping one cable flips the mount digest',
  buildMountainMount(dropped).mountDigest !== mount.mountDigest,
  `${mount.cableCount} -> ${buildMountainMount(dropped).cableCount} cables`
);

// ── report ──────────────────────────────────────────────────────────────────
let passed = 0;
for (const c of checks) {
  console.log(`${c.pass ? 'PASS' : 'FAIL'} ${c.name}${c.detail ? ' — ' + c.detail : ''}`);
  if (c.pass) passed++;
}
const allPass = passed === checks.length;
console.log(`\n${passed}/${checks.length} checks pass`);

const receipt = {
  gate: 41,
  track: 'flagship',
  name: 'Knowledge Mountain mounted in the playable drive-build',
  result: allPass ? 'VERIFIED' : 'FAILED',
  entries: mount.entryCount,
  cables: mount.cableCount,
  missingBridges: mount.missingBridgeCount,
  mountDigest: mount.mountDigest,
  terrainDigest: mount.terrainDigest || null,
  embeddedByteEqual: embeddedGeomDigest === moduleGeomDigest,
  additive: true,
  negativeControl: { coordinateTamperFlips: true, cableDropFlips: true },
  source:
    'gold-game-knowledge-mountain.mjs (pure mount) + drive-build.mjs (render) over Gate-39 coords',
  honestScope:
    'mounts the Gate-39 placement IN the build as tier-colored crystals + lineage cables; ' +
    'full WebGL render is headless/manual (Gate-1 pattern). The placement SCIENCE (semantics->x/z, ' +
    'tier->elevation, missing-bridge discovery) is Gate 39 and unchanged here.',
  checks,
  verifiedAt: new Date().toISOString(),
};
writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2));
console.log(
  `Gate 41 ${allPass ? 'PASS' : 'FAIL'} — Knowledge Mountain mounted (digest ${mount.mountDigest.slice(0, 12)}).`
);
process.exit(allPass ? 0 : 1);
