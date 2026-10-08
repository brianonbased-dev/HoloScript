/**
 * Back-translation proof, slice 3 — fixture layout shared by the live recorder
 * and the deterministic replay test.
 *
 *   fixtures/backtranslation/slice3/<id>/
 *     original.hsplus, behaviour.json, checklist.json   (measured behaviours)
 *     interface.json        names + outcome kinds, as written by hand when B was run
 *     interface-card.md     the exact card text B saw (rendered from interface.json)
 *   original.hsplus now declares each action's outcomes (accepted(...) /
 *   refused(...)), so the card can be derived from source
 *   (interfaceCardSpecFromSource). Replay keeps the recorded card as what B saw
 *   and asserts the derived card matches it (see CARD_DERIVATION_DIFFERENCES).
 *     recordings/<rN>/      one fresh agent-B rebuild each:
 *       exchanges/round-K.json, rebuilt.hsplus, rebuild-status.json,
 *       divergence-classification.json
 *     receipt.json, summary.md, verdict.json
 *
 * door-before-after/ reuses the slice-2 keypad door (original, checklist,
 * behaviour.json from ../../keypad-door) with the new card. It is a separate,
 * labelled before/after check and never counts toward the slice-3 score.
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import {
  interfaceCardSpecFromSource,
  renderInterfaceCard,
  type BehaviourChecklist,
  type InterfaceCardSpec,
  type ModelExchange,
} from '@holoscript/core/testing';
import type { BehaviourSpec } from './generic';
import { withoutOutcomeDeclarations } from './pipeline';
import type { ClassificationRule, MeasuredMutant } from './measure';

export const FIXTURE_ROOT = path.join(__dirname, '..', 'fixtures', 'backtranslation');
export const SLICE3_ROOT = path.join(FIXTURE_ROOT, 'slice3');

export interface Slice3Target {
  id: string;
  role: 'measured' | 'before-after';
  /** Directory holding interface.json, the card, recordings and the receipt. */
  dir: string;
  /** Directory holding original.hsplus, behaviour.json and checklist.json. */
  sourceDir: string;
}

export const SLICE3_TARGETS: Slice3Target[] = [
  ...['bike-share-account', 'car-park-barrier', 'deli-counter-queue'].map((id) => ({
    id,
    role: 'measured' as const,
    dir: path.join(SLICE3_ROOT, id),
    sourceDir: path.join(SLICE3_ROOT, id),
  })),
  {
    id: 'door-before-after',
    role: 'before-after',
    dir: path.join(SLICE3_ROOT, 'door-before-after'),
    sourceDir: path.join(FIXTURE_ROOT, 'keypad-door'),
  },
];

/**
 * Heating and cooling behaviours written from the founder's own rules (Joseph
 * is an HVAC technician; task_1791235614927_x7l2). Same layout and pipeline as
 * slice 3; planted faults are named (mutants.json) rather than chosen by
 * operator, because he named the faults that matter on real equipment.
 */
export const HVAC_ROOT = path.join(FIXTURE_ROOT, 'hvac');
export const HVAC_TARGETS: Slice3Target[] = ['furnace-air-conditioner', 'heat-pump'].map((id) => ({
  id,
  role: 'measured' as const,
  dir: path.join(HVAC_ROOT, id),
  sourceDir: path.join(HVAC_ROOT, id),
}));

export interface NamedMutantSpec {
  id: string;
  description: string;
  edits: Array<{ find: string; replace: string; all?: boolean }>;
}

/** Applies a named fault; every edit must match (all:false = exactly once), or it throws. */
export function applyNamedMutant(source: string, m: NamedMutantSpec): string {
  let out = source;
  for (const e of m.edits) {
    const count = out.split(e.find).length - 1;
    if (count === 0 || (!e.all && count !== 1)) {
      throw new Error(`mutant ${m.id}: "${e.find}" matched ${count} times`);
    }
    out = e.all ? out.split(e.find).join(e.replace) : out.replace(e.find, e.replace);
  }
  return out;
}

export function loadNamedMutants(target: Slice3Target, originalSource: string): MeasuredMutant[] {
  const specs = JSON.parse(readFileSync(path.join(target.dir, 'mutants.json'), 'utf8')) as NamedMutantSpec[];
  return specs.map((m) => ({
    id: m.id,
    operator: 'named' as const,
    description: m.description,
    line: 0,
    before: m.edits.map((e) => e.find).join(' | '),
    after: m.edits.map((e) => e.replace).join(' | '),
    inDecision: true,
    source: applyNamedMutant(originalSource, m),
  }));
}

/**
 * Where the card derived from source differs from the hand-written card B saw.
 * Derived cards list events in the order of the outcomes that announce them.
 * The deli program declares "joined" before "joined_bumping_normal"; "joined"
 * announces ticket_taken and "joined_bumping_normal" announces bumped (then
 * ticket_taken), so the derived card lists ticket_taken first, where the
 * hand-written card listed bumped first. Same events, same fields, same
 * outcome kinds; only the order of two lines. All other cards are identical.
 */
export const CARD_DERIVATION_DIFFERENCES: Record<string, { eventOrder: string[]; why: string }> = {
  'deli-counter-queue': {
    eventOrder: ['ticket_taken', 'bumped', 'now_serving', 'gave_up', 'joining_closed'],
    why: 'derived cards list events in the order of the outcomes that announce them; the hand-written card had bumped before ticket_taken',
  },
};

/** The derived card, with any recorded difference applied, must equal the card B saw. */
export function derivedCardMatchesRecorded(
  targetId: string,
  derived: InterfaceCardSpec,
  recorded: InterfaceCardSpec
): { derivedEventOrder: string[]; recordedWithDifference: InterfaceCardSpec } {
  const difference = CARD_DERIVATION_DIFFERENCES[targetId];
  const recordedWithDifference: InterfaceCardSpec = difference
    ? {
        ...recorded,
        events: difference.eventOrder.map((name) => {
          const event = recorded.events.find((e) => e.name === name);
          if (!event) throw new Error(`${targetId}: recorded card has no event ${name}`);
          return event;
        }),
      }
    : recorded;
  return { derivedEventOrder: derived.events.map((e) => e.name), recordedWithDifference };
}

export const SLICE3_RECORDINGS = ['r1', 'r2', 'r3'] as const;
export const SLICE3_MAX_REPAIRS = 3;

/**
 * Proposed false-alarm tolerance, stated for a person: a false alarm costs
 * someone a look at rules that were fine. One in 20 checked situations is the
 * most a person would keep reading past before ignoring the check.
 */
export const FALSE_ALARM_TOLERANCE = {
  maxPer20Situations: 1,
  why: 'a false alarm costs someone a look at rules that were fine; more than one in 20 and people start ignoring the check',
} as const;

export function slice3Inputs(target: Slice3Target): {
  spec: BehaviourSpec;
  originalSource: string;
  /** original.hsplus without its outcome lists: planted faults are made from this (see withoutOutcomeDeclarations). */
  plantableSource: string;
  checklist: BehaviourChecklist;
  /** interface.json: the card agent B was shown. */
  interfaceSpec: InterfaceCardSpec;
  /** The card derived from original.hsplus (declared outcomes) plus the host's public state list. */
  derivedInterfaceSpec: InterfaceCardSpec;
  interfaceCard: string;
  referenceCard: string;
} {
  const fromSource = (f: string) => readFileSync(path.join(target.sourceDir, f), 'utf8');
  const interfaceSpec = JSON.parse(
    readFileSync(path.join(target.dir, 'interface.json'), 'utf8')
  ) as InterfaceCardSpec;
  const spec = JSON.parse(fromSource('behaviour.json')) as BehaviourSpec;
  const originalSource = fromSource('original.hsplus');
  return {
    spec,
    originalSource,
    plantableSource: withoutOutcomeDeclarations(originalSource),
    checklist: JSON.parse(fromSource('checklist.json')) as BehaviourChecklist,
    interfaceSpec,
    derivedInterfaceSpec: interfaceCardSpecFromSource(originalSource, {
      publicState: spec.publicStateKeys,
    }),
    interfaceCard: renderInterfaceCard(interfaceSpec),
    // Same reference card as slice 2: its example (a library shelf) shares no
    // domain with any slice-3 behaviour.
    referenceCard: readFileSync(path.join(FIXTURE_ROOT, 'language-reference-v2.md'), 'utf8'),
  };
}

export interface Slice3Recording {
  recording: string;
  dir: string;
  exchanges: ModelExchange[];
  rebuiltSource: string;
  status: { rounds: number; validated: boolean; model: string };
  rules: ClassificationRule[];
}

export function recordingDir(target: Slice3Target, recording: string): string {
  return path.join(target.dir, 'recordings', recording);
}

export function loadRecordings(target: Slice3Target): Slice3Recording[] {
  const root = path.join(target.dir, 'recordings');
  if (!existsSync(root)) return [];
  return readdirSync(root)
    .filter((r) => /^r\d+$/.test(r))
    .sort()
    .map((recording) => {
      const dir = path.join(root, recording);
      const exchangesDir = path.join(dir, 'exchanges');
      const rulesPath = path.join(dir, 'divergence-classification.json');
      return {
        recording,
        dir,
        exchanges: readdirSync(exchangesDir)
          .filter((f) => /^round-\d+\.json$/.test(f))
          .sort()
          .map(
            (f) => JSON.parse(readFileSync(path.join(exchangesDir, f), 'utf8')) as ModelExchange
          ),
        rebuiltSource: readFileSync(path.join(dir, 'rebuilt.hsplus'), 'utf8'),
        status: JSON.parse(readFileSync(path.join(dir, 'rebuild-status.json'), 'utf8')),
        rules: existsSync(rulesPath)
          ? (JSON.parse(readFileSync(rulesPath, 'utf8')) as ClassificationRule[])
          : [],
      };
    });
}
