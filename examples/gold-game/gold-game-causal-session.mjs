// ═══════════════════════════════════════════════════════════════════════════
// THE GOLD GAME — causal-curation session engine (Gate 4 / E-G4). Pure + CLI.
//
// Module-first (F.077): one NPC-curator session — sense graduatable entries, graduate the
// best via the real verb, apply the REAL CausalWorldModel do-calculus downstream effect,
// and persist what it learned (observed causal payoffs) to a disk memory file.
//
// E-G4 (deep-ratchet honesty fix, 2026-05-24): the gate-4 verifier used to run both
// sessions IN ONE process, yet the receipt claimed memory worked "across process-separated
// sessions" — an overclaim. This module is ALSO a CLI so the verifier can spawn each session
// as a SEPARATE node/tsx process; the ONLY thing crossing between them is the disk file.
//   tsx gold-game-causal-session.mjs <label> <rounds> <sandboxDir> <memoryPath>
//
// NOT a learned model: with 5 entries and 2 sessions, "training" would be theater. The memory
// is honest EXPERIENTIAL payoff-recording (record observed unlocks; prefer high-payoff next) —
// reinforcement-style, not a fitted model. That is the right mechanism for this data regime.
// ═══════════════════════════════════════════════════════════════════════════

import { readFileSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '..', '..');
const require = createRequire(import.meta.url);
const imp = (p) => import(pathToFileURL(p).href);

const V = require('./vault-ops.cjs');

export const GRADED_INFLUENCE = 9;
export const POOL = [
  { id: 'E.HUB.001', title: 'cross-domain-synthesis-hub', tier: 'bronze', lineage_links: 4 },
  { id: 'E.HUB.002', title: 'receipt-with-solver-hub', tier: 'bronze', lineage_links: 3 },
  { id: 'E.LINK.002', title: 'survey-before-gap', tier: 'bronze', lineage_links: 1 },
  { id: 'E.LINK.004', title: 'import-array-regex-gate', tier: 'bronze', lineage_links: 1 },
  { id: 'E.LOCKED.003', title: 'orphan-pattern-no-lineage', tier: 'bronze', lineage_links: 0 },
];
export const EDGES = [
  { from: 'E.HUB.001', to: 'E.LINK.002', coefficient: 0.6 },
  { from: 'E.HUB.001', to: 'E.LOCKED.003', coefficient: 0.6 },
  { from: 'E.HUB.002', to: 'E.LINK.004', coefficient: 0.5 },
];

export async function buildCausalModel(sandboxDir) {
  const { CausalWorldModel } = await imp(
    join(repoRoot, 'packages', 'hololand-platform', 'src', 'world', 'causal.ts')
  );
  const m = new CausalWorldModel();
  for (const e of POOL) {
    const f = sandboxDir ? V.findEntry(sandboxDir, e.id) : null;
    const value = f ? f.entry.lineage_links : e.lineage_links;
    m.addVariable({ id: e.id, name: e.title, value, unit: 'links' });
  }
  for (const e of EDGES) m.addEdge(e);
  return m;
}

export function setupPool(sandboxDir, memoryPath) {
  V.buildSandbox(sandboxDir);
  for (const e of POOL)
    writeFileSync(join(sandboxDir, e.tier, e.id + '.json'), JSON.stringify(e, null, 2));
  if (memoryPath && existsSync(memoryPath)) rmSync(memoryPath);
}

export function graduatableNow(sandboxDir) {
  const st = V.readState(sandboxDir);
  return st.tiers.bronze
    .map((id) => {
      const f = V.findEntry(sandboxDir, id);
      return { id, value: (f && f.entry.lineage_links) || 0 };
    })
    .filter((x) => x.value >= 1)
    .sort((a, b) => b.value - a.value || (a.id < b.id ? -1 : 1));
}

export async function applyCausalEffect(sandboxDir, hubId) {
  const model = await buildCausalModel(sandboxDir);
  const before = new Set(graduatableNow(sandboxDir).map((x) => x.id));
  const result = model.intervention(hubId, GRADED_INFLUENCE);
  const newlyUnlocked = [];
  for (const [id, val] of Object.entries(result.values)) {
    if (id === hubId) continue;
    const f = V.findEntry(sandboxDir, id);
    if (!f || f.tier !== 'bronze') continue;
    const rounded = Math.round(val * 100) / 100;
    if (rounded !== f.entry.lineage_links)
      writeFileSync(f.path, JSON.stringify({ ...f.entry, lineage_links: rounded }, null, 2));
    if (!before.has(id) && rounded >= 1) newlyUnlocked.push(id);
  }
  return {
    intervention: `do(${hubId}=${GRADED_INFLUENCE})`,
    evaluationOrder: result.evaluationOrder,
    newlyUnlocked,
  };
}

export const loadMemory = (memoryPath) =>
  existsSync(memoryPath)
    ? JSON.parse(readFileSync(memoryPath, 'utf8'))
    : { graduated: [], payoffs: {} };
export const saveMemory = (memoryPath, mem) =>
  writeFileSync(memoryPath, JSON.stringify(mem, null, 2) + '\n');

// One session: load disk memory, sense, graduate (experiential payoff preference), evolve, persist.
export async function runSession({ label, rounds, sandboxDir, memoryPath }) {
  const mem = loadMemory(memoryPath);
  const known = new Set(mem.graduated);
  const events = [];
  const selectTarget = () => {
    const pool = graduatableNow(sandboxDir).filter((x) => !known.has(x.id));
    if (pool.length === 0) return null;
    let best = pool[0],
      bestKey = [mem.payoffs[best.id] ?? -1, best.value, best.id];
    for (const cand of pool) {
      const key = [mem.payoffs[cand.id] ?? -1, cand.value, cand.id];
      if (
        key[0] > bestKey[0] ||
        (key[0] === bestKey[0] && key[1] > bestKey[1]) ||
        (key[0] === bestKey[0] && key[1] === bestKey[1] && key[2] < bestKey[2])
      ) {
        best = cand;
        bestKey = key;
      }
    }
    return best.id;
  };
  for (let r = 0; r < rounds; r++) {
    const target = selectTarget();
    if (!target) {
      events.push({ round: r, action: 'pass' });
      continue;
    }
    const gr = V.graduate(sandboxDir, target, label + '-npc-curator');
    if (!gr.ok) {
      events.push({ round: r, action: 'pass', refused: target, reason: gr.error });
      continue;
    }
    const causal = await applyCausalEffect(sandboxDir, target);
    known.add(target);
    mem.graduated.push(target);
    mem.payoffs[target] = causal.newlyUnlocked.length;
    events.push({ round: r, action: 'graduate', target, causal });
  }
  saveMemory(memoryPath, mem);
  return { label, events, memoryAfter: mem };
}

// ── CLI: run ONE session in its own process (the cross-process proof) ──────────
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const [label, rounds, sandboxDir, memoryPath] = process.argv.slice(2);
  const res = await runSession({ label, rounds: Number(rounds), sandboxDir, memoryPath });
  console.log(
    JSON.stringify({
      pid: process.pid,
      label,
      targets: res.events.filter((e) => e.action === 'graduate').map((e) => e.target),
    })
  );
}
