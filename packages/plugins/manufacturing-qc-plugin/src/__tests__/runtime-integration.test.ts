/**
 * Integration proof: the manufacturing-qc `spc` trait, once registered via the
 * runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and runs
 * the deterministic SPC capability solver (`computeCapability`) — NOT called
 * directly as a handler object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference
 * (civic_decision). Drives the real path: executeNode(orb) -> orb-executor ->
 * applyDirectives -> traitHandlers.get('spc').onAttach -> computeCapability.
 * The negative control proves the registration is load-bearing (without it, the
 * trait is a dead no-op — which is exactly the tier's status quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerManufacturingQcTraitHandlers } from '../runtime';
import type { Subgroup } from '../spc';

// ── Hand-derived capability dataset ────────────────────────────────────────────
//
// computeCapability estimates Cp/Cpk from the WITHIN-subgroup σ̂ = R̅ / d₂
// (used because all subgroups are the same size n and 2 ≤ n ≤ 10). We pick a
// dataset whose within-subgroup σ̂ is exact:
//
//   Two subgroups of size n = 2, both [9, 11]:
//     range(each)      = 11 − 9 = 2
//     R̅               = (2 + 2) / 2 = 2
//     d₂[2]            = 1.128            (Montgomery / ASTM constant in spc.ts)
//     withinSigma σ̂   = R̅ / d₂ = 2 / 1.128 = 1.7730496453900710
//
//   allValues = [9, 11, 9, 11]  ⇒  processMean μ = 40 / 4 = 10
//   Spec limits LSL = 4, USL = 16  ⇒  specWidth = USL − LSL = 12 (symmetric about μ = 10)
//
//   Cp  = specWidth / (6·σ̂) = 12 / (6 · 1.7730496…) = 2 / 1.7730496… = 1.128
//   CpkUpper = (USL − μ)/(3·σ̂) = (16 − 10)/(3 · 1.7730496…) = 6 / 5.3191489… = 1.128
//   CpkLower = (μ − LSL)/(3·σ̂) = (10 −  4)/(3 · 1.7730496…) = 6 / 5.3191489… = 1.128
//   Cpk = min(CpkUpper, CpkLower) = 1.128
//
//   (The clean 1.128 is not a coincidence: specWidth = 6·R̅ = 12 and d₂ cancels,
//    leaving Cp = Cpk = d₂[2] exactly. capable = Cpk ≥ 1.33 ⇒ 1.128 < 1.33 ⇒ false.)
const HAND_SUBGROUPS: Subgroup[] = [
  { index: 1, values: [9, 11] },
  { index: 2, values: [9, 11] },
];
const HAND_ALL_VALUES = [9, 11, 9, 11];
const HAND_LSL = 4;
const HAND_USL = 16;

const EXPECTED_CP = 1.128;
const EXPECTED_CPK = 1.128;
const EXPECTED_MEAN = 10;

function spcOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'spc',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'spc', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('manufacturing-qc -> HoloScript runtime integration (spc)', () => {
  it('runtime dispatch runs the SPC capability solver for a registered @spc orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerManufacturingQcTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('spc_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(
      spcOrb({
        allValues: HAND_ALL_VALUES,
        subgroups: HAND_SUBGROUPS,
        lsl: HAND_LSL,
        usl: HAND_USL,
      }) as never
    );
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // Assert against the HAND derivation above, not against solver output.
    expect(summary.processMean as number).toBeCloseTo(EXPECTED_MEAN, 9);
    expect(summary.Cp as number).toBeCloseTo(EXPECTED_CP, 9);
    expect(summary.Cpk as number).toBeCloseTo(EXPECTED_CPK, 9);
    // Cpk = 1.128 < 1.33 ⇒ process not capable.
    expect(summary.capable).toBe(false);
    expect(summary.valueCount).toBe(4);
    expect(summary.subgroupCount).toBe(2);
  });

  it('NEGATIVE CONTROL: without registration the @spc trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('spc_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(
      spcOrb({
        allValues: HAND_ALL_VALUES,
        subgroups: HAND_SUBGROUPS,
        lsl: HAND_LSL,
        usl: HAND_USL,
      }) as never
    );
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerManufacturingQcTraitHandlers(runtime);

    await runtime.executeNode(
      spcOrb({
        allValues: HAND_ALL_VALUES,
        subgroups: HAND_SUBGROUPS,
        lsl: HAND_LSL,
        usl: HAND_USL,
      }) as never
    );
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['spc:spc'] as
      | { Cp?: number; Cpk?: number; capable?: boolean }
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted?.Cp).toBeCloseTo(EXPECTED_CP, 9);
    expect(persisted?.Cpk).toBeCloseTo(EXPECTED_CPK, 9);
    expect(persisted?.capable).toBe(false);
  });

  it('emits spc_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerManufacturingQcTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('spc_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // USL (4) <= LSL (10): the real solver throws "[spc] usl must be > lsl",
    // which the handler's try/catch turns into an spc_error rather than a throw.
    await runtime.executeNode(
      spcOrb({
        allValues: HAND_ALL_VALUES,
        subgroups: HAND_SUBGROUPS,
        lsl: 10,
        usl: 4,
      }) as never
    );
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('usl must be > lsl');
  });
});
