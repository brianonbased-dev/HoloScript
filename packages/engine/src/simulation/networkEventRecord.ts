/**
 * Network event wire format (`network.event.v1`) — fifth instance of the
 * time-binding `solverType` family, generalizing W.107 (ui.session.v1),
 * W.315 (equivalence.v1), and `agent.dialog.v1` to the team-feed / network-
 * event modality.
 *
 * **Use this for**: marking a witness payload that recorded a sequence of
 * HoloMesh team-feed events (presence joins, board claims, knowledge syncs,
 * mode switches, suggestion votes) as a chain-typed sequence — chainDepth-
 * ordered, replay-deterministic across observer restarts and observer-instance
 * churn (W.111). Two observers reading the same feed produce wire-equivalent
 * witness records by construction, regardless of which observer cursored
 * first or how their wallclocks drifted.
 *
 * **Why a fifth instance**: by the time the family hits five instances the
 * pattern is no longer a coincidence — the wire-format IS an architectural
 * primitive. Per the time-premise memo `research/2026-04-27_time-premise-
 * holoscript-architecture.md`: the team-feed has been "live" in user-facing
 * UX framing, but at the architecture level it is a rapid cursor-advance
 * over a shared block universe. This wire format makes that fact testable.
 *
 * **What this is NOT**: this is not the team-feed transport (lives in the
 * HoloMesh `team-room.ts` / `messaging.ts` / SSE feed surfaces). This is
 * the **wire format for a feed-sequence witness**: a stable canonical key
 * over an ordered batch of events, suitable for embedding in CAEL `init`
 * payloads, replay assertions in tests, or cross-observer agreement checks.
 */

import { stableStringify } from './equivalenceRecord';

/** Recorded on witness payloads when a team-feed batch is being chain-typed. */
export const NETWORK_EVENT_V1 = 'network.event.v1' as const;

export type NetworkEventV1SolverType = typeof NETWORK_EVENT_V1;

/**
 * One event in a HoloMesh team-feed sequence. Captures the modality-typed
 * content (event class + payload), the actor that fired it, and the chain-
 * time position. Wallclock metadata is intentionally absent — the feed's
 * arrow-of-time is `chainDepth`, not the observer's `Date.now()`.
 */
export interface NetworkEvent {
  /** Event class tag (e.g. `presence.join`, `board.claim`, `knowledge.sync`, `mode.switch`, `suggestion.vote`). */
  type: string;
  /** Stable agent handle of the actor that fired the event. Per W.111, NOT instance id. */
  actor: string;
  /** Position of this event within the feed. Monotone, 0-indexed. The feed's arrow-of-time. */
  chainDepth: number;
  /** Event-specific structured content. Hash-anchored. */
  payload: Record<string, unknown>;
  /** Optional parent event hash for branched feeds; absent for the genesis event. */
  parentHash?: string;
  /** Optional structured non-timestamp metadata. */
  meta?: Record<string, unknown>;
}

/**
 * Schema for a `network.event.v1` witness record. Mirrors the `solverType` /
 * `specVersion` / `wireKey` slots used by the rest of the family so
 * downstream tools can route by `solverType` without a second discriminator.
 */
export interface NetworkEventV1Record {
  solverType: NetworkEventV1SolverType;
  /** Bumps if canonicalization rules change. */
  specVersion: 1;
  /** Stable identifier of the feed (analog of `dialogId` in agent.dialog.v1, `contractId` in equivalence.v1). */
  feedId: string;
  /** Stable derived key over the canonical event sequence (see `networkEventWireKey`). */
  wireKey: string;
  /** Number of events in the canonicalized witness. */
  eventCount: number;
  /** Optional harness label. */
  label?: string;
}

/** Minimum shape consumable by the canonicalization helpers. */
export type NetworkEventWireInput = {
  feedId: string;
  events: ReadonlyArray<NetworkEvent>;
};

/**
 * Strip non-semantic fields from an event. `meta` is preserved (it's content);
 * `parentHash` is preserved (defines branch geometry). Field order is fixed
 * so the rendered JSON is deterministic.
 */
function canonicalEvent(event: NetworkEvent): Record<string, unknown> {
  const out: Record<string, unknown> = {
    chainDepth: event.chainDepth,
    type: event.type,
    actor: event.actor,
    payload: event.payload,
  };
  if (event.parentHash !== undefined) out.parentHash = event.parentHash;
  if (event.meta !== undefined) out.meta = event.meta;
  return out;
}

/**
 * Build the canonical wire snapshot used for agreement checks. Sorts events
 * by `chainDepth` (the canonical arrow), with `(type, actor)` as deterministic
 * tiebreakers when two events share a chainDepth (e.g. a board claim and a
 * presence event recorded at the same depth in a busy feed).
 *
 * Throws on duplicate `(chainDepth, type, actor)` tuples — that's a malformed
 * feed (W.087-class identity collision) and should be caught at canonicalization,
 * not silently coalesced.
 */
export function canonicalNetworkEventSnapshot(source: NetworkEventWireInput): Record<string, unknown> {
  const events = source.events.map(canonicalEvent);
  events.sort((a, b) => {
    const ad = a.chainDepth as number;
    const bd = b.chainDepth as number;
    if (ad !== bd) return ad - bd;
    const at = (a.type as string).localeCompare(b.type as string);
    if (at !== 0) return at;
    return (a.actor as string).localeCompare(b.actor as string);
  });
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1];
    const curr = events[i];
    if (
      prev.chainDepth === curr.chainDepth &&
      prev.type === curr.type &&
      prev.actor === curr.actor
    ) {
      throw new Error(
        `network.event.v1: duplicate (chainDepth=${curr.chainDepth}, type=${curr.type}, actor=${curr.actor}) — malformed feed (W.087-class identity collision)`
      );
    }
  }
  return {
    feedId: source.feedId,
    events,
  };
}

/** Single derived key for one feed batch. */
export function networkEventWireKey(source: NetworkEventWireInput): string {
  return stableStringify(canonicalNetworkEventSnapshot(source));
}

/**
 * True if two feed batches are wire-equivalent: same `feedId` and same
 * canonical event sequence (chainDepth-ordered, with payload + branch geometry
 * preserved). Wallclock variations between observers, observer-restart effects,
 * and observer-instance churn do not affect the result by construction.
 */
export function wireFormatEquivalentNetworkEvent(
  a: NetworkEventWireInput,
  b: NetworkEventWireInput,
): boolean {
  return networkEventWireKey(a) === networkEventWireKey(b);
}

/** Build a `network.event.v1` witness record (for logging, CAEL init, or sidecar files). */
export function buildNetworkEventV1Record(
  source: NetworkEventWireInput,
  options: { label?: string } = {},
): NetworkEventV1Record {
  return {
    solverType: NETWORK_EVENT_V1,
    specVersion: 1,
    feedId: source.feedId,
    wireKey: networkEventWireKey(source),
    eventCount: source.events.length,
    ...(options.label !== undefined ? { label: options.label } : {}),
  };
}
