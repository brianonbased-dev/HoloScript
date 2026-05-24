// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — FLAGSHIP Gate 4 verifier (REPRODUCIBLE; committed so digests re-run)
//
// Gate 4 = "content / world evolution": the vault world EVOLVES CAUSALLY (a graduation has
// downstream consequences on what is graduatable next — a real Pearl do-calculus intervention,
// not a flat tier move) AND an NPC curator carries MEMORY ACROSS SESSIONS that re-plans.
//
// Real seams: CausalWorldModel (packages/hololand-platform/src/world/causal.ts, Pearl SCM),
// graduate() (vault-ops.cjs), computeStateDigest (the real contract fn). Session logic lives in
// the pure module gold-game-causal-session.mjs (F.077).
//
// E-G4 (deep-ratchet honesty fix 2026-05-24): the two sessions now run in SEPARATE OS PROCESSES
// (each spawned as its own `tsx` child); the ONLY thing crossing between them is the disk memory
// file. This makes "memory across process-separated sessions" literally TRUE — previously both
// ran in one process and the claim overreached. The verifier asserts the child PIDs genuinely
// differ from each other and from the parent. (No forced "learned model": with 5 entries / 2
// sessions that would be ML theater — the honest mechanism is experiential payoff memory.)
//
//   node_modules/.bin/tsx examples/gold-game/gate-4-causal-memory-verify.mjs --emit
//   node_modules/.bin/tsx examples/gold-game/gate-4-causal-memory-verify.mjs
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { POOL, EDGES, GRADED_INFLUENCE, setupPool, graduatableNow, buildCausalModel, loadMemory } from './gold-game-causal-session.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const holoPath = join(here, 'gold-vault-game.holo');
const receiptPath = join(here, 'GATE-4-CAUSAL-MEMORY-receipt.json');
const sandboxDir = join(here, 'vault-sandbox-g4');
const memoryPath = join(sandboxDir, 'npc-memory.json');
const sessionModule = join(here, 'gold-game-causal-session.mjs');
const tsxCli = join(repoRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const imp = (p) => import(pathToFileURL(p).href);
const require = createRequire(import.meta.url);

const { computeStateDigest } = await imp(join(repoRoot, 'packages', 'engine', 'src', 'simulation', 'hashes.ts'));
const core = await imp(join(repoRoot, 'packages', 'core', 'dist', 'index.js'));
const { parseHolo } = core;
const coreVersion = JSON.parse(readFileSync(join(repoRoot, 'packages', 'core', 'package.json'), 'utf8')).version;
const V = require('./vault-ops.cjs');
const HASH_MODE = 'sha256';

const src = readFileSync(holoPath, 'utf8');
const parsed = parseHolo(src);
if ((parsed.errors || []).length !== 0) { console.error('Gate 4 BLOCKED: gold-vault-game.holo no longer parses clean.'); process.exit(2); }

// Spawn ONE session in its OWN process; return its reported {pid, targets}.
function spawnSession(label, rounds) {
  const out = execFileSync(process.execPath, [tsxCli, sessionModule, label, String(rounds), sandboxDir, memoryPath],
    { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const last = out.trim().split('\n').filter(Boolean).pop();
  return JSON.parse(last);
}

function idToInt(id) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 131 + id.charCodeAt(i)) % 2147483647; return h; }
function vaultToSolver() {
  const st = V.readState(sandboxDir);
  const pairs = [];
  for (let ti = 0; ti < V.ALL_TIERS.length; ti++) for (const id of st.tiers[V.ALL_TIERS[ti]]) {
    const f = V.findEntry(sandboxDir, id);
    pairs.push([idToInt(id), ti, (f && f.entry.lineage_links) || 0]);
  }
  pairs.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
  return { fieldNames: ['vault'], getField: () => Float32Array.from(pairs.flat()) };
}
function memoryToSolver(mem) {
  const rows = mem.graduated.map((id, i) => [i, idToInt(id), mem.payoffs[id] ?? 0]);
  return { fieldNames: ['npcmem'], getField: () => Float32Array.from(rows.flat()) };
}

// ════════════════════════ RUN: two PROCESS-SEPARATED sessions ════════════════
setupPool(sandboxDir, memoryPath);
const seedDigest = computeStateDigest(vaultToSolver(), HASH_MODE);
const seedGraduatable = graduatableNow(sandboxDir).map((x) => x.id);

// SESSION 1 — its own process. Cold NPC; graduates top hub + causal unlock.
const s1 = spawnSession('s1', 1);
const afterS1Graduatable = graduatableNow(sandboxDir).map((x) => x.id);
const s1UnlockedLocked = !seedGraduatable.includes('E.LOCKED.003') && afterS1Graduatable.includes('E.LOCKED.003');
const causalEffectDigest = computeStateDigest(vaultToSolver(), HASH_MODE);

// SESSION 2 — a DIFFERENT process. Loads session-1 memory from DISK only.
const memBeforeS2 = loadMemory(memoryPath);
const s2ColdWouldRepeat = !memBeforeS2.graduated.length;
const s2 = spawnSession('s2', 4);
const s2Targets = s2.targets;
const s2RepeatedS1 = s2Targets.some((t) => memBeforeS2.graduated.includes(t));
const learnedPayoffPick = (memBeforeS2.payoffs['E.HUB.001'] ?? 0) >= 1;
const crossProcess = s1.pid !== s2.pid && s1.pid !== process.pid && s2.pid !== process.pid;

const finalState = V.readState(sandboxDir);
const allHubsGraduated = ['E.HUB.001', 'E.HUB.002'].every((id) => finalState.tiers.gold.includes(id));
const lockedEntryEventuallyGraduated = finalState.tiers.gold.includes('E.LOCKED.003');
const memDigest = computeStateDigest(memoryToSolver(loadMemory(memoryPath)), HASH_MODE);
const interventionRefusesUnknown = await buildCausalModel(sandboxDir).then((m) => { try { m.intervention('NOPE', 1); return false; } catch { return true; } });
const memoryPersisted = existsSync(memoryPath);

const receipt = {
  gate: 4,
  track: 'flagship (gold-vault-game) — causal world evolution + cross-session NPC memory',
  name: 'content/world evolution — CausalWorldModel-driven graduatability + NPC memory across PROCESS-SEPARATED sessions',
  artifact: 'examples/gold-game/gold-vault-game.holo',
  verifier: 'examples/gold-game/gate-4-causal-memory-verify.mjs',
  sessionModule: 'examples/gold-game/gold-game-causal-session.mjs (run as a separate process per session)',
  target: 'r3f',
  processSeparation: { session1Pid: s1.pid, session2Pid: s2.pid, verifierPid: process.pid, genuinelySeparateProcesses: crossProcess, sharedStateChannel: 'disk file only: ' + 'vault-sandbox-g4/npc-memory.json' },
  causalModel: {
    impl: 'REAL CausalWorldModel from packages/hololand-platform/src/world/causal.ts (Pearl do-calculus SCM)',
    variables: POOL.map((e) => ({ id: e.id, lineage: e.lineage_links })), edges: EDGES,
    semantics: 'graduating a hub = do(hubLineage=' + GRADED_INFLUENCE + '); linear structural eqs propagate a lineage boost to linked entries; a sub-threshold entry (lineage 0) crosses into graduatable as a downstream causal effect',
    worldEvolution: { seedGraduatable, afterSession1Graduatable: afterS1Graduatable, lockedEntryUnlockedByCausalEffect: s1UnlockedLocked },
  },
  crossSessionMemory: {
    persistedTo: 'examples/gold-game/vault-sandbox-g4/npc-memory.json (real disk file; the ONLY channel between two separate OS processes — session 2 reads it cold from disk)',
    session1Pid: s1.pid, session2Pid: s2.pid, processSeparated: crossProcess,
    session2LoadedNonEmptyMemory: !s2ColdWouldRepeat, session2GraduatedTargets: s2Targets,
    session2RepeatedASession1Graduation: s2RepeatedS1, learnedPayoffRecorded: learnedPayoffPick,
    proof: 'Session 2 runs in a SEPARATE process and loads session 1\'s memory from disk: it does NOT re-graduate what session 1 moved and prioritises the highest-payoff remembered intervention. Memory is experiential (records observed causal payoffs), not a fitted model — the honest mechanism for this 5-entry/2-session regime.',
  },
  contract: {
    spine: 'REAL computeStateDigest from packages/engine/src/simulation/hashes.ts', algorithm: HASH_MODE,
    seedDigest, causalEffectDigest, npcMemoryDigest: memDigest,
    finalTiers: { gold: finalState.tiers.gold, bronze: finalState.tiers.bronze },
    reproducible: 'run `node_modules/.bin/tsx examples/gold-game/gate-4-causal-memory-verify.mjs` to re-derive',
  },
  honestScope: 'The causal edges + graded-influence value are hand-authored (a faithful model of the real auto_link "graduating a hub strengthens its constellation" consequence). The NPC memory is an EXPERIENTIAL payoff-preferring policy (record observed unlocks; prefer high-payoff next) — deliberately NOT a fitted model, because with 5 entries and 2 sessions "training" would be theater. Graduations write to a SANDBOX vault; promotion to governed D:/GOLD stays founder-gated. PROVEN: the vault world evolves via a REAL Pearl do-calculus intervention (a sub-threshold entry is unlocked as a downstream causal effect), and an NPC carries memory across TWO GENUINELY SEPARATE OS PROCESSES (distinct PIDs; only the disk file crosses) that causally changes its plan. NOT yet proven: a trained causal policy on real operator traces (Gate 5+ scope).',
  core: coreVersion, verifiedAt: new Date().toISOString(),
};

const emit = process.argv.includes('--emit');
if (emit) {
  writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
  console.log('GATE-4 RECEIPT EMITTED →', receiptPath);
  console.log('  pids: s1=' + s1.pid, 's2=' + s2.pid, 'parent=' + process.pid, 'separate=' + crossProcess);
  console.log('  afterS1Graduatable=' + JSON.stringify(afterS1Graduatable), 'unlockedLocked=' + s1UnlockedLocked);
  console.log('  s2Targets=' + JSON.stringify(s2Targets), 'repeatedS1=' + s2RepeatedS1);
  console.log('  causalEffectDigest=' + causalEffectDigest, 'npcMemoryDigest=' + memDigest);
} else {
  let existing;
  try { existing = JSON.parse(readFileSync(receiptPath, 'utf8')); }
  catch { console.error('No Gate-4 receipt to verify. Run with --emit first.'); process.exit(2); }
  const checks = [
    ['flagship .holo parses (0 errors)', (parsed.errors || []).length === 0],
    ['locked entry (lineage 0) is NOT graduatable at seed', !seedGraduatable.includes('E.LOCKED.003')],
    ['real do-calculus intervention UNLOCKED the locked entry (world evolved causally)', s1UnlockedLocked === true],
    ['locked entry became graduatable AFTER session 1 (downstream causal effect)', afterS1Graduatable.includes('E.LOCKED.003')],
    ['the two sessions ran in GENUINELY SEPARATE OS processes (distinct PIDs)', crossProcess === true],
    ['session 2 loaded NON-EMPTY memory from DISK (the only cross-process channel)', !s2ColdWouldRepeat],
    ['session 2 did NOT re-graduate any session-1 graduation (memory across processes)', s2RepeatedS1 === false],
    ['NPC recorded a learned causal payoff (>=1 unlock) in persisted memory', learnedPayoffPick === true],
    ['the locked entry was EVENTUALLY graduated (only reachable via the causal unlock)', lockedEntryEventuallyGraduated === true],
    ['both hubs ended in gold on disk (real file moves)', allHubsGraduated === true],
    ['variational gate: causal intervention refuses an unknown variable', interventionRefusesUnknown === true],
    ['NPC memory file persisted to disk (cross-process substrate)', memoryPersisted === true],
    ['causal-effect (evolved-world) digest reproduces', causalEffectDigest === existing.contract.causalEffectDigest],
    ['cross-session NPC-memory digest reproduces', memDigest === existing.contract.npcMemoryDigest],
  ];
  let ok = true;
  console.log('GATE-4 (FLAGSHIP CAUSAL+MEMORY) VERIFICATION (process-separated sessions, REAL contract fn + REAL CausalWorldModel):');
  for (const [label, pass] of checks) { console.log('  ' + (pass ? 'PASS' : 'FAIL') + '  ' + label); ok = ok && pass; }
  console.log('  pids s1=' + s1.pid + ' s2=' + s2.pid + ' parent=' + process.pid);
  console.log('  => GATE 4', ok ? 'VERIFIED' : 'BROKEN');
  process.exit(ok ? 0 : 1);
}
