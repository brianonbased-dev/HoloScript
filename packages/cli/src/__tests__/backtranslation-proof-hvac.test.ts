/**
 * Back-translation proof on heating and cooling behaviours written from the
 * founder's own rules (board task_1791235614927_x7l2). Same pipeline as slice 3:
 * the author programs validate and the headless runtime admits them, the card
 * marks every outcome accepted or refused, agent-B rebuilds (Grok, recorded) are
 * measured for false alarms, and planted faults are checked for catches. The
 * planted faults are the ones Joseph named (fixtures/backtranslation/hvac/<id>/mutants.json).
 *
 *   corepack pnpm --filter @holoscript/cli exec vitest run \
 *     src/__tests__/backtranslation-proof-hvac.test.ts
 *
 * Record rebuilds: BACKTRANS_LIVE=1 BACKTRANS_SLICE=hvac (backtranslation-live.test.ts).
 * BACKTRANS_WRITE_RECEIPT=1 (re)writes interface-card.md and receipt.json.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { interfaceCardKindMismatches, renderInterfaceCard } from '@holoscript/core/testing';
import {
  GENERIC_SEED,
  generateGenericSituation,
  genericOutcomesSeen,
  makeGenericRunner,
  twinGeneric,
} from './backtranslation/generic';
import { checkBehaviourSource, faultsTheCheckerRefuses } from './backtranslation/pipeline';
import { classifyDivergences, measureBehaviour, type BehaviourMeasurement } from './backtranslation/measure';
import { HVAC_TARGETS, loadNamedMutants, loadRecordings, slice3Inputs } from './backtranslation/slice3';

const testDir = __dirname;
const worldSource = readFileSync(path.join(testDir, 'fixtures/model-village/village.holo'), 'utf8');
// 40, not 20: the compressor-wait faults first act differently in situations 23 (furnace) and 35 (heat pump).
const SITUATIONS = 40;
const write = process.env.BACKTRANS_WRITE_RECEIPT === '1';

const loaded = HVAC_TARGETS.map((target) => {
  const inputs = slice3Inputs(target);
  if (write) writeFileSync(path.join(target.dir, 'interface-card.md'), inputs.interfaceCard);
  return {
    target,
    ...inputs,
    mutants: loadNamedMutants(target, inputs.plantableSource),
    declaredMutants: loadNamedMutants(target, inputs.originalSource),
    recordings: loadRecordings(target),
    run: makeGenericRunner(worldSource, inputs.spec),
  };
});

const measurements = new Map<string, Promise<BehaviourMeasurement>>();
function measured(l: (typeof loaded)[number], recording: string, rebuiltSource: string) {
  const key = `${l.target.id}/${recording}`;
  let m = measurements.get(key);
  if (!m) {
    m = measureBehaviour({
      spec: l.spec,
      run: l.run,
      originalSource: l.originalSource,
      rebuiltSource,
      mutants: l.mutants,
      situations: SITUATIONS,
      seed: GENERIC_SEED,
    });
    measurements.set(key, m);
  }
  return m;
}

describe('back-translation proof — heating and cooling, from the founder\'s rules', () => {
  for (const l of loaded) {
    describe(l.target.id, () => {
      it('the author program validates and the headless runtime admits it', () => {
        expect(checkBehaviourSource(l.originalSource)).toEqual({ valid: true, errors: [] });
      });

      it('the card on disk is the rendered interface.json, and the card derived from the outcomes the program declares is identical', () => {
        expect(readFileSync(path.join(l.target.dir, 'interface-card.md'), 'utf8')).toBe(l.interfaceCard);
        expect(l.derivedInterfaceSpec).toEqual(l.interfaceSpec);
        expect(renderInterfaceCard(l.derivedInterfaceSpec)).toBe(l.interfaceCard);
        expect(interfaceCardKindMismatches(l.interfaceSpec, l.originalSource)).toEqual([]);
        expect(l.interfaceSpec.publicState).toEqual(l.spec.publicStateKeys);
        expect(l.referenceCard).not.toContain(l.spec.title);
      });

      it('named faults are planted in what the program does; with its outcome lists kept, the checker refuses none of them', () => {
        // The founder's named faults are wrong behaviour on real equipment, not
        // contract slips, so all of them must still reach a rebuild comparison.
        expect(faultsTheCheckerRefuses(l.mutants, l.declaredMutants)).toEqual([]);
      });

      it('the situations reach every reading answer on the card', () => {
        const seen = new Set<string>();
        for (let i = 0; i < SITUATIONS; i++) {
          for (const o of genericOutcomesSeen(l.spec, l.originalSource, generateGenericSituation(l.spec, GENERIC_SEED, i))) {
            seen.add(o);
          }
        }
        const reading = l.interfaceSpec.actions.find((a) => a.name === 'reading')!;
        const missing = reading.outcomes.map((o) => `reading:${o.name}`).filter((o) => !seen.has(o));
        expect(missing, `never reached: ${missing.join(', ')}`).toEqual([]);
      });

      it(
        'every named fault applies, validates, and acts differently from the correct program somewhere',
        async () => {
          expect(l.mutants.length).toBeGreaterThanOrEqual(4);
          for (const m of l.mutants) {
            expect(checkBehaviourSource(m.source).valid, m.id).toBe(true);
            const twin = await twinGeneric({
              spec: l.spec,
              name: `${l.target.id}:original-vs-${m.id}`,
              run: l.run,
              a: { name: 'original', source: l.originalSource },
              b: { name: m.id, source: m.source },
              situations: SITUATIONS,
              seed: GENERIC_SEED,
            });
            expect(twin.divergences.length, `${m.id} never acts differently`).toBeGreaterThan(0);
          }
        },
        1_800_000
      );

      describe.runIf(l.recordings.length > 0)('recorded rebuilds', () => {
        for (const r of l.recordings) {
          it(
            `${r.recording}: the rebuild validates; false alarms are classified; planted faults measured`,
            async () => {
              expect(r.status.validated, `${r.recording} did not pass the checker`).toBe(true);
              const m = await measured(l, r.recording, r.rebuiltSource);
              expect(m.precheck.originalRanAllSituations).toBe(true);
              const classified = classifyDivergences(m.falseAlarmDivergences, r.rules);
              const unclassified = classified.filter((c) => c.classification === 'unclassified');
              expect(unclassified.map((c) => `${c.iteration}: ${c.difference}`)).toEqual([]);
              console.log(
                `[hvac] ${l.target.id} ${r.recording}: rounds=${r.status.rounds} caught=${m.caught}/${m.planted} ` +
                  `falseAlarms=${m.falseAlarmDivergences.length}/${SITUATIONS} ` +
                  `classes=${JSON.stringify(classified.map((c) => c.classification))}`
              );
            },
            1_800_000
          );
        }
      });
    });
  }

  it.runIf(write)(
    'writes receipts',
    async () => {
      for (const l of loaded) {
        const recordings = [];
        for (const r of l.recordings) {
          const m = await measured(l, r.recording, r.rebuiltSource);
          recordings.push({
            recording: r.recording,
            rounds: r.status.rounds,
            validated: r.status.validated,
            model: r.status.model,
            caught: m.caught,
            planted: m.planted,
            mutants: m.mutants,
            falseAlarms: classifyDivergences(m.falseAlarmDivergences, r.rules),
            situations: SITUATIONS,
          });
        }
        writeFileSync(
          path.join(l.target.dir, 'receipt.json'),
          `${JSON.stringify(
            {
              behaviourId: l.target.id,
              generatedAt: process.env.BACKTRANS_RECEIPT_TIME ?? new Date().toISOString(),
              checklist: l.checklist,
              interfaceCard: l.interfaceCard,
              namedFaults: l.mutants.map((m) => ({ id: m.id, description: m.description })),
              recordings,
            },
            null,
            2
          )}\n`
        );
        expect(existsSync(path.join(l.target.dir, 'receipt.json'))).toBe(true);
      }
    },
    1_800_000
  );
});
