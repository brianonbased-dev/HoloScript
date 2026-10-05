/**
 * LIVE agent-B rebuild for the back-translation proof (opt-in, spends money).
 *
 *   BACKTRANS_LIVE=1 corepack pnpm --filter @holoscript/cli exec vitest run \
 *     src/__tests__/backtranslation-live.test.ts
 *
 * Optional: BACKTRANS_LIVE_BEHAVIOURS=keypad-door,corner-shop (default: the
 * slice-2 behaviours; add model-village-behavior to re-record slice 1).
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
import { checkBehaviourSource, rebuildFromChecklist } from './backtranslation/pipeline';

const live = process.env.BACKTRANS_LIVE === '1';
const fixtureRoot = path.join(__dirname, 'fixtures/backtranslation');
const MODEL = process.env.BACKTRANS_XAI_MODEL ?? 'grok-4.3';
const BEHAVIOURS = (
  process.env.BACKTRANS_LIVE_BEHAVIOURS ?? 'keypad-door,corner-shop,greenhouse-thermostat'
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

describe.skipIf(!live)('back-translation LIVE rebuild (xAI)', () => {
  for (const behaviour of BEHAVIOURS) {
    it(
      `agent B rebuilds ${behaviour} from the checklist (and interface card) alone`,
      async () => {
        const apiKey = process.env.XAI_API_KEY;
        expect(apiKey, 'XAI_API_KEY must be set in the environment').toBeTruthy();
        const adapter = new XAIAdapter({ apiKey: apiKey!, defaultModel: MODEL, timeoutMs: 180_000 });
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
          complete: async (system, user) => {
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
          },
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
