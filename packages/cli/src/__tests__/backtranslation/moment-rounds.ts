/**
 * Picture rounds ("one moment per question") for the founder — board task
 * task_1791235614927_x7l2, after round 1 of the text layout came back 10/10
 * "Not sure" and he called it "a multi-choice math test".
 *
 * Each question is ONE moment of a heating/cooling system: the full state
 * (mode, setting, room, swing, fan, compressor timer, what was running, and for
 * a heat pump the outdoor temperature, backup strips and cut-off) where two
 * versions of the program do different things. He first picks what SHOULD
 * happen from 2 to 4 picture buttons, and only then sees what version A and
 * version B did, each marked "Matches you" or "Does not match you".
 *
 * Colour rules (his trade's conventions, non-negotiable): blue means cooling,
 * red/orange means heating, grey means off; everything else is neutral. The
 * round therefore carries a tone ONLY on the mode badge and on choices, each
 * derived from meaning, and never on a dial. momentRoundProblems() refuses a
 * round that breaks this, and the dashboard refuses it again.
 *
 * The correct version is always the author program written from his rules.
 * The answer key is sealed (salted, hashed into the round) with the same
 * helpers as the text rounds in which-is-right.ts.
 */
import { randomBytes } from 'node:crypto';
import { createDeterministicHsplusActionRuntime } from '@holoscript/engine/runtime';
import { GENERIC_SEED, generateGenericSituation, type BehaviourSpec, type GenericStep } from './generic';
import { HVAC_TARGETS, loadNamedMutants, loadRecordings, slice3Inputs, type Slice3Target } from './slice3';
import { keyFileBytes, sha256, type SealableRound } from './which-is-right';

// ---------------------------------------------------------------------------
// Choices and colours
// ---------------------------------------------------------------------------

export type ChoiceId = 'heat' | 'cool' | 'backup' | 'off' | 'fan';
export type Tone = 'heat' | 'cool' | 'off' | 'neutral';

/** Order on screen, labels, icons and the ONLY tone each may carry. */
export const CHOICES: Record<ChoiceId, { label: string; icon: string; tone: Tone }> = {
  heat: { label: 'Heat on', icon: 'flame', tone: 'heat' },
  cool: { label: 'Cool on', icon: 'snowflake', tone: 'cool' },
  backup: { label: 'Backup heat on', icon: 'strips', tone: 'heat' },
  off: { label: 'Stays off / waiting', icon: 'power', tone: 'off' },
  fan: { label: 'Fan only', icon: 'fan', tone: 'off' },
};
export const CHOICE_ORDER: ChoiceId[] = ['heat', 'cool', 'backup', 'off', 'fan'];

export const MODE_BADGE: Record<string, { word: string; tone: Tone }> = {
  heat: { word: 'Heat', tone: 'heat' },
  cool: { word: 'Cool', tone: 'cool' },
  auto: { word: 'Auto', tone: 'neutral' },
  off: { word: 'Off', tone: 'off' },
};

export const MAX_QUESTIONS = 5;

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface MomentQuestion {
  type: 'moment';
  n: number;
  title: string;
  mode: { label: string; word: string; tone: Tone };
  /** Neutral dials: label + number only. A dial never carries a tone or colour. */
  dials: Array<{ label: string; value: number }>;
  /** Every setting in words, each with a neutral icon. */
  facts: Array<{ icon: string; text: string }>;
  prompt: string;
  choices: Array<{ id: ChoiceId; label: string; icon: string; tone: Tone }>;
  a: { choice: ChoiceId };
  b: { choice: ChoiceId };
}

export interface MomentRound extends SealableRound {
  schema: 'which-is-right.moment-round.v1';
  questions: MomentQuestion[];
}

export type MomentClass = 'planted-fault' | 'rebuild-disagreement';

export interface MomentKeyQuestion {
  n: number;
  class: MomentClass;
  behaviourId: string;
  otherVersion: string;
  correctSide: 'A' | 'B';
  correctChoice: ChoiceId;
  otherChoice: ChoiceId;
  shown: { A: string; B: string };
  why: string;
  situation: { seed: number; iteration: number; step: number };
}

export interface MomentKey {
  schema: 'which-is-right.moment-key.v1';
  roundId: string;
  createdAt: string;
  salt: string;
  seed: number;
  questions: MomentKeyQuestion[];
}

// ---------------------------------------------------------------------------
// Running a version up to a moment
// ---------------------------------------------------------------------------

type State = Record<string, unknown>;

interface StepResult {
  value: Record<string, unknown> | null;
  state: State;
  threw: boolean;
}

function runSteps(source: string, steps: GenericStep[]): { results: StepResult[]; runtime: ReturnType<typeof createDeterministicHsplusActionRuntime> } {
  const runtime = createDeterministicHsplusActionRuntime(source);
  let state = runtime.initialState as State;
  const results: StepResult[] = [];
  steps.forEach((step, order) => {
    try {
      const r = runtime.invoke({
        kind: step.kind,
        entrypoint: step.entrypoint,
        args: step.args,
        scheduleEntryId: `${step.entrypoint}-${order}`,
        order,
        tick: order,
      } as never) as { value: unknown; state: State };
      state = r.state;
      results.push({ value: (r.value ?? null) as Record<string, unknown> | null, state, threw: false });
    } catch {
      results.push({ value: null, state, threw: true });
    }
  });
  return { results, runtime };
}

/** What the picture should show after a reading: one choice, from the card's own answers. */
export function choiceAfter(source: string, steps: GenericStep[]): ChoiceId | null {
  const { results, runtime } = runSteps(source, steps);
  const last = results[results.length - 1];
  if (!last || last.threw || !last.value || last.value.allowed !== true) return null;
  const outcome = String(last.value.outcome);
  if (outcome === 'backup_heating') return 'backup';
  if (outcome === 'heating') return 'heat';
  if (outcome === 'cooling') return 'cool';
  let fanRunning = false;
  try {
    const s = runtime.invoke({
      kind: 'observation',
      entrypoint: 'status',
      args: { viewerId: 'owner' },
      scheduleEntryId: 'status-final',
      order: steps.length,
      tick: steps.length,
    } as never) as { value: { fan_running?: unknown } };
    fanRunning = s.value?.fan_running === true;
  } catch {
    return null;
  }
  return fanRunning ? 'fan' : 'off';
}

function pick(state: State, keys: string[]): State {
  return Object.fromEntries(keys.map((k) => [k, state[k]]));
}

// ---------------------------------------------------------------------------
// Rendering a moment
// ---------------------------------------------------------------------------

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function renderMoment(
  behaviourId: string,
  title: string,
  prior: State,
  reading: Record<string, unknown>
): Omit<MomentQuestion, 'n' | 'choices' | 'a' | 'b'> {
  const heatPump = behaviourId === 'heat-pump';
  const mode = MODE_BADGE[String(prior.mode)] ?? { word: String(prior.mode), tone: 'neutral' as Tone };
  const compressorRunning = heatPump ? prior.heating === true || prior.cooling === true : prior.cooling === true;
  const since = Number(prior.minutesSinceCompressorStopped) + Number(reading.minutes);
  const timer = compressorRunning
    ? 'Compressor: running'
    : since >= 30
      ? 'Compressor stopped more than 30 minutes ago'
      : `Compressor stopped ${plural(since, 'minute', 'minutes')} ago`;
  const running: string[] = [];
  if (prior.heating === true) running.push(heatPump ? 'heat pump heating' : 'furnace heating');
  if (prior.backupHeating === true) running.push('backup heat');
  if (prior.cooling === true) running.push('cooling');
  const dials = [
    { label: 'Room', value: Number(reading.room) },
    { label: 'Set to', value: Number(prior.setPoint) },
  ];
  const facts: Array<{ icon: string; text: string }> = [
    { icon: 'mode', text: `Mode: ${mode.word}` },
    { icon: 'fan', text: `Fan: ${prior.fan === 'on' ? 'On' : 'Auto'}` },
    { icon: 'clock', text: timer },
    { icon: 'swing', text: `Swing: ${plural(Number(prior.swing), 'degree', 'degrees')}` },
    { icon: 'running', text: `Running just before: ${running.length ? running.join(' and ') : 'nothing'}` },
  ];
  if (heatPump) {
    dials.push({ label: 'Outdoors', value: Number(reading.outdoor) });
    facts.push(
      { icon: 'outdoor', text: `Outdoors: ${plural(Number(reading.outdoor), 'degree', 'degrees')}` },
      {
        icon: 'strips',
        text:
          prior.backup === 'none'
            ? 'Backup heat strips: none fitted'
            : `Backup heat strips: fitted, switched ${prior.backup === 'on' ? 'on' : 'off'}`,
      },
      { icon: 'cutoff', text: `Outdoor cut-off: ${plural(Number(prior.cutoff), 'degree', 'degrees')}` }
    );
  }
  return {
    type: 'moment',
    title,
    mode: { label: `Mode: ${mode.word}`, word: mode.word, tone: mode.tone },
    dials,
    facts,
    prompt: 'What should happen now?',
  };
}

/** The choices that make sense for the moment, always including both versions' results; 2 to 4. */
export function offeredChoices(behaviourId: string, prior: State, a: ChoiceId, b: ChoiceId): ChoiceId[] {
  const heatPump = behaviourId === 'heat-pump';
  const strips = heatPump && prior.backup === 'on';
  const base: Record<string, ChoiceId[]> = {
    heat: ['heat', ...(strips ? (['backup'] as ChoiceId[]) : []), 'off', 'fan'],
    cool: ['cool', 'off', 'fan'],
    auto: ['heat', 'cool', ...(strips ? (['backup'] as ChoiceId[]) : []), 'off', 'fan'],
    off: ['off', 'fan'],
  };
  const set = new Set<ChoiceId>([...(base[String(prior.mode)] ?? ['off', 'fan']), a, b]);
  // Too many: drop base extras that neither version did, least related first.
  for (const extra of ['fan', 'backup', 'cool', 'heat', 'off'] as ChoiceId[]) {
    if (set.size <= 4) break;
    if (extra !== a && extra !== b) set.delete(extra);
  }
  return CHOICE_ORDER.filter((c) => set.has(c));
}

// ---------------------------------------------------------------------------
// Finding moments
// ---------------------------------------------------------------------------

export interface MomentCandidate {
  class: MomentClass;
  behaviourId: string;
  title: string;
  otherVersion: string;
  why: string;
  iteration: number;
  step: number;
  prior: State;
  reading: Record<string, unknown>;
  correctChoice: ChoiceId;
  otherChoice: ChoiceId;
  /** Lower is simpler to read: settings left at their usual values. */
  busyness: number;
}

function busyness(behaviourId: string, prior: State, reading: Record<string, unknown>): number {
  let n = 0;
  if (prior.swing !== 1) n++;
  if (prior.fan !== 'auto') n++;
  if (prior.mode === 'auto') n++;
  if (prior.heating === true || prior.cooling === true) n++;
  if (Number(prior.minutesSinceCompressorStopped) + Number(reading.minutes) < 30) n++;
  if (behaviourId === 'heat-pump') {
    if (prior.backup !== 'on') n++;
    if (prior.cutoff !== 25) n++;
  }
  return n;
}

/**
 * First moment (per situation) where the two versions show different pictures.
 * The moment must be a reading both versions accept, after identical earlier
 * behaviour (same answers and same visible state), and from a prior state the
 * screen can describe fully: nothing waiting, no call for heat or cooling
 * hidden behind a waiting compressor, and backup strips not already running
 * (his rule for strips going off was not part of his corrections).
 */
export function findMoments(options: {
  target: Slice3Target;
  spec: BehaviourSpec;
  title: string;
  correctSource: string;
  otherSource: string;
  iterations: number;
  base: Omit<MomentCandidate, 'iteration' | 'step' | 'prior' | 'reading' | 'correctChoice' | 'otherChoice' | 'busyness'>;
}): MomentCandidate[] {
  const keys = options.spec.publicStateKeys;
  const out: MomentCandidate[] = [];
  for (let i = 0; i < options.iterations; i++) {
    const situation = generateGenericSituation(options.spec, GENERIC_SEED, i);
    const A = runSteps(options.correctSource, situation.steps).results;
    const B = runSteps(options.otherSource, situation.steps).results;
    for (let k = 0; k < situation.steps.length; k++) {
      const same =
        !A[k].threw &&
        !B[k].threw &&
        JSON.stringify(A[k].value) === JSON.stringify(B[k].value) &&
        JSON.stringify(pick(A[k].state, keys)) === JSON.stringify(pick(B[k].state, keys));
      const step = situation.steps[k];
      if (same && step.entrypoint !== 'reading') continue;
      if (step.entrypoint === 'reading' && k > 0) {
        const steps = situation.steps.slice(0, k + 1);
        const ca = choiceAfter(options.correctSource, steps);
        const cb = choiceAfter(options.otherSource, steps);
        const prior = A[k - 1].state;
        const describable =
          prior.waiting === false &&
          prior.heatCall === (prior.heating === true || prior.backupHeating === true) &&
          prior.coolCall === prior.cooling &&
          prior.backupHeating !== true;
        if (ca && cb && ca !== cb && describable) {
          out.push({
            ...options.base,
            iteration: i,
            step: k,
            prior,
            reading: step.args,
            correctChoice: ca,
            otherChoice: cb,
            busyness: busyness(options.target.id, prior, step.args),
          });
          break;
        }
      }
      if (!same) break; // earlier behaviour differed: no clean moment in this situation
    }
  }
  return out.sort((x, y) => x.busyness - y.busyness || x.iteration - y.iteration);
}

// ---------------------------------------------------------------------------
// Building a round
// ---------------------------------------------------------------------------

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

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function momentSidesFromSeed(seed: number, count: number): Array<'A' | 'B'> {
  const rand = mulberry32((seed ^ 0x5a5a5a5a) >>> 0);
  return Array.from({ length: count }, () => (rand() < 0.5 ? 'A' : 'B'));
}

const TITLES: Record<string, string> = {
  'furnace-air-conditioner': 'Furnace and air conditioner',
  'heat-pump': 'Heat pump',
};

/**
 * One best (simplest) moment per planted fault, and per distinct rebuild, taken
 * only from situations classified as a rebuild error (a misread of a clear
 * rule; a disagreement caused by unclear wording is not a fair question to him).
 */
export function momentCandidates(iterations = 200): MomentCandidate[] {
  const all: MomentCandidate[] = [];
  for (const target of HVAC_TARGETS) {
    const inputs = slice3Inputs(target);
    const title = TITLES[target.id];
    for (const m of loadNamedMutants(target, inputs.originalSource)) {
      const found = findMoments({
        target,
        spec: inputs.spec,
        title,
        correctSource: inputs.originalSource,
        otherSource: m.source,
        iterations,
        base: {
          class: 'planted-fault',
          behaviourId: target.id,
          title,
          otherVersion: `planted fault ${m.id}`,
          why: `The correct version follows his rules. The other has one planted fault: ${m.description}.`,
        },
      });
      if (found[0]) all.push(found[0]);
    }
    const seenRebuilds = new Set<string>();
    for (const r of loadRecordings(target)) {
      if (!r.status.validated || seenRebuilds.has(r.rebuiltSource)) continue;
      seenRebuilds.add(r.rebuiltSource);
      // Only situations a person classified as a clear misread (b-error). A
      // disagreement that comes from wording open to two readings is a question
      // for the rules, not for him.
      const fairRules = r.rules.filter((rule) => rule.classification === 'b-error' && rule.iterations);
      const found = findMoments({
        target,
        spec: inputs.spec,
        title,
        correctSource: inputs.originalSource,
        otherSource: r.rebuiltSource,
        iterations,
        base: {
          class: 'rebuild-disagreement',
          behaviourId: target.id,
          title,
          otherVersion: `rebuild ${r.recording}`,
          why: 'The correct version follows his rules; a rebuild from his rules misread one.',
        },
      })
        .map((c) => ({ c, rule: fairRules.find((rule) => rule.iterations!.includes(c.iteration)) }))
        .filter((x) => x.rule !== undefined)
        .map(({ c, rule }) => ({ ...c, why: `${c.why} ${rule!.rationale}` }));
      if (found[0]) all.push(found[0]);
    }
  }
  return all;
}

export function buildMomentRound(options: {
  seed: number;
  createdAt?: string;
  salt?: string;
  candidates?: MomentCandidate[];
}): { publicRound: MomentRound; key: MomentKey } {
  const rand = mulberry32(options.seed >>> 0);
  const pool = options.candidates ?? momentCandidates();
  // At most one rebuild question, then planted faults, alternating machines.
  const rebuilds = shuffle(pool.filter((c) => c.class === 'rebuild-disagreement'), rand).slice(0, 1);
  const planted = shuffle(pool.filter((c) => c.class === 'planted-fault'), rand);
  const byMachine = HVAC_TARGETS.map((t) => planted.filter((c) => c.behaviourId === t.id));
  const chosen: MomentCandidate[] = [...rebuilds];
  // Alternate machines, and never ask about the same kind of fault twice.
  const faultKinds = new Set<string>();
  while (chosen.length < MAX_QUESTIONS && byMachine.some((l) => l.length > 0)) {
    for (const list of byMachine) {
      if (chosen.length >= MAX_QUESTIONS) break;
      let next = list.shift();
      while (next && faultKinds.has(next.otherVersion)) next = list.shift();
      if (next) {
        faultKinds.add(next.otherVersion);
        chosen.push(next);
      }
    }
  }
  const ordered = shuffle(chosen, rand);
  const sides = momentSidesFromSeed(options.seed, ordered.length);
  const createdAt = options.createdAt ?? new Date().toISOString();
  const roundId = `moments-${createdAt.replace(/[-:]/g, '').slice(0, 15)}-${(options.seed >>> 0).toString(16)}`;
  const questions: MomentQuestion[] = [];
  const keyQuestions: MomentKeyQuestion[] = [];
  ordered.forEach((c, i) => {
    const correctSide = sides[i];
    const aChoice = correctSide === 'A' ? c.correctChoice : c.otherChoice;
    const bChoice = correctSide === 'A' ? c.otherChoice : c.correctChoice;
    questions.push({
      ...renderMoment(c.behaviourId, c.title, c.prior, c.reading),
      n: i + 1,
      choices: offeredChoices(c.behaviourId, c.prior, aChoice, bChoice).map((id) => ({ id, ...CHOICES[id] })),
      a: { choice: aChoice },
      b: { choice: bChoice },
    } as MomentQuestion);
    keyQuestions.push({
      n: i + 1,
      class: c.class,
      behaviourId: c.behaviourId,
      otherVersion: c.otherVersion,
      correctSide,
      correctChoice: c.correctChoice,
      otherChoice: c.otherChoice,
      shown: correctSide === 'A' ? { A: 'correct', B: c.otherVersion } : { A: c.otherVersion, B: 'correct' },
      why: c.why,
      situation: { seed: GENERIC_SEED, iteration: c.iteration, step: c.step },
    });
  });
  const key: MomentKey = {
    schema: 'which-is-right.moment-key.v1',
    roundId,
    createdAt,
    salt: options.salt ?? randomBytes(16).toString('hex'),
    seed: options.seed >>> 0,
    questions: keyQuestions,
  };
  return {
    key,
    publicRound: {
      schema: 'which-is-right.moment-round.v1',
      roundId,
      keySha256: sha256(keyFileBytes(key)),
      questionsSha256: sha256(JSON.stringify(questions)),
      questions,
    },
  };
}

// ---------------------------------------------------------------------------
// Rules the screen must keep (checked here and again by the dashboard)
// ---------------------------------------------------------------------------

const TONES = new Set<Tone>(['heat', 'cool', 'off', 'neutral']);

export function momentRoundProblems(round: SealableRound): string[] {
  const problems: string[] = [];
  const qs = round.questions as MomentQuestion[];
  if (qs.length === 0) problems.push('the round has no questions');
  if (qs.length > MAX_QUESTIONS) problems.push(`the round has ${qs.length} questions; at most ${MAX_QUESTIONS}`);
  for (const q of qs) {
    const at = `question ${q.n}`;
    if (q.type !== 'moment') problems.push(`${at} is not a moment`);
    const badge = MODE_BADGE[q.mode?.word?.toLowerCase?.() ?? ''];
    if (!badge || badge.tone !== q.mode.tone) problems.push(`${at}: the mode badge colour does not follow its meaning`);
    for (const d of q.dials ?? []) {
      const extra = Object.keys(d).filter((k) => k !== 'label' && k !== 'value');
      if (extra.length) problems.push(`${at}: the ${d.label} dial carries ${extra.join(', ')}; dials stay neutral`);
    }
    const words = (q.facts ?? []).map((f) => f.text).join(' | ');
    for (const need of ['Mode:', 'Fan:', 'Compressor']) {
      if (!words.includes(need)) problems.push(`${at} does not say "${need}" in words`);
    }
    if (q.title === TITLES['heat-pump'] && !words.includes('Outdoors:')) problems.push(`${at} does not give the outdoor temperature in words`);
    const ids = (q.choices ?? []).map((c) => c.id);
    if (ids.length < 2 || ids.length > 4) problems.push(`${at} offers ${ids.length} choices; 2 to 4`);
    for (const c of q.choices ?? []) {
      const def = CHOICES[c.id];
      if (!def) problems.push(`${at}: unknown choice ${c.id}`);
      else if (c.tone !== def.tone || !TONES.has(c.tone)) problems.push(`${at}: the "${def.label}" colour does not follow its meaning`);
    }
    if (!ids.includes(q.a?.choice) || !ids.includes(q.b?.choice)) problems.push(`${at}: a version's result is not among the choices`);
    if (q.a?.choice === q.b?.choice) problems.push(`${at}: the two versions do the same thing`);
    if ('correctSide' in q || 'correctChoice' in q) problems.push(`${at} carries its answer`);
  }
  return problems;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface MomentAnswer {
  choice: string;
  seconds: number | null;
  answeredAt?: string;
}

export interface MomentTotals {
  shown: number;
  answered: number;
  knownAnswered: number;
  right: number;
  plantedShown: number;
  plantedCaught: number;
  rebuildShown: number;
  rebuildAnswered: number;
  rebuildSidedWithRules: number;
  neitherVersion: number;
  averageSeconds: number | null;
}

export function gradeMomentRound(key: MomentKey, round: { questions: MomentQuestion[] }, answers: Record<string, MomentAnswer>, sealVerified: boolean) {
  const questions = key.questions.map((k) => {
    const q = round.questions.find((x) => x.n === k.n)!;
    const a = answers[String(k.n)];
    const expected = (a?.choice ?? null) as ChoiceId | null;
    const matched = expected === null ? null : q.a.choice === expected ? 'A' : q.b.choice === expected ? 'B' : 'neither';
    return {
      n: k.n,
      class: k.class,
      shown: k.shown,
      expectedChoice: expected,
      versionA: q.a.choice,
      versionB: q.b.choice,
      matchedVersion: matched,
      correctSide: k.correctSide,
      correct: expected === null ? null : expected === k.correctChoice,
      seconds: a?.seconds ?? null,
    };
  });
  const answered = questions.filter((q) => q.expectedChoice !== null);
  const timed = answered.filter((q) => typeof q.seconds === 'number') as Array<(typeof answered)[number] & { seconds: number }>;
  const planted = questions.filter((q) => q.class === 'planted-fault');
  const rebuild = questions.filter((q) => q.class === 'rebuild-disagreement');
  const totals: MomentTotals = {
    shown: questions.length,
    answered: answered.length,
    knownAnswered: answered.length,
    right: answered.filter((q) => q.correct === true).length,
    plantedShown: planted.length,
    plantedCaught: planted.filter((q) => q.correct === true).length,
    rebuildShown: rebuild.length,
    rebuildAnswered: rebuild.filter((q) => q.expectedChoice !== null).length,
    rebuildSidedWithRules: rebuild.filter((q) => q.correct === true).length,
    neitherVersion: answered.filter((q) => q.matchedVersion === 'neither').length,
    averageSeconds: timed.length ? Math.round(timed.reduce((s, q) => s + q.seconds, 0) / timed.length) : null,
  };
  return { schema: 'which-is-right.moment-receipt.v1', roundId: key.roundId, sealVerified, questions, totals, plain: plainMomentReceipt(totals, sealVerified) };
}

export function plainMomentReceipt(t: MomentTotals, sealVerified: boolean): string {
  const times = (n: number) => (n === 1 ? '1 time' : `${n} times`);
  const lines = [
    `You answered ${t.answered} ${t.answered === 1 ? 'question' : 'questions'}.`,
    `On the ${t.knownAnswered} where we knew the answer, you chose right ${times(t.right)}.`,
    `You caught ${t.plantedCaught} of ${t.plantedShown} planted faults.`,
  ];
  if (t.rebuildAnswered > 0)
    lines.push(`On the ${t.rebuildAnswered} where a copy built from your rules disagreed, you sided with your rules ${times(t.rebuildSidedWithRules)}.`);
  if (t.neitherVersion > 0)
    lines.push(`${t.neitherVersion === 1 ? 'Once' : `${t.neitherVersion} times`}, you expected something neither version did.`);
  lines.push(t.averageSeconds === null ? 'No answer times were recorded.' : `You took about ${t.averageSeconds} seconds each.`);
  lines.push(
    sealVerified
      ? 'The answer key was sealed before you saw the questions, and it was not changed.'
      : 'Warning: the answer key does not match its seal, so these marks cannot be trusted.'
  );
  return lines.join('\n');
}

