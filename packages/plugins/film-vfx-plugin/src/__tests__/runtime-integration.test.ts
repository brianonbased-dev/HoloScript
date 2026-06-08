/**
 * Integration proof: the film-vfx `cinematography_exposure` trait, once
 * registered via the runtime's real `registerTrait` seam, is dispatched BY THE
 * RUNTIME and runs the deterministic exposure-value solver — NOT called
 * directly as a handler object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference
 * (civic_decision). Drives the real path:
 *   executeNode(orb) -> orb-executor -> applyDirectives ->
 *   traitHandlers.get('cinematography_exposure').onAttach -> exposureValue.
 * The negative control proves the registration is load-bearing (without it,
 * the trait is a dead no-op — which is exactly the tier's status quo).
 *
 * EV formula under test (filmvfxsolver.ts:120-131):
 *   ev100 = log₂(N² × 100 / (t × ISO))  =  log₂(N²/t) − log₂(ISO/100)
 * The solver APPLIES the ISO term (case `cinematography_exposure_solved (ISO≠100)`
 * below exercises it explicitly so the assertion can't pass against a bare
 * log₂(N²/t) implementation).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerFilmVfxTraitHandlers } from '../runtime';

function exposureOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'cinematography',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'cinematography_exposure', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('film-vfx -> HoloScript runtime integration (cinematography_exposure)', () => {
  it('runtime dispatch runs the exposure-value solver for a registered @cinematography_exposure orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerFilmVfxTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('cinematography_exposure_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    // f/8, t = 1/250 s = 0.004, ISO 100.
    await runtime.executeNode(
      exposureOrb({ aperture: 8, shutterSpeedS: 1 / 250, iso: 100 }) as never,
    );
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // HAND-DERIVE (formula: ev100 = log2(N^2 * 100 / (t * ISO))):
    //   N = 8        -> N^2 = 64
    //   N^2 * 100    = 6400
    //   t * ISO      = 0.004 * 100 = 0.4
    //   ratio        = 6400 / 0.4 = 16000
    //   ev100        = log2(16000) = 13.965784284662087
    // (ISO 100 => ISO term log2(100/100) = 0, so this equals log2(N^2/t).)
    expect(summary.ev100 as number).toBeCloseTo(13.965784284662087, 6);
    // exposureIndex = ISO / 100 = 100 / 100 = 1.
    expect(summary.exposureIndex as number).toBeCloseTo(1, 6);
    // dynamicRangeStops is a fixed sensor-latitude constant in the solver.
    expect(summary.dynamicRangeStops as number).toBe(14);
    expect(summary.aperture as number).toBe(8);
    expect(summary.iso as number).toBe(100);
  });

  it('cinematography_exposure_solved (ISO≠100): the solver APPLIES the −log2(ISO/100) term', async () => {
    const runtime = new HoloScriptRuntime();
    registerFilmVfxTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('cinematography_exposure_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    // f/2.8, t = 1/50 s = 0.02, ISO 800 — chosen so the ISO term is non-zero.
    await runtime.executeNode(
      exposureOrb({ aperture: 2.8, shutterSpeedS: 1 / 50, iso: 800 }) as never,
    );
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    // HAND-DERIVE (formula: ev100 = log2(N^2 * 100 / (t * ISO))):
    //   N = 2.8      -> N^2 = 7.84
    //   N^2 * 100    = 784
    //   t * ISO      = 0.02 * 800 = 16
    //   ratio        = 784 / 16 = 49
    //   ev100        = log2(49) = 5.614709844115208
    // Cross-check the ISO decomposition (proves the term is applied, NOT dropped):
    //   base   = log2(N^2 / t) = log2(7.84 / 0.02) = log2(392) = 8.614709844115207
    //   isoTerm= log2(ISO/100) = log2(800/100) = log2(8) = 3
    //   base - isoTerm = 8.614709844115207 - 3 = 5.614709844115207  (== log2(49))
    expect(summary.ev100 as number).toBeCloseTo(5.614709844115208, 6);
    // exposureIndex = ISO / 100 = 800 / 100 = 8.
    expect(summary.exposureIndex as number).toBeCloseTo(8, 6);
  });

  it('NEGATIVE CONTROL: without registration the @cinematography_exposure trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('cinematography_exposure_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(
      exposureOrb({ aperture: 8, shutterSpeedS: 1 / 250, iso: 100 }) as never,
    );
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerFilmVfxTraitHandlers(runtime);

    await runtime.executeNode(
      exposureOrb({ aperture: 8, shutterSpeedS: 1 / 250, iso: 100 }) as never,
    );
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['cinematography_exposure:cinematography'] as
      | { ev100?: number; exposureIndex?: number }
      | undefined;
    expect(persisted).toBeDefined();
    // Same hand-derivation as the dispatch test: log2(16000) = 13.965784284662087.
    expect(persisted?.ev100).toBeCloseTo(13.965784284662087, 6);
    expect(persisted?.exposureIndex).toBeCloseTo(1, 6);
  });

  it('emits cinematography_exposure_error (does not throw through the runtime) for invalid config', async () => {
    const runtime = new HoloScriptRuntime();
    registerFilmVfxTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    runtime.on('cinematography_exposure_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });

    // aperture = 0 is invalid (the solver throws "Aperture must be positive",
    // and the registrar guard rejects it pre-solve); the handler's validation /
    // try-catch turns it into a cinematography_exposure_error rather than a throw.
    await runtime.executeNode(
      exposureOrb({ aperture: 0, shutterSpeedS: 1 / 250, iso: 100 }) as never,
    );
    await flush();

    expect(errors).toHaveLength(1);
    expect(String(errors[0].error)).toContain('aperture');
  });
});
