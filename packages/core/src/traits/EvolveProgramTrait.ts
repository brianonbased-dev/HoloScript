/**
 * @evolve_program — runtime handler for the gated-evolution trait.
 *
 * The native authoring surface (`evolve_program.hsplus`) declares the evolution
 * POLICY as data; this handler is the ECS runtime contract that records the
 * policy on the node and announces it. The actual gated search is executed by
 * {@link EvolveProgramBackend} (the trait's backend, mirroring how
 * {@link GenerativeDensifierBackend} backs `@provenance_densify`).
 *
 * Doctrine encoded here: the loop PROPOSES and never self-ships (`selfShips:
 * false`), and is always verifier-gated (`gated: true`). Per-instance state lives
 * on `node.__evolveProgram` (created onAttach, deleted onDetach) — never class
 * fields or module-level vars (F.126 native authoring).
 *
 * @package @holoscript/core/traits
 */
import type { TraitHandler } from './TraitTypes';

/** Runtime config for `@evolve_program` (camelCase mirror of the .hsplus props). */
export interface EvolveProgramConfig {
  /** What to evolve — a path/handle the backend resolves. */
  target: string;
  /** Natural-language objective handed to the proposer each generation. */
  goal: string;
  /** EXISTING gate command used as the correctness + fitness oracle (lower-is-better). */
  fitnessGate: string;
  /** Sovereign proposer model on local metal (never a blacklisted qwen2.5, W.738). */
  proposerModel?: string;
  /** Bounded search depth — the compute guardrail. */
  generations?: number;
  /** Candidates proposed per generation. */
  population?: number;
  /** Darwin-archive size (diverse parents to escape local optima). */
  archiveSize?: number;
}

export const evolveProgramHandler: TraitHandler<EvolveProgramConfig> = {
  name: 'evolve_program',
  defaultConfig: {
    target: '',
    goal: '',
    fitnessGate: '',
    proposerModel: 'brittney-edge:v0-4',
    generations: 8,
    population: 4,
    archiveSize: 8,
  },
  onAttach(node, config, context) {
    node.__evolveProgram = {
      target: config.target,
      goal: config.goal,
      fitnessGate: config.fitnessGate,
      proposerModel: config.proposerModel ?? 'brittney-edge:v0-4',
      generations: config.generations ?? 8,
      population: config.population ?? 4,
      archiveSize: config.archiveSize ?? 8,
    };
    // The two invariants the trait guarantees: always gated, never self-ships.
    context.emit?.('evolve_program_declared', {
      node,
      policy: node.__evolveProgram,
      gated: true,
      selfShips: false,
    });
  },
  onDetach(node, _config, context) {
    delete node.__evolveProgram;
    context.emit?.('evolve_program_detached', { node });
  },
};
