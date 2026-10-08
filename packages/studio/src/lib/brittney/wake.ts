/**
 * Wake Brittney ahead of the first chat message (founder 2026-10-08: Brittney is no longer
 * always-on; she wakes when someone signs in or opens her panel).
 *
 * `wakeBrittneyFor(userId)` records demand with the orchestrator at most once per user per
 * cooldown, so a refresh loop or a polling panel cannot hammer `/serve/resolve`. One
 * signed-in user asking every two minutes is enough to keep a box up while they wait; the
 * autoscaler releases it about 20 minutes after the last ask.
 */

import {
  brittneyWakeEtaSeconds,
  recordBrittneyDemand,
  type BrittneyDemandStatus,
} from './provider';

/** One orchestrator call per user per this many milliseconds. */
export const WAKE_COOLDOWN_MS = 2 * 60 * 1000;

export type WakeOutcome =
  | { ok: true; status: BrittneyDemandStatus; etaSeconds: number }
  | { ok: false; retryAfterSeconds: number };

const lastWakeAt = new Map<string, number>();

export async function wakeBrittneyFor(userId: string, now = Date.now()): Promise<WakeOutcome> {
  const last = lastWakeAt.get(userId);
  if (last !== undefined && now - last < WAKE_COOLDOWN_MS) {
    return { ok: false, retryAfterSeconds: Math.ceil((WAKE_COOLDOWN_MS - (now - last)) / 1000) };
  }
  lastWakeAt.set(userId, now);
  if (lastWakeAt.size > 10_000) {
    for (const [id, at] of lastWakeAt) if (now - at >= WAKE_COOLDOWN_MS) lastWakeAt.delete(id);
  }
  const status = await recordBrittneyDemand();
  return { ok: true, status, etaSeconds: brittneyWakeEtaSeconds() };
}

/** Sign-in hook: wake Brittney without ever failing or slowing the sign-in. */
export function wakeBrittneyOnSignIn(userId: string | undefined | null): void {
  if (!userId) return;
  void wakeBrittneyFor(userId).catch(() => undefined);
}

/** Test seam: forget every user's last wake. */
export function resetWakeCooldownsForTests(): void {
  lastWakeAt.clear();
}
