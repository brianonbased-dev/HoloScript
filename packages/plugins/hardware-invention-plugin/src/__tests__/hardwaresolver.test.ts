/**
 * Hardware design solver tests — hardware-invention-plugin
 *
 * Reference values verified against:
 *  - IPC-2141A (2004) Controlled Impedance Circuit Boards — eq. 7.1, 7.3
 *  - IPC-2221B (2012) Generic Standard on PCB Design
 *  - JEDEC JESD51-2 (1995) Thermal Resistance Measurement
 */

import { describe, it, expect } from 'vitest';
import {
  microstripImpedance,
  striplineImpedance,
  irDropAnalysis,
  decouplingCapacitor,
  dfmCheck,
  bomCostEstimator,
  thermalBudget,
  signalIntegrityBudget,
  buildHardwareReceipt,
} from '../hardwaresolver';

// ─── Microstrip Impedance ─────────────────────────────────────────────────────

describe('microstripImpedance', () => {
  /**
   * IPC-2141A eq 7.1: Z₀ = (87/√(εr+1.41)) × ln(5.98H/(0.8W+T))
   * Typical FR4: εr=4.3, H=0.2mm, W=0.4mm, T=0.035mm → Z₀ ≈ 50Ω
   */
  it('typical 50Ω trace: H=0.2, W=0.4, T=0.035, εr=4.3 → ~50Ω', () => {
    const r = microstripImpedance({ traceWidthMm: 0.4, dielectricHeightMm: 0.2 });
    // IPC-2141A formula gives ~48-55Ω for these dimensions
    expect(r.impedanceOhms).toBeGreaterThan(40);
    expect(r.impedanceOhms).toBeLessThan(70);
  });

  it('wider trace → lower impedance', () => {
    const narrow = microstripImpedance({ traceWidthMm: 0.2, dielectricHeightMm: 0.2 });
    const wide   = microstripImpedance({ traceWidthMm: 0.8, dielectricHeightMm: 0.2 });
    expect(narrow.impedanceOhms).toBeGreaterThan(wide.impedanceOhms);
  });

  it('higher substrate → higher impedance', () => {
    const thin  = microstripImpedance({ traceWidthMm: 0.4, dielectricHeightMm: 0.1 });
    const thick = microstripImpedance({ traceWidthMm: 0.4, dielectricHeightMm: 0.4 });
    expect(thick.impedanceOhms).toBeGreaterThan(thin.impedanceOhms);
  });

  it('propagationDelayPsMm > 0', () => {
    const r = microstripImpedance({ traceWidthMm: 0.4, dielectricHeightMm: 0.2 });
    expect(r.propagationDelayPsMm).toBeGreaterThan(0);
  });

  it('withinTolerance=true when impedance within ±10% of target', () => {
    const r = microstripImpedance({ traceWidthMm: 0.4, dielectricHeightMm: 0.2 }, 50);
    // Z0 should be within ±10% of 50 for these params
    const z = r.impedanceOhms;
    const expected = Math.abs(z - 50) / 50 <= 0.10;
    expect(r.withinTolerance).toBe(expected);
  });

  it('withinTolerance=null when no target provided', () => {
    const r = microstripImpedance({ traceWidthMm: 0.4, dielectricHeightMm: 0.2 });
    expect(r.withinTolerance).toBeNull();
  });

  it('throws for zero trace width', () => {
    expect(() => microstripImpedance({ traceWidthMm: 0, dielectricHeightMm: 0.2 })).toThrow();
  });
});

// ─── Stripline Impedance ──────────────────────────────────────────────────────

describe('striplineImpedance', () => {
  it('impedance is positive', () => {
    const r = striplineImpedance({ traceWidthMm: 0.3, dielectricHeightMm: 0.15 });
    expect(r.impedanceOhms).toBeGreaterThan(0);
  });

  it('wider trace → lower impedance', () => {
    const narrow = striplineImpedance({ traceWidthMm: 0.1, dielectricHeightMm: 0.2 });
    const wide   = striplineImpedance({ traceWidthMm: 0.5, dielectricHeightMm: 0.2 });
    expect(narrow.impedanceOhms).toBeGreaterThan(wide.impedanceOhms);
  });

  it('effectivePermittivity equals εr (fully embedded)', () => {
    const er = 4.3;
    const r = striplineImpedance({ traceWidthMm: 0.3, dielectricHeightMm: 0.15, relativePermittivity: er });
    expect(r.effectivePermittivity).toBeCloseTo(er, 4);
  });

  it('propagationDelayPsMm = sqrt(εr) × 3.336', () => {
    const er = 4.3;
    const r = striplineImpedance({ traceWidthMm: 0.3, dielectricHeightMm: 0.15, relativePermittivity: er });
    expect(r.propagationDelayPsMm).toBeCloseTo(Math.sqrt(er) * 3.336, 2);
  });

  it('throws for zero dielectric height', () => {
    expect(() => striplineImpedance({ traceWidthMm: 0.3, dielectricHeightMm: 0 })).toThrow();
  });
});

// ─── IR Drop Analysis ─────────────────────────────────────────────────────────

describe('irDropAnalysis', () => {
  /**
   * Copper resistivity ρ = 1.72e-5 Ω·mm
   * R = ρ × L / (W × T)
   * 100mm trace, 1mm wide, 0.035mm thick, 1A → V = R × I
   */
  it('IR drop = resistivity × length / (width × thickness) × current', () => {
    const r = irDropAnalysis(100, 1.0, 1.0, 0.035);
    // R = (1.72e-5 × 100) / (1.0 × 0.035) ≈ 0.04914 Ω → 49.14 mV
    expect(r.irDropMv).toBeGreaterThan(30);
    expect(r.irDropMv).toBeLessThan(80);
  });

  it('wider trace → lower IR drop', () => {
    // Signature: irDropAnalysis(lengthMm, widthMm, currentA, thicknessMm, budgetMv)
    const narrow = irDropAnalysis(100, 0.5, 1.0, 0.035); // width=0.5mm
    const wide   = irDropAnalysis(100, 2.0, 1.0, 0.035); // width=2.0mm
    expect(wide.irDropMv).toBeLessThan(narrow.irDropMv);
  });

  it('withinBudget=true when drop < budgetMv', () => {
    const r = irDropAnalysis(10, 1.0, 0.1, 0.035, 100);
    expect(r.withinBudget).toBe(true);
  });

  it('withinBudget=false when drop exceeds budget', () => {
    // Narrow trace (0.1mm), high current (5A), long run (1000mm) → very high drop
    const r = irDropAnalysis(1000, 0.1, 5.0, 0.035, 10);
    expect(r.withinBudget).toBe(false);
  });

  it('returns input trace dimensions', () => {
    // Signature: (length, width, current, thickness)
    const r = irDropAnalysis(50, 0.5, 2.0, 0.070);
    expect(r.traceLengthMm).toBe(50);
    expect(r.traceWidthMm).toBe(0.5);
    expect(r.currentA).toBe(2.0);
  });
});

// ─── Decoupling Capacitor ─────────────────────────────────────────────────────

describe('decouplingCapacitor', () => {
  /**
   * SRF = 1 / (2π√(LC))
   * C=100nF=0.1μF, L=1nH: SRF = 1/(2π√(1e-9 × 0.1e-6)) ≈ 15.9 MHz
   */
  it('selfResonantFreqMHz ≈ 1/(2π√(LC))', () => {
    const C_uF = 0.1, L_nH = 1;
    const r = decouplingCapacitor(C_uF, L_nH, 0.1);
    const expected = 1 / (2 * Math.PI * Math.sqrt(L_nH * 1e-9 * C_uF * 1e-6)) / 1e6;
    expect(r.selfResonantFreqMHz).toBeCloseTo(expected, 0);
  });

  it('effectiveRangeMHz is a two-element array', () => {
    const r = decouplingCapacitor(0.1, 1, 0.05);
    expect(r.effectiveRangeMHz).toHaveLength(2);
    expect(r.effectiveRangeMHz[0]).toBeLessThan(r.effectiveRangeMHz[1]);
  });

  it('recommendedCapUF for target frequency', () => {
    // At 100 MHz with L=1nH: C = 1/(4π²×f²×L) = 1/(4π²×(100e6)²×1e-9) ≈ 25.3 pF = 2.53e-5 μF
    const r = decouplingCapacitor(0.1, 1, 0.05, 100);
    expect(r.recommendedCapUF).toBeGreaterThan(0);
  });

  it('esr equals input esr', () => {
    const r = decouplingCapacitor(0.1, 1, 0.05);
    expect(r.esr).toBeCloseTo(0.05, 5);
  });
});

// ─── DFM Check ────────────────────────────────────────────────────────────────

describe('dfmCheck', () => {
  it('passes all rules for IPC-2221B above-minimum dimensions', () => {
    // DFMInput: { minTraceWidthMm, minTraceSpacingMm, viaDrillDiamMm, annularRingMm, silkscreenClearanceMm, edgeClearanceMm }
    // IPC-2221B minimums: 0.100, 0.100, 0.200, 0.050, 0.100, 0.300
    const r = dfmCheck({
      minTraceWidthMm:       0.15,
      minTraceSpacingMm:     0.15,
      viaDrillDiamMm:        0.30,
      annularRingMm:         0.10,
      silkscreenClearanceMm: 0.15,
      edgeClearanceMm:       0.50,
    });
    expect(r.failures).toBe(0);
    expect(r.manufacturable).toBe(true);
  });

  it('fails when trace width below IPC-2221B minimum (0.100mm)', () => {
    const r = dfmCheck({
      minTraceWidthMm:       0.05,   // below 0.100 minimum
      minTraceSpacingMm:     0.15,
      viaDrillDiamMm:        0.30,
      annularRingMm:         0.10,
      silkscreenClearanceMm: 0.15,
      edgeClearanceMm:       0.50,
    });
    expect(r.failures).toBeGreaterThan(0);
    expect(r.manufacturable).toBe(false);
  });

  it('checks array has entries for each rule', () => {
    const r = dfmCheck({
      minTraceWidthMm:       0.15,
      minTraceSpacingMm:     0.15,
      viaDrillDiamMm:        0.30,
      annularRingMm:         0.10,
      silkscreenClearanceMm: 0.15,
      edgeClearanceMm:       0.50,
    });
    expect(r.checks.length).toBeGreaterThan(0);
    for (const check of r.checks) {
      expect(typeof check.rule).toBe('string');
      expect(typeof check.passed).toBe('boolean');
    }
  });
});

// ─── BOM Cost Estimator ───────────────────────────────────────────────────────

describe('bomCostEstimator', () => {
  const bom = [
    { partNumber: 'R0402', description: '10k resistor', quantity: 10, unitCostUSD: 0.01 },
    { partNumber: 'C0603', description: '100nF cap',    quantity: 5,  unitCostUSD: 0.05 },
    { partNumber: 'IC001', description: 'MCU',          quantity: 1,  unitCostUSD: 2.50, defectRate: 0.001 },
  ];

  it('totalBOMCostUSD = sum of quantity × unitCost', () => {
    const r = bomCostEstimator(bom, 0.20);
    const expected = 10 * 0.01 + 5 * 0.05 + 1 * 2.50;
    expect(r.totalBOMCostUSD).toBeCloseTo(expected, 4);
  });

  it('assemblyCostUSD = fraction × totalBOMCostUSD', () => {
    const r = bomCostEstimator(bom, 0.20);
    expect(r.assemblyCostUSD).toBeCloseTo(r.totalBOMCostUSD * 0.20, 4);
  });

  it('totalUnitCostUSD = BOM + assembly', () => {
    const r = bomCostEstimator(bom, 0.20);
    expect(r.totalUnitCostUSD).toBeCloseTo(r.totalBOMCostUSD + r.assemblyCostUSD, 4);
  });

  it('firstPassYield in (0, 1]', () => {
    const r = bomCostEstimator(bom, 0.20);
    expect(r.firstPassYield).toBeGreaterThan(0);
    expect(r.firstPassYield).toBeLessThanOrEqual(1);
  });

  it('lines length matches BOM input', () => {
    const r = bomCostEstimator(bom, 0.20);
    expect(r.lines).toHaveLength(bom.length);
  });
});

// ─── Thermal Budget ───────────────────────────────────────────────────────────

describe('thermalBudget', () => {
  /**
   * JEDEC JESD51: T_j = T_amb + P × θ_JA
   * θ_JA = θ_JC + θ_CS + θ_SA
   * Example: Ta=25°C, P=2W, θ_JC=5, θ_CS=1, θ_SA=20 → θ_JA=26 → T_j=25+52=77°C
   */
  it('T_junction = ambient + power × θ_JA', () => {
    const r = thermalBudget(25, 2, 5, 1, 20, 125);
    expect(r.junctionTempC).toBeCloseTo(25 + 2 * (5 + 1 + 20), 2);
  });

  it('thermalHeadroomC = maxJunction − estimatedJunction', () => {
    const r = thermalBudget(25, 2, 5, 1, 20, 125);
    expect(r.thermalHeadroomC).toBeCloseTo(125 - r.junctionTempC, 2);
  });

  it('withinBudget=true when junction < max', () => {
    const r = thermalBudget(25, 0.1, 5, 1, 10, 125);
    expect(r.withinBudget).toBe(true);
  });

  it('withinBudget=false when junction exceeds max', () => {
    const r = thermalBudget(85, 5, 20, 5, 30, 125);
    // T_j = 85 + 5×55 = 360°C → exceeds 125°C
    expect(r.withinBudget).toBe(false);
  });

  it('returns input parameters', () => {
    const r = thermalBudget(25, 2, 5, 1, 20, 125);
    expect(r.ambientTempC).toBe(25);
    expect(r.powerDissipationW).toBe(2);
    expect(r.maxJunctionTempC).toBe(125);
  });
});

// ─── Signal Integrity Budget ──────────────────────────────────────────────────

describe('signalIntegrityBudget', () => {
  /**
   * Bit period = 1 / bitRate
   * Trace delay = length × propagation delay/mm
   */
  it('bitPeriodPs = 1e12 / (bitRateGbps × 1e9)', () => {
    const r = signalIntegrityBudget(1.0, 100, 6.0, 40, 10);
    expect(r.bitPeriodPs).toBeCloseTo(1e12 / (1.0 * 1e9), 0);
  });

  it('traceDelayPs = length × propagationDelay', () => {
    const r = signalIntegrityBudget(1.0, 100, 6.0, 40, 10);
    expect(r.traceDelayPs).toBeCloseTo(100 * 6.0, 1);
  });

  it('eyeOpeningPct in [0, 100]', () => {
    const r = signalIntegrityBudget(5.0, 50, 6.0, 20, 5);
    expect(r.eyeOpeningPct).toBeGreaterThanOrEqual(0);
    expect(r.eyeOpeningPct).toBeLessThanOrEqual(100);
  });

  it('adequate=true for short low-speed trace', () => {
    const r = signalIntegrityBudget(0.1, 10, 6.0, 40, 10);
    expect(r.adequate).toBe(true);
  });

  it('adequate=false for extremely long high-speed trace', () => {
    const r = signalIntegrityBudget(40, 5000, 7.0, 5, 2);
    expect(r.adequate).toBe(false);
  });
});

// ─── Receipt ─────────────────────────────────────────────────────────────────

describe('buildHardwareReceipt', () => {
  it('plugin=hardware-invention and CAEL event correct', () => {
    const imp = microstripImpedance({ traceWidthMm: 0.4, dielectricHeightMm: 0.2 });
    const receipt = buildHardwareReceipt({ impedance: imp, converged: true });
    expect(receipt.plugin).toBe('hardware-invention');
    expect(receipt.cael.event).toBe('hardware_invention.hardware_analysis');
    expect(receipt.payloadHash).toBeTruthy();
  });

  it('accepted=true for manufacturable result', () => {
    const dfm = dfmCheck({
      minTraceWidthMm: 0.15, minTraceSpacingMm: 0.15, viaDrillDiamMm: 0.30,
      annularRingMm: 0.10, silkscreenClearanceMm: 0.15, edgeClearanceMm: 0.50,
    });
    const receipt = buildHardwareReceipt({ dfm, converged: true });
    expect(receipt.acceptance.accepted).toBe(true);
  });

  it('accepted=false when DFM violations present', () => {
    const dfm = dfmCheck({
      minTraceWidthMm: 0.05, minTraceSpacingMm: 0.05, viaDrillDiamMm: 0.10,
      annularRingMm: 0.01, silkscreenClearanceMm: 0.02, edgeClearanceMm: 0.10,
    });
    expect(dfm.failures).toBeGreaterThan(0);
    const receipt = buildHardwareReceipt({ dfm, converged: true });
    expect(receipt.acceptance.accepted).toBe(false);
    expect(receipt.acceptance.violations.length).toBeGreaterThan(0);
  });

  it('uses provided runId', () => {
    const receipt = buildHardwareReceipt({ converged: true }, { runId: 'hw-run-42' });
    expect(receipt.runId).toBe('hw-run-42');
  });
});
