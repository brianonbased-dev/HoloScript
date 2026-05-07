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
 * @version 1.0.0 (Phase 1 - claude_md emitter only; agents_md +
 *   cursor_rules are filed Phase 1 follow-ups)
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

/** Top-level block: who is this context for. */
export interface ContextIdentity {
  name: string;
  role: string;
  domain: string;
  surface: ContextSurface;
  noMonopoly: boolean;
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
  action: string;
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
   *   3. emit - dispatch to per-format emitters (claude_md is the only
   *      one in this Phase 1 commit; agents_md + cursor_rules + others
   *      are filed follow-ups)
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
        case 'cursor_rules':
        case 'skill_md':
        case 'anthropic_system_prompt':
        case 'brain_includes':
        case 'mcp_context_loader':
          // Phase 1 follow-ups - see filed board tasks.
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
      case 'identity':
        ast.identity = {
          name: stringField(cfg, 'name', ''),
          role: stringField(cfg, 'role', ''),
          domain: stringField(cfg, 'domain', ''),
          surface: (stringField(cfg, 'surface', 'any') as ContextSurface) ?? 'any',
          noMonopoly: boolField(cfg, 'no_monopoly', false),
        };
        break;
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
          action: stringField(cfg, 'action', ''),
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
        lines.push(`  - **Action**: ${esc.action}`);
        lines.push(`  - **Recipient**: ${esc.recipient}`);
        if (esc.refuseToEscalateWhen.length > 0) {
          lines.push(
            `  - **Refuse to escalate when**: ${esc.refuseToEscalateWhen.join(', ')}`
          );
        }
      }
      lines.push('');
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

function stringListField(cfg: Record<string, HoloValue>, key: string): string[] {
  const v = cfg[key];
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === 'string');
}
