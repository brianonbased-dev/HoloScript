/**
 * Type surface for ContentPolicyGate — the ecosystem's "what may be SAID" gate.
 *
 * This is the CONTENT axis of the legal/illegal system (the other two axes —
 * agent/robot ACTION legality and regulatory JURISDICTION — are enforced via the
 * Twin Earth safety envelopes and the conformance/founder gates respectively; all
 * three share this jurisdiction context and the audit ledger). See
 * research/2026-06-13 surface map + integration proposal.
 *
 * Founder-anchored posture (2026-06-13):
 *  - Rules are configurable data, default STRICT for the family tier.
 *  - Jurisdiction is first-class from day one (GLOBAL launch target).
 *  - The sovereign/Ollama lane is ALLOWED but every output routes through this
 *    gate (the gate is provider-agnostic — it does not care which lane produced
 *    the text), so the unaligned-model exposure is covered.
 */

import type { JsonLogicRule } from './jsonLogic';

/** Policy-relevant content taxonomy. `none` = nothing actionable detected. */
export type ContentCategory =
  | 'csam' // child sexual abuse material — Tier-0 hard-stop, mandatory external report
  | 'sexual_minors' // sexualization of minors — Tier-0 hard-stop
  | 'terrorism' // terrorist / violent-extremist content — Tier-0 hard-stop
  | 'self_harm' // self-harm / suicide method or encouragement
  | 'violence' // graphic violence, credible threats, instructions to harm
  | 'weapons' // illegal weapons / explosives manufacture
  | 'illegal_goods' // controlled substances, trafficking, illicit marketplace
  | 'hate' // hate speech targeting a protected class
  | 'harassment' // targeted harassment / bullying
  | 'sexual' // adult sexual content
  | 'malware' // malicious code / intrusion instructions
  | 'privacy' // doxxing / non-consensual PII exposure
  | 'misinformation' // demonstrably false, high-harm claims
  | 'none';

/** EU AI Act risk tiers (Art. 6 / Annex III). */
export type RiskTier = 'prohibited' | 'high' | 'limited' | 'minimal';

/**
 * Audience / surface strictness tier — the "configurable, start strict" knob.
 * `family` is the strictest (HoloLand / schools, per D.079).
 */
export type PolicyTier = 'family' | 'teen' | 'general' | 'adult' | 'dev';

/** IEEE 2089.1-2024 age-assurance confidence levels. */
export type AgeAssurance = 'asserted' | 'standard' | 'enhanced' | 'strict';

/** Enforcement verb a tier or rule can produce. Ranked block > escalate > flag > allow. */
export type PolicyAction = 'allow' | 'flag' | 'escalate' | 'block';

/**
 * Where the content will be delivered — drives the legal obligations that apply.
 * Resolved at request ingress (geo-IP is advisory, user-declared region preferred);
 * stored as data so a legal team can update thresholds without a redeploy.
 */
export interface JurisdictionContext {
  /** ISO 3166-1 alpha-2 (e.g. 'US', 'DE'), or the pseudo-regions 'EU' / 'GLOBAL'. */
  region: string;
  /** EU AI Act classification of the generating capability. */
  aiActTier?: RiskTier;
  /** EU Digital Services Act illegal-content obligations apply in this region. */
  dsaApplies?: boolean;
  /** Applicable minimum age for the surface in this region. */
  minAge?: number;
  /** Confidence we have in the user's declared age. */
  ageAssurance?: AgeAssurance;
  /**
   * EU AI Act Art. 50-52 — generated/synthetic origin must be disclosed to the
   * user (e.g. an NPC must reveal it is AI). Surfaced on the decision so the
   * caller can render the disclosure; not itself a block.
   */
  disclosureRequired?: boolean;
}

/** A single classifier verdict (Tier-0 blocklist, Tier-1 model, or Tier-2 LLM). */
export interface Classification {
  category: ContentCategory;
  /** 0..1 — confidence/severity that the content is in `category`. */
  severity: number;
  source: 'blocklist' | 'classifier' | 'llm' | 'provider' | 'none';
  rationale?: string;
}

/** Verdict shape returned by an injected LLM moderation hook (Tier-2). */
export interface ModerationVerdict {
  flagged: boolean;
  categories: ContentCategory[];
  /** 0..1 — maximum severity across flagged categories. */
  severity: number;
  rationale?: string;
}

/**
 * Facts exposed to data-rules and provider hooks. Rules reference these by dot
 * path via the `var` operator (e.g. `{ "==": [{ "var": "category" }, "sexual"] }`).
 * Open-ended so callers can attach surface-specific facts a rule can match on.
 */
export interface PolicyEvalFacts {
  text: string;
  textLength: number;
  /** Normalized (diacritics stripped, separators collapsed) for matching. */
  normalizedText: string;
  category: ContentCategory;
  severity: number;
  tier: PolicyTier;
  region: string;
  aiActTier: RiskTier | null;
  minAge: number | null;
  dsaApplies: boolean;
  /** Calling surface, e.g. 'brittney', 'npc_dialogue', 'publish_zone', 'voice'. */
  surface: string;
  /** Whether we are screening a user PROMPT (`input`) or model OUTPUT (`output`). */
  direction: 'input' | 'output';
  [key: string]: unknown;
}

/** Tier-0 blocklist entry — deterministic, category-tagged, optionally hard-stop. */
export interface BlocklistEntry {
  id: string;
  category: ContentCategory;
  /** Exact normalized terms matched on word boundaries. */
  terms?: string[];
  /** Regex pattern strings (evaluated with the ReDoS-guarded matcher). */
  patterns?: string[];
  /** Severity assigned when this entry matches. Default 0.95. */
  severity?: number;
  /** A hard-stop match can never be overridden by a rule or tier. */
  hardStop?: boolean;
}

/**
 * A data-driven policy rule. Pure JSON — swappable per tier/jurisdiction without
 * a redeploy. `when` is a JSON-Logic predicate over {@link PolicyEvalFacts}.
 */
export interface RuleDescriptor {
  id: string;
  description: string;
  when: JsonLogicRule;
  action: PolicyAction;
  category?: ContentCategory;
  appliesToTiers?: PolicyTier[];
  /** ISO region codes, or 'EU' / 'GLOBAL'. Empty/absent = all regions. */
  appliesToRegions?: string[];
  /** Legal basis text for the DSA-style Statement of Reasons. */
  legalBasis?: string;
  /** EU AI Act article reference, for the compliance record. */
  aiActArticle?: string;
  /** Higher wins on conflict within the same action rank. Default 0. */
  priority?: number;
}

/** Injected Tier-1 classifier (cheap ML). Core stays dependency-free; surfaces supply it. */
export type ClassifierHook = (
  text: string,
  facts: PolicyEvalFacts
) => Promise<Classification | null> | Classification | null;

/** Injected Tier-2 LLM-with-policy moderation. */
export type LlmModerationHook = (
  text: string,
  facts: PolicyEvalFacts
) => Promise<ModerationVerdict> | ModerationVerdict;

/** Configuration for one evaluation context (one tier + jurisdiction + ruleset). */
export interface ContentPolicyConfig {
  tier: PolicyTier;
  rules: RuleDescriptor[];
  jurisdiction: JurisdictionContext;
  blocklist?: BlocklistEntry[];
  /** Categories that ALWAYS hard-block, regardless of tier/jurisdiction/rules. */
  hardStopCategories?: ContentCategory[];
  /** Tier-1 cheap classifier (optional). */
  classifier?: ClassifierHook;
  /** Tier-2 LLM-with-policy moderation (optional). */
  llm?: LlmModerationHook;
  /** Severity at/above which the Tier-2 LLM is consulted for borderline content. Default 0.3. */
  borderlineThreshold?: number;
  /** If true, the Tier-2 LLM runs on every non-hard-stopped item (strict surfaces). Default false. */
  alwaysConsultLlm?: boolean;
}

/** Input to a single gate evaluation. */
export interface ContentPolicyInput {
  text: string;
  surface: string;
  direction?: 'input' | 'output';
  /** Extra facts (merged into {@link PolicyEvalFacts}) a rule may match on. */
  facts?: Record<string, unknown>;
}

/** The decision returned by the gate. */
export interface ContentPolicyDecision {
  allowed: boolean;
  action: PolicyAction;
  tier: PolicyTier;
  category: ContentCategory;
  severity: number;
  matchedRuleId: string | null;
  reason: string;
  classification: Classification;
  jurisdiction: JurisdictionContext;
  /** DSA-style machine-readable Statement of Reasons (set on block/flag/escalate). */
  statementOfReasons: string | null;
  /** EU AI Act Art. 50-52 — caller must surface an AI/synthetic-origin disclosure. */
  disclosureRequired: boolean;
  /** Which cascade tier decided: 0 blocklist, 1 rules/classifier, 2 LLM, 3 human, -1 default-allow. */
  decidedAtTier: 0 | 1 | 2 | 3 | -1;
  timestampMs: number;
}
