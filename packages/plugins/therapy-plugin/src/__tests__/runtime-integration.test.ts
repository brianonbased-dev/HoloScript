/**
 * Integration proof: the therapy `phq9_screen` trait, once registered via the
 * runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and runs
 * the deterministic PHQ-9 depression-screening solver — NOT called directly as
 * a handler object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference
 * (civic_decision). Drives the real path:
 *   executeNode(orb) -> orb-executor -> applyDirectives ->
 *   traitHandlers.get('phq9_screen').onAttach -> phq9Score.
 * The negative control proves the registration is load-bearing (without it the
 * trait is a dead no-op — which is exactly the tier's status quo).
 *
 * CLINICAL DISCLAIMER: validates DECISION SUPPORT math only.
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerTherapyTraitHandlers } from '../runtime';
import type { LikertResponse } from '../therapysolver';

// HAND-DERIVED FIXTURE (against the EXACT cutoffs in therapysolver.ts phq9Score):
//   responses = nine items each = 2.
//   totalScore = 2+2+2+2+2+2+2+2+2 = 18.
//   severity bands: <=4 none, <=9 mild, <=14 moderate, 15-19 moderately-severe,
//   20-27 severe. 18 is in [15,19] => 'moderately-severe' (interior, not a
//   boundary — a strong discriminating assertion).
//   item9Score = responses[8] = 2.
//   positiveScreening = (18 >= 10) = true.
const NINE_TWOS: LikertResponse[] = [2, 2, 2, 2, 2, 2, 2, 2, 2];
const EXPECTED_TOTAL = 18;
const EXPECTED_SEVERITY = 'moderately-severe';
const EXPECTED_ITEM9 = 2;

function phq9ScreenOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'screen',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'phq9_screen', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('therapy -> HoloScript runtime integration (phq9_screen)', () => {
  it('runtime dispatch runs the PHQ-9 solver for a registered @phq9_screen orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerTherapyTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('phq9_screen_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(phq9ScreenOrb({ responses: NINE_TWOS }) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // Hand-checked: nine items each 2 => total 18 => band 'moderately-severe',
    // item9 = 2, positive screen (18 >= 10). Asserted against the hand
    // derivation above, NOT solver output.
    expect(summary.totalScore).toBe(EXPECTED_TOTAL);
    expect(summary.severity).toBe(EXPECTED_SEVERITY);
    expect(summary.item9Score).toBe(EXPECTED_ITEM9);
    expect(summary.positiveScreening).toBe(true);
  });

  it('NEGATIVE CONTROL: without registration the @phq9_screen trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('phq9_screen_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(phq9ScreenOrb({ responses: NINE_TWOS }) as never);
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerTherapyTraitHandlers(runtime);

    await runtime.executeNode(phq9ScreenOrb({ responses: NINE_TWOS }) as never);
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['phq9_screen:screen'] as
      | { totalScore?: number; severity?: string }
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted?.totalScore).toBe(EXPECTED_TOTAL);
    expect(persisted?.severity).toBe(EXPECTED_SEVERITY);
  });

  it('emits phq9_screen_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerTherapyTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('phq9_screen_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // Eight responses instead of nine — the real solver throws
    // "PHQ-9 requires exactly 9 responses", which the handler's try/catch turns
    // into a phq9_screen_error rather than a throw.
    const tooFew = [2, 2, 2, 2, 2, 2, 2, 2] as LikertResponse[];
    await runtime.executeNode(phq9ScreenOrb({ responses: tooFew }) as never);
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('9 responses');
  });
});
