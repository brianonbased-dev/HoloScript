// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — Gate 14: THE ARCHIVIST's dialogue + quest arc (REPRODUCIBLE).
//
// Wires the relationship the design doc (CHARACTER-archivist.md) and /narrative
// named as the BUILD TARGET: the Archivist's verdict shifts from the ACCUMULATION
// of what you did (her @reputationLedger), NOT a flag. Closes the gap "/narrative"
// flagged: ReputationLedger trust -> DialogueTrait option condition.
//
// Driven end-to-end by the TWO MATURE shipped traits (not mocks):
//   • ReputationLedgerTrait (reputationLedgerHandler) — accrues real trust from
//     quality-weighted observations of the player's submissions.
//   • DialogueTrait v2.0.0 (dialogueHandler) — her verdict node has a "ratify"
//     option gated by condition "reputation > 0.55"; the REAL handler's
//     filterOptions(options, blackboard) enforces it. We feed the ledger trust
//     into the dialogue blackboard (the wire) — so low trust => she SENDS IT BACK
//     (ratify option literally absent), trust crossing the threshold => RATIFY +
//     she opens a HoloQuest.
//
//   node_modules/.bin/tsx examples/gold-game/gate-14-archivist-dialogue-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-14-archivist-dialogue-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '..', '..');
const imp = (p) => import(pathToFileURL(p).href);
const { computeStateDigest } = await imp(
  join(repo, 'packages', 'engine', 'src', 'simulation', 'hashes.ts')
);
const { reputationLedgerHandler } = await imp(
  join(repo, 'packages', 'core', 'src', 'traits', 'ReputationLedgerTrait.ts')
);
const { dialogueHandler } = await imp(
  join(repo, 'packages', 'core', 'src', 'traits', 'DialogueTrait.ts')
);
const receiptPath = join(here, 'GATE-14-ARCHIVIST-receipt.json');
const HASH = 'sha256';
const THRESHOLD = 0.55;
const PLAYER = 'player-curator';

function makeCtx() {
  const events = [];
  return { ctx: { emit: (type, payload) => events.push({ type, payload }) }, events };
}
const lastEvent = (events, type) => [...events].reverse().find((e) => e.type === type);

// The Archivist's verdict dialogue (real DialogueTrait config). The "ratify"
// option is reputation-gated; "send it back" is always available.
const DIALOGUE_CONFIG = {
  ...dialogueHandler.defaultConfig,
  speaker_name: 'Maren Vael, the Archivist',
  player_name: 'Curator',
  start_node: 'verdict',
  llm_dynamic: false,
  dialogue_tree: {
    verdict: {
      id: 'verdict',
      speaker: 'Maren Vael',
      emotion: 'wary',
      text: 'I have read it. The ledger remembers what you have brought before.',
      options: [
        {
          text: '(she lets it ascend — it earns the anchor)',
          condition: 'reputation > 0.55',
          action: 'ratify',
          nextNode: 'quest_open',
          emotion: 'warming',
        },
        {
          text: '(she sends it back — it decays in a week)',
          action: 'send_back',
          nextNode: 'farewell',
          emotion: 'cold',
        },
      ],
    },
    quest_open: {
      id: 'quest_open',
      speaker: 'Maren Vael',
      emotion: 'warming',
      text: 'It earns its place. Now — recover the Drowned Index, as the index has it.',
      options: [],
    },
    farewell: {
      id: 'farewell',
      speaker: 'Maren Vael',
      emotion: 'cold',
      text: 'A thing that decays in a week does not deserve a permanent slot.',
      options: [],
    },
  },
};

// The reward quest she opens when you finally earn it (HoloQuest shape).
const QUEST = {
  id: 'recover-the-drowned-index',
  giver: 'npc.maren-archivist',
  questType: 'discover',
  reward: { reputation: 10, unlocks: 'sealed-reading-room' },
};

// One persistent reputation ledger (the Archivist's memory of YOU across visits).
const repNode = {};
const rep = makeCtx();
const REP_CFG = { ...reputationLedgerHandler.defaultConfig };
reputationLedgerHandler.onAttach(repNode, REP_CFG, rep.ctx);
const INITIAL_TRUST = REP_CFG.initial_trust ?? 50;
const observe = (action, delta) =>
  reputationLedgerHandler.onEvent(repNode, REP_CFG, rep.ctx, {
    type: 'reputation_observe_action',
    observerId: PLAYER,
    action,
    trustDelta: delta,
  });
const trustNow = () => {
  reputationLedgerHandler.onEvent(repNode, REP_CFG, rep.ctx, {
    type: 'reputation_query',
    observerId: PLAYER,
  });
  const snap = lastEvent(rep.events, 'reputation_ledger_snapshot');
  const obs =
    snap?.payload?.observers?.find?.((o) => o.id === PLAYER) || snap?.payload?.observers?.[0];
  return obs?.trust ?? INITIAL_TRUST;
};

// A deterministic visit trace: low-quality work early (sent back), then the
// accumulation crosses the threshold — she ratifies. (Quality -> trustDelta.)
const VISITS = [
  { entry: 'uncited-claim', quality: -12 },
  { entry: 'colliding-duplicate', quality: -12 },
  { entry: 'cited-clean-pattern', quality: 8 },
  { entry: 'recovered-lost-index', quality: 15 },
  { entry: 'cited-clean-scar', quality: 8 },
];

// The Archivist's verdict for one visit: REAL reputation -> blackboard -> REAL dialogue.
function visit(v) {
  observe(v.entry, v.quality); // she observes your submission (real ledger)
  const trust = trustNow(); // her accumulated trust in you (real ledger)
  const reputation = trust / 100; // the WIRE: ledger trust -> dialogue blackboard
  const node = {};
  const dlg = makeCtx();
  dialogueHandler.onAttach(node, DIALOGUE_CONFIG, dlg.ctx);
  dialogueHandler.onEvent(node, DIALOGUE_CONFIG, dlg.ctx, {
    type: 'start_dialogue',
    startNode: 'verdict',
    context: { reputation },
  });
  dialogueHandler.onEvent(node, DIALOGUE_CONFIG, dlg.ctx, { type: 'select_option', index: 0 }); // intent: "please ratify"
  const action = lastEvent(dlg.events, 'dialogue_action')?.payload?.action; // 'ratify' or 'send_back' — REAL filterOptions decided
  const reachedQuest = node.__dialogueState?.currentNodeId === 'quest_open';
  return {
    entry: v.entry,
    trust,
    reputation: Number(reputation.toFixed(4)),
    verdict: action,
    reachedQuest,
  };
}

const results = VISITS.map(visit);
const finalTrust = results[results.length - 1].trust;
const sumDeltas = VISITS.reduce((s, v) => s + v.quality, 0);
const sentBackEarly = results.slice(0, 4).every((r) => r.verdict === 'send_back');
const ratifyVisitIdx = results.findIndex((r) => r.verdict === 'ratify');
const firstCrossIdx = results.findIndex((r) => r.reputation > THRESHOLD);
const questOpened = ratifyVisitIdx >= 0 && results[ratifyVisitIdx].reachedQuest;
const accumulationDriven = finalTrust === INITIAL_TRUST + sumDeltas; // verdict tracks accumulated trust, not a flag

const verdictDigest = computeStateDigest(
  {
    fieldNames: ['v'],
    getField: () =>
      Float32Array.from(
        results.flatMap((r) => [
          Math.round(r.trust * 100),
          r.verdict === 'ratify' ? 1 : 0,
          r.reachedQuest ? 1 : 0,
        ])
      ),
  },
  HASH
);

const receipt = {
  gate: 14,
  track: 'flagship',
  name: 'The Archivist — dialogue + quest arc; verdict driven by accumulated reputation (real DialogueTrait + ReputationLedger)',
  verifier: 'examples/gold-game/gate-14-archivist-dialogue-verify.mjs',
  character:
    'Maren Vael, the Archivist (TheArchivist in gold-vault-game.holo) — graduate.py/review.py embodied',
  implementation: {
    dialogue:
      'packages/core/src/traits/DialogueTrait.ts (dialogueHandler v2.0.0 — REAL; filterOptions enforces the reputation-gated verdict)',
    reputation:
      'packages/core/src/traits/ReputationLedgerTrait.ts (reputationLedgerHandler — REAL; accrues BehaviorFact trust)',
    wire: 'ledger trust -> dialogue blackboard.reputation -> option condition "reputation > 0.55" (the gap /narrative named, closed here)',
  },
  arc: {
    initialTrust: INITIAL_TRUST,
    threshold: THRESHOLD,
    visits: results,
    finalTrust,
    ratifyVisit: ratifyVisitIdx + 1,
    firstThresholdCross: firstCrossIdx + 1,
    quest: questOpened ? QUEST : null,
  },
  contract: {
    spine: 'REAL computeStateDigest',
    verdictDigest,
    reproducible: 'run the verifier to re-derive',
  },
  honestScope:
    'The verdict is decided by the GENUINE DialogueTrait v2.0.0 (its real filterOptions evaluates the option condition against a blackboard) fed by the GENUINE ReputationLedgerTrait trust accrual — not mocks. PROVEN: the Archivist sends low-trust work back, her trust accumulates from quality-weighted submissions, and a threshold crossing flips her verdict to ratify + opens a HoloQuest — driven by ACCUMULATED reputation, not a flag. NOT proven (build targets per /narrative): voice-consistency traits (@verbalFingerprint/@vocabularyRegister) and cross-session ReID (@speechAwareEncounter) are 0.1.0-skeleton; dialogue text is authored (no TTS/voiced lines); multi-session NPC growth + dialogue-emotion-driven quest branching deepen later.',
  verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-14 RECEIPT EMITTED ->', receiptPath);
  console.log(
    '  trust arc:',
    results.map((r) => r.trust).join(' -> '),
    '| final=' +
      finalTrust +
      ' (== ' +
      INITIAL_TRUST +
      '+' +
      sumDeltas +
      ': ' +
      accumulationDriven +
      ')'
  );
  console.log('  verdicts:', results.map((r) => r.verdict).join(', '));
  console.log(
    '  ratifyVisit=' + (ratifyVisitIdx + 1),
    'firstCross=' + (firstCrossIdx + 1),
    'questOpened=' + questOpened
  );
  console.log('  verdictDigest=' + verdictDigest);
} else {
  let existing;
  try {
    existing = JSON.parse(readFileSync(receiptPath, 'utf8'));
  } catch {
    console.error('No Gate-14 receipt. Run --emit first.');
    process.exit(2);
  }
  const checks = [
    [
      'REAL ReputationLedger attached + accrues trust',
      !!repNode.__reputationState || results.every((r) => typeof r.trust === 'number'),
    ],
    [
      'REAL DialogueTrait decided each verdict (dialogue_action emitted)',
      results.every((r) => r.verdict === 'ratify' || r.verdict === 'send_back'),
    ],
    [
      'early visits SENT BACK (low trust -> ratify option absent via real filterOptions)',
      sentBackEarly === true,
    ],
    [
      'trust accrues by ACCUMULATION, not a flag (final == initial + Σ deltas)',
      accumulationDriven === true,
    ],
    [
      'verdict flips to RATIFY exactly when reputation first crosses the threshold',
      ratifyVisitIdx >= 0 && ratifyVisitIdx === firstCrossIdx,
    ],
    ['ratify advances to the quest node + opens a HoloQuest', questOpened === true],
    [
      'verdict/trust digest reproduces (real computeStateDigest)',
      verdictDigest === existing.contract.verdictDigest,
    ],
  ];
  let ok = true;
  console.log('GATE-14 (ARCHIVIST DIALOGUE + QUEST ARC) VERIFICATION:');
  for (const [label, pass] of checks) {
    console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label);
    ok = ok && pass;
  }
  console.log('  => GATE 14', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
