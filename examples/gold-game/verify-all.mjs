// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — verify-all: the one-command gate runner (SSOT companion to GATES.md).
//
// Re-derives EVERY gate's status from committed state so no agent has to reconstruct
// it ad-hoc (the reconstruction-and-conflate failure that GATES.md + this runner fix).
// Each row is (track, gate, verifier). An "Oasis Gate-N PASS" is reported on the Oasis
// track ONLY — it never counts toward the flagship. Exits non-zero if any gate FAILs.
//
//   node examples/gold-game/verify-all.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(process.env.HOLOSCRIPT_REPO || process.env.HOLOSCRIPT_ROOT || join(here, '..', '..'));
const tsx = join(repoRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

// ── The ledger rows (must match GATES.md) ─────────────────────────────────────
// kind: 'script' (run a verifier, exit 0 = PASS) | 'parse' (parse a .holo clean)
//     | 'artifact' (a receipt-backed artifact must exist; full re-render is manual)
const GATES = [
  { track: 'flagship', gate: 0, name: 'parse clean',            kind: 'parse',    file: 'gold-vault-game.holo' },
  { track: 'flagship', gate: 1, name: 'R3F Drive render',       kind: 'artifact', file: 'drive-build/index.html', receipt: 'GOLD-VAULT-gate1-receipt.json', note: 'full render is headless/manual; artifact + receipt committed' },
  { track: 'flagship', gate: 2, name: 'curation graduate verb', kind: 'script',   runner: 'node', file: 'gate-2-graduate-verify.cjs' },
  { track: 'flagship', gate: 3, name: 'curation co-session',    kind: 'script',   runner: 'tsx',  file: 'gate-3-curation-verify.mjs' },
  { track: 'flagship', gate: 4, name: 'content/world evolution (causal + cross-session NPC memory)', kind: 'script', runner: 'tsx', file: 'gate-4-causal-memory-verify.mjs' },
  { track: 'flagship', gate: '5a', name: 'trained curation policy (beats hand-authored heuristic)', kind: 'script', runner: 'tsx', file: 'gate-5a-trained-policy-verify.mjs' },
  { track: 'flagship', gate: '5b', name: 'live human-operator session (Quest 3 immersive-vr capture)', kind: 'artifact', file: 'GATE-5BC-immersive-session.json', note: 'real device receipt; full session is hardware-in-the-loop' },
  { track: 'flagship', gate: '5c', name: 'Quest projection via /embodied (immersive-vr on device)', kind: 'artifact', file: 'GATE-5BC-immersive-session.json', note: 'real device receipt' },
  { track: 'flagship', gate: 6, name: 'interactive VR via REAL HoloGate (entry portal/menu + grab/say intent gating)', kind: 'script', runner: 'tsx', file: 'gate-6-hologate-verify.mjs' },
  { track: 'flagship', gate: 7, name: 'whole-stack conformance sweep (kitchen sink: 17/24 real compilers, 0 FAIL)', kind: 'script', runner: 'tsx', file: 'gate-7-conformance-verify.mjs' },
  { track: 'flagship', gate: 8, name: 'multi-agent mesh + economy (3 AI curators + human; real D.040 sovereign traits)', kind: 'script', runner: 'tsx', file: 'gate-8-mesh-economy-verify.mjs' },
  { track: 'flagship', gate: 9, name: 'Twin-Earth identity/permission/safety (per-entrant governance over the mesh)', kind: 'script', runner: 'tsx', file: 'gate-9-twin-earth-verify.mjs' },
  { track: 'flagship', gate: 10, name: 'HoloGraph + HoloEmbed (real vault constellation as playable structure)', kind: 'script', runner: 'tsx', file: 'gate-10-holograph-verify.mjs' },
  { track: 'flagship', gate: 11, name: 'quantum-inspired curation (real QuantumInspiredTrait, CPU-inspired fallback)', kind: 'script', runner: 'tsx', file: 'gate-11-quantum-verify.mjs' },
  { track: 'flagship', gate: 12, name: 'multi-physics solver (real StructuralSolver TET4 FEM over the vault keystone)', kind: 'script', runner: 'tsx', file: 'gate-12-solvers-verify.mjs' },
  { track: 'flagship', gate: 13, name: 'hologram (real QuiltCompiler 48-view multiview quilt of the vault world)', kind: 'script', runner: 'tsx', file: 'gate-13-hologram-verify.mjs' },
  { track: 'flagship', gate: 14, name: 'The Archivist dialogue + quest arc (real DialogueTrait + ReputationLedger; reputation-driven verdict)', kind: 'script', runner: 'tsx', file: 'gate-14-archivist-dialogue-verify.mjs' },
  { track: 'flagship', gate: 15, name: 'interactive controls (keyboard play outside VR; shared 3D+2D scheme)', kind: 'script', runner: 'tsx', file: 'gate-15-controls-verify.mjs' },
  { track: 'flagship', gate: 16, name: 'audio layer (real GodotCompiler: AudioStreamPlayer3D per spatial source + acoustic traits)', kind: 'script', runner: 'tsx', file: 'gate-16-audio-verify.mjs' },
  { track: 'flagship', gate: 17, name: 'NETCODE co-presence (two-participant agreement on shared vault state; real @holoscript/mesh EntityAuthority + ReplicationManager)', kind: 'script', runner: 'tsx', file: 'gate-17-netcode-verify.mjs' },
  { track: 'flagship', gate: 18, name: 'true Loro CRDT convergence (real loro-crdt; concurrent vault edits merge commutatively)', kind: 'script', runner: 'tsx', file: 'gate-18-loro-crdt-verify.mjs' },
  { track: 'flagship', gate: 19, name: 'The Played Slice (One Climb) — coherent played loop; observable T0-T6 trace (reuses Gates 2/8/14)', kind: 'script', runner: 'tsx', file: 'gate-19-played-slice-verify.mjs' },
  { track: 'flagship', gate: 20, name: 'economy balance — stake-on-submit (real economy handler; spam unprofitable, credits bounded, reputation gates)', kind: 'script', runner: 'tsx', file: 'gate-20-economy-balance-verify.mjs' },
  { track: 'flagship', gate: 21, name: 'population economy sweep — inflation curve flattens, time-to-Diamond bounded+decoupled', kind: 'script', runner: 'tsx', file: 'gate-21-economy-sweep-verify.mjs' },
  { track: 'flagship', gate: 22, name: 'desktop first-person control — pointer-lock movement + mouse look + HoloGate graduate', kind: 'script', runner: 'tsx', file: 'gate-22-first-person-verify.mjs' },
  { track: 'flagship', gate: 23, name: 'full GOLD data inspection — live /api/vault-entry + embedded offline markdown body', kind: 'script', runner: 'tsx', file: 'gate-23-full-data-verify.mjs' },
  { track: 'flagship', gate: 24, name: 'start-of-game onboarding — art vista, first objective, retry path, and first-person entry', kind: 'script', runner: 'tsx', file: 'gate-24-start-onboarding-verify.mjs' },
  { track: 'flagship', gate: 25, name: 'continuous campaign — save/resume, quest log, and post-win continuation beyond One Climb', kind: 'script', runner: 'node', file: 'gate-25-campaign-verify.mjs' },
  { track: 'flagship', gate: 26, name: 'MMO answer gate — shard lobby + named entrants + durable presence + host migration + authority handoff + persistent world (classified: shared-world co-op, NOT MMO)', kind: 'script', runner: 'tsx', file: 'gate-26-mmo-answer-verify.mjs' },
  { track: 'flagship', gate: 27, name: 'live-vault safe mutation flow — AI proposes, founder-gated apply, reversible rollback to exact pre-state (real computeStateDigest); D:/GOLD never written silently', kind: 'script', runner: 'tsx', file: 'gate-27-safe-mutation-verify.mjs' },
  { track: 'flagship', gate: 28, name: 'full-vault browser — search/filter/open every GOLD entry, lineage links, raw markdown, and receipt history', kind: 'script', runner: 'node', file: 'gate-28-fullvault-verify.mjs' },
  { track: 'flagship', gate: 29, name: 'agent party AI — visible companions choose entries, explain choices, spend budget, and remember the player across sessions', kind: 'script', runner: 'tsx', file: 'gate-29-party-verify.mjs' },
  { track: 'flagship', gate: 30, name: 'ship packaging — one command regenerates 3D/2D/server/docs, copies the exact build, deployed bytes provably == source (reproducible packageDigest)', kind: 'script', runner: 'node', file: 'gate-30-package-verify.mjs' },
  { track: 'flagship', gate: 31, name: 'playable HoloGraph — knowledge lineage constellation becomes navigation, not only a verifier', kind: 'script', runner: 'node', file: 'gate-31-playable-holograph-verify.mjs' },
  { track: 'flagship', gate: 32, name: 'HoloGram image-to-world — founder art becomes a depth-backed 3D GOLD world source (real DepthEstimationService + Sobel normals)', kind: 'script', runner: 'tsx', file: 'gate-32-hologram-image-to-world-verify.mjs' },
  { track: 'flagship', gate: 33, name: 'HoloMap scanned-space import — video/device capture becomes anchored GOLD space', kind: 'script', runner: 'tsx', file: 'gate-33-holomap-scan-verify.mjs' },
  { track: 'flagship', gate: 34, name: 'playable depth-real vista + proof-as-play seal — the Gate-32 world renders as a depth-displaced surface IN the build (byte-equal to source) + graduation seals visibly; export leg is Gate 38', kind: 'script', runner: 'tsx', file: 'gate-34-playable-vista-verify.mjs' },
  { track: 'flagship', gate: 35, name: 'HoloScript kitchen-sink pass — HoloGraph + HoloGram + HoloMap join the same playable loop', kind: 'script', runner: 'tsx', file: 'gate-35-kitchen-sink-verify.mjs' },
  { track: 'flagship', gate: 36, name: 'HoloScript package toolset — packages become visible GOLD game systems', kind: 'script', runner: 'node', file: 'gate-36-holoscript-toolset-verify.mjs' },
  { track: 'flagship', gate: 37, name: 'self-proving boot — air-gapped build re-derives its embedded data hashes OFFLINE in-browser (pure-JS SHA-256, file://) vs a sealed manifest; embedded fn cross-checked as genuine SHA-256; negative control holds', kind: 'script', runner: 'node', file: 'gate-37-self-proof-verify.mjs' },
  { track: 'flagship', gate: 38, name: 'holographic export leg — Gate-32/Gate-34 vista exports to quilt/MV-HEVC/parallax target manifests', kind: 'script', runner: 'tsx', file: 'gate-38-holographic-export-verify.mjs' },
  { track: 'oasis (fixture)', gate: 3, name: 'connection-mechanics proof (compass co-session)', kind: 'script', runner: 'tsx', file: 'connection-mechanics-proof/gate-3-verify.mjs' },
  { track: 'modalities', gate: '2D+3D', name: 'one .holo -> retro 2D + 3D (shared source scene)', kind: 'script', runner: 'tsx', file: 'modality-verify.mjs' },
];

async function parseHoloClean(rel) {
  const core = await import(pathToFileURL(join(repoRoot, 'packages', 'core', 'dist', 'index.js')).href);
  const src = readFileSync(join(here, rel), 'utf8');
  const parsed = core.parseHolo(src);
  return (parsed.errors || []).length === 0;
}

function runScript(runner, rel) {
  try {
    if (runner === 'tsx') {
      // tsx is a .cmd shim on Windows — go through a shell so the shim is honored.
      execSync(`"${tsx}" "${join(here, rel)}"`, { stdio: 'ignore', cwd: repoRoot });
    } else {
      execFileSync(process.execPath, [join(here, rel)], { stdio: 'ignore', cwd: repoRoot });
    }
    return true;
  } catch {
    return false;
  }
}

let anyFail = false;
const rows = [];
for (const g of GATES) {
  let status;
  if (g.kind === 'open') status = 'OPEN';
  else if (g.kind === 'parse') status = (await parseHoloClean(g.file)) ? 'PASS' : 'FAIL';
  else if (g.kind === 'artifact') status = existsSync(join(here, g.file)) ? 'PASS*' : 'FAIL';
  else if (g.kind === 'script') status = runScript(g.runner, g.file) ? 'PASS' : 'FAIL';
  if (status === 'FAIL') anyFail = true;
  rows.push({ ...g, status });
}

const pad = (s, n) => String(s).padEnd(n);
console.log('\nTHE GOLD GAME — gate ledger (re-derived live)\n');
console.log(pad('TRACK', 18) + pad('GATE', 8) + pad('STATUS', 8) + 'NAME');
console.log('-'.repeat(78));
for (const r of rows) {
  console.log(pad(r.track, 18) + pad(typeof r.gate === 'number' ? 'G' + r.gate : r.gate, 8) + pad(r.status, 8) + r.name + (r.note ? '  (' + r.note + ')' : ''));
}
console.log('\n* = artifact/receipt-backed (full re-render is manual). OPEN = not yet built.');
console.log(anyFail ? '\n=> SOME GATES FAILED' : '\n=> all runnable gates PASS');
process.exit(anyFail ? 1 : 0);
