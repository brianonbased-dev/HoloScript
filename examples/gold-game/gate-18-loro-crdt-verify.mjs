// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 18: TRUE Loro CRDT convergence (REPRODUCIBLE).
//
// Closes the gap Gate 17 honestly flagged. Gate 17 proved two-client agreement on a
// SHARED authoritative event order (in-process). This proves the strictly stronger
// CRDT property using the GENUINE `loro-crdt` library (already a dep of @holoscript/
// crdt-spatial + mcp-server): two replicas of the shared vault make CONCURRENT,
// independent edits (neither sees the other), then exchange updates and CONVERGE —
// commutatively (merge order doesn't matter) — with same-key conflicts resolved
// deterministically by Loro. No lost updates, no shared clock.
//
//   node_modules/.bin/tsx examples/gold-game/gate-18-loro-crdt-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-18-loro-crdt-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const require = createRequire(import.meta.url);
const { computeStateDigest } = await imp(join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));
const Loro = require('loro-crdt');
const LoroDoc = Loro.LoroDoc || Loro.Loro;
const receiptPath = join(here, 'GATE-18-LORO-CRDT-receipt.json');
const HASH = 'sha256';

// Fixed peer ids → deterministic conflict resolution (Loro LWW uses peer/lamport order).
function vaultDoc(peerId) {
  const d = new LoroDoc();
  if (d.setPeerId) d.setPeerId(peerId);
  return d;
}
const sortedJSON = (m) => JSON.stringify(Object.fromEntries(Object.entries(m).sort()));

// ── Shared base vault (both replicas start from the same history) ─────────────
const base = vaultDoc(1n);
const bv = base.getMap('vault');
bv.set('B.GRADUATE.001', 'bronze'); bv.set('W.001', 'bronze'); bv.set('W.002', 'silver'); bv.set('W.003', 'silver');
base.commit();
const baseSnap = base.export({ mode: 'snapshot' });

// Replica A and B both import the shared base, then edit CONCURRENTLY (no exchange yet).
const A = vaultDoc(10n); A.import(baseSnap);
const B = vaultDoc(20n); B.import(baseSnap);

// concurrent, independent edits on DIFFERENT entries (the no-lost-update case)
A.getMap('vault').set('W.001', 'gold'); A.commit();    // curator A graduates W.001
B.getMap('vault').set('W.002', 'gold'); B.commit();    // curator B graduates W.002 — concurrently
// concurrent edit on the SAME entry (the conflict case): both graduate W.003 to different tiers
A.getMap('vault').set('W.003', 'gold'); A.commit();
B.getMap('vault').set('W.003', 'platinum'); B.commit();

const updA = A.export({ mode: 'update' });
const updB = B.export({ mode: 'update' });

// ── Exchange updates → both converge ──────────────────────────────────────────
A.import(updB); B.import(updA);
const stateA = A.getMap('vault').toJSON();
const stateB = B.getMap('vault').toJSON();

// ── Commutativity: merge order must not matter ────────────────────────────────
const C = vaultDoc(30n); C.import(baseSnap); C.import(updA); C.import(updB); // A then B
const D = vaultDoc(40n); D.import(baseSnap); D.import(updB); D.import(updA); // B then A
const stateC = C.getMap('vault').toJSON();
const stateD = D.getMap('vault').toJSON();

const converged = sortedJSON(stateA) === sortedJSON(stateB);
const bothConcurrentEditsKept = stateA['W.001'] === 'gold' && stateA['W.002'] === 'gold'; // no lost update
const conflictResolvedSame = stateA['W.003'] === stateB['W.003'];                          // both agree on the winner
const conflictWinner = stateA['W.003'];
const commutative = sortedJSON(stateC) === sortedJSON(stateD) && sortedJSON(stateC) === sortedJSON(stateA);

// ── Deterministic digest of the CONVERGED state (not the bytes/timestamps) ────
const tierCode = (t) => ({ bronze: 1, silver: 2, gold: 3, platinum: 4, diamond: 5 }[t] || 0);
const idI = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 131 + s.charCodeAt(i)) % 2147483647; return h; };
const convergedSolver = { fieldNames: ['v'], getField: () => Float32Array.from(Object.entries(stateA).sort().flatMap(([k, v]) => [idI(k), tierCode(v)])) };
const convergedDigest = computeStateDigest(convergedSolver, HASH);

// reproduce the whole experiment fresh → identical converged state
function rerun() {
  const b = vaultDoc(1n); const m = b.getMap('vault'); m.set('B.GRADUATE.001', 'bronze'); m.set('W.001', 'bronze'); m.set('W.002', 'silver'); m.set('W.003', 'silver'); b.commit();
  const s = b.export({ mode: 'snapshot' });
  const a = vaultDoc(10n); a.import(s); const bb = vaultDoc(20n); bb.import(s);
  a.getMap('vault').set('W.001', 'gold'); a.commit(); bb.getMap('vault').set('W.002', 'gold'); bb.commit();
  a.getMap('vault').set('W.003', 'gold'); a.commit(); bb.getMap('vault').set('W.003', 'platinum'); bb.commit();
  a.import(bb.export({ mode: 'update' })); bb.import(a.export({ mode: 'update' }));
  return sortedJSON(a.getMap('vault').toJSON());
}
const deterministic = rerun() === sortedJSON(stateA);

const receipt = {
  gate: 18,
  track: 'flagship',
  name: 'true Loro CRDT convergence — concurrent vault edits merge commutatively (real loro-crdt)',
  verifier: 'examples/gold-game/gate-18-loro-crdt-verify.mjs',
  library: 'loro-crdt (LoroDoc) — GENUINE, already a dep of @holoscript/crdt-spatial + mcp-server',
  experiment: { base: { 'B.GRADUATE.001': 'bronze', 'W.001': 'bronze', 'W.002': 'silver', 'W.003': 'silver' }, concurrent: { A: { 'W.001': 'gold', 'W.003': 'gold' }, B: { 'W.002': 'gold', 'W.003': 'platinum' } } },
  result: { convergedState: stateA, converged, bothConcurrentEditsKept, conflictResolvedSame, conflictWinner, commutative, deterministic },
  contract: { spine: 'REAL computeStateDigest', convergedDigest, reproducible: 'run the verifier to re-derive' },
  honestScope: 'Uses the GENUINE loro-crdt library to prove TRUE CRDT convergence on the GOLD game\'s shared vault state: two replicas make concurrent independent edits with NO shared clock/order, exchange Loro updates, and converge — commutatively, with same-key conflicts resolved deterministically by Loro (fixed peer ids). This is strictly stronger than Gate 17 (which used a shared authoritative event order in-process). PROVEN: real Loro convergence for the game\'s vault state. NOT done here: replacing the @holoscript/mesh CRDTProtocolHandler\'s "Loro-inspired diffs" with this real Loro binding across the whole mesh package (a broader mesh refactor), and live network transport (this is in-process update exchange, not a socket). The CRDT convergence capability the game needed is now real.',
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-18 RECEIPT EMITTED ->', receiptPath);
  console.log('  convergedState:', JSON.stringify(stateA));
  console.log('  converged=' + converged, 'bothEditsKept=' + bothConcurrentEditsKept, 'conflictSame=' + conflictResolvedSame + ' (winner=' + conflictWinner + ')');
  console.log('  commutative=' + commutative, 'deterministic=' + deterministic);
  console.log('  convergedDigest=' + convergedDigest);
} else {
  let existing; try { existing = JSON.parse(readFileSync(receiptPath, 'utf8')); } catch { console.error('No Gate-18 receipt. Run --emit first.'); process.exit(2); }
  const checks = [
    ['genuine loro-crdt LoroDoc loaded', typeof LoroDoc === 'function'],
    ['two replicas CONVERGE to identical state after concurrent edits', converged === true],
    ['no lost update — BOTH concurrent edits kept (W.001=gold AND W.002=gold)', bothConcurrentEditsKept === true],
    ['same-entry conflict resolves to the SAME winner on both replicas', conflictResolvedSame === true],
    ['merge is COMMUTATIVE (A-then-B == B-then-A == bidirectional)', commutative === true],
    ['convergence is deterministic across a fresh re-run', deterministic === true],
    ['converged-state digest reproduces (real computeStateDigest)', convergedDigest === existing.contract.convergedDigest],
  ];
  let ok = true;
  console.log('GATE-18 (TRUE LORO CRDT CONVERGENCE) VERIFICATION:');
  for (const [label, pass] of checks) { console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label); ok = ok && pass; }
  console.log('  => GATE 18', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
