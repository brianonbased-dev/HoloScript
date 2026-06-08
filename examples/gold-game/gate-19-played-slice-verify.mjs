// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 19: "The Played Slice" / One Climb (REPRODUCIBLE).
//
// The playability+quality ratchet /critic identified and /game-design designed.
// Proves the mechanics COHERE into a played loop — NOT another isolated verifier.
// Runs the SAME engine the build uses (gold-game-loop.mjs) and asserts an OBSERVABLE
// SESSION TRACE of real state deltas (file moves, receipt by-fields, balance/trust
// deltas, dialogue node id). Un-fakeable by grep: a broken beat changes a number or
// a hash, not a string. (Replaces the F.069 grep-theater that shipped in Gate 15.)
//
//   node_modules/.bin/tsx examples/gold-game/gate-19-played-slice-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-19-played-slice-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const imp = (p) => import(pathToFileURL(p).href);
const { runPlayedSlice, GOAL_GRADUATIONS, RATIFY_THRESHOLD } = await imp(
  join(here, 'gold-game-loop.mjs')
);
const receiptPath = join(here, 'GATE-19-PLAYED-SLICE-receipt.json');
const sandboxDir = join(here, 'vault-sandbox-g19');

const t = await runPlayedSlice(sandboxDir);
const t2 = await runPlayedSlice(sandboxDir); // determinism re-run

const receipt = {
  gate: 19,
  track: 'flagship',
  name: 'The Played Slice ("One Climb") — proven coherent played loop, not isolated mechanics',
  verifier: 'examples/gold-game/gate-19-played-slice-verify.mjs',
  engine:
    'examples/gold-game/gold-game-loop.mjs (the SAME loop the build/server runs; reuses Gates 2/8/14)',
  trace: t,
  honestScope:
    'Runs the One Climb loop with the GENUINE reused code: vault-ops.graduate() real file moves (Gate 2), economy/reputation/agenda handlers driving the AI companion (Gate 8), and DialogueTrait+ReputationLedger ratifying the human (Gate 14). The acceptance is an OBSERVABLE state-delta trace, not a regex (fixes the F.069 grep-theater shipped in Gate 15). STILL-FAKED, labeled: the companion pick-order + the human play trace are scripted (deterministic), not a trained/live agent; the Archivist lines are authored (no TTS); this is ONE local climb, not a population playtest (economy only accumulates here — the stake sink + N-run balance is the next gate); and the loop is proven server-side/Node (real fs) — the in-browser build calls /api/graduate for live play. PROVEN: a coherent start-to-finish climb where a human graduate changes real vault state, an AI co-curator independently graduates on the same vault with real economy/reputation, a collision blocks, reputation accrues to cross the ratify threshold, and the Archivist ratifies — all reproducible.',
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-19 RECEIPT EMITTED ->', receiptPath);
  console.log(
    '  T1 human graduate:',
    t.T1.ok,
    'by=' + t.T1.by,
    'vaultChanged=' + t.T1.vaultChanged
  );
  console.log(
    '  T2 companion:',
    t.T2.pick,
    'different=' + t.T2.differentFromHuman,
    'earned=' + t.T2.earnedReward,
    'trust>init=' + t.T2.trustAboveInitial
  );
  console.log('  T3 collision blocked+unchanged:', t.T3.blockedAndUnchanged);
  console.log(
    '  T4 trustArc:',
    t.T4.trustArc.join('->'),
    'cross@' + t.T4.firstCrossIdx,
    'accum=' + t.T4.accumulationDriven
  );
  console.log(
    '  T5 archivist:',
    t.T5.action,
    'node=' + t.T5.node,
    'negControl=' + t.T5.negativeControl
  );
  console.log('  T6 win=' + t.T6.win, 'goldDelta=' + t.T6.goldDelta);
} else {
  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No Gate-19 receipt. Run --emit first.');
    process.exit(2);
  }
  const checks = [
    [
      'T1 — HUMAN graduate fired: real verb ok, sealed receipt by human-curator, WORLD changed (vault digest)',
      t.T1.ok === true &&
        t.T1.by === 'human-curator' &&
        t.T1.schema === 'cael-graduation-v1' &&
        t.T1.vaultChanged === true,
    ],
    [
      'T2 — AI companion graduated INDEPENDENTLY (different entry) with real receipt on disk',
      t.T2.ok === true &&
        t.T2.by === 'agent-companion' &&
        t.T2.differentFromHuman === true &&
        t.T2.receiptOnDisk === true,
    ],
    [
      'T2 — companion did REAL economy work (balance += reward) and gained reputation',
      t.T2.earnedReward === true && t.T2.trustAboveInitial === true && t.T2.ceilingOk === true,
    ],
    [
      'T3 — the collision "monster" BLOCKS (graduate ok:false) and the entry tier is UNCHANGED',
      t.T3.blockedAndUnchanged === true,
    ],
    [
      'T4 — reputation crossed the ratify threshold by ACCUMULATION (not a flag)',
      t.T4.firstCrossIdx >= 0 &&
        t.T4.accumulationDriven === true &&
        t.T4.finalTrust / 100 > RATIFY_THRESHOLD,
    ],
    [
      'T5 — Archivist RATIFIED via the real DialogueTrait (action=ratify, node=quest_open)',
      t.T5.ratified === true && t.T5.questOpened === true,
    ],
    [
      'T5 — negative control: below threshold the SAME config yields send_back (gated, not scripted)',
      t.T5.negativeControl === 'send_back',
    ],
    [
      'T6 — GOAL met: Gold terrace filled (>= ' +
        GOAL_GRADUATIONS +
        ') AND Archivist ratified → win',
      t.T6.win === true && t.T6.goldFilled === true,
    ],
    [
      'the played loop is DETERMINISTIC (win + digests reproduce across a fresh climb)',
      t.T6.win === t2.T6.win &&
        t.T6.vaultDigestFinal === t2.T6.vaultDigestFinal &&
        t.T6.verdictDigest === t2.T6.verdictDigest,
    ],
    [
      'win digests match the committed receipt (real computeStateDigest)',
      t.T6.vaultDigestFinal === existing.trace.T6.vaultDigestFinal &&
        t.T6.verdictDigest === existing.trace.T6.verdictDigest,
    ],
  ];
  let ok = true;
  console.log('GATE-19 (THE PLAYED SLICE — ONE CLIMB) VERIFICATION:');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log('  => GATE 19', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
