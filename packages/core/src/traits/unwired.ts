/**
 * unwired.ts — honest-abstention emit for a trait whose backend is declared-but-not-wired.
 *
 * A trait must never ASSERT a result it did not produce. Several backend-service traits
 * (payment, storage, media, messaging, remote/hardware inference) historically emitted a
 * FABRICATED success event when their real backend was not wired — e.g. `stripe:charged`
 * with a fake `ch_${Date.now()}` chargeId, `s3:uploaded` with no upload, `video:transcoded`
 * with no transcode. That is a silent LIE: a downstream consumer sees success and proceeds
 * on an effect that never happened — strictly worse than a silent no-op.
 *
 * `emitUnwired` replaces the fabricated success with an HONEST error the consumer can handle
 * — the same is-right / honest-abstention discipline the uAAL resolvers (resolve*) and the
 * decode receipts follow: observe/derive, never assert. It emits the trait's own documented
 * error event (each such trait's WIRING SPEC already specifies "emit *:error on failure").
 *
 * This is NOT for traits that legitimately compute locally (jwt signing, markdown→HTML,
 * api-key generation, loot rolls, in-memory optimizers) — those emit truthful success and
 * must be left alone. Use emitUnwired ONLY where a real EXTERNAL side-effect is claimed but
 * not performed. When a real backend is wired later, the trait emits its true success on
 * success and calls emitUnwired only on genuine failure.
 *
 * @module core/traits/unwired
 */

import type { TraitContext } from './TraitTypes';

export interface UnwiredDetail {
  /** Capability name, e.g. 'stripe', 's3', 'video_transcode'. */
  capability: string;
  /** Short pointer to what real wiring requires (from the trait's WIRING SPEC). */
  wiring?: string;
  /** The request payload that was NOT actually performed — echoed back so the consumer can retry/log. */
  requested?: Record<string, unknown>;
}

/** The honest not-implemented payload shape (stable so consumers can branch on it). */
export interface UnwiredPayload {
  ok: false;
  error: 'not_implemented';
  capability: string;
  reason: string;
  wiring?: string;
  requested?: Record<string, unknown>;
}

/**
 * Emit an honest not-implemented error instead of a fabricated success. `errorEvent` is the
 * trait's documented error event (e.g. 'stripe:error', 's3:error', 'video:error'). No-ops
 * safely if the context has no emit (same optional-emit contract as the trait handlers).
 */
export function emitUnwired(context: TraitContext, errorEvent: string, detail: UnwiredDetail): void {
  const payload: UnwiredPayload = {
    ok: false,
    error: 'not_implemented',
    capability: detail.capability,
    reason: 'trait declared but its backend is not wired — no external effect was performed',
  };
  if (detail.wiring) payload.wiring = detail.wiring;
  if (detail.requested) payload.requested = detail.requested;
  context.emit?.(errorEvent, payload);
}
