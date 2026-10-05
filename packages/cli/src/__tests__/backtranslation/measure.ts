/**
 * Back-translation proof — slice 2 metric.
 *
 * There is no trusted original in real use. B's rebuild stands for the intent;
 * the author's program may be faulty. So, per behaviour:
 *
 *   false alarms  situations where B diverges from the CORRECT original
 *   caught        a planted fault (mutant of the original) is caught when B
 *                 and the mutant disagree in a situation where B agrees with
 *                 the original — the disagreement is attributable to the fault
 *                 rather than to B's own misreading of the checklist
 *   oracle check  original vs mutant (kept as the sanity check from slice 1)
 */
import type { HeadlessExperimentSourceRun } from '../../headless-experiment';
import type {
  ClassifiedDivergence,
  DivergenceClass,
  IntentCatchOutcome,
  SourceMutant,
  TwinTestDivergence,
} from '@holoscript/core/testing';
import {
  generateGenericSituation,
  twinGeneric,
  type BehaviourSpec,
  type GenericSituation,
  type Syndromer,
} from './generic';
import { diffPaths, type BehaviourSyndrome } from './pipeline';

type Run = (behaviourSource: string, situation: GenericSituation) => Promise<HeadlessExperimentSourceRun>;
type Divergence = TwinTestDivergence<GenericSituation, HeadlessExperimentSourceRun, BehaviourSyndrome>;

export const CATCH_BAR = { minCatchRate: 0.6, targetCatchRate: 0.8 } as const;

/** A classification rule: applies when EVERY differing path matches one of the patterns. */
export interface ClassificationRule {
  classification: DivergenceClass;
  rationale: string;
  /**
   * Regex sources matched against diff paths such as
   * `$.observations[0].observation.tries_left`. A run that threw shows up as
   * the single path `$threw.a-threw` / `$threw.b-threw`.
   */
  pathPatterns: string[];
  /** For thrown runs: regex source the error message must match. */
  errorPattern?: string;
}

export interface BehaviourMeasurement {
  situations: number;
  edgeSituations: number;
  precheck: { originalRanAllSituations: boolean; situationsRun: number; failures: string[] };
  falseAlarmDivergences: Divergence[];
  mutants: IntentCatchOutcome[];
  planted: number;
  oracleVisible: number;
  caught: number;
  catchRate: number;
}

export function meetsCatchBar(m: Pick<BehaviourMeasurement, 'catchRate'>): boolean {
  return m.catchRate >= CATCH_BAR.minCatchRate;
}

export async function measureBehaviour(options: {
  spec: BehaviourSpec;
  run: Run;
  originalSource: string;
  rebuiltSource: string;
  mutants: SourceMutant[];
  situations: number;
  seed: number;
  oracle?: Syndromer;
}): Promise<BehaviourMeasurement> {
  const { spec, run, situations, seed } = options;
  // Liveness: identical errors on both sides count as agreement in runTwinTest,
  // so the original must really run in every situation.
  const failures: string[] = [];
  let edgeSituations = 0;
  for (let i = 0; i < situations; i++) {
    const situation = generateGenericSituation(spec, seed, i);
    if (situation.edge) edgeSituations++;
    try {
      await run(options.originalSource, situation);
    } catch (error) {
      failures.push(`situation ${i}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  const twin = (a: string, b: string, aName: string, bName: string) =>
    twinGeneric({
      spec,
      name: `${spec.id}:${aName}-vs-${bName}`,
      run,
      a: { name: aName, source: a },
      b: { name: bName, source: b },
      situations,
      seed,
      ...(options.oracle ? { oracle: options.oracle } : {}),
    });

  const ob = await twin(options.originalSource, options.rebuiltSource, 'original', 'rebuild');
  const obSet = new Set(ob.divergences.map((d) => d.iteration));

  const outcomes: IntentCatchOutcome[] = [];
  for (const mutant of options.mutants) {
    const om = await twin(options.originalSource, mutant.source, 'original', mutant.id);
    const bm = await twin(options.rebuiltSource, mutant.source, 'rebuild', mutant.id);
    const attributable = bm.divergences.filter((d) => !obSet.has(d.iteration)).length;
    outcomes.push({
      id: mutant.id,
      operator: mutant.operator,
      description: mutant.description,
      change: `line ${mutant.line}: ${JSON.stringify(mutant.before)} -> ${JSON.stringify(mutant.after)}`,
      inDecision: mutant.inDecision,
      situations: bm.iterationsRun,
      oracleDivergentSituations: om.divergences.length,
      rawDivergentSituations: bm.divergences.length,
      attributableDivergentSituations: attributable,
      caught: attributable > 0,
    });
  }
  const caught = outcomes.filter((m) => m.caught).length;
  return {
    situations,
    edgeSituations,
    precheck: {
      originalRanAllSituations: failures.length === 0,
      situationsRun: situations - failures.length,
      failures,
    },
    falseAlarmDivergences: ob.divergences,
    mutants: outcomes,
    planted: outcomes.length,
    oracleVisible: outcomes.filter((m) => m.oracleDivergentSituations > 0).length,
    caught,
    catchRate: outcomes.length === 0 ? 0 : caught / outcomes.length,
  };
}

/** Classify each false-alarm divergence by rules; unmatched ones stay 'unclassified'. */
export function classifyDivergences(
  divergences: Divergence[],
  rules: ClassificationRule[]
): Array<ClassifiedDivergence | (Omit<ClassifiedDivergence, 'classification'> & { classification: 'unclassified' })> {
  return divergences.map((d) => {
    const paths =
      d.reason === 'syndrome-mismatch'
        ? diffPaths(d.syndromeA, d.syndromeB, '$', [], 200).map((p) => p.split(':')[0])
        : [`$threw.${d.reason}`];
    const difference =
      d.reason === 'syndrome-mismatch'
        ? diffPaths(d.syndromeA, d.syndromeB, '$', [], 3).join('; ')
        : `${d.reason}: ${JSON.stringify(d.reason === 'b-threw' ? d.outputB : d.outputA).slice(0, 300)}`;
    const thrown =
      d.reason === 'a-threw' || d.reason === 'b-threw'
        ? JSON.stringify(d.reason === 'b-threw' ? d.outputB : d.outputA)
        : '';
    const rule = rules.find(
      (r) =>
        paths.every((p) => r.pathPatterns.some((pattern) => new RegExp(pattern).test(p))) &&
        (r.errorPattern === undefined || new RegExp(r.errorPattern).test(thrown))
    );
    return rule
      ? {
          iteration: d.iteration,
          reason: d.reason,
          difference,
          classification: rule.classification,
          rationale: rule.rationale,
        }
      : {
          iteration: d.iteration,
          reason: d.reason,
          difference,
          classification: 'unclassified' as const,
          rationale: `no rule covers: ${paths.join(', ')}`,
        };
  });
}

/** An oracle that sees nothing: every run looks the same. Used only to prove the metric can fail. */
export const BLIND_ORACLE: Syndromer = () => ({
  canonical: {},
  publicStates: [],
  observations: [],
  actions: [],
  schedule: [],
  counts: null,
});
