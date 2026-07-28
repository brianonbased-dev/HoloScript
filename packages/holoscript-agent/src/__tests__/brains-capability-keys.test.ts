/**
 * Regression guard for brain capability keys (board xi5o).
 *
 * The capability router's `satisfies()` (capability-router.ts) matches a brain's
 * `requires` / `prefers` / `avoids` strings VERBATIM against the camelCase keys of
 * the `Capabilities` interface (@holoscript/llm-provider). There is NO snake_case
 * normalization — a snake_case or typo'd key matches nothing, which:
 *   - in `requires` → the key is never satisfied → EVERY provider is ineligible →
 *     `NoEligibleProviderError` (the brain is silently unroutable);
 *   - in `prefers` / `avoids` → the entry is a silent no-op.
 *
 * paper-researcher.hsplus shipped `requires: ["long_context", "web_search"]`
 * (snake_case) — matching NOTHING on Capabilities — so it always threw
 * NoEligibleProviderError. This guard loads EVERY shipped .hsplus brain and
 * asserts each requires/prefers/avoids entry is a real Capabilities key, so a
 * snake_case / typo'd key fails CI instead of silently breaking routing.
 */

import { describe, it, expect } from 'vitest';
import { readdirSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { dirname, resolve, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import type { Capabilities, LLMProviderName } from '@holoscript/llm-provider';
import { loadBrain } from '../brain.js';
import {
  pickProvider,
  NoEligibleProviderError,
  type RoutingCandidate,
  type BrainRequirements,
} from '../capability-router.js';

const HERE = dirname(fileURLToPath(import.meta.url));
const BRAINS_DIR = resolve(HERE, '..', 'brains');

/**
 * Allowlist of every valid `Capabilities` key.
 *
 * COMPILER-SYNCED: the `Record<keyof Capabilities, true>` annotation makes `tsc`
 * fail if this map omits an interface key or lists a key the interface does not
 * declare — so the allowlist cannot silently drift from the type. `Object.keys()`
 * produces the runtime set the assertions use. (DEFAULT_CAPABILITIES only carries
 * the ~6 always-declared keys, so it can NOT be used as the allowlist — the
 * optional superpower keys like `liveWebSearch` / `imageGeneration` are valid
 * routing keys and must be accepted.)
 */
const CAPABILITY_KEY_MAP: Record<keyof Capabilities, true> = {
  contextWindow: true,
  maxOutput: true,
  costPerMillion: true,
  streaming: true,
  tools: true,
  vision: true,
  highResVision: true,
  videoInput: true,
  audioInput: true,
  audioOutput: true,
  streamingSpeechGeneration: true,
  imageGeneration: true,
  videoGeneration: true,
  videoEditing: true,
  imageAnimation: true,
  conversationalMediaEditing: true,
  visibleReasoning: true,
  adjustableEffort: true,
  liveWebSearch: true,
  hostedShell: true,
  codeExecutionSandbox: true,
  computerUse: true,
  fileSearchBuiltIn: true,
  promptCaching: true,
  perLoopBudget: true,
  serverSideCompaction: true,
  hostedAgenticLoop: true,
  persistentMemoryStore: true,
  structuredOutputs: true,
  embeddings: true,
  batchApi: true,
  realtimeVoice: true,
  embeddedChatUI: true,
  appsIframeSurface: true,
  mcpServerMode: true,
  appWorktrees: true,
  evalsFirstParty: true,
  local: true,
  zeroMarginalInference: true,
  bedrockAvailable: true,
  vertexAvailable: true,
  bearerTokenAccess: true,
};

const VALID_CAPABILITY_KEYS = new Set<string>(Object.keys(CAPABILITY_KEY_MAP));

/** Return the entries that are NOT valid Capabilities keys. */
function invalidCapabilityKeys(keys: readonly string[]): string[] {
  return keys.filter((k) => !VALID_CAPABILITY_KEYS.has(k));
}

function listBrainFiles(): string[] {
  return readdirSync(BRAINS_DIR)
    .filter((f) => f.endsWith('.hsplus'))
    .map((f) => join(BRAINS_DIR, f))
    .sort();
}

// ─── Guard: every shipped brain declares only valid camelCase keys ────────────

describe('shipped brain capability keys are valid Capabilities keys', () => {
  const brainFiles = listBrainFiles();

  it('discovers the shipped .hsplus brains under src/brains/', () => {
    expect(brainFiles.length).toBeGreaterThan(0);
  });

  it.each(brainFiles.map((p) => [basename(p), p] as const))(
    'brain %s — requires/prefers/avoids are all valid Capabilities keys',
    async (name, path) => {
      const brain = await loadBrain(path);
      const all = [...brain.requires, ...brain.prefers, ...brain.avoids];
      const invalid = invalidCapabilityKeys(all);
      expect(
        invalid,
        `${name} declares capability key(s) that do not exist on the Capabilities ` +
          `interface (snake_case / typo → unroutable): [${invalid.join(', ')}]`
      ).toEqual([]);
    }
  );

  it('the allowlist accepts the fixed camelCase keys and rejects the old snake_case ones (self-proof)', () => {
    // The exact keys the pre-fix paper-researcher brain shipped — must be flagged.
    expect(
      invalidCapabilityKeys(['long_context', 'web_search', 'deep_reasoning', 'code_execution'])
    ).toEqual(['long_context', 'web_search', 'deep_reasoning', 'code_execution']);
    // Their fixed camelCase forms — must be accepted.
    expect(
      invalidCapabilityKeys([
        'contextWindow',
        'liveWebSearch',
        'visibleReasoning',
        'codeExecutionSandbox',
      ])
    ).toEqual([]);
  });

  it('end-to-end: a brain file with a snake_case key is caught by the guard (would fail CI)', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'brain-key-guard-'));
    try {
      const badBrain = [
        'You are a test brain.',
        '',
        '#version 6.0.0',
        'identity {',
        '  domain: "test"',
        '  requires: ["long_context"]',
        '  prefers: ["deep_reasoning"]',
        '  avoids: []',
        '}',
        '',
      ].join('\n');
      const p = join(dir, 'bad.hsplus');
      writeFileSync(p, badBrain, 'utf8');
      const brain = await loadBrain(p);
      const all = [...brain.requires, ...brain.prefers, ...brain.avoids];
      // If this ever returns [] the guard has stopped catching the bug it exists for.
      expect(invalidCapabilityKeys(all)).toEqual(['long_context', 'deep_reasoning']);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── paper-researcher routes after the camelCase fix ──────────────────────────

describe('paper-researcher resolves to an eligible provider after the camelCase fix', () => {
  function caps(overrides: Partial<Capabilities>): Capabilities {
    return {
      contextWindow: 0,
      maxOutput: 0,
      streaming: true,
      tools: true,
      vision: false,
      bearerTokenAccess: true,
      ...overrides,
    };
  }

  // A provider matching the paper-researcher profile: large context window + live
  // web search, WITHOUT image-generation or a code-execution sandbox. Synthetic
  // (like capability-router.test.ts) so the assertion isolates the routing LOGIC
  // from whichever real providers happen to ship — every real large-context+web
  // provider (anthropic/gemini/xai) also declares imageGeneration or
  // codeExecutionSandbox, which this brain avoids, so a fixed synthetic fixture is
  // the deterministic way to prove the keys now route.
  const RESEARCH_FIT: RoutingCandidate = {
    name: 'anthropic',
    capabilities: caps({
      contextWindow: 1_000_000,
      liveWebSearch: true,
      visibleReasoning: true,
    }),
  };

  // Satisfies requires (context + web search) but is excluded by avoids: imageGeneration.
  const IMAGE_GEN: RoutingCandidate = {
    name: 'openai',
    capabilities: caps({
      contextWindow: 400_000,
      liveWebSearch: true,
      imageGeneration: true,
    }),
  };

  it('loads the real brain and pickProvider returns an eligible provider (no throw)', async () => {
    const brain = await loadBrain(resolve(BRAINS_DIR, 'paper-researcher.hsplus'));

    // The fix landed: exact camelCase keys parsed from the real file.
    expect(brain.requires).toEqual(['contextWindow', 'liveWebSearch']);
    expect(brain.prefers).toEqual(['visibleReasoning']);
    expect(brain.avoids).toEqual(['imageGeneration', 'codeExecutionSandbox']);
    expect(invalidCapabilityKeys([...brain.requires, ...brain.prefers, ...brain.avoids])).toEqual(
      []
    );

    const req: BrainRequirements = {
      requires: brain.requires,
      prefers: brain.prefers,
      avoids: brain.avoids,
    };
    const decision = pickProvider({ brain: req, candidates: [RESEARCH_FIT, IMAGE_GEN] });
    expect(decision.picked).toBe('anthropic');
    expect(decision.reason).toBe('capability-best-fit');
    expect(decision.matchedPrefers).toContain('visibleReasoning');
    expect(decision.excludedByAvoids).toContain('openai'); // imageGeneration → avoided
    // False cases (G.GOLD.013): must NOT throw and must NOT pick the avoided provider.
    expect(decision.picked).not.toBe('openai');
    expect(decision.unsatisfiedRequires).toEqual([]);
  });

  it('regression: the pre-fix snake_case requires made EVERY provider ineligible', () => {
    // This is the exact failure the fix resolves — the same candidates, but the old
    // snake_case `requires` match nothing, so no provider is eligible.
    expect(() =>
      pickProvider({
        brain: {
          requires: ['long_context', 'web_search'],
          prefers: [],
          avoids: [],
        } as BrainRequirements,
        candidates: [RESEARCH_FIT, IMAGE_GEN],
      })
    ).toThrow(NoEligibleProviderError);
  });
});

// Keep an explicit reference to the type import so the LLMProviderName import is
// used (candidate `name` fields are LLMProviderName-typed above).
const _typeAnchor: LLMProviderName = 'anthropic';
void _typeAnchor;
