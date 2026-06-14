/**
 * Default rulesets, jurisdiction bundles, and the starter Tier-0 blocklist for
 * ContentPolicyGate. All of this is DATA — a deployment can replace any of it
 * without code changes. Posture (founder-anchored 2026-06-13): strict family
 * default, global jurisdiction from day one.
 */

import type {
  BlocklistEntry,
  ContentCategory,
  ContentPolicyConfig,
  JurisdictionContext,
  PolicyTier,
  RuleDescriptor,
} from './types';

/**
 * Categories that ALWAYS hard-block regardless of tier, jurisdiction, or rules.
 * These are illegal in effectively every jurisdiction and are never balanced
 * against context. Detection for these is primarily external hash feeds.
 */
export const HARD_STOP_CATEGORIES: ContentCategory[] = ['csam', 'sexual_minors', 'terrorism'];

/**
 * Starter Tier-0 blocklist. Structural + a conservative set of unambiguous
 * instructional-harm patterns. The grave categories declare their entry so the
 * hard-stop pipeline is wired, but their real detectors are external feeds — the
 * in-repo matchers are deliberately empty (see blocklist.ts header).
 */
export const DEFAULT_BLOCKLIST: BlocklistEntry[] = [
  // ── Hard-stop categories — detectors supplied by external hash feeds ──────────
  { id: 'hs-csam', category: 'csam', hardStop: true, patterns: [] },
  { id: 'hs-sexual-minors', category: 'sexual_minors', hardStop: true, patterns: [] },
  { id: 'hs-terrorism', category: 'terrorism', hardStop: true, patterns: [] },

  // ── Conservative unambiguous instructional-harm patterns (backstop to Tier-2) ─
  {
    id: 'weapons-build-explosive',
    category: 'weapons',
    severity: 0.97,
    patterns: ['\\bhow\\s+to\\s+(make|build|construct|assemble)\\s+(a\\s+)?(bomb|explosive|pipe\\s*bomb|ied)\\b'],
  },
  {
    id: 'malware-author',
    category: 'malware',
    severity: 0.9,
    patterns: ['\\b(write|generate|create)\\s+(me\\s+)?(a\\s+)?(ransomware|keylogger|computer\\s+virus|trojan)\\b'],
  },
  {
    id: 'self-harm-method',
    category: 'self_harm',
    severity: 0.9,
    patterns: ['\\bhow\\s+(can|do)\\s+i\\s+(kill\\s+myself|end\\s+my\\s+life|commit\\s+suicide)\\b'],
  },
];

/**
 * Resolve a jurisdiction bundle from a region code. Stored as data so legal
 * thresholds can change without a redeploy. Unknown regions fall back to the
 * strictest (GLOBAL) posture — fail strict, not open.
 */
export function jurisdictionBundle(region: string): JurisdictionContext {
  const r = (region || 'GLOBAL').toUpperCase();
  switch (r) {
    case 'US':
      return { region: 'US', aiActTier: 'minimal', dsaApplies: false, minAge: 13, disclosureRequired: false };
    case 'EU':
    case 'DE':
    case 'FR':
    case 'ES':
    case 'IT':
    case 'NL':
    case 'IE':
      return { region: r, aiActTier: 'limited', dsaApplies: true, minAge: 16, disclosureRequired: true };
    case 'GB':
    case 'UK':
      return { region: 'GB', aiActTier: 'limited', dsaApplies: false, minAge: 13, disclosureRequired: true };
    // ── Asia-Pacific ──────────────────────────────────────────────────────────
    case 'AU':
      // Australian Privacy Act 1988 + Online Safety Act 2021; no DSA; minAge 13 (Online Safety Act default).
      return { region: 'AU', aiActTier: 'minimal', dsaApplies: false, minAge: 13, disclosureRequired: false };
    case 'JP':
      // APPI 2022 — personal-data transparency obligation; no DSA equivalent.
      return { region: 'JP', aiActTier: 'minimal', dsaApplies: false, minAge: 13, disclosureRequired: true };
    case 'KR':
      // PIPA — age 14 for processing without guardian consent; AI disclosure required.
      return { region: 'KR', aiActTier: 'limited', dsaApplies: false, minAge: 14, disclosureRequired: true };
    case 'SG':
      // PDPA 2012 — no DSA; disclosure required for automated decision-making.
      return { region: 'SG', aiActTier: 'minimal', dsaApplies: false, minAge: 13, disclosureRequired: true };
    case 'IN':
      // DPDP Act 2023 — parental consent required for under-18.
      return { region: 'IN', aiActTier: 'minimal', dsaApplies: false, minAge: 18, disclosureRequired: false };
    // ── Americas ──────────────────────────────────────────────────────────────
    case 'CA':
      // PIPEDA + Quebec Law 25 (GDPR-inspired); minAge 13.
      return { region: 'CA', aiActTier: 'limited', dsaApplies: false, minAge: 13, disclosureRequired: true };
    case 'BR':
      // LGPD 2020 — closely aligned with GDPR; applies DSA-equivalent obligations.
      return { region: 'BR', aiActTier: 'limited', dsaApplies: true, minAge: 13, disclosureRequired: true };
    case 'GLOBAL':
    default:
      // Strictest union: apply EU-grade obligations everywhere until a tighter
      // per-region bundle is configured.
      return { region: 'GLOBAL', aiActTier: 'limited', dsaApplies: true, minAge: 16, disclosureRequired: true };
  }
}

// self_harm is intentionally NOT here — it routes to crisis escalation on every
// tier (COMMON_RULES below), which is more humane than a cold block.
const HARMFUL_FAMILY_CATEGORIES: ContentCategory[] = [
  'sexual',
  'violence',
  'weapons',
  'illegal_goods',
  'hate',
  'harassment',
  'malware',
  'privacy',
];

/** Rules applied to every tier (the floor). */
const COMMON_RULES: RuleDescriptor[] = [
  {
    id: 'common-self-harm-escalate',
    description: 'Self-harm signals route to human/crisis escalation rather than a silent block.',
    when: { '==': [{ var: 'category' }, 'self_harm'] },
    action: 'escalate',
    category: 'self_harm',
    legalBasis: 'duty-of-care / crisis-routing',
    priority: 10,
  },
  {
    id: 'common-illegal-high-block',
    description: 'Clearly-illegal, high-severity instructional content is blocked on every tier (including dev).',
    when: {
      and: [
        { in: [{ var: 'category' }, ['weapons', 'illegal_goods']] },
        { '>=': [{ var: 'severity' }, 0.85] },
      ],
    },
    action: 'block',
    legalBasis: 'illegal-conduct (universal)',
    priority: 20,
  },
];

/** Strict bundle for the family tier (HoloLand / schools, D.079). */
const FAMILY_RULES: RuleDescriptor[] = [
  {
    id: 'family-harmful-category-block',
    description: 'Family tier blocks every harmful content category outright, at any severity.',
    when: {
      and: [
        { '==': [{ var: 'tier' }, 'family'] },
        { in: [{ var: 'category' }, HARMFUL_FAMILY_CATEGORIES] },
      ],
    },
    action: 'block',
    legalBasis: 'HoloLand family-safety policy (D.079)',
    aiActArticle: 'transparency/minors-protection',
    priority: 5,
  },
  {
    id: 'family-misinformation-flag',
    description: 'Family tier flags misinformation for review.',
    when: {
      and: [{ '==': [{ var: 'tier' }, 'family'] }, { '==': [{ var: 'category' }, 'misinformation'] }],
    },
    action: 'flag',
    category: 'misinformation',
    priority: 1,
  },
];

const TEEN_RULES: RuleDescriptor[] = [
  {
    id: 'teen-serious-block',
    description: 'Teen tier blocks serious-harm categories.',
    when: {
      and: [
        { '==': [{ var: 'tier' }, 'teen'] },
        { in: [{ var: 'category' }, ['sexual', 'weapons', 'illegal_goods', 'malware', 'hate']] },
      ],
    },
    action: 'block',
    legalBasis: 'minor-protection policy',
    priority: 5,
  },
  {
    id: 'teen-violence-harassment-flag',
    description: 'Teen tier flags violence/harassment above low severity.',
    when: {
      and: [
        { '==': [{ var: 'tier' }, 'teen'] },
        { in: [{ var: 'category' }, ['violence', 'harassment']] },
        { '>=': [{ var: 'severity' }, 0.4] },
      ],
    },
    action: 'flag',
    priority: 1,
  },
];

/** General / adult tiers — block the genuinely illegal, flag the borderline. */
const GENERAL_RULES: RuleDescriptor[] = [
  {
    id: 'general-illegal-block',
    description: 'Block clearly illegal categories at moderate+ severity for general/adult tiers.',
    when: {
      and: [
        { in: [{ var: 'tier' }, ['general', 'adult']] },
        { in: [{ var: 'category' }, ['weapons', 'illegal_goods', 'malware']] },
        { '>=': [{ var: 'severity' }, 0.5] },
      ],
    },
    action: 'block',
    legalBasis: 'prohibited-conduct policy',
    priority: 5,
  },
  {
    id: 'general-hate-violence-flag',
    description: 'Flag hate/violence/harassment for general tier above moderate severity.',
    when: {
      and: [
        { '==': [{ var: 'tier' }, 'general'] },
        { in: [{ var: 'category' }, ['hate', 'violence', 'harassment']] },
        { '>=': [{ var: 'severity' }, 0.5] },
      ],
    },
    action: 'flag',
    priority: 1,
  },
  {
    id: 'general-sexual-flag',
    description: 'General tier flags adult sexual content (allowed on the adult tier).',
    when: {
      and: [{ '==': [{ var: 'tier' }, 'general'] }, { '==': [{ var: 'category' }, 'sexual'] }],
    },
    action: 'flag',
    priority: 1,
  },
];

/** Compose the default ruleset for a tier. `dev` gets the floor only. */
export function defaultRulesForTier(tier: PolicyTier): RuleDescriptor[] {
  switch (tier) {
    case 'family':
      return [...COMMON_RULES, ...FAMILY_RULES];
    case 'teen':
      return [...COMMON_RULES, ...TEEN_RULES];
    case 'general':
    case 'adult':
      return [...COMMON_RULES, ...GENERAL_RULES];
    case 'dev':
    default:
      return [...COMMON_RULES];
  }
}

export interface BuildConfigOptions {
  tier: PolicyTier;
  /** ISO region / 'EU' / 'GLOBAL'. Default 'GLOBAL' (strictest). */
  region?: string;
  rules?: RuleDescriptor[];
  blocklist?: BlocklistEntry[];
  classifier?: ContentPolicyConfig['classifier'];
  llm?: ContentPolicyConfig['llm'];
}

/**
 * Build a ready-to-use config with sane, founder-anchored defaults: strict for
 * family (lower borderline threshold + always consult the LLM when one is
 * provided), global jurisdiction, hard-stop categories always enforced.
 */
export function buildContentPolicyConfig(opts: BuildConfigOptions): ContentPolicyConfig {
  const tier = opts.tier;
  const strict = tier === 'family' || tier === 'teen';
  return {
    tier,
    jurisdiction: jurisdictionBundle(opts.region ?? 'GLOBAL'),
    rules: opts.rules ?? defaultRulesForTier(tier),
    blocklist: opts.blocklist ?? DEFAULT_BLOCKLIST,
    hardStopCategories: HARD_STOP_CATEGORIES,
    classifier: opts.classifier,
    llm: opts.llm,
    borderlineThreshold: strict ? 0.2 : 0.4,
    alwaysConsultLlm: strict,
  };
}
