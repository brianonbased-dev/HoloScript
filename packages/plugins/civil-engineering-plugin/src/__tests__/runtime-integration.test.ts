/**
 * Integration proof: the civil-engineering `dsm_frame_2d` trait, once registered
 * via the runtime's real `registerTrait` seam, is dispatched BY THE RUNTIME and
 * runs the deterministic Direct-Stiffness-Method 2D frame solver — NOT called
 * directly as a handler object.
 *
 * Mirrors government-civic-plugin's runtime-integration reference (civic_decision).
 * Drives the real path: executeNode(orb) -> orb-executor -> applyDirectives ->
 * traitHandlers.get('dsm_frame_2d').onAttach -> solveFrame2D.
 * The negative control proves the registration is load-bearing (without it, the
 * trait is a dead no-op — which is exactly the tier's status quo).
 */
import { describe, it, expect } from 'vitest';
import { HoloScriptRuntime } from '@holoscript/core/runtime';
import { registerCivilEngineeringTraitHandlers } from '../runtime';
import type { Frame2DModel } from '../frame2d';

// ─── Hand-derived statically-determinate cantilever ────────────────────────────
//
// A single horizontal member, fixed at A, free at B, with a downward tip load.
// A cantilever is statically determinate, so its support reactions follow
// EXACTLY from rigid-body global equilibrium — independent of the FEM mesh.
//
//   A=(0,0) ●━━━━━━━━━━━━● B=(4,0)        Fy = -50 kN (down) at B
//   (fixed: ux,uy,θz)      (free)
//
// Steel member: E = 200 GPa, I = 1e-4 m⁴, A_area = 5e-3 m², L = 4 m.
//
// GLOBAL STATIC EQUILIBRIUM (exact, mesh-independent):
//   ΣFx = 0           => Rx_A = 0
//   ΣFy = 0           => Ry_A + (-50) = 0          => Ry_A = +50 kN
//   ΣM_about_A = 0    => moment of applied load about A = x·Fy - y·Fx
//                        = 4·(-50) - 0·0 = -200 kN·m
//                        => Mz_A - 200 = 0          => |Mz_A| = P·L = 50·4 = 200 kN·m
//
// TIP DEFLECTION (Euler-Bernoulli cantilever closed form):
//   uy_B = -P·L³/(3·E·I)
//        = -50 · 4³ / (3 · 200e6 kN/m² · 1e-4 m⁴)
//        = -(50·64) / (60000)
//        = -3200 / 60000
//        = -0.0533333… m   (≈ 53.33 mm downward)
//
// The existing frame2d.test.ts confirms the solver reproduces both within 1%.
// Here we assert against THIS hand derivation, not solver output.
const E_GPa = 200;
const I_m4 = 1e-4;
const A_m2 = 5e-3;
const L = 4;
const P = 50; // kN

const EXPECTED_RY = P; // +50 kN  (ΣFy = 0)
const EXPECTED_MZ_MAG = P * L; // 200 kN·m  (ΣM_A = 0)
const EXPECTED_TIP_UY = -(P * L ** 3) / (3 * E_GPa * 1e6 * I_m4); // -0.0533333… m

const CANTILEVER: Frame2DModel = {
  id: 'cantilever-hand-check',
  nodes: [
    { id: 'A', x: 0, y: 0 },
    { id: 'B', x: L, y: 0 },
  ],
  elements: [
    {
      id: 'e1',
      fromNodeId: 'A',
      toNodeId: 'B',
      elasticModulusGPa: E_GPa,
      momentOfInertiaM4: I_m4,
      areaM2: A_m2,
    },
  ],
  supports: [
    { nodeId: 'A', ux: true, uy: true, theta: true }, // fixed
  ],
  nodalLoads: [{ nodeId: 'B', Fy: -P }],
};

// Under-constrained model: only 1 restrained DOF (< 3 required to prevent
// rigid-body motion). validateFrame2DModel flags "insufficient supports", so
// the handler emits dsm_frame_2d_error rather than letting the solver throw.
const UNDER_CONSTRAINED: Frame2DModel = {
  id: 'under-constrained',
  nodes: [
    { id: 'A', x: 0, y: 0 },
    { id: 'B', x: L, y: 0 },
  ],
  elements: [
    {
      id: 'e1',
      fromNodeId: 'A',
      toNodeId: 'B',
      elasticModulusGPa: E_GPa,
      momentOfInertiaM4: I_m4,
      areaM2: A_m2,
    },
  ],
  supports: [{ nodeId: 'A', ux: true }], // only 1 DOF restrained
  nodalLoads: [{ nodeId: 'B', Fy: -P }],
};

function dsmFrame2dOrb(config: Record<string, unknown>): unknown {
  return {
    type: 'orb',
    name: 'frame',
    properties: {},
    methods: [],
    position: [0, 0, 0],
    hologram: { shape: 'orb', color: '#fff', size: 1, glow: false, interactive: false },
    directives: [{ type: 'trait', name: 'dsm_frame_2d', config }],
  };
}

/** Flush the runtime's async emit dispatch so `on` listeners have fired. */
const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

describe('civil-engineering -> HoloScript runtime integration (dsm_frame_2d)', () => {
  it('runtime dispatch runs the DSM frame solver for a registered @dsm_frame_2d orb', async () => {
    const runtime = new HoloScriptRuntime();
    registerCivilEngineeringTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('dsm_frame_2d_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(dsmFrame2dOrb({ model: CANTILEVER }) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const summary = solved[0];
    expect(summary.converged).toBe(true);
    expect(summary.nodeCount).toBe(2);
    expect(summary.elementCount).toBe(1);

    // Hand-checked against global static equilibrium of the cantilever:
    //   Ry_A = +P = +50 kN ; |Mz_A| = P·L = 200 kN·m ; Rx_A = 0.
    const reactions = summary.reactions as Array<{
      nodeId: string;
      Rx: number;
      Ry: number;
      Mz: number;
    }>;
    const rA = reactions.find((r) => r.nodeId === 'A')!;
    expect(rA.Rx).toBeCloseTo(0, 1);
    expect(rA.Ry).toBeCloseTo(EXPECTED_RY, 1); // +50 kN
    expect(Math.abs(rA.Mz)).toBeCloseTo(EXPECTED_MZ_MAG, 1); // 200 kN·m
  });

  it('runtime dispatch produces the hand-derived tip deflection in the solved event', async () => {
    const runtime = new HoloScriptRuntime();
    registerCivilEngineeringTraitHandlers(runtime);

    const solved: Array<Record<string, unknown>> = [];
    runtime.on('dsm_frame_2d_solved', (e: unknown) => {
      solved.push(e as Record<string, unknown>);
    });

    await runtime.executeNode(dsmFrame2dOrb({ model: CANTILEVER }) as never);
    await flush();

    expect(solved).toHaveLength(1);
    const disp = solved[0].nodeDisplacements as Array<{ nodeId: string; uy: number }>;
    const tip = disp.find((d) => d.nodeId === 'B')!;
    // Hand-checked: uy_B = -P·L³/(3EI) = -0.0533333… m (FEM rounding -> toBeCloseTo).
    expect(tip.uy).toBeCloseTo(EXPECTED_TIP_UY, 4);
  });

  it('NEGATIVE CONTROL: without registration the @dsm_frame_2d trait is a dead no-op', async () => {
    const runtime = new HoloScriptRuntime(); // intentionally NOT registered
    const solved: unknown[] = [];
    runtime.on('dsm_frame_2d_solved', (e: unknown) => solved.push(e));

    await runtime.executeNode(dsmFrame2dOrb({ model: CANTILEVER }) as never);
    await flush();

    expect(solved).toHaveLength(0);
  });

  it('persists the solver result into durable runtime state on ATTACH', async () => {
    const runtime = new HoloScriptRuntime();
    registerCivilEngineeringTraitHandlers(runtime);

    await runtime.executeNode(dsmFrame2dOrb({ model: CANTILEVER }) as never);
    await flush();

    const state = runtime.getState() as Record<string, unknown>;
    const persisted = state['dsm_frame_2d:frame'] as
      | {
          converged?: boolean;
          nodeCount?: number;
          reactions?: Array<{ nodeId: string; Ry: number }>;
        }
      | undefined;
    expect(persisted).toBeDefined();
    expect(persisted?.converged).toBe(true);
    expect(persisted?.nodeCount).toBe(2);
    const rA = persisted?.reactions?.find((r) => r.nodeId === 'A');
    expect(rA?.Ry).toBeCloseTo(EXPECTED_RY, 1); // hand-derived +50 kN survives into state
  });

  it('emits dsm_frame_2d_error (does not throw through the runtime) for an under-constrained model', async () => {
    const runtime = new HoloScriptRuntime();
    registerCivilEngineeringTraitHandlers(runtime);

    const errors: Array<Record<string, unknown>> = [];
    const solved: unknown[] = [];
    runtime.on('dsm_frame_2d_error', (e: unknown) => {
      errors.push(e as Record<string, unknown>);
    });
    runtime.on('dsm_frame_2d_solved', (e: unknown) => solved.push(e));

    // Only 1 restrained DOF — validateFrame2DModel reports "insufficient
    // supports", which the handler turns into a single error event, no throw.
    await runtime.executeNode(dsmFrame2dOrb({ model: UNDER_CONSTRAINED }) as never);
    await flush();

    expect(errors).toHaveLength(1);
    expect(solved).toHaveLength(0);
    expect(String(errors[0].error)).toContain('insufficient supports');
  });
});
