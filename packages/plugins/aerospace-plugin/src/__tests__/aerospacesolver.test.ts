/**
 * Aerospace solver tests — aerospace-plugin
 *
 * Reference values verified against:
 *  - Tsiolkovsky K (1903) rocket equation
 *  - Bate R, Mueller D, White J (1971) Fundamentals of Astrodynamics. Dover.
 *  - Anderson J (2011) Introduction to Flight, 7th ed. McGraw-Hill.
 */

import { describe, it, expect } from 'vitest';
import {
  tsiolkovskyDeltaV,
  keplerOrbit,
  aerodynamicDrag,
  machNumber,
  thrustToWeightRatio,
  axialStress,
  buildAerospaceReceipt,
} from '../aerospacesolver';

const G0 = 9.80665;

// ─── Tsiolkovsky Rocket Equation ──────────────────────────────────────────────

describe('tsiolkovskyDeltaV', () => {
  /**
   * Single stage: ΔV = Isp × g₀ × ln(m0/mf)
   * Isp=300s, m0=10000kg, mf=3000kg → ΔV = 300×9.80665×ln(10/3) ≈ 3594 m/s
   */
  it('single stage ΔV matches rocket equation', () => {
    const r = tsiolkovskyDeltaV([{ wetMassKg: 10000, dryMassKg: 3000, isp: 300 }]);
    const expected = 300 * G0 * Math.log(10000 / 3000);
    expect(r.stagesDeltaV[0]).toBeCloseTo(expected, 2);
    expect(r.totalDeltaV).toBeCloseTo(expected, 2);
  });

  it('two stages sum to total ΔV', () => {
    const stages = [
      { wetMassKg: 10000, dryMassKg: 3000, isp: 300 },
      { wetMassKg: 3000,  dryMassKg: 1000, isp: 420 },
    ];
    const r = tsiolkovskyDeltaV(stages);
    expect(r.totalDeltaV).toBeCloseTo(r.stagesDeltaV[0] + r.stagesDeltaV[1], 4);
  });

  it('mass ratio = wetMass / dryMass per stage', () => {
    const r = tsiolkovskyDeltaV([{ wetMassKg: 5000, dryMassKg: 1000, isp: 450 }]);
    expect(r.massRatios[0]).toBeCloseTo(5, 4);
  });

  it('higher Isp → higher ΔV for same mass ratio', () => {
    const low  = tsiolkovskyDeltaV([{ wetMassKg: 5000, dryMassKg: 1000, isp: 300 }]);
    const high = tsiolkovskyDeltaV([{ wetMassKg: 5000, dryMassKg: 1000, isp: 450 }]);
    expect(high.totalDeltaV).toBeGreaterThan(low.totalDeltaV);
  });

  it('throws for zero Isp', () => {
    expect(() => tsiolkovskyDeltaV([{ wetMassKg: 5000, dryMassKg: 1000, isp: 0 }])).toThrow();
  });

  it('throws when dryMass ≥ wetMass', () => {
    expect(() => tsiolkovskyDeltaV([{ wetMassKg: 1000, dryMassKg: 1000, isp: 300 }])).toThrow();
  });

  it('throws for empty stages', () => {
    expect(() => tsiolkovskyDeltaV([])).toThrow();
  });
});

// ─── Keplerian Orbit ──────────────────────────────────────────────────────────

describe('keplerOrbit', () => {
  /**
   * LEO: altitude 400 km → a = 6371 + 400 = 6771 km = 6771000 m
   * T = 2π√(a³/μ) ≈ 5555 s ≈ 92.6 min
   */
  it('LEO orbital period ≈ 92 min', () => {
    const r = keplerOrbit({ semiMajorAxisM: 6_771_000, eccentricity: 0, inclinationDeg: 51.6 });
    expect(r.periodS).toBeGreaterThan(5400);
    expect(r.periodS).toBeLessThan(5700);
  });

  it('circular orbit: apoapsis = periapsis altitude', () => {
    const r = keplerOrbit({ semiMajorAxisM: 6_771_000, eccentricity: 0, inclinationDeg: 0 });
    expect(r.apoapsisAltM).toBeCloseTo(r.periapsisAltM, 0);
  });

  it('elliptical orbit: apoapsis > periapsis', () => {
    const r = keplerOrbit({ semiMajorAxisM: 24_396_000, eccentricity: 0.74, inclinationDeg: 63.4 });
    expect(r.apoapsisAltM).toBeGreaterThan(r.periapsisAltM);
  });

  it('specific orbital energy = −μ/(2a) < 0 (bound orbit)', () => {
    const r = keplerOrbit({ semiMajorAxisM: 6_771_000, eccentricity: 0, inclinationDeg: 0 });
    expect(r.specificEnergyJkg).toBeLessThan(0);
  });

  it('throws for negative semi-major axis', () => {
    expect(() => keplerOrbit({ semiMajorAxisM: -1, eccentricity: 0, inclinationDeg: 0 })).toThrow();
  });

  it('throws for eccentricity ≥ 1', () => {
    expect(() => keplerOrbit({ semiMajorAxisM: 7e6, eccentricity: 1.0, inclinationDeg: 0 })).toThrow();
  });
});

// ─── Aerodynamic Drag ─────────────────────────────────────────────────────────

describe('aerodynamicDrag', () => {
  /**
   * F = Cd × A × 0.5ρv² = 0.5 × Cd × A × ρ × v²
   */
  it('drag force = Cd × A × q', () => {
    const cd = 0.5, A = 2.0, rho = 1.225, v = 100;
    const r = aerodynamicDrag({ cd, referenceAreaM2: A, airDensityKgM3: rho, velocityMs: v });
    const q = 0.5 * rho * v * v;
    expect(r.dragForceN).toBeCloseTo(cd * A * q, 4);
  });

  it('dynamic pressure q = 0.5ρv²', () => {
    const rho = 1.225, v = 50;
    const r = aerodynamicDrag({ cd: 1.0, referenceAreaM2: 1.0, airDensityKgM3: rho, velocityMs: v });
    expect(r.dynamicPressurePa).toBeCloseTo(0.5 * rho * v * v, 4);
  });

  it('zero velocity → zero drag', () => {
    const r = aerodynamicDrag({ cd: 1.0, referenceAreaM2: 1.0, airDensityKgM3: 1.225, velocityMs: 0 });
    expect(r.dragForceN).toBe(0);
  });

  it('throws for negative area', () => {
    expect(() => aerodynamicDrag({ cd: 1.0, referenceAreaM2: -1, airDensityKgM3: 1.225, velocityMs: 100 })).toThrow();
  });
});

// ─── Mach Number ─────────────────────────────────────────────────────────────

describe('machNumber', () => {
  it('Mach = v / speedOfSound', () => {
    const r = machNumber(340, 340);
    expect(r.mach).toBeCloseTo(1.0, 4);
  });

  it('v < 0.8a → subsonic', () => {
    const r = machNumber(200, 340); // Mach ≈ 0.59
    expect(r.regime).toBe('subsonic');
  });

  it('0.8 ≤ M < 1.2 → transonic', () => {
    const r = machNumber(320, 340); // Mach ≈ 0.94
    expect(r.regime).toBe('transonic');
  });

  it('1.2 ≤ M < 5.0 → supersonic', () => {
    const r = machNumber(1000, 340); // Mach ≈ 2.94
    expect(r.regime).toBe('supersonic');
  });

  it('M ≥ 5.0 → hypersonic', () => {
    const r = machNumber(2000, 340); // Mach ≈ 5.88
    expect(r.regime).toBe('hypersonic');
  });

  it('stagnationTempRiseK increases with Mach', () => {
    const low  = machNumber(200, 340);
    const high = machNumber(2000, 340);
    expect(high.stagnationTempRiseK).toBeGreaterThan(low.stagnationTempRiseK);
  });

  it('throws for non-positive speed of sound', () => {
    expect(() => machNumber(300, 0)).toThrow();
  });
});

// ─── Thrust-to-Weight ─────────────────────────────────────────────────────────

describe('thrustToWeightRatio', () => {
  it('TWR = thrust / (mass × g₀)', () => {
    const r = thrustToWeightRatio(20000, 1000);
    expect(r.twr).toBeCloseTo(20000 / (1000 * G0), 4);
  });

  it('TWR > 1 → canLiftOff = true', () => {
    const r = thrustToWeightRatio(20000, 1000); // TWR ≈ 2.04
    expect(r.canLiftOff).toBe(true);
  });

  it('TWR < 1 → canLiftOff = false', () => {
    const r = thrustToWeightRatio(5000, 1000); // TWR ≈ 0.51
    expect(r.canLiftOff).toBe(false);
  });
});

// ─── Axial Stress ─────────────────────────────────────────────────────────────

describe('axialStress', () => {
  it('stress σ = F/A', () => {
    const r = axialStress(10000, 0.01, 200e9, 1.0, 300e6);
    expect(r.stressPa).toBeCloseTo(10000 / 0.01, 0);
  });

  it('deformation δ = FL/AE', () => {
    const F = 10000, A = 0.01, E = 200e9, L = 1.0;
    const r = axialStress(F, A, E, L, 300e6);
    expect(r.deformationM).toBeCloseTo((F * L) / (A * E), 10);
  });

  it('safety factor = ultimateStress / stress', () => {
    const r = axialStress(10000, 0.01, 200e9, 1.0, 3_000_000);
    expect(r.safetyFactor).toBeCloseTo(3_000_000 / (10000 / 0.01), 4);
  });

  it('throws for zero area', () => {
    expect(() => axialStress(10000, 0, 200e9, 1.0, 300e6)).toThrow();
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildAerospaceReceipt', () => {
  it('plugin=aerospace and CAEL event correct', () => {
    const receipt = buildAerospaceReceipt({ converged: true });
    expect(receipt.plugin).toBe('aerospace');
    expect(receipt.cael.event).toBe('aerospace.trajectory_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for nominal mission', () => {
    // mass ratio 20 → ΔV ≈ 10 278 m/s > 9400 LEO threshold
    const deltaV = tsiolkovskyDeltaV([{ wetMassKg: 500000, dryMassKg: 25000, isp: 350 }]);
    expect(deltaV.totalDeltaV).toBeGreaterThan(9400);
    const receipt = buildAerospaceReceipt({ deltaV, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false for insufficient ΔV', () => {
    const deltaV = tsiolkovskyDeltaV([{ wetMassKg: 2000, dryMassKg: 1500, isp: 300 }]); // low mass ratio
    expect(deltaV.totalDeltaV).toBeLessThan(9400);
    const receipt = buildAerospaceReceipt({ deltaV, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('accepted=false for structure below safety factor 1.5', () => {
    const stress = axialStress(1e6, 0.001, 70e9, 0.5, 1.2e9); // SF = 1.2 < 1.5
    expect(stress.safetyFactor).toBeLessThan(1.5);
    const receipt = buildAerospaceReceipt({ stress, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
  });

  it('uses provided runId', () => {
    const receipt = buildAerospaceReceipt({ converged: true }, { runId: 'aero-test-001' });
    expect(receipt.runId).toBe('aero-test-001');
  });
});
