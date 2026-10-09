/**
 * LIVE agent-B rebuild for the back-translation proof (opt-in, spends money).
 *
 *   BACKTRANS_LIVE=1 corepack pnpm --filter @holoscript/cli exec vitest run \
 *     src/__tests__/backtranslation-live.test.ts
 *
 * Optional: BACKTRANS_LIVE_BEHAVIOURS=keypad-door,corner-shop (default: the
 * slice-2 behaviours; add model-village-behavior to re-record slice 1).
 *
 * Slice 3: BACKTRANS_SLICE=3 records fresh rebuilds of the slice-3 targets
 * (cards with outcome kinds) into slice3/<id>/recordings/<rN>/. Optional:
 * BACKTRANS_LIVE_BEHAVIOURS=<ids> (default: all slice-3 targets),
 * BACKTRANS_RECORDINGS=r1,r2,r3 (default). BACKTRANS_SLICE=hvac records the two
 * heating and cooling behaviours (fixtures/backtranslation/hvac) the same way. An existing recording is never
 * overwritten unless BACKTRANS_OVERWRITE=1, so a rerun does not re-spend.
 *
 * Calls xAI Grok through @holoscript/llm-provider's XAIAdapter (no tools, no
 * filesystem: the model cannot read the original). The key comes from the
 * environment (XAI_API_KEY). Writes every exchange plus rebuilt.hsplus into the
 * behaviour's fixture directory; the deterministic proof test replays them.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { XAIAdapter } from '@holoscript/llm-provider';
import { renderChecklist, type BehaviourChecklist } from '@holoscript/core/testing';
import {
  checkBehaviourSource,
  rebuildFromChecklist,
  type CompletionFn,
} from './backtranslation/pipeline';
import {
  SLICE3_MAX_REPAIRS,
  SLICE3_RECORDINGS,
  HVAC_TARGETS,
  SLICE3_TARGETS,
  recordingDir,
  slice3Inputs,
} from './backtranslation/slice3';

const live = process.env.BACKTRANS_LIVE === '1';
const slice3 = process.env.BACKTRANS_SLICE === '3' || process.env.BACKTRANS_SLICE === 'hvac';
const hvac = process.env.BACKTRANS_SLICE === 'hvac';
const fixtureRoot = path.join(__dirname, 'fixtures/backtranslation');
const MODEL = process.env.BACKTRANS_XAI_MODEL ?? 'grok-4.3';
const BEHAVIOURS = (
  process.env.BACKTRANS_LIVE_BEHAVIOURS ?? 'keypad-door,corner-shop,greenhouse-thermostat'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

function xaiCompletion(): CompletionFn {
  const apiKey = process.env.XAI_API_KEY;
  expect(apiKey, 'XAI_API_KEY must be set in the environment').toBeTruthy();
  const adapter = new XAIAdapter({ apiKey: apiKey!, defaultModel: MODEL, timeoutMs: 180_000 });
  return async (system, user) => {
    const response = await adapter.complete(
      {
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
        temperature: 0,
        maxTokens: 4000,
      },
      MODEL
    );
    return {
      content: response.content,
      model: response.model,
      reportedModel: response.reportedModel ?? null,
      usage: response.usage as never,
    };
  };
}

describe.skipIf(!live || slice3)('back-translation LIVE rebuild (xAI)', () => {
  for (const behaviour of BEHAVIOURS) {
    it(
      `agent B rebuilds ${behaviour} from the checklist (and interface card) alone`,
      async () => {
        const sliceDir = path.join(fixtureRoot, behaviour);
        const checklist = JSON.parse(
          readFileSync(path.join(sliceDir, 'checklist.json'), 'utf8')
        ) as BehaviourChecklist;
        const interfacePath = path.join(sliceDir, 'interface-card.md');
        const interfaceCard = existsSync(interfacePath)
          ? readFileSync(interfacePath, 'utf8')
          : undefined;
        // Slice 2 uses reference card v2: the v1 example (a greenhouse heater) shared
        // its domain and a state name with the slice-2 thermostat behaviour.
        const referenceCard = readFileSync(
          path.join(
            fixtureRoot,
            interfaceCard === undefined ? 'language-reference.md' : 'language-reference-v2.md'
          ),
          'utf8'
        );

        const result = await rebuildFromChecklist({
          checklistText: renderChecklist(checklist),
          referenceCard,
          interfaceCard,
          // Slice 2 behaviours (with an interface card) use the full checker.
          checker: interfaceCard === undefined ? undefined : checkBehaviourSource,
          provider: 'xai',
          complete: xaiCompletion(),
        });

        const exchangesDir = path.join(sliceDir, 'exchanges');
        mkdirSync(exchangesDir, { recursive: true });
        for (const exchange of result.exchanges) {
          writeFileSync(
            path.join(exchangesDir, `round-${exchange.round}.json`),
            JSON.stringify(exchange, null, 2) + '\n'
          );
        }
        writeFileSync(path.join(sliceDir, 'rebuilt.hsplus'), result.source);
        writeFileSync(
          path.join(sliceDir, 'rebuild-status.json'),
          JSON.stringify(
            { rounds: result.exchanges.length, validated: result.validated, model: MODEL },
            null,
            2
          ) + '\n'
        );
        expect(result.exchanges.length).toBeGreaterThan(0);
      },
      600_000
    );
  }
});

describe.skipIf(!live || !slice3)('back-translation LIVE rebuild, slice 3 (xAI, several recordings)', () => {
  const wanted = process.env.BACKTRANS_LIVE_BEHAVIOURS?.split(',').map((s) => s.trim()).filter(Boolean);
  const recordings = (process.env.BACKTRANS_RECORDINGS ?? SLICE3_RECORDINGS.join(','))
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const targets = (hvac ? HVAC_TARGETS : SLICE3_TARGETS).filter((t) => !wanted || wanted.includes(t.id));
  for (const target of targets) {
    for (const recording of recordings) {
      it(
        `agent B rebuilds ${target.id} (${recording}) from the checklist and the card with outcome kinds`,
        async () => {
          const inputs = slice3Inputs(target);
          writeFileSync(path.join(target.dir, 'interface-card.md'), inputs.interfaceCard);
          const dir = recordingDir(target, recording);
          if (existsSync(path.join(dir, 'rebuilt.hsplus')) && process.env.BACKTRANS_OVERWRITE !== '1') {
            return; // already recorded; never re-spend by accident
          }
          // Fresh call per recording: same inputs, no shared conversation.
          const result = await rebuildFromChecklist({
            checklistText: renderChecklist(inputs.checklist),
            referenceCard: inputs.referenceCard,
            interfaceCard: inputs.interfaceCard,
            checker: checkBehaviourSource,
            maxRepairs: SLICE3_MAX_REPAIRS,
            provider: 'xai',
            complete: xaiCompletion(),
          });
          const exchangesDir = path.join(dir, 'exchanges');
          mkdirSync(exchangesDir, { recursive: true });
          for (const exchange of result.exchanges) {
            writeFileSync(
              path.join(exchangesDir, `round-${exchange.round}.json`),
              JSON.stringify(exchange, null, 2) + '\n'
            );
          }
          writeFileSync(path.join(dir, 'rebuilt.hsplus'), result.source);
          writeFileSync(
            path.join(dir, 'rebuild-status.json'),
            JSON.stringify(
              { rounds: result.exchanges.length, validated: result.validated, model: MODEL },
              null,
              2
            ) + '\n'
          );
          expect(result.exchanges.length).toBeGreaterThan(0);
        },
        600_000
      );
    }
  }
});
