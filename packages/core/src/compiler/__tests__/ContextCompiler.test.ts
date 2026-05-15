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
              do_action: 'add to ASK_FOUNDER_QUEUE',
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
          // Vocabulary v2 (Iteration 2 G-3 first slice)
          {
            type: 'ObjectTrait',
            name: 'invocation_mode',
            config: {
              mode: 'auto-fire',
              when: 'agent about to bandaid / workaround / demote / wait-for-founder',
              effect: 'skill self-invokes and rules without queueing for founder',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'invocation_mode',
            config: {
              mode: 'explicit',
              when: 'user types `/founder [question]`',
              effect: 'skill executes the ratification flow on the supplied question',
              example: '/founder should I use a feature flag here?',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'invocation_mode',
            config: {
              mode: 'wrap-other-skill',
              when: 'embedded inside another skill\'s flow',
              effect: 'wrapping skill calls /founder for a sub-decision and proceeds',
            },
          },
          // Vocabulary v2 (Iteration 2 G-3 embodied slice)
          {
            type: 'ObjectTrait',
            name: 'embodied_projection',
            config: {
              surface: 'quest-3',
              projection_kind: 'interactive',
              trigger: 'daily founder architecture review',
              notes: 'project decisive agent state into a Quest 3 spatial surface',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'embodied_projection',
            config: {
              surface: 'spatial-photo',
              projection_kind: 'read-only',
              trigger: 'asynchronous evidence packet review',
              notes: 'use a still spatial capture when interaction is unnecessary',
            },
          },
          // Vocabulary v2 (Iteration 2 G-3 third slice)
          {
            type: 'ObjectTrait',
            name: 'domain_preference',
            config: {
              domain: 'legal',
              skills: ['/legal:triage-nda', '/legal:review-contract'],
              notes: 'NDA, contract, IP routing',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'domain_preference',
            config: {
              domain: 'capital',
              skills: [],
              notes: 'in-skill default for spend within ceiling',
              ceiling: '$5 standing spend cap',
            },
          },
          // Vocabulary v2 (Iteration 2 G-3 authority slice)
          {
            type: 'ObjectTrait',
            name: 'authority',
            config: {
              target: 'SKILL.md (this file)',
              action_type: 'skill-edit',
              requires: ['backup before write', 'edit via normal Edit/Write tool', 'log after write with cited reason'],
              founder_ratification_required: false,
              notes: 'editing the contract',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'authority',
            config: {
              target: 'references/preferences.md',
              action_type: 'preferences-edit',
              requires: ['backup before write', 'cite the ruling', 'log after write'],
              founder_ratification_required: false,
              notes: 'ratifying or adding a preference row',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'authority',
            config: {
              target: 'Vision pillar mutation',
              action_type: 'pillar-mutate',
              requires: ['explicit founder line in same session', 'backup before write', 'log ratification quote'],
              founder_ratification_required: true,
              notes: 'adding or retiring a pillar',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'authority',
            config: {
              target: 'Authority order rewrite',
              action_type: 'authority-rewrite',
              requires: ['explicit founder line in same session', 'backup before write', 'log ratification quote'],
              founder_ratification_required: true,
              notes: 'reordering the 7-tier hierarchy',
            },
          },
          // Vocabulary v2 (Iteration 2 G-3 next slice)
          {
            type: 'ObjectTrait',
            name: 'date_discipline',
            config: {
              wisdom_id: 'W.317',
              refusal_contract: 'Refuse to surface a bare date for any HoloScript milestone; date must carry blockers + staleness + readiness',
              required_components: ['open_blockers', 'matrix_row_staleness', 'engineering_readiness'],
              shape_template:
                'DATE: 2026-MM-DD\nOPEN BLOCKERS:\n  - <named blocker 1>\n  - <named blocker 2>\nMATRIX-ROW STALENESS: <last-verified + ✅/⚠️/❌>\nENGINEERING-READINESS: <green/yellow/red across W.310-W.317>',
              reason: 'Bare optimistic dates burn credibility on contact with reality (W.317 + W.099)',
              cross_references: ['F.030 paper-audit-matrix-always-stale', 'W.099 deploy-date-without-blocker'],
            },
          },
          // Vocabulary v2 (Iteration 2 G-3 fourth slice)
          {
            type: 'ObjectTrait',
            name: 'editorial_default',
            config: {
              name: 'paper-byline',
              paper_id: 'program',
              paper_phase: 'all',
              when: 'Can I change a paper byline?',
              do: 'No. Josep Valls-Vargas is the byline.',
              reason: 'F.026',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'editorial_default',
            config: {
              name: 'editor-contact',
              paper_id: 'tvcg-revision-1',
              paper_phase: 'held',
              when: 'Can I push a revised bundle to the editor?',
              do: 'No unless founder-explicit; land amendments locally.',
              reason: 'I.009',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'research_default',
            config: {
              name: 'result-validation-sessions',
              paper_id: 'program',
              paper_phase: 'validation',
              when: 'New result needs validation across how many sessions?',
              do: 'Three independent sessions before graduating to Silver.',
              reason: 'F.023',
            },
          },
          {
            type: 'ObjectTrait',
            name: 'research_default',
            config: {
              name: 'missing-solver-benchmark-dataset',
              paper_id: 'program',
              paper_phase: 'evidence',
              when: 'A paper needs a solver / benchmark / dataset we do not have',
              do: 'Gap-build. Do not demote the paper.',
              reason: 'Gap = build',
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
    expect(md).toContain('## The Four Refusals');
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

  it('emits known founder defaults as a table', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('## Known founder defaults');
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
    expect(md).toContain('Vocabulary: v3');
  });

  it('returns ContextAST in the result for downstream consumers', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.ast.identity?.name).toBe('ecosystem-engineering-agent');
    expect(result.ast.refusals).toHaveLength(1);
    expect(result.ast.visionPillars).toHaveLength(2);
    expect(result.ast.routines).toHaveLength(1);
    expect(result.ast.escalations).toEqual([
      {
        trigger: 'novel + irreversible + treasury or paper-editorial boundary',
        doAction: 'add to ASK_FOUNDER_QUEUE',
        recipient: 'founder',
        refuseToEscalateWhen: ['known default', 'vision pillar', 'GOLD precedent'],
      },
    ]);
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
    expect(md).toContain('## Escape hatch');
    expect(md).toContain('**Action**: add to ASK_FOUNDER_QUEUE');
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
    // anthropic_system_prompt + brain_includes + mcp_context_loader are
    // still Phase 1+ follow-ups. (cursor_rules + agents_md + skill_md
    // were promoted out of this branch when those emitters shipped.)
    const compiler = new ContextCompiler({ formats: ['anthropic_system_prompt'] });
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

// --- Happy path: vocabulary v1 -> cursor_rules (Cursor .mdc per-file format) ---

describe('compile() - vocabulary v1 -> cursor_rules', () => {
  let compiler: ContextCompiler;

  beforeEach(() => {
    compiler = new ContextCompiler({ formats: ['cursor_rules'] });
  });

  it('emits multiple files (one per rule + index), all under .cursor/rules/', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const keys = Object.keys(result.files);
    expect(keys.length).toBeGreaterThan(1);
    for (const k of keys) {
      expect(k.startsWith('.cursor/rules/')).toBe(true);
      expect(k.endsWith('.mdc')).toBe(true);
    }
    // False case: must NOT emit CLAUDE.md or AGENTS.md when only
    // cursor_rules format requested.
    expect(result.files).not.toHaveProperty('CLAUDE.md');
    expect(result.files).not.toHaveProperty('AGENTS.md');
  });

  it('emits one .mdc file per @refusal with refusal- prefix', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.files).toHaveProperty('.cursor/rules/refusal-bandaid.mdc');
    // False case: no claude_md/agents_md naming style leaks into Cursor keys
    expect(result.files).not.toHaveProperty('.cursor/rules/Refuse-the-bandaid.mdc');
  });

  it('emits one .mdc file per @hard_dont with hard-dont- prefix', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.files).toHaveProperty('.cursor/rules/hard-dont-git-add-all.mdc');
    // False case: snake_case from source must be normalized to kebab-case
    expect(result.files).not.toHaveProperty('.cursor/rules/hard-dont-git_add_all.mdc');
  });

  it('emits one .mdc file per @default with default- prefix', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.files).toHaveProperty('.cursor/rules/default-commit-now-if.mdc');
  });

  it('emits frontmatter with alwaysApply: true and empty globs (v1 spec)', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const refusalContent = result.files['.cursor/rules/refusal-bandaid.mdc'];
    // Frontmatter starts file
    expect(refusalContent.startsWith('---\n')).toBe(true);
    expect(refusalContent).toContain('alwaysApply: true');
    expect(refusalContent).toContain('globs:\n');
    expect(refusalContent).toContain('description: ');
    // False case: v1 must NOT emit alwaysApply: false (deferred to v2)
    expect(refusalContent).not.toContain('alwaysApply: false');
  });

  it('refusal body contains When/Do/Do not/Reason structure', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const c = result.files['.cursor/rules/refusal-bandaid.mdc'];
    expect(c).toContain('# Refusal: bandaid');
    expect(c).toContain('**When**: test failing, type wrong, hook misbehaving');
    expect(c).toContain('**Do**: fix root cause');
    expect(c).toContain('`skip`');
    expect(c).toContain('`@ts-ignore`');
    expect(c).toContain('**Reason**: W.GOLD.001 - architecture beats alignment');
  });

  it('hard_dont body contains Reason/Alternative/Applies-to structure', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const c = result.files['.cursor/rules/hard-dont-git-add-all.mdc'];
    expect(c).toContain(`# Hard don't: git_add_all`);
    expect(c).toContain('**Reason**: F.001/F.011 - leaked .env twice');
    expect(c).toContain('**Alternative**: git add <explicit-path>');
    expect(c).toContain('**Applies to**: all surfaces');
    // False case: no claude_md table syntax leaks into per-rule body
    expect(c).not.toContain('| **git_add_all** |');
  });

  it('default body contains When/Do/Reason structure', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const c = result.files['.cursor/rules/default-commit-now-if.mdc'];
    expect(c).toContain('# Default: commit_now_if');
    expect(c).toContain('**When**: coherent unit + tests pass');
    expect(c).toContain('**Do**: commit to main, no PR');
    expect(c).toContain('**Reason**: F.027 - agents own the room');
  });

  it('emits the index file at .cursor/rules/_ecosystem-context.mdc', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.files).toHaveProperty('.cursor/rules/_ecosystem-context.mdc');
    const idx = result.files['.cursor/rules/_ecosystem-context.mdc'];
    // Identity in title
    expect(idx).toContain('# ecosystem-engineering-agent');
    // Authority order
    expect(idx).toContain('## Authority order');
    expect(idx).toContain('1. **GOLD vault**');
    // Vision pillars
    expect(idx).toContain('## Vision pillars');
    expect(idx).toContain('Architecture beats alignment');
    expect(idx).toContain('*(W.GOLD.001)*');
    // Skill registry (one-liners, NOT per-skill files - that's compile_to_skill_md)
    expect(idx).toContain('## Skill registry');
    expect(idx).toContain('**/founder** (founder)');
    // Routines table
    expect(idx).toContain('| A-019 | `0 13 * * 1` |');
    // Hard physical gaps
    expect(idx).toContain('**trezor-signing**');
    // Cross-references
    expect(idx).toContain('## Authority cross-references');
    expect(idx).toContain('**W.GOLD.001** *(diamond)* - Architecture beats alignment');
  });

  it('only the index file carries the generated-by trailer', () => {
    const result = compiler.compile(makeFullV1Composition(), '');
    const idx = result.files['.cursor/rules/_ecosystem-context.mdc'];
    expect(idx).toContain('Generated by HoloScript ContextCompiler (compile_to_cursor_rules)');
    // False case: per-rule files MUST NOT carry the trailer (Cursor
    // displays rule body inline; trailer would clutter every fired rule).
    const refusalContent = result.files['.cursor/rules/refusal-bandaid.mdc'];
    expect(refusalContent).not.toContain('Generated by HoloScript');
    const hardDontContent = result.files['.cursor/rules/hard-dont-git-add-all.mdc'];
    expect(hardDontContent).not.toContain('Generated by HoloScript');
    const defaultContent = result.files['.cursor/rules/default-commit-now-if.mdc'];
    expect(defaultContent).not.toContain('Generated by HoloScript');
  });

  it('empty composition emits ONLY the index file (no per-rule files)', () => {
    const result = compiler.compile(makeComposition(), '');
    const keys = Object.keys(result.files);
    // False case: no per-rule prefixes appear when no per-rule traits exist
    expect(keys).toEqual(['.cursor/rules/_ecosystem-context.mdc']);
    expect(keys).not.toContain('.cursor/rules/refusal-bandaid.mdc');
    expect(result.files['.cursor/rules/_ecosystem-context.mdc']).toContain(
      'Generated by HoloScript'
    );
  });

  it('frontmatter description is single-line (no embedded newlines)', () => {
    const compilerLocal = new ContextCompiler({ formats: ['cursor_rules'] });
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
              config: {
                name: 'multi_line_reason',
                when: 'always',
                do: 'fix it',
                do_not: ['ignore'],
                reason: 'line one\nline two\nline three',
              },
            },
          ],
        },
      ],
    });
    const result = compilerLocal.compile(comp, '');
    const c = result.files['.cursor/rules/refusal-multi-line-reason.mdc'];
    // Extract the description line from frontmatter
    const descMatch = c.match(/^description: (.*)$/m);
    expect(descMatch).not.toBeNull();
    const desc = descMatch![1];
    // False case: must not contain raw newlines (would break YAML)
    expect(desc).not.toContain('\n');
    // Spaces collapsed: "line one line two line three" appears in some form
    expect(desc).toContain('line one line two line three');
  });

  it('rule names with special characters slug to safe filenames', () => {
    const compilerLocal = new ContextCompiler({ formats: ['cursor_rules'] });
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
              config: {
                name: 'has  spaces, punctuation! & symbols',
                when: 'always',
                do: 'fix it',
                do_not: ['ignore'],
              },
            },
          ],
        },
      ],
    });
    const result = compilerLocal.compile(comp, '');
    const keys = Object.keys(result.files);
    const refusalKey = keys.find((k) => k.startsWith('.cursor/rules/refusal-'));
    expect(refusalKey).toBeDefined();
    // Must match safe filename pattern (alphanumeric + hyphens only)
    expect(refusalKey).toMatch(/^\.cursor\/rules\/refusal-[a-z0-9-]+\.mdc$/);
  });

  it('dual-format compile (cursor_rules + claude_md) emits both shapes in one pass', () => {
    const dual = new ContextCompiler({ formats: ['claude_md', 'cursor_rules'] });
    const result = dual.compile(makeFullV1Composition(), '');
    // Both single-file CLAUDE.md AND per-file Cursor outputs present
    expect(result.files).toHaveProperty('CLAUDE.md');
    expect(result.files).toHaveProperty('.cursor/rules/refusal-bandaid.mdc');
    expect(result.files).toHaveProperty('.cursor/rules/_ecosystem-context.mdc');
    // Shared AST drives both
    expect(result.ast.identity?.name).toBe('ecosystem-engineering-agent');
  });

  it('triple-format compile (claude_md + agents_md + cursor_rules) emits all shapes', () => {
    const triple = new ContextCompiler({
      formats: ['claude_md', 'agents_md', 'cursor_rules'],
    });
    const result = triple.compile(makeFullV1Composition(), '');
    expect(result.files).toHaveProperty('CLAUDE.md');
    expect(result.files).toHaveProperty('AGENTS.md');
    expect(result.files).toHaveProperty('.cursor/rules/_ecosystem-context.mdc');
    expect(result.files).toHaveProperty('.cursor/rules/refusal-bandaid.mdc');
    // Each carries its own trailer label
    expect(result.files['CLAUDE.md']).toContain('compile_to_claude_md');
    expect(result.files['AGENTS.md']).toContain('compile_to_agents_md');
    expect(result.files['.cursor/rules/_ecosystem-context.mdc']).toContain(
      'compile_to_cursor_rules'
    );
  });

  it('refusal-only composition emits exactly one per-rule file plus index', () => {
    const compilerLocal = new ContextCompiler({ formats: ['cursor_rules'] });
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
              config: { name: 'demote', when: 'silent scope cut', do: 'name it', do_not: ['silently descope'] },
            },
          ],
        },
      ],
    });
    const result = compilerLocal.compile(comp, '');
    const keys = Object.keys(result.files).sort();
    expect(keys).toEqual([
      '.cursor/rules/_ecosystem-context.mdc',
      '.cursor/rules/refusal-demote.mdc',
    ]);
    // False case: no hard-dont or default files appear when none declared
    expect(keys.some((k) => k.includes('hard-dont-'))).toBe(false);
    expect(keys.some((k) => k.includes('default-'))).toBe(false);
  });
});

// --- Happy path: vocabulary v1 -> skill_md (Claude Code skill format) ---

describe('compile() - vocabulary v1 -> skill_md', () => {
  let compiler: ContextCompiler;

  /**
   * Skill_md requires identity.description and (optionally) identity.allowedTools.
   * The base full-V1 fixture doesn't set those, so this builder extends it.
   */
  function makeFullV1WithSkillFields(): HoloComposition {
    return makeComposition({
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
                name: 'founder',
                role: 'team-engineering',
                domain: 'holoscript-ecosystem',
                surface: 'claude',
                no_monopoly: true,
                description:
                  'AUTO-FIRE founder decision proxy for the HoloScript / Infinitus ecosystem. Agents invoke this skill on their own when about to bandaid, workaround, demote, or wait-for-founder.',
                allowed_tools: ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebFetch'],
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
                id: '3',
                claim: 'Architecture beats alignment.',
                citation: 'W.GOLD.001',
              },
            },
            {
              type: 'ObjectTrait',
              name: 'refusal',
              config: {
                name: 'bandaid',
                when: 'test failing, type wrong, hook misbehaving',
                do: 'fix root cause',
                do_not: ['skip', '.only', '@ts-ignore'],
                reason: 'W.GOLD.001 - architecture beats alignment',
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

  beforeEach(() => {
    compiler = new ContextCompiler({ formats: ['skill_md'] });
  });

  it('emits SKILL.md as the file key', () => {
    const result = compiler.compile(makeFullV1WithSkillFields(), '');
    expect(result.files).toHaveProperty('SKILL.md');
    // False case: only SKILL.md is produced, not CLAUDE.md or AGENTS.md
    expect(Object.keys(result.files)).toEqual(['SKILL.md']);
    expect(result.files).not.toHaveProperty('CLAUDE.md');
    expect(result.files).not.toHaveProperty('AGENTS.md');
  });

  it('emits YAML frontmatter with name, description, allowed-tools', () => {
    const md = compiler.compile(makeFullV1WithSkillFields(), '').files['SKILL.md'];
    expect(md.startsWith('---\n')).toBe(true);
    expect(md).toContain('\nname: founder\n');
    expect(md).toContain('\nallowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch\n');
    // The description renders as inline JSON-quoted (single-line input)
    expect(md).toMatch(/description: "AUTO-FIRE founder decision proxy/);
    // False case: must NOT emit description as bare unquoted text (YAML parse risk)
    expect(md).not.toContain('description: AUTO-FIRE founder');
  });

  it('frontmatter block closes with --- before the body header', () => {
    const md = compiler.compile(makeFullV1WithSkillFields(), '').files['SKILL.md'];
    // The third occurrence of --- is the trailer separator; the second
    // is the frontmatter close. Body title (# founder) must come AFTER
    // the second ---.
    const titleIdx = md.indexOf('# founder');
    const closeFmIdx = md.indexOf('---\n', md.indexOf('---\n') + 4); // 2nd ---
    expect(titleIdx).toBeGreaterThan(closeFmIdx);
    expect(closeFmIdx).toBeGreaterThan(0);
  });

  it('emits body title and identity blockquote underneath frontmatter', () => {
    const md = compiler.compile(makeFullV1WithSkillFields(), '').files['SKILL.md'];
    expect(md).toContain('# founder');
    expect(md).toContain('**Role**: team-engineering');
    expect(md).toContain('**Domain**: holoscript-ecosystem');
    expect(md).toContain('**Surface**: claude');
    expect(md).toContain('No-monopoly rule');
  });

  it('emits universal sections (authority order, vision pillars, refusals, gaps)', () => {
    const md = compiler.compile(makeFullV1WithSkillFields(), '').files['SKILL.md'];
    expect(md).toContain('## Authority order (read top-down; first match wins)');
    expect(md).toContain('1. **GOLD vault**');
    expect(md).toContain('## Vision pillars');
    expect(md).toContain('Architecture beats alignment');
    expect(md).toContain('## The Four Refusals');
    expect(md).toContain('### Refuse the bandaid');
    expect(md).toContain('## Hard physical gaps (skill never absorbs)');
    expect(md).toContain('**trezor-signing**');
  });

  it('emits authority cross-references for graduated wisdom', () => {
    const md = compiler.compile(makeFullV1WithSkillFields(), '').files['SKILL.md'];
    expect(md).toContain('## Authority cross-references');
    expect(md).toContain('### GOLD-tier wisdom');
    expect(md).toContain('**W.GOLD.001** *(diamond)* - Architecture beats alignment');
  });

  it('emits skill_md trailer naming the Phase 2(a) self-host target', () => {
    const md = compiler.compile(makeFullV1WithSkillFields(), '').files['SKILL.md'];
    expect(md).toContain('Generated by HoloScript ContextCompiler (compile_to_skill_md)');
    expect(md).toContain('Phase 2(a) self-host target');
    // False case: must NOT carry trailers from other emitters
    expect(md).not.toContain('compile_to_claude_md');
    expect(md).not.toContain('compile_to_agents_md');
    expect(md).not.toContain('compile_to_cursor_rules');
  });

  it('uses cross-tool default allowed-tools when @identity.allowed_tools is omitted', () => {
    const compilerLocal = new ContextCompiler({ formats: ['skill_md'] });
    const md = compilerLocal.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'identity',
                config: {
                  name: 'minimal',
                  role: 'r',
                  domain: 'd',
                  surface: 'claude',
                  description: 'a minimal skill',
                  // allowed_tools intentionally omitted - emitter falls back to default
                },
              },
            ],
          },
        ],
      }),
      ''
    ).files['SKILL.md'];
    expect(md).toContain(
      'allowed-tools: Bash, Read, Write, Edit, Grep, Glob, WebFetch'
    );
  });

  it('formats multi-line description as YAML folded scalar (>)', () => {
    const compilerLocal = new ContextCompiler({ formats: ['skill_md'] });
    const md = compilerLocal.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'identity',
                config: {
                  name: 'multi',
                  role: 'r',
                  domain: 'd',
                  surface: 'claude',
                  description: 'first line\nsecond line\nthird line',
                },
              },
            ],
          },
        ],
      }),
      ''
    ).files['SKILL.md'];
    expect(md).toContain('description: >\n  first line\n  second line\n  third line');
    // False case: multi-line input must NOT collapse to a single double-quoted line with literal \n
    expect(md).not.toContain('description: "first line\\nsecond line\\nthird line"');
  });

  it('THROWS when @identity is missing (skill discovery requires name)', () => {
    const compilerLocal = new ContextCompiler({ formats: ['skill_md'] });
    expect(() => compilerLocal.compile(makeComposition(), '')).toThrow(/requires an @identity trait/);
  });

  it('THROWS when @identity.description is missing (skill discovery refuses)', () => {
    const compilerLocal = new ContextCompiler({ formats: ['skill_md'] });
    const noDesc = makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'A',
          properties: [],
          traits: [
            {
              type: 'ObjectTrait',
              name: 'identity',
              config: {
                name: 'no-desc',
                role: 'r',
                domain: 'd',
                surface: 'claude',
                // description intentionally omitted
              },
            },
          ],
        },
      ],
    });
    expect(() => compilerLocal.compile(noDesc, '')).toThrow(/requires @identity.description/);
  });

  it('extracts identity.allowedTools into the AST when @identity.allowed_tools is set', () => {
    const result = compiler.compile(makeFullV1WithSkillFields(), '');
    expect(result.ast.identity?.allowedTools).toEqual([
      'Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebFetch',
    ]);
    expect(result.ast.identity?.description).toContain('AUTO-FIRE founder');
  });

  it('quad-format compile (claude_md + agents_md + cursor_rules + skill_md) emits all four', () => {
    const quad = new ContextCompiler({
      formats: ['claude_md', 'agents_md', 'cursor_rules', 'skill_md'],
    });
    const result = quad.compile(makeFullV1WithSkillFields(), '');
    const keys = Object.keys(result.files).sort();
    expect(keys).toContain('CLAUDE.md');
    expect(keys).toContain('AGENTS.md');
    expect(keys).toContain('SKILL.md');
    expect(keys.some((k) => k.startsWith('.cursor/rules/'))).toBe(true);
    // Each emitter's trailer is distinct - prove cross-emitter separation
    expect(result.files['CLAUDE.md']).toContain('compile_to_claude_md');
    expect(result.files['AGENTS.md']).toContain('compile_to_agents_md');
    expect(result.files['SKILL.md']).toContain('compile_to_skill_md');
  });
});

// --- Vocabulary v2 (Iteration 2 G-3 first slice) -- @invocation_mode ---

describe('compile() - vocabulary v2 -> @invocation_mode', () => {
  it('extracts all 3 founder-skill invocation modes from the full V1 fixture', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.ast.invocationModes).toHaveLength(3);
    const modes = result.ast.invocationModes.map((m) => m.mode);
    expect(modes).toEqual(['auto-fire', 'explicit', 'wrap-other-skill']);
    // False case: optional `example` must come through on modes that set it
    const explicit = result.ast.invocationModes.find((m) => m.mode === 'explicit');
    expect(explicit?.example).toBe('/founder should I use a feature flag here?');
    // False case: omitted example stays undefined, not empty string
    const auto = result.ast.invocationModes.find((m) => m.mode === 'auto-fire');
    expect(auto?.example).toBeUndefined();
  });

  it('emits ## Invocation modes section in claude_md with all 3 modes', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    expect(md).toContain('## Invocation modes');
    expect(md).toContain('### auto-fire');
    expect(md).toContain('### explicit');
    expect(md).toContain('### wrap-other-skill');
    expect(md).toContain('- **When**: agent about to bandaid');
    expect(md).toContain('- **Effect**: skill self-invokes');
    expect(md).toContain('- **Example**: `/founder should I use a feature flag here?`');
    // False case: example renders inside a code span, not bare text
    expect(md).not.toContain('Example: /founder should');
  });

  it('emits ## Invocation modes in agents_md (cross-tool surface)', () => {
    const compiler = new ContextCompiler({ formats: ['agents_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['AGENTS.md'];
    expect(md).toContain('## Invocation modes');
    expect(md).toContain('### auto-fire');
    expect(md).toContain('### explicit');
    expect(md).toContain('### wrap-other-skill');
  });

  it('emits ## Invocation modes in skill_md (the Phase 2(a) self-host target)', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    // skill_md requires identity.description — patch the fixture in-place
    const fixture = makeFullV1Composition();
    const identity = fixture.objects[0]!.traits!.find((t) => t.name === 'identity')!;
    identity.config.description = 'Test skill description for invocation_mode emit verification.';
    const md = compiler.compile(fixture, '').files['SKILL.md'];
    expect(md).toContain('## Invocation modes');
    expect(md).toContain('### auto-fire');
    expect(md).toContain('### wrap-other-skill');
  });

  it('emits ## Invocation modes in cursor_rules index file', () => {
    const compiler = new ContextCompiler({ formats: ['cursor_rules'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    const indexContent = result.files['.cursor/rules/_ecosystem-context.mdc'];
    expect(indexContent).toContain('## Invocation modes');
    expect(indexContent).toContain('### auto-fire');
  });

  it('places Invocation modes BEFORE Recurring routines in claude_md (consistent ordering)', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    const invocationIdx = md.indexOf('## Invocation modes');
    const routinesIdx = md.indexOf('## Recurring routines');
    expect(invocationIdx).toBeGreaterThan(0);
    expect(routinesIdx).toBeGreaterThan(0);
    expect(invocationIdx).toBeLessThan(routinesIdx);
  });

  it('omits ## Invocation modes section when no @invocation_mode traits declared', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeComposition(), '').files['CLAUDE.md'];
    // False case: section header must NOT appear in an empty composition
    expect(md).not.toContain('## Invocation modes');
    expect(md).not.toContain('### auto-fire');
  });

  it('renders an invocation mode without example cleanly (no dangling Example bullet)', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'invocation_mode',
                config: {
                  mode: 'auto-fire',
                  when: 'always',
                  effect: 'fires',
                  // example intentionally omitted
                },
              },
            ],
          },
        ],
      }),
      ''
    ).files['CLAUDE.md'];
    expect(md).toContain('### auto-fire');
    expect(md).toContain('- **When**: always');
    expect(md).toContain('- **Effect**: fires');
    // False case: no Example bullet should appear when example is omitted
    expect(md).not.toContain('- **Example**:');
  });

  it('accepts open-ended mode strings (vocabulary is extensible)', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'invocation_mode',
                config: {
                  mode: 'scheduled-cron',
                  when: 'cron 0 13 * * 1',
                  effect: 'A-019 routine fires',
                },
              },
            ],
          },
        ],
      }),
      ''
    );
    expect(result.ast.invocationModes[0]?.mode).toBe('scheduled-cron');
    expect(result.files['CLAUDE.md']).toContain('### scheduled-cron');
  });

  it('defaults mode to "explicit" when source omits the field (forgiving extractor)', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'invocation_mode',
                config: {
                  // mode intentionally omitted
                  when: 'unspecified',
                  effect: 'fires somehow',
                },
              },
            ],
          },
        ],
      }),
      ''
    );
    expect(result.ast.invocationModes[0]?.mode).toBe('explicit');
  });
});

// --- Vocabulary v2 (Iteration 2 G-3 embodied slice) -- @embodied_projection ---

describe('compile() - vocabulary v2 -> @embodied_projection', () => {
  it('extracts embodied projection rows from the full V1 fixture', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.ast.embodiedProjections).toHaveLength(2);
    const quest = result.ast.embodiedProjections.find((p) => p.surface === 'quest-3');
    expect(quest?.projectionKind).toBe('interactive');
    expect(quest?.trigger).toBe('daily founder architecture review');
    expect(quest?.notes).toContain('Quest 3 spatial surface');
    const still = result.ast.embodiedProjections.find((p) => p.surface === 'spatial-photo');
    expect(still?.projectionKind).toBe('read-only');
    // False case: source key projection_kind must map to camel projectionKind, not disappear
    expect((quest as unknown as Record<string, unknown>)?.projection_kind).toBeUndefined();
  });

  it('emits ## Embodied projections section in claude_md', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    expect(md).toContain('## Embodied projections');
    expect(md).toContain('### quest-3 / interactive');
    expect(md).toContain('- **Surface**: quest-3');
    expect(md).toContain('- **Projection kind**: interactive');
    expect(md).toContain('- **Trigger**: daily founder architecture review');
    expect(md).toContain('- **Notes**: project decisive agent state into a Quest 3 spatial surface');
  });

  it('emits ## Embodied projections in agents_md, skill_md, and cursor_rules', () => {
    const agents = new ContextCompiler({ formats: ['agents_md'] })
      .compile(makeFullV1Composition(), '')
      .files['AGENTS.md'];
    expect(agents).toContain('## Embodied projections');
    expect(agents).toContain('### spatial-photo / read-only');

    const fixture = makeFullV1Composition();
    const identity = fixture.objects[0]!.traits!.find((t) => t.name === 'identity')!;
    identity.config.description = 'Test skill description for embodied_projection emit verification.';
    const skill = new ContextCompiler({ formats: ['skill_md'] })
      .compile(fixture, '')
      .files['SKILL.md'];
    expect(skill).toContain('## Embodied projections');
    expect(skill).toContain('### quest-3 / interactive');

    const cursor = new ContextCompiler({ formats: ['cursor_rules'] })
      .compile(makeFullV1Composition(), '')
      .files['.cursor/rules/_ecosystem-context.mdc'];
    expect(cursor).toContain('## Embodied projections');
    expect(cursor).toContain('### quest-3 / interactive');
  });

  it('places Embodied projections AFTER Invocation modes and BEFORE Recurring routines', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    const invocationIdx = md.indexOf('## Invocation modes');
    const embodiedIdx = md.indexOf('## Embodied projections');
    const routinesIdx = md.indexOf('## Recurring routines');
    expect(invocationIdx).toBeGreaterThan(0);
    expect(embodiedIdx).toBeGreaterThan(invocationIdx);
    expect(routinesIdx).toBeGreaterThan(embodiedIdx);
  });

  it('omits ## Embodied projections section when no @embodied_projection traits declared', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeComposition(), '').files['CLAUDE.md'];
    // False case: section header must NOT appear in an empty composition
    expect(md).not.toContain('## Embodied projections');
    expect(md).not.toContain('### quest-3 / interactive');
  });

  it('defaults projection_kind to read-only when omitted', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'Projection',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'embodied_projection',
                config: {
                  surface: 'hologram',
                  trigger: 'status review',
                  // projection_kind intentionally omitted
                },
              },
            ],
          },
        ],
      }),
      ''
    );
    expect(result.ast.embodiedProjections[0]?.projectionKind).toBe('read-only');
    expect(result.files['CLAUDE.md']).toContain('### hologram / read-only');
  });

  it('renders without optional notes cleanly', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'Projection',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'embodied_projection',
                config: {
                  surface: 'quest-3',
                  projection_kind: 'interactive',
                  trigger: 'founder review',
                  // notes intentionally omitted
                },
              },
            ],
          },
        ],
      }),
      ''
    ).files['CLAUDE.md'];
    expect(md).toContain('### quest-3 / interactive');
    expect(md).toContain('- **Trigger**: founder review');
    // False case: optional notes must not leak as an empty bullet
    expect(md).not.toContain('- **Notes**:');
  });
});

// --- Vocabulary v2 (Iteration 2 G-3 next slice) -- @date_discipline ---

describe('compile() - vocabulary v2 -> @date_discipline', () => {
  it('extracts the W.317 date-discipline contract from the full V1 fixture', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.ast.dateDisciplines).toHaveLength(1);
    const dd = result.ast.dateDisciplines[0]!;
    expect(dd.wisdomId).toBe('W.317');
    expect(dd.requiredComponents).toEqual([
      'open_blockers',
      'matrix_row_staleness',
      'engineering_readiness',
    ]);
    expect(dd.shapeTemplate).toContain('DATE: 2026-MM-DD');
    expect(dd.shapeTemplate).toContain('ENGINEERING-READINESS:');
    // False case: cross-references must come through as a populated list, not a single string
    expect(dd.crossReferences).toEqual([
      'F.030 paper-audit-matrix-always-stale',
      'W.099 deploy-date-without-blocker',
    ]);
  });

  it('emits ## Date discipline section in claude_md with required components + output shape', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    expect(md).toContain('## Date discipline');
    expect(md).toContain('### Refusal contract (W.317)');
    expect(md).toContain('**Required components** (all must be present):');
    expect(md).toContain('- open_blockers');
    expect(md).toContain('- matrix_row_staleness');
    expect(md).toContain('- engineering_readiness');
    expect(md).toContain('**Output shape**:');
    expect(md).toContain('DATE: 2026-MM-DD');
    expect(md).toContain('**Cross-references**: F.030 paper-audit-matrix-always-stale, W.099 deploy-date-without-blocker');
    // False case: must NOT print the wisdomId as a bare line outside the heading
    expect(md).not.toContain('\nwisdomId: W.317');
  });

  it('renders shape_template inside a fenced code block', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    // Code-fenced output template (literal triple-backticks bracket the shape)
    const fenceCount = (md.match(/```/g) || []).length;
    expect(fenceCount).toBeGreaterThanOrEqual(2);
    // Locate the fence around the date-discipline shape
    const dateBlockIdx = md.indexOf('## Date discipline');
    const fenceAfterIdx = md.indexOf('```', dateBlockIdx);
    expect(fenceAfterIdx).toBeGreaterThan(dateBlockIdx);
  });

  it('emits ## Date discipline in agents_md (cross-tool surface)', () => {
    const compiler = new ContextCompiler({ formats: ['agents_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['AGENTS.md'];
    expect(md).toContain('## Date discipline');
    expect(md).toContain('### Refusal contract (W.317)');
  });

  it('emits ## Date discipline in skill_md (Phase 2(a) self-host target)', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    const fixture = makeFullV1Composition();
    const identity = fixture.objects[0]!.traits!.find((t) => t.name === 'identity')!;
    identity.config.description = 'Test skill description for date_discipline emit verification.';
    const md = compiler.compile(fixture, '').files['SKILL.md'];
    expect(md).toContain('## Date discipline');
    expect(md).toContain('DATE: 2026-MM-DD');
  });

  it('emits ## Date discipline in cursor_rules index file', () => {
    const compiler = new ContextCompiler({ formats: ['cursor_rules'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    const indexContent = result.files['.cursor/rules/_ecosystem-context.mdc'];
    expect(indexContent).toContain('## Date discipline');
    expect(indexContent).toContain('### Refusal contract (W.317)');
  });

  it('places Date discipline BEFORE Citation discipline (consistent ordering across emitters)', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    const dateIdx = md.indexOf('## Date discipline');
    const citationIdx = md.indexOf('## Citation discipline');
    expect(dateIdx).toBeGreaterThan(0);
    expect(citationIdx).toBeGreaterThan(0);
    expect(dateIdx).toBeLessThan(citationIdx);
  });

  it('omits ## Date discipline section when no @date_discipline traits declared', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeComposition(), '').files['CLAUDE.md'];
    // False case: section header must NOT appear in an empty composition
    expect(md).not.toContain('## Date discipline');
    expect(md).not.toContain('### Refusal contract');
  });

  it('renders without optional fields cleanly (no dangling Reason / Cross-references bullets)', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'date_discipline',
                config: {
                  wisdom_id: 'W.317',
                  refusal_contract: 'no bare dates',
                  required_components: ['blockers'],
                  shape_template: 'DATE: ...',
                  // reason + cross_references intentionally omitted
                },
              },
            ],
          },
        ],
      }),
      ''
    ).files['CLAUDE.md'];
    expect(md).toContain('## Date discipline');
    expect(md).toContain('### Refusal contract (W.317)');
    expect(md).toContain('- blockers');
    // False case: optional fields must not leak as empty bullets
    expect(md).not.toContain('**Reason**:');
    expect(md).not.toContain('**Cross-references**:');
  });

  it('drops the wisdomId qualifier when wisdom_id is empty', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'date_discipline',
                config: {
                  // wisdom_id intentionally omitted
                  refusal_contract: 'no bare dates',
                  required_components: ['blockers'],
                  shape_template: 'DATE: ...',
                },
              },
            ],
          },
        ],
      }),
      ''
    ).files['CLAUDE.md'];
    expect(md).toContain('### Refusal contract');
    // False case: must NOT emit empty parens "(W.317)" when wisdomId is empty
    expect(md).not.toContain('### Refusal contract ()');
  });
});

// --- Vocabulary v2 (Iteration 2 G-3 third slice) -- @domain_preference ---

describe('compile() - vocabulary v2 -> @domain_preference', () => {
  it('extracts both domain-preference rows from the full V1 fixture', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.ast.domainPreferences).toHaveLength(2);
    const legal = result.ast.domainPreferences.find((d) => d.domain === 'legal');
    expect(legal?.skills).toEqual(['/legal:triage-nda', '/legal:review-contract']);
    expect(legal?.ceiling).toBeUndefined();
    const capital = result.ast.domainPreferences.find((d) => d.domain === 'capital');
    expect(capital?.skills).toEqual([]);
    expect(capital?.ceiling).toBe('$5 standing spend cap');
    // False case: skills must NOT be a single string when source set an array
    expect(typeof legal?.skills).toBe('object');
  });

  it('emits ## Domain preferences as a markdown table in claude_md', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    expect(md).toContain('## Domain preferences');
    expect(md).toContain('| Domain | Skills to delegate to | Notes / ceiling |');
    expect(md).toContain('|---|---|---|');
    expect(md).toContain('| **legal** |');
    expect(md).toContain('`/legal:triage-nda`');
    expect(md).toContain('`/legal:review-contract`');
    expect(md).toContain('| **capital** |');
    expect(md).toContain('Ceiling: $5 standing spend cap');
    // False case: rows must use code spans for skills (not bare slashes that markdown could break on)
    expect(md).not.toContain('| **legal** | /legal:triage-nda,');
  });

  it('renders empty skills list as in-skill-default placeholder', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    // capital row has skills: [] in fixture
    expect(md).toContain('*(in-skill default)*');
    // False case: empty list must NOT render as an empty cell or stray comma
    expect(md).not.toContain('| **capital** |  |');
  });

  it('emits ## Domain preferences in agents_md (cross-tool surface)', () => {
    const compiler = new ContextCompiler({ formats: ['agents_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['AGENTS.md'];
    expect(md).toContain('## Domain preferences');
    expect(md).toContain('| **legal** |');
  });

  it('emits ## Domain preferences in skill_md (Phase 2(a) self-host target)', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    const fixture = makeFullV1Composition();
    const identity = fixture.objects[0]!.traits!.find((t) => t.name === 'identity')!;
    identity.config.description = 'Test skill description for domain_preference emit verification.';
    const md = compiler.compile(fixture, '').files['SKILL.md'];
    expect(md).toContain('## Domain preferences');
    expect(md).toContain('| **legal** |');
  });

  it('emits ## Domain preferences in cursor_rules index file', () => {
    const compiler = new ContextCompiler({ formats: ['cursor_rules'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    const indexContent = result.files['.cursor/rules/_ecosystem-context.mdc'];
    expect(indexContent).toContain('## Domain preferences');
    expect(indexContent).toContain('| **legal** |');
  });

  it('places Domain preferences AFTER known founder defaults and BEFORE Output shape', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    const knownDefaultsIdx = md.indexOf('## Known founder defaults');
    const domainIdx = md.indexOf('## Domain preferences');
    const outputShapeIdx = md.indexOf('## Output shape');
    expect(knownDefaultsIdx).toBeGreaterThan(0);
    expect(domainIdx).toBeGreaterThan(knownDefaultsIdx);
    expect(outputShapeIdx).toBeGreaterThan(domainIdx);
  });

  it('omits ## Domain preferences section when no @domain_preference traits declared', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeComposition(), '').files['CLAUDE.md'];
    // False case: section header must NOT appear in an empty composition
    expect(md).not.toContain('## Domain preferences');
    expect(md).not.toContain('| Domain | Skills to delegate');
  });

  it('renders ceiling without notes cleanly (no orphan semicolon)', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'domain_preference',
                config: {
                  domain: 'capital',
                  skills: [],
                  ceiling: '$5 cap',
                  // notes intentionally omitted
                },
              },
            ],
          },
        ],
      }),
      ''
    ).files['CLAUDE.md'];
    expect(md).toContain('Ceiling: $5 cap');
    // False case: trailing "; " from missing notes must not appear
    expect(md).not.toContain('Ceiling: $5 cap;');
  });

  it('renders notes without ceiling cleanly', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'domain_preference',
                config: {
                  domain: 'brand',
                  skills: ['/marketer'],
                  notes: 'documentarian voice; no salesy hype',
                  // ceiling intentionally omitted
                },
              },
            ],
          },
        ],
      }),
      ''
    ).files['CLAUDE.md'];
    expect(md).toContain('| **brand** |');
    expect(md).toContain('`/marketer`');
    expect(md).toContain('documentarian voice');
    // False case: must NOT prefix a "Ceiling:" label when ceiling absent
    expect(md).not.toContain('Ceiling: documentarian');
  });
});

// --- Vocabulary v2 (Iteration 2 G-3 authority slice) -- @authority ---

describe('compile() - vocabulary v2 -> @authority', () => {
  it('extracts Track-B mutable-target authority rows from the full V1 fixture', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.ast.trackBAuthorities).toHaveLength(4);

    const skillEdit = result.ast.trackBAuthorities.find(
      (row) => row.actionType === 'skill-edit'
    );
    expect(skillEdit?.target).toBe('SKILL.md (this file)');
    expect(skillEdit?.founderRatificationRequired).toBe(false);
    expect(skillEdit?.requires).toContain('backup before write');

    const pillar = result.ast.trackBAuthorities.find(
      (row) => row.actionType === 'pillar-mutate'
    );
    expect(pillar?.founderRatificationRequired).toBe(true);
    expect(pillar?.requires).toContain('explicit founder line in same session');
    // False case: action_type must stay separate from the target label
    expect((skillEdit as unknown as { action_type?: string }).action_type).toBeUndefined();
  });

  it('emits Track-B authority as split mutable and founder-ratified tables in claude_md', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    expect(md).toContain('## Self-edit + tier-write authority (Track B)');
    expect(md).toContain('### Mutable targets');
    expect(md).toContain('### Founder-ratification-required targets');
    expect(md).toContain('| SKILL.md (this file) | `skill-edit` |');
    expect(md).toContain('| references/preferences.md | `preferences-edit` |');
    expect(md).toContain('| Vision pillar mutation | `pillar-mutate` |');
    expect(md).toContain('| Authority order rewrite | `authority-rewrite` |');
    expect(md).toContain('| Vision pillar mutation | `pillar-mutate` | explicit founder line in same session<br>backup before write<br>log ratification quote | Yes |');
    // False case: founder-ratified rows must not be rendered as mutable "No" rows
    expect(md).not.toContain('| Vision pillar mutation | `pillar-mutate` | explicit founder line in same session<br>backup before write<br>log ratification quote | No |');
  });

  it('emits Track-B authority in agents_md (cross-tool surface)', () => {
    const compiler = new ContextCompiler({ formats: ['agents_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['AGENTS.md'];
    expect(md).toContain('## Self-edit + tier-write authority (Track B)');
    expect(md).toContain('| SKILL.md (this file) | `skill-edit` |');
  });

  it('emits Track-B authority in skill_md (Phase 2(a) self-host target)', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    const fixture = makeFullV1Composition();
    const identity = fixture.objects[0]!.traits!.find((t) => t.name === 'identity')!;
    identity.config.description = 'Test skill description for authority emit verification.';
    const md = compiler.compile(fixture, '').files['SKILL.md'];
    expect(md).toContain('## Self-edit + tier-write authority (Track B)');
    expect(md).toContain('backup-before-write');
    expect(md).toContain('### Founder-ratification-required targets');
  });

  it('emits Track-B authority in cursor_rules index file', () => {
    const compiler = new ContextCompiler({ formats: ['cursor_rules'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    const indexContent = result.files['.cursor/rules/_ecosystem-context.mdc'];
    expect(indexContent).toContain('## Self-edit + tier-write authority (Track B)');
    expect(indexContent).toContain('| Authority order rewrite | `authority-rewrite` |');
  });

  it('places Track-B authority after Domain preferences and before Papers program defaults', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    const domainIdx = md.indexOf('## Domain preferences');
    const authorityIdx = md.indexOf('## Self-edit + tier-write authority (Track B)');
    const papersIdx = md.indexOf('## Papers program defaults');
    expect(domainIdx).toBeGreaterThan(0);
    expect(authorityIdx).toBeGreaterThan(domainIdx);
    expect(papersIdx).toBeGreaterThan(authorityIdx);
  });

  it('omits Track-B authority section when no @authority traits are declared', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeComposition(), '').files['CLAUDE.md'];
    // False case: authority_order must not trigger Track-B mutation authority output
    expect(md).not.toContain('## Self-edit + tier-write authority (Track B)');
    expect(md).not.toContain('### Mutable targets');
  });

  it('defaults founder_ratification_required to false and renders missing notes cleanly', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'authority',
                config: {
                  target: 'D:/GOLD/<tier>/<id>.md write',
                  action_type: 'gold-write',
                  requires: ['backup before write'],
                  // founder_ratification_required + notes intentionally omitted
                },
              },
            ],
          },
        ],
      }),
      ''
    );
    expect(result.ast.trackBAuthorities[0]?.founderRatificationRequired).toBe(false);
    const md = result.files['CLAUDE.md'];
    expect(md).toContain('| D:/GOLD/<tier>/<id>.md write | `gold-write` | backup before write | No |  |');
    // False case: missing notes should not leak as "undefined"
    expect(md).not.toContain('undefined');
  });
});

// --- Vocabulary v2 (Iteration 2 G-3 fourth slice) -- papers defaults ---

describe('compile() - vocabulary v2 -> @editorial_default + @research_default', () => {
  it('extracts scoped editorial and research defaults from the full V1 fixture', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    expect(result.ast.editorialDefaults).toHaveLength(2);
    expect(result.ast.researchDefaults).toHaveLength(2);

    const byline = result.ast.editorialDefaults.find((d) => d.name === 'paper-byline');
    expect(byline?.paperId).toBe('program');
    expect(byline?.paperPhase).toBe('all');
    expect(byline?.do).toContain('Josep Valls-Vargas');

    const validation = result.ast.researchDefaults.find(
      (d) => d.name === 'result-validation-sessions'
    );
    expect(validation?.paperPhase).toBe('validation');
    expect(validation?.reason).toBe('F.023');
    // False case: paper_id and paper_phase must stay separate fields, not a single scope string
    expect((validation as unknown as { scope?: string }).scope).toBeUndefined();
  });

  it('emits a Papers program defaults section with editorial and research tables', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    expect(md).toContain('## Papers program defaults');
    expect(md).toContain('### Editorial defaults');
    expect(md).toContain('### Research-decision defaults');
    expect(md).toContain('| Scope | Question | Answer | Reason |');
    expect(md).toContain('| program / all | Can I change a paper byline? |');
    expect(md).toContain('**No. Josep Valls-Vargas is the byline.**');
    expect(md).toContain('| tvcg-revision-1 / held | Can I push a revised bundle to the editor? |');
    expect(md).toContain('| program / validation | New result needs validation across how many sessions? |');
    // False case: section must not collapse editorial + research into Known defaults
    const knownDefaults = md.slice(
      md.indexOf('## Known defaults'),
      md.indexOf('## Domain preferences')
    );
    expect(knownDefaults).not.toContain('Can I change a paper byline?');
  });

  it('emits Papers program defaults in agents_md (cross-tool surface)', () => {
    const compiler = new ContextCompiler({ formats: ['agents_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['AGENTS.md'];
    expect(md).toContain('## Papers program defaults');
    expect(md).toContain('### Editorial defaults');
    expect(md).toContain('### Research-decision defaults');
  });

  it('emits Papers program defaults in skill_md (Phase 2(a) self-host target)', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    const fixture = makeFullV1Composition();
    const identity = fixture.objects[0]!.traits!.find((t) => t.name === 'identity')!;
    identity.config.description = 'Test skill description for papers defaults emit verification.';
    const md = compiler.compile(fixture, '').files['SKILL.md'];
    expect(md).toContain('## Papers program defaults');
    expect(md).toContain('Can I change a paper byline?');
  });

  it('emits Papers program defaults in cursor_rules index file', () => {
    const compiler = new ContextCompiler({ formats: ['cursor_rules'] });
    const result = compiler.compile(makeFullV1Composition(), '');
    const indexContent = result.files['.cursor/rules/_ecosystem-context.mdc'];
    expect(indexContent).toContain('## Papers program defaults');
    expect(indexContent).toContain('| program / evidence | A paper needs a solver');
  });

  it('places Papers program defaults AFTER Domain preferences and BEFORE Output shape', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeFullV1Composition(), '').files['CLAUDE.md'];
    const domainIdx = md.indexOf('## Domain preferences');
    const papersIdx = md.indexOf('## Papers program defaults');
    const outputShapeIdx = md.indexOf('## Output shape');
    expect(domainIdx).toBeGreaterThan(0);
    expect(papersIdx).toBeGreaterThan(domainIdx);
    expect(outputShapeIdx).toBeGreaterThan(papersIdx);
  });

  it('omits Papers program defaults when no papers defaults traits are declared', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(makeComposition(), '').files['CLAUDE.md'];
    // False case: section header must NOT appear in an empty composition
    expect(md).not.toContain('## Papers program defaults');
    expect(md).not.toContain('### Editorial defaults');
    expect(md).not.toContain('### Research-decision defaults');
  });

  it('renders program-wide scope and missing reason cleanly', () => {
    const compiler = new ContextCompiler({ formats: ['claude_md'] });
    const md = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'editorial_default',
                config: {
                  name: 'program-default',
                  when: 'Can I ship locally?',
                  do: 'Yes, if validation passes.',
                  // paper_id, paper_phase, and reason intentionally omitted
                },
              },
            ],
          },
        ],
      }),
      ''
    ).files['CLAUDE.md'];
    expect(md).toContain('| program-wide | Can I ship locally? | **Yes, if validation passes.** | *(no citation)* |');
    // False case: no empty slash from missing paper_id / paper_phase
    expect(md).not.toContain('|  /  |');
  });
});

// --- Vocabulary v3 (Iteration 3 first slice) -- ContextIdentity.commandTemplate ---
//
// Closes Loss-1 from docs/founder-skill-cutover-prep.md: the functional
// gap where /skill-name [question] explicit invocation flows lose the
// [question] text because the emitted SKILL.md doesn't carry the
// `**Command**: $ARGUMENTS` placeholder Claude Code substitutes at
// invocation time. Skill-md only — other emitters don't need the
// surface-specific argument injection.

describe('compile() - vocabulary v3 -> identity.command_template', () => {
  function makeIdentityWithCommand(template: string | null): HoloComposition {
    const config: Record<string, unknown> = {
      name: 'founder',
      role: 'founder-decision-proxy',
      domain: 'holoscript-ecosystem',
      surface: 'claude',
      no_monopoly: true,
      description: 'Test description',
    };
    if (template !== null) config.command_template = template;
    return makeComposition({
      objects: [
        {
          type: 'Object',
          name: 'A',
          properties: [],
          traits: [{ type: 'ObjectTrait', name: 'identity', config }],
        },
      ],
    });
  }

  it('extracts command_template from @identity into ast.identity.commandTemplate', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    const result = compiler.compile(makeIdentityWithCommand('$ARGUMENTS'), '');
    expect(result.ast.identity?.commandTemplate).toBe('$ARGUMENTS');
    // False case: must NOT default to a placeholder string when source omits it
  });

  it('emits **Command**: $ARGUMENTS line in skill_md when command_template is set', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    const md = compiler.compile(makeIdentityWithCommand('$ARGUMENTS'), '').files['SKILL.md'];
    expect(md).toContain('**Command**: $ARGUMENTS');
    // False case: must NOT emit a literal `${commandTemplate}` template-literal leak
    expect(md).not.toContain('${');
    expect(md).not.toContain('commandTemplate');
  });

  it('places **Command** line AFTER identity blockquote and BEFORE first ## section', () => {
    const compiler = new ContextCompiler({
      formats: ['skill_md'],
    });
    const md = compiler.compile(
      makeComposition({
        objects: [
          {
            type: 'Object',
            name: 'A',
            properties: [],
            traits: [
              {
                type: 'ObjectTrait',
                name: 'identity',
                config: {
                  name: 'founder',
                  role: 'r',
                  domain: 'd',
                  surface: 'claude',
                  description: 'desc',
                  command_template: '$ARGUMENTS',
                },
              },
              {
                type: 'ObjectTrait',
                name: 'authority_order',
                config: { tiers: ['GOLD vault'] },
              },
            ],
          },
        ],
      }),
      ''
    ).files['SKILL.md'];
    const blockquoteIdx = md.indexOf('> **Surface**:');
    const commandIdx = md.indexOf('**Command**:');
    const sectionIdx = md.indexOf('## Authority order');
    expect(blockquoteIdx).toBeGreaterThan(0);
    expect(commandIdx).toBeGreaterThan(blockquoteIdx);
    expect(sectionIdx).toBeGreaterThan(commandIdx);
  });

  it('omits **Command** line entirely when command_template is absent', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    const md = compiler.compile(makeIdentityWithCommand(null), '').files['SKILL.md'];
    // False case: header must NOT leak when source omitted the field
    expect(md).not.toContain('**Command**:');
  });

  it('omits **Command** line when command_template is empty string (treats falsy as absent)', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    const md = compiler.compile(makeIdentityWithCommand(''), '').files['SKILL.md'];
    // Empty string is the same as absent — no Command line + no orphan colon
    expect(md).not.toContain('**Command**:');
    expect(md).not.toContain('**Command**: \n');
  });

  it('accepts arbitrary command template strings (not just $ARGUMENTS)', () => {
    const compiler = new ContextCompiler({ formats: ['skill_md'] });
    const md = compiler.compile(
      makeIdentityWithCommand('${USER_QUESTION} (received via /founder)'),
      ''
    ).files['SKILL.md'];
    expect(md).toContain('**Command**: ${USER_QUESTION} (received via /founder)');
  });

  it('does NOT emit Command line in claude_md / agents_md / cursor_rules (skill_md only)', () => {
    // Other emitters render the same identity but skip surface-specific
    // command injection. Verify by compiling with all formats and checking
    // each output file independently.
    const all = new ContextCompiler({
      formats: ['claude_md', 'agents_md', 'cursor_rules', 'skill_md'],
    });
    const result = all.compile(makeIdentityWithCommand('$ARGUMENTS'), '');
    expect(result.files['CLAUDE.md']).not.toContain('**Command**: $ARGUMENTS');
    expect(result.files['AGENTS.md']).not.toContain('**Command**: $ARGUMENTS');
    expect(result.files['SKILL.md']).toContain('**Command**: $ARGUMENTS');
    // Cursor rules emits multiple files; ensure none of them carry the placeholder
    const cursorPaths = Object.keys(result.files).filter((k) => k.startsWith('.cursor/rules/'));
    for (const p of cursorPaths) {
      expect(result.files[p]).not.toContain('**Command**: $ARGUMENTS');
    }
  });
});
