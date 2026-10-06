/**
 * "Which is right?" rounds — the founder-facing end of the back-translation
 * check (board task_1791235614927_x7l2).
 *
 * A divergence is a situation (seeded action sequence) where two versions of a
 * behaviour act differently. A person who knows how a car park barrier should
 * behave can say which version is right without reading code, if the situation
 * and both versions' answers are shown as plain sentences. This module:
 *
 *   1. traces a situation step by step on the deterministic runtime,
 *   2. renders each step and each version's answer through the behaviour's own
 *      plain-words.json (outcome name + its accepted/refused kind from the
 *      interface card + event fields + observation fields + key state values),
 *   3. builds a round of questions from the slice-3 recordings: planted faults
 *      (correct original vs a measured mutant) and rebuild disagreements
 *      (correct original vs a recorded Grok rebuild that misread a rule),
 *   4. randomises which side is A per question from a recorded seed,
 *   5. seals the answer key to a file BEFORE publishing and puts its sha256 in
 *      the round record and in what the dashboard stores, so a key edited after
 *      answers came in is caught,
 *   6. publishes to the founder dashboard (ai-ecosystem agents-dashboard-server,
 *      routes /which-is-right/*), collects answers, and grades them into a
 *      receipt with a plain-words summary.
 *
 * The dashboard never receives which side is correct.
 */
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { createDeterministicHsplusActionRuntime } from '@holoscript/engine/runtime';
import { selectDecisionMutants, type InterfaceCardSpec } from '@holoscript/core/testing';
import {
  GENERIC_SEED,
  generateGenericSituation,
  type BehaviourSpec,
  type GenericSituation,
  type GenericStep,
  type ParamValue,
} from './generic';
import { SLICE3_ROOT, SLICE3_TARGETS, loadRecordings, slice3Inputs } from './slice3';

// ---------------------------------------------------------------------------
// Plain words
// ---------------------------------------------------------------------------

type StepWords = string | { default: string; when?: Record<string, string> };

export interface PlainWords {
  machine: string;
  kinds: { accepted: string; refused: string };
  steps: Record<string, StepWords>;
  outcomes: Record<string, string>;
  events: Record<string, string>;
  observations: Record<string, string>;
  state: string;
  values?: Record<string, Record<string, string>>;
  avoid?: Record<string, ParamValue[]>;
}

export function loadPlainWords(dir: string): PlainWords {
  return JSON.parse(readFileSync(path.join(dir, 'plain-words.json'), 'utf8')) as PlainWords;
}

/**
 * Tiny template: `{x}` value (mapped through values[x] when listed),
 * `{x:one|many}` picks a word by whether x is 1, `{x?yes|no}` picks by truth.
 * A name with no value renders as "?" so a gap is visible, never silent.
 */
export function fillTemplate(
  template: string,
  data: Record<string, unknown>,
  values: Record<string, Record<string, string>> = {}
): string {
  return template.replace(/\{([A-Za-z_][A-Za-z0-9_]*)(?:([:?])([^|}]*)\|([^}]*))?\}/g, (_m, name, op, x, y) => {
    const v = data[name];
    if (op === ':') return Number(v) === 1 ? x : y;
    if (op === '?') return v ? x : y;
    if (v === undefined || v === null) return '?';
    const mapped = values[name]?.[String(v)];
    return mapped ?? String(v);
  });
}

export function plainStep(words: PlainWords, step: GenericStep): string {
  const entry = words.steps[step.entrypoint];
  if (entry === undefined) return `Something called ${step.entrypoint} happens.`;
  let template = typeof entry === 'string' ? entry : entry.default;
  if (typeof entry !== 'string' && entry.when) {
    for (const [cond, t] of Object.entries(entry.when)) {
      const [k, v] = cond.split('=');
      if (String(step.args[k]) === v) template = t;
    }
  }
  return fillTemplate(template, step.args, words.values);
}

// ---------------------------------------------------------------------------
// Tracing a situation
// ---------------------------------------------------------------------------

export interface TraceStep {
  step: GenericStep;
  value: Record<string, unknown> | null;
  events: Array<{ event: string; payload: Record<string, unknown> }>;
  state: Record<string, unknown>;
  threw?: string;
}

export function traceSituation(source: string, steps: GenericStep[]): TraceStep[] {
  const runtime = createDeterministicHsplusActionRuntime(source);
  const out: TraceStep[] = [];
  let state = runtime.initialState as Record<string, unknown>;
  steps.forEach((step, order) => {
    try {
      const r = runtime.invoke({
        kind: step.kind,
        entrypoint: step.entrypoint,
        args: step.args,
        scheduleEntryId: `${step.entrypoint}-${order}`,
        order,
        tick: order,
      } as never) as {
        value: unknown;
        state: Record<string, unknown>;
        emittedEvents: Array<{ event: string; payload: Record<string, unknown> }>;
      };
      state = r.state;
      out.push({ step, value: (r.value ?? null) as Record<string, unknown> | null, events: r.emittedEvents ?? [], state });
    } catch (error) {
      out.push({ step, value: null, events: [], state, threw: error instanceof Error ? error.message : String(error) });
    }
  });
  return out;
}

function outcomeKind(spec: InterfaceCardSpec, action: string, outcome: string): 'accepted' | 'refused' | null {
  const a = spec.actions.find((x) => x.name === action);
  const o = a?.outcomes.find((x) => (typeof x === 'string' ? x === outcome : x.name === outcome));
  if (!o || typeof o === 'string') return null;
  return (o as { kind?: 'accepted' | 'refused' }).kind ?? null;
}

/** What one version did after one step, in plain sentences. */
export function plainAnswer(words: PlainWords, iface: InterfaceCardSpec, t: TraceStep): string {
  if (t.threw) return 'It stopped working.';
  const v = t.value ?? {};
  if (t.step.kind === 'observation') {
    const tpl = words.observations[t.step.entrypoint];
    return tpl ? fillTemplate(tpl, v, words.values) : 'It shows something.';
  }
  const outcome = String(v.outcome ?? '');
  const kind = outcomeKind(iface, t.step.entrypoint, outcome);
  const said = words.outcomes[`${t.step.entrypoint}.${outcome}`];
  const parts: string[] = [];
  if (kind && words.kinds[kind]) parts.push(words.kinds[kind]);
  parts.push(said ?? 'It answers in a way that is not on its list.');
  for (const e of t.events) {
    const tpl = words.events[e.event];
    parts.push(tpl ? fillTemplate(tpl, e.payload ?? {}, words.values) : 'It announces something else.');
  }
  return parts.join(' ');
}

function sameJson(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

export interface ComparedSituation {
  steps: string[];
  correct: string[];
  other: string[];
  /** 0-based index of the first row where the two columns read differently. */
  firstDifference: number;
}

/**
 * Renders the situation up to and including the first step where the two
 * versions read differently. Returns null when they never read differently
 * (a difference the plain words cannot show is not a fair question), when a
 * version stopped working before that point, or when a shown step uses a value
 * the behaviour's words mark to avoid.
 */
export function compareSituation(
  words: PlainWords,
  iface: InterfaceCardSpec,
  publicKeys: string[],
  correctSource: string,
  otherSource: string,
  situation: GenericSituation
): ComparedSituation | null {
  const a = traceSituation(correctSource, situation.steps);
  const b = traceSituation(otherSource, situation.steps);
  const steps: string[] = [];
  const correct: string[] = [];
  const other: string[] = [];
  for (let k = 0; k < situation.steps.length; k++) {
    const step = situation.steps[k];
    for (const [param, value] of Object.entries(step.args)) {
      if ((words.avoid?.[`${step.entrypoint}.${param}`] ?? []).includes(value)) return null;
    }
    if (a[k].threw || b[k].threw) return null;
    let ta = plainAnswer(words, iface, a[k]);
    let tb = plainAnswer(words, iface, b[k]);
    const pick = (s: Record<string, unknown>) => Object.fromEntries(publicKeys.map((key) => [key, s[key]]));
    if (ta === tb && !sameJson(pick(a[k].state), pick(b[k].state))) {
      // Only when the inside counts read differently: a difference the words
      // cannot show stays hidden until an answer shows it.
      const sa = fillTemplate(words.state, a[k].state, words.values);
      const sb = fillTemplate(words.state, b[k].state, words.values);
      if (sa !== sb) {
        ta = `${ta} ${sa}`;
        tb = `${tb} ${sb}`;
      }
    }
    steps.push(plainStep(words, step));
    correct.push(ta);
    other.push(tb);
    if (ta !== tb) return { steps, correct, other, firstDifference: k };
  }
  return null;
}

/** Shortest situation (fewest shown steps) among the first `iterations` seeded ones. */
export function shortestQuestion(options: {
  spec: BehaviourSpec;
  words: PlainWords;
  iface: InterfaceCardSpec;
  correctSource: string;
  otherSource: string;
  iterations?: number;
  skip?: number;
  maxSteps?: number;
}): (ComparedSituation & { iteration: number }) | null {
  const found: Array<ComparedSituation & { iteration: number }> = [];
  for (let i = 0; i < (options.iterations ?? 120); i++) {
    const situation = generateGenericSituation(options.spec, GENERIC_SEED, i);
    const c = compareSituation(
      options.words,
      options.iface,
      options.spec.publicStateKeys,
      options.correctSource,
      options.otherSource,
      situation
    );
    if (c && c.steps.length <= (options.maxSteps ?? 8)) found.push({ ...c, iteration: i });
  }
  found.sort((x, y) => x.steps.length - y.steps.length || x.iteration - y.iteration);
  return found[options.skip ?? 0] ?? null;
}

// ---------------------------------------------------------------------------
// Words that must never reach the screen
// ---------------------------------------------------------------------------

/** Code-shaped text a non-developer should never see: names, ids, symbols. */
export function codeWordFindings(text: string): string[] {
  const findings: string[] = [];
  const checks: Array<[RegExp, string]> = [
    [/[a-z][A-Z]/, 'joined-up name'],
    [/_/, 'underscore name'],
    // A semicolon is ordinary punctuation in the checklists' sentences, so it is not listed.
    [/[{}<>[\]=#`\\]/, 'code symbol'],
    [/\b(true|false|null|undefined|NaN)\b/, 'program value'],
    [/\b[a-z]+\d+\b/i, 'id with a number'],
    [/\?/, 'missing value'],
    [/\bmutant|rebuild|original|hsplus|outcome|state\b/i, 'test word'],
  ];
  for (const [re, label] of checks) if (re.test(text)) findings.push(`${label}: ${text}`);
  return findings;
}

// ---------------------------------------------------------------------------
// Building a round
// ---------------------------------------------------------------------------

export type QuestionClass = 'planted-fault' | 'rebuild-disagreement';
export type Side = 'A' | 'B';

export interface PublicQuestion {
  n: number;
  title: string;
  /**
   * How the machine should work: its checklist lines, word for word. Joseph
   * did not write these machines, so without the rules no one can judge which
   * side is right. Same for both sides, so it reveals no answer.
   */
  rules: string[];
  steps: string[];
  a: string[];
  b: string[];
}

export interface KeyQuestion {
  n: number;
  class: QuestionClass;
  behaviourId: string;
  correctSide: Side;
  shown: { A: string; B: string };
  otherVersion: string;
  why: string;
  situation: { seed: number; iteration: number; shownSteps: number };
}

export interface AnswerKey {
  schema: 'which-is-right.answer-key.v1';
  roundId: string;
  createdAt: string;
  /** Random salt: without it, the key's hash could be matched by trying every A/B pattern. */
  salt: string;
  /** Seed that chose the questions, their order and which side is A. */
  seed: number;
  questions: KeyQuestion[];
}

export interface PublicRound {
  schema: 'which-is-right.round.v1';
  roundId: string;
  keySha256: string;
  questionsSha256: string;
  questions: PublicQuestion[];
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

function shuffle<T>(items: T[], rand: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Sides for each question, a pure function of the seed (recorded in the key). */
export function sidesFromSeed(seed: number, count: number): Side[] {
  const rand = mulberry32((seed ^ 0xa5a5a5a5) >>> 0);
  return Array.from({ length: count }, () => (rand() < 0.5 ? 'A' : 'B'));
}

export const PLANTED_PER_BEHAVIOUR: Record<string, number> = {
  'car-park-barrier': 3,
  'bike-share-account': 3,
  'deli-counter-queue': 2,
};
/** Car park rebuilds that disagree with the correct program (slice-3 receipt). */
export const REBUILD_QUESTIONS: Array<{ behaviourId: string; recording: string; skip: number }> = [
  { behaviourId: 'car-park-barrier', recording: 'r2', skip: 0 },
  { behaviourId: 'car-park-barrier', recording: 'r3', skip: 1 },
];

interface Candidate {
  class: QuestionClass;
  behaviourId: string;
  title: string;
  rules: string[];
  otherVersion: string;
  why: string;
  compared: ComparedSituation & { iteration: number };
}

/** Plain titles never carry a code name; the machine name comes from plain-words.json. */
export function buildRound(options: { seed: number; createdAt?: string; salt?: string }): {
  publicRound: PublicRound;
  key: AnswerKey;
} {
  const rand = mulberry32(options.seed >>> 0);
  const candidates: Candidate[] = [];
  for (const target of SLICE3_TARGETS.filter((t) => t.role === 'measured')) {
    const inputs = slice3Inputs(target);
    const words = loadPlainWords(target.dir);
    const receipt = JSON.parse(readFileSync(path.join(target.dir, 'receipt.json'), 'utf8')) as {
      recordings: Array<{
        recording: string;
        catch: { mutants: Array<{ id: string; caught: boolean; description: string; change: string }> };
        falseAlarms: { divergences: Array<{ rationale: string }> };
      }>;
    };
    // Measured mutants only: the ones the slice-3 receipt planted and the check showed.
    const measured = receipt.recordings[0].catch.mutants.filter((m) => m.caught);
    const pool = selectDecisionMutants(inputs.originalSource, 24).filter((m) =>
      measured.some((x) => x.id === m.id)
    );
    const want = PLANTED_PER_BEHAVIOUR[target.id] ?? 0;
    let taken = 0;
    for (const mutant of shuffle(pool, rand)) {
      if (taken >= want) break;
      const compared = shortestQuestion({
        spec: inputs.spec,
        words,
        iface: inputs.interfaceSpec,
        correctSource: inputs.originalSource,
        otherSource: mutant.source,
      });
      if (!compared) continue;
      const m = measured.find((x) => x.id === mutant.id)!;
      candidates.push({
        class: 'planted-fault',
        behaviourId: target.id,
        title: words.machine,
        rules: inputs.checklist.lines.map((l) => l.text),
        otherVersion: `planted fault ${mutant.id}`,
        why: `The correct version follows the written rules. The other version had one change planted on purpose: ${m.description} (${m.change}).`,
        compared,
      });
      taken++;
    }
    for (const rq of REBUILD_QUESTIONS.filter((x) => x.behaviourId === target.id)) {
      const rec = loadRecordings(target).find((r) => r.recording === rq.recording);
      if (!rec) continue;
      const compared = shortestQuestion({
        spec: inputs.spec,
        words,
        iface: inputs.interfaceSpec,
        correctSource: inputs.originalSource,
        otherSource: rec.rebuiltSource,
        skip: rq.skip,
      });
      if (!compared) continue;
      const rationale =
        receipt.recordings.find((r) => r.recording === rq.recording)?.falseAlarms.divergences[0]?.rationale ??
        'The rebuild misread a written rule.';
      candidates.push({
        class: 'rebuild-disagreement',
        behaviourId: target.id,
        title: words.machine,
        rules: inputs.checklist.lines.map((l) => l.text),
        otherVersion: `rebuild ${rq.recording}`,
        why: `The correct version follows the written rules; a fresh rebuild from the rules disagreed. ${rationale}`,
        compared,
      });
    }
  }
  const ordered = shuffle(candidates, rand);
  const sides = sidesFromSeed(options.seed, ordered.length);
  const roundId = `round-${(options.createdAt ?? new Date().toISOString()).replace(/[-:]/g, '').slice(0, 15)}-${(options.seed >>> 0).toString(16)}`;
  const createdAt = options.createdAt ?? new Date().toISOString();
  const questions: PublicQuestion[] = [];
  const keyQuestions: KeyQuestion[] = [];
  ordered.forEach((c, i) => {
    const correctSide = sides[i];
    const correctIsA = correctSide === 'A';
    questions.push({
      n: i + 1,
      title: c.title,
      rules: c.rules,
      steps: c.compared.steps,
      a: correctIsA ? c.compared.correct : c.compared.other,
      b: correctIsA ? c.compared.other : c.compared.correct,
    });
    keyQuestions.push({
      n: i + 1,
      class: c.class,
      behaviourId: c.behaviourId,
      correctSide,
      shown: correctIsA ? { A: 'correct', B: c.otherVersion } : { A: c.otherVersion, B: 'correct' },
      otherVersion: c.otherVersion,
      why: c.why,
      situation: { seed: GENERIC_SEED, iteration: c.compared.iteration, shownSteps: c.compared.steps.length },
    });
  });
  const key: AnswerKey = {
    schema: 'which-is-right.answer-key.v1',
    roundId,
    createdAt,
    salt: options.salt ?? randomBytes(16).toString('hex'),
    seed: options.seed >>> 0,
    questions: keyQuestions,
  };
  const keyBytes = keyFileBytes(key);
  return {
    key,
    publicRound: {
      schema: 'which-is-right.round.v1',
      roundId,
      keySha256: sha256(keyBytes),
      questionsSha256: sha256(JSON.stringify(questions)),
      questions,
    },
  };
}

// ---------------------------------------------------------------------------
// Sealing
// ---------------------------------------------------------------------------

export const ROUNDS_ROOT = path.join(SLICE3_ROOT, 'which-is-right', 'rounds');

export function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}

export function keyFileBytes(key: unknown): string {
  return `${JSON.stringify(key, null, 2)}\n`;
}

export interface RoundRecord {
  schema: 'which-is-right.round-record.v1';
  roundId: string;
  keyFile: 'answer-key.json';
  keySha256: string;
  keySealedAt: string;
  questionsSha256: string;
  publicRound: SealableRound;
  published?: { to: string; at: string; dashboardKeySha256: string };
}

/** Any round the dashboard can show: text questions (PublicRound) or picture moments. */
export interface SealableRound {
  schema: string;
  roundId: string;
  keySha256: string;
  questionsSha256: string;
  questions: ReadonlyArray<object>;
}

/**
 * Writes answer-key.json FIRST, then round.json carrying its sha256. Nothing is
 * published until both exist; the publisher sends only round.publicRound.
 */
export function sealRound(dir: string, built: { publicRound: SealableRound; key: { roundId: string } }): RoundRecord {
  mkdirSync(dir, { recursive: true });
  const keyPath = path.join(dir, 'answer-key.json');
  if (existsSync(keyPath)) throw new Error(`a sealed key already exists in ${dir}; a round is sealed once`);
  const bytes = keyFileBytes(built.key);
  writeFileSync(keyPath, bytes);
  const keySha256 = sha256(readFileSync(keyPath));
  if (keySha256 !== built.publicRound.keySha256) throw new Error('sealed key bytes do not match the round hash');
  const record: RoundRecord = {
    schema: 'which-is-right.round-record.v1',
    roundId: built.key.roundId,
    keyFile: 'answer-key.json',
    keySha256,
    keySealedAt: new Date().toISOString(),
    questionsSha256: built.publicRound.questionsSha256,
    publicRound: built.publicRound,
  };
  writeRecord(dir, record);
  return record;
}

export function writeRecord(dir: string, record: RoundRecord): void {
  writeFileSync(path.join(dir, 'round.json'), `${JSON.stringify(record, null, 2)}\n`);
}

export function readRecord(dir: string): RoundRecord {
  return JSON.parse(readFileSync(path.join(dir, 'round.json'), 'utf8')) as RoundRecord;
}

/**
 * The key on disk must hash to what the round record says AND to what the
 * dashboard stored when the round was published (an independent copy: editing
 * the key and the record together still fails against the dashboard's hash).
 */
export function verifySeal<K = AnswerKey>(dir: string, dashboardKeySha256?: string | null): { ok: boolean; problems: string[]; key: K } {
  const record = readRecord(dir);
  const raw = readFileSync(path.join(dir, record.keyFile));
  const now = sha256(raw);
  const problems: string[] = [];
  if (now !== record.keySha256) problems.push('the answer key changed after it was sealed (does not match the round record)');
  if (record.published && now !== record.published.dashboardKeySha256)
    problems.push('the answer key does not match the hash recorded at publish time');
  if (dashboardKeySha256 !== undefined && dashboardKeySha256 !== null && now !== dashboardKeySha256)
    problems.push('the answer key does not match the hash the dashboard stored when the round was published');
  return { ok: problems.length === 0, problems, key: JSON.parse(raw.toString('utf8')) as K };
}

// ---------------------------------------------------------------------------
// Publishing and collecting
// ---------------------------------------------------------------------------

export const DASHBOARD_URL = process.env.WHICH_IS_RIGHT_DASHBOARD ?? 'http://127.0.0.1:3401';

export class DashboardNotRunning extends Error {}

async function dashboardFetch(url: string, init?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error) {
    throw new DashboardNotRunning(
      `The dashboard is not running at ${new URL(url).origin}, so nothing was sent or collected. ` +
        `Start it (the "What Needs Me" icon) and try again. (${error instanceof Error ? error.message : String(error)})`
    );
  }
}

/** A question he cannot judge (no rules, or no steps) must never reach the screen. */
export function roundProblems(round: SealableRound): string[] {
  const problems: string[] = [];
  for (const q of round.questions as PublicQuestion[]) {
    if (!Array.isArray(q.rules) || q.rules.length === 0 || q.rules.some((r) => typeof r !== 'string' || !r.trim()))
      problems.push(`question ${q.n} has no rules saying how the machine should work`);
    if (!Array.isArray(q.steps) || q.steps.length === 0) problems.push(`question ${q.n} has no steps`);
  }
  return problems;
}

export async function publishRound(
  dir: string,
  options: { url?: string; replace?: boolean; validate?: (round: SealableRound) => string[] } = {}
): Promise<RoundRecord> {
  const record = readRecord(dir);
  const missing = (options.validate ?? roundProblems)(record.publicRound);
  if (missing.length) throw new Error(`refusing to publish: ${missing.join('; ')}`);
  const seal = verifySeal(dir);
  if (!seal.ok) throw new Error(`refusing to publish: ${seal.problems.join('; ')}`);
  const base = options.url ?? DASHBOARD_URL;
  const res = await dashboardFetch(`${base}/which-is-right/round`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ round: record.publicRound, replace: options.replace === true }),
  });
  const body = (await res.json()) as { ok?: boolean; error?: string };
  if (!res.ok || !body.ok) throw new Error(`the dashboard refused the round: ${body.error ?? res.status}`);
  const state = (await (await dashboardFetch(`${base}/which-is-right/state`)).json()) as {
    round: { roundId: string; keySha256: string } | null;
  };
  if (state.round?.roundId !== record.roundId) throw new Error('the dashboard does not show the round after publishing');
  record.published = { to: base, at: new Date().toISOString(), dashboardKeySha256: state.round.keySha256 };
  writeRecord(dir, record);
  return record;
}

export interface DashboardAnswers {
  roundId: string;
  keySha256: string;
  answers: Record<string, { choice: 'A' | 'B' | 'not-sure'; seconds: number | null; answeredAt: string; changes?: number }>;
}

export async function collectAnswers(url = DASHBOARD_URL): Promise<DashboardAnswers> {
  const res = await dashboardFetch(`${url}/which-is-right/state`);
  const body = (await res.json()) as { round: DashboardAnswers | null };
  if (!body.round) throw new Error('the dashboard has no round to collect');
  return body.round;
}

// ---------------------------------------------------------------------------
// Grading
// ---------------------------------------------------------------------------

export interface GradedQuestion {
  n: number;
  class: QuestionClass;
  shown: { A: string; B: string };
  chosen: 'A' | 'B' | 'not-sure' | null;
  correctSide: Side;
  correct: boolean | null;
  seconds: number | null;
}

export interface RoundReceipt {
  schema: 'which-is-right.receipt.v1';
  roundId: string;
  keySha256: string;
  sealVerified: boolean;
  questions: GradedQuestion[];
  totals: {
    shown: number;
    answered: number;
    notSure: number;
    knownAnswered: number;
    right: number;
    plantedShown: number;
    plantedCaught: number;
    rebuildShown: number;
    rebuildAnswered: number;
    rebuildSidedWithRules: number;
    averageSeconds: number | null;
  };
  plain: string;
}

export function gradeRound(key: AnswerKey, answers: DashboardAnswers['answers'], sealVerified: boolean, keySha256: string): RoundReceipt {
  const questions: GradedQuestion[] = key.questions.map((q) => {
    const a = answers[String(q.n)];
    const chosen = a?.choice ?? null;
    return {
      n: q.n,
      class: q.class,
      shown: q.shown,
      chosen,
      correctSide: q.correctSide,
      correct: chosen === 'A' || chosen === 'B' ? chosen === q.correctSide : null,
      seconds: a?.seconds ?? null,
    };
  });
  const answered = questions.filter((q) => q.chosen !== null);
  // Every question in these rounds has a known answer: the correct program is known.
  const known = answered;
  const timed = answered.filter((q) => typeof q.seconds === 'number') as Array<GradedQuestion & { seconds: number }>;
  const planted = questions.filter((q) => q.class === 'planted-fault');
  const rebuild = questions.filter((q) => q.class === 'rebuild-disagreement');
  const totals = {
    shown: questions.length,
    answered: answered.length,
    notSure: answered.filter((q) => q.chosen === 'not-sure').length,
    knownAnswered: known.length,
    right: known.filter((q) => q.correct === true).length,
    plantedShown: planted.length,
    plantedCaught: planted.filter((q) => q.correct === true).length,
    rebuildShown: rebuild.length,
    rebuildAnswered: rebuild.filter((q) => q.chosen !== null).length,
    rebuildSidedWithRules: rebuild.filter((q) => q.correct === true).length,
    averageSeconds: timed.length ? Math.round(timed.reduce((s, q) => s + q.seconds, 0) / timed.length) : null,
  };
  return {
    schema: 'which-is-right.receipt.v1',
    roundId: key.roundId,
    keySha256,
    sealVerified,
    questions,
    totals,
    plain: plainReceipt(totals, sealVerified),
  };
}

export function plainReceipt(t: RoundReceipt['totals'], sealVerified: boolean): string {
  const times = (n: number) => (n === 1 ? '1 time' : `${n} times`);
  const lines = [
    `You answered ${t.answered} ${t.answered === 1 ? 'question' : 'questions'}.`,
    `On the ${t.knownAnswered} where we knew the answer, you chose right ${times(t.right)}.`,
    `You caught ${t.plantedCaught} of ${t.plantedShown} planted faults.`,
  ];
  if (t.rebuildAnswered > 0)
    lines.push(`On the ${t.rebuildAnswered} you answered where a copy built from the rules disagreed, you sided with the rules ${times(t.rebuildSidedWithRules)}.`);
  if (t.notSure > 0) lines.push(`You said "Not sure" ${times(t.notSure)}.`);
  lines.push(
    t.averageSeconds === null ? 'No answer times were recorded.' : `You took about ${t.averageSeconds} seconds each.`
  );
  lines.push(
    sealVerified
      ? 'The answer key was sealed before you saw the questions, and it was not changed.'
      : 'Warning: the answer key does not match its seal, so these marks cannot be trusted.'
  );
  return lines.join('\n');
}
