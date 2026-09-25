/**
 * Identity checks for the newest Brittney chat turn.
 *
 * Write-through stores the user turn before streaming. If the client misses
 * the early `conversation` event it uploads that same turn again, and the
 * assistant row can follow a second time. A tail-only compare cannot see the
 * user replay once the assistant row is already the tail, so a client
 * timestamp stamp covers that case. A consecutive same-role, same-content
 * compare covers a double append that has not grown a later row yet.
 *
 * An intentional repeat of the same user text after an assistant reply is
 * kept: the tail role differs, and the new timestamp is not in the stamp set.
 */

export interface TurnIdentity {
  role: 'user' | 'assistant';
  content: string;
  toolCalls?: unknown[];
  timestamp?: number | string | Date | null;
}

export function toolCallsKey(toolCalls: unknown[] | undefined): string {
  if (!toolCalls || toolCalls.length === 0) return '';
  try {
    return JSON.stringify(toolCalls);
  } catch {
    return '';
  }
}

export function timestampMs(timestamp: number | string | Date | null | undefined): number | null {
  if (typeof timestamp === 'number' && Number.isFinite(timestamp)) return timestamp;
  if (timestamp instanceof Date) {
    const ms = timestamp.getTime();
    return Number.isFinite(ms) ? ms : null;
  }
  if (typeof timestamp === 'string' && timestamp.length > 0) {
    const parsed = Date.parse(timestamp);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

/** Stable identity for a turn that carries a client or server timestamp. */
export function turnStamp(turn: TurnIdentity): string | null {
  const ts = timestampMs(turn.timestamp);
  if (ts === null) return null;
  return `${turn.role}\0${turn.content}\0${ts}\0${toolCallsKey(turn.toolCalls)}`;
}

function sameConsecutiveTurn(tail: TurnIdentity, incoming: TurnIdentity): boolean {
  return tail.role === incoming.role && tail.content === incoming.content;
}

/**
 * Drop incoming turns that replay a recent stored turn.
 * Skipped rows do not move the virtual tail.
 */
export function omitDuplicateTurns<T extends TurnIdentity>(
  existing: readonly TurnIdentity[],
  incoming: readonly T[]
): T[] {
  const stamps = new Set<string>();
  for (const row of existing) {
    const stamp = turnStamp(row);
    if (stamp) stamps.add(stamp);
  }

  let tail: TurnIdentity | null = existing.length > 0 ? existing[existing.length - 1] : null;
  const kept: T[] = [];

  for (const msg of incoming) {
    const stamp = turnStamp(msg);
    if (stamp && stamps.has(stamp)) continue;
    if (tail && sameConsecutiveTurn(tail, msg)) continue;
    kept.push(msg);
    if (stamp) stamps.add(stamp);
    tail = msg;
  }

  return kept;
}
