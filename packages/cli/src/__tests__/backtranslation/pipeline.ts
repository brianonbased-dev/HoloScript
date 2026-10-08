/**
 * Back-translation proof — pipeline for one model-village behaviour.
 *
 * Test-side module (proof harness, not shipped in the cli build). The twin
 * harness and back-translation helpers come from @holoscript/core/testing.
 *
 *   situations  seeded village schedules (residents, contributions, refusals)
 *   runner      runHeadlessExperimentSources over (world, plan, behaviour)
 *   oracle      behaviour-relevant ledger payloads, with every hash that is
 *               chained to the source bundle stripped out
 *   twin        core runTwinTest, original vs other
 *   rebuild     agent B (xAI) from checklist + language reference only
 */
import {
  canonicalizeHeadlessValue,
  createDeterministicHsplusActionRuntime,
  parseHeadlessExperimentPlan,
} from '@holoscript/engine/runtime';
import { validateCanonicalSource } from '@holoscript/core';
import { runHeadlessExperimentSources, type HeadlessExperimentSourceRun } from '../../headless-experiment';
import {
  extractFencedSource,
  runTwinTest,
  type ModelExchange,
  type TwinTestResult,
} from '@holoscript/core/testing';

// ── Situations ────────────────────────────────────────────────────────────

export type VillageStep =
  | { tick: number; kind: 'observe'; residentId: string }
  | { tick: number; kind: 'contribute'; amount: number }
  | { tick: number; kind: 'reject' };

export interface VillageSituation {
  iteration: number;
  residents: string[];
  steps: VillageStep[];
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

const AMOUNTS = [-1, 0, 1, 2, 3, 5] as const;

/** Deterministic situation for (seed, iteration). */
export function generateVillageSituation(seed: number, iteration: number): VillageSituation {
  const rand = mulberry32((seed ^ Math.imul(iteration + 1, 0x9e3779b1)) >>> 0);
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(rand() * items.length)];
  const pool = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  const residentCount = 1 + Math.floor(rand() * 3);
  const residents: string[] = [];
  while (residents.length < residentCount) {
    const n = pool.splice(Math.floor(rand() * pool.length), 1)[0];
    residents.push(`resident-${n}`);
  }
  const steps: VillageStep[] = residents.map((residentId) => ({
    tick: 0,
    kind: 'observe' as const,
    residentId,
  }));
  const actionTicks = 1 + Math.floor(rand() * 4);
  for (let tick = 1; tick <= actionTicks; tick++) {
    const perTick = 1 + Math.floor(rand() * 2);
    for (let k = 0; k < perTick; k++) {
      if (rand() < 0.7) steps.push({ tick, kind: 'contribute', amount: pick(AMOUNTS) });
      else steps.push({ tick, kind: 'reject' });
    }
  }
  if (rand() < 0.5) {
    const tick = actionTicks + 1;
    for (const residentId of residents) {
      if (rand() < 0.6 || residentId === residents[0]) {
        steps.push({ tick, kind: 'observe', residentId });
      }
    }
  }
  return { iteration, residents, steps };
}

// ── Plan (.hs) for a situation ────────────────────────────────────────────

const OBSERVATION_POLICY = {
  allowedRootKeys: ['resident_id', 'location', 'visible_event_ids', 'bounded_memory_hash'],
  forbiddenKeys: ['model_id', 'adapter', 'provider', 'condition', 'system_prompt', 'private_memory'],
  forbiddenValues: ['fixture-private-adapter'],
  subjectBinding: { argumentKey: 'residentId', observationKey: 'resident_id', targetCardinality: 1 },
};

export function situationPlanRecords(
  situation: VillageSituation,
  finalPublicState: Record<string, unknown>
): unknown[] {
  const endTick = situation.steps[situation.steps.length - 1].tick;
  let actionSeq = 0;
  const entries = situation.steps.map((step, order) => {
    if (step.kind === 'observe') {
      return {
        kind: 'observation',
        order,
        tick: step.tick,
        phase: 'observe',
        entrypoint: 'observe',
        scheduleEntryId: `observe-${step.residentId}-t${step.tick}`,
        barrierId: `commons-observation-${step.tick}`,
        targetIds: [step.residentId],
        args: { residentId: step.residentId },
      };
    }
    actionSeq++;
    const authorization = {
      sequence: actionSeq,
      nonce: `village-nonce-${actionSeq}`,
      turnOpportunityId: `village-turn-${actionSeq}`,
      safetyReceiptId: `village-safety-${actionSeq}`,
      decisionReceiptId: `village-decision-${actionSeq}`,
    };
    return step.kind === 'contribute'
      ? {
          kind: 'action',
          order,
          tick: step.tick,
          phase: 'act',
          entrypoint: 'contribute',
          scheduleEntryId: `contribute-${actionSeq}`,
          targetIds: ['cistern'],
          args: { amount: step.amount },
          authorization,
        }
      : {
          kind: 'action',
          order,
          tick: step.tick,
          phase: 'act',
          entrypoint: 'reject',
          scheduleEntryId: `reject-${actionSeq}`,
          targetIds: ['external-valve'],
          args: {},
          authorization,
        };
  });
  const manifest = {
    kind: 'manifest',
    schema: 'holoscript.headless-experiment-plan.v1',
    runId: `backtrans-village-${situation.iteration}`,
    seed: `backtrans-village-seed-${situation.iteration}`,
    clock: { startTick: 0, endTick, step: 1 },
    authorization: { required: true, startSequence: 1 },
    publicStateKeys: ['water'],
    observationPolicy: OBSERVATION_POLICY,
    expected: {
      scheduleCount: entries.length,
      observationCount: entries.filter((e) => e.kind === 'observation').length,
      actionCount: entries.filter((e) => e.kind === 'action').length,
      finalPublicState,
    },
  };
  return [manifest, ...entries];
}

/** Wrap plan records in a `.hs` program whose `main()` returns them as JSON. */
export function planSourceFor(records: unknown[]): string {
  // The plan kernel requires canonical JSON (sorted keys) in main()'s result.
  const canonical = canonicalizeHeadlessValue(records as never);
  return `export function main(): string {\n  return ${JSON.stringify(canonical)}\n}\n`;
}

/**
 * Behaviour-agnostic probe: replay the schedule through the behaviour runtime
 * to learn the final public state the plan must declare. The plan contract
 * requires `expected.finalPublicState`; filling it from the behaviour under
 * test keeps the situation generator free of any knowledge of the behaviour.
 * Divergence is then judged by the oracle, not by a plan assertion.
 */
export function probeFinalPublicState(
  behaviourSource: string,
  situation: VillageSituation
): Record<string, unknown> {
  const placeholder = situationPlanRecords(situation, { water: 0 });
  const plan = parseHeadlessExperimentPlan(placeholder);
  const runtime = createDeterministicHsplusActionRuntime(behaviourSource);
  let state: Record<string, unknown> = runtime.initialState;
  for (const entry of plan.schedule) {
    state = runtime.invoke(entry).state;
  }
  return { water: (state as Record<string, unknown>).water ?? null };
}

export async function runBehaviourInSituation(
  worldSource: string,
  behaviourSource: string,
  situation: VillageSituation
): Promise<HeadlessExperimentSourceRun> {
  const finalPublicState = probeFinalPublicState(behaviourSource, situation);
  const planSource = planSourceFor(situationPlanRecords(situation, finalPublicState));
  return runHeadlessExperimentSources({
    worldSource,
    planSource,
    behaviorSource: behaviourSource,
    observer: 'off',
  });
}

// ── Oracle ────────────────────────────────────────────────────────────────

export const ORACLE_FIELDS = [
  'canonicalFields.canonicalSceneHash',
  'canonicalFields.canonicalPoseHash',
  'canonicalFields.logicalClockHash',
  'canonicalFields.publicStateHash',
  'canonicalFields.residentObservationHash',
  'publicStateSnapshots[].payload',
  'observationLedger[].payload',
  'actionLedger[].payload (minus rollbackReference.priorActionRoot)',
  'scheduleLedger[].payload (minus outcomeHashes)',
  'terminal.actualCounts',
];

export const EXCLUDED_FIELDS = [
  { field: 'sourceBundleHash', why: 'hash of the source text itself; differs for any two files' },
  {
    field: 'canonicalFields.actionReceiptRoot',
    why: 'chained ledger root seeded with sourceBundleHash (ledgerGenesis/appendLedger), so it differs whenever the source text differs',
  },
  {
    field: 'canonicalFields.executedScheduleHash',
    why: 'schedule payloads carry outcomeHashes, which are chained roots seeded with sourceBundleHash',
  },
  {
    field: 'actionLedger[].payload.rollbackReference.priorActionRoot',
    why: 'chained action root, seeded with sourceBundleHash',
  },
  {
    field: 'terminal.* roots, terminalCommitment, entryHash/previousHash',
    why: 'all chained over sourceBundleHash and the manifest (which carries the probed final state)',
  },
  {
    field: 'sourceRunReceipt (engine provenance, plan bytecode hash)',
    why: 'identity of the plan program text, not behaviour',
  },
];

export interface BehaviourSyndrome {
  canonical: Record<string, string>;
  publicStates: unknown[];
  observations: unknown[];
  actions: unknown[];
  schedule: unknown[];
  counts: unknown;
}

export function behaviourSyndrome(run: HeadlessExperimentSourceRun): BehaviourSyndrome {
  const r = run.execution;
  const c = r.canonicalFields;
  return {
    canonical: {
      canonicalSceneHash: c.canonicalSceneHash,
      canonicalPoseHash: c.canonicalPoseHash,
      logicalClockHash: c.logicalClockHash,
      publicStateHash: c.publicStateHash,
      residentObservationHash: c.residentObservationHash,
    },
    publicStates: r.publicStateSnapshots.map((e) => e.payload),
    observations: r.observationLedger.map((e) => e.payload),
    actions: r.actionLedger.map((e) => {
      const { rollbackReference, ...rest } = e.payload as unknown as Record<string, unknown> & {
        rollbackReference: Record<string, unknown>;
      };
      const { priorActionRoot: _ignored, ...rollback } = rollbackReference;
      return { ...rest, rollbackReference: rollback };
    }),
    schedule: r.scheduleLedger.map((e) => {
      const { outcomeHashes: _ignored, ...rest } = e.payload as unknown as Record<string, unknown>;
      return rest;
    }),
    counts: r.terminal.actualCounts,
  };
}

/** First few differing JSON paths between two values (for plain reporting). */
export function diffPaths(a: unknown, b: unknown, path = '$', out: string[] = [], max = 6): string[] {
  if (out.length >= max) return out;
  // A key present on one side only: canonicalize rejects undefined, so report it directly.
  if (a === undefined || b === undefined) {
    if (a !== b) out.push(`${path}: ${JSON.stringify(a) ?? 'missing'} vs ${JSON.stringify(b) ?? 'missing'}`);
    return out;
  }
  if (canonicalizeHeadlessValue(a as never) === canonicalizeHeadlessValue(b as never)) return out;
  if (a && b && typeof a === 'object' && typeof b === 'object' && !Array.isArray(a) === !Array.isArray(b)) {
    const keys = Array.isArray(a)
      ? Array.from({ length: Math.max(a.length, (b as unknown[]).length) }, (_, i) => String(i))
      : [...new Set([...Object.keys(a), ...Object.keys(b as object)])].sort();
    for (const k of keys) {
      diffPaths(
        (a as Record<string, unknown>)[k],
        (b as Record<string, unknown>)[k],
        Array.isArray(a) ? `${path}[${k}]` : `${path}.${k}`,
        out,
        max
      );
      if (out.length >= max) break;
    }
    return out;
  }
  out.push(`${path}: ${JSON.stringify(a)} vs ${JSON.stringify(b)}`);
  return out;
}

// ── Twin ──────────────────────────────────────────────────────────────────

export const TWIN_SEED = 0xb4c7a1;
export const TWIN_SITUATIONS = 20;

export function makeCachedRunner(worldSource: string) {
  const cache = new Map<string, Promise<HeadlessExperimentSourceRun>>();
  return (behaviourSource: string, situation: VillageSituation) => {
    const key = `${situation.iteration}\u0000${behaviourSource}`;
    let hit = cache.get(key);
    if (!hit) {
      hit = runBehaviourInSituation(worldSource, behaviourSource, situation);
      // Keep rejected promises in the cache too: a failure is a deterministic result.
      cache.set(key, hit);
    }
    return hit;
  };
}

export async function twinBehaviours(options: {
  name: string;
  run: (behaviourSource: string, situation: VillageSituation) => Promise<HeadlessExperimentSourceRun>;
  a: { name: string; source: string };
  b: { name: string; source: string };
  situations?: number;
  seed?: number;
}): Promise<TwinTestResult<VillageSituation, HeadlessExperimentSourceRun, BehaviourSyndrome>> {
  return runTwinTest<VillageSituation, HeadlessExperimentSourceRun, BehaviourSyndrome>({
    name: options.name,
    implementations: {
      a: { name: options.a.name, run: (s) => options.run(options.a.source, s) },
      b: { name: options.b.name, run: (s) => options.run(options.b.source, s) },
    },
    generate: (seed, iteration) => generateVillageSituation(seed, iteration),
    oracle: behaviourSyndrome,
    iterations: options.situations ?? TWIN_SITUATIONS,
    seed: options.seed ?? TWIN_SEED,
    perIterationTimeoutMs: 120_000,
  });
}

// ── Agent B rebuild ───────────────────────────────────────────────────────

export interface CompletionFn {
  (system: string, user: string): Promise<{
    content: string;
    model: string;
    reportedModel: string | null;
    usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  }>;
}

export function validateBehaviourSource(source: string): { valid: boolean; errors: string[] } {
  const result = validateCanonicalSource({ source, fileName: 'rebuilt.hsplus' });
  return {
    valid: result.valid,
    errors: result.errors.map(
      (d) => `line ${d.line ?? '?'}:${d.column ?? '?'} ${d.code ?? ''} ${d.message}`.trim()
    ),
  };
}

/**
 * Slice 2 checker: the language checker PLUS admission by the deterministic
 * headless runtime (the subset the twin test executes). Admission is static —
 * it runs when the runtime is constructed, before any action is invoked — so
 * its errors are checker errors, not behaviour feedback. Slice 1 showed the
 * gap: `validate` accepts `var x = ...` and bare local assignments that the
 * headless subset rejects.
 */
export function checkBehaviourSource(source: string): { valid: boolean; errors: string[] } {
  const v = validateBehaviourSource(source);
  const errors = [...v.errors];
  try {
    createDeterministicHsplusActionRuntime(source);
  } catch (error) {
    errors.push(`headless runtime: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { valid: errors.length === 0, errors };
}

const OUTCOME_DECLARATION_HEADER =
  /^([ \t]*action [A-Za-z_$][\w$]*\([^)\n]*\))((?:[ \t]+(?:accepted|refused)\([^)\n]*\))+)([ \t]*\{)/gm;

/**
 * The program with the outcome lists taken off its action headers
 * (`action rent(count) accepted(rented) refused(over_limit) {` becomes
 * `action rent(count) {`). Only header lines change, so line numbers, mutation
 * sites and mutant ids are the same as in the declaring program.
 *
 * Planted faults are made from this copy. The proof measures whether a rebuild
 * shows a fault in what the program DOES, exactly as slices 1-3 recorded. A
 * fault that contradicts the program's own declaration (a refusal flipped to
 * allowed: true) never reaches a rebuild in real use — the checker refuses it
 * first — so those are counted separately (faultsTheCheckerRefuses).
 */
export function withoutOutcomeDeclarations(source: string): string {
  return source.replace(OUTCOME_DECLARATION_HEADER, '$1$3');
}

/**
 * Of the given planted faults (made from withoutOutcomeDeclarations(source)),
 * the ids the checker refuses when the same change is made to the declaring
 * program. `declaredFaults` are the same faults made from the declaring
 * program (same ids).
 */
export function faultsTheCheckerRefuses(
  planted: ReadonlyArray<{ id: string; source: string }>,
  declaredFaults: ReadonlyArray<{ id: string; source: string }>
): string[] {
  const refused: string[] = [];
  for (const fault of planted) {
    const declared = declaredFaults.find((d) => d.id === fault.id);
    if (!declared) throw new Error(`no declaring-program counterpart for fault ${fault.id}`);
    if (withoutOutcomeDeclarations(declared.source) !== fault.source) {
      throw new Error(`fault ${fault.id} differs from its declaring-program counterpart beyond the headers`);
    }
    if (!checkBehaviourSource(declared.source).valid) refused.push(fault.id);
  }
  return refused;
}

export const REBUILD_SYSTEM_PROMPT =
  'You write HoloScript+ (.hsplus) behaviour files. You are given a plain-language checklist of ' +
  'what one behaviour does and a language reference card. Write the behaviour file that does ' +
  'exactly what the checklist says, nothing more. Follow the reference card syntax exactly. ' +
  'Reply with the complete file in ONE fenced code block marked hsplus, and nothing else.';

/** Slice 2: B also gets an interface card (names only) next to the checklist (rules only). */
export const REBUILD_SYSTEM_PROMPT_V2 =
  'You write HoloScript+ (.hsplus) behaviour files. You are given three things: a language ' +
  'reference card (syntax), an interface card (the exact names to use: behaviour name, state ' +
  'fields, actions and their inputs, outcome names, answer fields, event names and their fields), ' +
  'and a plain-language checklist of the rules the behaviour follows. Use the names from the ' +
  'interface card exactly. Do exactly what the checklist says, nothing more. You may add private ' +
  'state fields of your own if the rules need them. Follow the reference card syntax exactly. ' +
  'Reply with the complete file in ONE fenced code block marked hsplus, and nothing else.';

export function rebuildUserPrompt(
  checklistText: string,
  referenceCard: string,
  interfaceCard?: string
): string {
  return [
    '## Language reference card',
    '',
    referenceCard.trim(),
    '',
    ...(interfaceCard === undefined
      ? []
      : ['## Interface card (names to use)', '', interfaceCard.trim(), '']),
    interfaceCard === undefined ? '## Checklist (the behaviour to write)' : '## Checklist (the rules)',
    '',
    checklistText,
    '',
    'Write the .hsplus file now.',
  ].join('\n');
}

export function repairUserPrompt(
  checklistText: string,
  referenceCard: string,
  previousSource: string,
  errors: string[],
  interfaceCard?: string
): string {
  return [
    rebuildUserPrompt(checklistText, referenceCard, interfaceCard),
    '',
    '## Your previous attempt',
    '',
    '```hsplus',
    previousSource.trimEnd(),
    '```',
    '',
    '## The language checker rejected it with these errors',
    '',
    ...errors.map((e) => `- ${e}`),
    '',
    'Fix the file. Reply with the complete corrected file in ONE fenced hsplus code block.',
  ].join('\n');
}

export async function rebuildFromChecklist(options: {
  checklistText: string;
  referenceCard: string;
  interfaceCard?: string;
  complete: CompletionFn;
  provider: string;
  maxRepairs?: number;
  /** Defaults to the language checker alone (slice 1). */
  checker?: (source: string) => { valid: boolean; errors: string[] };
}): Promise<{ exchanges: ModelExchange[]; source: string; validated: boolean }> {
  const checker = options.checker ?? validateBehaviourSource;
  const maxRepairs = options.maxRepairs ?? 3;
  const system =
    options.interfaceCard === undefined ? REBUILD_SYSTEM_PROMPT : REBUILD_SYSTEM_PROMPT_V2;
  const exchanges: ModelExchange[] = [];
  let user = rebuildUserPrompt(options.checklistText, options.referenceCard, options.interfaceCard);
  for (let round = 1; round <= 1 + maxRepairs; round++) {
    const reply = await options.complete(system, user);
    const source = extractFencedSource(reply.content);
    const validation = checker(source);
    exchanges.push({
      round,
      kind: round === 1 ? 'rebuild' : 'repair',
      provider: options.provider,
      model: reply.model,
      reportedModel: reply.reportedModel,
      prompt: { system, user },
      response: reply.content,
      extractedSource: source,
      validation,
      usage: reply.usage,
      at: new Date().toISOString(),
    });
    if (validation.valid) return { exchanges, source, validated: true };
    user = repairUserPrompt(
      options.checklistText,
      options.referenceCard,
      source,
      validation.errors,
      options.interfaceCard
    );
  }
  return { exchanges, source: exchanges[exchanges.length - 1].extractedSource, validated: false };
}
