'use client';

/**
 * useBrittneyWake — wake Brittney when her panel opens, and say so kindly while she wakes.
 *
 * Founder 2026-10-08: Brittney is no longer always-on. Her box is rented on demand and
 * takes minutes to come up, so the panel asks POST /api/brittney/warm as soon as it opens
 * (signed-in only). While she is waking the panel shows a calm notice with the time left,
 * asks again every couple of minutes (the route answers at most once per two minutes per
 * user), and flips to "ready" when the box answers. A cold box is never shown as an error.
 */

import { useCallback, useEffect, useRef, useState } from 'react';

export type BrittneyWakePhase = 'idle' | 'waking' | 'ready' | 'slow';

export interface BrittneyWakeState {
  phase: BrittneyWakePhase;
  /** Expected wake time in seconds, from the server. */
  etaSeconds: number;
  /** When the waking started (ms since epoch); 0 when not waking. */
  startedAt: number;
}

/** Just past the route's two-minute per-user cooldown, so a poll is never refused. */
export const WAKE_POLL_MS = 125_000;
/** Stop asking after this long and say she is slow, rather than polling forever. */
export const WAKE_GIVE_UP_MS = 45 * 60_000;
/** How long "Brittney is ready" stays on screen. */
export const READY_NOTICE_MS = 8_000;

const IDLE: BrittneyWakeState = { phase: 'idle', etaSeconds: 0, startedAt: 0 };

type WarmAnswer = 'warm' | 'waking' | 'other';

async function askWarm(fetchImpl: typeof fetch): Promise<{ answer: WarmAnswer; eta?: number }> {
  try {
    const res = await fetchImpl('/api/brittney/warm', { method: 'POST' });
    // 429 = asked too recently. She is still waking as far as we know.
    if (res.status === 429) return { answer: 'waking' };
    if (!res.ok) return { answer: 'other' };
    const body = (await res.json()) as { status?: string; etaSeconds?: unknown };
    const eta = typeof body.etaSeconds === 'number' ? body.etaSeconds : undefined;
    if (body.status === 'warm') return { answer: 'warm', eta };
    if (body.status === 'waking') return { answer: 'waking', eta };
    return { answer: 'other', eta };
  } catch {
    return { answer: 'other' };
  }
}

/**
 * The sentence the panel shows for a wake state, or null when there is nothing to say.
 * `messageHeld` = a message the person sent is waiting and will go out by itself.
 */
export function wakeNoticeText(
  state: BrittneyWakeState,
  now: number,
  messageHeld: boolean
): string | null {
  if (state.phase === 'ready') return 'Brittney is ready.';
  if (state.phase === 'slow') {
    return 'Brittney is taking longer than usual to wake up. Try again in a few minutes.';
  }
  if (state.phase !== 'waking') return null;
  const leftMs = Math.max(0, state.startedAt + state.etaSeconds * 1000 - now);
  const minutes = Math.max(1, Math.ceil(leftMs / 60_000));
  const when = `about ${minutes} minute${minutes === 1 ? '' : 's'}`;
  return messageHeld
    ? `Brittney is waking up — ${when}. Your message will send by itself when she is ready.`
    : `Brittney is waking up — ${when}. You can keep working; she will be ready soon.`;
}

export function useBrittneyWake(enabled: boolean, fetchImpl: typeof fetch = fetch) {
  const [state, setState] = useState<BrittneyWakeState>(IDLE);
  const fetchRef = useRef(fetchImpl);
  fetchRef.current = fetchImpl;

  /** Enter (or stay in) the waking state; called when a chat turn found her cold. */
  const markWaking = useCallback((etaSeconds: number) => {
    setState((s) =>
      s.phase === 'waking'
        ? s
        : { phase: 'waking', etaSeconds: etaSeconds > 0 ? etaSeconds : 0, startedAt: Date.now() }
    );
  }, []);

  // Panel opened by a signed-in person: wake her now, before the first message.
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void askWarm(fetchRef.current).then(({ answer, eta }) => {
      if (!cancelled && answer === 'waking') markWaking(eta ?? 0);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, markWaking]);

  // While waking: ask again every WAKE_POLL_MS until she answers, or give up kindly.
  useEffect(() => {
    if (state.phase !== 'waking') return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { answer } = await askWarm(fetchRef.current);
      if (cancelled) return;
      if (answer === 'warm') {
        setState((s) => ({ ...s, phase: 'ready' }));
      } else if (Date.now() - state.startedAt > WAKE_GIVE_UP_MS) {
        setState((s) => ({ ...s, phase: 'slow' }));
      } else {
        // Same phase, new object: re-arms this effect for the next poll and refreshes the
        // minutes-left text.
        setState((s) => ({ ...s }));
      }
    }, WAKE_POLL_MS);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [state]);

  // "Ready" is a moment, not a state to keep on screen.
  useEffect(() => {
    if (state.phase !== 'ready') return;
    const timer = setTimeout(() => setState(IDLE), READY_NOTICE_MS);
    return () => clearTimeout(timer);
  }, [state.phase]);

  return { state, markWaking };
}
