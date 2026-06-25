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
  await runEvolution(
    seed.source,
    { goal: seed.goal, generations: 1, population: 1, archiveSize: 4, proposerModel: 'sovereign-local' },
    {
      propose: opts.propose,
      gate: makeSeedGate(seed),
      onCandidate: (rec) =>
        rows.push(toGradedTraceRow(rec, { agentId: opts.agentId, ts: now(), source: `evolve-corpus:${seed.name}` })),
    },
  );
  return { target: seed.name, rows };
}
