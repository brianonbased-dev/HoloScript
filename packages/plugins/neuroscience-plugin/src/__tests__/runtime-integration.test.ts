/**
 * Integration proof: the neuroscience `lif_neuron` trait, once registered via
 * the runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and
 * runs the deterministic Leaky Integrate-and-Fire solver — NOT called directly
 * as a handler object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference
 * (civic_decision). Drives the real path: executeNode(orb) -> orb-executor ->
 * applyDirectives -> traitHandlers.get('lif_neuron').onAttach -> lifNeuron.
 * The negative control proves the registration is load-bearing (without it,
 * the trait is a dead no-op — which is exactly the tier's status quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerNeuroscienceTraitHandlers } from '../runtime';

// Subthreshold steady-state case, hand-derived from the ACTUAL LIF ODE in
// neurosolver.ts:  dV/dt = -(V - Vrest)/tauM + Iapp.
// Setting dV/dt = 0 gives the steady state  V_ss = Vrest + Iapp * tauM.
//   Vrest = -65, tauM = 20, Iapp = 0.5  =>  V_ss = -65 + 0.5 * 20 = -55 mV.
// Since V_ss = -55 mV is BELOW Vthresh = -50 mV, the membrane never reaches
// threshold => spikeCount = 0, firingRateHz = 0, and the membrane voltage
// asymptotes to -55 mV. Over durationMs = 200 ms (= 10 * tauM) the exponential
// charge curve V(t) = V_ss + (Vrest - V_ss) e^(-t/tauM) is within
// 10 * e^(-9.995) ~= 4.6e-4 mV of -55, so the final sampled V is ~= -55.0004 mV.
const SUBTHRESHOLD_CONFIG = {
  Iapp: 0.5,
  tauM: 20,
  Vrest: -65,
  Vthresh: -50,
  Vreset: -65,
  durationMs: 200,
  dtMs: 0.1,
} as const;

function lifNeuronOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'neuron',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'lif_neuron', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('neuroscience -> HoloScript runtime integration (lif_neuron)', () => {
  it('runtime dispatch runs the LIF solver for a registered @lif_neuron orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerNeuroscienceTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('lif_neuron_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(lifNeuronOrb({ ...SUBTHRESHOLD_CONFIG }) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // Hand-derived: V_ss = Vrest + Iapp*tauM = -65 + 0.5*20 = -55 mV, which is
    // below Vthresh = -50, so the neuron never spikes and V settles at -55 mV.
    expect(summary.spikeCount).toBe(0);
    expect(summary.firingRateHz).toBe(0);
    expect(summary.finalVoltageMv as number).toBeCloseTo(-55, 2);
    // Sub-threshold drive => integrate-to-threshold time is undefined => null.
    expect(summary.theoreticalRateHz).toBeNull();
  });

  it('NEGATIVE CONTROL: without registration the @lif_neuron trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('lif_neuron_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(lifNeuronOrb({ ...SUBTHRESHOLD_CONFIG }) as never);
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerNeuroscienceTraitHandlers(runtime);

    await runtime.executeNode(lifNeuronOrb({ ...SUBTHRESHOLD_CONFIG }) as never);
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['lif_neuron:neuron'] as
      | { spikeCount?: number; finalVoltageMv?: number }
      | undefined;
    expect(persisted).toBeDefined();
    // Same hand-derived steady state: -55 mV, zero spikes.
    expect(persisted?.spikeCount).toBe(0);
    expect(persisted?.finalVoltageMv as number).toBeCloseTo(-55, 2);
  });

  it('emits lif_neuron_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerNeuroscienceTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('lif_neuron_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // tauM = 0 is invalid: the real solver throws "tauM must be positive",
    // which the handler's try/catch turns into a lif_neuron_error rather than a
    // throw. (Iapp is supplied so it gets past the required-field guard and
    // actually reaches the solver, exercising the try/catch path.)
    await runtime.executeNode(
      lifNeuronOrb({ Iapp: 1.0, tauM: 0 }) as never,
    );
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('tauM must be positive');
  });
});
