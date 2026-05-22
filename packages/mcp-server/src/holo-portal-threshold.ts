/**
 * HoloPortal Threshold — representation negotiation + portal-entry receipt.
 *
 * The HoloGate threshold is where the portal decides WHAT representation an
 * entrant receives and records the fact of entry as an auditable receipt.
 *
 *  - cbxy (A2A handshake): an entrant that presents an A2A Agent Card is an
 *    agent → served the SEMANTIC lane (scene-graph + trait deltas). An entrant
 *    with no card is a human → served the WEBXR lane (rendered pixels, today's
 *    HoloTunnel byte path). Representation is a function of who is knocking.
 *
 *  - svo2 (portal-entry.v1 receipt): every entry emits a receipt recording the
 *    entrant, the representation served, the granted spatial scope, and the
 *    entry/exit world-state hashes (rewind anchors via rewind_world_state). The
 *    agent lane is natively auditable; this is the receipt that proves it.
 *
 * Pure module: no MCP/IO deps beyond node:crypto hashing. Composes the
 * HoloDoor spatial policy (holo-portal-intent.ts) at the threshold.
 *
 * Board tasks: task_…cbxy (handshake), task_…svo2 (receipt).
 */

import { createHash } from 'node:crypto';
import type { SpatialPolicy, SpatialScope } from './holo-portal-intent.js';

export type PortalRepresentation = 'semantic' | 'webxr';

/** Minimal structural shape of an A2A Agent Card — presence ⇒ the entrant is an agent. */
export interface A2AAgentCardLike {
  id: string;
  name?: string;
  capabilities?: unknown;
  skills?: unknown[];
}

export interface ThresholdConnection {
  worldId: string;
  /** A2A Agent Card if the entrant presented one. Present ⇒ agent ⇒ semantic lane. */
  agentCard?: A2AAgentCardLike | null;
  /** Stable id of the entrant (agent id or human session id). */
  entrantId?: string;
  /** Scope the entrant requests; clamped to policy.allowedScopes / defaultScope. */
  requestedScope?: SpatialScope;
  /** HoloTunnel tunnelId backing this entry, if any. */
  relayTunnelId?: string;
}

export interface ThresholdEntrant {
  id: string;
  kind: 'agent' | 'human';
  agentCardId?: string;
}

export interface ThresholdDecision {
  representation: PortalRepresentation;
  entrant: ThresholdEntrant;
  scope: SpatialScope;
}

const SCOPE_RANK: Record<SpatialScope, number> = {
  'read-only': 0,
  'mutate-zone': 1,
  'drive-avatar': 2,
};

/** A valid A2A Agent Card requires a non-empty string id. */
export function hasValidAgentCard(card: A2AAgentCardLike | null | undefined): card is A2AAgentCardLike {
  return !!card && typeof card.id === 'string' && card.id.length > 0;
}

/**
 * Resolve the spatial scope an entrant is granted: the requested scope clamped
 * to the policy's allowedScopes, falling back to defaultScope, then read-only.
 * Never grants a scope above what the policy permits.
 */
export function resolveGrantedScope(
  policy: SpatialPolicy | undefined,
  requestedScope?: SpatialScope,
): SpatialScope {
  const p = policy ?? {};
  const allowed = p.allowedScopes && p.allowedScopes.length > 0 ? p.allowedScopes : undefined;
  const fallback: SpatialScope = p.defaultScope ?? 'read-only';
  const wanted: SpatialScope = requestedScope ?? fallback;

  if (allowed) {
    if (allowed.includes(wanted)) return wanted;
    // Requested scope not permitted — grant the highest allowed scope that does
    // not exceed the request, else the lowest allowed scope.
    const ranked = [...allowed].sort((a, b) => SCOPE_RANK[a] - SCOPE_RANK[b]);
    const capped = ranked.filter((s) => SCOPE_RANK[s] <= SCOPE_RANK[wanted]);
    return capped.length > 0 ? capped[capped.length - 1] : ranked[0];
  }
  return wanted;
}

/**
 * Negotiate the representation served to an entrant at the portal threshold
 * (cbxy). Agent (valid A2A card) → semantic lane; human → webxr lane.
 */
export function negotiateRepresentation(
  conn: ThresholdConnection,
  policy?: SpatialPolicy,
): ThresholdDecision {
  const isAgent = hasValidAgentCard(conn.agentCard);
  const scope = resolveGrantedScope(policy, conn.requestedScope);
  const entrant: ThresholdEntrant = isAgent
    ? { id: conn.entrantId ?? conn.agentCard!.id, kind: 'agent', agentCardId: conn.agentCard!.id }
    : { id: conn.entrantId ?? `human:${conn.worldId}`, kind: 'human' };
  return {
    representation: isAgent ? 'semantic' : 'webxr',
    entrant,
    scope,
  };
}

// ---------------------------------------------------------------------------
// portal-entry.v1 receipt (svo2)
// ---------------------------------------------------------------------------

export interface PortalEntryReceipt {
  schemaVersion: 'holoscript.holoportal.portal-entry.v1';
  worldId: string;
  entrant: ThresholdEntrant;
  representation: PortalRepresentation;
  spatialScope: SpatialScope;
  /** Rewind anchor: hash of authoritative world state at entry. */
  entryStateHash: string;
  /** Rewind anchor at exit, set when the entry is sealed on close. */
  exitStateHash?: string;
  enteredAt: string;
  exitedAt?: string;
  relayTunnelId?: string;
}

/** Deterministic sha256 hash of a world-state object (rewind anchor). */
export function hashWorldState(state: unknown): string {
  return createHash('sha256').update(stableStringify(state)).digest('hex');
}

/** Build a portal-entry receipt from a threshold decision + entry world state. */
export function buildPortalEntryReceipt(opts: {
  worldId: string;
  decision: ThresholdDecision;
  entryState: unknown;
  relayTunnelId?: string;
  now?: string;
}): PortalEntryReceipt {
  return {
    schemaVersion: 'holoscript.holoportal.portal-entry.v1',
    worldId: opts.worldId,
    entrant: opts.decision.entrant,
    representation: opts.decision.representation,
    spatialScope: opts.decision.scope,
    entryStateHash: hashWorldState(opts.entryState),
    enteredAt: opts.now ?? new Date().toISOString(),
    ...(opts.relayTunnelId ? { relayTunnelId: opts.relayTunnelId } : {}),
  };
}

/** Seal a receipt on exit: stamp the exit world-state hash + exit time. */
export function sealPortalEntryReceipt(
  receipt: PortalEntryReceipt,
  exitState: unknown,
  now?: string,
): PortalEntryReceipt {
  return {
    ...receipt,
    exitStateHash: hashWorldState(exitState),
    exitedAt: now ?? new Date().toISOString(),
  };
}

/** Stable JSON stringify (sorted keys) so hashes are order-independent. */
function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}
