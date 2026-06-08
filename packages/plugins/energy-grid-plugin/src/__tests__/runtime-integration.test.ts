/**
 * Integration proof: the energy-grid `power_flow` trait, once registered via
 * the runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and
 * runs the DC power-flow solver — NOT called directly as a handler object
 * (the thin convention every other trait test uses).
 *
 * deep-ratchet 2026-06-07 / task_1780878631657_j63f PATH step 2.
 * Drives the real path: executeNode(orb) -> orb-executor -> applyDirectives ->
 * traitHandlers.get('power_flow').onAttach -> solveDCPowerFlow.
 * The negative control proves the registration is load-bearing (without it,
 * the trait is a dead no-op — which is exactly the tier's status quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerEnergyGridTraitHandlers } from '../runtime';
import type { EnergyGridModel } from '../index';

// Two-bus DC grid: a slack source feeds a 50 MW load over one line.
// DC power balance => the single line carries the full 50 MW.
const TWO_BUS_MODEL: EnergyGridModel = {
  id: 'two-bus-proof',
  baseMva: 100,
  buses: [
    { id: 'slack', kind: 'slack', nominalKv: 110 },
    { id: 'load', kind: 'load', nominalKv: 110, demandMw: 50 },
  ],
  lines: [
    {
      id: 'L1',
      fromBusId: 'slack',
      toBusId: 'load',
      reactancePu: 0.1,
      capacityMw: 100,
      status: 'closed',
    },
  ],
};

function powerFlowOrb(model: EnergyGridModel): unknown {
  return {
    type: 'orb',
    name: 'grid',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#00aaff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'power_flow', config: { model } }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('energy-grid -> HoloScript runtime integration (task_1780878631657_j63f PATH-2)', () => {
  it('runtime dispatch runs the DC solver for a registered @power_flow orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerEnergyGridTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('power_flow_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(powerFlowOrb(TWO_BUS_MODEL) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    expect(summary.converged).toBe(true);
    expect(summary.slackBusId).toBe('slack');
    const flows = summary.lineFlowsMw as Record<string, number>;
    // Power balance on a 2-bus grid: the single line carries the full 50 MW.
    expect(Math.abs(flows.L1)).toBeCloseTo(50, 5);
  });

  it('NEGATIVE CONTROL: without registration the @power_flow trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('power_flow_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(powerFlowOrb(TWO_BUS_MODEL) as never);
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('emits power_flow_error (does not throw through the runtime) for an invalid grid', async () => {
    const runtime = new HoloScriptRuntime();
    registerEnergyGridTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('power_flow_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    const noSlack = {
      ...TWO_BUS_MODEL,
      buses: [{ id: 'load', kind: 'load', nominalKv: 110, demandMw: 50 }],
    } as EnergyGridModel;
    await runtime.executeNode(powerFlowOrb(noSlack) as never);
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('slack');
  });
});
