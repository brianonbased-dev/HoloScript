/**
 * Back-translation proof, slice 3 (board task_1791235614927_x7l2).
 *
 * Changes from slice 2:
 *   1. The interface card marks every outcome as accepted (may change state)
 *      or refused (changes nothing) — a host contract fact, rendered from
 *      interface.json and proved against the correct program.
 *   2. Measured on three NEW behaviours (slice-2 behaviours were used to tune
 *      the card; re-measuring them would fit the test).
 *   3. Several fresh agent-B recordings per behaviour (same inputs), each
 *      measured on its own, with the spread reported.
 * The slice-2 keypad door is re-run with the new card as a separate
 * before/after check that never counts toward the score.
 *
 * Deterministic: replays recorded agent-B output.
 *
 *   corepack pnpm --filter @holoscript/cli exec vitest run \
 *     src/__tests__/backtranslation-proof-slice3.test.ts
 *
 * BACKTRANS_WRITE_RECEIPT=1 (re)writes receipts and summaries. Record agent B
 * with backtranslation-live.test.ts (BACKTRANS_LIVE=1 BACKTRANS_SLICE=3).
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  interfaceCardKindMismatches,
  renderInterfaceCard,
  renderCombinedSummaryV3,
  renderPlainSummaryV3,
  selectDecisionMutants,
  spreadOf,
  stableReceiptJson,
  withinFalseAlarmTolerance,
  type BackTranslationReceiptV3,
  type ClassifiedDivergence,
  type DivergenceClass,
  type RecordingMeasurement,
} from '@holoscript/core/testing';
import {
  GENERIC_SEED,
  GENERIC_SITUATIONS,
  generateGenericSituation,
  genericOutcomesSeen,
  makeGenericRunner,
} from './backtranslation/generic';
import {
  EXCLUDED_FIELDS,
  ORACLE_FIELDS,
  checkBehaviourSource,
  faultsTheCheckerRefuses,
} from './backtranslation/pipeline';
import {
  BLIND_ORACLE,
  CATCH_BAR,
  classifyDivergences,
  measureBehaviour,
  meetsCatchBar,
  selectOracleVisibleMutants,
  type BehaviourMeasurement,
} from './backtranslation/measure';
import {
  CARD_DERIVATION_DIFFERENCES,
  derivedCardMatchesRecorded,
  FALSE_ALARM_TOLERANCE,
  SLICE3_MAX_REPAIRS,
  SLICE3_RECORDINGS,
  SLICE3_ROOT,
  SLICE3_TARGETS,
  loadRecordings,
  slice3Inputs,
  type Slice3Recording,
} from './backtranslation/slice3';

const testDir = __dirname;
const worldSource = readFileSync(path.join(testDir, 'fixtures/model-village/village.holo'), 'utf8');
const MUTANTS_PER_BEHAVIOUR = 6;

const loaded = SLICE3_TARGETS.map((target) => {
  const inputs = slice3Inputs(target);
  return {
    target,
    ...inputs,
    recordings: loadRecordings(target),
    run: makeGenericRunner(worldSource, inputs.spec),
  };
});
type Loaded = (typeof loaded)[number];

/** Decision-first mutants the oracle can see (equivalent mutants skipped and recorded). */
const mutantChoice = new Map<string, ReturnType<typeof selectOracleVisibleMutants>>();
function mutantsFor(l: Loaded): ReturnType<typeof selectOracleVisibleMutants> {
  let hit = mutantChoice.get(l.target.id);
  if (!hit) {
    hit = selectOracleVisibleMutants({
      spec: l.spec,
      run: l.run,
      originalSource: l.originalSource,
      pool: selectDecisionMutants(l.plantableSource, 4 * MUTANTS_PER_BEHAVIOUR),
      max: MUTANTS_PER_BEHAVIOUR,
      situations: GENERIC_SITUATIONS,
      seed: GENERIC_SEED,
    });
    mutantChoice.set(l.target.id, hit);
  }
  return hit;
}
const measuredTargets = loaded.filter((l) => l.target.role === 'measured');

const measurements = new Map<string, BehaviourMeasurement>();
async function measured(l: Loaded, r: Slice3Recording): Promise<BehaviourMeasurement> {
  const key = `${l.target.id}/${r.recording}`;
  let m = measurements.get(key);
  if (!m) {
    m = await measureBehaviour({
      spec: l.spec,
      run: l.run,
      originalSource: l.originalSource,
      rebuiltSource: r.rebuiltSource,
      mutants: (await mutantsFor(l)).mutants,
      situations: GENERIC_SITUATIONS,
      seed: GENERIC_SEED,
    });
    measurements.set(key, m);
  }
  return m;
}

describe('back-translation proof slice 3 — outcome kinds on the card, new behaviours, several rebuilds', () => {
  for (const l of loaded) {
    describe(l.target.id, () => {
      it('the author program validates and the headless runtime admits it', () => {
        expect(checkBehaviourSource(l.originalSource)).toEqual({ valid: true, errors: [] });
      });

      it('the card on disk is the rendered interface.json; the card derived from the outcomes the program declares matches it', () => {
        const onDisk = readFileSync(path.join(l.target.dir, 'interface-card.md'), 'utf8');
        expect(onDisk).toBe(l.interfaceCard);
        const { recordedWithDifference } = derivedCardMatchesRecorded(
          l.target.id,
          l.derivedInterfaceSpec,
          l.interfaceSpec
        );
        expect(l.derivedInterfaceSpec).toEqual(recordedWithDifference);
        if (!CARD_DERIVATION_DIFFERENCES[l.target.id]) {
          expect(renderInterfaceCard(l.derivedInterfaceSpec)).toBe(onDisk);
        }
        expect(interfaceCardKindMismatches(l.interfaceSpec, l.originalSource)).toEqual([]);
        expect(l.interfaceSpec.title).toBe(l.spec.title);
        expect(l.interfaceSpec.publicState).toEqual(l.spec.publicStateKeys);
        const cardEntries = [
          ...l.interfaceSpec.actions.map((a) => a.name),
          ...l.interfaceSpec.observations.map((o) => o.name),
        ].sort();
        expect(cardEntries).toEqual(l.spec.actions.map((a) => a.name).sort());
        // The reference card example must not share the behaviour's name.
        expect(l.referenceCard).not.toContain(l.spec.title);
      });

      it(
        'faults are planted in what the program does; with its outcome lists kept, the checker refuses these before they run',
        async () => {
          const planted = (await mutantsFor(l)).mutants;
          const declared = selectDecisionMutants(l.originalSource, 4 * MUTANTS_PER_BEHAVIOUR);
          expect(faultsTheCheckerRefuses(planted, declared)).toEqual(CHECKER_REFUSES[l.target.id] ?? []);
        },
        900_000
      );

      it('the situations reach every outcome on the card, and at least 5 are edge situations', () => {
        const seen = new Set<string>();
        let edge = 0;
        for (let i = 0; i < GENERIC_SITUATIONS; i++) {
          const situation = generateGenericSituation(l.spec, GENERIC_SEED, i);
          if (situation.edge) edge++;
          for (const o of genericOutcomesSeen(l.spec, l.originalSource, situation)) seen.add(o);
        }
        expect(edge).toBeGreaterThanOrEqual(5);
        const onCard = l.interfaceSpec.actions.flatMap((a) =>
          a.outcomes.map((o) => `${a.name}:${o.name}`)
        );
        const missing = onCard.filter((o) => !seen.has(o));
        // Recorded honestly: outcomes the 20 situations never reach are listed in the receipt.
        expect(missing, `never reached: ${missing.join(', ')}`).toEqual(UNREACHED[l.target.id] ?? []);
      });

      if (l.target.role === 'measured') {
        it(`has ${SLICE3_RECORDINGS.length} independent recordings`, () => {
          expect(l.recordings.map((r) => r.recording)).toEqual([...SLICE3_RECORDINGS]);
        });
      }

      for (const r of l.recordings) {
        describe(r.recording, () => {
          it('agent B saw only the reference card, the card with outcome kinds and the checklist', () => {
            expect(r.exchanges.length).toBeGreaterThan(0);
            expect(r.exchanges.length).toBeLessThanOrEqual(1 + SLICE3_MAX_REPAIRS);
            for (const exchange of r.exchanges) {
              const sent = exchange.prompt.system + exchange.prompt.user;
              expect(sent).toContain(l.interfaceCard.trim());
              expect(sent).not.toContain(l.originalSource.trim());
              for (const line of l.originalSource.split('\n')) {
                const t = line.trim();
                if (/^(if \(|state\.\w+ [+\-]?=|emit\()/.test(t)) {
                  const fromOwnAttempt = r.exchanges.some(
                    (e) => e.round < exchange.round && e.extractedSource.includes(t)
                  );
                  if (!fromOwnAttempt) expect(sent, `prompt leaks: ${t}`).not.toContain(t);
                }
              }
            }
            // Fresh call: each recording's first prompt has no earlier attempt in it.
            expect(r.exchanges[0].prompt.user).not.toContain('## Your previous attempt');
          });

          it('the recorded rebuild is the last exchange; the checker verdict is recorded', () => {
            const last = r.exchanges[r.exchanges.length - 1];
            expect(last.extractedSource).toBe(r.rebuiltSource);
            expect(checkBehaviourSource(r.rebuiltSource).valid).toBe(r.status.validated);
            expect(last.validation.valid).toBe(r.status.validated);
          });

          it('the rebuild returns every outcome with the kind the card marks (the slice-2 door misreading)', () => {
            expect(interfaceCardKindMismatches(l.interfaceSpec, r.rebuiltSource)).toEqual([]);
          });

          it(
            'original really runs everywhere, every planted fault is visible to the oracle, every false alarm is classified',
            async () => {
              const m = await measured(l, r);
              expect(m.precheck.failures).toEqual([]);
              expect(m.edgeSituations).toBeGreaterThanOrEqual(5);
              expect(m.mutants.length).toBeGreaterThanOrEqual(4);
              expect(m.mutants.length).toBeLessThanOrEqual(6);
              expect(m.oracleVisible).toBe(m.planted);
              for (const d of classifyDivergences(m.falseAlarmDivergences, r.rules)) {
                expect(d.classification, `situation ${d.iteration}: ${d.rationale}`).not.toBe(
                  'unclassified'
                );
              }
            },
            900_000
          );
        });
      }
    });
  }

  it(
    'the slice-3 score (new behaviours only) is what the verdict says, and collapses when the oracle is blinded',
    async () => {
      let planted = 0;
      let caught = 0;
      for (const l of measuredTargets) {
        for (const r of l.recordings) {
          const m = await measured(l, r);
          planted += m.planted;
          caught += m.caught;
        }
      }
      expect(planted).toBeGreaterThan(0);
      const verdict = readCombinedVerdict();
      if (verdict.recorded) {
        expect({ planted, caught }).toEqual({ planted: verdict.planted, caught: verdict.caught });
        expect(meetsCatchBar({ catchRate: caught / planted })).toBe(verdict.meetsCatchBar);
      }

      // Fault feed: blind the oracle. Same runs (cached), same mutants: the
      // catch rate must fall below the bar, or it was never measuring anything.
      let blindPlanted = 0;
      let blindCaught = 0;
      for (const l of measuredTargets) {
        for (const r of l.recordings) {
          const blind = await measureBehaviour({
            spec: l.spec,
            run: l.run,
            originalSource: l.originalSource,
            rebuiltSource: r.rebuiltSource,
            mutants: (await mutantsFor(l)).mutants,
            situations: GENERIC_SITUATIONS,
            seed: GENERIC_SEED,
            oracle: BLIND_ORACLE,
          });
          blindPlanted += blind.planted;
          blindCaught += blind.caught;
        }
      }
      expect(blindPlanted).toBe(planted);
      expect(blindCaught).toBe(0);
      expect(meetsCatchBar({ catchRate: blindCaught / blindPlanted })).toBe(false);
    },
    1_800_000
  );

  it(
    'writes receipts and summaries',
    async () => {
      const receipts: BackTranslationReceiptV3[] = [];
      for (const l of loaded) receipts.push(await buildReceipt(l));
      const verdict = readCombinedVerdict();
      if (process.env.BACKTRANS_WRITE_RECEIPT === '1') {
        for (const r of receipts) {
          const t = SLICE3_TARGETS.find((x) => x.id === r.behaviourId)!;
          writeFileSync(path.join(t.dir, 'receipt.json'), stableReceiptJson(r));
          writeFileSync(path.join(t.dir, 'summary.md'), renderPlainSummaryV3(r, FALSE_ALARM_TOLERANCE));
        }
        writeFileSync(
          path.join(SLICE3_ROOT, 'combined-summary.md'),
          renderCombinedSummaryV3(receipts, CATCH_BAR, FALSE_ALARM_TOLERANCE, verdict.verdict)
        );
      }
      expect(receipts).toHaveLength(SLICE3_TARGETS.length);
      // Print the table the verdict is written from.
      for (const r of receipts) {
        for (const m of r.recordings) {
          console.log(
            `[slice3] ${r.role} ${r.behaviourId} ${m.recording}: rounds=${m.rounds} validated=${m.validated} ` +
              `caught=${m.catch.caught}/${m.catch.planted} falseAlarms=${m.falseAlarms.divergentSituations}/${m.falseAlarms.situations} ` +
              `within=${withinFalseAlarmTolerance(m, FALSE_ALARM_TOLERANCE)} tokens=${m.usage.totalTokens}`
          );
        }
      }
    },
    1_800_000
  );
});

/**
 * Outcomes on a measured card that the 20 seeded situations never reach,
 * recorded so the receipt says what the measurement did not exercise.
 */
const UNREACHED: Record<string, string[]> = {
  // Slice-2 situations for the door (kept unchanged for the before/after
  // check) never clear a lockout with the right manager code.
  'door-before-after': ['resetLockout:lockout_cleared'],
};

/**
 * Planted faults that contradict the program's own outcome lists once the
 * program declares them (board task_1791419247017_jri7). They are still
 * measured as slice 3 recorded them (planted in the program without its lists),
 * but in real use the checker would refuse them before any rebuild is needed.
 */
const CHECKER_REFUSES: Record<string, string[]> = {
  // Flips the fine_unpaid refusal to allowed: true; fine_unpaid is declared refused (HSP502).
  'bike-share-account': ['boolean-flip#0'],
};

function readCombinedVerdict(): {
  recorded: boolean;
  verdict: string;
  planted: number;
  caught: number;
  meetsCatchBar: boolean;
} {
  const p = path.join(SLICE3_ROOT, 'combined-verdict.json');
  if (!existsSync(p)) return { recorded: false, verdict: 'pending', planted: 0, caught: 0, meetsCatchBar: false };
  const v = JSON.parse(readFileSync(p, 'utf8'));
  return { recorded: true, ...v };
}

async function buildReceipt(l: Loaded): Promise<BackTranslationReceiptV3> {
  const recordings: RecordingMeasurement[] = [];
  let precheck = { originalRanAllSituations: true, situationsRun: GENERIC_SITUATIONS };
  let edgeSituations = 0;
  for (const r of l.recordings) {
    const m = await measured(l, r);
    precheck = {
      originalRanAllSituations: m.precheck.originalRanAllSituations,
      situationsRun: m.precheck.situationsRun,
    };
    edgeSituations = m.edgeSituations;
    const classified = classifyDivergences(m.falseAlarmDivergences, r.rules) as ClassifiedDivergence[];
    const byClass: Record<DivergenceClass, number> = { 'real-fault': 0, 'checklist-ambiguity': 0, 'b-error': 0 };
    for (const d of classified) byClass[d.classification]++;
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    for (const e of r.exchanges) {
      usage.promptTokens += e.usage?.promptTokens ?? 0;
      usage.completionTokens += e.usage?.completionTokens ?? 0;
      usage.totalTokens += e.usage?.totalTokens ?? 0;
    }
    const rel = path.relative(path.join(testDir, '..', '..', '..', '..'), r.dir).split(path.sep).join('/');
    recordings.push({
      recording: r.recording,
      model: r.exchanges[0]?.reportedModel ?? r.status.model,
      rounds: r.exchanges.length,
      validated: r.status.validated,
      exchangesDir: `${rel}/exchanges`,
      rebuiltSourcePath: `${rel}/rebuilt.hsplus`,
      usage,
      falseAlarms: {
        situations: m.situations,
        divergentSituations: m.falseAlarmDivergences.length,
        byClass,
        divergences: classified,
      },
      catch: {
        planted: m.planted,
        oracleVisible: m.oracleVisible,
        caught: m.caught,
        catchRate: m.catchRate,
        mutants: m.mutants,
      },
    });
  }
  const verdictPath = path.join(l.target.dir, 'verdict.json');
  return {
    schema: 'holoscript.back-translation-proof.v3',
    behaviourId: l.target.id,
    title: l.spec.title,
    role: l.target.role,
    generatedAt: process.env.BACKTRANS_RECEIPT_TIME ?? new Date().toISOString(),
    runSurface: {
      branch: 'feat/back-translation-proof (worktree)',
      commit: safeGit(['rev-parse', 'HEAD']),
      note: 'slice 3 on top of slice 2; recordings replayed, not live',
    },
    checklist: l.checklist,
    interfaceCard: l.interfaceCard,
    plainLanguageCheck: {
      tool: 'C:/holo-dev/ai-ecosystem/scripts/check-plain-language.mjs --profile canon --check --strict',
      exitCode: 0,
      findings: 'Files with findings: 0; BLOCK-tier 0; WARN-tier 0',
    },
    rebuild: {
      provider: 'xai',
      seesOriginalSource: false,
      inputs: [
        'language-reference-v2.md',
        'interface-card.md (names only, each outcome marked accepted or refused)',
        'checklist.json (rules, rendered as numbered lines)',
        'checker errors (repair rounds only)',
      ],
      checker: 'validateCanonicalSource + deterministic headless runtime admission',
      maxRepairRounds: SLICE3_MAX_REPAIRS,
      recordedNotLive: true,
    },
    twin: {
      harness: '@holoscript/core/testing runTwinTest',
      runner:
        'runHeadlessExperimentSources (world=model-village village.holo, plan=generated .hs per situation, behaviour=under test)',
      generator:
        'generic: seeded random action sequences from behaviour.json (action list, parameter ranges, named edge values); every 4th situation is an edge situation',
      situations: GENERIC_SITUATIONS,
      edgeSituations,
      seed: GENERIC_SEED,
      oracleFields: ORACLE_FIELDS,
      excludedFields: EXCLUDED_FIELDS,
    },
    precheck,
    skippedMutants: (await mutantsFor(l)).skipped,
    recordings,
    spread: {
      catchRate: spreadOf(recordings.map((m) => m.catch.catchRate)),
      falseAlarmSituations: spreadOf(recordings.map((m) => m.falseAlarms.divergentSituations)),
    },
    verdict: existsSync(verdictPath)
      ? (JSON.parse(readFileSync(verdictPath, 'utf8')) as { verdict: string }).verdict
      : 'pending',
  };
}

function safeGit(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: testDir, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
