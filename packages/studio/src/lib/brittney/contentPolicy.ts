/**
 * Brittney output content-policy screener.
 *
 * Wires the provider-agnostic ContentPolicyGate (@holoscript/core/policy) into
 * Brittney's streaming response so EVERY lane's output — Anthropic, Ollama, or
 * the sovereign serving fleet — is screened identically before it reaches the
 * client (founder directive 2026-06-13, P.013 "what may be SAID").
 *
 * Streaming correctness — the block-before-deliver contract:
 *   A flagged span must never reach the client. But screening every token on the
 *   full transcript is O(n²) and we don't want to buffer the whole response. So
 *   the screener uses a SLIDING HOLDBACK: it releases all accumulated text except
 *   a short tail, and only releases that tail once the next screen confirms it is
 *   clean. A hard-stop phrase that completes inside the held-back tail is caught
 *   on the next screen and never escapes. `flush()` releases the remaining tail
 *   at a round boundary / end-of-stream once it has passed a final screen.
 *
 * Only the deterministic tiers run on the hot path (`evaluateContentPolicySync`:
 * Tier-0 blocklist + data rules, sub-ms, no model calls). Tier-1/Tier-2 model
 * cascades, if ever wired, belong on the end-of-stream full screen, not per-token.
 *
 * @module lib/brittney/contentPolicy
 */

import {
  buildContentPolicyConfig,
  evaluateContentPolicySync,
  toAuditEventInput,
  type ContentPolicyConfig,
  type ContentPolicyDecision,
  type PolicyAction,
  type PolicyTier,
} from '@holoscript/core/policy';

/**
 * Characters held back behind the last clean screen until the next screen clears
 * them. Must exceed (longest hard-stop phrase + SCREEN_STRIDE) so a dangerous
 * phrase completing across a release boundary is always caught before its head
 * escapes. 80 gives a ~48-char margin over the longest default blocklist phrase.
 */
const HOLDBACK_CHARS = 80;
/** Minimum new text before re-screening — bounds the O(n²) cost on long replies. */
const SCREEN_STRIDE = 32;

const ACTION_RANK: Record<PolicyAction, number> = { allow: 0, flag: 1, escalate: 2, block: 3 };

/**
 * Resolve the policy config for the Brittney surface. Defaults to the `general`
 * tier (a creator/dev assistant — not the family/HoloLand surface, which should
 * pass `tier: 'family'`). Hard-stop categories (csam/terrorism/sexual_minors)
 * block on every tier regardless. Tier and region are env-overridable so a
 * deployment can tighten without a code change.
 */
export function resolveBrittneyPolicyConfig(
  overrides?: { tier?: PolicyTier; region?: string }
): ContentPolicyConfig {
  const tier = overrides?.tier ?? ((process.env.BRITTNEY_POLICY_TIER as PolicyTier) || 'general');
  const region = overrides?.region ?? (process.env.BRITTNEY_POLICY_REGION || 'GLOBAL');
  return buildContentPolicyConfig({ tier, region });
}

/** Result of feeding a delta (or flushing) to the screener. */
export interface ScreenStep {
  /** Text that is now screened-clean and safe to deliver to the client. */
  release: string;
  /**
   * A newly-surfaced non-`allow` decision (only when the action escalated beyond
   * what was already reported), else null. `flag` is informational (text still
   * flows); `escalate`/`block` mean the stream is now blocked.
   */
  decision: ContentPolicyDecision | null;
  /** True once an `escalate`/`block` decision has fired — no further text is released. */
  blocked: boolean;
}

export interface OutputScreener {
  /** Feed the next model text delta. Returns the text that is now safe to send. */
  feed(delta: string): ScreenStep;
  /** Release the held-back tail at a round boundary / end-of-stream (final screen). */
  flush(): ScreenStep;
  /** Text already released to the client (the safe prefix) — used to redact on block. */
  readonly deliveredText: string;
  /** Whether the stream has been policy-blocked. */
  readonly blocked: boolean;
}

/**
 * Create a streaming output screener bound to a policy config. Stateful: feed
 * each model text delta in order; send only `release`; on `blocked` stop the
 * stream and surface `decision`.
 */
export function createOutputScreener(
  config: ContentPolicyConfig,
  surface = 'brittney'
): OutputScreener {
  let accumulated = '';
  let delivered = 0;
  let lastScreenedLen = -1;
  let reportedRank = 0; // highest action rank already surfaced to the caller
  let isBlocked = false;

  function screen(flush: boolean): ScreenStep {
    if (isBlocked) return { release: '', decision: null, blocked: true };

    // Throttle: only re-screen once enough new text arrived, unless flushing.
    const grew = accumulated.length - lastScreenedLen;
    if (!flush && grew < SCREEN_STRIDE) return { release: '', decision: null, blocked: false };
    lastScreenedLen = accumulated.length;

    const decision = evaluateContentPolicySync(
      { text: accumulated, surface, direction: 'output' },
      config
    );
    const rank = ACTION_RANK[decision.action];
    const surfaced = rank > reportedRank ? decision : null;
    if (surfaced) reportedRank = rank;

    if (!decision.allowed) {
      // block | escalate — withhold everything not already delivered.
      isBlocked = true;
      return { release: '', decision: surfaced, blocked: true };
    }

    // allow | flag — release up to a holdback tail (or all of it on flush).
    const ceiling = flush ? accumulated.length : Math.max(delivered, accumulated.length - HOLDBACK_CHARS);
    const release = accumulated.slice(delivered, ceiling);
    delivered = ceiling;
    return { release, decision: surfaced, blocked: false };
  }

  return {
    feed(delta: string): ScreenStep {
      accumulated += delta;
      return screen(false);
    },
    flush(): ScreenStep {
      return screen(true);
    },
    get deliveredText(): string {
      return accumulated.slice(0, delivered);
    },
    get blocked(): boolean {
      return isBlocked;
    },
  };
}

/**
 * Build a DSA-style audit record for a policy decision. The studio surface has no
 * AuditLogger sink wired yet (a separate task), so callers log this structurally;
 * the shape is ledger-ready via {@link toAuditEventInput} for when the sink lands.
 */
export function buildPolicyAuditEvent(
  decision: ContentPolicyDecision,
  ctx: { tenantId: string; resourceId?: string }
): ReturnType<typeof toAuditEventInput> {
  return toAuditEventInput(decision, {
    tenantId: ctx.tenantId,
    actorId: 'brittney',
    actorType: 'agent',
    surface: 'brittney',
    resourceId: ctx.resourceId,
  });
}

/**
 * Screen a user input message synchronously. Returns the decision; callers
 * should block the request when `!decision.allowed`.
 */
export function screenInputMessage(
  text: string,
  config?: ContentPolicyConfig
): ContentPolicyDecision {
  const cfg = config ?? resolveBrittneyPolicyConfig();
  return evaluateContentPolicySync({ text, surface: 'brittney', direction: 'input' }, cfg);
}

/** SSE event name for a decision: blocking decisions get a distinct event. */
export function policyEventType(decision: ContentPolicyDecision): 'policy_blocked' | 'policy_decision' {
  return decision.allowed ? 'policy_decision' : 'policy_blocked';
}

/** Compact, client-renderable payload for a policy decision SSE event. */
export function policyEventPayload(decision: ContentPolicyDecision): Record<string, unknown> {
  return {
    action: decision.action,
    category: decision.category,
    severity: decision.severity,
    reason: decision.reason,
    statementOfReasons: decision.statementOfReasons,
    disclosureRequired: decision.disclosureRequired,
    decidedAtTier: decision.decidedAtTier,
    matchedRuleId: decision.matchedRuleId,
  };
}
