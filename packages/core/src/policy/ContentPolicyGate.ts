/**
 * ContentPolicyGate — the shared "what may be SAID" gate for the ecosystem.
 *
 * Runs the four-tier moderation cascade recommended by the 2026-06-13 survey:
 *   Tier 0  deterministic blocklist (hard-stops, sub-ms)
 *   Tier 1  cheap classifier (optional, injected) + data rules
 *   Tier 2  LLM-with-policy for borderline content (optional, injected)
 *   Tier 3  human escalation (the `escalate` action — caller wires HITLManager)
 *
 * It is PROVIDER-AGNOSTIC by design: it does not know or care whether the text
 * came from the Anthropic, OpenAI, or sovereign/Ollama lane. That is what lets
 * the sovereign lane be "allowed but wrapped" — its output is screened by the
 * same gate as everyone else's. Tier-1/Tier-2 model calls are injected hooks so
 * @holoscript/core stays dependency-free; the studio/mcp-server surfaces supply
 * the concrete moderation callables.
 *
 * Every decision is designed to flow into the existing audit ledger
 * ({@link AuditLogger}) as a DSA-style Statement of Reasons via
 * {@link toAuditEventInput} — so ComplianceReporter finally has real input.
 */

import type { AuditEventInput } from '../audit';
import { matchBlocklist, normalizeText } from './blocklist';
import { HARD_STOP_CATEGORIES } from './defaults';
import { matchesRule } from './jsonLogic';
import type {
  Classification,
  ContentPolicyConfig,
  ContentPolicyDecision,
  ContentPolicyInput,
  PolicyAction,
  PolicyEvalFacts,
  RuleDescriptor,
} from './types';

const ACTION_RANK: Record<PolicyAction, number> = { allow: 0, flag: 1, escalate: 2, block: 3 };

function buildFacts(input: ContentPolicyInput, config: ContentPolicyConfig): PolicyEvalFacts {
  const j = config.jurisdiction;
  return {
    text: input.text,
    textLength: input.text.length,
    normalizedText: normalizeText(input.text),
    category: 'none',
    severity: 0,
    tier: config.tier,
    region: j.region,
    aiActTier: j.aiActTier ?? null,
    minAge: j.minAge ?? null,
    dsaApplies: Boolean(j.dsaApplies),
    surface: input.surface,
    direction: input.direction ?? 'output',
    ...(input.facts ?? {}),
  };
}

function tierApplies(rule: RuleDescriptor, tier: string): boolean {
  return !rule.appliesToTiers || rule.appliesToTiers.length === 0 || rule.appliesToTiers.includes(tier as never);
}

function regionApplies(rule: RuleDescriptor, region: string): boolean {
  if (!rule.appliesToRegions || rule.appliesToRegions.length === 0) return true;
  // GLOBAL jurisdiction applies every region-scoped rule (strict union).
  if (region === 'GLOBAL') return true;
  return rule.appliesToRegions.includes(region) || rule.appliesToRegions.includes('GLOBAL');
}

interface RuleOutcome {
  action: PolicyAction;
  rule: RuleDescriptor | null;
}

/** Evaluate all applicable rules and resolve to a single outcome (block > escalate > flag, with allow-listing). */
function applyRules(rules: RuleDescriptor[], facts: PolicyEvalFacts): RuleOutcome {
  let block: RuleDescriptor | null = null;
  let escalate: RuleDescriptor | null = null;
  let flag: RuleDescriptor | null = null;
  let allow: RuleDescriptor | null = null;

  const higher = (cur: RuleDescriptor | null, r: RuleDescriptor): RuleDescriptor =>
    !cur || (r.priority ?? 0) > (cur.priority ?? 0) ? r : cur;

  for (const r of rules) {
    if (!tierApplies(r, facts.tier)) continue;
    if (!regionApplies(r, facts.region)) continue;
    if (!matchesRule(r.when, facts as unknown as Record<string, unknown>)) continue;
    switch (r.action) {
      case 'block':
        block = higher(block, r);
        break;
      case 'escalate':
        escalate = higher(escalate, r);
        break;
      case 'flag':
        flag = higher(flag, r);
        break;
      case 'allow':
        allow = higher(allow, r);
        break;
    }
  }

  if (block) return { action: 'block', rule: block };
  if (escalate) return { action: 'escalate', rule: escalate };
  if (flag && !allow) return { action: 'flag', rule: flag };
  if (allow) return { action: 'allow', rule: allow };
  return { action: 'allow', rule: null };
}

function mergeOutcome(a: RuleOutcome, b: RuleOutcome): RuleOutcome {
  return ACTION_RANK[b.action] > ACTION_RANK[a.action] ? b : a;
}

function statementOfReasons(
  action: PolicyAction,
  classification: Classification,
  rule: RuleDescriptor | null,
  facts: PolicyEvalFacts
): string | null {
  if (action === 'allow') return null;
  const parts = [
    `action=${action}`,
    `category=${classification.category}`,
    `severity=${classification.severity.toFixed(2)}`,
    `tier=${facts.tier}`,
    `region=${facts.region}`,
    `surface=${facts.surface}`,
    `direction=${facts.direction}`,
  ];
  if (rule) {
    parts.push(`rule=${rule.id}`);
    if (rule.legalBasis) parts.push(`basis="${rule.legalBasis}"`);
    if (rule.aiActArticle) parts.push(`aiActArticle=${rule.aiActArticle}`);
  } else {
    parts.push('rule=hard-stop');
  }
  return parts.join(' ');
}

function finalize(
  action: PolicyAction,
  classification: Classification,
  rule: RuleDescriptor | null,
  facts: PolicyEvalFacts,
  config: ContentPolicyConfig,
  decidedAtTier: ContentPolicyDecision['decidedAtTier'],
  timestampMs: number
): ContentPolicyDecision {
  const j = config.jurisdiction;
  const disclosureRequired = Boolean(j.disclosureRequired) && facts.direction === 'output';
  const allowed = action === 'allow' || action === 'flag';
  let reason: string;
  switch (action) {
    case 'block':
      reason = rule
        ? `Blocked by policy rule ${rule.id}: ${rule.description}`
        : `Blocked: hard-stop category "${classification.category}".`;
      break;
    case 'escalate':
      reason = `Held for human review${rule ? ` (rule ${rule.id})` : ''}: category "${classification.category}".`;
      break;
    case 'flag':
      reason = `Allowed but flagged${rule ? ` (rule ${rule.id})` : ''}: category "${classification.category}".`;
      break;
    default:
      reason = 'Allowed: no policy rule matched.';
  }
  return {
    allowed,
    action,
    tier: config.tier,
    category: classification.category,
    severity: classification.severity,
    matchedRuleId: rule?.id ?? null,
    reason,
    classification,
    jurisdiction: j,
    statementOfReasons: statementOfReasons(action, classification, rule, facts),
    disclosureRequired,
    decidedAtTier,
    timestampMs,
  };
}

/**
 * Run only the deterministic tiers (Tier-0 blocklist + data rules). Synchronous,
 * no model calls — safe for hot paths and for callers that have no providers
 * wired. The sovereign/Ollama lane can use this as a first-pass even before a
 * Tier-2 LLM is available.
 */
export function evaluateContentPolicySync(
  input: ContentPolicyInput,
  config: ContentPolicyConfig
): ContentPolicyDecision {
  const timestampMs = Date.now();
  const facts = buildFacts(input, config);
  const hardStops = config.hardStopCategories ?? HARD_STOP_CATEGORIES;
  let classification: Classification = { category: 'none', severity: 0, source: 'none' };

  // Tier 0 — blocklist
  if (config.blocklist && config.blocklist.length) {
    const hit = matchBlocklist(input.text, config.blocklist);
    if (hit) {
      classification = { category: hit.category, severity: hit.severity, source: 'blocklist', rationale: hit.rationale };
      if (hit.hardStop || hardStops.includes(hit.category)) {
        const f = { ...facts, category: hit.category, severity: hit.severity };
        return finalize('block', classification, null, f, config, 0, timestampMs);
      }
    }
  }

  const facts1 = { ...facts, category: classification.category, severity: classification.severity };
  const outcome = applyRules(config.rules, facts1);
  const tier: ContentPolicyDecision['decidedAtTier'] = outcome.action === 'escalate' ? 3 : outcome.action === 'allow' ? -1 : 1;
  return finalize(outcome.action, classification, outcome.rule, facts1, config, tier, timestampMs);
}

/**
 * Full async cascade: Tier-0 blocklist, Tier-1 classifier + data rules, Tier-2
 * LLM-with-policy for borderline content, Tier-3 human escalation. Hard-stop
 * categories short-circuit to a block at whatever tier first detects them.
 */
export async function evaluateContentPolicy(
  input: ContentPolicyInput,
  config: ContentPolicyConfig
): Promise<ContentPolicyDecision> {
  const timestampMs = Date.now();
  const facts0 = buildFacts(input, config);
  const hardStops = config.hardStopCategories ?? HARD_STOP_CATEGORIES;
  let classification: Classification = { category: 'none', severity: 0, source: 'none' };

  // ── Tier 0: deterministic blocklist ──
  if (config.blocklist && config.blocklist.length) {
    const hit = matchBlocklist(input.text, config.blocklist);
    if (hit) {
      classification = { category: hit.category, severity: hit.severity, source: 'blocklist', rationale: hit.rationale };
      if (hit.hardStop || hardStops.includes(hit.category)) {
        const f = { ...facts0, category: hit.category, severity: hit.severity };
        return finalize('block', classification, null, f, config, 0, timestampMs);
      }
    }
  }

  let facts = { ...facts0, category: classification.category, severity: classification.severity };

  // ── Tier 1: cheap classifier (optional) ──
  if (config.classifier) {
    const c = await config.classifier(input.text, facts);
    if (c && c.severity >= classification.severity) {
      classification = c;
      facts = { ...facts, category: c.category, severity: c.severity };
      if (hardStops.includes(c.category)) {
        return finalize('block', classification, null, facts, config, 1, timestampMs);
      }
    }
  }

  // ── Tier 1: data rules ──
  let outcome = applyRules(config.rules, facts);
  if (outcome.action === 'block') {
    return finalize('block', classification, outcome.rule, facts, config, 1, timestampMs);
  }

  // ── Tier 2: LLM-with-policy (only for borderline / non-clean content) ──
  const consultLlm =
    !!config.llm &&
    (config.alwaysConsultLlm === true ||
      classification.category !== 'none' ||
      classification.severity >= (config.borderlineThreshold ?? 0.3));
  if (config.llm && consultLlm) {
    const verdict = await config.llm(input.text, facts);
    if (verdict.flagged && verdict.categories.length > 0) {
      const cat = verdict.categories[0];
      if (verdict.severity >= classification.severity) {
        classification = { category: cat, severity: verdict.severity, source: 'llm', rationale: verdict.rationale };
        facts = { ...facts, category: cat, severity: verdict.severity };
      }
      if (hardStops.includes(cat)) {
        return finalize('block', classification, null, facts, config, 2, timestampMs);
      }
      const llmOutcome = applyRules(config.rules, facts);
      outcome = mergeOutcome(outcome, llmOutcome);
      if (outcome.action === 'block') {
        return finalize('block', classification, outcome.rule, facts, config, 2, timestampMs);
      }
    }
  }

  // ── Resolve the held outcome ──
  const decidedAtTier: ContentPolicyDecision['decidedAtTier'] =
    outcome.action === 'allow' ? -1 : outcome.action === 'escalate' ? 3 : classification.source === 'llm' ? 2 : 1;
  return finalize(outcome.action, classification, outcome.rule, facts, config, decidedAtTier, timestampMs);
}

/** Context the audit ledger needs that the decision itself does not carry. */
export interface AuditContext {
  tenantId: string;
  actorId: string;
  actorType?: 'user' | 'agent' | 'system';
  surface?: string;
  resourceId?: string;
  clientIp?: string;
}

/**
 * Map a gate decision to an {@link AuditEventInput} for the existing AuditLogger.
 * Produces a DSA-style machine-readable Statement-of-Reasons record. Pipe the
 * result through `auditLogger.log(...)` at the call site.
 */
export function toAuditEventInput(decision: ContentPolicyDecision, ctx: AuditContext): AuditEventInput {
  const outcome: AuditEventInput['outcome'] =
    decision.action === 'block' || decision.action === 'escalate' ? 'denied' : 'success';
  return {
    tenantId: ctx.tenantId,
    actorId: ctx.actorId,
    actorType: ctx.actorType ?? 'agent',
    action: `content_policy:${decision.action}`,
    resource: 'content',
    resourceId: ctx.resourceId,
    outcome,
    clientIp: ctx.clientIp,
    metadata: {
      surface: ctx.surface,
      category: decision.category,
      severity: decision.severity,
      tier: decision.tier,
      region: decision.jurisdiction.region,
      matchedRuleId: decision.matchedRuleId,
      decidedAtTier: decision.decidedAtTier,
      disclosureRequired: decision.disclosureRequired,
      statementOfReasons: decision.statementOfReasons,
      _compliance: 'dsa-statement-of-reasons',
    },
  };
}
