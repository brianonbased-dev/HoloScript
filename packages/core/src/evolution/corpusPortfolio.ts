/**
 * The strategic evolve-target portfolio + native gates — the corpus the
 * autonomous accrual draws from.
 *
 * The seeds are CANONICAL (authored here for evolution — small, parse-clean,
 * diverse across the HoloScript surface), NOT copies of repo files, so the
 * executor runs WITHOUT a repo checkout (e.g. the Jetson agent idle-loop, which
 * has `@holoscript/core` but not the source tree). A drift-vs-repo copy would rot;
 * a canonical authored set is the loop's own ground truth (its parseability is
 * asserted by corpusPortfolio.test.ts).
 *
 * The gate is a real parser (`parseHolo` / HSPlus `parse`) PLUS a
 * preserved-construct check — quality by construction (a "pass" is valid + intact,
 * never merely non-empty). {@link accrueOneStep} runs ONE gated evolution step per
 * call, so an idle loop can accrue a single verifier-labeled row per tick without
 * blocking its task-claiming.
 *
 * @package @holoscript/core/evolution
 */
import { parseHolo, parse as parseHsPlus } from '../parser';
import {
  runEvolution,
  toGradedTraceRow,
  type Proposer,
  type Gate,
  type EvolveReceipt,
  type GradedTraceRow,
} from './EvolveProgramBackend';

export type SeedFormat = 'holo' | 'hsplus';

export interface EvolveSeed {
  name: string;
  /** Which native parser gates this seed's candidates (by CONSTRUCT, not file ext). */
  format: SeedFormat;
  /** Natural-language objective for the proposer. */
  goal: string;
  /** The canonical seed source (authored; parse-clean). */
  source: string;
  /** Constructs that MUST survive a mutation (whitespace-tolerant). */
  preserved: RegExp[];
}

// ── canonical portfolio (3 diverse forms across the language surface) ──────────
export const CORPUS_PORTFOLIO: readonly EvolveSeed[] = [
  {
    name: 'companion-trait',
    format: 'holo', // @trait {…} parses via the .holo composition parser
    goal: 'Tighten this trait while keeping its name, tags, and the on_attach emit identical.',
    source: [
      '@trait greet_companion {',
      '  mood: String = "friendly"',
      '  capability_tags: ["greeting", "companion"]',
      '  @on_attach => {',
      '    emit("greet_declared", { mood: mood })',
      '  }',
      '}',
    ].join('\n'),
    preserved: [/greet_companion/, /capability_tags/, /greeting/, /greet_declared/],
  },
  {
    name: 'patrol-statemachine',
    format: 'hsplus', // composition + @state_machine parses via the HSPlus parser
    goal: 'Add a fourth state reachable from "chasing" on "lost", keeping the original states and transitions.',
    source: [
      'composition "PatrolBot" {',
      '  state { entityId: "bot" mood: "alert" }',
      '  @state_machine {',
      '    initial: "idle"',
      '    states: {',
      '      idle: { seen: -> "chasing" }',
      '      chasing: { lost: -> "idle" }',
      '    }',
      '  }',
      '}',
    ].join('\n'),
    preserved: [/PatrolBot/, /\bidle\b/, /\bchasing\b/],
  },
  {
    name: 'mini-scene',
    format: 'holo',
    goal: 'Group the objects under a reusable template, keeping every object name and position.',
    source: [
      'composition "MiniScene" {',
      '  environment { skybox: "gradient" }',
      '  object "Cube" {',
      '    position: [0, 1, 0]',
      '  }',
      '  object "Light" {',
      '    position: [2, 4, 2]',
      '  }',
      '}',
    ].join('\n'),
    preserved: [/MiniScene/, /Cube/, /Light/],
  },
  // ── portfolio widening (2026-07-04): the original 3 seeds saturated the
  // accrual feeder (qwen3:4b converges to one dense candidate per constrained
  // seed → dedupRows rejects re-proposals → corpus froze at 14 rows). Six more
  // parse-clean seeds across the SAME surface classes (traits / state machines /
  // scenes) give the round-robin more distinct targets so novel gated rows keep
  // accruing. Each source was validated against its native parser via
  // `parsesClean` before landing. Appended AFTER index 2 so the positional
  // tests (CORPUS_PORTFOLIO[0]/[1]) stay green. ──
  {
    name: 'timer-trait',
    format: 'holo',
    goal: 'Tighten this trait while keeping its name, tags, and the on_attach emit identical.',
    source: [
      '@trait cooldown_timer {',
      '  duration: Number = 3',
      '  capability_tags: ["timer", "cooldown"]',
      '  @on_attach => {',
      '    emit("timer_started", { duration: duration })',
      '  }',
      '}',
    ].join('\n'),
    preserved: [/cooldown_timer/, /capability_tags/, /timer/, /timer_started/],
  },
  {
    name: 'health-trait',
    format: 'holo',
    goal: 'Tighten this trait while keeping its name, tags, and the on_attach emit identical.',
    source: [
      '@trait health_pool {',
      '  hp: Number = 100',
      '  capability_tags: ["health", "damageable"]',
      '  @on_attach => {',
      '    emit("health_ready", { hp: hp })',
      '  }',
      '}',
    ].join('\n'),
    preserved: [/health_pool/, /capability_tags/, /health/, /health_ready/],
  },
  {
    name: 'door-statemachine',
    format: 'hsplus',
    goal: 'Add a fifth state reachable from "open" on "jam", keeping the original states and transitions.',
    source: [
      'composition "SmartDoor" {',
      '  state { entityId: "door" status: "closed" }',
      '  @state_machine {',
      '    initial: "closed"',
      '    states: {',
      '      closed: { approach: -> "opening" }',
      '      opening: { done: -> "open" }',
      '      open: { leave: -> "closed" }',
      '    }',
      '  }',
      '}',
    ].join('\n'),
    preserved: [/SmartDoor/, /\bclosed\b/, /\bopening\b/, /\bopen\b/],
  },
  {
    name: 'trafficlight-statemachine',
    format: 'hsplus',
    goal: 'Add a flashing state reachable from "red" on "fault", keeping the original phases and transitions.',
    source: [
      'composition "TrafficLight" {',
      '  state { entityId: "light" phase: "red" }',
      '  @state_machine {',
      '    initial: "red"',
      '    states: {',
      '      red: { tick: -> "green" }',
      '      green: { tick: -> "yellow" }',
      '      yellow: { tick: -> "red" }',
      '    }',
      '  }',
      '}',
    ].join('\n'),
    preserved: [/TrafficLight/, /\bred\b/, /\bgreen\b/, /\byellow\b/],
  },
  {
    name: 'room-scene',
    format: 'holo',
    goal: 'Group the objects under a reusable template, keeping every object name and position.',
    source: [
      'composition "RoomScene" {',
      '  environment { skybox: "studio" }',
      '  object "Table" {',
      '    position: [0, 0, 0]',
      '  }',
      '  object "Chair" {',
      '    position: [1, 0, 0]',
      '  }',
      '  object "Lamp" {',
      '    position: [0, 2, 0]',
      '  }',
      '}',
    ].join('\n'),
    preserved: [/RoomScene/, /Table/, /Chair/, /Lamp/],
  },
  {
    name: 'garden-scene',
    format: 'holo',
    goal: 'Group the objects under a reusable template, keeping every object name and position.',
    source: [
      'composition "GardenScene" {',
      '  environment { skybox: "sky" }',
      '  object "Tree" {',
      '    position: [3, 0, 3]',
      '  }',
      '  object "Bench" {',
      '    position: [0, 0, 5]',
      '  }',
      '}',
    ].join('\n'),
    preserved: [/GardenScene/, /Tree/, /Bench/],
  },
];

/** Native parse — clean iff success AND zero errors (tolerant parse can flag
 *  success:true with errors). Never throws. */
export function parsesClean(src: string, format: SeedFormat): boolean {
  try {
    const r = format === 'holo' ? parseHolo(src) : parseHsPlus(src);
    return Boolean(r.success && r.ast) && (r.errors?.length ?? 0) === 0;
  } catch {
    return false;
  }
}

/** Gate = parse-clean AND every preserved construct present; fitness = length
 *  (lower = denser). The quality oracle for a seed's candidates. */
export function makeSeedGate(seed: EvolveSeed): Gate {
  return async (candidate) => ({
    passed: parsesClean(candidate, seed.format) && seed.preserved.every((re) => re.test(candidate)),
    score: candidate.length,
  });
}

export interface AccrueStepResult {
  /** The portfolio seed evolved this step. */
  target: string;
  /** Verifier-labeled REC-SHAPE rows (one per gated candidate) ready for the harvest. */
  rows: GradedTraceRow[];
  /** Full gated-evolution receipt, including proposer-error notes when a backend is down. */
  receipt: EvolveReceipt;
}

/**
 * Run ONE gated evolution step over a single portfolio seed (round-robin by
 * `tick` unless a `seed` is given) and return the graded REC-SHAPE rows — the
 * unit an autonomous idle loop calls per tick. `propose` is injected (the caller
 * wires the sovereign local-metal proposer); the loop here is bounded to a single
 * proposal so it never blocks the agent's task-claiming.
 */
export async function accrueOneStep(opts: {
  propose: Proposer;
  agentId: string;
  seed?: EvolveSeed;
  tick?: number;
  now?: () => string;
}): Promise<AccrueStepResult> {
  const seed =
    opts.seed ?? CORPUS_PORTFOLIO[(opts.tick ?? 0) % CORPUS_PORTFOLIO.length];
  const now = opts.now ?? (() => new Date().toISOString());
  const rows: GradedTraceRow[] = [];
  const { receipt } = await runEvolution(
    seed.source,
    { goal: seed.goal, generations: 1, population: 1, archiveSize: 4, proposerModel: 'sovereign-local' },
    {
      propose: opts.propose,
      gate: makeSeedGate(seed),
      onCandidate: (rec) =>
        rows.push(toGradedTraceRow(rec, { agentId: opts.agentId, ts: now(), source: `evolve-corpus:${seed.name}` })),
    },
  );
  return { target: seed.name, rows, receipt };
}

/**
 * Filter graded rows against an existing corpus for content uniqueness over TIME — the
 * cross-run dedup an autonomous accrual loop applies before persisting, so a fixed portfolio
 * re-run accrues only NEW candidates instead of piling up duplicates. Keyed on the candidate
 * program (`row.target`). Pure + browser-safe (no fs/crypto) — the caller owns the file IO
 * (e.g. the node AgentRunner reads/appends the corpus JSONL); this owns the dedup logic so it
 * is unit-testable without a filesystem.
 */
export function dedupRows(
  existingCorpus: string,
  rows: readonly GradedTraceRow[],
): { fresh: GradedTraceRow[]; deduped: number } {
  const seen = new Set<string>();
  for (const line of existingCorpus.split('\n')) {
    if (!line.trim()) continue;
    try {
      const prior = JSON.parse(line) as { target?: string };
      if (typeof prior.target === 'string') seen.add(prior.target);
    } catch {
      /* skip a malformed corpus line */
    }
  }
  const fresh: GradedTraceRow[] = [];
  let deduped = 0;
  for (const row of rows) {
    if (seen.has(row.target)) {
      deduped++;
      continue;
    }
    seen.add(row.target);
    fresh.push(row);
  }
  return { fresh, deduped };
}
