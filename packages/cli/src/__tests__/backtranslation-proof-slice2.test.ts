/**
 * Back-translation proof, slice 2 (board task_1791235614927_x7l2): three
 * behaviours with real decisions, measured the way real use works. There is
 * no trusted original: B's rebuild (from an interface card of names plus a
 * plain-language checklist of rules) stands for the intent, and a fault in the
 * author's program is caught when B disagrees with it where B agrees with the
 * correct program. Deterministic: replays recorded agent-B output.
 *
 *   corepack pnpm --filter @holoscript/cli exec vitest run \
 *     src/__tests__/backtranslation-proof-slice2.test.ts
 *
 * BACKTRANS_WRITE_RECEIPT=1 (re)writes each behaviour's receipt.json +
 * summary.md and the combined summary. Re-record B with
 * backtranslation-live.test.ts (BACKTRANS_LIVE=1).
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import {
  renderCombinedSummary,
  renderPlainSummaryV2,
  selectDecisionMutants,
  stableReceiptJson,
  type BackTranslationReceiptV2,
  type BehaviourChecklist,
  type ClassifiedDivergence,
  type DivergenceClass,
  type ModelExchange,
} from '@holoscript/core/testing';
import {
  GENERIC_SEED,
  GENERIC_SITUATIONS,
  makeGenericRunner,
  type BehaviourSpec,
} from './backtranslation/generic';
import {
  EXCLUDED_FIELDS,
  ORACLE_FIELDS,
  checkBehaviourSource,
  withoutOutcomeDeclarations,
} from './backtranslation/pipeline';
import {
  BLIND_ORACLE,
  CATCH_BAR,
  classifyDivergences,
  measureBehaviour,
  meetsCatchBar,
  type BehaviourMeasurement,
  type ClassificationRule,
} from './backtranslation/measure';

const testDir = __dirname;
const fixtureRoot = path.join(testDir, 'fixtures/backtranslation');
const worldSource = readFileSync(path.join(testDir, 'fixtures/model-village/village.holo'), 'utf8');
const BEHAVIOURS = ['keypad-door', 'corner-shop', 'greenhouse-thermostat'] as const;
const MUTANTS_PER_BEHAVIOUR = 6;

interface LoadedBehaviour {
  id: string;
  dir: string;
  spec: BehaviourSpec;
  originalSource: string;
  rebuiltSource: string;
  checklist: BehaviourChecklist;
  interfaceCard: string;
  exchanges: ModelExchange[];
  rules: ClassificationRule[];
  verdict: string;
  run: ReturnType<typeof makeGenericRunner>;
}

function load(id: string): LoadedBehaviour {
  const dir = path.join(fixtureRoot, id);
  const read = (f: string) => readFileSync(path.join(dir, f), 'utf8');
  const spec = JSON.parse(read('behaviour.json')) as BehaviourSpec;
  const exchangesDir = path.join(dir, 'exchanges');
  const verdictPath = path.join(dir, 'verdict.json');
  return {
    id,
    dir,
    spec,
    originalSource: read('original.hsplus'),
    rebuiltSource: read('rebuilt.hsplus'),
    checklist: JSON.parse(read('checklist.json')) as BehaviourChecklist,
    interfaceCard: read('interface-card.md'),
    exchanges: readdirSync(exchangesDir)
      .filter((f) => /^round-\d+\.json$/.test(f))
      .sort()
      .map((f) => JSON.parse(readFileSync(path.join(exchangesDir, f), 'utf8')) as ModelExchange),
    rules: JSON.parse(read('divergence-classification.json')) as ClassificationRule[],
    verdict: existsSync(verdictPath)
      ? (JSON.parse(readFileSync(verdictPath, 'utf8')) as { verdict: string }).verdict
      : 'pending',
    run: makeGenericRunner(worldSource, spec),
  };
}

const loaded = BEHAVIOURS.map(load);
const measurements = new Map<string, BehaviourMeasurement>();

async function measured(b: LoadedBehaviour): Promise<BehaviourMeasurement> {
  let m = measurements.get(b.id);
  if (!m) {
    m = await measureBehaviour({
      spec: b.spec,
      run: b.run,
      originalSource: b.originalSource,
      rebuiltSource: b.rebuiltSource,
      mutants: selectDecisionMutants(withoutOutcomeDeclarations(b.originalSource), MUTANTS_PER_BEHAVIOUR),
      situations: GENERIC_SITUATIONS,
      seed: GENERIC_SEED,
    });
    measurements.set(b.id, m);
  }
  return m;
}

describe('back-translation proof slice 2 — behaviours with real decisions', () => {
  it('reference card v2 example is real: the full checker accepts it', () => {
    const card = readFileSync(path.join(fixtureRoot, 'language-reference-v2.md'), 'utf8');
    const example = /## Example \(unrelated domain\)[\s\S]*?```hsplus\n([\s\S]*?)```/.exec(card);
    expect(example).not.toBeNull();
    expect(checkBehaviourSource(example![1])).toEqual({ valid: true, errors: [] });
    for (const b of loaded) expect(card).not.toContain(b.spec.title);
  });

  for (const b of loaded) {
    describe(b.id, () => {
      it('the author program validates and the headless runtime admits it', () => {
        expect(checkBehaviourSource(b.originalSource)).toEqual({ valid: true, errors: [] });
      });

      it('agent B saw only the reference card, the interface card and the checklist', () => {
        expect(b.exchanges.length).toBeGreaterThan(0);
        for (const exchange of b.exchanges) {
          const sent = exchange.prompt.system + exchange.prompt.user;
          expect(sent).toContain(b.interfaceCard.trim());
          expect(sent).not.toContain(b.originalSource.trim());
          // No line of the author's logic leaks into the prompt.
          for (const line of b.originalSource.split('\n')) {
            const t = line.trim();
            if (/^(if \(|state\.\w+ [+\-]?=|emit\()/.test(t)) {
              const fromOwnAttempt = b.exchanges.some(
                (e) => e.round < exchange.round && e.extractedSource.includes(t)
              );
              if (!fromOwnAttempt) expect(sent, `prompt leaks: ${t}`).not.toContain(t);
            }
          }
        }
      });

      it('the recorded rebuild passes the full checker', () => {
        expect(checkBehaviourSource(b.rebuiltSource)).toEqual({ valid: true, errors: [] });
        const last = b.exchanges[b.exchanges.length - 1];
        expect(last.validation.valid).toBe(true);
        expect(last.extractedSource).toBe(b.rebuiltSource);
      });

      it(
        'original really runs in every situation, every planted fault is visible to the oracle, every false alarm is classified',
        async () => {
          const m = await measured(b);
          expect(m.precheck.failures).toEqual([]);
          expect(m.edgeSituations).toBeGreaterThanOrEqual(5);
          expect(m.mutants.length).toBeGreaterThanOrEqual(4);
          expect(m.oracleVisible).toBe(m.planted);
          const classified = classifyDivergences(m.falseAlarmDivergences, b.rules);
          for (const d of classified) {
            expect(d.classification, `situation ${d.iteration}: ${d.rationale}`).not.toBe('unclassified');
          }
        },
        900_000
      );
    });
  }

  it(
    'the intent metric meets the bar, and fails it when the oracle is blinded',
    async () => {
      let planted = 0;
      let caught = 0;
      for (const b of loaded) {
        const m = await measured(b);
        planted += m.planted;
        caught += m.caught;
      }
      expect(meetsCatchBar({ catchRate: caught / planted })).toBe(true);

      // Fault feed: blind the oracle. Same runs (cached), same mutants; the
      // metric must collapse below the bar, or it was never measuring anything.
      let blindPlanted = 0;
      let blindCaught = 0;
      for (const b of loaded) {
        const blind = await measureBehaviour({
          spec: b.spec,
          run: b.run,
          originalSource: b.originalSource,
          rebuiltSource: b.rebuiltSource,
          mutants: selectDecisionMutants(withoutOutcomeDeclarations(b.originalSource), MUTANTS_PER_BEHAVIOUR),
          situations: GENERIC_SITUATIONS,
          seed: GENERIC_SEED,
          oracle: BLIND_ORACLE,
        });
        blindPlanted += blind.planted;
        blindCaught += blind.caught;
      }
      expect(blindPlanted).toBe(planted);
      expect(blindCaught).toBe(0);
      expect(meetsCatchBar({ catchRate: blindCaught / blindPlanted })).toBe(false);
    },
    900_000
  );

  it(
    'writes receipts and summaries',
    async () => {
      const receipts: BackTranslationReceiptV2[] = [];
      for (const b of loaded) {
        const m = await measured(b);
        const classified = classifyDivergences(m.falseAlarmDivergences, b.rules) as ClassifiedDivergence[];
        const byClass: Record<DivergenceClass, number> = {
          'real-fault': 0,
          'checklist-ambiguity': 0,
          'b-error': 0,
        };
        for (const d of classified) byClass[d.classification]++;
        const firstAttempt = path.join(b.dir, 'first-attempt-validate-only');
        receipts.push({
          schema: 'holoscript.back-translation-proof.v2',
          behaviourId: b.id,
          title: b.spec.title,
          generatedAt: process.env.BACKTRANS_RECEIPT_TIME ?? new Date().toISOString(),
          runSurface: {
            branch: 'feat/back-translation-proof (worktree, on top of b6bd26573)',
            commit: safeGit(['rev-parse', 'HEAD']),
            note: 'origin/main base: .holo without a composition wrapper is still lenient (PR #509 not merged); all sources here use the composition wrapper.',
          },
          checklist: b.checklist,
          interfaceCard: b.interfaceCard,
          plainLanguageCheck: {
            tool: 'C:/holo-dev/ai-ecosystem/scripts/check-plain-language.mjs --profile canon --check --strict',
            exitCode: 0,
            findings: 'Files with findings: 0; BLOCK-tier 0; WARN-tier 0',
          },
          rebuild: {
            provider: 'xai',
            model: b.exchanges[0]?.reportedModel ?? b.exchanges[0]?.model ?? 'grok-4.3',
            seesOriginalSource: false,
            inputs: [
              'language-reference-v2.md',
              'interface-card.md (names only)',
              'checklist.json (rules, rendered as numbered lines)',
              'checker errors (repair rounds only)',
            ],
            checker: 'validateCanonicalSource + deterministic headless runtime admission',
            rounds: b.exchanges.length,
            validated: checkBehaviourSource(b.rebuiltSource).valid,
            exchangesDir: `packages/cli/src/__tests__/fixtures/backtranslation/${b.id}/exchanges`,
            rebuiltSourcePath: `packages/cli/src/__tests__/fixtures/backtranslation/${b.id}/rebuilt.hsplus`,
            recordedNotLive: true,
            ...(existsSync(firstAttempt)
              ? {
                  note: 'A first recording checked with the language checker alone is kept in first-attempt-validate-only/. That checker let through code the headless runner refuses, which is why the checker now also asks the runner.',
                }
              : {}),
          },
          twin: {
            harness: '@holoscript/core/testing runTwinTest',
            runner: 'runHeadlessExperimentSources (world=model-village village.holo, plan=generated .hs per situation, behaviour=under test)',
            generator: 'generic: seeded random action sequences from behaviour.json (action list, parameter ranges, named edge values); every 4th situation is an edge situation',
            situations: m.situations,
            edgeSituations: m.edgeSituations,
            seed: GENERIC_SEED,
            oracleFields: ORACLE_FIELDS,
            excludedFields: EXCLUDED_FIELDS,
          },
          precheck: {
            originalRanAllSituations: m.precheck.originalRanAllSituations,
            situationsRun: m.precheck.situationsRun,
          },
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
          verdict: b.verdict,
        });
      }
      const combinedVerdictPath = path.join(fixtureRoot, 'combined-verdict.json');
      const combinedVerdict = existsSync(combinedVerdictPath)
        ? (JSON.parse(readFileSync(combinedVerdictPath, 'utf8')) as { verdict: string }).verdict
        : 'pending';
      if (process.env.BACKTRANS_WRITE_RECEIPT === '1') {
        for (const r of receipts) {
          const dir = path.join(fixtureRoot, r.behaviourId);
          writeFileSync(path.join(dir, 'receipt.json'), stableReceiptJson(r));
          writeFileSync(path.join(dir, 'summary.md'), renderPlainSummaryV2(r));
        }
        writeFileSync(
          path.join(fixtureRoot, 'combined-summary.md'),
          renderCombinedSummary(receipts, CATCH_BAR, combinedVerdict)
        );
      }
      expect(receipts).toHaveLength(BEHAVIOURS.length);
    },
    900_000
  );
});

function safeGit(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: testDir, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
