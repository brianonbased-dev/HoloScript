/**
 * Agent dialog wire format (`agent.dialog.v1`) — third instance of the
 * time-binding `solverType` family, generalizing the W.107 UISessionRecorder
 * pattern (`solverType: 'ui.session.v1'` in
 * `packages/studio/src/lib/uiSessionRecorder.ts`) and the W.315 equivalence
 * seam (`solverType: 'equivalence.v1'` in `./equivalenceRecord`).
 *
 * **Use this for**: marking a witness payload that recorded an agent-to-agent
 * dialog as a chain-typed sequence (chain-depth ordered turns), so that
 * replay across agent restarts / multi-window seats / fleet-instance churn
 * produces the same dialog state regardless of wallclock variation.
 *
 * **Why a third instance**: two prior `solverType` values (`ui.session.v1`,
 * `equivalence.v1`) followed the same shape — bind a modality to chain-time
 * rather than wallclock-time so replay is deterministic. A third instance
 * crystallizes the pattern from "two coincident uses" to a real architectural
 * primitive (the family `<modality>.<binding>.v1`). Per the time-premise
 * memo `research/2026-04-27_time-premise-holoscript-architecture.md`:
 * **chain-time is the only of HoloScript's three time concepts that is itself
 * a constructed arrow** — wallclock drifts, sim-time is resettable, but
 * chain-depth in a CAEL-extended trace is monotone-by-construction.
 *
 * **What this is NOT**: this is not the dialog *transport* (that lives in
 * the HoloMesh `messaging.ts` API and the room/feed surfaces). This is the
 * **wire format for a dialog witness**: a stable canonical key over a
 * sequence of dialog turns, suitable for embedding in CAEL `init` payloads,
 * sidecar JSON artifacts, or replay-equivalence assertions during testing.
 */

import { stableStringify } from './equivalenceRecord';

/** Recorded on witness payloads when an agent dialog is being chain-typed. */
export const AGENT_DIALOG_V1 = 'agent.dialog.v1' as const;

export type AgentDialogV1SolverType = typeof AGENT_DIALOG_V1;

/**
 * One turn in an agent-to-agent dialog. The semantic content of the turn
 * lives entirely in fields that are stable across agent restarts and
 * fleet-instance churn — speaker handle (NOT instance id; W.111), audience
 * handle, chain-depth, content, optional parent-hash for branching.
 *
 * Wallclock metadata (timestamp, latency, network round-trip) is intentionally
 * absent — those belong on the surface layer (UI display, audit log), not on
 * the wire format. The dialog's arrow-of-time is `chainDepth`, not wallclock.
 */
export interface DialogTurn {
  /** Stable agent handle (`claude1`, `gemini1`, `mw01`). Per W.111 + W.114, this is the durable identity, not the instance id. */
  speaker: string;
  /** Stable handle of the named recipient, or `'team'` for broadcast turns. */
  audience: string;
  /** Position of this turn within the dialog. Monotone, 0-indexed. The dialog's arrow-of-time. */
  chainDepth: number;
  /** Canonical content of the turn. Hash-anchored. */
  content: string;
  /** Optional parent turn's hash for branching dialogs; absent for the genesis turn. */
  parentHash?: string;
  /** Optional structured metadata — references, context tags. NOT timestamps; chain-time only. */
  meta?: Record<string, unknown>;
}

/**
 * Schema for an `agent.dialog.v1` witness record. Mirrors the `solverType` /
 * `specVersion` / `wireKey` slots used by `equivalence.v1` and `ui.session.v1`
 * so downstream tools can route by `solverType` without a second discriminator.
 */
export interface AgentDialogV1Record {
  solverType: AgentDialogV1SolverType;
  /** Bumps if canonicalization rules change. */
  specVersion: 1;
  /** Stable identifier of the dialog chain (analog of `contractId` in equivalence.v1). */
  dialogId: string;
  /** Stable derived key over the canonical turn sequence (see `dialogWireKey`). */
  wireKey: string;
  /** Number of turns in the canonicalized witness. */
  turnCount: number;
  /** Optional harness label (test name, room id, dispute id, …). */
  label?: string;
}

/** Minimum shape consumable by the canonicalization helpers. */
export type AgentDialogWireInput = {
  dialogId: string;
  turns: ReadonlyArray<DialogTurn>;
};

/**
 * Strip non-semantic fields from a turn. `meta` is preserved (it's content);
 * `parentHash` is preserved (it defines the branch geometry). Order of fields
 * is fixed so the rendered JSON key sequence is deterministic.
 */
function canonicalTurn(turn: DialogTurn): Record<string, unknown> {
  const out: Record<string, unknown> = {
    chainDepth: turn.chainDepth,
    speaker: turn.speaker,
    audience: turn.audience,
    content: turn.content,
  };
  if (turn.parentHash !== undefined) out.parentHash = turn.parentHash;
  if (turn.meta !== undefined) out.meta = turn.meta;
  return out;
}

/**
 * Build the canonical wire snapshot used for agreement checks. Sorts turns
 * by `chainDepth` (the canonical arrow), with `(speaker, audience)` as
 * deterministic tiebreakers when two turns share a chainDepth (e.g. broadcast
 * + reply at the same depth in a multi-agent room).
 *
 * Throws on duplicate `(chainDepth, speaker, audience)` tuples — that's a
 * malformed dialog (W.087-class identity collision at the dialog layer) and
 * should be caught at canonicalization time, not silently coalesced.
 */
export function canonicalDialogSnapshot(source: AgentDialogWireInput): Record<string, unknown> {
  const turns = source.turns.map(canonicalTurn);
  turns.sort((a, b) => {
    const ad = a.chainDepth as number;
    const bd = b.chainDepth as number;
    if (ad !== bd) return ad - bd;
    const as = (a.speaker as string).localeCompare(b.speaker as string);
    if (as !== 0) return as;
    return (a.audience as string).localeCompare(b.audience as string);
  });
  // Detect collisions on (chainDepth, speaker, audience) — malformed dialog.
  for (let i = 1; i < turns.length; i++) {
    const prev = turns[i - 1];
    const curr = turns[i];
    if (
      prev.chainDepth === curr.chainDepth &&
      prev.speaker === curr.speaker &&
      prev.audience === curr.audience
    ) {
      throw new Error(
        `agent.dialog.v1: duplicate (chainDepth=${curr.chainDepth}, speaker=${curr.speaker}, audience=${curr.audience}) — malformed dialog (W.087-class identity collision)`
      );
    }
  }
  return {
    dialogId: source.dialogId,
    turns,
  };
}

/** Single derived key for one dialog. */
export function dialogWireKey(source: AgentDialogWireInput): string {
  return stableStringify(canonicalDialogSnapshot(source));
}

/**
 * True if two dialog inputs are wire-equivalent: same `dialogId` and same
 * canonical turn sequence (chainDepth-ordered, with content + branch geometry
 * preserved). Wallclock variations between recorders, agent restart effects,
 * and instance-id churn do not affect the result by construction.
 */
export function wireFormatEquivalentDialog(a: AgentDialogWireInput, b: AgentDialogWireInput): boolean {
  return dialogWireKey(a) === dialogWireKey(b);
}

/** Build an `agent.dialog.v1` witness record (for logging, CAEL init, or sidecar files). */
export function buildAgentDialogV1Record(
  source: AgentDialogWireInput,
  options: { label?: string } = {}
): AgentDialogV1Record {
  return {
    solverType: AGENT_DIALOG_V1,
    specVersion: 1,
    dialogId: source.dialogId,
    wireKey: dialogWireKey(source),
    turnCount: source.turns.length,
    ...(options.label !== undefined ? { label: options.label } : {}),
  };
}
