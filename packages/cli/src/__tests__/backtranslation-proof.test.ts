/**
 * Back-translation proof, slice 1 (board task_1791235614927_x7l2): one
 * behaviour, end to end, deterministic (replays recorded agent-B output).
 *
 *   corepack pnpm --filter @holoscript/cli exec vitest run \
 *     src/__tests__/backtranslation-proof.test.ts
 *
 * Set BACKTRANS_WRITE_RECEIPT=1 to (re)write receipt.json + summary.md in the
 * slice directory. Re-record agent B with backtranslation-live.test.ts.
 */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { beforeAll, describe, expect, it } from 'vitest';
import { createDeterministicHsplusActionRuntime } from '@holoscript/engine/runtime';
import {
  renderPlainSummary,
  selectMutants,
  stableReceiptJson,
  type BackTranslationReceipt,
  type BehaviourChecklist,
  type ClassifiedDivergence,
  type DivergenceClass,
  type ModelExchange,
  type MutantOutcome,
} from '@holoscript/core/testing';
import {
  EXCLUDED_FIELDS,
  ORACLE_FIELDS,
  TWIN_SEED,
  TWIN_SITUATIONS,
  diffPaths,
  generateVillageSituation,
  makeCachedRunner,
  twinBehaviours,
  validateBehaviourSource,
} from './backtranslation/pipeline';

const testDir = __dirname;
const villageDir = path.join(testDir, 'fixtures/model-village');
const fixtureRoot = path.join(testDir, 'fixtures/backtranslation');
const sliceDir = path.join(fixtureRoot, 'model-village-behavior');

const worldSource = readFileSync(path.join(villageDir, 'village.holo'), 'utf8');
const originalSource = readFileSync(path.join(villageDir, 'behavior.hsplus'), 'utf8');
const checklist = JSON.parse(
  readFileSync(path.join(sliceDir, 'checklist.json'), 'utf8')
) as BehaviourChecklist;
const referenceCard = readFileSync(path.join(fixtureRoot, 'language-reference.md'), 'utf8');
const rebuiltPath = path.join(sliceDir, 'rebuilt.hsplus');
const hasRecording = existsSync(rebuiltPath);

const run = makeCachedRunner(worldSource);

/** A comment + whitespace change: different source bytes, identical behaviour. */
const cosmeticVariant = `// cosmetic: this line and the blank line below change only the source bytes\n\n${originalSource}`;

type ClassificationFile = Record<string, { classification: DivergenceClass; rationale: string }>;

describe('back-translation proof — model-village behaviour', () => {
  it('the reference card example given to agent B is real: it validates and the runtime admits it', () => {
    const example = /## Example \(unrelated domain\)[\s\S]*?```hsplus\n([\s\S]*?)```/.exec(referenceCard);
    expect(example).not.toBeNull();
    const validation = validateBehaviourSource(example![1]);
    expect(validation.errors).toEqual([]);
    expect(() => createDeterministicHsplusActionRuntime(example![1])).not.toThrow();
  });

  it('the original behaviour validates', () => {
    expect(validateBehaviourSource(originalSource)).toEqual({ valid: true, errors: [] });
  });

  it(
    'oracle sees behaviour, not source identity: original vs itself and vs a comment-only edit agree',
    async () => {
      // Liveness first: runTwinTest counts two IDENTICAL errors as agreement, so a
      // broken runner (bad plan encoding, missing build) would make every twin
      // test pass vacuously. The original must really run in every situation.
      for (let i = 0; i < TWIN_SITUATIONS; i++) {
        const situation = generateVillageSituation(TWIN_SEED, i);
        const result = await run(originalSource, situation);
        expect(result.execution.actionLedger.length).toBeGreaterThan(0);
      }
      const self = await twinBehaviours({
        name: 'original-vs-self',
        run,
        a: { name: 'original', source: originalSource },
        b: { name: 'original-copy', source: `${originalSource}` },
      });
      expect(self.divergences).toEqual([]);
      const cosmetic = await twinBehaviours({
        name: 'original-vs-cosmetic',
        run,
        a: { name: 'original', source: originalSource },
        b: { name: 'cosmetic', source: cosmeticVariant },
      });
      expect(cosmetic.divergences.map((d) => diffPaths(d.syndromeA, d.syndromeB))).toEqual([]);
      expect(cosmetic.iterationsRun).toBe(TWIN_SITUATIONS);
    },
    600_000
  );

  it(
    'every planted fault is caught by at least one situation',
    async () => {
      const mutants = selectMutants(originalSource, 5);
      expect(mutants.length).toBe(5);
      for (const mutant of mutants) {
        const result = await twinBehaviours({
          name: `original-vs-${mutant.id}`,
          run,
          a: { name: 'original', source: originalSource },
          b: { name: mutant.id, source: mutant.source },
        });
        expect(result.passed, `${mutant.id}: ${mutant.description} was not caught`).toBe(false);
      }
    },
    900_000
  );

  describe.skipIf(!hasRecording)('agent B rebuild (recorded)', () => {
    let rebuiltSource = '';
    let exchanges: ModelExchange[] = [];
    beforeAll(() => {
      rebuiltSource = readFileSync(rebuiltPath, 'utf8');
      const dir = path.join(sliceDir, 'exchanges');
      exchanges = readdirSync(dir)
        .filter((f) => /^round-\d+\.json$/.test(f))
        .sort()
        .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as ModelExchange);
    });

    it('agent B never received the original source', () => {
      const distinctive = [
        'Model Village Deterministic Behavior',
        'blocked_without_world_mutation',
        'fixture-private-adapter',
      ];
      for (const exchange of exchanges) {
        const sent = exchange.prompt.system + exchange.prompt.user;
        // The checklist legitimately carries these words; the original's code shape must not.
        expect(sent).not.toContain('state.water = state.water + amount');
        expect(sent).not.toContain('action contribute(amount)');
        expect(sent).not.toContain(originalSource.trim());
        for (const word of distinctive) expect(sent.split(word).length - 1).toBeLessThanOrEqual(3);
      }
    });

    it(
      'rebuild validates, then the twin test compares it with the original and writes the receipt',
      async () => {
        const validation = validateBehaviourSource(rebuiltSource);
        const vsRebuild = await twinBehaviours({
          name: 'original-vs-rebuild',
          run,
          a: { name: 'original', source: originalSource },
          b: { name: 'rebuild', source: rebuiltSource },
        });
        const classificationPath = path.join(sliceDir, 'divergence-classification.json');
        const classifications: ClassificationFile = existsSync(classificationPath)
          ? JSON.parse(readFileSync(classificationPath, 'utf8'))
          : {};
        const divergences: ClassifiedDivergence[] = vsRebuild.divergences.map((d) => {
          const difference =
            d.reason === 'syndrome-mismatch'
              ? diffPaths(d.syndromeA, d.syndromeB, '$', [], 3).join('; ')
              : `${d.reason}: ${JSON.stringify(d.reason === 'b-threw' ? d.outputB : d.outputA).slice(0, 300)}`;
          const c = classifications[String(d.iteration)];
          return {
            iteration: d.iteration,
            reason: d.reason,
            difference,
            classification: c?.classification ?? ('unclassified' as DivergenceClass),
            rationale: c?.rationale ?? 'not yet classified',
          };
        });
        for (const d of divergences) {
          expect(d.classification, `situation ${d.iteration} divergence must be classified: ${d.difference}`).not.toBe('unclassified');
        }

        // Faults (recomputed so the receipt carries per-mutant detail).
        const mutantOutcomes: MutantOutcome[] = [];
        for (const mutant of selectMutants(originalSource, 5)) {
          const r = await twinBehaviours({
            name: `original-vs-${mutant.id}`,
            run,
            a: { name: 'original', source: originalSource },
            b: { name: mutant.id, source: mutant.source },
          });
          const first = r.divergences[0];
          mutantOutcomes.push({
            id: mutant.id,
            operator: mutant.operator,
            description: mutant.description,
            change: `line ${mutant.line}: ${JSON.stringify(mutant.before)} -> ${JSON.stringify(mutant.after)}`,
            situations: r.iterationsRun,
            divergentSituations: r.divergences.length,
            caught: !r.passed,
            ...(first
              ? {
                  firstDivergence: {
                    iteration: first.iteration,
                    reason: first.reason,
                    detail:
                      first.reason === 'syndrome-mismatch'
                        ? diffPaths(first.syndromeA, first.syndromeB, '$', [], 2).join('; ')
                        : JSON.stringify(first.outputB).slice(0, 300),
                  },
                }
              : {}),
          });
        }
        const self = await twinBehaviours({
          name: 'original-vs-self',
          run,
          a: { name: 'original', source: originalSource },
          b: { name: 'original-copy', source: `${originalSource}` },
        });

        const status = JSON.parse(readFileSync(path.join(sliceDir, 'rebuild-status.json'), 'utf8'));
        const falseAlarms = divergences.filter((d) => d.classification === 'checklist-ambiguity').length;
        const caught = mutantOutcomes.filter((m) => m.caught).length;
        const verdictPath = path.join(sliceDir, 'verdict.json');
        const verdict = existsSync(verdictPath)
          ? (JSON.parse(readFileSync(verdictPath, 'utf8')) as { verdict: string; weakestLink: string })
          : { verdict: 'pending', weakestLink: 'pending' };

        const receipt: BackTranslationReceipt = {
          schema: 'holoscript.back-translation-proof.v1',
          behaviourId: checklist.behaviourId,
          generatedAt: process.env.BACKTRANS_RECEIPT_TIME ?? new Date().toISOString(),
          runSurface: {
            branch: 'feat/back-translation-proof (worktree from origin/main)',
            commit: safeGit(['rev-parse', 'HEAD']),
            note: 'origin/main: .holo without a composition wrapper is still lenient here (PR #509 not merged); all sources in this slice use the composition wrapper.',
          },
          checklist,
          plainLanguageCheck: {
            tool: 'C:/holo-dev/ai-ecosystem/scripts/check-plain-language.mjs --profile canon --check --strict',
            exitCode: 0,
            findings: 'Files with findings: 0; BLOCK-tier 0; WARN-tier 0',
          },
          rebuild: {
            provider: 'xai',
            model: exchanges[0]?.reportedModel ?? exchanges[0]?.model ?? status.model,
            seesOriginalSource: false,
            inputs: ['checklist.json (rendered as numbered lines)', 'language-reference.md', 'checker errors (repair rounds only)'],
            rounds: exchanges.length,
            validated: validation.valid,
            exchangesDir: 'packages/cli/src/__tests__/fixtures/backtranslation/model-village-behavior/exchanges',
            rebuiltSourcePath: 'packages/cli/src/__tests__/fixtures/backtranslation/model-village-behavior/rebuilt.hsplus',
            recordedNotLive: true,
          },
          twin: {
            harness: 'packages/core/src/testing/TwinTestHarness.ts runTwinTest',
            runner: 'packages/cli/src/headless-experiment.ts runHeadlessExperimentSources (world=village.holo, plan=generated .hs per situation, behaviour=under test)',
            situations: TWIN_SITUATIONS,
            seed: TWIN_SEED,
            oracleFields: ORACLE_FIELDS,
            excludedFields: EXCLUDED_FIELDS,
          },
          originalVsRebuild: {
            passed: vsRebuild.passed,
            divergentSituations: vsRebuild.divergences.length,
            divergences,
            falseAlarms,
          },
          originalVsSelf: { passed: self.passed, divergentSituations: self.divergences.length },
          faults: { planted: mutantOutcomes.length, caught, mutants: mutantOutcomes },
          verdict: verdict.verdict,
          weakestLink: verdict.weakestLink,
        };

        if (process.env.BACKTRANS_WRITE_RECEIPT === '1') {
          writeFileSync(path.join(sliceDir, 'receipt.json'), stableReceiptJson(receipt));
          writeFileSync(path.join(sliceDir, 'summary.md'), renderPlainSummary(receipt));
        }

        expect(self.passed).toBe(true);
        expect(caught).toBe(mutantOutcomes.length);
        expect(receipt.rebuild.validated).toBe(status.validated);
      },
      1_200_000
    );
  });
});

function safeGit(args: string[]): string {
  try {
    return execFileSync('git', args, { cwd: testDir, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}
