/**
 * Back-translation proof — generic situations driven by a behaviour's action
 * list (slice 2). No per-behaviour situation code: a BehaviourSpec names the
 * actions, their parameters and plausible ranges (plus "edge" values a person
 * would name, e.g. the limit itself), and the generator builds seeded random
 * schedules from it.
 *
 * Situation shape: one schedule entry per logical tick, actions and
 * observations interleaved, always ending with every observation action so the
 * final state is read through the behaviour's own answers.
 */
import {
  canonicalizeHeadlessValue,
  createDeterministicHsplusActionRuntime,
  parseHeadlessExperimentPlan,
} from '@holoscript/engine/runtime';
import { runTwinTest, type TwinTestResult } from '@holoscript/core/testing';
import { runHeadlessExperimentSources, type HeadlessExperimentSourceRun } from '../../headless-experiment';
import { behaviourSyndrome, type BehaviourSyndrome } from './pipeline';

export type ParamValue = string | number | boolean;

export type ParamSpec =
  | { type: 'int'; min: number; max: number; edges?: number[] }
  | { type: 'enum'; values: ParamValue[] };

export interface ActionSpec {
  name: string;
  kind: 'action' | 'observation';
  params: Record<string, ParamSpec>;
  /** Relative pick weight (default 1). */
  weight?: number;
}

export interface BehaviourSpec {
  id: string;
  title: string;
  publicStateKeys: string[];
  actions: ActionSpec[];
  minSteps?: number;
  maxSteps?: number;
}

export interface GenericStep {
  entrypoint: string;
  kind: 'action' | 'observation';
  args: Record<string, ParamValue>;
}

export interface GenericSituation {
  behaviourId: string;
  iteration: number;
  /** Every 4th situation is an edge situation: edge values always, longest run. */
  edge: boolean;
  steps: GenericStep[];
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickParam(spec: ParamSpec, rand: () => number, edge: boolean): ParamValue {
  if (spec.type === 'enum') return spec.values[Math.floor(rand() * spec.values.length)];
  const useEdge = spec.edges && spec.edges.length > 0 && (edge || rand() < 0.35);
  if (useEdge) return spec.edges![Math.floor(rand() * spec.edges!.length)];
  return spec.min + Math.floor(rand() * (spec.max - spec.min + 1));
}

export function generateGenericSituation(
  spec: BehaviourSpec,
  seed: number,
  iteration: number
): GenericSituation {
  const rand = mulberry32((seed ^ Math.imul(iteration + 1, 0x9e3779b1)) >>> 0);
  const edge = iteration % 4 === 0;
  const minSteps = spec.minSteps ?? 4;
  const maxSteps = spec.maxSteps ?? 14;
  const length = edge ? maxSteps : minSteps + Math.floor(rand() * (maxSteps - minSteps + 1));
  const actions = spec.actions.filter((a) => a.kind === 'action');
  const observations = spec.actions.filter((a) => a.kind === 'observation');
  const totalWeight = actions.reduce((sum, a) => sum + (a.weight ?? 1), 0);
  const pickAction = (): ActionSpec => {
    let r = rand() * totalWeight;
    for (const a of actions) {
      r -= a.weight ?? 1;
      if (r < 0) return a;
    }
    return actions[actions.length - 1];
  };
  const steps: GenericStep[] = [];
  let previous: ActionSpec | undefined;
  for (let k = 0; k < length; k++) {
    let chosen: ActionSpec;
    if (observations.length > 0 && rand() < 0.15) {
      chosen = observations[Math.floor(rand() * observations.length)];
    } else if (previous && previous.kind === 'action' && rand() < (edge ? 0.5 : 0.3)) {
      // Repeat the same action (fresh arguments) to push into limits.
      chosen = previous;
    } else {
      chosen = pickAction();
    }
    const args: Record<string, ParamValue> = {};
    for (const [name, p] of Object.entries(chosen.params)) args[name] = pickParam(p, rand, edge);
    steps.push({ entrypoint: chosen.name, kind: chosen.kind, args });
    previous = chosen;
  }
  for (const obs of observations) {
    const args: Record<string, ParamValue> = {};
    for (const [name, p] of Object.entries(obs.params)) args[name] = pickParam(p, rand, false);
    steps.push({ entrypoint: obs.name, kind: 'observation', args });
  }
  return { behaviourId: spec.id, iteration, edge, steps };
}

export function genericPlanRecords(
  spec: BehaviourSpec,
  situation: GenericSituation,
  finalPublicState: Record<string, unknown>
): unknown[] {
  let actionSeq = 0;
  const entries = situation.steps.map((step, order) => {
    const base = {
      kind: step.kind,
      order,
      tick: order,
      phase: step.kind === 'observation' ? 'observe' : 'act',
      entrypoint: step.entrypoint,
      scheduleEntryId: `${step.entrypoint}-${order}`,
      targetIds: [spec.id],
      args: step.args,
    };
    if (step.kind === 'observation') return base;
    actionSeq++;
    return {
      ...base,
      authorization: {
        sequence: actionSeq,
        nonce: `${spec.id}-nonce-${actionSeq}`,
        turnOpportunityId: `${spec.id}-turn-${actionSeq}`,
        safetyReceiptId: `${spec.id}-safety-${actionSeq}`,
        decisionReceiptId: `${spec.id}-decision-${actionSeq}`,
      },
    };
  });
  const manifest = {
    kind: 'manifest',
    schema: 'holoscript.headless-experiment-plan.v1',
    runId: `backtrans-${spec.id}-${situation.iteration}`,
    seed: `backtrans-${spec.id}-seed-${situation.iteration}`,
    clock: { startTick: 0, endTick: entries.length - 1, step: 1 },
    authorization: { required: true, startSequence: 1 },
    publicStateKeys: spec.publicStateKeys,
    expected: {
      scheduleCount: entries.length,
      observationCount: entries.filter((e) => e.kind === 'observation').length,
      actionCount: entries.filter((e) => e.kind === 'action').length,
      finalPublicState,
    },
  };
  return [manifest, ...entries];
}

export function genericPlanSource(records: unknown[]): string {
  const canonical = canonicalizeHeadlessValue(records as never);
  return `export function main(): string {\n  return ${JSON.stringify(canonical)}\n}\n`;
}

function projectKeys(state: Record<string, unknown>, keys: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of keys) out[k] = state[k] ?? null;
  return out;
}

/** Same behaviour-agnostic probe as slice 1, over the spec's public keys. */
export function probeGenericFinalState(
  spec: BehaviourSpec,
  behaviourSource: string,
  situation: GenericSituation
): Record<string, unknown> {
  const placeholder = genericPlanRecords(
    spec,
    situation,
    projectKeys({}, spec.publicStateKeys)
  );
  const plan = parseHeadlessExperimentPlan(placeholder);
  const runtime = createDeterministicHsplusActionRuntime(behaviourSource);
  let state: Record<string, unknown> = runtime.initialState;
  for (const entry of plan.schedule) state = runtime.invoke(entry).state;
  return projectKeys(state, spec.publicStateKeys);
}

/**
 * `action:outcome` names a program returns across one situation (slice 3
 * coverage: every outcome on the interface card must be reached by the
 * situations, or the measurement never exercised it).
 */
export function genericOutcomesSeen(
  spec: BehaviourSpec,
  behaviourSource: string,
  situation: GenericSituation
): string[] {
  const plan = parseHeadlessExperimentPlan(
    genericPlanRecords(spec, situation, projectKeys({}, spec.publicStateKeys))
  );
  const runtime = createDeterministicHsplusActionRuntime(behaviourSource);
  const seen: string[] = [];
  for (const entry of plan.schedule) {
    const result = runtime.invoke(entry);
    const value = result.value as { outcome?: unknown } | null;
    if (entry.kind === 'action' && value && typeof value.outcome === 'string') {
      seen.push(`${entry.entrypoint}:${value.outcome}`);
    }
  }
  return seen;
}

export async function runGenericSituation(
  worldSource: string,
  spec: BehaviourSpec,
  behaviourSource: string,
  situation: GenericSituation
): Promise<HeadlessExperimentSourceRun> {
  const finalPublicState = probeGenericFinalState(spec, behaviourSource, situation);
  return runHeadlessExperimentSources({
    worldSource,
    planSource: genericPlanSource(genericPlanRecords(spec, situation, finalPublicState)),
    behaviorSource: behaviourSource,
    observer: 'off',
  });
}

export function makeGenericRunner(worldSource: string, spec: BehaviourSpec) {
  const cache = new Map<string, Promise<HeadlessExperimentSourceRun>>();
  return (behaviourSource: string, situation: GenericSituation) => {
    const key = `${situation.iteration}\u0000${behaviourSource}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = runGenericSituation(worldSource, spec, behaviourSource, situation);
      cache.set(key, hit);
    }
    return hit;
  };
}

export const GENERIC_SEED = 0x5eed2;
export const GENERIC_SITUATIONS = 20;

export type Syndromer = (run: HeadlessExperimentSourceRun) => BehaviourSyndrome;

export async function twinGeneric(options: {
  spec: BehaviourSpec;
  name: string;
  run: (behaviourSource: string, situation: GenericSituation) => Promise<HeadlessExperimentSourceRun>;
  a: { name: string; source: string };
  b: { name: string; source: string };
  situations?: number;
  seed?: number;
  /** Override the oracle (used only by the blinding fault feed). */
  oracle?: Syndromer;
}): Promise<TwinTestResult<GenericSituation, HeadlessExperimentSourceRun, BehaviourSyndrome>> {
  return runTwinTest<GenericSituation, HeadlessExperimentSourceRun, BehaviourSyndrome>({
    name: options.name,
    implementations: {
      a: { name: options.a.name, run: (s) => options.run(options.a.source, s) },
      b: { name: options.b.name, run: (s) => options.run(options.b.source, s) },
    },
    generate: (seed, iteration) => generateGenericSituation(options.spec, seed, iteration),
    oracle: options.oracle ?? behaviourSyndrome,
    iterations: options.situations ?? GENERIC_SITUATIONS,
    seed: options.seed ?? GENERIC_SEED,
    perIterationTimeoutMs: 120_000,
  });
}
