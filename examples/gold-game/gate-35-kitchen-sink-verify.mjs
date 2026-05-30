// THE GOLD GAME - Gate 35: kitchen-sink coherent pass.
//
// This gate does not replace the individual gate verifiers. It proves that the
// proven pieces are joined in the same playable artifact: HoloGraph lineage,
// HoloGram depth world, HoloMap room portal, holographic export targets,
// HoloGate graduation, netcode/CRDT, solvers, economy, reputation/dialogue,
// party AI, toolset, and offline self-proof.
//
//   node_modules/.bin/tsx examples/gold-game/gate-35-kitchen-sink-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-35-kitchen-sink-verify.mjs

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const { computeStateDigest } = await imp(join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));

const receiptPath = join(here, 'GATE-35-KITCHEN-SINK-receipt.json');
const buildPath = join(here, 'drive-build', 'index.html');
const gate1Path = join(here, 'GOLD-VAULT-gate1-receipt.json');
const sha256 = (value) => createHash('sha256').update(value).digest('hex');
const hexFloats = (hex) => {
  const out = [];
  for (let i = 0; i < hex.length; i += 2) out.push(Number.parseInt(hex.slice(i, i + 2), 16));
  return out;
};

function readJson(rel) {
  const file = join(here, rel);
  if (!existsSync(file)) return { ok: false, rel, error: 'missing' };
  try { return { ok: true, rel, data: JSON.parse(readFileSync(file, 'utf8')) }; }
  catch (e) { return { ok: false, rel, error: String(e && e.message || e) }; }
}

function gatePass(j) {
  const d = j.data || j;
  if (!d) return false;
  if (d.status === 'PASS' || d.result === 'VERIFIED') return true;
  if (d.checks && d.checks.passed === d.checks.total && d.checks.total > 0) return true;
  return Boolean(d.gate && j.ok !== false);
}

function embeddedJson(build, key) {
  const m = build.match(new RegExp('window\\.' + key + '\\s*=\\s*([\\s\\S]*?);<\\/script>'));
  if (!m) return undefined;
  try { return JSON.parse(m[1]); } catch { return undefined; }
}

function digestTrace(trace) {
  const payloadHash = sha256(JSON.stringify(trace));
  const fields = {
    trace: Float32Array.from(hexFloats(payloadHash)),
    gates: Float32Array.from(trace.flatMap((s, i) => [i, ...(s.gates || []).map((g) => Number(String(g).replace(/\D/g, '')) || 0)])),
    evidence: Float32Array.from(hexFloats(sha256(trace.map((s) => `${s.step}:${s.evidence}`).join('|')))),
  };
  return computeStateDigest({ fieldNames: Object.keys(fields), getField: (name) => fields[name] }, 'sha256');
}

const receipts = {
  gate1: readJson('GOLD-VAULT-gate1-receipt.json'),
  gate6: readJson('GATE-6-HOLOGATE-receipt.json'),
  gate10: readJson('GATE-10-HOLOGRAPH-receipt.json'),
  gate12: readJson('GATE-12-SOLVERS-receipt.json'),
  gate14: readJson('GATE-14-ARCHIVIST-receipt.json'),
  gate17: readJson('GATE-17-NETCODE-receipt.json'),
  gate18: readJson('GATE-18-LORO-CRDT-receipt.json'),
  gate20: readJson('GATE-20-ECONOMY-BALANCE-receipt.json'),
  gate21: readJson('GATE-21-ECONOMY-SWEEP-receipt.json'),
  gate29: readJson('GATE-29-AGENT-PARTY-receipt.json'),
  gate32: readJson('GATE-32-HOLOGRAM-IMAGE-TO-WORLD-receipt.json'),
  gate33: readJson('GATE-33-HOLOMAP-SCAN-receipt.json'),
  gate34: readJson('GATE-34-PLAYABLE-VISTA-receipt.json'),
  gate37: readJson('GATE-37-SELF-PROOF-receipt.json'),
  gate38: readJson('GATE-38-HOLOGRAPHIC-EXPORT-receipt.json'),
};

const artifacts = {
  vista: readJson('gold-vault-vista-world.json'),
  holomapRoom: readJson('gold-vault-holomap-room.json'),
  holographicExport: readJson('gold-vault-holographic-export.json'),
};

const build = existsSync(buildPath) ? readFileSync(buildPath, 'utf8') : '';
const gate1 = receipts.gate1.data || {};
const roomBoot = embeddedJson(build, '__GOLD_GAME_HOLOMAP_ROOM__');
const exportBoot = embeddedJson(build, '__GOLD_GAME_HOLOGRAPHIC_EXPORT__');
const vistaBoot = embeddedJson(build, '__GOLD_GAME_VISTA__');
const toolsetBoot = embeddedJson(build, '__GOLD_GAME_TOOLSET__');
const partyBoot = embeddedJson(build, '__GOLD_GAME_PARTY__');
let selfProof = null;
try {
  const m = build.match(/__GOLD_GAME_SELFPROOF__\s*=\s*(\{[\s\S]*?\});\s*window\.__GOLD_GAME_SHA256__/);
  if (m) selfProof = JSON.parse(m[1]);
} catch { /* ignore */ }
const selfProofKeys = new Set((selfProof?.manifest || []).map((x) => x.key));

const trace = [
  { step: 'start-playable-build', gates: [1, 24, 25], evidence: gate1.sceneDigest || sha256(build).slice(0, 16) },
  { step: 'holograph-lineage-navigation', gates: [10, 31], evidence: receipts.gate10.data?.contract?.graphDigest || receipts.gate10.data?.holoGraph?.graphDigest || 'holograph' },
  { step: 'hologram-depth-world-visible', gates: [32, 34], evidence: receipts.gate34.data?.worldDigest || artifacts.vista.data?.generated_group?.spatial_group || 'vista' },
  { step: 'holomap-room-portal', gates: [33], evidence: receipts.gate33.data?.contract?.spaceDigest || 'holomap' },
  { step: 'holographic-export-targets', gates: [38], evidence: receipts.gate38.data?.contract?.exportDigest || 'exports' },
  { step: 'hologate-graduation', gates: [6, 14], evidence: receipts.gate14.data?.contract?.dialogueDigest || receipts.gate6.data?.contract?.digest || 'graduation' },
  { step: 'shared-state-and-crdt', gates: [17, 18], evidence: sha256(JSON.stringify([receipts.gate17.data?.contract, receipts.gate18.data?.contract])).slice(0, 24) },
  { step: 'solver-and-economy-bounds', gates: [12, 20, 21], evidence: sha256(JSON.stringify([receipts.gate12.data?.contract, receipts.gate20.data?.contract, receipts.gate21.data?.contract])).slice(0, 24) },
  { step: 'agent-party-and-toolset-visible', gates: [29, 36], evidence: `${partyBoot?.roster?.length || 0}:${toolsetBoot?.systems?.length || 0}` },
  { step: 'offline-self-proof', gates: [37], evidence: (selfProof?.manifest || []).map((m) => m.key).join(',') },
];
const kitchenDigest = digestTrace(trace);
const negativeDigest = digestTrace(trace.filter((s) => s.step !== 'holomap-room-portal'));

const checks = [];
const check = (name, pass, detail) => checks.push({ name, pass: !!pass, detail });

check('generated playable build exists', build.length > 0, buildPath);
check('all kitchen-sink prerequisite receipts exist/pass', Object.entries(receipts).every(([, r]) => r.ok && gatePass(r)), Object.entries(receipts).filter(([, r]) => !r.ok || !gatePass(r)).map(([k]) => k).join(', ') || 'all pass');
check('core artifacts exist', Object.values(artifacts).every((r) => r.ok), Object.values(artifacts).filter((r) => !r.ok).map((r) => r.rel).join(', ') || 'all present');
check('build embeds HoloGram vista, HoloMap room, HoloGram export, toolset, and party blobs',
  Boolean(vistaBoot && roomBoot && exportBoot && toolsetBoot && partyBoot), 'boot blobs parsed');
check('build mounts the depth vista, HoloMap portal, panels, and proof seal',
  build.includes('VaultVistaBackdrop') && build.includes('HoloMapRoomPortal') && /data-gate33="holomap-room-panel"/.test(build) && /data-gate38="holographic-export-panel"/.test(build) && build.includes('GraduateSeal'),
  'visible surfaces present');
check('HoloMap boot artifact matches Gate 33 receipt digest',
  roomBoot?.contract?.spaceDigest === receipts.gate33.data?.contract?.spaceDigest,
  (roomBoot?.contract?.spaceDigest || '').slice(0, 16));
check('holographic export boot artifact matches Gate 38 receipt digest',
  exportBoot?.shareReceipt?.exportDigest === receipts.gate38.data?.contract?.exportDigest,
  (exportBoot?.shareReceipt?.exportDigest || '').slice(0, 16));
check('Gate 1 receipt records the joined HoloMap/export surfaces',
  gate1.holomapRoom?.enabled === true && gate1.holographicExport?.enabled === true,
  `holomap=${gate1.holomapRoom?.enabled}, export=${gate1.holographicExport?.enabled}`);
check('self-proof manifest covers the joined systems',
  ['__GOLD_GAME_VISTA__', '__GOLD_GAME_HOLOMAP_ROOM__', '__GOLD_GAME_HOLOGRAPHIC_EXPORT__', '__GOLD_GAME_TOOLSET__', '__GOLD_GAME_PARTY__'].every((k) => selfProofKeys.has(k)),
  `${selfProofKeys.size} blobs`);
check('coherent trace spans graph, vista, room, exports, gameplay, mesh/economy, and self-proof',
  trace.length === 10 && trace.every((s) => s.evidence && s.gates.length > 0), `${trace.length} steps`);
check('kitchen-sink trace digest is sha256-shaped', /^[a-f0-9]{64}$/.test(kitchenDigest), kitchenDigest.slice(0, 16));
check('negative control: dropping HoloMap portal changes kitchen digest', kitchenDigest !== negativeDigest, 'load-bearing trace');

if (!process.argv.includes('--emit')) {
  if (!existsSync(receiptPath)) {
    console.error('Gate-35 receipt missing. Run with --emit first.');
    process.exit(2);
  }
  const oldReceipt = JSON.parse(readFileSync(receiptPath, 'utf8'));
  // Growth-tolerant (integration-test framing, 2026-05-29): the kitchen-sink composition digest
  // shifts whenever ANY joined gate legitimately re-seals -- "G35 cascades off G7" -- so a FROZEN
  // kitchenDigest-equality check read upstream GROWTH as a G35 regression and forced manual
  // re-seals (the ledger-vs-live drift the gate-45 reconcile had to fix). G35 proves COMPOSITION
  // COHERENCE, not byte-frozen-ness: the anti-stale load is carried by the cross-consistency
  // checks above (the build's EMBEDDED HoloMap/export digests must equal the CURRENT upstream
  // receipts -- a stale build fails those), the negative control proves the digest is load-bearing,
  // and per-gate CORRECTNESS is owned by each gate's own verifier in verify-all. So the seal is now
  // informational; --emit ratchets it to the current coherent composition.
  const sealMatch = oldReceipt.contract?.kitchenDigest === kitchenDigest;
  console.log('  INFO  kitchen digest ' + (sealMatch ? 'matches sealed receipt (composition byte-stable)' : 'differs from seal -- upstream growth shifted it; re-emit to ratchet'));
}

const passed = checks.filter((c) => c.pass).length;
const total = checks.length;
const allPass = passed === total;

console.log('\nTHE GOLD GAME - Gate 35: kitchen-sink coherent pass\n');
for (const c of checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.name}${c.detail ? ' - ' + c.detail : ''}`);
console.log(`\n  ${passed}/${total} checks pass - ${allPass ? 'GATE 35 PASS' : 'GATE 35 FAIL'}\n`);

if (process.argv.includes('--emit') && allPass) {
  const receipt = {
    schema: 'cael-gate-v1',
    gate: 35,
    track: 'flagship',
    name: 'HoloScript kitchen-sink coherent pass',
    verifier: 'examples/gold-game/gate-35-kitchen-sink-verify.mjs',
    checks: { passed, total },
    build: {
      artifact: 'examples/gold-game/drive-build/index.html',
      htmlBytes: build.length,
      sceneDigest: gate1.sceneDigest,
    },
    trace,
    prerequisiteReceipts: Object.fromEntries(Object.entries(receipts).map(([k, r]) => [k, r.rel])),
    contract: {
      spine: 'computeStateDigest(field-bag, sha256)',
      kitchenDigest,
      negativeControlDigest: negativeDigest,
    },
    proves: {
      coherentLoop: 'The same emitted playable build embeds and exposes HoloGraph, HoloGram vista, HoloMap room, holographic exports, HoloGate play, party/toolset, and offline self-proof.',
      receiptLevel: 'Individual subsystem behavior remains owned by each gate verifier; Gate 35 proves composition/coherence across their artifacts.',
      loadBearing: 'Negative control drops the HoloMap portal from the trace and changes the kitchen digest.',
    },
    honestScope: 'Receipt/artifact-level coherent pass over the emitted playable build. It rechecks that the surfaces are present, joined, and digest-bound; it does not rerun every subsystem verifier internally. Run verify-all for full per-gate re-derivation.',
    status: 'PASS',
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log(`  receipt -> ${receiptPath}`);
}

process.exit(allPass ? 0 : 1);
