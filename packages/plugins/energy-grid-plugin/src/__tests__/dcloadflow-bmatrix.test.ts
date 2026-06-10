/**
 * DC load flow correctness tests for energysolver.ts:dcLoadFlow
 *
 * The original sequential-propagation implementation is wrong for meshed
 * networks: it assigns flowMW = from.powerMW (the from-bus injection only),
 * ignoring all upstream accumulated flows and the full network topology.
 *
 * The fix implements standard DC power flow using the reduced susceptance
 * (B-prime) matrix, Gaussian elimination with partial pivoting, and branch
 * flows computed from angle differences.
 *
 * Analytic reference — 3-bus meshed network
 * ─────────────────────────────────────────
 * Bus layout:
 *   Bus 1 (slack, θ₁ = 0)    ← not in B' system
 *   Bus 2: P₂ = +100 MW (generator)
 *   Bus 3: P₃ = -80  MW (load)
 *
 * Branches (all reactance in pu, baseMVA = 100):
 *   L12: from 1→2, X = 0.2 pu   → b₁₂ = 5
 *   L13: from 1→3, X = 0.25 pu  → b₁₃ = 4
 *   L23: from 2→3, X = 0.1 pu   → b₂₃ = 10
 *
 * B-prime (reduced, slack bus 1 removed):
 *   B' = [ b₁₂ + b₂₃,    -b₂₃  ] = [15, -10]
 *        [   -b₂₃,    b₁₃ + b₂₃] = [-10,  14]
 *
 * Solve B' · θ = P/baseMVA = [1.0, -0.8]:
 *   15·θ₂ - 10·θ₃ = 1.0
 *  -10·θ₂ + 14·θ₃ = -0.8
 *
 * Det = 15×14 − (−10)×(−10) = 210 − 100 = 110
 * θ₂ = (14×1.0 − (−10)×(−0.8)) / 110 = (14 − 8) / 110 = 6/110 ≈ 0.054545 rad
 * θ₃ = (15×(−0.8) − (−10)×1.0) / 110 = (−12 + 10) / 110 = −2/110 ≈ −0.018182 rad
 *
 * Branch flows (MW = (θᵢ − θⱼ) / Xᵢⱼ × baseMVA):
 *   F₁₂ = (0 − θ₂) / 0.2 × 100 = −θ₂ × 500 ≈ −27.27 MW  (flows 1→2 or 2→1?)
 *        Sign convention: flow positive from→to means MW leaves from-bus.
 *        θ₁ = 0, θ₂ > 0 → F₁₂ = (θ₁ − θ₂)/X × 100 = −27.27 MW (flows 2→1)
 *   F₁₃ = (θ₁ − θ₃) / 0.25 × 100 = (+0.018182) × 400 ≈ +7.27 MW (flows 1→3)
 *   F₂₃ = (θ₂ − θ₃) / 0.1 × 100  = (0.054545 + 0.018182) × 1000 ≈ +72.73 MW
 *
 * Balance check:
 *   Bus 2: P₂ = +100 MW (generation). Flows leaving bus 2: F₂₁ = +27.27, F₂₃ = +72.73 → total = 100 ✓
 *   Bus 3: P₃ = −80 MW (load).  Flows arriving: F₁₃ = 7.27 + F₂₃ = 72.73 → total = 80 ✓
 *
 * These values are the analytic ground truth for the test assertions.
 */

import { describe, it, expect } from 'vitest';
import { dcLoadFlow } from '../energysolver';
import type { GridBus, GridBranch } from '../energysolver';

// ─── Analytic 3-bus meshed network ────────────────────────────────────────────

const buses3: GridBus[] = [
  { id: 'B1', powerMW: 0, isSlack: true },
  { id: 'B2', powerMW: 100 },  // 100 MW generator
  { id: 'B3', powerMW: -80 },  // 80 MW load
];

const branches3: GridBranch[] = [
  { fromBusId: 'B1', toBusId: 'B2', reactancePu: 0.2 },
  { fromBusId: 'B1', toBusId: 'B3', reactancePu: 0.25 },
  { fromBusId: 'B2', toBusId: 'B3', reactancePu: 0.1 },
];

// Analytic solution (derived above, baseMVA = 100 assumed by dcLoadFlow):
const THETA_2 = 6 / 110;        // ≈ 0.054545 rad
const THETA_3 = -2 / 110;       // ≈ −0.018182 rad
// Branch flows from (θᵢ − θⱼ) / Xᵢⱼ × baseMVA (100 MVA):
const BASE_MVA = 100;
const F12_ANALYTIC = ((0 - THETA_2) / 0.2) * BASE_MVA;   // ≈ −27.27 MW
const F13_ANALYTIC = ((0 - THETA_3) / 0.25) * BASE_MVA;  // ≈ +7.27 MW
const F23_ANALYTIC = ((THETA_2 - THETA_3) / 0.1) * BASE_MVA; // ≈ +72.73 MW

describe('dcLoadFlow — 3-bus meshed network (analytic)', () => {
  it('slack bus has angle = 0', () => {
    const r = dcLoadFlow(buses3, branches3);
    expect(r.angles['B1']).toBeCloseTo(0, 6);
  });

  it('bus 2 voltage angle matches analytic solution', () => {
    const r = dcLoadFlow(buses3, branches3);
    expect(r.angles['B2']).toBeCloseTo(THETA_2, 4);
  });

  it('bus 3 voltage angle matches analytic solution', () => {
    const r = dcLoadFlow(buses3, branches3);
    expect(r.angles['B3']).toBeCloseTo(THETA_3, 4);
  });

  it('branch L12 flow matches analytic (≈ −27.27 MW)', () => {
    const r = dcLoadFlow(buses3, branches3);
    const f12 = r.flows.find((f) => f.fromBusId === 'B1' && f.toBusId === 'B2');
    expect(f12).toBeDefined();
    expect(f12!.flowMW).toBeCloseTo(F12_ANALYTIC, 2);
  });

  it('branch L13 flow matches analytic (≈ +7.27 MW)', () => {
    const r = dcLoadFlow(buses3, branches3);
    const f13 = r.flows.find((f) => f.fromBusId === 'B1' && f.toBusId === 'B3');
    expect(f13).toBeDefined();
    expect(f13!.flowMW).toBeCloseTo(F13_ANALYTIC, 2);
  });

  it('branch L23 flow matches analytic (≈ +72.73 MW)', () => {
    const r = dcLoadFlow(buses3, branches3);
    const f23 = r.flows.find((f) => f.fromBusId === 'B2' && f.toBusId === 'B3');
    expect(f23).toBeDefined();
    expect(f23!.flowMW).toBeCloseTo(F23_ANALYTIC, 2);
  });

  it('power balance at bus 2: net injection = 100 MW', () => {
    const r = dcLoadFlow(buses3, branches3);
    // Sign convention: flowMW > 0 means MW flows from→to.
    // F12 is defined from B1 to B2. If F12 < 0, power actually flows B2→B1.
    // F23 is defined from B2 to B3. If F23 > 0, power flows B2→B3.
    //
    // Net injection at B2 = -(flow B1→B2) + (flow B2→B3 reversed) ...
    // More directly: power supplied by B2 = power leaving via F12 (reversed sign)
    //   + power leaving via F23.
    // Power leaving B2 via L12 = -F12 (since F12 from B1→B2 is negative, power
    //   actually leaves B2 toward B1, i.e., B2 supplies +|F12| to B1).
    // Power leaving B2 via L23 = +F23 (B2 supplies to B3).
    const f12 = r.flows.find((f) => f.fromBusId === 'B1' && f.toBusId === 'B2')!.flowMW;
    const f23 = r.flows.find((f) => f.fromBusId === 'B2' && f.toBusId === 'B3')!.flowMW;
    // Net MW supplied by B2 = -F12 + F23 = 27.27 + 72.73 = 100 MW ✓
    const netAtB2 = -f12 + f23;
    expect(netAtB2).toBeCloseTo(100, 1);
  });
});

// ─── Radial 2-bus single-branch (degenerate case) ─────────────────────────────

describe('dcLoadFlow — 2-bus radial (basic sanity)', () => {
  const radialBuses: GridBus[] = [
    { id: 'S', powerMW: 0, isSlack: true },
    { id: 'L', powerMW: -50 },
  ];
  const radialBranches: GridBranch[] = [
    { fromBusId: 'S', toBusId: 'L', reactancePu: 0.1 },
  ];

  it('slack angle = 0', () => {
    const r = dcLoadFlow(radialBuses, radialBranches);
    expect(r.angles['S']).toBeCloseTo(0, 6);
  });

  it('load bus angle = P × X = −50 × 0.1 / baseMVA (if baseMVA=100: −0.05)', () => {
    // For a 2-bus system: θ_L = P_L × X = (−50/100) × 0.1 = −0.05 rad
    const r = dcLoadFlow(radialBuses, radialBranches);
    expect(r.angles['L']).toBeCloseTo(-0.05, 5);
  });

  it('branch flow matches injection (50 MW)', () => {
    const r = dcLoadFlow(radialBuses, radialBranches);
    const f = r.flows[0]!;
    // Flow = (θ_S − θ_L) / X = (0 − (−0.05)) / 0.1 = 0.5 pu × baseMVA = 50 MW
    expect(Math.abs(f.flowMW)).toBeCloseTo(50, 2);
  });
});

// ─── Error cases inherited from old tests ─────────────────────────────────────

describe('dcLoadFlow — error handling', () => {
  it('throws with no buses', () => {
    expect(() => dcLoadFlow([], [])).toThrow();
  });

  it('throws with no slack bus', () => {
    const noSlack: GridBus[] = [{ id: 'A', powerMW: 50 }];
    expect(() => dcLoadFlow(noSlack, [])).toThrow();
  });

  it('returns correct totalGenerationMW and totalLoadMW', () => {
    const r = dcLoadFlow(buses3, branches3);
    expect(r.totalGenerationMW).toBeCloseTo(100, 1);
    expect(r.totalLoadMW).toBeCloseTo(80, 1);
  });
});
