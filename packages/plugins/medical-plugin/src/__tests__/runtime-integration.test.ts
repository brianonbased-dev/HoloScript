/**
 * Integration proof: the medical `parkland_resuscitation` trait, once registered
 * via the runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and
 * runs the deterministic Baxter-Parkland burn fluid-resuscitation solver — NOT
 * called directly as a handler object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference
 * (`civic_decision`). Drives the real path: executeNode(orb) -> orb-executor ->
 * applyDirectives -> traitHandlers.get('parkland_resuscitation').onAttach ->
 * parklandFormula. The negative control proves the registration is load-bearing
 * (without it, the trait is a dead no-op — which is exactly the tier's status
 * quo).
 *
 * CLINICAL DISCLAIMER: validates DECISION-SUPPORT math only.
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerMedicalTraitHandlers } from '../runtime';

// ── Hand-derived reference case (coefficient confirmed = 4 mL in
// medicalsolver.ts: `Math.round(4 * weightKg * tbsaPct)`) ────────────────────
//   Patient: 70 kg, 50% TBSA burn.
//   totalFluidMl      = round(4 × 70 × 50) = round(14 000) = 14 000 mL / 24 h
//   first8hMl         = round(14 000 / 2)  = round(7 000)  =  7 000 mL
//   next16hMl         = 14 000 − 7 000      =                 7 000 mL
//   hourlyRateFirst8h = round(7 000 / 8)    = round(875)    =    875 mL/h
// Every step divides evenly, so Math.round is a no-op and the expected values
// are EXACT (asserted against this derivation, not against solver output).
const WEIGHT_KG = 70;
const TBSA_PCT = 50;
const EXPECTED_TOTAL_ML = 14_000;
const EXPECTED_FIRST_8H_ML = 7_000;
const EXPECTED_NEXT_16H_ML = 7_000;
const EXPECTED_HOURLY_RATE = 875;

function parklandResuscitationOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'burn',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'parkland_resuscitation', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('medical -> HoloScript runtime integration (parkland_resuscitation)', () => {
  it('runtime dispatch runs the Parkland solver for a registered @parkland_resuscitation orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerMedicalTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('parkland_resuscitation_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(
      parklandResuscitationOrb({ weightKg: WEIGHT_KG, tbsaPct: TBSA_PCT }) as never
    );
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // Asserted against the HAND derivation above (4 × 70 × 50), not solver output.
    expect(summary.totalFluidMl).toBeCloseTo(EXPECTED_TOTAL_ML, 6);
    expect(summary.first8hMl).toBeCloseTo(EXPECTED_FIRST_8H_ML, 6);
    expect(summary.next16hMl).toBeCloseTo(EXPECTED_NEXT_16H_ML, 6);
    expect(summary.hourlyRateFirst8h).toBeCloseTo(EXPECTED_HOURLY_RATE, 6);
    expect(summary.weightKg).toBe(WEIGHT_KG);
    expect(summary.tbsaPct).toBe(TBSA_PCT);
  });

  it('NEGATIVE CONTROL: without registration the @parkland_resuscitation trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('parkland_resuscitation_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(
      parklandResuscitationOrb({ weightKg: WEIGHT_KG, tbsaPct: TBSA_PCT }) as never
    );
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerMedicalTraitHandlers(runtime);

    await runtime.executeNode(
      parklandResuscitationOrb({ weightKg: WEIGHT_KG, tbsaPct: TBSA_PCT }) as never
    );
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['parkland_resuscitation:burn'] as
      | { totalFluidMl?: number; first8hMl?: number; hourlyRateFirst8h?: number }
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted?.totalFluidMl).toBeCloseTo(EXPECTED_TOTAL_ML, 6);
    expect(persisted?.first8hMl).toBeCloseTo(EXPECTED_FIRST_8H_ML, 6);
    expect(persisted?.hourlyRateFirst8h).toBeCloseTo(EXPECTED_HOURLY_RATE, 6);
  });

  it('emits parkland_resuscitation_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerMedicalTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('parkland_resuscitation_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // Negative weight is a finite number, so it passes the handler's type guard
    // and reaches parklandFormula, which throws "weightKg must be positive" — the
    // handler's try/catch turns that into a parkland_resuscitation_error rather
    // than a throw propagating through the runtime.
    await runtime.executeNode(
      parklandResuscitationOrb({ weightKg: -70, tbsaPct: TBSA_PCT }) as never
    );
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('positive');
  });
});
