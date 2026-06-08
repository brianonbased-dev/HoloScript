// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 27: live-vault SAFE MUTATION FLOW (REPRODUCIBLE).
//
// Every other gate reads or simulates over the vault. This gate proves the game
// can *write back* to a vault SAFELY: an AI curator PROPOSES a mutation, the
// vault is UNTOUCHED until a FOUNDER approval token applies it, and any apply is
// REVERSIBLE to the exact pre-state. D:/GOLD is never written silently — all
// writes go to a throwaway sandbox; promotion to real GOLD stays a separate
// founder gate (this gate never touches D:/GOLD).
//
// Anti-F.069: asserts STATE DELTAS, not greps. An unapproved proposal must
// produce ZERO vault change (digest identical); an approved apply must change
// the digest; rollback must restore the EXACT pre-apply digest — and the digest
// equality is checked with the REAL computeStateDigest from the engine.
//
//   node_modules/.bin/tsx examples/gold-game/gate-27-safe-mutation-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-27-safe-mutation-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const require = createRequire(import.meta.url);
const V = require('./vault-ops.cjs');
const { computeStateDigest } = await imp(
  join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')
);
const HASH = 'sha256';
const receiptPath = join(here, 'GATE-27-SAFE-MUTATION-receipt.json');

// Independent re-digest of the sandbox tier-state via the REAL engine hasher.
// (vault-ops has its own sha256 over rows; here we cross-check with the engine's
// computeStateDigest so the gate's proof rides the real simulation spine.)
function engineDigest(dir) {
  const st = V.readState(dir);
  const rows = [];
  for (const tier of V.ALL_TIERS)
    for (const id of (st.tiers[tier] || []).sort()) rows.push(`${id}:${tier}`);
  rows.sort();
  const codes = rows
    .join('|')
    .split('')
    .map((c) => c.charCodeAt(0));
  return computeStateDigest(
    { fieldNames: ['vault'], getField: () => Float32Array.from(codes) },
    HASH
  );
}

const dir = join(here, 'vault-sandbox-g27');
let pass = 0,
  fail = 0;
const ok = (c, m) => {
  c ? pass++ : fail++;
  console.log((c ? '  PASS ' : '  FAIL ') + m);
};

console.log('GATE 27 — live-vault safe mutation flow (sandbox vault):\n');

// ── 1. PROPOSE does NOT mutate the vault (state delta = ZERO) ────────────────
V.buildSandbox(dir);
const d0 = V.stateDigest(dir);
const e0 = engineDigest(dir);
const prop = V.proposeMutation(dir, {
  verb: 'graduate',
  id: 'W.GOLD.534',
  by: 'ai-curator-claude',
});
ok(prop.ok, 'proposeMutation() accepts a valid graduate proposal');
ok(
  prop.vaultWrite === 'NONE — proposal queued, vault untouched',
  'proposal declares NO vault write'
);
ok(V.stateDigest(dir) === d0, 'STATE DELTA = 0 after propose (vault-ops digest unchanged)');
ok(engineDigest(dir) === e0, 'STATE DELTA = 0 after propose (REAL engine digest unchanged)');
ok(
  prop.proposal.status === 'PENDING_FOUNDER_APPROVAL',
  'proposal is queued PENDING_FOUNDER_APPROVAL'
);
ok(V.listProposals(dir).length === 1, 'proposal is in the queue');

// ── 2. APPLY without the founder token is REFUSED (still ZERO delta) ─────────
const refused = V.applyMutation(dir, prop.proposal.proposalId, 'WRONG-TOKEN', 'attacker');
ok(!refused.ok && /REFUSED/.test(refused.error), 'applyMutation REFUSES an invalid founder token');
ok(refused.vaultWrite === 'NONE', 'refused apply declares NO vault write');
ok(V.stateDigest(dir) === d0, 'STATE DELTA still 0 after refused apply (founder gate held)');
ok(engineDigest(dir) === e0, 'STATE DELTA still 0 after refused apply (REAL engine digest held)');

// ── 3. APPLY with the founder token mutates (state delta != 0) ───────────────
const applied = V.applyMutation(
  dir,
  prop.proposal.proposalId,
  prop.approvalToken,
  'founder-joseph'
);
ok(applied.ok, 'applyMutation APPLIES with the matching founder approval token');
const dApplied = V.stateDigest(dir);
const eApplied = engineDigest(dir);
ok(dApplied !== d0, 'STATE DELTA != 0 after approved apply (vault-ops digest changed)');
ok(eApplied !== e0, 'STATE DELTA != 0 after approved apply (REAL engine digest changed)');
ok(
  V.readState(dir).tiers.platinum.includes('W.GOLD.534'),
  'W.GOLD.534 actually moved gold -> platinum on disk'
);
ok(
  applied.receipt.schema === 'cael-vault-mutation-v1' && !!applied.receipt.preSnapshot,
  'mutation receipt carries pre-state snapshot (rollback anchor)'
);
ok(
  applied.receipt.preDigest === d0 && applied.receipt.postDigest === dApplied,
  'receipt pre/post digests match observed pre/post state'
);

// ── 4. ROLLBACK restores the EXACT pre-apply state (proven by digest) ────────
const rb = V.rollbackMutation(dir, applied.receipt, 'founder-joseph');
ok(rb.ok, 'rollbackMutation() succeeds');
ok(
  rb.rollbackReceipt.restoredExactly === true,
  'rollback receipt: restoredExactly = true (proven, not asserted)'
);
ok(V.stateDigest(dir) === d0, 'ROLLBACK restored EXACT pre-apply state (vault-ops digest == pre)');
ok(engineDigest(dir) === e0, 'ROLLBACK restored EXACT pre-apply state (REAL engine digest == pre)');
ok(
  !V.readState(dir).tiers.platinum.includes('W.GOLD.534'),
  'W.GOLD.534 is back in gold (mutation undone)'
);

// ── 5. DETERMINISM — proposal id + token reproduce under the same state ──────
V.buildSandbox(dir);
const propA = V.proposeMutation(dir, {
  verb: 'graduate',
  id: 'W.GOLD.534',
  by: 'ai-curator-claude',
});
V.buildSandbox(dir);
const propB = V.proposeMutation(dir, {
  verb: 'graduate',
  id: 'W.GOLD.534',
  by: 'ai-curator-claude',
});
ok(
  propA.proposal.proposalId === propB.proposal.proposalId,
  'proposalId is deterministic across fresh builds'
);
ok(
  propA.approvalToken === propB.approvalToken,
  'founder approvalToken is deterministic across fresh builds'
);

// ── 6. STALE FENCE — a vault that moved since the proposal refuses the apply ─
V.buildSandbox(dir);
const propC = V.proposeMutation(dir, {
  verb: 'graduate',
  id: 'W.GOLD.534',
  by: 'ai-curator-claude',
});
V.graduate(dir, 'W.GOLD.535', 'someone-else'); // vault moves out from under the proposal
const stale = V.applyMutation(
  dir,
  propC.proposal.proposalId,
  propC.approvalToken,
  'founder-joseph'
);
ok(
  !stale.ok && /stale/.test(stale.error),
  'apply REFUSED when vault changed since proposal (digest fence)'
);

// ── 7. D:/GOLD is never touched — gate operates only in the sandbox ──────────
ok(
  dir.includes('vault-sandbox-g27') && !dir.toUpperCase().includes('D:'),
  'gate writes only to throwaway sandbox, never D:/GOLD'
);

console.log(`\n=> GATE 27 ${fail === 0 ? 'VERIFIED' : 'FAILED'} (${pass} pass / ${fail} fail)`);

if (process.argv.includes('--emit') && fail === 0) {
  const receipt = {
    schema: 'cael-gate-v1',
    gate: 27,
    name: 'live-vault safe mutation flow',
    track: 'flagship',
    proven:
      'AI proposes -> vault untouched -> founder token applies -> reversible rollback to exact pre-state',
    checks: `${pass}/${pass}`,
    contract: {
      spine:
        'REAL computeStateDigest (packages/engine/src/simulation/hashes.ts) + cael-vault-mutation-v1',
      proposeDelta: 0,
      refusedApplyDelta: 0,
      approvedApplyDelta: 'nonzero',
      rollbackRestoresExact: true,
      neverWritesRealVault:
        'D:/GOLD untouched — sandbox only; promotion is a separate founder gate',
      reproducible: 'run the verifier to re-derive',
    },
    aiHumanConnection:
      'AI curator proposes the mutation; the human founder ratifies via the approval token; the vault is the shared world state both act on; every step (propose/apply/rollback) leaves a hash-sealed receipt',
    timestamp: new Date().toISOString(),
  };
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2));
  console.log(`emitted ${receiptPath}`);
}

rmSync(dir, { recursive: true, force: true });
process.exit(fail === 0 ? 0 : 1);
