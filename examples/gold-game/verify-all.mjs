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
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
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
