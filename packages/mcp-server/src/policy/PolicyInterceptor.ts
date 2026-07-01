/**
 * PolicyInterceptor — CG-098 tracer bullet.
 *
 * Gates a narrow MCP tool family (`holo_secrets_grant`) before execution
 * against a versioned `.holo`/`.hsplus` PolicyPackTrait fixture, and emits a
 * compact policy receipt linked to the tool-call id.
 *
 * Source: research/2026-06-28_openclaw-nemoclaw-harvest.md (ai-ecosystem repo)
 * "The strongest NemoClaw lesson maps directly to CG-098. Add
 * PolicyInterceptor in the MCP/server dispatch path:
 *   - Input: caller identity, tool name, resource, tenant/workspace
 *     context, provider lane, and declared capability.
 *   - Output: allow, deny, audit, or operator approval required.
 *   - Policy source: versioned .holo/.hsplus PolicyPackTrait, not ad hoc
 *     JSON.
 *   - Receipt: every decision writes a compact policy receipt linked to
 *     the tool execution receipt."
 *
 * Non-goals (explicit, per the board task):
 *   - Does NOT adopt OpenClaw/NemoClaw as a runtime.
 *   - Does NOT pass host credentials into any sandbox.
 *   - Does NOT wire public channels — this module only gates the existing
 *     `holo_secrets_grant` local dispatch path.
 *
 * Scope discipline: this gates ONE tool family (secrets-broker grants),
 * additively alongside the existing `gateSecretsBrokerTool` capability gate
 * in secrets-broker-handler.ts. It does not replace the Triple-Gate
 * pattern (security/gates.ts) or the OAuth scope gate (security/tool-scopes.ts)
 * — those remain the HTTP-transport authorization layer. PolicyInterceptor
 * is the declarative-policy-pack layer CG-098 asks for, proven end-to-end on
 * one tool family first.
 */

import { readFileSync } from 'fs';
import { createHash } from 'crypto';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { HoloScriptPlusParser } from '@holoscript/core';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Types ────────────────────────────────────────────────────────────────

export type PolicyDecisionKind = 'allow' | 'deny' | 'audit' | 'approval_required';

export interface PolicyRule {
  rule_id: string;
  tool: string;
  decision: PolicyDecisionKind;
  reason: string;
  /** Match if the caller's agentId is in this list. */
  when_agent_in?: string[];
  /** Match if args.capabilityRef starts with this prefix. */
  when_capability_ref_prefix?: string;
}

export interface PolicyPack {
  policy_id: string;
  schema_version: string;
  rules: PolicyRule[];
  default_decision: PolicyDecisionKind;
}

export interface PolicyInterceptorRequest {
  /** Caller identity (agent id, wallet, or session handle). */
  callerId: string;
  /** MCP tool name being invoked. */
  tool: string;
  /** Resource the tool acts on (free-form — e.g. a secretRef or capabilityRef). */
  resource: string;
  /** Tenant/workspace context, when known. */
  tenantId?: string;
  /** Provider lane (e.g. 'stdio', 'http', 'holomesh'). */
  lane?: string;
  /** Raw tool arguments, used for rule matching (e.g. capabilityRef prefix). */
  args?: Record<string, unknown>;
  /** Tool-call id this decision should be linked to in the receipt. */
  toolCallId: string;
}

export interface PolicyDecision {
  decision: PolicyDecisionKind;
  policyId: string;
  ruleId: string | null;
  reason: string;
}

export interface PolicyReceipt {
  receiptId: string;
  schemaVersion: '1.0.0';
  recordedAt: string; // ISO-8601
  policyId: string;
  decision: PolicyDecisionKind;
  caller: string;
  action: string; // tool name
  resource: string;
  reason: string;
  toolCallId: string; // links this receipt to the tool execution receipt
}

// ── Policy pack loading ──────────────────────────────────────────────────

const DEFAULT_FIXTURE_PATH = join(__dirname, 'policy-pack.holo.hsplus');

let cachedPack: PolicyPack | null = null;
let cachedFixturePath: string | null = null;

/**
 * Parse a `.holo`/`.hsplus` PolicyPackTrait fixture with the real
 * HoloScriptPlusParser (not a hand-rolled JSON reader) and extract the
 * `@policy_pack { ... }` trait directive's config.
 *
 * Throws if the fixture fails to parse or does not carry a `policy_pack`
 * trait directive — a broken/malformed policy source must fail loud, not
 * silently fall back to an implicit allow-all.
 */
export function loadPolicyPack(fixturePath: string = DEFAULT_FIXTURE_PATH): PolicyPack {
  if (cachedPack && cachedFixturePath === fixturePath) return cachedPack;

  const source = readFileSync(fixturePath, 'utf-8');
  const parser = new HoloScriptPlusParser();
  const result = parser.parse(source);

  if (result.errors && result.errors.length > 0) {
    const first = result.errors[0] as { message?: string; line?: number };
    throw new Error(
      `PolicyInterceptor: fixture ${fixturePath} failed to parse (${result.errors.length} error(s)): ` +
        `${first.message ?? 'unknown error'} at line ${first.line ?? '?'}`
    );
  }

  const trait = findPolicyPackTrait(result.ast);
  if (!trait) {
    throw new Error(
      `PolicyInterceptor: fixture ${fixturePath} parsed but no @policy_pack trait directive found`
    );
  }

  const config = trait.config as Record<string, unknown>;
  const pack: PolicyPack = {
    policy_id: String(config.policy_id ?? 'unknown'),
    schema_version: String(config.schema_version ?? '0.0.0'),
    rules: Array.isArray(config.rules) ? (config.rules as PolicyRule[]) : [],
    default_decision: (config.default_decision as PolicyDecisionKind) ?? 'allow',
  };

  cachedPack = pack;
  cachedFixturePath = fixturePath;
  return pack;
}

/** Test-only: clear the module-level policy pack cache. */
export function __resetPolicyPackCacheForTests(): void {
  cachedPack = null;
  cachedFixturePath = null;
}

interface ParsedTraitDirective {
  type: 'trait';
  name: string;
  config: Record<string, unknown>;
}

function findPolicyPackTrait(node: unknown, depth = 0): ParsedTraitDirective | null {
  if (!node || typeof node !== 'object' || depth > 12) return null;
  const n = node as {
    directives?: Array<{ type?: string; name?: string; config?: unknown }>;
    children?: unknown[];
    compositions?: unknown[];
  };

  const directives = n.directives ?? [];
  for (const d of directives) {
    if (d && d.type === 'trait' && d.name === 'policy_pack') {
      return d as ParsedTraitDirective;
    }
  }

  const branches = [...(n.children ?? []), ...(n.compositions ?? [])];
  for (const child of branches) {
    const found = findPolicyPackTrait(child, depth + 1);
    if (found) return found;
  }

  return null;
}

// ── Decision evaluation (pure) ───────────────────────────────────────────

/**
 * Evaluate a PolicyInterceptorRequest against a loaded PolicyPack.
 *
 * Pure function — no I/O, no receipt emission. First matching rule wins
 * (rules are evaluated in fixture order); falls back to
 * `pack.default_decision` when no rule matches or the tool has no rules.
 */
export function evaluatePolicy(pack: PolicyPack, request: PolicyInterceptorRequest): PolicyDecision {
  const toolRules = pack.rules.filter((r) => r.tool === request.tool);

  for (const rule of toolRules) {
    if (rule.when_agent_in && rule.when_agent_in.includes(request.callerId)) {
      return { decision: rule.decision, policyId: pack.policy_id, ruleId: rule.rule_id, reason: rule.reason };
    }
    if (rule.when_capability_ref_prefix) {
      const capRef = String(request.args?.capabilityRef ?? '');
      if (capRef.startsWith(rule.when_capability_ref_prefix)) {
        return { decision: rule.decision, policyId: pack.policy_id, ruleId: rule.rule_id, reason: rule.reason };
      }
    }
  }

  return {
    decision: pack.default_decision,
    policyId: pack.policy_id,
    ruleId: null,
    reason: 'no_rule_matched_default_decision',
  };
}

// ── Receipt emission ─────────────────────────────────────────────────────

/**
 * Build a compact policy receipt for a decision, linked to the tool-call id
 * (`toolCallId`) so it can be joined against the corresponding tool
 * execution receipt by callers that persist both.
 */
export function buildPolicyReceipt(
  request: PolicyInterceptorRequest,
  decision: PolicyDecision
): PolicyReceipt {
  const recordedAt = new Date().toISOString();
  const base = {
    schemaVersion: '1.0.0' as const,
    recordedAt,
    policyId: decision.policyId,
    decision: decision.decision,
    caller: request.callerId,
    action: request.tool,
    resource: request.resource,
    reason: decision.reason,
    toolCallId: request.toolCallId,
  };
  const canonical = JSON.stringify(base, Object.keys(base).sort());
  const hash = createHash('sha256').update(canonical).digest('hex').slice(0, 16);
  return { receiptId: `policy_${recordedAt.replace(/[:.]/g, '-')}_${hash}`, ...base };
}

// ── Public entry point ────────────────────────────────────────────────────

export interface PolicyInterceptorResult {
  decision: PolicyDecision;
  receipt: PolicyReceipt;
}

/**
 * Load the policy pack (cached after first call), evaluate the request, and
 * build a receipt. This is the single function the MCP dispatch path calls.
 */
export function interceptToolCall(
  request: PolicyInterceptorRequest,
  fixturePath?: string
): PolicyInterceptorResult {
  const pack = loadPolicyPack(fixturePath);
  const decision = evaluatePolicy(pack, request);
  const receipt = buildPolicyReceipt(request, decision);
  return { decision, receipt };
}
