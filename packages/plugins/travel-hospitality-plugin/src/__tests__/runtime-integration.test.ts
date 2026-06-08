/**
 * Integration proof: the travel-hospitality `revpar` trait, once registered via
 * the runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and runs
 * the deterministic RevPAR analytic solver — NOT called directly as a handler
 * object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference
 * (civic_decision). Drives the real path: executeNode(orb) -> orb-executor ->
 * applyDirectives -> traitHandlers.get('revpar').onAttach -> revparAnalysis.
 * The negative control proves the registration is load-bearing (without it, the
 * trait is a dead no-op — which is exactly the tier's status quo).
 *
 * HAND-DERIVED RevPAR (real formula, NOT solver output):
 *   availableRooms=200, occupiedRooms=150, totalRevenue=$30,000
 *   occupancyRate = occupied/available   = 150/200      = 0.75
 *   adr           = revenue/occupied     = 30000/150    = 200
 *   RevPAR        = ADR × occupancy       = 200 × 0.75   = 150.00
 *   cross-check   = revenue/available     = 30000/200    = 150.00  (agrees)
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerTravelHospitalityTraitHandlers } from '../runtime';

// Hand-derived expectations (see header arithmetic).
const AVAILABLE_ROOMS = 200;
const OCCUPIED_ROOMS = 150;
const TOTAL_REVENUE = 30_000;
const EXPECTED_OCCUPANCY = 0.75; // 150 / 200
const EXPECTED_ADR = 200; // 30000 / 150
const EXPECTED_REVPAR = 150; // 200 × 0.75  (=== 30000 / 200)

function revparOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'revpar-orb',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'revpar', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('travel-hospitality -> HoloScript runtime integration (revpar)', () => {
  it('runtime dispatch runs the RevPAR solver for a registered @revpar orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerTravelHospitalityTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('revpar_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(
      revparOrb({
        availableRooms: AVAILABLE_ROOMS,
        occupiedRooms: OCCUPIED_ROOMS,
        totalRevenue: TOTAL_REVENUE,
      }) as never
    );
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // Asserted against the HAND derivation above, NOT against solver output:
    //   RevPAR = ADR × occupancy = 200 × 0.75 = 150.00
    expect(summary.revpar as number).toBeCloseTo(EXPECTED_REVPAR, 6);
    expect(summary.adr as number).toBeCloseTo(EXPECTED_ADR, 6);
    expect(summary.occupancyRate as number).toBeCloseTo(EXPECTED_OCCUPANCY, 6);
    expect(summary.availableRooms).toBe(AVAILABLE_ROOMS);
    expect(summary.occupiedRooms).toBe(OCCUPIED_ROOMS);
  });

  it('NEGATIVE CONTROL: without registration the @revpar trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('revpar_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(
      revparOrb({
        availableRooms: AVAILABLE_ROOMS,
        occupiedRooms: OCCUPIED_ROOMS,
        totalRevenue: TOTAL_REVENUE,
      }) as never
    );
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerTravelHospitalityTraitHandlers(runtime);

    await runtime.executeNode(
      revparOrb({
        availableRooms: AVAILABLE_ROOMS,
        occupiedRooms: OCCUPIED_ROOMS,
        totalRevenue: TOTAL_REVENUE,
      }) as never
    );
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['revpar:revpar-orb'] as
      | { revpar?: number; occupancyRate?: number }
      | undefined;
    expect(persisted).toBeDefined();
    // Same hand-derived RevPAR = 150.00.
    expect(persisted?.revpar).toBeCloseTo(EXPECTED_REVPAR, 6);
    expect(persisted?.occupancyRate).toBeCloseTo(EXPECTED_OCCUPANCY, 6);
  });

  it('emits revpar_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerTravelHospitalityTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('revpar_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // Zero available rooms + negative revenue: the real solver validates
    // `availableRooms <= 0` first and throws "availableRooms must be positive",
    // which the handler's try/catch turns into a revpar_error rather than a throw.
    await runtime.executeNode(
      revparOrb({ availableRooms: 0, occupiedRooms: 0, totalRevenue: -5_000 }) as never
    );
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('availableRooms');
  });
});
