/**
 * ContextCompiler tests - vocabulary v1 + claude_md emit + BLOCK/WARN rules.
 *
 * Per "Context as a HoloScript Compile Target" memo (Phase 1 - first
 * shippable deliverable). Inline HoloComposition fixtures (matching
 * AgentInferenceExportTarget.test.ts pattern) cover:
 *
 *   - Happy-path: full vocabulary v1 -> claude_md output
 *   - BLOCK rules (Diamond-invariant): banned-pattern defaults,
 *     vendor-as-substrate hard_donts, fake-Diamond declarations,
 *     skill claiming authority over hard_physical_gap
 *   - WARN rules: malformed wisdom IDs, unknown traits
 *   - Edge cases: empty composition, missing optional fields
 *
 * G.GOLD.013 false-case discipline throughout - every "should produce X"
 * has a paired "must NOT produce Y" assertion.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  ContextCompiler,
  ContextCompileError,
  createContextCompiler,
} from '../ContextCompiler';
import type { HoloComposition } from '../../parser/HoloCompositionTypes';

// --- Fixture builders ------------------------------------------------

function makeComposition(overrides?: Partial<HoloComposition>): HoloComposition {
  return {
    type: 'Composition',
    name: 'TestContext',
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

function makeFullV1Composition(): HoloComposition {
  return makeComposition({
    name: 'EcosystemContext',
    objects: [
      {
        type: 'Object',
        name: 'EcosystemAgent',
        properties: [],
        traits: [
          {
            type: 'ObjectTrait',
            name: 'identity',
            config: {
              name: 'ecosystem-engineering-agent',
              role: 'team-engineering',
              domain: 'holoscript-ecosystem',
              surface: 'any',
              no_monopoly: true,
            },
          },
          {
            type: 'ObjectTrait',
            name: 'authority_order',
            config: {
              tiers: ['GOLD vault', 'this skill', 'NORTH_STAR.md', 'CLAUDE.md', 'memory'],
            },
          },
          {
            type: 'ObjectTrait',
            name: 'vision_pillar',
            config: {
              id: '1',
              claim: 'Simulation-first. Digital twin before physical twin.',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'vision_pillar',
            config: {
              id: '3',
              claim: 'Architecture beats alignment.',
              citation: 'W.GOLD.001',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'output_shape',
            config: {
              silent_to: 'joseph',
              loud_to: 'agent',
              no_meta_output: true,
              surface_hint: 'at most one short sentence per material change',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'production_rule',
            config: {
              no_dev_no_mock_no_localhost: true,
              exception: 'unit tests for pure functions',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'refusal',
            config: {
              name: 'bandaid',
              when: 'test failing, type wrong, hook misbehaving',
              do: 'fix root cause',
              do_not: ['skip', '.only', '@ts-ignore', 'escape clause'],
              reason: 'W.GOLD.001 - architecture beats alignment',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'hard_dont',
            config: {
              name: 'git_add_all',
              reason: 'F.001/F.011 - leaked .env twice',
              alternative: 'git add <explicit-path>',
              applies_to: ['all surfaces'],
            },
          },
          {
            type: 'ObjectTrait',
            name: 'default',
            config: {
              name: 'commit_now_if',
              when: 'coherent unit + tests pass',
              do: 'commit to main, no PR',
              reason: 'F.027 - agents own the room',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'graduated_wisdom',
            config: {
              id: 'W.GOLD.001',
              claim: 'Architecture beats alignment',
              tier: 'diamond',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'feedback',
            config: {
              id: 'F.014',
              claim: 'Never hardcode ecosystem stats - counts go stale every deploy',
              source: 'MEMORY.md',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'escalation',
            config: {
              trigger: 'novel + irreversible + treasury or paper-editorial boundary',
              action: 'add to ASK_FOUNDER_QUEUE',
              recipient: 'founder',
              refuse_to_escalate_when: ['known default', 'vision pillar', 'GOLD precedent'],
            },
          },
          {
            type: 'ObjectTrait',
            name: 'verify_token',
            config: {
              meaning: 'this ruling depends on dynamic state - re-check before relying',
              example: '[verify mcp.holoscript.net /health]',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'gap_rule',
            config: {
              name: 'gap_build',
              when: 'capability missing',
              do: ['name the gap', 'file via /room', 'build if small'],
              do_not: ['descope', 'workaround', 'wait-for-founder'],
              reason: 'F.025 file-as-task',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'citation_rule',
            config: {
              fluent_prose_threshold_chars: 150,
              required: ['file:line', 'URL', 'GOLD ID', 'CLAUDE.md section'],
              exemption: 'marked as own-judgment-call explicitly',
              reason: 'F.017 - uncited fluent prose = hallucination signal',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'skill',
            config: {
              name: 'founder',
              invocable_as: '/founder',
              authority: 'ratified rulings',
              authoritative_for: ['bandaid-vs-fix', 'scope-decisions'],
              refusals: ['bandaid', 'workaround', 'demote', 'wait-for-founder'],
            },
          },
          {
            type: 'ObjectTrait',
            name: 'routine',
            config: {
              id: 'A-019',
              schedule: '0 13 * * 1',
              skill: '/research',
              prompt_ref: 'docs/AGENT_AUTOMATIONS.md section A-019 prompt',
              sla: '30 min',
              output_dir: 'docs/llm-refresh/',
              clean_exit_script: 'scripts/a019-clean-exit.mjs',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'hard_physical_gap',
            config: {
              name: 'trezor-signing',
              reason: 'Hardware signing requires physical presence with the Trezor device',
              applies_to: ['all skills'],
              alternative: 'skill drafts the transaction; founder signs',
            },
          },
        ],
      },
    ],
  });
}

// --- Constructor & defaults -----------------------------------------

describe('ContextCompiler - constructor', () => {
  it('creates with default options (claude_md emit only)', () => {
    const compiler = new ContextCompiler();
    expect(compiler).toBeInstanceOf(ContextCompiler);
  });

  it('factory function returns instance', () => {
    const compiler = createContextCompiler();
    expect(compiler).toBeInstanceOf(ContextCompiler);
  });
});

// --- Happy path: vocabulary v1 -> claude_md --------------------------

describe('compile() - vocabulary v1 -> claude_md', () => {
  let compiler: ContextCompiler;

  beforeEach(() => {
    compiler = new ContextCompiler({ formats: ['claude_md'] });
  });

  it('emits CLAUDE.md as the file key', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.files).toHaveProperty('CLAUDE.md');
    // False case: no other emit format produced
    expect(Object.keys(result.files)).toEqual(['CLAUDE.md']);
  });

  it('emits the identity header from @identity trait', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('# ecosystem-engineering-agent');
    expect(md).toContain('**Role**: team-engineering');
    expect(md).toContain('**Domain**: holoscript-ecosystem');
    expect(md).toContain('No-monopoly rule');
  });

  it('emits authority_order as numbered list', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('## Authority order');
    expect(md).toContain('1. **GOLD vault**');
    expect(md).toContain('2. **this skill**');
  });

  it('emits vision pillars with citations when provided', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('## Vision pillars');
    expect(md).toContain('Architecture beats alignment');
    expect(md).toContain('*(W.GOLD.001)*'); // citation in italics
    expect(md).toContain('Simulation-first');
  });

  it('emits refusals with do/do_not/reason structure', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('## The Refusals');
    expect(md).toContain('### Refuse the bandaid');
    expect(md).toContain('**Do**: fix root cause');
    expect(md).toContain('`skip`'); // do_not entries as code spans
    expect(md).toContain('`@ts-ignore`');
  });

  it('emits hard donts as a table with name/reason/alternative', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain(`## Hard don't`);
    expect(md).toContain('| **git_add_all** |');
    expect(md).toContain('git add <explicit-path>');
  });

  it('emits known defaults as a table', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('## Known defaults');
    expect(md).toContain('| coherent unit + tests pass |');
    expect(md).toContain('**commit to main, no PR**');
  });

  it('emits hard physical gaps as a discrete section', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('## Hard physical gaps');
    expect(md).toContain('**trezor-signing**');
    expect(md).toContain('skill drafts the transaction');
  });

  it('emits routines as a table with cron schedule', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('## Recurring routines');
    expect(md).toContain('| A-019 | `0 13 * * 1` |');
  });

  it('emits skills with authority + invocation hint', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('### `/founder` - founder');
    expect(md).toContain('**Authority**: ratified rulings');
    expect(md).toContain('bandaid, workaround, demote, wait-for-founder');
  });

  it('emits authority cross-references for graduated wisdom + feedback', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('## Authority cross-references');
    expect(md).toContain('### GOLD-tier wisdom');
    expect(md).toContain('**W.GOLD.001** *(diamond)* - Architecture beats alignment');
    expect(md).toContain('### Feedback memory');
    expect(md).toContain('**F.014** (MEMORY.md) - Never hardcode ecosystem stats');
  });

  it('emits generated-by trailer at end', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('Generated by HoloScript ContextCompiler');
    expect(md).toContain('Vocabulary: v1');
  });

  it('returns ContextAST in the result for downstream consumers', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.ast.identity?.name).toBe('ecosystem-engineering-agent');
    expect(result.ast.refusals).toHaveLength(1);
    expect(result.ast.visionPillars).toHaveLength(2);
    expect(result.ast.routines).toHaveLength(1);
    expect(result.ast.hardPhysicalGaps).toHaveLength(1);
  });

  it('extracts context traits attached at the composition root', () => {
    const result = compiler.compile(
      makeComposition({
        traits: [
          {
            type: 'ObjectTrait',
            name: 'identity',
            config: {
              name: 'root-context',
              role: 'context-author',
              domain: 'agent-context',
              surface: 'codex',
            },
          },
        ],
      }),
      ''
    );

    expect(result.ast.identity?.name).toBe('root-context');
    expect(result.files['CLAUDE.md']).toContain('# root-context');
    expect(result.files['CLAUDE.md']).not.toContain('# ecosystem-engineering-agent');
  });
});

// --- Happy path: vocabulary v1 -> agents_md (Codex / cross-tool format) ---

describe('compile() - vocabulary v1 -> agents_md', () => {
  let compiler: ContextCompiler;

  beforeEach(() => {
    compiler = new ContextCompiler({ formats: ['agents_md'] });
  });

  it('emits AGENTS.md as the file key (NOT CLAUDE.md)', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.files).toHaveProperty('AGENTS.md');
    // False case: only AGENTS.md is produced, not CLAUDE.md
    expect(Object.keys(result.files)).toEqual(['AGENTS.md']);
    expect(result.files).not.toHaveProperty('CLAUDE.md');
  });

  it('emits the AGENTS.md header with cross-tool blockquote', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['AGENTS.md'];
    expect(md).toContain('# AGENTS.md');
    // False case: does NOT use the identity name as title (that's the
    // claude_md convention - AGENTS.md uses a fixed title with role in
    // a blockquote underneath, matching existing AGENTS.md exemplars).
    expect(md).not.toContain('# ecosystem-engineering-agent');
    expect(md).toContain('**Role**: team-engineering');
    expect(md).toContain('**Domain**: holoscript-ecosystem');
    expect(md).toContain('cross-tool: read by Codex, Copilot, Cursor');
  });

  it('emits "Project principles" instead of "Vision pillars"', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['AGENTS.md'];
    expect(md).toContain('## Project principles');
    // False case: the claude_md heading must NOT appear
    expect(md).not.toContain('## Vision pillars');
    // Content still present under the renamed section
    expect(md).toContain('Architecture beats alignment');
    expect(md).toContain('*(W.GOLD.001)*');
  });

  it('emits "Hard rules" instead of "The Refusals" and merges hard_donts in', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['AGENTS.md'];
    expect(md).toContain('## Hard rules');
    // False case: ritual claude_md heading must NOT appear
    expect(md).not.toContain('## The Refusals');
    expect(md).not.toContain("## Hard don't");
    expect(md).not.toContain('Refuse the bandaid'); // claude_md uses "Refuse the X"; agents_md uses bare name
    // Both refusals AND hard donts appear under the merged Hard rules section
    expect(md).toContain('### bandaid');
    expect(md).toContain('### git_add_all');
    expect(md).toContain('- **Do**: fix root cause');
    expect(md).toContain('- **Alternative**: git add <explicit-path>');
  });

  it('emits "Conventions" instead of "Known defaults"', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['AGENTS.md'];
    expect(md).toContain('## Conventions');
    // False case: claude_md heading must NOT appear
    expect(md).not.toContain('## Known defaults');
    // Conventions table still present
    expect(md).toContain('| When | Do | Reason |');
    expect(md).toContain('| coherent unit + tests pass |');
  });

  it('emits "Workflows" instead of "Skills" with Codex-style invocation', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['AGENTS.md'];
    expect(md).toContain('## Workflows');
    // False case: claude_md "## Skills" heading must NOT appear
    expect(md).not.toContain('## Skills\n');
    // Codex format: "founder (`/founder`)" instead of claude_md's "`/founder` - founder"
    expect(md).toContain('### founder (`/founder`)');
    expect(md).not.toContain('### `/founder` - founder');
    expect(md).toContain('**Authority**: ratified rulings');
    expect(md).toContain('**Enforces rules**: bandaid, workaround, demote, wait-for-founder');
  });

  it('emits universal sections (authority order, output shape, production rule, gaps, routines, escalation, citations, cross-refs)', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['AGENTS.md'];
    // Universal section names are shared with claude_md (these are
    // non-Claude-specific terms, kept identical for parser-consumer reuse).
    expect(md).toContain('## Authority order (read top-down; first match wins)');
    expect(md).toContain('## Output shape');
    expect(md).toContain('## Production-only rule');
    expect(md).toContain('## Hard physical gaps (never absorb)');
    expect(md).toContain('## Recurring routines (A-00X)');
    expect(md).toContain('## Escalation');
    expect(md).toContain('## Citation discipline');
    expect(md).toContain('## Authority cross-references');
    // Cross-ref content carries through
    expect(md).toContain('**W.GOLD.001** *(diamond)* - Architecture beats alignment');
    expect(md).toContain('**F.014** (MEMORY.md) - Never hardcode ecosystem stats');
    // Routines render as table
    expect(md).toContain('| A-019 | `0 13 * * 1` |');
    // Hard physical gaps render
    expect(md).toContain('**trezor-signing**');
  });

  it('emits AGENTS.md trailer with cross-tool list', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['AGENTS.md'];
    expect(md).toContain('Generated by HoloScript ContextCompiler (compile_to_agents_md)');
    expect(md).toContain('Cross-tool: Codex, Copilot, Cursor, Continue');
    // False case: must NOT carry the claude_md trailer label
    expect(md).not.toContain('compile_to_claude_md');
  });

  it('emits both formats when requested together (claude_md + agents_md in one compile)', () => {
    const dual = new ContextCompiler({ formats: ['claude_md', 'agents_md'] });
    const result = dual.compile(makeFullV1Composition(), '');
    expect(Object.keys(result.files).sort()).toEqual(['AGENTS.md', 'CLAUDE.md']);
    // Each file carries its own trailer
    expect(result.files['CLAUDE.md']).toContain('compile_to_claude_md');
    expect(result.files['AGENTS.md']).toContain('compile_to_agents_md');
    // The shared AST is the same source for both
    expect(result.ast.identity?.name).toBe('ecosystem-engineering-agent');
  });

  it('empty composition produces minimal AGENTS.md (just title + trailer)', () => {
    const result = compiler.compile(makeComposition(), '');
    const md = result.files['AGENTS.md'];
    expect(md).toContain('# AGENTS.md');
    expect(md).toContain('compile_to_agents_md');
    // False case: no Codex sections render when AST is empty
    expect(md).not.toContain('## Project principles');
    expect(md).not.toContain('## Hard rules');
    expect(md).not.toContain('## Conventions');
    expect(md).not.toContain('## Workflows');
  });

  it('renders refusals-only Hard rules section without dangling hard_dont entries', () => {
    const refusalOnly = new ContextCompiler({ formats: ['agents_md'] });
    const result = refusalOnly.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'AgentCtx',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'refusal',
                config: { name: 'demote', when: 'silent scope cut', do: 'name it', do_not: ['silently descope'] },
              },
            ],
          },
        ],
      }),
      ''
    );
    const md = result.files['AGENTS.md'];
    expect(md).toContain('## Hard rules');
    expect(md).toContain('### demote');
    // False case: no spurious second-section content from absent hard_donts
    expect(md).not.toContain('- **Alternative**:');
  });

  it('renders hard_donts-only Hard rules section when no refusals declared', () => {
    const dontOnly = new ContextCompiler({ formats: ['agents_md'] });
    const result = dontOnly.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'AgentCtx',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'hard_dont',
                config: {
                  name: 'force_push_main',
                  reason: 'overwrites peer commits',
                  alternative: 'rebase locally then push',
                  applies_to: ['all'],
                },
              },
            ],
          },
        ],
      }),
      ''
    );
    const md = result.files['AGENTS.md'];
    expect(md).toContain('## Hard rules');
    expect(md).toContain('### force_push_main');
    expect(md).toContain('**Alternative**: rebase locally then push');
    // False case: no refusal-style "When/Do/Do not" leakage
    expect(md).not.toContain('- **When**: silent scope cut');
  });
});

// --- BLOCK rules (Diamond-invariant violations throw) ---------------

describe('compile() - BLOCK rules', () => {
  function compositionWithDefault(doValue: string): HoloComposition {
    return makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'AgentCtx',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'default',
              config: {
                name: 'test_default',
                when: 'test',
                do: doValue,
              },
            },
          ],
        },
      ],
    });
  }

  it('BLOCKS @default recommending `git add -A` (F.001/F.011)', () => {
    const compiler = new ContextCompiler();
    expect(() => compiler.compile(compositionWithDefault('use git add -A'), '')).toThrow(
      ContextCompileError
    );
    expect(() => compiler.compile(compositionWithDefault('use git add -A'), '')).toThrow(
      /git add -A/
    );
  });

  it('BLOCKS @default recommending `git add .` (same family)', () => {
    const compiler = new ContextCompiler();
    expect(() => compiler.compile(compositionWithDefault('git add .'), '')).toThrow(
      ContextCompileError
    );
  });

  it('BLOCKS @default recommending `mock the database` (founder default - real DB)', () => {
    const compiler = new ContextCompiler();
    expect(() => compiler.compile(compositionWithDefault('mock the database'), '')).toThrow(
      /mock-vs-prod divergence/
    );
  });

  it('allows ordinary prose using the word any while still blocking TypeScript any', () => {
    const compiler = new ContextCompiler();

    expect(() => compiler.compile(compositionWithDefault('handle any request by checking source authority'), '')).not.toThrow();
    expect(() => compiler.compile(compositionWithDefault('use value: any'), '')).toThrow(
      /no `any` in TypeScript/
    );
    expect(() => compiler.compile(compositionWithDefault('cast as any'), '')).toThrow(
      /no `any` in TypeScript/
    );
  });

  it('BLOCKS @hard_dont with vendor-as-substrate name (W.GOLD.002 violation)', () => {
    const compiler = new ContextCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'AgentCtx',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'hard_dont',
              config: {
                name: 'managed_agents_replaces_holomesh',
                reason: 'Sounds attractive but violates absorb-as-adapter',
                applies_to: ['supervisor'],
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(/W.GOLD.002/);
  });

  it('BLOCKS @graduated_wisdom claiming fake Diamond tier', () => {
    const compiler = new ContextCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'AgentCtx',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'graduated_wisdom',
              config: {
                id: 'W.GOLD.999',
                claim: 'I made this up',
                tier: 'diamond',
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(/Diamond declaration is founder-only/);
  });

  it('ALLOWS @graduated_wisdom citing real Diamond IDs (W.GOLD.001, P.GOLD.001, etc.)', () => {
    const compiler = new ContextCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'AgentCtx',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'graduated_wisdom',
              config: { id: 'W.GOLD.001', claim: 'Architecture beats alignment', tier: 'diamond' },
            },
            {
              type: 'ObjectTrait',
              name: 'graduated_wisdom',
              config: { id: 'P.GOLD.001', claim: 'Failure knowledge decays slower', tier: 'diamond' },
            },
          ],
        },
      ],
    });
    // Should NOT throw
    const result = compiler.compile(comp, '');
    expect(result.ast.graduatedWisdoms).toHaveLength(2);
  });

  it('BLOCKS @skill claiming authoritative_for over a @hard_physical_gap', () => {
    const compiler = new ContextCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'AgentCtx',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'hard_physical_gap',
              config: {
                name: 'trezor-signing',
                reason: 'physical presence required',
                applies_to: ['all skills'],
              },
            },
            {
              type: 'ObjectTrait',
              name: 'skill',
              config: {
                name: 'overstepping-skill',
                invocable_as: '/over',
                authority: 'should not have this',
                authoritative_for: ['trezor-signing'],
              },
            },
          ],
        },
      ],
    });
    expect(() => compiler.compile(comp, '')).toThrow(/hard_physical_gap/);
    expect(() => compiler.compile(comp, '')).toThrow(/Trezor.+Quest 3/);
  });
});

// --- WARN rules (accumulate diagnostics, don't throw) ---------------

describe('compile() - WARN rules', () => {
  it('WARNS on @graduated_wisdom with malformed ID (F.023 vault drift signal)', () => {
    const compiler = new ContextCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'AgentCtx',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'graduated_wisdom',
              config: {
                id: 'WGOLD-1', // wrong format - should be W.GOLD.NNN
                claim: 'Some claim',
                tier: 'gold',
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
          rule: 'F.023 vault-id-format',
        }),
      ])
    );
    // False case: must NOT throw - warnings don't block
    expect(() => compiler.compile(comp, '')).not.toThrow();
  });

  it('WARNS on unknown trait (vocabulary growth signal, not blocked)', () => {
    const compiler = new ContextCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'AgentCtx',
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
  it('empty composition produces minimal valid markdown (just trailer)', () => {
    const compiler = new ContextCompiler();
    const result = compiler.compile(makeComposition(), '');
    expect(result.files['CLAUDE.md']).toContain('Generated by HoloScript ContextCompiler');
    // False case: no identity-derived header
    expect(result.files['CLAUDE.md']).not.toContain('# ecosystem');
    expect(result.ast.refusals).toEqual([]);
  });

  it('throws on requesting an unimplemented Phase 1+ format', () => {
    // cursor_rules + skill_md + others are still Phase 1+ follow-ups.
    // (agents_md was promoted out of this branch when the second emitter shipped.)
    const compiler = new ContextCompiler({ formats: ['cursor_rules'] });
    expect(() => compiler.compile(makeComposition(), '')).toThrow(/Phase 1\+ follow-up/);
  });

  it('@refusal with no reason emits without breaking', () => {
    const compiler = new ContextCompiler();
    const comp = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'AgentCtx',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'refusal',
              config: { name: 'test', when: 'always', do: 'fix it', do_not: ['ignore'] },
            },
          ],
        },
      ],
    });
    const result = compiler.compile(comp, '');
    expect(result.files['CLAUDE.md']).toContain('### Refuse the test');
    expect(result.files['CLAUDE.md']).not.toContain('**Reason**:');
  });
});
