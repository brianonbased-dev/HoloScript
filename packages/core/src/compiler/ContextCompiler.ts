/**
 * ContextCompiler - Compile HoloScript context compositions to agent-surface formats
 *
 * Per "Context as a HoloScript Compile Target" memo (ai-ecosystem
 * research/2026-05-06_context-as-compile-target.md, ratified 2026-05-06):
 * every AI surface (Claude Code, Codex, Cursor, Copilot, Gemini, future)
 * is a HoloScript compile target. Founder writes context once in `.hs`
 * source; emitters produce CLAUDE.md / AGENTS.md / SKILL.md /
 * .cursor/rules / system prompts / MCP configs from the same source.
 *
 * Architectural posture: BRIDGE compiler (W.GOLD.002 - emit-only,
 * minimal). The vocabulary types below ARE the sovereign concept; the
 * emitters are the bridges. Per W.GOLD.039 (Sapir-Whorf - the compiler
 * as the limit of the possible), the trait vocabulary chosen here IS
 * the universe of agent-context expressibility - choose primitives
 * that map to founder-skill-grade rules, not to surface-specific knobs.
 *
 * Vocabulary v1 (ratified 2026-05-06):
 *
 *   Top-level blocks (5):
 *     identity, authority_order, vision_pillar, output_shape, production_rule
 *
 *   Per-rule traits (13):
 *     @refusal, @hard_dont, @default, @graduated_wisdom, @feedback,
 *     @escalation, @verify_token, @gap_rule, @citation_rule, @skill,
 *     @include, @routine, @hard_physical_gap
 *
 * Constraint enforcement (ratified): TIERED. BLOCK Diamond-invariant
 * violations (vendor-as-substrate, refusal contradicting Diamond wisdom,
 * banned-pattern defaults, hard-physical-gap claims, fake-Diamond
 * declarations). WARN soft-guideline (stale citations, fluent prose
 * without citation, schedule conflicts, unresolved verify-tokens).
 *
 * @version 1.4.3 (Phase 2(a) Iteration 2 G-3 vocabulary v2 slices:
 *   @invocation_mode, @date_discipline, @domain_preference, and
 *   @embodied_projection. Phase 1 emitters: claude_md + agents_md +
 *   cursor_rules + skill_md (all 4 render the new sections). Remaining
 *   Phase 1+ follow-ups: anthropic_system_prompt / brain_includes /
 *   mcp_context_loader. Remaining Iteration 2 G-3 vocabulary: Track-B
 *   authority and papers program.)
 * @module @holoscript/core/compiler/ContextCompiler
 */

import { CompilerBase } from './CompilerBase';
import { ANSCapabilityPath, type ANSCapabilityPathValue } from '@holoscript/core-types/ans';
import type {
  HoloComposition,
  HoloObjectDecl,
  HoloObjectTrait,
  HoloValue,
} from '../parser/HoloCompositionTypes';

// =============================================================================
// VOCABULARY v1 - TYPED CONTEXT AST (the sovereign concept)
// =============================================================================

export type ContextSurface =
  | 'claude'
  | 'codex'
  | 'cursor'
  | 'copilot'
  | 'gemini'
  | 'any';

/**
 * Top-level block: who is this context for.
 *
 * `description` and `allowedTools` are optional fields used by the
 * compile_to_skill_md emitter for the YAML frontmatter (`description:`
 * and `allowed-tools:`) Claude Code's skill discovery reads. Other
 * emitters (claude_md, agents_md, cursor_rules) ignore them. Setting
 * them is required for self-hosting a Claude Code skill from a
 * composition source (Phase 2(a) target).
 */
export interface ContextIdentity {
  name: string;
  role: string;
  domain: string;
  surface: ContextSurface;
  noMonopoly: boolean;
  description?: string;          // skill_md frontmatter `description:`
  allowedTools?: string[];       // skill_md frontmatter `allowed-tools:`
}

/** Top-level block: priority ordering of authority sources. */
export interface ContextAuthorityOrder {
  tiers: string[];
}

/** Top-level block: load-bearing claim that shapes every decision. */
export interface ContextVisionPillar {
  id: string;
  claim: string;
  citation?: string;
}

/** Top-level block: communication contract (silent-to-Joseph, etc.). */
export interface ContextOutputShape {
  silentTo: string;
  loudTo: string;
  noMetaOutput: boolean;
  surfaceHint: string;
}

/** Top-level block: environmental defaults (no dev, no mock, no localhost). */
export interface ContextProductionRule {
  noDevNoMockNoLocalhost: boolean;
  exception?: string;
}

/** Per-rule: stop-and-reframe pattern (Four Refusals). */
export interface ContextRefusal {
  name: string;
  when: string;
  do: string;
  doNot: string[];
  reason?: string;
}

/** Per-rule: cross-provider red line. */
export interface ContextHardDont {
  name: string;
  reason: string;
  alternative?: string;
  appliesTo: string[];
}

/** Per-rule: known answer to a recurring question. */
export interface ContextDefault {
  name: string;
  when: string;
  do: string;
  reason?: string;
}

/** Per-rule: GOLD-tier wisdom reference. */
export interface ContextGraduatedWisdom {
  id: string;             // W.GOLD.XXX or P.GOLD.XXX
  claim: string;
  tier: 'diamond' | 'platinum' | 'gold';
}

/** Per-rule: F.* feedback memory entry. */
export interface ContextFeedback {
  id: string;             // F.XXX
  claim: string;
  source?: string;
}

/** Per-rule: when to escalate to founder. */
export interface ContextEscalation {
  trigger: string;
  doAction: string;
  recipient: string;
  refuseToEscalateWhen: string[];
}

/** Per-rule: confidence-flagging convention. */
export interface ContextVerifyToken {
  meaning: string;
  example: string;
}

/** Per-rule: gap-build pattern (don't bandaid, don't descope). */
export interface ContextGapRule {
  name: string;
  when: string;
  do: string[];
  doNot: string[];
  reason?: string;
}

/** Per-rule: when fluent prose needs citation. */
export interface ContextCitationRule {
  fluentProseThresholdChars: number;
  required: string[];
  exemption?: string;
  reason?: string;
}

/** Per-rule: skill registration (with output_protocol folded in per v1 ratification). */
export interface ContextSkill {
  name: string;
  invocableAs: string;
  authority: string;
  authoritativeFor: string[];
  refusals?: string[];                    // names of @refusal traits this skill enforces
  outputProtocol?: {
    invocation: string;
    format: string;
    surface: string;
  };
}

/** Per-rule: cross-source composition. */
export interface ContextInclude {
  source: string;
  selector?: string;
}

/** Per-rule: A-00X recurring routine (added in v1 ratification). */
export interface ContextRoutine {
  id: string;                             // A-001, A-019, etc.
  schedule: string;                       // cron expression
  skill: string;                          // /research, /scan, etc.
  promptRef: string;                      // file path to prompt
  sla: string;
  outputDir?: string;
  cleanExitScript?: string;
  escalation?: Record<string, string[]>;
}

/**
 * Per-rule: physical-presence boundary the skill never absorbs (added in v1
 * ratification). Trezor signing, Quest 3 use, in-person meetings, paper
 * signatures. Compiler refuses any @skill that claims `authoritativeFor`
 * including one of these names - boundary enforced at compile time.
 */
export interface ContextHardPhysicalGap {
  name: string;
  reason: string;
  appliesTo: string[];
  alternative?: string;
}

/**
 * Per-rule: a domain → execution-skill dispatch row. Vocabulary v2
 * (Phase 2(a) Iteration 2 G-3 third slice). Captures the founder skill's
 * "## Domain preferences (beyond engineering)" dispatch table — each
 * @domain_preference declares which existing skills handle questions
 * scoped to a domain (legal, brand, capital, customer, governance,
 * public-representation, etc.). Multiple per agent context (one per
 * domain). The optional `ceiling` field captures spend or scope caps
 * the founder skill enforces (e.g. "$5 standing spend cap" for capital).
 */
export interface ContextDomainPreference {
  domain: string;                    // domain label (legal, brand, capital, etc.)
  skills: string[];                  // /skill-name dispatch targets
  notes?: string;                    // optional context / disambiguation
  ceiling?: string;                  // optional spend / scope ceiling for this domain
}

/**
 * Per-rule: a date-surfacing refusal contract. Vocabulary v2 (Phase 2(a)
 * Iteration 2 G-3 second slice). Captures `~/.claude/skills/founder/SKILL.md`
 * § Date discipline (W.317): the Martinis-lesson rule that bare optimistic
 * dates burn credibility, so any date surfaced for a milestone must carry
 * named open blockers, matrix-row staleness signal, and engineering
 * readiness color. Multiple date-discipline contracts per agent context
 * are allowed (e.g. one for paper milestones, one for service deploys).
 */
export interface ContextDateDiscipline {
  wisdomId: string;                  // "W.317" or similar
  refusalContract: string;           // one-line summary of the gate
  requiredComponents: string[];      // ordered list (e.g. open_blockers, matrix_row_staleness, engineering_readiness)
  shapeTemplate: string;             // literal output template (multi-line OK)
  reason?: string;                   // citation / context
  crossReferences?: string[];        // related rules / paper-matrix columns
}

/**
 * Per-rule: how this skill can be invoked. Vocabulary v2 (Phase 2(a)
 * Iteration 2 G-3 first slice). The founder skill exposes 3 modes
 * documented in `~/.claude/skills/founder/SKILL.md` § Invocation modes:
 *   - auto-fire        (agent self-invokes when about to bandaid /
 *                      workaround / demote / wait-for-founder)
 *   - explicit         ("/founder [question]")
 *   - wrap-other-skill (embedded in another skill's flow)
 *
 * Other skills may declare different modes (e.g. only explicit, or
 * only auto-fire); the trait is open-ended on `mode` to allow future
 * skills to declare new modes without vocabulary changes — but the
 * common cases stay in the union for documentation purposes.
 */
export type ContextInvocationModeKind =
  | 'auto-fire'
  | 'explicit'
  | 'wrap-other-skill'
  | string;

export interface ContextInvocationMode {
  mode: ContextInvocationModeKind;
  when: string;                      // condition that triggers this mode
  effect: string;                    // what the skill does in this mode
  example?: string;                  // optional invocation example
  // NOTE: source key is `effect:` (not `behavior:`) because `behavior` is
  // a parser-reserved keyword in HoloCompositionParser. Rendered label
  // in emitted markdown is "**Effect**:" for consistency. Same pattern
  // as G-1's ContextEscalation.action -> doAction rename. Per W.GOLD.039
  // (Sapir-Whorf), vocabulary should not adopt parser-reserved tokens.
}

/**
 * Per-rule: how a back-office skill projects into an embodied review
 * surface. Vocabulary v2 (Phase 2(a) Iteration 2 G-3 embodied slice).
 * Captures the "embodied as projection layer" rule from NORTH_STAR §0.4:
 * agent state is surfaced into Quest 3 / spatial / holographic bodies so
 * the founder reviews decisive architecture-level state, not IDE-only
 * chatter. Multiple projections are allowed because the same skill may
 * support interactive Quest review and read-only spatial evidence.
 */
export type ContextEmbodiedProjectionSurface =
  | 'quest-3'
  | 'spatial-photo'
  | 'hologram'
  | string;

export type ContextEmbodiedProjectionKind =
  | 'read-only'
  | 'interactive'
  | string;

export interface ContextEmbodiedProjection {
  surface: ContextEmbodiedProjectionSurface;
  projectionKind: ContextEmbodiedProjectionKind;
  trigger: string;
  notes?: string;
}

/**
 * Parsed context AST - sovereign vocabulary v1 in typed form. The
 * compiler walks the HoloComposition AST, extracts known traits into
 * this shape, validates per BLOCK rules, then dispatches to emitters.
 */
export interface ContextAST {
  // Top-level blocks
  identity?: ContextIdentity;
  authorityOrder?: ContextAuthorityOrder;
  visionPillars: ContextVisionPillar[];
  outputShape?: ContextOutputShape;
  productionRule?: ContextProductionRule;

  // Per-rule traits
  refusals: ContextRefusal[];
  hardDonts: ContextHardDont[];
  defaults: ContextDefault[];
  graduatedWisdoms: ContextGraduatedWisdom[];
  feedbacks: ContextFeedback[];
  escalations: ContextEscalation[];
  verifyTokens: ContextVerifyToken[];
  gapRules: ContextGapRule[];
  citationRules: ContextCitationRule[];
  skills: ContextSkill[];
  includes: ContextInclude[];
  routines: ContextRoutine[];
  hardPhysicalGaps: ContextHardPhysicalGap[];
  invocationModes: ContextInvocationMode[];   // vocabulary v2 (Iteration 2 G-3 first slice)
  dateDisciplines: ContextDateDiscipline[];   // vocabulary v2 (Iteration 2 G-3 second slice)
  domainPreferences: ContextDomainPreference[]; // vocabulary v2 (Iteration 2 G-3 third slice)
  embodiedProjections: ContextEmbodiedProjection[]; // vocabulary v2 (Iteration 2 G-3 embodied slice)

  // Diagnostics surfaced from validation
  warnings: ContextValidationDiagnostic[];
}

export interface ContextValidationDiagnostic {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  location?: string;                      // file:line if known
}

export type ContextEmitFormat =
  | 'claude_md'
  | 'agents_md'
  | 'cursor_rules'
  | 'skill_md'
  | 'anthropic_system_prompt'
  | 'brain_includes'
  | 'mcp_context_loader';

export interface ContextCompileResult {
  files: Record<string, string>;          // emitted-format -> content
  ast: ContextAST;
  diagnostics: ContextValidationDiagnostic[];
}

export interface ContextCompilerOptions {
  /** Which emit formats to produce. Defaults to ['claude_md']. */
  formats?: ContextEmitFormat[];
}

// =============================================================================
// BANNED PATTERNS - Diamond-invariant BLOCK rules (ratified 2026-05-06)
// =============================================================================

/**
 * Banned patterns a `@default` trait MUST NOT recommend. Source-of-truth
 * per founder skill section Known founder defaults + multiple F.* feedback rules.
 * Compiler BLOCKS at emit time.
 */
const BANNED_DEFAULT_PATTERNS: ReadonlyArray<{ pattern: RegExp; rule: string }> = [
  { pattern: /\bgit\s+add\s+(?:-A|--all|\.)(?=\s|$)/i, rule: 'F.001/F.011 - git add -A leaked .env twice' },
  { pattern: /:\s*any\b|\bas\s+any\b|<any>/i, rule: 'global CLAUDE.md - no `any` in TypeScript, use `unknown`' },
  { pattern: /\bregex\b.+\.(?:hs|hsplus|holo)\b/i, rule: 'F.014 - no regex on .hs/.hsplus/.holo, use @holoscript/core' },
  { pattern: /\bmock\s+(?:the\s+)?(?:db|database)\b/i, rule: 'founder-default - real DB in tests, mock-vs-prod divergence' },
];

/**
 * Vendor-as-substrate phrases a `@hard_dont` MUST NOT silently endorse.
 * If a hard_dont's `name` or `reason` indicates the vendor IS the
 * substrate, that's a W.GOLD.002 violation - compiler BLOCKS.
 *
 * (The hard_dont SHOULD say "do NOT make vendor X our substrate" -
 * that's correct. What we're catching is the inverse: a hard_dont
 * authoring substrate-replacement as the desired state.)
 */
const VENDOR_AS_SUBSTRATE_PATTERNS: ReadonlyArray<{ pattern: RegExp; rule: string }> = [
  { pattern: /managed_agents_replaces_holomesh/i, rule: 'W.GOLD.002 - vendor framework cannot replace HoloMesh' },
  { pattern: /vector_store_as_source_of_truth/i, rule: "docs/LLM_CAPABILITIES.md hard-don'ts - vendor stores never source-of-truth" },
  { pattern: /api_keys_as_identity/i, rule: 'W.GOLD.004 - wallets are identity, API keys are sessions' },
];

/**
 * Diamond-tier wisdom IDs that are FOUNDER-DECLARED-ONLY. A
 * @graduated_wisdom claiming `tier: "diamond"` for any other ID
 * (or with no ID at all) is a fake-Diamond declaration - BLOCK.
 *
 * Verified against D:/GOLD/INDEX.md at the time of the v1 ratification.
 * If the vault grows new Diamond entries, this set must be updated
 * (graduation is founder-only - Joseph or the farm pipeline).
 */
const KNOWN_DIAMOND_IDS: ReadonlySet<string> = new Set([
  'W.GOLD.001',     // Architecture beats alignment
  'P.GOLD.001',     // Failure knowledge decays slower than success knowledge
  'W.GOLD.188',     // Algebraic Trust (paired with W.GOLD.189)
  'W.GOLD.189',     // Algebraic Trust tri-layer (algebra + history + oracle)
  // Add more as graduate.py promotes - verify against D:/GOLD/INDEX.md.
]);

/**
 * Citation-rule fluent-prose threshold default (matches pre-commit
 * F.017 hook in ai-ecosystem). Used when the source declares no
 * @citation_rule of its own.
 */
const DEFAULT_FLUENT_PROSE_CHARS = 150;

// =============================================================================
// COMPILER
// =============================================================================

export class ContextCompiler extends CompilerBase {
  protected readonly compilerName = 'ContextCompiler';

  private options: Required<ContextCompilerOptions>;

  constructor(options: ContextCompilerOptions = {}) {
    super();
    this.options = {
      formats: options.formats ?? ['claude_md'],
    };
  }

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    // Reuse the AGENT_INFERENCE capability - context compilation is in
    // the same family as agent inference (both produce agent-surface
    // artifacts). If a dedicated AGENT_CONTEXT capability is added
    // later, swap here.
    return ANSCapabilityPath.AGENT_INFERENCE;
  }

  /**
   * Compile a HoloScript context composition to agent-surface formats.
   *
   * Phases:
   *   1. extract - walk the HoloComposition AST, collect all v1 traits
   *      into the typed ContextAST shape
   *   2. validate - apply BLOCK rules (Diamond-invariant violations) +
   *      WARN rules (soft guidelines). BLOCK rules throw; WARN rules
   *      accumulate in diagnostics.
   *   3. emit - dispatch to per-format emitters. Phase 1 ships claude_md
   *      and agents_md. cursor_rules + skill_md + anthropic_system_prompt
   *      + brain_includes + mcp_context_loader are filed follow-ups.
   */
  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): ContextCompileResult {
    this.validateCompilerAccess(agentToken, outputPath);

    // Phase 1: extract
    const ast = this.extractContextAST(composition);

    // Phase 2: validate (BLOCK rules throw, WARN rules accumulate)
    this.validate(ast);

    // Phase 3: emit
    const files: Record<string, string> = {};
    for (const format of this.options.formats) {
      switch (format) {
        case 'claude_md':
          files['CLAUDE.md'] = this.emitClaudeMd(ast);
          break;
        case 'agents_md':
          files['AGENTS.md'] = this.emitAgentsMd(ast);
          break;
        case 'cursor_rules': {
          // One file per @refusal/@hard_dont/@default plus one index file
          // for top-level blocks (identity, authority order, vision pillars,
          // routines, skills registry, cross-references). Per spec:
          // research/2026-05-06_cursor-mdc-spec.md.
          const cursorFiles = this.emitCursorRules(ast);
          for (const [path, content] of Object.entries(cursorFiles)) {
            files[path] = content;
          }
          break;
        }
        case 'skill_md':
          files['SKILL.md'] = this.emitSkillMd(ast);
          break;
        case 'anthropic_system_prompt':
        case 'brain_includes':
        case 'mcp_context_loader':
          // Phase 1+ follow-ups - see filed board tasks.
          throw new Error(
            `Format "${format}" is a Phase 1+ follow-up; not yet emitted. ` +
              `See ai-ecosystem research/2026-05-06_context-as-compile-target.md ` +
              `section Recommended sequence for the rollout order.`
          );
        default: {
          const exhaustive: never = format;
          throw new Error(`Unknown emit format: ${String(exhaustive)}`);
        }
      }
    }

    return { files, ast, diagnostics: ast.warnings };
  }

  // --- Phase 1: extract -----------------------------------------------

  private extractContextAST(composition: HoloComposition): ContextAST {
    const ast: ContextAST = {
      visionPillars: [],
      refusals: [],
      hardDonts: [],
      defaults: [],
      graduatedWisdoms: [],
      feedbacks: [],
      escalations: [],
      verifyTokens: [],
      gapRules: [],
      citationRules: [],
      skills: [],
      includes: [],
      routines: [],
      hardPhysicalGaps: [],
      invocationModes: [],
      dateDisciplines: [],
      domainPreferences: [],
      embodiedProjections: [],
      warnings: [],
    };

    for (const trait of composition.traits ?? []) {
      this.dispatchTrait(trait, ast);
    }

    for (const obj of composition.objects ?? []) {
      this.extractFromObject(obj, ast);
    }
    return ast;
  }

  private extractFromObject(obj: HoloObjectDecl, ast: ContextAST): void {
    const traits = obj.traits ?? [];
    for (const trait of traits) {
      this.dispatchTrait(trait, ast);
    }
  }

  private dispatchTrait(trait: HoloObjectTrait, ast: ContextAST): void {
    const cfg = trait.config;
    switch (trait.name) {
      case 'identity': {
        const allowedToolsList = stringListField(cfg, 'allowed_tools');
        ast.identity = {
          name: stringField(cfg, 'name', ''),
          role: stringField(cfg, 'role', ''),
          domain: stringField(cfg, 'domain', ''),
          surface: (stringField(cfg, 'surface', 'any') as ContextSurface) ?? 'any',
          noMonopoly: boolField(cfg, 'no_monopoly', false),
          description: stringFieldOrUndef(cfg, 'description'),
          allowedTools: allowedToolsList.length > 0 ? allowedToolsList : undefined,
        };
        break;
      }
      case 'authority_order':
        ast.authorityOrder = { tiers: stringListField(cfg, 'tiers') };
        break;
      case 'vision_pillar':
        ast.visionPillars.push({
          id: stringField(cfg, 'id', ''),
          claim: stringField(cfg, 'claim', ''),
          citation: stringFieldOrUndef(cfg, 'citation'),
        });
        break;
      case 'output_shape':
        ast.outputShape = {
          silentTo: stringField(cfg, 'silent_to', ''),
          loudTo: stringField(cfg, 'loud_to', ''),
          noMetaOutput: boolField(cfg, 'no_meta_output', false),
          surfaceHint: stringField(cfg, 'surface_hint', ''),
        };
        break;
      case 'production_rule':
        ast.productionRule = {
          noDevNoMockNoLocalhost: boolField(cfg, 'no_dev_no_mock_no_localhost', false),
          exception: stringFieldOrUndef(cfg, 'exception'),
        };
        break;
      case 'refusal':
        ast.refusals.push({
          name: stringField(cfg, 'name', ''),
          when: stringField(cfg, 'when', ''),
          do: stringField(cfg, 'do', ''),
          doNot: stringListField(cfg, 'do_not'),
          reason: stringFieldOrUndef(cfg, 'reason'),
        });
        break;
      case 'hard_dont':
        ast.hardDonts.push({
          name: stringField(cfg, 'name', ''),
          reason: stringField(cfg, 'reason', ''),
          alternative: stringFieldOrUndef(cfg, 'alternative'),
          appliesTo: stringListField(cfg, 'applies_to'),
        });
        break;
      case 'default':
        ast.defaults.push({
          name: stringField(cfg, 'name', ''),
          when: stringField(cfg, 'when', ''),
          do: stringField(cfg, 'do', ''),
          reason: stringFieldOrUndef(cfg, 'reason'),
        });
        break;
      case 'graduated_wisdom':
        ast.graduatedWisdoms.push({
          id: stringField(cfg, 'id', ''),
          claim: stringField(cfg, 'claim', ''),
          tier: (stringField(cfg, 'tier', 'gold') as 'diamond' | 'platinum' | 'gold'),
        });
        break;
      case 'feedback':
        ast.feedbacks.push({
          id: stringField(cfg, 'id', ''),
          claim: stringField(cfg, 'claim', ''),
          source: stringFieldOrUndef(cfg, 'source'),
        });
        break;
      case 'escalation':
        ast.escalations.push({
          trigger: stringField(cfg, 'trigger', ''),
          doAction: stringField(cfg, 'do_action', ''),
          recipient: stringField(cfg, 'recipient', ''),
          refuseToEscalateWhen: stringListField(cfg, 'refuse_to_escalate_when'),
        });
        break;
      case 'verify_token':
        ast.verifyTokens.push({
          meaning: stringField(cfg, 'meaning', ''),
          example: stringField(cfg, 'example', ''),
        });
        break;
      case 'gap_rule':
        ast.gapRules.push({
          name: stringField(cfg, 'name', ''),
          when: stringField(cfg, 'when', ''),
          do: stringListField(cfg, 'do'),
          doNot: stringListField(cfg, 'do_not'),
          reason: stringFieldOrUndef(cfg, 'reason'),
        });
        break;
      case 'citation_rule':
        ast.citationRules.push({
          fluentProseThresholdChars: numberField(
            cfg,
            'fluent_prose_threshold_chars',
            DEFAULT_FLUENT_PROSE_CHARS
          ),
          required: stringListField(cfg, 'required'),
          exemption: stringFieldOrUndef(cfg, 'exemption'),
          reason: stringFieldOrUndef(cfg, 'reason'),
        });
        break;
      case 'skill':
        ast.skills.push({
          name: stringField(cfg, 'name', ''),
          invocableAs: stringField(cfg, 'invocable_as', ''),
          authority: stringField(cfg, 'authority', ''),
          authoritativeFor: stringListField(cfg, 'authoritative_for'),
          refusals: stringListField(cfg, 'refusals'),
        });
        break;
      case 'include':
        ast.includes.push({
          source: stringField(cfg, 'source', ''),
          selector: stringFieldOrUndef(cfg, 'selector'),
        });
        break;
      case 'routine':
        ast.routines.push({
          id: stringField(cfg, 'id', ''),
          schedule: stringField(cfg, 'schedule', ''),
          skill: stringField(cfg, 'skill', ''),
          promptRef: stringField(cfg, 'prompt_ref', ''),
          sla: stringField(cfg, 'sla', ''),
          outputDir: stringFieldOrUndef(cfg, 'output_dir'),
          cleanExitScript: stringFieldOrUndef(cfg, 'clean_exit_script'),
        });
        break;
      case 'hard_physical_gap':
        ast.hardPhysicalGaps.push({
          name: stringField(cfg, 'name', ''),
          reason: stringField(cfg, 'reason', ''),
          appliesTo: stringListField(cfg, 'applies_to'),
          alternative: stringFieldOrUndef(cfg, 'alternative'),
        });
        break;
      case 'invocation_mode':
        ast.invocationModes.push({
          mode: stringField(cfg, 'mode', 'explicit'),
          when: stringField(cfg, 'when', ''),
          effect: stringField(cfg, 'effect', ''),
          example: stringFieldOrUndef(cfg, 'example'),
        });
        break;
      case 'date_discipline': {
        const crossRefs = stringListField(cfg, 'cross_references');
        ast.dateDisciplines.push({
          wisdomId: stringField(cfg, 'wisdom_id', ''),
          refusalContract: stringField(cfg, 'refusal_contract', ''),
          requiredComponents: stringListField(cfg, 'required_components'),
          shapeTemplate: stringField(cfg, 'shape_template', ''),
          reason: stringFieldOrUndef(cfg, 'reason'),
          crossReferences: crossRefs.length > 0 ? crossRefs : undefined,
        });
        break;
      }
      case 'domain_preference':
        ast.domainPreferences.push({
          domain: stringField(cfg, 'domain', ''),
          skills: stringListField(cfg, 'skills'),
          notes: stringFieldOrUndef(cfg, 'notes'),
          ceiling: stringFieldOrUndef(cfg, 'ceiling'),
        });
        break;
      case 'embodied_projection':
        ast.embodiedProjections.push({
          surface: stringField(cfg, 'surface', ''),
          projectionKind: stringField(cfg, 'projection_kind', 'read-only'),
          trigger: stringField(cfg, 'trigger', ''),
          notes: stringFieldOrUndef(cfg, 'notes'),
        });
        break;
      default:
        // Unknown trait - record as warning, don't block (vocabulary
        // may grow; unknown traits in source today might be valid in v2).
        ast.warnings.push({
          severity: 'warning',
          rule: 'unknown-trait',
          message: `Trait "${trait.name}" is not in vocabulary v1. Ignored. Add to vocabulary if load-bearing.`,
        });
        break;
    }
  }

  // --- Phase 2: validate (BLOCK rules throw, WARN rules accumulate) --

  private validate(ast: ContextAST): void {
    // BLOCK: @default recommending banned patterns
    for (const def of ast.defaults) {
      for (const banned of BANNED_DEFAULT_PATTERNS) {
        if (banned.pattern.test(def.do)) {
          throw new ContextCompileError(
            `@default "${def.name}" recommends a banned pattern (matches ${banned.pattern}). ` +
              `Rule: ${banned.rule}.`
          );
        }
      }
    }

    // BLOCK: @hard_dont with vendor-as-substrate framing
    for (const dont of ast.hardDonts) {
      const haystack = `${dont.name} ${dont.reason}`;
      for (const vendorPat of VENDOR_AS_SUBSTRATE_PATTERNS) {
        if (vendorPat.pattern.test(haystack)) {
          throw new ContextCompileError(
            `@hard_dont "${dont.name}" appears to author a vendor-as-substrate pattern. ` +
              `Rule: ${vendorPat.rule}. (A correct hard_dont SAYS "do not adopt vendor as ` +
              `substrate" - this one's framing matches the inverse.)`
          );
        }
      }
    }

    // BLOCK: fake-Diamond declarations
    for (const wisdom of ast.graduatedWisdoms) {
      if (wisdom.tier === 'diamond' && !KNOWN_DIAMOND_IDS.has(wisdom.id)) {
        throw new ContextCompileError(
          `@graduated_wisdom "${wisdom.id}" claims tier="diamond" but is not in the ` +
            `compiler's known-Diamond set. Diamond declaration is founder-only ` +
            `(D:/GOLD/INDEX.md). If this is a new Diamond entry, update ` +
            `KNOWN_DIAMOND_IDS in ContextCompiler.ts in the same commit that ` +
            `lands the GOLD entry.`
        );
      }
    }

    // BLOCK: @skill claiming authority over @hard_physical_gap
    const physicalGapNames = new Set(ast.hardPhysicalGaps.map((g) => g.name));
    for (const skill of ast.skills) {
      for (const claim of skill.authoritativeFor) {
        if (physicalGapNames.has(claim)) {
          throw new ContextCompileError(
            `@skill "${skill.name}" claims authoritative_for="${claim}" but that's a ` +
              `@hard_physical_gap (Trezor/Quest 3/in-person - non-absorbable). ` +
              `Founder skill section "Hard physical gaps the skill never absorbs". ` +
              `Either remove the claim or, if the skill genuinely covers the ` +
              `decision-side (yes/no/when/how-much) without the embodied step, ` +
              `narrow the authoritative_for entry to make the boundary explicit.`
          );
        }
      }
    }

    // WARN: @graduated_wisdom citing an ID that's not in known-Diamond set
    // (and not declared as platinum/gold) - possible vault drift (F.023).
    for (const wisdom of ast.graduatedWisdoms) {
      if (wisdom.tier !== 'diamond' && !/^[WPG]\.GOLD\.\d+$/.test(wisdom.id)) {
        ast.warnings.push({
          severity: 'warning',
          rule: 'F.023 vault-id-format',
          message: `@graduated_wisdom id "${wisdom.id}" doesn't match expected format ` +
            `(W.GOLD.NNN | P.GOLD.NNN | G.GOLD.NNN). Possible typo or stale citation.`,
        });
      }
    }
  }

  // --- Phase 3: emit -- compile_to_claude_md -------------------------

  private emitClaudeMd(ast: ContextAST): string {
    const lines: string[] = [];

    // Header - matches the convention of ~/.claude/CLAUDE.md and
    // ~/.claude/skills/founder/SKILL.md (the highest-leverage migration
    // targets per Phase 2).
    if (ast.identity) {
      lines.push(`# ${ast.identity.name}`);
      lines.push('');
      lines.push(`> **Role**: ${ast.identity.role}`);
      lines.push(`> **Domain**: ${ast.identity.domain}`);
      lines.push(`> **Surface**: ${ast.identity.surface}`);
      if (ast.identity.noMonopoly) {
        lines.push(
          `> **No-monopoly rule**: this context applies the absorb-as-adapter ` +
            `architectural posture (per docs/LLM_CAPABILITIES.md section Architectural posture).`
        );
      }
      lines.push('');
    }

    // Authority order
    if (ast.authorityOrder && ast.authorityOrder.tiers.length > 0) {
      lines.push(`## Authority order (read top-down; the first match wins)`);
      lines.push('');
      ast.authorityOrder.tiers.forEach((tier, idx) => {
        lines.push(`${idx + 1}. **${tier}**`);
      });
      lines.push('');
    }

    // Vision pillars
    if (ast.visionPillars.length > 0) {
      lines.push(`## Vision pillars (follow; do not drift)`);
      lines.push('');
      ast.visionPillars.forEach((pillar, idx) => {
        const cite = pillar.citation ? ` *(${pillar.citation})*` : '';
        lines.push(`${idx + 1}. **${pillar.claim}**${cite}`);
      });
      lines.push('');
    }

    // Refusals
    if (ast.refusals.length > 0) {
      lines.push(`## The Refusals`);
      lines.push('');
      lines.push(
        `These are not guidelines. They are refusals. If you catch yourself about to ` +
          `do any of the following, stop and reframe before continuing.`
      );
      lines.push('');
      for (const refusal of ast.refusals) {
        lines.push(`### Refuse the ${refusal.name}`);
        lines.push('');
        lines.push(`**When**: ${refusal.when}`);
        lines.push('');
        lines.push(`**Do**: ${refusal.do}`);
        lines.push('');
        if (refusal.doNot.length > 0) {
          lines.push(`**Do not**: ${refusal.doNot.map((d) => `\`${d}\``).join(', ')}`);
          lines.push('');
        }
        if (refusal.reason) {
          lines.push(`**Reason**: ${refusal.reason}`);
          lines.push('');
        }
      }
    }

    // Hard don'ts
    if (ast.hardDonts.length > 0) {
      lines.push(`## Hard don'ts (cross-provider red lines)`);
      lines.push('');
      lines.push(`| Name | Reason | Alternative |`);
      lines.push(`|---|---|---|`);
      for (const dont of ast.hardDonts) {
        lines.push(
          `| **${dont.name}** | ${dont.reason} | ${dont.alternative ?? '*(none)*'} |`
        );
      }
      lines.push('');
    }

    // Known defaults
    if (ast.defaults.length > 0) {
      lines.push(`## Known defaults (answer immediately - do not re-litigate)`);
      lines.push('');
      lines.push(`| When | Answer | Reason |`);
      lines.push(`|---|---|---|`);
      for (const def of ast.defaults) {
        lines.push(
          `| ${def.when} | **${def.do}** | ${def.reason ?? '*(no citation)*'} |`
        );
      }
      lines.push('');
    }

    // Domain preferences (vocabulary v2 - Iteration 2 G-3 third slice)
    if (ast.domainPreferences.length > 0) {
      lines.push('## Domain preferences');
      lines.push('');
      lines.push('| Domain | Skills to delegate to | Notes / ceiling |');
      lines.push('|---|---|---|');
      for (const pref of ast.domainPreferences) {
        const skills = pref.skills.length > 0
          ? pref.skills.map((s) => `\`${s}\``).join(', ')
          : '*(in-skill default)*';
        const notesParts: string[] = [];
        if (pref.ceiling) notesParts.push(`Ceiling: ${pref.ceiling}`);
        if (pref.notes) notesParts.push(pref.notes);
        const notes = notesParts.join('; ') || '';
        lines.push(`| **${pref.domain}** | ${skills} | ${notes} |`);
      }
      lines.push('');
    }

    // Output shape
    if (ast.outputShape) {
      lines.push(`## Output shape`);
      lines.push('');
      lines.push(`- **Silent to**: ${ast.outputShape.silentTo}`);
      lines.push(`- **Loud to**: ${ast.outputShape.loudTo}`);
      if (ast.outputShape.noMetaOutput) {
        lines.push(`- **No meta-output**: do not narrate the protocol back to the user`);
      }
      if (ast.outputShape.surfaceHint) {
        lines.push(`- **Surface hint**: ${ast.outputShape.surfaceHint}`);
      }
      lines.push('');
    }

    // Production rule
    if (ast.productionRule) {
      lines.push(`## Production-only rule`);
      lines.push('');
      if (ast.productionRule.noDevNoMockNoLocalhost) {
        lines.push(`No dev. No mock. No localhost. The real service exists - hit it.`);
      }
      if (ast.productionRule.exception) {
        lines.push('');
        lines.push(`**Exception**: ${ast.productionRule.exception}`);
      }
      lines.push('');
    }

    // Hard physical gaps
    if (ast.hardPhysicalGaps.length > 0) {
      lines.push(`## Hard physical gaps (skill never absorbs)`);
      lines.push('');
      for (const gap of ast.hardPhysicalGaps) {
        lines.push(`- **${gap.name}** - ${gap.reason}`);
        if (gap.alternative) {
          lines.push(`  - Alternative: ${gap.alternative}`);
        }
      }
      lines.push('');
    }

    // Skills
    if (ast.skills.length > 0) {
      lines.push(`## Skills`);
      lines.push('');
      for (const skill of ast.skills) {
        lines.push(`### \`${skill.invocableAs}\` - ${skill.name}`);
        lines.push('');
        lines.push(`**Authority**: ${skill.authority}`);
        lines.push('');
        if (skill.authoritativeFor.length > 0) {
          lines.push(`**Authoritative for**: ${skill.authoritativeFor.join(', ')}`);
          lines.push('');
        }
        if (skill.refusals && skill.refusals.length > 0) {
          lines.push(`**Refusals enforced**: ${skill.refusals.join(', ')}`);
          lines.push('');
        }
      }
    }

    // Invocation modes (vocabulary v2 - Iteration 2 G-3)
    if (ast.invocationModes.length > 0) {
      lines.push('## Invocation modes');
      lines.push('');
      for (const mode of ast.invocationModes) {
        lines.push(`### ${mode.mode}`);
        lines.push('');
        lines.push(`- **When**: ${mode.when}`);
        lines.push(`- **Effect**: ${mode.effect}`);
        if (mode.example) {
          lines.push(`- **Example**: \`${mode.example}\``);
        }
        lines.push('');
      }
    }

    appendEmbodiedProjectionSection(lines, ast.embodiedProjections);

    // Routines (A-00X)
    if (ast.routines.length > 0) {
      lines.push(`## Recurring routines (A-00X)`);
      lines.push('');
      lines.push(`| ID | Schedule | Skill | Output |`);
      lines.push(`|---|---|---|---|`);
      for (const routine of ast.routines) {
        lines.push(
          `| ${routine.id} | \`${routine.schedule}\` | ${routine.skill} | ${routine.outputDir ?? '*(varies)*'} |`
        );
      }
      lines.push('');
    }

    // Escalations
    if (ast.escalations.length > 0) {
      lines.push(`## Escalation`);
      lines.push('');
      for (const esc of ast.escalations) {
        lines.push(`- **Trigger**: ${esc.trigger}`);
        lines.push(`  - **Action**: ${esc.doAction}`);
        lines.push(`  - **Recipient**: ${esc.recipient}`);
        if (esc.refuseToEscalateWhen.length > 0) {
          lines.push(
            `  - **Refuse to escalate when**: ${esc.refuseToEscalateWhen.join(', ')}`
          );
        }
      }
      lines.push('');
    }

    // Date discipline (W.317) (vocabulary v2 - Iteration 2 G-3 next slice)
    if (ast.dateDisciplines.length > 0) {
      lines.push('## Date discipline');
      lines.push('');
      for (const d of ast.dateDisciplines) {
        const wisdomLabel = d.wisdomId ? ` (${d.wisdomId})` : '';
        lines.push(`### Refusal contract${wisdomLabel}`);
        lines.push('');
        lines.push(`**${d.refusalContract}**`);
        lines.push('');
        if (d.requiredComponents.length > 0) {
          lines.push('**Required components** (all must be present):');
          for (const comp of d.requiredComponents) {
            lines.push(`- ${comp}`);
          }
          lines.push('');
        }
        if (d.shapeTemplate) {
          lines.push('**Output shape**:');
          lines.push('');
          lines.push('```');
          lines.push(d.shapeTemplate);
          lines.push('```');
          lines.push('');
        }
        if (d.reason) {
          lines.push(`**Reason**: ${d.reason}`);
          lines.push('');
        }
        if (d.crossReferences && d.crossReferences.length > 0) {
          lines.push(`**Cross-references**: ${d.crossReferences.join(', ')}`);
          lines.push('');
        }
      }
    }

    // Citation rules
    if (ast.citationRules.length > 0) {
      lines.push(`## Citation discipline`);
      lines.push('');
      for (const rule of ast.citationRules) {
        lines.push(
          `- Fluent prose over **${rule.fluentProseThresholdChars} chars** must include ` +
            `one of: ${rule.required.join(', ')}`
        );
        if (rule.exemption) {
          lines.push(`  - Exemption: ${rule.exemption}`);
        }
        if (rule.reason) {
          lines.push(`  - Reason: ${rule.reason}`);
        }
      }
      lines.push('');
    }

    // Cross-references - graduated wisdom + feedback
    if (ast.graduatedWisdoms.length > 0 || ast.feedbacks.length > 0) {
      lines.push(`## Authority cross-references`);
      lines.push('');
      if (ast.graduatedWisdoms.length > 0) {
        lines.push(`### GOLD-tier wisdom`);
        lines.push('');
        for (const wisdom of ast.graduatedWisdoms) {
          lines.push(`- **${wisdom.id}** *(${wisdom.tier})* - ${wisdom.claim}`);
        }
        lines.push('');
      }
      if (ast.feedbacks.length > 0) {
        lines.push(`### Feedback memory`);
        lines.push('');
        for (const fb of ast.feedbacks) {
          const src = fb.source ? ` (${fb.source})` : '';
          lines.push(`- **${fb.id}**${src} - ${fb.claim}`);
        }
        lines.push('');
      }
    }

    // Generated-by trailer
    lines.push('---');
    lines.push('');
    lines.push(
      `*Generated by HoloScript ContextCompiler (compile_to_claude_md). ` +
        `Source: HoloScript composition. Vocabulary: v1 (ratified 2026-05-06).*`
    );
    lines.push('');

    return lines.join('\n');
  }

  // --- Phase 3: emit -- compile_to_agents_md -------------------------

  /**
   * Emit AGENTS.md - cross-tool agent context format. Read by Codex,
   * Copilot, Cursor, Continue, Windsurf, Amp, Devin (any tool that
   * follows the AGENTS.md convention seeded by the Codex docs).
   *
   * Differences from claude_md (per Phase 1 follow-up task spec):
   *   - "## Project principles" instead of "## Vision pillars"
   *   - "## Hard rules" instead of "## The Refusals" (Codex audience
   *     uses non-ritual rule-list framing; refusals + hard donts are
   *     merged into one flat ranked list under this single section)
   *   - "## Conventions" instead of "## Known defaults"
   *   - "## Workflows" instead of "## Skills" (Codex's closer term)
   *
   * Shared sections (authority order, output shape, production rule,
   * hard physical gaps, recurring routines, escalation, citation
   * discipline, authority cross-references) keep the same name across
   * surfaces - those names are universal-context terms, not
   * Claude-specific framings.
   */
  private emitAgentsMd(ast: ContextAST): string {
    const lines: string[] = [];

    // Header - matches the convention of HoloScript/AGENTS.md and
    // ai-ecosystem/AGENTS.md (cross-tool blockquote underneath title).
    lines.push('# AGENTS.md');
    lines.push('');

    if (ast.identity) {
      lines.push(`> **Role**: ${ast.identity.role}`);
      lines.push(`> **Domain**: ${ast.identity.domain}`);
      lines.push(
        `> **Surface**: ${ast.identity.surface} ` +
          `(cross-tool: read by Codex, Copilot, Cursor, Continue, Windsurf, Amp, Devin)`
      );
      if (ast.identity.noMonopoly) {
        lines.push(
          `> **No-monopoly rule**: this context applies the absorb-as-adapter ` +
            `architectural posture (per docs/LLM_CAPABILITIES.md section Architectural posture).`
        );
      }
      lines.push('');
    }

    // Authority order (universal section name)
    if (ast.authorityOrder && ast.authorityOrder.tiers.length > 0) {
      lines.push('## Authority order (read top-down; first match wins)');
      lines.push('');
      ast.authorityOrder.tiers.forEach((tier, idx) => {
        lines.push(`${idx + 1}. **${tier}**`);
      });
      lines.push('');
    }

    // Project principles (renamed from "Vision pillars" for Codex audience)
    if (ast.visionPillars.length > 0) {
      lines.push('## Project principles');
      lines.push('');
      ast.visionPillars.forEach((pillar, idx) => {
        const cite = pillar.citation ? ` *(${pillar.citation})*` : '';
        lines.push(`${idx + 1}. **${pillar.claim}**${cite}`);
      });
      lines.push('');
    }

    // Hard rules - merges @refusal + @hard_dont into one flat section
    // per Codex docs convention (no separate "Refusals" subsection).
    if (ast.refusals.length > 0 || ast.hardDonts.length > 0) {
      lines.push('## Hard rules');
      lines.push('');
      lines.push(
        'Rules below are non-negotiable. Each names what to do, what NOT to do, and why.'
      );
      lines.push('');

      for (const refusal of ast.refusals) {
        lines.push(`### ${refusal.name}`);
        lines.push('');
        lines.push(`- **When**: ${refusal.when}`);
        lines.push(`- **Do**: ${refusal.do}`);
        if (refusal.doNot.length > 0) {
          lines.push(`- **Do not**: ${refusal.doNot.map((d) => `\`${d}\``).join(', ')}`);
        }
        if (refusal.reason) {
          lines.push(`- **Reason**: ${refusal.reason}`);
        }
        lines.push('');
      }

      for (const dont of ast.hardDonts) {
        lines.push(`### ${dont.name}`);
        lines.push('');
        lines.push(`- **Reason**: ${dont.reason}`);
        if (dont.alternative) {
          lines.push(`- **Alternative**: ${dont.alternative}`);
        }
        if (dont.appliesTo.length > 0) {
          lines.push(`- **Applies to**: ${dont.appliesTo.join(', ')}`);
        }
        lines.push('');
      }
    }

    // Conventions (renamed from "Known defaults" - matches existing
    // AGENTS.md convention pattern in HoloScript/AGENTS.md and
    // ai-ecosystem/AGENTS.md).
    if (ast.defaults.length > 0) {
      lines.push('## Conventions');
      lines.push('');
      lines.push('| When | Do | Reason |');
      lines.push('|---|---|---|');
      for (const def of ast.defaults) {
        lines.push(
          `| ${def.when} | **${def.do}** | ${def.reason ?? '*(no citation)*'} |`
        );
      }
      lines.push('');
    }

    // Domain preferences (vocabulary v2 - Iteration 2 G-3 third slice)
    if (ast.domainPreferences.length > 0) {
      lines.push('## Domain preferences');
      lines.push('');
      lines.push('| Domain | Skills to delegate to | Notes / ceiling |');
      lines.push('|---|---|---|');
      for (const pref of ast.domainPreferences) {
        const skills = pref.skills.length > 0
          ? pref.skills.map((s) => `\`${s}\``).join(', ')
          : '*(in-skill default)*';
        const notesParts: string[] = [];
        if (pref.ceiling) notesParts.push(`Ceiling: ${pref.ceiling}`);
        if (pref.notes) notesParts.push(pref.notes);
        const notes = notesParts.join('; ') || '';
        lines.push(`| **${pref.domain}** | ${skills} | ${notes} |`);
      }
      lines.push('');
    }

    // Output shape (universal)
    if (ast.outputShape) {
      lines.push('## Output shape');
      lines.push('');
      lines.push(`- **Silent to**: ${ast.outputShape.silentTo}`);
      lines.push(`- **Loud to**: ${ast.outputShape.loudTo}`);
      if (ast.outputShape.noMetaOutput) {
        lines.push('- **No meta-output**: do not narrate the protocol back to the user');
      }
      if (ast.outputShape.surfaceHint) {
        lines.push(`- **Surface hint**: ${ast.outputShape.surfaceHint}`);
      }
      lines.push('');
    }

    // Production rule (universal)
    if (ast.productionRule) {
      lines.push('## Production-only rule');
      lines.push('');
      if (ast.productionRule.noDevNoMockNoLocalhost) {
        lines.push('No dev. No mock. No localhost. The real service exists - hit it.');
      }
      if (ast.productionRule.exception) {
        lines.push('');
        lines.push(`**Exception**: ${ast.productionRule.exception}`);
      }
      lines.push('');
    }

    // Hard physical gaps - explicit in AGENTS.md so non-Claude agents
    // (Codex, Copilot) also see what they cannot absorb.
    if (ast.hardPhysicalGaps.length > 0) {
      lines.push('## Hard physical gaps (never absorb)');
      lines.push('');
      for (const gap of ast.hardPhysicalGaps) {
        lines.push(`- **${gap.name}** - ${gap.reason}`);
        if (gap.alternative) {
          lines.push(`  - Alternative: ${gap.alternative}`);
        }
      }
      lines.push('');
    }

    // Workflows (renamed from "Skills" - Codex's closer term; skill
    // invocations become workflow entries with same authority + scope).
    if (ast.skills.length > 0) {
      lines.push('## Workflows');
      lines.push('');
      for (const skill of ast.skills) {
        lines.push(`### ${skill.name} (\`${skill.invocableAs}\`)`);
        lines.push('');
        lines.push(`- **Authority**: ${skill.authority}`);
        if (skill.authoritativeFor.length > 0) {
          lines.push(`- **Authoritative for**: ${skill.authoritativeFor.join(', ')}`);
        }
        if (skill.refusals && skill.refusals.length > 0) {
          lines.push(`- **Enforces rules**: ${skill.refusals.join(', ')}`);
        }
        lines.push('');
      }
    }

    // Invocation modes (vocabulary v2 - Iteration 2 G-3)
    if (ast.invocationModes.length > 0) {
      lines.push('## Invocation modes');
      lines.push('');
      for (const mode of ast.invocationModes) {
        lines.push(`### ${mode.mode}`);
        lines.push('');
        lines.push(`- **When**: ${mode.when}`);
        lines.push(`- **Effect**: ${mode.effect}`);
        if (mode.example) {
          lines.push(`- **Example**: \`${mode.example}\``);
        }
        lines.push('');
      }
    }

    appendEmbodiedProjectionSection(lines, ast.embodiedProjections);

    // Recurring routines (universal - A-00X pattern is cross-tool)
    if (ast.routines.length > 0) {
      lines.push('## Recurring routines (A-00X)');
      lines.push('');
      lines.push('| ID | Schedule | Skill | Output |');
      lines.push('|---|---|---|---|');
      for (const routine of ast.routines) {
        lines.push(
          `| ${routine.id} | \`${routine.schedule}\` | ${routine.skill} | ${routine.outputDir ?? '*(varies)*'} |`
        );
      }
      lines.push('');
    }

    // Escalation (universal)
    if (ast.escalations.length > 0) {
      lines.push('## Escalation');
      lines.push('');
      for (const esc of ast.escalations) {
        lines.push(`- **Trigger**: ${esc.trigger}`);
        lines.push(`  - **Action**: ${esc.doAction}`);
        lines.push(`  - **Recipient**: ${esc.recipient}`);
        if (esc.refuseToEscalateWhen.length > 0) {
          lines.push(
            `  - **Refuse to escalate when**: ${esc.refuseToEscalateWhen.join(', ')}`
          );
        }
      }
      lines.push('');
    }

    // Date discipline (W.317) (vocabulary v2 - Iteration 2 G-3 next slice)
    if (ast.dateDisciplines.length > 0) {
      lines.push('## Date discipline');
      lines.push('');
      for (const d of ast.dateDisciplines) {
        const wisdomLabel = d.wisdomId ? ` (${d.wisdomId})` : '';
        lines.push(`### Refusal contract${wisdomLabel}`);
        lines.push('');
        lines.push(`**${d.refusalContract}**`);
        lines.push('');
        if (d.requiredComponents.length > 0) {
          lines.push('**Required components** (all must be present):');
          for (const comp of d.requiredComponents) {
            lines.push(`- ${comp}`);
          }
          lines.push('');
        }
        if (d.shapeTemplate) {
          lines.push('**Output shape**:');
          lines.push('');
          lines.push('```');
          lines.push(d.shapeTemplate);
          lines.push('```');
          lines.push('');
        }
        if (d.reason) {
          lines.push(`**Reason**: ${d.reason}`);
          lines.push('');
        }
        if (d.crossReferences && d.crossReferences.length > 0) {
          lines.push(`**Cross-references**: ${d.crossReferences.join(', ')}`);
          lines.push('');
        }
      }
    }

    // Citation discipline (universal)
    if (ast.citationRules.length > 0) {
      lines.push('## Citation discipline');
      lines.push('');
      for (const rule of ast.citationRules) {
        lines.push(
          `- Fluent prose over **${rule.fluentProseThresholdChars} chars** must include ` +
            `one of: ${rule.required.join(', ')}`
        );
        if (rule.exemption) {
          lines.push(`  - Exemption: ${rule.exemption}`);
        }
        if (rule.reason) {
          lines.push(`  - Reason: ${rule.reason}`);
        }
      }
      lines.push('');
    }

    // Authority cross-references (universal)
    if (ast.graduatedWisdoms.length > 0 || ast.feedbacks.length > 0) {
      lines.push('## Authority cross-references');
      lines.push('');
      if (ast.graduatedWisdoms.length > 0) {
        lines.push('### GOLD-tier wisdom');
        lines.push('');
        for (const wisdom of ast.graduatedWisdoms) {
          lines.push(`- **${wisdom.id}** *(${wisdom.tier})* - ${wisdom.claim}`);
        }
        lines.push('');
      }
      if (ast.feedbacks.length > 0) {
        lines.push('### Feedback memory');
        lines.push('');
        for (const fb of ast.feedbacks) {
          const src = fb.source ? ` (${fb.source})` : '';
          lines.push(`- **${fb.id}**${src} - ${fb.claim}`);
        }
        lines.push('');
      }
    }

    // Generated-by trailer
    lines.push('---');
    lines.push('');
    lines.push(
      `*Generated by HoloScript ContextCompiler (compile_to_agents_md). ` +
        `Source: HoloScript composition. Vocabulary: v1 (ratified 2026-05-06). ` +
        `Cross-tool: Codex, Copilot, Cursor, Continue, Windsurf, Amp, Devin.*`
    );
    lines.push('');

    return lines.join('\n');
  }

  // --- Phase 3: emit -- compile_to_cursor_rules ----------------------

  /**
   * Emit Cursor `.cursor/rules/*.mdc` files. Different output shape from
   * claude_md / agents_md - one file per rule rather than a single big
   * file (Cursor's idiom). Per spec:
   * research/2026-05-06_cursor-mdc-spec.md.
   *
   * Layout:
   *   .cursor/rules/refusal-<name>.mdc       (one per @refusal)
   *   .cursor/rules/hard-dont-<name>.mdc     (one per @hard_dont)
   *   .cursor/rules/default-<name>.mdc       (one per @default)
   *   .cursor/rules/_ecosystem-context.mdc   (top-level blocks: identity,
   *                                           authority order, vision
   *                                           pillars, production rule,
   *                                           output shape, gaps, routines,
   *                                           skill registry, cross-refs)
   *
   * Frontmatter v1: every file emits with `alwaysApply: true` and empty
   * `globs:`. Glob mapping from `applies_to` -> file patterns is deferred
   * to v2 (see spec memo § "What the emitter does NOT do (v1 scope)").
   *
   * Returns Record<string, string> with full repo-relative paths as keys
   * (e.g. ".cursor/rules/refusal-bandaid.mdc"). The consumer writes each
   * entry to disk at exactly that path.
   */
  private emitCursorRules(ast: ContextAST): Record<string, string> {
    const out: Record<string, string> = {};

    // --- Per-rule files: refusals ---
    for (const refusal of ast.refusals) {
      const slug = toCursorSlug(refusal.name);
      const filename = `.cursor/rules/refusal-${slug}.mdc`;
      const description = oneLine(
        `Refusal: ${refusal.name} - ${refusal.reason ?? refusal.when}`
      );
      const body: string[] = [];
      body.push(`# Refusal: ${refusal.name}`);
      body.push('');
      body.push(`**When**: ${refusal.when}`);
      body.push('');
      body.push(`**Do**: ${refusal.do}`);
      body.push('');
      if (refusal.doNot.length > 0) {
        body.push(`**Do not**: ${refusal.doNot.map((d) => `\`${d}\``).join(', ')}`);
        body.push('');
      }
      if (refusal.reason) {
        body.push(`**Reason**: ${refusal.reason}`);
        body.push('');
      }
      out[filename] = wrapMdc(description, body);
    }

    // --- Per-rule files: hard_donts ---
    for (const dont of ast.hardDonts) {
      const slug = toCursorSlug(dont.name);
      const filename = `.cursor/rules/hard-dont-${slug}.mdc`;
      const description = oneLine(`Hard don't: ${dont.name} - ${dont.reason}`);
      const body: string[] = [];
      body.push(`# Hard don't: ${dont.name}`);
      body.push('');
      body.push(`**Reason**: ${dont.reason}`);
      body.push('');
      if (dont.alternative) {
        body.push(`**Alternative**: ${dont.alternative}`);
        body.push('');
      }
      if (dont.appliesTo.length > 0) {
        body.push(`**Applies to**: ${dont.appliesTo.join(', ')}`);
        body.push('');
      }
      out[filename] = wrapMdc(description, body);
    }

    // --- Per-rule files: defaults ---
    for (const def of ast.defaults) {
      const slug = toCursorSlug(def.name);
      const filename = `.cursor/rules/default-${slug}.mdc`;
      const description = oneLine(`Default: ${def.name} - ${def.when}`);
      const body: string[] = [];
      body.push(`# Default: ${def.name}`);
      body.push('');
      body.push(`**When**: ${def.when}`);
      body.push('');
      body.push(`**Do**: ${def.do}`);
      body.push('');
      if (def.reason) {
        body.push(`**Reason**: ${def.reason}`);
        body.push('');
      }
      out[filename] = wrapMdc(description, body);
    }

    // --- Index file: top-level blocks + cross-refs + trailer ---
    // Always emitted (carries the trailer + identity even when no per-rule
    // traits were declared - matches claude_md/agents_md behavior of
    // always producing at least one file).
    const indexFilename = '.cursor/rules/_ecosystem-context.mdc';
    const indexDescription = ast.identity
      ? oneLine(`Ecosystem context for ${ast.identity.name} (${ast.identity.role})`)
      : 'Ecosystem context (HoloScript-generated)';
    const idx: string[] = [];

    // Identity block
    if (ast.identity) {
      idx.push(`# ${ast.identity.name}`);
      idx.push('');
      idx.push(`**Role**: ${ast.identity.role}`);
      idx.push(`**Domain**: ${ast.identity.domain}`);
      idx.push(`**Surface**: ${ast.identity.surface}`);
      if (ast.identity.noMonopoly) {
        idx.push('');
        idx.push(
          'No-monopoly rule: this context applies the absorb-as-adapter ' +
            'architectural posture (per docs/LLM_CAPABILITIES.md).'
        );
      }
      idx.push('');
    } else {
      idx.push('# Ecosystem context');
      idx.push('');
    }

    // Authority order
    if (ast.authorityOrder && ast.authorityOrder.tiers.length > 0) {
      idx.push('## Authority order (read top-down; first match wins)');
      idx.push('');
      ast.authorityOrder.tiers.forEach((tier, i) => {
        idx.push(`${i + 1}. **${tier}**`);
      });
      idx.push('');
    }

    // Vision pillars
    if (ast.visionPillars.length > 0) {
      idx.push('## Vision pillars');
      idx.push('');
      ast.visionPillars.forEach((pillar, i) => {
        const cite = pillar.citation ? ` *(${pillar.citation})*` : '';
        idx.push(`${i + 1}. **${pillar.claim}**${cite}`);
      });
      idx.push('');
    }

    // Domain preferences (vocabulary v2 - Iteration 2 G-3 third slice)
    if (ast.domainPreferences.length > 0) {
      idx.push('## Domain preferences');
      idx.push('');
      idx.push('| Domain | Skills to delegate to | Notes / ceiling |');
      idx.push('|---|---|---|');
      for (const pref of ast.domainPreferences) {
        const skills = pref.skills.length > 0
          ? pref.skills.map((s) => `\`${s}\``).join(', ')
          : '*(in-skill default)*';
        const notesParts: string[] = [];
        if (pref.ceiling) notesParts.push(`Ceiling: ${pref.ceiling}`);
        if (pref.notes) notesParts.push(pref.notes);
        const notes = notesParts.join('; ') || '';
        idx.push(`| **${pref.domain}** | ${skills} | ${notes} |`);
      }
      idx.push('');
    }

    // Output shape
    if (ast.outputShape) {
      idx.push('## Output shape');
      idx.push('');
      idx.push(`- **Silent to**: ${ast.outputShape.silentTo}`);
      idx.push(`- **Loud to**: ${ast.outputShape.loudTo}`);
      if (ast.outputShape.noMetaOutput) {
        idx.push('- **No meta-output**: do not narrate the protocol back to the user');
      }
      if (ast.outputShape.surfaceHint) {
        idx.push(`- **Surface hint**: ${ast.outputShape.surfaceHint}`);
      }
      idx.push('');
    }

    // Production rule
    if (ast.productionRule) {
      idx.push('## Production-only rule');
      idx.push('');
      if (ast.productionRule.noDevNoMockNoLocalhost) {
        idx.push('No dev. No mock. No localhost. The real service exists - hit it.');
      }
      if (ast.productionRule.exception) {
        idx.push('');
        idx.push(`**Exception**: ${ast.productionRule.exception}`);
      }
      idx.push('');
    }

    // Hard physical gaps - non-absorbable boundaries (deferred to v2 for
    // per-file split; index-only is enough for v1 since they're posture,
    // not actionable rules).
    if (ast.hardPhysicalGaps.length > 0) {
      idx.push('## Hard physical gaps (skill never absorbs)');
      idx.push('');
      for (const gap of ast.hardPhysicalGaps) {
        idx.push(`- **${gap.name}** - ${gap.reason}`);
        if (gap.alternative) {
          idx.push(`  - Alternative: ${gap.alternative}`);
        }
      }
      idx.push('');
    }

    // Skill registry (one-line summaries; per-skill files belong to
    // compile_to_skill_md emitter, not this one).
    if (ast.skills.length > 0) {
      idx.push('## Skill registry');
      idx.push('');
      for (const skill of ast.skills) {
        idx.push(`- **${skill.invocableAs}** (${skill.name}) - ${skill.authority}`);
      }
      idx.push('');
    }

    // Invocation modes (vocabulary v2 - Iteration 2 G-3)
    if (ast.invocationModes.length > 0) {
      idx.push('## Invocation modes');
      idx.push('');
      for (const mode of ast.invocationModes) {
        idx.push(`### ${mode.mode}`);
        idx.push('');
        idx.push(`- **When**: ${mode.when}`);
        idx.push(`- **Effect**: ${mode.effect}`);
        if (mode.example) {
          idx.push(`- **Example**: \`${mode.example}\``);
        }
        idx.push('');
      }
    }

    appendEmbodiedProjectionSection(idx, ast.embodiedProjections);

    // Recurring routines (A-00X)
    if (ast.routines.length > 0) {
      idx.push('## Recurring routines (A-00X)');
      idx.push('');
      idx.push('| ID | Schedule | Skill | Output |');
      idx.push('|---|---|---|---|');
      for (const routine of ast.routines) {
        idx.push(
          `| ${routine.id} | \`${routine.schedule}\` | ${routine.skill} | ${routine.outputDir ?? '*(varies)*'} |`
        );
      }
      idx.push('');
    }

    // Escalation
    if (ast.escalations.length > 0) {
      idx.push('## Escalation');
      idx.push('');
      for (const esc of ast.escalations) {
        idx.push(`- **Trigger**: ${esc.trigger}`);
        idx.push(`  - **Action**: ${esc.doAction}`);
        idx.push(`  - **Recipient**: ${esc.recipient}`);
        if (esc.refuseToEscalateWhen.length > 0) {
          idx.push(
            `  - **Refuse to escalate when**: ${esc.refuseToEscalateWhen.join(', ')}`
          );
        }
      }
      idx.push('');
    }

    // Date discipline (W.317) (vocabulary v2 - Iteration 2 G-3 next slice)
    if (ast.dateDisciplines.length > 0) {
      idx.push('## Date discipline');
      idx.push('');
      for (const d of ast.dateDisciplines) {
        const wisdomLabel = d.wisdomId ? ` (${d.wisdomId})` : '';
        idx.push(`### Refusal contract${wisdomLabel}`);
        idx.push('');
        idx.push(`**${d.refusalContract}**`);
        idx.push('');
        if (d.requiredComponents.length > 0) {
          idx.push('**Required components** (all must be present):');
          for (const comp of d.requiredComponents) {
            idx.push(`- ${comp}`);
          }
          idx.push('');
        }
        if (d.shapeTemplate) {
          idx.push('**Output shape**:');
          idx.push('');
          idx.push('```');
          idx.push(d.shapeTemplate);
          idx.push('```');
          idx.push('');
        }
        if (d.reason) {
          idx.push(`**Reason**: ${d.reason}`);
          idx.push('');
        }
        if (d.crossReferences && d.crossReferences.length > 0) {
          idx.push(`**Cross-references**: ${d.crossReferences.join(', ')}`);
          idx.push('');
        }
      }
    }

    // Citation discipline
    if (ast.citationRules.length > 0) {
      idx.push('## Citation discipline');
      idx.push('');
      for (const rule of ast.citationRules) {
        idx.push(
          `- Fluent prose over **${rule.fluentProseThresholdChars} chars** must include ` +
            `one of: ${rule.required.join(', ')}`
        );
        if (rule.exemption) {
          idx.push(`  - Exemption: ${rule.exemption}`);
        }
        if (rule.reason) {
          idx.push(`  - Reason: ${rule.reason}`);
        }
      }
      idx.push('');
    }

    // Authority cross-references (graduated wisdom + feedback)
    if (ast.graduatedWisdoms.length > 0 || ast.feedbacks.length > 0) {
      idx.push('## Authority cross-references');
      idx.push('');
      if (ast.graduatedWisdoms.length > 0) {
        idx.push('### GOLD-tier wisdom');
        idx.push('');
        for (const wisdom of ast.graduatedWisdoms) {
          idx.push(`- **${wisdom.id}** *(${wisdom.tier})* - ${wisdom.claim}`);
        }
        idx.push('');
      }
      if (ast.feedbacks.length > 0) {
        idx.push('### Feedback memory');
        idx.push('');
        for (const fb of ast.feedbacks) {
          const src = fb.source ? ` (${fb.source})` : '';
          idx.push(`- **${fb.id}**${src} - ${fb.claim}`);
        }
        idx.push('');
      }
    }

    // Generated-by trailer (only on the index file - per-rule files
    // stay terse so Cursor displays the rule body inline cleanly).
    idx.push('---');
    idx.push('');
    idx.push(
      '*Generated by HoloScript ContextCompiler (compile_to_cursor_rules). ' +
        'Source: HoloScript composition. Vocabulary: v1 (ratified 2026-05-06). ' +
        'Per-rule files emit alongside this index under .cursor/rules/.*'
    );
    idx.push('');

    out[indexFilename] = wrapMdc(indexDescription, idx);

    return out;
  }

  // --- Phase 3: emit -- compile_to_skill_md --------------------------

  /**
   * Emit SKILL.md - Claude Code skill format. Read by Claude Code's
   * skill discovery system at `~/.claude/skills/<name>/SKILL.md` and
   * `<repo>/.claude/skills/<name>/SKILL.md` (per-window per-repo
   * skills are loaded into the available-skills block at session start).
   *
   * Format differs from claude_md / agents_md / cursor_rules: Claude
   * Code parses a YAML frontmatter block at the top of the file
   * (`name:`, `description:`, `allowed-tools:`) for skill registration,
   * THEN reads the markdown body as the skill prompt. The frontmatter
   * is what makes a SKILL.md invocable as `/<name>`.
   *
   * Phase 2(a) target: this emitter is the dependency for self-hosting
   * the founder skill - `compositions/founder.hs` becomes source-of-
   * truth, `~/.claude/skills/founder/SKILL.md` becomes the emitted
   * artifact. Round-trip parity is the validation gate.
   *
   * Source fields:
   *   - frontmatter `name:` <- ContextIdentity.name
   *   - frontmatter `description:` <- ContextIdentity.description (required
   *     for skill discovery; emitter throws if missing - Claude Code
   *     refuses to register a skill without one)
   *   - frontmatter `allowed-tools:` <- ContextIdentity.allowedTools
   *     (defaults to a sensible cross-tool set if omitted)
   *
   * Body sections mirror agents_md / claude_md - same vocabulary, same
   * authority order, same refusals, etc. - so the agent's operational
   * behavior is consistent across surfaces.
   */
  private emitSkillMd(ast: ContextAST): string {
    if (!ast.identity) {
      throw new ContextCompileError(
        `compile_to_skill_md requires an @identity trait. Claude Code's ` +
          `skill discovery reads the YAML frontmatter \`name:\` field, which ` +
          `comes from ContextIdentity.name. Add an @identity block to the ` +
          `composition.`
      );
    }
    if (!ast.identity.description) {
      throw new ContextCompileError(
        `compile_to_skill_md requires @identity.description. Claude Code ` +
          `refuses to register a skill without a description (skill discovery ` +
          `gate). Add a 'description' field to the @identity trait.`
      );
    }

    const lines: string[] = [];

    // --- YAML frontmatter ---
    lines.push('---');
    lines.push(`name: ${yamlScalar(ast.identity.name)}`);
    lines.push(formatYamlDescription(ast.identity.description));
    const tools =
      ast.identity.allowedTools && ast.identity.allowedTools.length > 0
        ? ast.identity.allowedTools
        : ['Bash', 'Read', 'Write', 'Edit', 'Grep', 'Glob', 'WebFetch'];
    lines.push(`allowed-tools: ${tools.join(', ')}`);
    lines.push('---');
    lines.push('');

    // --- Body header ---
    lines.push(`# ${ast.identity.name}`);
    lines.push('');
    lines.push(`> **Role**: ${ast.identity.role}`);
    lines.push(`> **Domain**: ${ast.identity.domain}`);
    lines.push(`> **Surface**: ${ast.identity.surface}`);
    if (ast.identity.noMonopoly) {
      lines.push(
        `> **No-monopoly rule**: this skill applies the absorb-as-adapter ` +
          `architectural posture (per docs/LLM_CAPABILITIES.md section ` +
          `Architectural posture).`
      );
    }
    lines.push('');

    // Authority order (universal section)
    if (ast.authorityOrder && ast.authorityOrder.tiers.length > 0) {
      lines.push('## Authority order (read top-down; first match wins)');
      lines.push('');
      ast.authorityOrder.tiers.forEach((tier, idx) => {
        lines.push(`${idx + 1}. **${tier}**`);
      });
      lines.push('');
    }

    // Vision pillars
    if (ast.visionPillars.length > 0) {
      lines.push('## Vision pillars (follow; do not drift)');
      lines.push('');
      ast.visionPillars.forEach((pillar, idx) => {
        const cite = pillar.citation ? ` *(${pillar.citation})*` : '';
        lines.push(`${idx + 1}. **${pillar.claim}**${cite}`);
      });
      lines.push('');
    }

    // The Refusals (Claude-Code-skill convention uses ritual-refusal framing
    // since SKILL.md is the highest-stakes surface for the four refusals)
    if (ast.refusals.length > 0) {
      lines.push('## The Refusals');
      lines.push('');
      lines.push(
        'These are not guidelines. They are refusals. If you catch yourself ' +
          'about to do any of the following, stop and reframe before continuing.'
      );
      lines.push('');
      for (const refusal of ast.refusals) {
        lines.push(`### Refuse the ${refusal.name}`);
        lines.push('');
        lines.push(`**When**: ${refusal.when}`);
        lines.push('');
        lines.push(`**Do**: ${refusal.do}`);
        lines.push('');
        if (refusal.doNot.length > 0) {
          lines.push(`**Do not**: ${refusal.doNot.map((d) => `\`${d}\``).join(', ')}`);
          lines.push('');
        }
        if (refusal.reason) {
          lines.push(`**Reason**: ${refusal.reason}`);
          lines.push('');
        }
      }
    }

    // Hard don'ts
    if (ast.hardDonts.length > 0) {
      lines.push("## Hard don'ts (cross-provider red lines)");
      lines.push('');
      lines.push(`| Name | Reason | Alternative |`);
      lines.push(`|---|---|---|`);
      for (const dont of ast.hardDonts) {
        lines.push(
          `| **${dont.name}** | ${dont.reason} | ${dont.alternative ?? '*(none)*'} |`
        );
      }
      lines.push('');
    }

    // Known defaults
    if (ast.defaults.length > 0) {
      lines.push('## Known defaults (answer immediately - do not re-litigate)');
      lines.push('');
      lines.push(`| When | Answer | Reason |`);
      lines.push(`|---|---|---|`);
      for (const def of ast.defaults) {
        lines.push(
          `| ${def.when} | **${def.do}** | ${def.reason ?? '*(no citation)*'} |`
        );
      }
      lines.push('');
    }

    // Domain preferences (vocabulary v2 - Iteration 2 G-3 third slice)
    if (ast.domainPreferences.length > 0) {
      lines.push('## Domain preferences');
      lines.push('');
      lines.push('| Domain | Skills to delegate to | Notes / ceiling |');
      lines.push('|---|---|---|');
      for (const pref of ast.domainPreferences) {
        const skills = pref.skills.length > 0
          ? pref.skills.map((s) => `\`${s}\``).join(', ')
          : '*(in-skill default)*';
        const notesParts: string[] = [];
        if (pref.ceiling) notesParts.push(`Ceiling: ${pref.ceiling}`);
        if (pref.notes) notesParts.push(pref.notes);
        const notes = notesParts.join('; ') || '';
        lines.push(`| **${pref.domain}** | ${skills} | ${notes} |`);
      }
      lines.push('');
    }

    // Output shape
    if (ast.outputShape) {
      lines.push('## Output shape');
      lines.push('');
      lines.push(`- **Silent to**: ${ast.outputShape.silentTo}`);
      lines.push(`- **Loud to**: ${ast.outputShape.loudTo}`);
      if (ast.outputShape.noMetaOutput) {
        lines.push('- **No meta-output**: do not narrate the protocol back to the user');
      }
      if (ast.outputShape.surfaceHint) {
        lines.push(`- **Surface hint**: ${ast.outputShape.surfaceHint}`);
      }
      lines.push('');
    }

    // Production rule
    if (ast.productionRule) {
      lines.push('## Production-only rule');
      lines.push('');
      if (ast.productionRule.noDevNoMockNoLocalhost) {
        lines.push('No dev. No mock. No localhost. The real service exists - hit it.');
      }
      if (ast.productionRule.exception) {
        lines.push('');
        lines.push(`**Exception**: ${ast.productionRule.exception}`);
      }
      lines.push('');
    }

    // Hard physical gaps - critical for SKILL.md so the skill knows
    // what it never absorbs (Trezor, Quest 3, in-person)
    if (ast.hardPhysicalGaps.length > 0) {
      lines.push('## Hard physical gaps (skill never absorbs)');
      lines.push('');
      for (const gap of ast.hardPhysicalGaps) {
        lines.push(`- **${gap.name}** - ${gap.reason}`);
        if (gap.alternative) {
          lines.push(`  - Alternative: ${gap.alternative}`);
        }
      }
      lines.push('');
    }

    // Cross-referenced skills
    if (ast.skills.length > 0) {
      lines.push('## Skills this skill cross-references');
      lines.push('');
      for (const skill of ast.skills) {
        lines.push(`### \`${skill.invocableAs}\` - ${skill.name}`);
        lines.push('');
        lines.push(`**Authority**: ${skill.authority}`);
        lines.push('');
        if (skill.authoritativeFor.length > 0) {
          lines.push(`**Authoritative for**: ${skill.authoritativeFor.join(', ')}`);
          lines.push('');
        }
        if (skill.refusals && skill.refusals.length > 0) {
          lines.push(`**Refusals enforced**: ${skill.refusals.join(', ')}`);
          lines.push('');
        }
      }
    }

    // Invocation modes (vocabulary v2 - Iteration 2 G-3)
    if (ast.invocationModes.length > 0) {
      lines.push('## Invocation modes');
      lines.push('');
      for (const mode of ast.invocationModes) {
        lines.push(`### ${mode.mode}`);
        lines.push('');
        lines.push(`- **When**: ${mode.when}`);
        lines.push(`- **Effect**: ${mode.effect}`);
        if (mode.example) {
          lines.push(`- **Example**: \`${mode.example}\``);
        }
        lines.push('');
      }
    }

    appendEmbodiedProjectionSection(lines, ast.embodiedProjections);

    // Routines (A-00X)
    if (ast.routines.length > 0) {
      lines.push('## Recurring routines (A-00X)');
      lines.push('');
      lines.push(`| ID | Schedule | Skill | Output |`);
      lines.push(`|---|---|---|---|`);
      for (const routine of ast.routines) {
        lines.push(
          `| ${routine.id} | \`${routine.schedule}\` | ${routine.skill} | ${routine.outputDir ?? '*(varies)*'} |`
        );
      }
      lines.push('');
    }

    // Escalation
    if (ast.escalations.length > 0) {
      lines.push('## Escalation');
      lines.push('');
      for (const esc of ast.escalations) {
        lines.push(`- **Trigger**: ${esc.trigger}`);
        lines.push(`  - **Action**: ${esc.doAction}`);
        lines.push(`  - **Recipient**: ${esc.recipient}`);
        if (esc.refuseToEscalateWhen.length > 0) {
          lines.push(
            `  - **Refuse to escalate when**: ${esc.refuseToEscalateWhen.join(', ')}`
          );
        }
      }
      lines.push('');
    }

    // Date discipline (W.317) (vocabulary v2 - Iteration 2 G-3 next slice)
    if (ast.dateDisciplines.length > 0) {
      lines.push('## Date discipline');
      lines.push('');
      for (const d of ast.dateDisciplines) {
        const wisdomLabel = d.wisdomId ? ` (${d.wisdomId})` : '';
        lines.push(`### Refusal contract${wisdomLabel}`);
        lines.push('');
        lines.push(`**${d.refusalContract}**`);
        lines.push('');
        if (d.requiredComponents.length > 0) {
          lines.push('**Required components** (all must be present):');
          for (const comp of d.requiredComponents) {
            lines.push(`- ${comp}`);
          }
          lines.push('');
        }
        if (d.shapeTemplate) {
          lines.push('**Output shape**:');
          lines.push('');
          lines.push('```');
          lines.push(d.shapeTemplate);
          lines.push('```');
          lines.push('');
        }
        if (d.reason) {
          lines.push(`**Reason**: ${d.reason}`);
          lines.push('');
        }
        if (d.crossReferences && d.crossReferences.length > 0) {
          lines.push(`**Cross-references**: ${d.crossReferences.join(', ')}`);
          lines.push('');
        }
      }
    }

    // Citation discipline
    if (ast.citationRules.length > 0) {
      lines.push('## Citation discipline');
      lines.push('');
      for (const rule of ast.citationRules) {
        lines.push(
          `- Fluent prose over **${rule.fluentProseThresholdChars} chars** must include ` +
            `one of: ${rule.required.join(', ')}`
        );
        if (rule.exemption) {
          lines.push(`  - Exemption: ${rule.exemption}`);
        }
        if (rule.reason) {
          lines.push(`  - Reason: ${rule.reason}`);
        }
      }
      lines.push('');
    }

    // Cross-references - graduated wisdom + feedback
    if (ast.graduatedWisdoms.length > 0 || ast.feedbacks.length > 0) {
      lines.push('## Authority cross-references');
      lines.push('');
      if (ast.graduatedWisdoms.length > 0) {
        lines.push('### GOLD-tier wisdom');
        lines.push('');
        for (const wisdom of ast.graduatedWisdoms) {
          lines.push(`- **${wisdom.id}** *(${wisdom.tier})* - ${wisdom.claim}`);
        }
        lines.push('');
      }
      if (ast.feedbacks.length > 0) {
        lines.push('### Feedback memory');
        lines.push('');
        for (const fb of ast.feedbacks) {
          const src = fb.source ? ` (${fb.source})` : '';
          lines.push(`- **${fb.id}**${src} - ${fb.claim}`);
        }
        lines.push('');
      }
    }

    // Generated-by trailer
    lines.push('---');
    lines.push('');
    lines.push(
      `*Generated by HoloScript ContextCompiler (compile_to_skill_md). ` +
        `Source: HoloScript composition. Vocabulary: v1 (ratified 2026-05-06). ` +
        `Phase 2(a) self-host target.*`
    );
    lines.push('');

    return lines.join('\n');
  }
}

// =============================================================================
// EXPORTS - error class + factory + helpers
// =============================================================================

export class ContextCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ContextCompileError';
  }
}

export function createContextCompiler(options?: ContextCompilerOptions): ContextCompiler {
  return new ContextCompiler(options);
}

// =============================================================================
// HoloValue accessor helpers (defensive - extractions guard against
// missing/malformed config fields without throwing inside the compiler)
// =============================================================================

function stringField(cfg: Record<string, HoloValue>, key: string, fallback: string): string {
  const v = cfg[key];
  if (typeof v === 'string') return v;
  return fallback;
}

function stringFieldOrUndef(
  cfg: Record<string, HoloValue>,
  key: string
): string | undefined {
  const v = cfg[key];
  return typeof v === 'string' ? v : undefined;
}

function numberField(
  cfg: Record<string, HoloValue>,
  key: string,
  fallback: number
): number {
  const v = cfg[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function boolField(
  cfg: Record<string, HoloValue>,
  key: string,
  fallback: boolean
): boolean {
  const v = cfg[key];
  return typeof v === 'boolean' ? v : fallback;
}

// YAML helpers for compile_to_skill_md frontmatter

/**
 * Render a string as a YAML scalar. Bare string if it's a simple
 * identifier; otherwise double-quoted with escapes. Avoids the YAML
 * footguns (`yes`/`no`/`true`/`false`/numbers being coerced) by
 * always quoting non-identifier inputs.
 */
function yamlScalar(s: string): string {
  if (/^[A-Za-z][A-Za-z0-9_-]*$/.test(s) && !YAML_RESERVED.has(s.toLowerCase())) {
    return s;
  }
  return JSON.stringify(s);
}

/**
 * Render a description for YAML frontmatter. Single-line uses inline
 * double-quoted form; multi-line uses folded scalar (`>`) with
 * 2-space indent on each continuation line. Mirrors the convention
 * used in `~/.claude/skills/founder/SKILL.md`.
 */
function formatYamlDescription(description: string): string {
  if (!description.includes('\n')) {
    return `description: ${JSON.stringify(description)}`;
  }
  const lines = description.split('\n').map((line) => `  ${line}`);
  return `description: >\n${lines.join('\n')}`;
}

const YAML_RESERVED: ReadonlySet<string> = new Set([
  'yes', 'no', 'true', 'false', 'on', 'off', 'null', '~',
]);

function stringListField(cfg: Record<string, HoloValue>, key: string): string[] {
  const v = cfg[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}

function appendEmbodiedProjectionSection(
  lines: string[],
  projections: ContextEmbodiedProjection[]
): void {
  if (projections.length === 0) return;

  lines.push('## Embodied projections');
  lines.push('');
  for (const projection of projections) {
    const surface = projection.surface || 'unspecified-surface';
    const kind = projection.projectionKind || 'read-only';
    lines.push(`### ${surface} / ${kind}`);
    lines.push('');
    lines.push(`- **Surface**: ${surface}`);
    lines.push(`- **Projection kind**: ${kind}`);
    if (projection.trigger) {
      lines.push(`- **Trigger**: ${projection.trigger}`);
    }
    if (projection.notes) {
      lines.push(`- **Notes**: ${projection.notes}`);
    }
    lines.push('');
  }
}

// =============================================================================
// Cursor .mdc helpers (compile_to_cursor_rules emitter)
// =============================================================================

/**
 * Wrap a body with Cursor frontmatter. v1 always emits `alwaysApply: true`
 * with empty `globs:` (per spec § "What the emitter does NOT do (v1 scope)").
 * Spec memo: research/2026-05-06_cursor-mdc-spec.md.
 */
function wrapMdc(description: string, bodyLines: string[]): string {
  const front = ['---', `description: ${description}`, 'globs:', 'alwaysApply: true', '---', ''];
  return front.concat(bodyLines).join('\n');
}

/**
 * Collapse a string to a single line for use inside a frontmatter scalar.
 * Strips newlines (which would break YAML), collapses runs of whitespace,
 * and trims. Returned string is safe to drop directly after `description: `.
 */
function oneLine(s: string): string {
  return s.replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Convert a rule name to a kebab-case `.mdc` filename slug. Strict
 * `[a-z0-9-]+` filter; underscores -> hyphens; runs of separators
 * collapsed; leading/trailing separators trimmed. Empty result falls
 * back to a hash-derived token (defensive - never emit a malformed
 * filename even if upstream sends garbage).
 */
function toCursorSlug(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
  if (base.length > 0) return base;
  // Defensive fallback: derive a stable short token from the input. Uses
  // a tiny non-cryptographic hash (sum of char codes mod 1e6) since this
  // is just a filename collision avoidance device, not security.
  let h = 0;
  for (let i = 0; i < name.length; i += 1) {
    h = (h + name.charCodeAt(i)) % 1_000_000;
  }
  return `rule-${h.toString(36).padStart(4, '0')}`;
}
