/**
 * @holoscript/runtime - CircuitBreakerProbe
 *
 * Consumes `retry:circuit_half` emitted by RetryTrait
 * (packages/core/src/traits/RetryTrait.ts) when a tripped circuit cools down to
 * half-open, and issues the half-open trial call. Closes the missing listener
 * side (Pattern E: emit-without-listener) — before this, the trait transitioned
 * open→half-open and announced it, but nothing actually probed, so the circuit
 * never recovered on its own.
 *
 * On `retry:circuit_half` the probe dispatches a single trial via the trait's
 * own retry pipeline (`retry:execute`), captures the generated retry id from the
 * emitted probe action, runs the trial, and reports the outcome back with
 * `retry:action_result` — which closes the circuit on success or reopens it on
 * failure (the trait's existing half-open logic).
 *
 * The probe is synchronous (the bus dispatch chain is synchronous). For async
 * trials, resolve them out of band and feed the result via `reportResult`.
 */

import type { EventBus } from './events.js';

/** Trial call: returns true if the probed dependency is healthy. */
export type ProbeFn = () => boolean;

export interface CircuitHalfEvent {
  testAttempt?: number;
}

export interface CircuitBreakerProbeOptions {
  bus: EventBus;
  /** The trial call run on half-open. Default: always-healthy probe. */
  probe?: ProbeFn;
  /** Action name used for the probe execution. Default 'circuit_probe'. */
  probeAction?: string;
  onProbe?: (result: { success: boolean; testAttempt?: number }) => void;
}

export class CircuitBreakerProbe {
  private readonly bus: EventBus;
  private probe: ProbeFn;
  private readonly probeAction: string;
  private handlers = new Set<(r: { success: boolean; testAttempt?: number }) => void>();
  private unsubscribers: Array<() => void> = [];
  private _started = false;

  private _probeCount = 0;
  private _lastResult: boolean | null = null;
  private _lastTestAttempt: number | undefined;
  private _pendingProbeIds = new Set<string>();

  constructor(options: CircuitBreakerProbeOptions) {
    this.bus = options.bus;
    this.probe = options.probe ?? (() => true);
    this.probeAction = options.probeAction ?? 'circuit_probe';
    if (options.onProbe) this.handlers.add(options.onProbe);
  }

  start(): void {
    if (this._started) return;
    this._started = true;
    this.unsubscribers.push(
      this.bus.on<CircuitHalfEvent>('retry:circuit_half', (e) => this.onHalfOpen(e))
    );
    // The trait emits the probe action (carrying __retryId) when it accepts the
    // probe execution; capture the id so we can report the result back.
    this.unsubscribers.push(
      this.bus.on<{ __retryId?: string }>(this.probeAction, (e) => this.onProbeDispatched(e))
    );
  }

  stop(): void {
    this.unsubscribers.forEach((u) => u());
    this.unsubscribers = [];
    this._started = false;
  }

  /** Swap the trial call (e.g. wire a real health-check ping). */
  setProbe(probe: ProbeFn): void {
    this.probe = probe;
  }

  private onHalfOpen(e: CircuitHalfEvent): void {
    this._lastTestAttempt = e?.testAttempt;
    // Issue a single trial through the trait's retry pipeline. The trait creates
    // a pending action and re-emits `probeAction` with the generated __retryId.
    this.bus.emit('retry:execute', { action: this.probeAction });
  }

  private onProbeDispatched(e: { __retryId?: string }): void {
    const retryId = e?.__retryId;
    if (!retryId || this._pendingProbeIds.has(retryId)) return;
    this._pendingProbeIds.add(retryId);

    let success = false;
    try {
      success = !!this.probe();
    } catch {
      success = false; // a throwing probe is a failed trial → reopen
    }
    this._probeCount += 1;
    this._lastResult = success;

    // Report the trial outcome back to the trait, which closes (success) or
    // reopens (failure) the circuit.
    this.bus.emit('retry:action_result', { retryId, success });
    this._pendingProbeIds.delete(retryId);
    this.handlers.forEach((h) => h({ success, testAttempt: this._lastTestAttempt }));
  }

  /** Manually report an out-of-band (async) trial outcome for a retry id. */
  reportResult(retryId: string, success: boolean): void {
    this._probeCount += 1;
    this._lastResult = success;
    this.bus.emit('retry:action_result', { retryId, success });
  }

  get probeCount(): number {
    return this._probeCount;
  }
  get lastResult(): boolean | null {
    return this._lastResult;
  }
}

export function createCircuitBreakerProbe(
  options: CircuitBreakerProbeOptions
): CircuitBreakerProbe {
  const probe = new CircuitBreakerProbe(options);
  probe.start();
  return probe;
}
