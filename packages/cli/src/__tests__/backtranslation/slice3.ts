/**
 * Back-translation proof, slice 3 — fixture layout shared by the live recorder
 * and the deterministic replay test.
 *
 *   fixtures/backtranslation/slice3/<id>/
 *     original.hsplus, behaviour.json, checklist.json   (measured behaviours)
 *     interface.json        names + outcome kinds (the card's source)
 *     interface-card.md     the exact card text B saw (rendered from interface.json)
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
  renderInterfaceCard,
  type BehaviourChecklist,
  type InterfaceCardSpec,
  type ModelExchange,
} from '@holoscript/core/testing';
import type { BehaviourSpec } from './generic';
import type { ClassificationRule } from './measure';

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
  checklist: BehaviourChecklist;
  interfaceSpec: InterfaceCardSpec;
  interfaceCard: string;
  referenceCard: string;
} {
  const fromSource = (f: string) => readFileSync(path.join(target.sourceDir, f), 'utf8');
  const interfaceSpec = JSON.parse(
    readFileSync(path.join(target.dir, 'interface.json'), 'utf8')
  ) as InterfaceCardSpec;
  return {
    spec: JSON.parse(fromSource('behaviour.json')) as BehaviourSpec,
    originalSource: fromSource('original.hsplus'),
    checklist: JSON.parse(fromSource('checklist.json')) as BehaviourChecklist,
    interfaceSpec,
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
