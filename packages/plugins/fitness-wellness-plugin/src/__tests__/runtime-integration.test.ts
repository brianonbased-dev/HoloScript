/**
 * Integration proof: the fitness-wellness `one_rep_max` trait, once registered
 * via the runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and
 * runs the deterministic 1-rep-max prediction solver — NOT called directly as a
 * handler object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference
 * (civic_decision). Drives the real path: executeNode(orb) -> orb-executor ->
 * applyDirectives -> traitHandlers.get('one_rep_max').onAttach -> oneRepMax.
 * The negative control proves the registration is load-bearing (without it, the
 * trait is a dead no-op — which is exactly the tier's status quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerFitnessWellnessTraitHandlers } from '../runtime';

// Test fixture: 100 kg lifted for 10 reps.
//
// HAND-DERIVED from the formulas in fitnesssolver.ts::oneRepMax (NOT copied
// from solver output):
//   epley    = w*(1 + r/30)            = 100*(1 + 10/30)        = 100*(4/3)   = 133.33333…
//   brzycki  = w*36/(37 - r)           = 100*36/(37 - 10)       = 3600/27     = 133.33333…
//   lander   = 100w/(101.3 - 2.67123r) = 10000/(101.3 - 26.7123)= 10000/74.5877 = 134.07036…
//   lombardi = w*r^0.10                = 100*10^0.10            = 100*1.258925 = 125.89254…
//   average  = (133.33333 + 133.33333 + 134.07036 + 125.89254)/4
//            = 526.62957/4 = 131.65739…
const TEST_WEIGHT_KG = 100;
const TEST_REPS = 10;
const EXPECTED_EPLEY = 133.333333; // 100 * (1 + 10/30)
const EXPECTED_BRZYCKI = 133.333333; // 3600 / 27
const EXPECTED_LANDER = 134.070363; // 10000 / 74.5877
const EXPECTED_LOMBARDI = 125.892541; // 100 * 10^0.1
const EXPECTED_AVERAGE = 131.657393; // (epley+brzycki+lander+lombardi)/4

function oneRepMaxOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'lifter',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'one_rep_max', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('fitness-wellness -> HoloScript runtime integration (one_rep_max)', () => {
  it('runtime dispatch runs the 1RM prediction solver for a registered @one_rep_max orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerFitnessWellnessTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('one_rep_max_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(oneRepMaxOrb({ weightKg: TEST_WEIGHT_KG, reps: TEST_REPS }) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    expect(summary.weightKg).toBe(TEST_WEIGHT_KG);
    expect(summary.reps).toBe(TEST_REPS);
    // Hand-checked against the four formulas (see fixture comment above).
    expect(summary.epley as number).toBeCloseTo(EXPECTED_EPLEY, 4);
    expect(summary.brzycki as number).toBeCloseTo(EXPECTED_BRZYCKI, 4);
    expect(summary.lander as number).toBeCloseTo(EXPECTED_LANDER, 4);
    expect(summary.lombardi as number).toBeCloseTo(EXPECTED_LOMBARDI, 4);
    expect(summary.average as number).toBeCloseTo(EXPECTED_AVERAGE, 4);
  });

  it('NEGATIVE CONTROL: without registration the @one_rep_max trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('one_rep_max_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(oneRepMaxOrb({ weightKg: TEST_WEIGHT_KG, reps: TEST_REPS }) as never);
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerFitnessWellnessTraitHandlers(runtime);

    await runtime.executeNode(oneRepMaxOrb({ weightKg: TEST_WEIGHT_KG, reps: TEST_REPS }) as never);
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['one_rep_max:lifter'] as
      | { epley?: number; average?: number; weightKg?: number }
      | undefined;
    expect(persisted).toBeDefined();
    // Hand-checked: epley = 100*(1 + 10/30) = 133.33333…, average = 131.65739…
    expect(persisted?.weightKg).toBe(TEST_WEIGHT_KG);
    expect(persisted?.epley as number).toBeCloseTo(EXPECTED_EPLEY, 4);
    expect(persisted?.average as number).toBeCloseTo(EXPECTED_AVERAGE, 4);
  });

  it('emits one_rep_max_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerFitnessWellnessTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('one_rep_max_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // reps = 0 is invalid — the real solver throws "reps must be a positive
    // integer", which the handler's try/catch turns into a one_rep_max_error
    // rather than a throw through the runtime.
    await runtime.executeNode(oneRepMaxOrb({ weightKg: TEST_WEIGHT_KG, reps: 0 }) as never);
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('reps');
  });
});
