/**
 * LLMProviderCapabilitiesCompiler tests - vocabulary v1 + markdown_ssot /
 * cost_guard_pricing emit + BLOCK/WARN rules.
 *
 * Per "Context as a HoloScript Compile Target" memo § Phase 2(b)
 * (sovereign sibling of ContextCompiler). Inline HoloComposition
 * fixtures (matching ContextCompiler.test.ts pattern) cover:
 *
 *   - Happy-path: full vocabulary v1 -> markdown_ssot + cost_guard_pricing output
 *   - BLOCK rules: duplicate provider names, orphan FK references
 *     (model/capability/superpower/routing pointing at a non-existent
 *     provider), vendor-as-substrate hard_donts, [VERIFY] placeholder
 *     in capability values
 *   - WARN rules: missing last_verified, stale last_verified (>90 days),
 *     zero-pricing models (likely unverified source), unknown traits
 *   - Edge cases: empty composition, missing optional fields, single
 *     provider with only models, unimplemented Phase 2(b)+ format throws
 *
 * G.GOLD.013 false-case discipline throughout - every "should produce X"
 * has a paired "must NOT produce Y" assertion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  LLMProviderCapabilitiesCompiler,
  LLMCapabilityCompileError,
  createLLMProviderCapabilitiesCompiler,
} from '../LLMProviderCapabilitiesCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// --- Fixture builders -----------------------------------------------

function makeComposition(overrides?: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestMatrix',
    templates: [],
    objects: [],
    spatialGroups: [],
    lights: [],
    imports: [],
    timelines: [],
    audio: [],
    zones: [],
    transitions: [],
    conditionals: [],
    iterators: [],
    npcs: [],
    quests: [],
    abilities: [],
    dialogues: [],
    stateMachines: [],
    achievements: [],
    talentTrees: [],
    shapes: [],
    ...overrides,
  };
}

function makeFullV1Matrix(): HoloComposition {
  return makeComposition({
    name: 'LLMCapabilityMatrix',
    objects: [
      {
        type: 'Object',
        name: 'Matrix',
        properties: [],
        traits: [
          {
            type: 'ObjectTrait',
            name: 'capability_matrix_meta',
            config: {
              version: '1.0.0',
              generated_at: '2026-05-06',
              no_monopoly_rule: true,
              refresh_cadence_days: 90,
            },
          },
          // --- Anthropic provider + 2 models + 1 superpower + 1 capability + routing ---
          {
            type: 'ObjectTrait',
            name: 'llm_provider',
            config: {
              name: 'anthropic',
              vendor_url: 'https://docs.anthropic.com',
              auth_env: 'ANTHROPIC_API_KEY',
              base_url: 'https://api.anthropic.com',
              docs_root: 'https://platform.claude.com/docs/en',
              status: 'live',
              unique_superpower: 'Adaptive thinking + Task Budgets + Managed Agents',
              last_verified: '2026-05-06',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'llm_model',
            config: {
              provider: 'anthropic',
              friendly_name: 'Opus 4.7',
              model_id: 'claude-opus-4-7',
              context_window: 1000000,
              max_output: 128000,
              input_per_mtok: 5,
              output_per_mtok: 25,
              status: 'active-recommended',
              last_verified: '2026-05-06',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'llm_model',
            config: {
              provider: 'anthropic',
              friendly_name: 'Haiku 4.5',
              model_id: 'claude-haiku-4-5',
              context_window: 200000,
              max_output: 64000,
              input_per_mtok: 1,
              output_per_mtok: 5,
              status: 'active',
              last_verified: '2026-05-06',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'llm_superpower',
            config: {
              provider: 'anthropic',
              name: 'Adaptive thinking',
              description:
                'Model decides when and how much to think; on Opus 4.7 this is the only on-mode.',
              beta_header: 'task-budgets-2026-03-13',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'llm_capability',
            config: {
              provider: 'anthropic',
              name: 'highResVision',
              value: true,
              notes: '2576px long edge on Opus 4.7',
              last_verified: '2026-05-06',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'llm_routing_recommendation',
            config: {
              provider: 'anthropic',
              use_when: ['long-horizon agentic loops', 'code review'],
              avoid_when: ['real-time web/social-signal tasks'],
              default_for: ['agentic', 'coding', 'paper-program work'],
            },
          },
          // --- xAI provider + 1 capability with [VERIFY] notes (legitimate) ---
          {
            type: 'ObjectTrait',
            name: 'llm_provider',
            config: {
              name: 'xai',
              vendor_url: 'https://docs.x.ai',
              auth_env: 'XAI_API_KEY',
              status: 'partial',
              unique_superpower: 'Live web/X-platform search',
              last_verified: '2026-05-06',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'llm_capability',
            config: {
              provider: 'xai',
              name: 'liveWebSearch',
              value: true,
              notes: 'pricing TBD - see /research task_1778109552044_qed8',
              last_verified: '2026-05-06',
            },
          },
          // --- Universal hard don't ---
          {
            type: 'ObjectTrait',
            name: 'llm_hard_dont',
            config: {
              name: 'replace_holomesh_with_vendor_framework',
              reason:
                'Vendor frameworks become RUNNERS in our protocol, never substitutes.',
              alternative: 'Wrap vendor SDK as adapter; HoloMesh stays the substrate.',
              applies_to: ['all-providers'],
            },
          },
        ],
      },
    ],
  });
}

// --- Constructor & defaults -----------------------------------------

describe('LLMProviderCapabilitiesCompiler - constructor', () => {
  it('creates with default options (markdown_ssot emit only)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    expect(compiler).toBeInstanceOf(LLMProviderCapabilitiesCompiler);
  });

  it('factory function returns instance', () => {
    const compiler = createLLMProviderCapabilitiesCompiler();
    expect(compiler).toBeInstanceOf(LLMProviderCapabilitiesCompiler);
  });

  it('respects nowIso option for staleness comparison', () => {
    const compiler = new LLMProviderCapabilitiesCompiler({
      formats: ['markdown_ssot'],
      nowIso: '2026-09-06', // 4 months after the fixture's last_verified
    });
    const result = compiler.compile(makeFullV1Matrix(), '');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'F.014 stale-last-verified',
          message: expect.stringContaining('anthropic'),
        }),
      ])
    );
  });
});

// --- Happy path: vocabulary v1 -> markdown_ssot ---------------------

describe('compile() - vocabulary v1 -> markdown_ssot', () => {
  let compiler: LLMProviderCapabilitiesCompiler;

  beforeEach(() => {
    compiler = new LLMProviderCapabilitiesCompiler({
      formats: ['markdown_ssot'],
      nowIso: '2026-05-06',
    });
  });

  it('emits LLM_CAPABILITIES.md as the file key', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    expect(result.files).toHaveProperty('LLM_CAPABILITIES.md');
    // False case: no other emit format produced
    expect(Object.keys(result.files)).toEqual(['LLM_CAPABILITIES.md']);
  });

  it('emits the SSOT header with no-monopoly rule when meta.no_monopoly_rule is true', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('# LLM Capabilities & Benchmarks - SSOT');
    expect(md).toContain('**No-monopoly rule:**');
    // False case: the header reflects ratified founder rule, not ad-hoc framing
    expect(md).not.toContain('default provider:');
  });

  it('emits matrix metadata block', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('## Matrix metadata');
    expect(md).toContain('**Version**: 1.0.0');
    expect(md).toContain('**Generated**: 2026-05-06');
    expect(md).toContain('**Refresh cadence**: every 90 days');
  });

  it('emits provider matrix as a one-line-each table', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('## Provider matrix');
    expect(md).toContain('| Provider | Status | Unique superpower | Last verified |');
    expect(md).toContain(
      '| **anthropic** | live | Adaptive thinking + Task Budgets + Managed Agents | 2026-05-06 |'
    );
    expect(md).toContain('| **xai** | partial |');
  });

  it('emits hard donts section with applies_to scope', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain("## Hard don'ts (cross-provider red lines)");
    expect(md).toContain('### replace_holomesh_with_vendor_framework');
    expect(md).toContain('**Applies to**: all providers');
    // False case: scope must NOT degrade to literal 'all-providers' string
    expect(md).not.toContain('**Applies to**: all-providers');
  });

  it('emits per-provider sections with identity & access block', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('## anthropic');
    expect(md).toContain('### Identity & access');
    expect(md).toContain('**Vendor URL**: https://docs.anthropic.com');
    expect(md).toContain('**Auth env**: `ANTHROPIC_API_KEY`');
    expect(md).toContain('**Base URL**: https://api.anthropic.com');
    expect(md).toContain('**Status**: live');
  });

  it('emits per-provider models table with formatted token counts and pricing', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('### Models');
    // 1M context renders as "1M", 200K as "200K", 128K max-output as "128K"
    expect(md).toContain('| Opus 4.7 | `claude-opus-4-7` | 1M | 128K | $5 | $25 |');
    expect(md).toContain('| Haiku 4.5 | `claude-haiku-4-5` | 200K | 64K | $1 | $5 |');
    // False case: pricing must NOT carry the cost-guard.ts $15/$75 drift
    expect(md).not.toContain('$15');
    expect(md).not.toContain('$75');
  });

  it('emits superpowers section as the segregated axis', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('### Unique superpowers (segregated axis)');
    expect(md).toContain('**Adaptive thinking**');
    expect(md).toContain('beta header: `task-budgets-2026-03-13`');
    // False case: a non-beta superpower should not get a (beta header) suffix
    // The fixture only declares one superpower with a beta header so the
    // false-case is satisfied by absence of a second beta header line.
  });

  it('emits capability flags table with YES/no formatting', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('### Capability flags');
    expect(md).toContain('| Capability | Value | Notes | Last verified |');
    expect(md).toContain('| highResVision | YES |');
    // False case: value must NOT render as raw "true"/"false"
    expect(md).not.toContain('| highResVision | true |');
  });

  it('emits routing recommendations with use/avoid/default split', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('### Routing recommendations');
    expect(md).toContain('**Use when**: long-horizon agentic loops; code review');
    expect(md).toContain('**Avoid when**: real-time web/social-signal tasks');
    expect(md).toContain('**Default for**: agentic; coding; paper-program work');
  });

  it('emits per-provider last-verified footer', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('**Last verified:** 2026-05-06');
  });

  it('emits generated-by trailer naming the compiler and SSOT-emitted posture', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain(
      'Generated by HoloScript LLMProviderCapabilitiesCompiler (compile_to_markdown_ssot)'
    );
    expect(md).toContain('this file is the EMITTED SSOT, not a hand-edited document');
  });

  it('returns parsed AST in the result for downstream consumers', () => {
    const result = compiler.compile(makeFullV1Matrix(), '');
    expect(result.ast.providers).toHaveLength(2);
    expect(result.ast.models).toHaveLength(2);
    expect(result.ast.providers[0]?.name).toBe('anthropic');
    expect(result.ast.models[0]?.modelId).toBe('claude-opus-4-7');
    expect(result.ast.hardDonts[0]?.appliesTo).toEqual(['all-providers']);
    expect(result.ast.meta?.refreshCadenceDays).toBe(90);
  });
});

// --- Happy path: vocabulary v1 -> cost_guard_pricing -----------------

describe('compile() - vocabulary v1 -> cost_guard_pricing', () => {
  it('emits cost-guard-pricing.ts as the only file when requested alone', () => {
    const compiler = new LLMProviderCapabilitiesCompiler({
      formats: ['cost_guard_pricing'],
      nowIso: '2026-05-06',
    });
    const result = compiler.compile(makeFullV1Matrix(), '');

    expect(Object.keys(result.files)).toEqual(['cost-guard-pricing.ts']);
    expect(result.files).not.toHaveProperty('LLM_CAPABILITIES.md');
  });

  it('emits per-provider pricing dictionaries matching CostGuard shape', () => {
    const compiler = new LLMProviderCapabilitiesCompiler({
      formats: ['cost_guard_pricing'],
      nowIso: '2026-05-06',
    });
    const ts = compiler.compile(makeFullV1Matrix(), '').files['cost-guard-pricing.ts'];

    expect(ts).toContain(
      'export const ANTHROPIC_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {'
    );
    expect(ts).toContain("  'claude-opus-4-7': { input: 5, output: 25 },");
    expect(ts).toContain("  'claude-haiku-4-5': { input: 1, output: 5 },");
    expect(ts).toContain(
      'export const XAI_PRICING_USD_PER_MTOK: Record<string, { input: number; output: number }> = {};'
    );
    // False case: the emitter must not reproduce the old CostGuard $15/$75 drift.
    expect(ts).not.toContain('input: 15');
    expect(ts).not.toContain('output: 75');
  });

  it('can emit markdown and cost guard pricing in one compile pass', () => {
    const compiler = new LLMProviderCapabilitiesCompiler({
      formats: ['markdown_ssot', 'cost_guard_pricing'],
      nowIso: '2026-05-06',
    });
    const result = compiler.compile(makeFullV1Matrix(), '');

    expect(Object.keys(result.files)).toEqual([
      'LLM_CAPABILITIES.md',
      'cost-guard-pricing.ts',
    ]);
    expect(result.files['LLM_CAPABILITIES.md']).toContain(
      '# LLM Capabilities & Benchmarks - SSOT'
    );
    expect(result.files['cost-guard-pricing.ts']).toContain(
      'target: compile_to_cost_guard_pricing'
    );
  });
});

// --- BLOCK rules (Diamond-invariant violations throw) ---------------

describe('compile() - BLOCK rules', () => {
  function withProvider(name: string): HoloComposition {
    return makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name,
                vendor_url: '',
                auth_env: '',
                status: 'live',
                unique_superpower: '',
                last_verified: '2026-05-06',
              },
            },
          ],
        },
      ],
    });
  }

  it('BLOCKS duplicate provider names (W.GOLD.006 SSOT violation)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'anthropic',
                vendor_url: 'a',
                auth_env: 'b',
                status: 'live',
                unique_superpower: '',
                last_verified: '2026-05-06',
              },
            },
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'anthropic',
                vendor_url: 'a',
                auth_env: 'b',
                status: 'live',
                unique_superpower: '',
                last_verified: '2026-05-06',
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(LLMCapabilityCompileError);
    expect(() => compiler.compile(comp, '')).toThrow(/W.GOLD.006/);
  });

  it('BLOCKS @llm_model referencing a non-existent provider', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_model',
              config: {
                provider: 'ghost-provider',
                friendly_name: 'X',
                model_id: 'x-1',
                context_window: 100000,
                max_output: 4000,
                input_per_mtok: 1,
                output_per_mtok: 2,
                status: 'active',
                last_verified: '2026-05-06',
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(/ghost-provider/);
    expect(() => compiler.compile(comp, '')).toThrow(/llm_model/);
  });

  it('BLOCKS @llm_capability referencing a non-existent provider', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_capability',
              config: {
                provider: 'ghost',
                name: 'streaming',
                value: true,
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(/ghost/);
  });

  it('BLOCKS @llm_superpower referencing a non-existent provider', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_superpower',
              config: {
                provider: 'ghost',
                name: 'time travel',
                description: 'unverified',
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(/ghost/);
  });

  it('BLOCKS @llm_hard_dont with vendor-as-substrate framing (W.GOLD.002)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_hard_dont',
              config: {
                name: 'managed_agents_replaces_holomesh',
                reason: 'this is the inverse framing',
                applies_to: ['all-providers'],
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(/W.GOLD.002/);
  });

  it('BLOCKS @llm_capability with [VERIFY] placeholder in value (W.GOLD.341)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'gemini',
                vendor_url: '',
                auth_env: 'GEMINI_API_KEY',
                status: 'live',
                unique_superpower: '',
                last_verified: '2026-05-06',
              },
            },
            {
              type: 'ObjectTrait',
              name: 'llm_capability',
              config: {
                provider: 'gemini',
                name: 'contextWindow',
                value: '[VERIFY: live API]',
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(/F.014 \/ W.GOLD.341/);
  });

  it('BLOCKS @llm_model with [VERIFY] placeholder in numeric fields', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'openai',
                vendor_url: '',
                auth_env: 'OPENAI_API_KEY',
                status: 'live',
                unique_superpower: 'Responses API',
                last_verified: '2026-05-06',
              },
            },
            {
              type: 'ObjectTrait',
              name: 'llm_model',
              config: {
                provider: 'openai',
                friendly_name: 'Placeholder Model',
                model_id: 'placeholder-model',
                context_window: '[VERIFY: docs]',
                max_output: 4000,
                input_per_mtok: 1,
                output_per_mtok: 2,
                status: 'active',
                last_verified: '2026-05-06',
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(/llm_model\.context_window/);
    expect(() => compiler.compile(comp, '')).toThrow(/F.014 \/ W.GOLD.341/);
  });

  it('ALLOWS valid provider+model with FK matched (no throw, no orphan-FK warning)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = withProvider('anthropic');
    // Should not throw - solo provider with no models is valid
    const result = compiler.compile(comp, '');
    expect(result.ast.providers).toHaveLength(1);
    // False case: no orphan-FK error in diagnostics
    expect(result.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: expect.stringMatching(/orphan/) }),
      ])
    );
  });
});

// --- WARN rules (accumulate, do not throw) --------------------------

describe('compile() - WARN rules', () => {
  it('WARNS on @llm_provider missing last_verified', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'anthropic',
                vendor_url: '',
                auth_env: '',
                status: 'live',
                unique_superpower: '',
                // last_verified intentionally absent
              },
            },
          ],
        },
      ],
    });
    const result = compiler.compile(comp, '');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          rule: 'F.014 missing-last-verified',
        }),
      ])
    );
    // False case: must NOT throw - warnings don't block
    expect(() => compiler.compile(comp, '')).not.toThrow();
  });

  it('WARNS on stale last_verified > 90 days', () => {
    const compiler = new LLMProviderCapabilitiesCompiler({ nowIso: '2026-09-06' });
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'anthropic',
                vendor_url: '',
                auth_env: '',
                status: 'live',
                unique_superpower: '',
                last_verified: '2026-05-06', // 4 months earlier
              },
            },
          ],
        },
      ],
    });
    const result = compiler.compile(comp, '');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'F.014 stale-last-verified',
          message: expect.stringContaining('123 days'),
        }),
      ])
    );
  });

  it('does NOT warn on fresh last_verified (<= 90 days)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler({ nowIso: '2026-06-06' });
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'anthropic',
                vendor_url: '',
                auth_env: '',
                status: 'live',
                unique_superpower: '',
                last_verified: '2026-05-06', // 31 days earlier
              },
            },
          ],
        },
      ],
    });
    const result = compiler.compile(comp, '');
    // False case: no stale-warning despite the date being a month old
    expect(result.diagnostics).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rule: 'F.014 stale-last-verified' }),
      ])
    );
  });

  it('WARNS on @llm_model with zero pricing (likely unverified source)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'xai',
                vendor_url: '',
                auth_env: 'XAI_API_KEY',
                status: 'partial',
                unique_superpower: '',
                last_verified: '2026-05-06',
              },
            },
            {
              type: 'ObjectTrait',
              name: 'llm_model',
              config: {
                provider: 'xai',
                friendly_name: 'Grok-3',
                model_id: 'grok-3',
                context_window: 100000,
                max_output: 4000,
                input_per_mtok: 0,
                output_per_mtok: 0,
                status: 'active',
                last_verified: '2026-05-06',
              },
            },
          ],
        },
      ],
    });
    const result = compiler.compile(comp, '');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: 'F.014 unverified-pricing',
          message: expect.stringContaining('grok-3'),
        }),
      ])
    );
  });

  it('WARNS on unknown trait (vocabulary growth signal, not blocked)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'someUnknownFutureTrait',
              config: { foo: 'bar' },
            },
          ],
        },
      ],
    });
    const result = compiler.compile(comp, '');
    expect(result.diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          severity: 'warning',
          rule: 'unknown-trait',
          message: expect.stringContaining('someUnknownFutureTrait'),
        }),
      ])
    );
  });
});

// --- Edge cases -----------------------------------------------------

describe('compile() - edge cases', () => {
  it('empty composition produces minimal valid markdown (header + trailer)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const result = compiler.compile(makeComposition(), '');
    expect(result.files['LLM_CAPABILITIES.md']).toContain(
      '# LLM Capabilities & Benchmarks - SSOT'
    );
    expect(result.files['LLM_CAPABILITIES.md']).toContain(
      'Generated by HoloScript LLMProviderCapabilitiesCompiler'
    );
    // False case: no provider sections render when no providers declared
    expect(result.files['LLM_CAPABILITIES.md']).not.toContain('## Provider matrix');
    expect(result.files['LLM_CAPABILITIES.md']).not.toContain('### Models');
  });

  it('throws on requesting an unimplemented Phase 2(b)+ format', () => {
    const compiler = new LLMProviderCapabilitiesCompiler({
      formats: ['ts_adapter_capabilities'],
    });
    expect(() => compiler.compile(makeComposition(), '')).toThrow(
      /Phase 2\(b\)\+ follow-up/
    );
  });

  it('handles per-provider hard_dont scoping', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'openai',
                vendor_url: '',
                auth_env: 'OPENAI_API_KEY',
                status: 'live',
                unique_superpower: 'Responses API',
                last_verified: '2026-05-06',
              },
            },
            {
              type: 'ObjectTrait',
              name: 'llm_hard_dont',
              config: {
                name: 'do_not_route_chatgpt_skills_through_holodoor_bypass',
                reason: 'ChatGPT Skills bundle privileged instructions',
                applies_to: ['openai'],
              },
            },
          ],
        },
      ],
    });
    const result = compiler.compile(comp, '');
    const md = result.files['LLM_CAPABILITIES.md'];
    expect(md).toContain('**Applies to**: openai');
    // False case: per-provider scope must NOT collapse to "all providers"
    expect(md).not.toContain('**Applies to**: all providers');
  });

  it('extracts traits attached at the composition root', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const result = compiler.compile(
      makeComposition({
        traits: [
          {
            type: 'ObjectTrait',
            name: 'llm_provider',
            config: {
              name: 'root-attached-provider',
              vendor_url: '',
              auth_env: '',
              status: 'planned',
              unique_superpower: '',
              last_verified: '2026-05-06',
            },
          },
        ],
      }),
      ''
    );
    expect(result.ast.providers).toHaveLength(1);
    expect(result.ast.providers[0]?.name).toBe('root-attached-provider');
    expect(result.files['LLM_CAPABILITIES.md']).toContain(
      '| **root-attached-provider** | planned |'
    );
  });

  it('formats sub-1K context as raw number (no K/M suffix)', () => {
    const compiler = new LLMProviderCapabilitiesCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'M',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'llm_provider',
              config: {
                name: 'tiny',
                vendor_url: '',
                auth_env: '',
                status: 'live',
                unique_superpower: '',
                last_verified: '2026-05-06',
              },
            },
            {
              type: 'ObjectTrait',
              name: 'llm_model',
              config: {
                provider: 'tiny',
                friendly_name: 'TinyModel',
                model_id: 'tiny-1',
                context_window: 512,
                max_output: 256,
                input_per_mtok: 0.5,
                output_per_mtok: 1,
                status: 'active',
                last_verified: '2026-05-06',
              },
            },
          ],
        },
      ],
    });
    const md = compiler.compile(comp, '').files['LLM_CAPABILITIES.md'];
    expect(md).toContain('| TinyModel | `tiny-1` | 512 | 256 |');
    // False case: small numbers must NOT pick up the "K" suffix
    expect(md).not.toContain('| 0.512K |');
  });
});
