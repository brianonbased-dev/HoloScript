/**
 * LLMProviderCapabilitiesCompiler - Compile HoloScript LLM-capabilities
 * compositions to provider-data targets.
 *
 * Per "Context as a HoloScript Compile Target" memo (ai-ecosystem
 * research/2026-05-06_context-as-compile-target.md, ratified 2026-05-06)
 * § Phase 2(b): collapses the 3 sources for LLM capability data
 * (markdown SSOT + TS adapter constants + cost-guard pricing) to 1
 * `.hs` source. Sovereign compiler (W.GOLD.002) — vocabulary primitives
 * for LLM provider data, with multi-target emit. Architectural sibling
 * of ContextCompiler (same extract/validate/emit pattern, different
 * vocabulary).
 *
 * Why this exists (W.GOLD.006 single-source-of-truth): three places
 * carry overlapping LLM data today, and they DO drift. Verified
 * 2026-05-06 — `docs/LLM_CAPABILITIES.md` lists Opus 4.7 as $5/$25 per
 * MTok; `packages/holoscript-agent/src/cost-guard.ts:7` hardcodes
 * $15/$75 — a 3× drift the markdown reader would never catch. This
 * compiler's job is to make that drift unrepresentable: one `.hs`
 * source, deterministic emit to all three targets.
 *
 * Vocabulary v1 (Phase 2 ratification, 2026-05-06):
 *
 *   Top-level block (1):
 *     capability_matrix_meta
 *
 *   Per-rule traits (6):
 *     @llm_provider, @llm_model, @llm_capability, @llm_superpower,
 *     @llm_routing_recommendation, @llm_hard_dont
 *
 * Constraint enforcement (mirrors ContextCompiler tiering):
 *   BLOCK — duplicate provider names, orphan model/capability
 *           references, vendor-as-substrate hard_donts (W.GOLD.002),
 *           [VERIFY] markers in numeric positions (W.GOLD.341).
 *   WARN  — missing last_verified, last_verified > 90 days
 *           (F.014 / W.GOLD.341 staleness gate).
 *
 * @version 1.2.0 (Phase 2(b) - markdown_ssot + cost_guard_pricing +
 *   json_capability_matrix; ts_adapter_capabilities is filed as a Phase 2(b)
 *   follow-up)
 * @module @holoscript/core/compiler/LLMProviderCapabilitiesCompiler
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
// VOCABULARY v1 - TYPED LLM-CAPABILITIES AST (the sovereign concept)
// =============================================================================

/** Provider status in the matrix. */
export type LLMProviderStatus =
  | 'live'
  | 'partial'
  | 'teammate'
  | 'runtime'
  | 'planned';

/** Per-model lifecycle status. */
export type LLMModelStatus =
  | 'active'
  | 'active-recommended'
  | 'active-legacy'
  | 'deprecated';

/** Top-level block: matrix-wide metadata. */
export interface LLMCapabilityMatrixMeta {
  version: string;
  generatedAt: string;            // ISO date
  noMonopolyRule: boolean;        // founder ruling 2026-05-06
  refreshCadenceDays: number;     // F.014 / W.GOLD.341 staleness gate
}

/** Per-rule: one provider in the matrix. */
export interface LLMProvider {
  name: string;                   // "anthropic", "openai", "xai", etc.
  vendorUrl: string;
  authEnv: string;                // "ANTHROPIC_API_KEY"
  baseUrl?: string;
  docsRoot?: string;
  status: LLMProviderStatus;
  uniqueSuperpower: string;       // one-line summary (matrix row)
  lastVerified: string;           // YYYY-MM-DD
}

/** Per-rule: one model entry. */
export interface LLMModel {
  provider: string;               // FK to @llm_provider.name
  friendlyName: string;           // "Opus 4.7"
  modelId: string;                // "claude-opus-4-7"
  contextWindow: number;          // tokens
  maxOutput: number;              // tokens
  inputPerMTok: number;           // USD
  outputPerMTok: number;          // USD
  status: LLMModelStatus;
  lastVerified: string;           // YYYY-MM-DD
  retiresOn?: string;             // YYYY-MM-DD (deprecated models)
}

/** Per-rule: one capability flag. */
export interface LLMCapability {
  provider: string;               // FK to @llm_provider.name
  name: string;                   // "streaming", "vision", "highResVision"
  value: boolean | string | number;
  notes?: string;
  lastVerified?: string;
}

/**
 * Per-rule: one segregated-axis exploit (the capability that would be
 * lost if flattened to the universal contract). These are what the
 * `req.provider.<name>.*` namespace targets.
 */
export interface LLMSuperpower {
  provider: string;               // FK to @llm_provider.name
  name: string;                   // "Adaptive thinking", "Live web search"
  description: string;
  betaHeader?: string;            // e.g. "task-budgets-2026-03-13"
}

/** Per-rule: routing recommendation block. */
export interface LLMRoutingRecommendation {
  provider: string;               // FK to @llm_provider.name
  useWhen: string[];
  avoidWhen: string[];
  defaultFor: string[];
}

/**
 * Per-rule: cross-provider red line. Mirrors ContextHardDont in shape
 * but lives in this compiler's vocabulary (separate AST keeps the
 * compilers decoupled). Default scope is "all-providers" — set
 * appliesTo to one or more provider names to scope per-vendor.
 */
export interface LLMHardDont {
  name: string;
  reason: string;
  alternative?: string;
  appliesTo: string[];            // provider names or ["all-providers"]
}

/** Diagnostic surfaced from validation. */
export interface LLMCapabilityValidationDiagnostic {
  severity: 'error' | 'warning';
  rule: string;
  message: string;
  location?: string;
}

/**
 * Parsed LLM-capabilities AST - sovereign vocabulary v1 in typed form.
 * The compiler walks the HoloComposition AST, extracts known traits
 * into this shape, validates per BLOCK rules, then dispatches to emitters.
 */
export interface LLMCapabilityMatrixAST {
  meta?: LLMCapabilityMatrixMeta;
  providers: LLMProvider[];
  models: LLMModel[];
  capabilities: LLMCapability[];
  superpowers: LLMSuperpower[];
  routingRecommendations: LLMRoutingRecommendation[];
  hardDonts: LLMHardDont[];
  warnings: LLMCapabilityValidationDiagnostic[];
}

export type LLMCapabilityEmitFormat =
  | 'markdown_ssot'
  | 'ts_adapter_capabilities'
  | 'cost_guard_pricing'
  | 'json_capability_matrix';

export interface LLMCapabilityCompileResult {
  files: Record<string, string>;
  ast: LLMCapabilityMatrixAST;
  diagnostics: LLMCapabilityValidationDiagnostic[];
}

export interface LLMCapabilityCompilerOptions {
  /** Which emit formats to produce. Defaults to ['markdown_ssot']. */
  formats?: LLMCapabilityEmitFormat[];
  /** Today's date for staleness comparison; defaults to system clock. */
  nowIso?: string;
}

// =============================================================================
// BANNED PATTERNS - reused from ContextCompiler family (W.GOLD.002 + W.GOLD.341)
// =============================================================================

/**
 * Vendor-as-substrate phrases an `@llm_hard_dont` MUST NOT silently
 * endorse. A correct hard_dont SAYS "do not adopt vendor as substrate";
 * the patterns below catch the inverse framing. Mirrors the equivalent
 * list in ContextCompiler.ts.
 */
const VENDOR_AS_SUBSTRATE_PATTERNS: ReadonlyArray<{ pattern: RegExp; rule: string }> = [
  { pattern: /managed_agents_replaces_holomesh/i, rule: 'W.GOLD.002 - vendor framework cannot replace HoloMesh' },
  { pattern: /vector_store_as_source_of_truth/i, rule: 'docs/LLM_CAPABILITIES.md hard-don\'ts - vendor stores never source-of-truth' },
  { pattern: /api_keys_as_identity/i, rule: 'W.GOLD.004 - wallets are identity, API keys are sessions' },
];

/**
 * String values that are unverified placeholder markers. If any of
 * these appear in a numeric-position field (price, context window,
 * max output) the source has propagated a placeholder where a verified
 * number belongs - F.014 / W.GOLD.341 violation - BLOCK.
 *
 * Hits the .hs parser layer first usually (numeric vs string mismatch),
 * but defensive validation here catches stringified-number sources
 * (e.g. operator wrote "[VERIFY]" in a numeric field of the source .hs).
 */
const VERIFY_PLACEHOLDER_PATTERN = /\[VERIFY/;

const STALENESS_DAYS_DEFAULT = 90;

// =============================================================================
// COMPILER
// =============================================================================

export class LLMProviderCapabilitiesCompiler extends CompilerBase {
  protected readonly compilerName = 'LLMProviderCapabilitiesCompiler';

  private options: Required<Omit<LLMCapabilityCompilerOptions, 'nowIso'>> & {
    nowIso: string;
  };

  constructor(options: LLMCapabilityCompilerOptions = {}) {
    super();
    this.options = {
      formats: options.formats ?? ['markdown_ssot'],
      nowIso: options.nowIso ?? new Date().toISOString().slice(0, 10),
    };
  }

  protected override getRequiredCapability(): ANSCapabilityPathValue {
    // Reuse AGENT_INFERENCE - same family as ContextCompiler (both
    // emit agent-surface artifacts). If a dedicated AGENT_CAPABILITY
    // capability is added later, swap here.
    return ANSCapabilityPath.AGENT_INFERENCE;
  }

  /**
   * Compile a HoloScript LLM-capabilities composition to provider-data
   * targets.
   *
   * Phases:
   *   1. extract  - walk the HoloComposition AST, collect all v1 LLM
   *                 traits into the typed AST shape
   *   2. validate - apply BLOCK rules (duplicate-provider, orphan-FK,
   *                 vendor-as-substrate, [VERIFY] in numeric position)
   *                 and WARN rules (missing/stale last_verified)
   *   3. emit     - dispatch to per-format emitters (markdown_ssot +
   *                 cost_guard_pricing + json_capability_matrix shipped;
   *                 the TypeScript adapter target is filed as a follow-up)
   */
  compile(
    composition: HoloComposition,
    agentToken: string,
    outputPath?: string
  ): LLMCapabilityCompileResult {
    this.validateCompilerAccess(agentToken, outputPath);

    // Phase 1: extract
    const ast = this.extractMatrixAST(composition);

    // Phase 2: validate (BLOCK throws, WARN accumulates)
    this.validate(ast);

    // Phase 3: emit
    const files: Record<string, string> = {};
    for (const format of this.options.formats) {
      switch (format) {
        case 'markdown_ssot':
          files['LLM_CAPABILITIES.md'] = this.emitMarkdownSsot(ast);
          break;
        case 'cost_guard_pricing':
          files['cost-guard-pricing.ts'] = this.emitCostGuardPricing(ast);
          break;
        case 'json_capability_matrix':
          files['llm-capability-matrix.json'] = this.emitJsonCapabilityMatrix(ast);
          break;
        case 'ts_adapter_capabilities':
          // Phase 2(b) follow-ups - see filed board tasks.
          throw new Error(
            `Format "${format}" is a Phase 2(b)+ follow-up; not yet emitted. ` +
              `See ai-ecosystem research/2026-05-06_context-as-compile-target.md ` +
              `section Phase 2 for the rollout order.`
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

  private extractMatrixAST(composition: HoloComposition): LLMCapabilityMatrixAST {
    const ast: LLMCapabilityMatrixAST = {
      providers: [],
      models: [],
      capabilities: [],
      superpowers: [],
      routingRecommendations: [],
      hardDonts: [],
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

  private extractFromObject(obj: HoloObjectDecl, ast: LLMCapabilityMatrixAST): void {
    const traits = obj.traits ?? [];
    for (const trait of traits) {
      this.dispatchTrait(trait, ast);
    }
  }

  private dispatchTrait(trait: HoloObjectTrait, ast: LLMCapabilityMatrixAST): void {
    const cfg = trait.config;
    switch (trait.name) {
      case 'capability_matrix_meta':
        ast.meta = {
          version: stringField(cfg, 'version', '1.0.0'),
          generatedAt: stringField(cfg, 'generated_at', ''),
          noMonopolyRule: boolField(cfg, 'no_monopoly_rule', true),
          refreshCadenceDays: numberField(
            cfg,
            'refresh_cadence_days',
            STALENESS_DAYS_DEFAULT,
            'capability_matrix_meta.refresh_cadence_days'
          ),
        };
        break;
      case 'llm_provider':
        ast.providers.push({
          name: stringField(cfg, 'name', ''),
          vendorUrl: stringField(cfg, 'vendor_url', ''),
          authEnv: stringField(cfg, 'auth_env', ''),
          baseUrl: stringFieldOrUndef(cfg, 'base_url'),
          docsRoot: stringFieldOrUndef(cfg, 'docs_root'),
          status: (stringField(cfg, 'status', 'planned') as LLMProviderStatus),
          uniqueSuperpower: stringField(cfg, 'unique_superpower', ''),
          lastVerified: stringField(cfg, 'last_verified', ''),
        });
        break;
      case 'llm_model':
        ast.models.push({
          provider: stringField(cfg, 'provider', ''),
          friendlyName: stringField(cfg, 'friendly_name', ''),
          modelId: stringField(cfg, 'model_id', ''),
          contextWindow: numberField(cfg, 'context_window', 0, 'llm_model.context_window'),
          maxOutput: numberField(cfg, 'max_output', 0, 'llm_model.max_output'),
          inputPerMTok: numberField(cfg, 'input_per_mtok', 0, 'llm_model.input_per_mtok'),
          outputPerMTok: numberField(cfg, 'output_per_mtok', 0, 'llm_model.output_per_mtok'),
          status: (stringField(cfg, 'status', 'active') as LLMModelStatus),
          lastVerified: stringField(cfg, 'last_verified', ''),
          retiresOn: stringFieldOrUndef(cfg, 'retires_on'),
        });
        break;
      case 'llm_capability':
        ast.capabilities.push({
          provider: stringField(cfg, 'provider', ''),
          name: stringField(cfg, 'name', ''),
          value: extractCapabilityValue(cfg['value']),
          notes: stringFieldOrUndef(cfg, 'notes'),
          lastVerified: stringFieldOrUndef(cfg, 'last_verified'),
        });
        break;
      case 'llm_superpower':
        ast.superpowers.push({
          provider: stringField(cfg, 'provider', ''),
          name: stringField(cfg, 'name', ''),
          description: stringField(cfg, 'description', ''),
          betaHeader: stringFieldOrUndef(cfg, 'beta_header'),
        });
        break;
      case 'llm_routing_recommendation':
        ast.routingRecommendations.push({
          provider: stringField(cfg, 'provider', ''),
          useWhen: stringListField(cfg, 'use_when'),
          avoidWhen: stringListField(cfg, 'avoid_when'),
          defaultFor: stringListField(cfg, 'default_for'),
        });
        break;
      case 'llm_hard_dont': {
        const appliesTo = stringListField(cfg, 'applies_to');
        ast.hardDonts.push({
          name: stringField(cfg, 'name', ''),
          reason: stringField(cfg, 'reason', ''),
          alternative: stringFieldOrUndef(cfg, 'alternative'),
          appliesTo: appliesTo.length > 0 ? appliesTo : ['all-providers'],
        });
        break;
      }
      default:
        ast.warnings.push({
          severity: 'warning',
          rule: 'unknown-trait',
          message:
            `Trait "${trait.name}" is not in LLM-capabilities vocabulary v1. ` +
            `Ignored. Add to vocabulary if load-bearing.`,
        });
        break;
    }
  }

  // --- Phase 2: validate (BLOCK throws, WARN accumulates) -----------

  private validate(ast: LLMCapabilityMatrixAST): void {
    // BLOCK: duplicate provider names (single source of truth violation)
    const providerNames = new Set<string>();
    for (const provider of ast.providers) {
      if (providerNames.has(provider.name)) {
        throw new LLMCapabilityCompileError(
          `@llm_provider name "${provider.name}" is duplicated. Each provider ` +
            `must appear exactly once in the matrix (W.GOLD.006 - single source ` +
            `of truth). If you need per-deployment overrides, use a separate ` +
            `composition with @include selectors.`
        );
      }
      providerNames.add(provider.name);
    }

    // BLOCK: orphan FK references (model/capability/superpower/routing
    // pointing at a provider that doesn't exist in the matrix)
    const orphanCheck = (
      providerName: string,
      fromTrait: string,
      fromName: string
    ): void => {
      if (providerName && !providerNames.has(providerName)) {
        throw new LLMCapabilityCompileError(
          `@${fromTrait} "${fromName}" references provider "${providerName}" ` +
            `but no @llm_provider with that name exists in the composition. ` +
            `Add the provider entry or fix the reference.`
        );
      }
    };
    for (const model of ast.models) {
      orphanCheck(model.provider, 'llm_model', model.modelId || model.friendlyName);
    }
    for (const cap of ast.capabilities) {
      orphanCheck(cap.provider, 'llm_capability', cap.name);
    }
    for (const sp of ast.superpowers) {
      orphanCheck(sp.provider, 'llm_superpower', sp.name);
    }
    for (const rr of ast.routingRecommendations) {
      orphanCheck(rr.provider, 'llm_routing_recommendation', rr.provider);
    }

    // BLOCK: @llm_hard_dont with vendor-as-substrate framing
    for (const dont of ast.hardDonts) {
      const haystack = `${dont.name} ${dont.reason}`;
      for (const vendorPat of VENDOR_AS_SUBSTRATE_PATTERNS) {
        if (vendorPat.pattern.test(haystack)) {
          throw new LLMCapabilityCompileError(
            `@llm_hard_dont "${dont.name}" appears to author a ` +
              `vendor-as-substrate pattern. Rule: ${vendorPat.rule}. ` +
              `(A correct hard_dont SAYS "do not adopt vendor as substrate" - ` +
              `this one's framing matches the inverse.)`
          );
        }
      }
    }

    // BLOCK: [VERIFY] markers in route-bearing @llm_capability values.
    // Numeric pricing/context fields are blocked during extraction by
    // numberField(), where the original config value is still available.
    for (const cap of ast.capabilities) {
      if (typeof cap.value === 'string' && VERIFY_PLACEHOLDER_PATTERN.test(cap.value)) {
        throw new LLMCapabilityCompileError(
          `@llm_capability "${cap.name}" for provider "${cap.provider}" has ` +
            `[VERIFY] placeholder in its value. The matrix must not route on ` +
            `unverified data (F.014 / W.GOLD.341). File a /research task to ` +
            `populate the field, then re-emit.`
        );
      }
    }

    // WARN: model rows where pricing extracted as 0 (likely [VERIFY]
    // placeholder in source - emit a warning so the markdown reader
    // sees the gap explicitly).
    for (const model of ast.models) {
      if (model.inputPerMTok === 0 && model.outputPerMTok === 0) {
        ast.warnings.push({
          severity: 'warning',
          rule: 'F.014 unverified-pricing',
          message:
            `@llm_model "${model.modelId}" for provider "${model.provider}" ` +
            `has zero input+output pricing. If this is a free / local model, ` +
            `add a note; otherwise this likely indicates an unverified source ` +
            `field that needs a /research task to populate.`,
        });
      }
    }

    // WARN: missing last_verified on a provider
    for (const provider of ast.providers) {
      if (!provider.lastVerified) {
        ast.warnings.push({
          severity: 'warning',
          rule: 'F.014 missing-last-verified',
          message:
            `@llm_provider "${provider.name}" has no last_verified field. ` +
            `Per the SSOT update protocol, every provider must declare when ` +
            `it was last reconciled with vendor docs.`,
        });
        continue;
      }
      const ageDays = daysBetween(provider.lastVerified, this.options.nowIso);
      if (ageDays !== null && ageDays > STALENESS_DAYS_DEFAULT) {
        ast.warnings.push({
          severity: 'warning',
          rule: 'F.014 stale-last-verified',
          message:
            `@llm_provider "${provider.name}" was last verified ` +
            `${provider.lastVerified} (${ageDays} days ago). Per F.014 / ` +
            `W.GOLD.341, > ${STALENESS_DAYS_DEFAULT}-day-old data must be ` +
            `re-verified before relying on it for routing.`,
        });
      }
    }
  }

  // --- Phase 3: emit -- compile_to_markdown_ssot ---------------------

  /**
   * Emit LLM_CAPABILITIES.md - the markdown SSOT format read by
   * humans and consumed as the canonical reference (today's source
   * of truth, tomorrow's emitted target). Format mirrors the
   * existing `docs/LLM_CAPABILITIES.md` shape for round-trip
   * compatibility.
   */
  private emitMarkdownSsot(ast: LLMCapabilityMatrixAST): string {
    const lines: string[] = [];

    // Header
    lines.push('# LLM Capabilities & Benchmarks - SSOT');
    lines.push('');
    lines.push(
      '> Authoritative source for every LLM provider we route to. Drives ' +
        'the capability manifests in `packages/llm-provider/`, brain-' +
        'composition `requires/prefers` fields, `CostGuard` pricing, and ' +
        'routing decisions in `packages/holoscript-agent/`.'
    );
    if (ast.meta?.noMonopolyRule) {
      lines.push('>');
      lines.push(
        '> **No-monopoly rule:** No provider is the default for the framework. ' +
          'Routing defaults are per-brain, declared in `.hsplus`, never baked ' +
          'into core packages.'
      );
    }
    lines.push('');

    // Meta
    if (ast.meta) {
      lines.push('## Matrix metadata');
      lines.push('');
      lines.push(`- **Version**: ${ast.meta.version}`);
      lines.push(`- **Generated**: ${ast.meta.generatedAt}`);
      lines.push(`- **Refresh cadence**: every ${ast.meta.refreshCadenceDays} days`);
      lines.push('');
    }

    // Provider matrix (one-line each)
    if (ast.providers.length > 0) {
      lines.push('## Provider matrix');
      lines.push('');
      lines.push('| Provider | Status | Unique superpower | Last verified |');
      lines.push('|---|---|---|---|');
      for (const p of ast.providers) {
        lines.push(
          `| **${p.name}** | ${p.status} | ${p.uniqueSuperpower} | ${p.lastVerified || '*(unverified)*'} |`
        );
      }
      lines.push('');
    }

    // Hard don'ts (matrix-wide and per-provider)
    if (ast.hardDonts.length > 0) {
      lines.push("## Hard don'ts (cross-provider red lines)");
      lines.push('');
      lines.push(
        'These are non-negotiable. Each rule names what NOT to do, why, and the alternative.'
      );
      lines.push('');
      for (const d of ast.hardDonts) {
        const scope = d.appliesTo.includes('all-providers')
          ? 'all providers'
          : d.appliesTo.join(', ');
        lines.push(`### ${d.name}`);
        lines.push('');
        lines.push(`- **Reason**: ${d.reason}`);
        if (d.alternative) {
          lines.push(`- **Alternative**: ${d.alternative}`);
        }
        lines.push(`- **Applies to**: ${scope}`);
        lines.push('');
      }
    }

    // Per-provider sections
    for (const provider of ast.providers) {
      lines.push(`## ${provider.name}`);
      lines.push('');

      // Identity & access
      lines.push('### Identity & access');
      lines.push('');
      lines.push(`- **Vendor URL**: ${provider.vendorUrl || '*(missing)*'}`);
      lines.push(`- **Auth env**: \`${provider.authEnv || '*(missing)*'}\``);
      if (provider.baseUrl) lines.push(`- **Base URL**: ${provider.baseUrl}`);
      if (provider.docsRoot) lines.push(`- **Docs root**: ${provider.docsRoot}`);
      lines.push(`- **Status**: ${provider.status}`);
      lines.push('');

      // Models for this provider
      const models = ast.models.filter((m) => m.provider === provider.name);
      if (models.length > 0) {
        lines.push('### Models');
        lines.push('');
        lines.push(
          '| Friendly | Model ID | Context | Max out | $/M in | $/M out | Status | Last verified |'
        );
        lines.push('|---|---|---|---|---|---|---|---|');
        for (const m of models) {
          lines.push(
            `| ${m.friendlyName} | \`${m.modelId}\` | ${formatTokens(m.contextWindow)} | ${formatTokens(m.maxOutput)} | $${m.inputPerMTok} | $${m.outputPerMTok} | ${m.status}${m.retiresOn ? ` (retires ${m.retiresOn})` : ''} | ${m.lastVerified || '*(unverified)*'} |`
          );
        }
        lines.push('');
      }

      // Superpowers (segregated axis)
      const superpowers = ast.superpowers.filter((s) => s.provider === provider.name);
      if (superpowers.length > 0) {
        lines.push('### Unique superpowers (segregated axis)');
        lines.push('');
        for (const sp of superpowers) {
          const beta = sp.betaHeader ? ` *(beta header: \`${sp.betaHeader}\`)*` : '';
          lines.push(`- **${sp.name}** - ${sp.description}${beta}`);
        }
        lines.push('');
      }

      // Capabilities
      const caps = ast.capabilities.filter((c) => c.provider === provider.name);
      if (caps.length > 0) {
        lines.push('### Capability flags');
        lines.push('');
        lines.push('| Capability | Value | Notes | Last verified |');
        lines.push('|---|---|---|---|');
        for (const c of caps) {
          lines.push(
            `| ${c.name} | ${formatCapabilityValue(c.value)} | ${c.notes ?? ''} | ${c.lastVerified ?? ''} |`
          );
        }
        lines.push('');
      }

      // Routing
      const routing = ast.routingRecommendations.filter(
        (r) => r.provider === provider.name
      );
      if (routing.length > 0) {
        lines.push('### Routing recommendations');
        lines.push('');
        for (const r of routing) {
          if (r.useWhen.length > 0) {
            lines.push(`- **Use when**: ${r.useWhen.join('; ')}`);
          }
          if (r.avoidWhen.length > 0) {
            lines.push(`- **Avoid when**: ${r.avoidWhen.join('; ')}`);
          }
          if (r.defaultFor.length > 0) {
            lines.push(`- **Default for**: ${r.defaultFor.join('; ')}`);
          }
        }
        lines.push('');
      }

      lines.push(`**Last verified:** ${provider.lastVerified || '*(unverified)*'}`);
      lines.push('');
      lines.push('---');
      lines.push('');
    }

    // Trailer
    lines.push(
      `*Generated by HoloScript LLMProviderCapabilitiesCompiler ` +
        `(compile_to_markdown_ssot). Source: HoloScript composition. ` +
        `Vocabulary: v1 (ratified 2026-05-06). Per W.GOLD.006: this file ` +
        `is the EMITTED SSOT, not a hand-edited document - upstream source ` +
        `is the .hs composition.*`
    );
    lines.push('');

    return lines.join('\n');
  }

  /**
   * Emit a machine-readable capability matrix for routing/autocomplete
   * tooling. `rows` is the compact cross-provider table (one provider per
   * row, capability flags as columns). `providers` carries richer context
   * for dashboards that need models, routing recommendations, or provenance.
   */
  private emitJsonCapabilityMatrix(ast: LLMCapabilityMatrixAST): string {
    const capabilityColumns = Array.from(
      new Set(ast.capabilities.map((cap) => cap.name).filter(Boolean))
    ).sort((a, b) => a.localeCompare(b));

    const providers = ast.providers.map((provider) => {
      const capabilities = ast.capabilities.filter((cap) => cap.provider === provider.name);
      const capabilityValues = capabilityValueMap(capabilities, capabilityColumns);
      const routing = ast.routingRecommendations.filter((r) => r.provider === provider.name);

      return {
        name: provider.name,
        status: provider.status,
        vendorUrl: provider.vendorUrl,
        authEnv: provider.authEnv,
        baseUrl: provider.baseUrl ?? null,
        docsRoot: provider.docsRoot ?? null,
        uniqueSuperpower: provider.uniqueSuperpower,
        lastVerified: provider.lastVerified,
        models: ast.models
          .filter((model) => model.provider === provider.name)
          .map((model) => ({
            friendlyName: model.friendlyName,
            modelId: model.modelId,
            contextWindow: model.contextWindow,
            maxOutput: model.maxOutput,
            inputPerMTok: model.inputPerMTok,
            outputPerMTok: model.outputPerMTok,
            status: model.status,
            lastVerified: model.lastVerified,
            retiresOn: model.retiresOn ?? null,
          })),
        capabilities: capabilityValues,
        capabilityDetails: Object.fromEntries(
          capabilities.map((cap) => [
            cap.name,
            {
              value: cap.value,
              notes: cap.notes ?? null,
              lastVerified: cap.lastVerified ?? null,
            },
          ])
        ),
        superpowers: ast.superpowers
          .filter((superpower) => superpower.provider === provider.name)
          .map((superpower) => ({
            name: superpower.name,
            description: superpower.description,
            betaHeader: superpower.betaHeader ?? null,
          })),
        routing: {
          useWhen: routing.flatMap((r) => r.useWhen),
          avoidWhen: routing.flatMap((r) => r.avoidWhen),
          defaultFor: routing.flatMap((r) => r.defaultFor),
        },
      };
    });

    const rows = providers.map((provider) => ({
      provider: provider.name,
      status: provider.status,
      uniqueSuperpower: provider.uniqueSuperpower,
      lastVerified: provider.lastVerified,
      ...provider.capabilities,
    }));

    const payload = {
      format: 'json_capability_matrix',
      formatVersion: '1.0.0',
      generatedBy: 'HoloScript LLMProviderCapabilitiesCompiler',
      source: 'HoloScript LLM-capabilities composition',
      meta: ast.meta ?? null,
      capabilityColumns,
      rows,
      providers,
      hardDonts: ast.hardDonts,
      diagnostics: ast.warnings,
    };

    return JSON.stringify(payload, null, 2) + '\n';
  }

  /**
   * Emit the CostGuard pricing constants. Shape intentionally mirrors
   * packages/holoscript-agent/src/cost-guard.ts so the runtime can delete
   * hardcoded tables once generated files are wired in.
   */
  private emitCostGuardPricing(ast: LLMCapabilityMatrixAST): string {
    const lines: string[] = [];

    lines.push('/**');
    lines.push(' * Generated by HoloScript LLMProviderCapabilitiesCompiler');
    lines.push(' * target: compile_to_cost_guard_pricing');
    lines.push(' * Source: HoloScript LLM-capabilities composition.');
    lines.push(' * Do not hand-edit; update the .hs source and re-emit.');
    lines.push(' */');
    lines.push('');

    for (const provider of ast.providers) {
      const constName = `${toProviderConstName(provider.name)}_PRICING_USD_PER_MTOK`;
      const models = ast.models.filter((m) => m.provider === provider.name);
      lines.push(
        `export const ${constName}: Record<string, { input: number; output: number }> = ` +
          (models.length === 0 ? '{};' : '{')
      );
      for (const model of models) {
        lines.push(
          `  ${tsStringLiteral(model.modelId)}: { input: ${formatNumberLiteral(model.inputPerMTok)}, output: ${formatNumberLiteral(model.outputPerMTok)} },`
        );
      }
      if (models.length > 0) {
        lines.push('};');
      }
      lines.push('');
    }

    return lines.join('\n');
  }
}

// =============================================================================
// EXPORTS - error class + factory + helpers
// =============================================================================

export class LLMCapabilityCompileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LLMCapabilityCompileError';
  }
}

export function createLLMProviderCapabilitiesCompiler(
  options?: LLMCapabilityCompilerOptions
): LLMProviderCapabilitiesCompiler {
  return new LLMProviderCapabilitiesCompiler(options);
}

// =============================================================================
// Helpers
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
  fallback: number,
  location = key
): number {
  const v = cfg[key];
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && VERIFY_PLACEHOLDER_PATTERN.test(v)) {
    throw new LLMCapabilityCompileError(
      `${location} contains a [VERIFY] placeholder where a verified number ` +
        `is required. Numeric routing and pricing fields must be reconciled ` +
        `before emission (F.014 / W.GOLD.341).`
    );
  }
  return fallback;
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

function extractCapabilityValue(v: HoloValue): boolean | string | number {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string') return v;
  return false;
}

function formatTokens(n: number): string {
  if (n === 0) return '*(unverified)*';
  if (n >= 1_000_000) return `${n / 1_000_000}M`;
  if (n >= 1000) return `${n / 1000}K`;
  return String(n);
}

function formatCapabilityValue(v: boolean | string | number): string {
  if (typeof v === 'boolean') return v ? 'YES' : 'no';
  return String(v);
}

function toProviderConstName(providerName: string): string {
  const normalized = providerName
    .trim()
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase();
  return normalized || 'UNKNOWN_PROVIDER';
}

function tsStringLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function formatNumberLiteral(value: number): string {
  return Number.isFinite(value) ? String(value) : '0';
}

function capabilityValueMap(
  capabilities: LLMCapability[],
  capabilityColumns: string[]
): Record<string, boolean | string | number | null> {
  const byName = new Map<string, LLMCapability>();
  for (const capability of capabilities) {
    byName.set(capability.name, capability);
  }
  return Object.fromEntries(
    capabilityColumns.map((column) => [column, byName.get(column)?.value ?? null])
  );
}

/**
 * Days between two YYYY-MM-DD strings. Returns null if either is
 * unparseable. Positive = `later` is after `earlier`. Used for the
 * 90-day staleness gate.
 */
function daysBetween(earlier: string, later: string): number | null {
  const e = Date.parse(earlier);
  const l = Date.parse(later);
  if (!Number.isFinite(e) || !Number.isFinite(l)) return null;
  return Math.floor((l - e) / (1000 * 60 * 60 * 24));
}
