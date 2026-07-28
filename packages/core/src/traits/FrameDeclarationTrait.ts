/**
 * FrameDeclarationTrait
 *
 * Implements the @frame_declaration annotation for .hsplus brain declarations.
 * Agents explicitly declare their epistemic scope at construction time; the
 * runtime detects boundary violations and emits a traceable error instead of
 * allowing silent hallucination through frame edges.
 *
 * Syntax (.hsplus):
 *
 *   @frame_declaration {
 *     domain: "holoscript-language"
 *     horizon: "2026-06"
 *     capability_tier: 2
 *     trust_tier: 1
 *     allowed_tools: ["holo_query_codebase", "holo_memory_recall"]
 *     denied_domains: ["finance", "medical-advice"]
 *   }
 *
 * Fields:
 *   domain          — primary knowledge domain; "*" = unrestricted
 *   horizon         — temporal knowledge cutoff (ISO-8601 prefix: YYYY-MM or YYYY-MM-DD)
 *   capability_tier — 0-3 matching D.051 sovereign-seat hierarchy (T0 > T1 > T2 > T3)
 *   trust_tier      — 0-3 trust level; actions requiring higher tiers are blocked
 *   allowed_tools   — explicit allowlist of MCP tool names; absent = all tools allowed
 *   denied_domains  — string tags an agent MUST NOT act on
 *
 * Events emitted:
 *   frame_declared          { node, frame }
 *   frame_violation         { node, violation_type, detail, tool?, domain? }
 *   frame_tool_blocked      { node, tool, reason }
 *   frame_domain_blocked    { node, domain, reason }
 *   frame_horizon_exceeded  { node, claimed_date, horizon }
 *   frame_tier_exceeded     { node, required_tier, declared_tier }
 *
 * @version 1.0.0
 * @D101-compatible pure language work
 */

import type { FrameDeclarationContract } from '@holoscript/agent-protocol';
import type { HSPlusNode } from './TraitTypes';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Trait context — minimal interface for emitting events */
interface TraitCtx {
  emit(event: string, data: Record<string, unknown>): void;
}

/** The declared frame of reference carried by a brain */
export interface FrameDeclaration extends FrameDeclarationContract {
  /** Primary knowledge domain. "*" means unrestricted. */
  domain: string;
  /**
   * Temporal knowledge cutoff expressed as an ISO-8601 date prefix.
   * Examples: "2026-06", "2026-06-21", "2025".
   * Requests asserting knowledge of events AFTER this date are violations.
   */
  horizon: string;
  /**
   * Capability tier matching the D.051 sovereign-seat hierarchy.
   * T0=sovereign, T1=trusted, T2=standard, T3=restricted.
   * Default: 2 (standard).
   */
  capability_tier: 0 | 1 | 2 | 3;
  /**
   * Trust tier for inbound requests.
   * Actions requiring higher trust are blocked.
   * Default: 2.
   */
  trust_tier: 0 | 1 | 2 | 3;
  /**
   * Explicit allowlist of MCP tool names this agent may invoke.
   * Empty array or absent means all tools are permitted.
   */
  allowed_tools: string[];
  /**
   * Domains this agent MUST NOT act on.
   * Checked against `domain` tags in tool call payloads.
   */
  denied_domains: string[];
}

/** Config block from @frame_declaration { ... } */
export type FrameDeclarationConfig = Partial<FrameDeclaration>;

/** Violation categories */
export type FrameViolationType =
  | 'tool_not_allowed'
  | 'domain_denied'
  | 'horizon_exceeded'
  | 'tier_exceeded'
  | 'undeclared_frame';

/** Result of a boundary check */
export interface FrameCheckResult {
  allowed: boolean;
  violation_type?: FrameViolationType;
  detail?: string;
}

/** Node augmented with frame-declaration state */
type FrameNode = HSPlusNode & { __frameDeclaration?: FrameDeclaration };

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_FRAME: FrameDeclaration = {
  domain: '*',
  horizon: '',
  capability_tier: 2,
  trust_tier: 2,
  allowed_tools: [],
  denied_domains: [],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Parse a loose horizon string into a Date for comparison.
 * "2026-06" → June 2026 (last day of month as ceiling).
 * "2026-06-21" → exact date.
 * "" | "*" → null (no horizon).
 */
function parseHorizon(h: string): Date | null {
  if (!h || h === '*') return null;
  const parts = h.split('-').map(Number);
  if (parts.length === 1) {
    // "2026" → end of year (UTC ceiling: Dec 31 23:59:59.999 UTC)
    return new Date(Date.UTC(parts[0], 11, 31, 23, 59, 59, 999));
  }
  if (parts.length === 2) {
    // "2026-06" → last day of month (UTC ceiling)
    // Date.UTC(year, month, 0) = last day of month-1 (month is 0-indexed + 1 = same month's last day)
    const lastDayMs = Date.UTC(parts[0], parts[1], 0, 23, 59, 59, 999); // day=0 → last day of parts[1]-1+1 = parts[1]
    return new Date(lastDayMs);
  }
  // "2026-06-21" → end of that UTC day
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 23, 59, 59, 999));
}

/**
 * Validate and coerce a raw config object from the .hsplus parser into a
 * well-typed FrameDeclaration, applying defaults for missing fields.
 */
function coerceConfig(raw: Record<string, unknown>): FrameDeclaration {
  const domain = typeof raw.domain === 'string' ? raw.domain : DEFAULT_FRAME.domain;
  const horizon = typeof raw.horizon === 'string' ? raw.horizon : DEFAULT_FRAME.horizon;

  let capability_tier = DEFAULT_FRAME.capability_tier;
  const rawCT = raw.capability_tier;
  if (rawCT === 0 || rawCT === 1 || rawCT === 2 || rawCT === 3) {
    capability_tier = rawCT;
  }

  let trust_tier = DEFAULT_FRAME.trust_tier;
  const rawTT = raw.trust_tier;
  if (rawTT === 0 || rawTT === 1 || rawTT === 2 || rawTT === 3) {
    trust_tier = rawTT;
  }

  const allowed_tools = Array.isArray(raw.allowed_tools)
    ? (raw.allowed_tools as unknown[]).filter((t): t is string => typeof t === 'string')
    : [];

  const denied_domains = Array.isArray(raw.denied_domains)
    ? (raw.denied_domains as unknown[]).filter((d): d is string => typeof d === 'string')
    : [];

  return { domain, horizon, capability_tier, trust_tier, allowed_tools, denied_domains };
}

// ─── Boundary Check API ───────────────────────────────────────────────────────

/**
 * Check whether a tool call is permitted by the declared frame.
 *
 * Call this at tool-dispatch time, BEFORE the MCP call is made.
 * Produces a traceable FrameCheckResult; callers should emit
 * 'frame_tool_blocked' when allowed === false.
 */
export function checkToolAllowed(
  frame: FrameDeclaration,
  toolName: string,
  domainTag?: string
): FrameCheckResult {
  // Denied domain check takes precedence
  if (domainTag && frame.denied_domains.includes(domainTag)) {
    return {
      allowed: false,
      violation_type: 'domain_denied',
      detail: `Tool '${toolName}' operates on denied domain '${domainTag}'`,
    };
  }

  // Explicit allowlist check (empty = all allowed)
  if (frame.allowed_tools.length > 0 && !frame.allowed_tools.includes(toolName)) {
    return {
      allowed: false,
      violation_type: 'tool_not_allowed',
      detail: `Tool '${toolName}' not in allowed_tools: [${frame.allowed_tools.join(', ')}]`,
    };
  }

  return { allowed: true };
}

/**
 * Check whether a claimed knowledge date falls within the declared horizon.
 *
 * Call when a tool response or agent reasoning asserts a fact dated after
 * the declared horizon cutoff.
 */
export function checkHorizon(frame: FrameDeclaration, claimedDate: string): FrameCheckResult {
  const horizon = parseHorizon(frame.horizon);
  if (!horizon) return { allowed: true }; // no horizon set = unrestricted

  const claimed = new Date(claimedDate);
  if (isNaN(claimed.getTime())) return { allowed: true }; // unparseable = skip check

  if (claimed > horizon) {
    return {
      allowed: false,
      violation_type: 'horizon_exceeded',
      detail: `Claimed date ${claimedDate} exceeds horizon ${frame.horizon}`,
    };
  }
  return { allowed: true };
}

/**
 * Check whether a required tier is within the declared frame's tier.
 * Higher numbers = lower privilege (T0=sovereign > T3=restricted).
 */
export function checkTier(frame: FrameDeclaration, requiredTier: 0 | 1 | 2 | 3): FrameCheckResult {
  if (frame.capability_tier > requiredTier) {
    return {
      allowed: false,
      violation_type: 'tier_exceeded',
      detail: `Required capability_tier ${requiredTier} but agent is tier ${frame.capability_tier}`,
    };
  }
  return { allowed: true };
}

// ─── Handler Object ───────────────────────────────────────────────────────────

export const frameDeclarationHandler = {
  name: 'frame_declaration',
  defaultConfig: DEFAULT_FRAME as FrameDeclarationConfig,

  /**
   * Called when @frame_declaration is attached to a brain node.
   * Coerces the config, stores it on the node, and emits 'frame_declared'.
   */
  onAttach(node: FrameNode, config: FrameDeclarationConfig, ctx: TraitCtx): void {
    const frame = coerceConfig(config as Record<string, unknown>);
    node.__frameDeclaration = frame;

    ctx.emit('frame_declared', {
      node,
      frame,
      summary: `domain=${frame.domain} horizon=${frame.horizon || 'none'} cap_tier=${frame.capability_tier} trust_tier=${frame.trust_tier} tools=${frame.allowed_tools.length === 0 ? '*' : frame.allowed_tools.join(',')} denied=${frame.denied_domains.join(',') || 'none'}`,
    });
  },

  onDetach(node: FrameNode, _config: FrameDeclarationConfig, _ctx: TraitCtx): void {
    delete node.__frameDeclaration;
  },

  /**
   * Event handler for runtime boundary enforcement.
   *
   * Events consumed:
   *   frame_check_tool   { tool: string, domain_tag?: string }
   *   frame_check_horizon { claimed_date: string }
   *   frame_check_tier   { required_tier: 0|1|2|3 }
   *
   * Emits frame_tool_blocked / frame_domain_blocked / frame_horizon_exceeded /
   * frame_tier_exceeded when violations are detected.
   */
  onEvent(
    node: FrameNode,
    _config: FrameDeclarationConfig,
    ctx: TraitCtx,
    event: { type: string; payload?: unknown }
  ): void {
    const frame: FrameDeclaration | undefined = node.__frameDeclaration;
    if (!frame) {
      // Node has frame_declaration trait attached but state is missing — emit diagnostic
      ctx.emit('frame_violation', {
        node,
        violation_type: 'undeclared_frame' satisfies FrameViolationType,
        detail: 'frame_declaration trait is attached but __frameDeclaration state is missing',
      });
      return;
    }

    const payload = event.payload as Record<string, unknown> | undefined;

    switch (event.type) {
      case 'frame_check_tool': {
        const toolName = typeof payload?.tool === 'string' ? payload.tool : '';
        const domainTag = typeof payload?.domain_tag === 'string' ? payload.domain_tag : undefined;
        if (!toolName) break;

        const result = checkToolAllowed(frame, toolName, domainTag);
        if (!result.allowed) {
          if (result.violation_type === 'domain_denied') {
            ctx.emit('frame_domain_blocked', {
              node,
              domain: domainTag,
              tool: toolName,
              reason: result.detail,
            });
          } else {
            ctx.emit('frame_tool_blocked', { node, tool: toolName, reason: result.detail });
          }
          ctx.emit('frame_violation', {
            node,
            violation_type: result.violation_type,
            tool: toolName,
            detail: result.detail,
          });
        }
        break;
      }

      case 'frame_check_horizon': {
        const claimedDate = typeof payload?.claimed_date === 'string' ? payload.claimed_date : '';
        if (!claimedDate) break;

        const result = checkHorizon(frame, claimedDate);
        if (!result.allowed) {
          ctx.emit('frame_horizon_exceeded', {
            node,
            claimed_date: claimedDate,
            horizon: frame.horizon,
            reason: result.detail,
          });
          ctx.emit('frame_violation', {
            node,
            violation_type: result.violation_type,
            claimed_date: claimedDate,
            detail: result.detail,
          });
        }
        break;
      }

      case 'frame_check_tier': {
        const requiredTier = payload?.required_tier;
        if (requiredTier !== 0 && requiredTier !== 1 && requiredTier !== 2 && requiredTier !== 3)
          break;

        const result = checkTier(frame, requiredTier);
        if (!result.allowed) {
          ctx.emit('frame_tier_exceeded', {
            node,
            required_tier: requiredTier,
            declared_tier: frame.capability_tier,
            reason: result.detail,
          });
          ctx.emit('frame_violation', {
            node,
            violation_type: result.violation_type,
            required_tier: requiredTier,
            detail: result.detail,
          });
        }
        break;
      }

      default:
        break;
    }
  },
} as const;

// ─── Re-export coercer for use by the TS parser ───────────────────────────────

export { coerceConfig as coerceFrameDeclarationConfig };
