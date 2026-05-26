/**
 * CircuitBreakerProbe — Production Test Suite
 *
 * Integration: drive the REAL RetryTrait through open → (cooldown) → half-open,
 * tick, and assert the probe consumer received `retry:circuit_half`, issued a
 * trial, and reported back — closing the circuit on a healthy probe and
 * reopening it on a failing one. Fails against the no-listener stub (half-open
 * announced, but nothing probes → circuit never recovers).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { EventBus } from '../events';
import { CircuitBreakerProbe, createCircuitBreakerProbe } from '../CircuitBreakerProbe';
import { retryHandler } from '../../../core/src/traits/RetryTrait';

afterEach(() => vi.restoreAllMocks());

/** ctx that records emits AND forwards them onto the bus. */
function makeCtx(bus: EventBus) {
  const emitted: Array<{ type: string; payload: any }> = [];
  const emit = vi.fn((type: string, payload?: any) => {
    emitted.push({ type, payload });
    bus.emit(type, payload);
  });
  return { emitted, emit };
}

const CFG = {
  ...retryHandler.defaultConfig!,
  circuit_threshold: 2,
  circuit_reset_ms: 1000,
  base_delay_ms: 0,
  jitter: 0,
};

/**
 * Mount the trait and bridge inbound bus events (retry:execute /
 * retry:action_result) back into trait.onEvent — the runtime trait-event bridge
 * in production; wired explicitly here.
 */
function mountRetry(bus: EventBus) {
  const node: any = { id: 'retry_1', __retryState: undefined };
  const ctx = makeCtx(bus);
  retryHandler.onAttach!(node, CFG, ctx as any);
  bus.on('retry:execute', (p: any) =>
    retryHandler.onEvent!(node, CFG, ctx as any, { type: 'retry:execute', payload: p })
  );
  bus.on('retry:action_result', (p: any) =>
    retryHandler.onEvent!(node, CFG, ctx as any, { type: 'retry:action_result', payload: p })
  );
  return { node, ctx };
}

/** Trip the circuit open by driving `circuit_threshold` consecutive failures. */
function openCircuit(node: any, ctx: any) {
  for (let i = 0; i < CFG.circuit_threshold; i++) {
    retryHandler.onEvent!(node, CFG, ctx, { type: 'retry:execute', payload: { action: 'work' } });
    const work = [...ctx.emitted].reverse().find((e: any) => e.type === 'work');
    const retryId = work.payload.__retryId;
    retryHandler.onEvent!(node, CFG, ctx, {
      type: 'retry:action_result',
      payload: { retryId, success: false },
    });
  }
}

describe('CircuitBreakerProbe — Pattern E wiring', () => {
  it('registers a listener for retry:circuit_half (0 before this code)', () => {
    const bus = new EventBus();
    expect(bus.listenerCount('retry:circuit_half')).toBe(0);
    const probe = new CircuitBreakerProbe({ bus });
    probe.start();
    expect(bus.listenerCount('retry:circuit_half')).toBeGreaterThan(0);
  });

  it('a healthy probe on half-open CLOSES the circuit (the done-when)', () => {
    const t0 = 1_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
    const bus = new EventBus();
    const probe = createCircuitBreakerProbe({ bus, probe: () => true });
    const { node, ctx } = mountRetry(bus);

    openCircuit(node, ctx);
    expect(node.__retryState.circuit).toBe('open');

    // Cool down past circuit_reset_ms, then tick: trait → half-open → circuit_half.
    nowSpy.mockReturnValue(t0 + 2000);
    retryHandler.onUpdate!(node, CFG, ctx as any, 0.016);

    // The probe responded to the half-open signal and reported success.
    expect(probe.probeCount).toBe(1);
    expect(probe.lastResult).toBe(true);
    // Circuit recovered.
    expect(node.__retryState.circuit).toBe('closed');
    expect(ctx.emitted.some((e: any) => e.type === 'retry:circuit_close')).toBe(true);
  });

  it('a failing probe on half-open REOPENS the circuit', () => {
    const t0 = 2_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
    const bus = new EventBus();
    const probe = createCircuitBreakerProbe({ bus, probe: () => false });
    const { node, ctx } = mountRetry(bus);

    openCircuit(node, ctx);
    nowSpy.mockReturnValue(t0 + 2000);
    retryHandler.onUpdate!(node, CFG, ctx as any, 0.016);

    expect(probe.probeCount).toBe(1);
    expect(probe.lastResult).toBe(false);
    expect(node.__retryState.circuit).toBe('open');
  });

  it('a throwing probe counts as a failed trial → circuit reopens', () => {
    const t0 = 3_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
    const bus = new EventBus();
    const probe = createCircuitBreakerProbe({
      bus,
      probe: () => {
        throw new Error('dependency down');
      },
    });
    const { node, ctx } = mountRetry(bus);
    openCircuit(node, ctx);
    nowSpy.mockReturnValue(t0 + 2000);
    retryHandler.onUpdate!(node, CFG, ctx as any, 0.016);
    expect(probe.lastResult).toBe(false);
    expect(node.__retryState.circuit).toBe('open');
  });

  it('does not probe while the circuit is still open (before cooldown)', () => {
    const t0 = 4_000_000;
    const nowSpy = vi.spyOn(Date, 'now').mockReturnValue(t0);
    const bus = new EventBus();
    const probe = createCircuitBreakerProbe({ bus, probe: () => true });
    const { node, ctx } = mountRetry(bus);
    openCircuit(node, ctx);

    // Tick before cooldown elapses → no half-open, no probe.
    nowSpy.mockReturnValue(t0 + 500);
    retryHandler.onUpdate!(node, CFG, ctx as any, 0.016);
    expect(probe.probeCount).toBe(0);
    expect(node.__retryState.circuit).toBe('open');
  });

  it('closed circuit never emits half-open → probe stays idle', () => {
    const bus = new EventBus();
    const probe = createCircuitBreakerProbe({ bus, probe: () => true });
    const { node, ctx } = mountRetry(bus);
    // Never opened; tick a few times.
    for (let i = 0; i < 3; i++) retryHandler.onUpdate!(node, CFG, ctx as any, 0.016);
    expect(probe.probeCount).toBe(0);
    expect(node.__retryState.circuit).toBe('closed');
  });
});
