/**
 * bridge-engineering.scenario.ts — LIVING-SPEC: Bridge Structural Engineer
 *
 * Persona: Dr. Patel — structural engineer who tests bridge designs
 * with load analysis, stress calculations, and safety factor verification.
 */

import { describe, it, expect } from 'vitest';
import {
  normalStress, shearStress, vonMisesStress, safetyFactor,
  isStructurallySafe, beamDeflection, naturalFrequency,
  totalLoad, deadLoadWeight, fatigueLifeCycles,
  feaMeshGenerate, windResonanceCheck,
  MATERIALS,
  type AppliedLoad, type BridgeSpan,
} from '@/lib/bridgeEngineering';

describe('Scenario: Bridge Engineering — Materials', () => {
  it('steel yield = 250 MPa', () => {
    expect(MATERIALS.steel.yieldStrengthMPa).toBe(250);
  });

  it('concrete has lower yield than steel', () => {
    expect(MATERIALS.concrete.yieldStrengthMPa).toBeLessThan(MATERIALS.steel.yieldStrengthMPa);
  });

  it('composite has highest yield (500 MPa)', () => {
    expect(MATERIALS.composite.yieldStrengthMPa).toBe(500);
  });

  it('steel is densest (7850 kg/m³)', () => {
    expect(MATERIALS.steel.densityKgM3).toBe(7850);
    expect(MATERIALS.timber.densityKgM3).toBeLessThan(MATERIALS.steel.densityKgM3);
  });
});

describe('Scenario: Bridge Engineering — Stress Analysis', () => {
  it('normalStress = F/A in MPa', () => {
    const stress = normalStress(100, 0.01); // 100 kN on 0.01 m²
    expect(stress).toBeCloseTo(10, 0);
  });

  it('vonMisesStress combines normal + shear', () => {
    const vm = vonMisesStress(100, 50);
    expect(vm).toBeGreaterThan(100);
    expect(vm).toBeCloseTo(Math.sqrt(100**2 + 3*50**2), 1);
  });

  it('safetyFactor = yield / applied', () => {
    expect(safetyFactor(250, 100)).toBe(2.5);
  });

  it('safetyFactor = Infinity for zero stress', () => {
    expect(safetyFactor(250, 0)).toBe(Infinity);
  });

  it('SF ≥ 1.5 is structurally safe', () => {
    expect(isStructurallySafe(2.0)).toBe(true);
    expect(isStructurallySafe(1.5)).toBe(true);
    expect(isStructurallySafe(1.2)).toBe(false);
  });
});

describe('Scenario: Bridge Engineering — Deflection & Dynamics', () => {
  it('beamDeflection increases with load', () => {
    const d1 = beamDeflection(100, 10, 200000, 0.001);
    const d2 = beamDeflection(200, 10, 200000, 0.001);
    expect(d2).toBeCloseTo(d1 * 2, 2);
  });

  it('naturalFrequency decreases with longer spans', () => {
    const f_short = naturalFrequency(10, 200000, 0.001, 50);
    const f_long  = naturalFrequency(20, 200000, 0.001, 50);
    expect(f_long).toBeLessThan(f_short);
  });

  it('totalLoad sums all applied loads', () => {
    const loads: AppliedLoad[] = [
      { id: 'l1', type: 'dead', magnitudeKN: 50, positionM: 5, distributed: false },
      { id: 'l2', type: 'live', magnitudeKN: 100, positionM: 5, distributed: false },
      { id: 'l3', type: 'wind', magnitudeKN: 20, positionM: 5, distributed: true },
    ];
    expect(totalLoad(loads)).toBe(170);
  });

  it('deadLoadWeight = volume × density × g', () => {
    const span: BridgeSpan = { id: 's1', type: 'beam', lengthM: 20, widthM: 4, heightM: 1,
      material: MATERIALS.steel, crossSectionArea: 0.1, momentOfInertia: 0.001 };
    const weight = deadLoadWeight(span);
    expect(weight).toBeGreaterThan(0);
    // 20m × 0.1m² × 7850 kg/m³ × 9.81 / 1000 ≈ 154 kN
    expect(weight).toBeCloseTo(154, -1);
  });

  it('fatigueLifeCycles increases with lower stress range', () => {
    const highStress = fatigueLifeCycles(100, 160);
    const lowStress  = fatigueLifeCycles(50, 160);
    expect(lowStress).toBeGreaterThan(highStress);
  });

  it('FEA mesh — finite element analysis mesh generation', () => {
    const { nodes, elements } = feaMeshGenerate(10, 2, 4, 2);
    // 5×3 = 15 nodes
    expect(nodes).toHaveLength(15);
    // 4×2 quads × 2 triangles = 16 elements
    expect(elements).toHaveLength(16);
    // Corner nodes at correct positions
    expect(nodes[0]).toEqual({ id: 0, x: 0, y: 0 });
    expect(nodes[nodes.length - 1].x).toBeCloseTo(10);
    expect(nodes[nodes.length - 1].y).toBeCloseTo(2);
    // All element node refs are valid
    for (const elem of elements) {
      expect(elem.nodes).toHaveLength(3);
      for (const nid of elem.nodes) expect(nid).toBeLessThan(nodes.length);
    }
  });

  it('wind resonance — vortex shedding and Tacoma Narrows check', () => {
    const span: BridgeSpan = { id: 's1', type: 'suspension', lengthM: 853, widthM: 12, heightM: 2.4, material: MATERIALS.steel, crossSectionArea: 0.5, momentOfInertia: 0.1 };
    // Low wind — no resonance
    const low = windResonanceCheck(span, 5);
    expect(low.resonanceRisk).toBe(false);
    // Check that vortex/natural frequencies are computed
    expect(low.vortexFreqHz).toBeGreaterThan(0);
    expect(low.naturalFreqHz).toBeGreaterThan(0);
  });
});
