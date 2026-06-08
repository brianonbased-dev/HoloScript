/**
 * Integration proof: the retail-ecommerce `eoq` trait, once registered via the
 * runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and runs
 * the Harris-Wilson Economic Order Quantity solver — NOT called directly as a
 * handler object (the thin convention every other trait test uses).
 *
 * Mirrors the energy-grid reference integration. Drives the real path:
 * executeNode(orb) -> orb-executor -> applyDirectives ->
 * traitHandlers.get('eoq').onAttach -> economicOrderQuantity.
 * The negative control proves the registration is load-bearing (without it,
 * the trait is a dead no-op — which is exactly the tier's status quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerRetailEcommerceTraitHandlers } from '../runtime';

// Hand-checkable EOQ: D=1000, S=10, H=2.5 => sqrt(2*1000*10/2.5) = sqrt(8000) ≈ 89.4427.
const EOQ_CONFIG = {
  annualDemand: 1000,
  orderingCost: 10,
  holdingCostPerUnit: 2.5,
};
const EXPECTED_EOQ = Math.sqrt((2 * 1000 * 10) / 2.5); // 89.44271909999159

function eoqOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'retail',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'eoq', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('retail-ecommerce -> HoloScript runtime integration (eoq)', () => {
  it('runtime dispatch runs the EOQ solver for a registered @eoq orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerRetailEcommerceTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('eoq_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(eoqOrb(EOQ_CONFIG) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // EOQ = sqrt(2*D*S/H) = sqrt(8000) ≈ 89.44.
    expect(summary.eoq as number).toBeCloseTo(EXPECTED_EOQ, 5);
    expect(summary.eoq as number).toBeCloseTo(89.4427, 4);
    // ordersPerYear = D / EOQ = 1000 / 89.4427 ≈ 11.1803.
    expect(summary.ordersPerYear as number).toBeCloseTo(1000 / EXPECTED_EOQ, 5);
    expect(summary.annualDemand).toBe(1000);
  });

  it('NEGATIVE CONTROL: without registration the @eoq trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('eoq_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(eoqOrb(EOQ_CONFIG) as never);
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerRetailEcommerceTraitHandlers(runtime);

    await runtime.executeNode(eoqOrb(EOQ_CONFIG) as never);
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['eoq:retail'] as
      | { eoq?: number; annualDemand?: number }
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted?.eoq).toBeCloseTo(EXPECTED_EOQ, 5);
    expect(persisted?.annualDemand).toBe(1000);
  });

  it('emits eoq_error (does not throw through the runtime) for missing inputs', async () => {
    const runtime = new HoloScriptRuntime();
    registerRetailEcommerceTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('eoq_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // holdingCostPerUnit omitted -> the handler emits eoq_error, never throws.
    await runtime.executeNode(
      eoqOrb({ annualDemand: 1000, orderingCost: 10 }) as never,
    );
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('holdingCostPerUnit');
  });
});
