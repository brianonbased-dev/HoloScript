/**
 * Hardware design solvers — hardware-invention-plugin
 *
 * Implements:
 *  - PCB trace impedance (IPC-2141A microstrip + stripline)
 *  - IR drop / power rail analysis (IPC-7093B)
 *  - Decoupling capacitor selection (self-resonance + ESR)
 *  - DFM rule checker (IPC-2221B minimum dimensions)
 *  - BOM cost estimator with yield factor
 *  - Thermal junction budget (JEDEC JESD51)
 *  - Signal integrity jitter budget
 *
 * References:
 *  - IPC-2141A (2004) Controlled Impedance Circuit Boards
 *  - IPC-2221B (2012) Generic Standard on PCB Design
 *  - JEDEC JESD51-2 (1995) Integrated Circuits Thermal Resistance
 *  - Ott HW (2009) Electromagnetic Compatibility Engineering
 */

import { buildDomainSimulationReceipt, type DomainSimulationReceipt } from '@holoscript/core';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MicrostripParams {
  /** Trace width mm */
  traceWidthMm: number;
  /** Dielectric height (substrate thickness) mm */
  dielectricHeightMm: number;
  /** Trace thickness mm (default 0.035 for 1oz copper) */
  traceThicknessMm?: number;
  /** Relative permittivity of substrate (FR4 default 4.3) */
  relativePermittivity?: number;
}

export interface StriplineParams {
  /** Trace width mm */
  traceWidthMm: number;
  /** Distance to reference plane mm */
  dielectricHeightMm: number;
  /** Trace thickness mm */
  traceThicknessMm?: number;
  /** Relative permittivity (FR4 default 4.3) */
  relativePermittivity?: number;
}

export interface ImpedanceResult {
  /** Characteristic impedance Ω */
  impedanceOhms: number;
  /** Effective permittivity */
  effectivePermittivity: number;
  /** Propagation delay ps/mm */
  propagationDelayPsMm: number;
  /** Whether within ±10% of target (if provided) */
  withinTolerance: boolean | null;
}

export interface PowerRailResult {
  /** Trace length mm */
  traceLengthMm: number;
  /** Current draw A */
  currentA: number;
  /** Trace width mm */
  traceWidthMm: number;
  /** Trace thickness mm */
  traceThicknessMm: number;
  /** Sheet resistance of copper mΩ/sq */
  sheetResistanceMOhmSq: number;
  /** Total trace resistance mΩ */
  traceResistanceMOhm: number;
  /** IR drop mV */
  irDropMv: number;
  /** Whether drop is within budget (< 50 mV default) */
  withinBudget: boolean;
}

export interface DecouplingCapResult {
  /** Self-resonant frequency MHz */
  selfResonantFreqMHz: number;
  /** ESR at resonance Ω */
  esr: number;
  /** Anti-resonant frequency if two caps are combined MHz */
  antiResonantFreqMHz: number | null;
  /** Recommended cap value for target frequency */
  recommendedCapUF: number;
  /** Effective frequency range MHz */
  effectiveRangeMHz: [number, number];
}

export interface DFMCheck {
  rule: string;
  actual: number;
  minimum: number;
  passed: boolean;
}

export interface DFMResult {
  checks: DFMCheck[];
  /** Number of failing rules */
  failures: number;
  /** Whether fully manufacturable */
  manufacturable: boolean;
}

export interface BOMLine {
  partNumber: string;
  description: string;
  quantity: number;
  unitCostUSD: number;
  /** Defect rate (0-1), used for yield calculation */
  defectRate?: number;
}

export interface BOMResult {
  lines: Array<BOMLine & { lineCostUSD: number; yieldAdjustedCostUSD: number }>;
  totalBOMCostUSD: number;
  /** Assembly cost estimate (20% of BOM by default) */
  assemblyCostUSD: number;
  totalUnitCostUSD: number;
  /** First-pass yield estimate */
  firstPassYield: number;
}

export interface ThermalBudgetResult {
  /** Ambient temperature °C */
  ambientTempC: number;
  /** Power dissipation W */
  powerDissipationW: number;
  /** θ_JA: junction-to-ambient thermal resistance °C/W */
  thetaJA: number;
  /** Estimated junction temperature °C */
  junctionTempC: number;
  /** Maximum rated junction temperature °C */
  maxJunctionTempC: number;
  /** Thermal headroom °C */
  thermalHeadroomC: number;
  /** Whether within thermal budget */
  withinBudget: boolean;
}

export interface SignalIntegrityResult {
  /** Bit rate Gbps */
  bitRateGbps: number;
  /** Bit period ps */
  bitPeriodPs: number;
  /** Propagation delay through trace ps */
  traceDelayPs: number;
  /** Rise/fall time estimate ps (0.35 / bandwidth) */
  riseTimePs: number;
  /** Setup margin ps */
  setupMarginPs: number;
  /** Hold margin ps */
  holdMarginPs: number;
  /** Eye opening % of bit period */
  eyeOpeningPct: number;
  /** Whether signal integrity is adequate (eye > 30%) */
  adequate: boolean;
}

export interface HardwareReceiptOptions {
  runId?: string;
}

// ─── PCB Trace Impedance ──────────────────────────────────────────────────────

/**
 * Microstrip impedance (IPC-2141A equation 7.1):
 * Z₀ = (87 / √(ε_r + 1.41)) × ln(5.98H / (0.8W + T))
 * where H = dielectric height, W = trace width, T = trace thickness (all same units).
 */
export function microstripImpedance(
  params: MicrostripParams,
  targetOhms?: number,
): ImpedanceResult {
  const { traceWidthMm: W, dielectricHeightMm: H, traceThicknessMm: T = 0.035, relativePermittivity: er = 4.3 } = params;

  if (W <= 0) throw new Error('traceWidthMm must be positive');
  if (H <= 0) throw new Error('dielectricHeightMm must be positive');
  if (T <= 0) throw new Error('traceThicknessMm must be positive');
  if (er <= 0) throw new Error('relativePermittivity must be positive');

  const impedanceOhms = (87 / Math.sqrt(er + 1.41)) * Math.log(5.98 * H / (0.8 * W + T));
  const effectivePermittivity = (er + 1) / 2 + (er - 1) / 2 / Math.sqrt(1 + 12 * H / W);
  // Propagation delay pd = sqrt(ε_eff) × 3.336 ps/mm
  const propagationDelayPsMm = Math.sqrt(effectivePermittivity) * 3.336;
  const withinTolerance = targetOhms != null ? Math.abs(impedanceOhms - targetOhms) / targetOhms <= 0.10 : null;

  return { impedanceOhms, effectivePermittivity, propagationDelayPsMm, withinTolerance };
}

/**
 * Symmetric stripline impedance (IPC-2141A equation 7.3):
 * Z₀ = (60 / √ε_r) × ln(4B / (0.67π(0.8W + T)))
 * where B = distance between planes = 2H.
 */
export function striplineImpedance(
  params: StriplineParams,
  targetOhms?: number,
): ImpedanceResult {
  const { traceWidthMm: W, dielectricHeightMm: H, traceThicknessMm: T = 0.035, relativePermittivity: er = 4.3 } = params;

  if (W <= 0 || H <= 0 || T <= 0 || er <= 0) throw new Error('All parameters must be positive');

  const B = 2 * H;
  const impedanceOhms = (60 / Math.sqrt(er)) * Math.log((4 * B) / (0.67 * Math.PI * (0.8 * W + T)));
  const effectivePermittivity = er;
  const propagationDelayPsMm = Math.sqrt(er) * 3.336;
  const withinTolerance = targetOhms != null ? Math.abs(impedanceOhms - targetOhms) / targetOhms <= 0.10 : null;

  return { impedanceOhms, effectivePermittivity, propagationDelayPsMm, withinTolerance };
}

// ─── IR Drop / Power Rail ─────────────────────────────────────────────────────

const COPPER_RESISTIVITY_OHM_MM = 1.72e-5; // Ω·mm (ρ for copper)

/**
 * Compute IR drop on a power rail trace.
 * R = ρ × L / (W × T)    [all in mm]
 * V_drop = I × R
 */
export function irDropAnalysis(
  traceLengthMm: number,
  traceWidthMm: number,
  currentA: number,
  traceThicknessMm = 0.035,
  budgetMv = 50,
): PowerRailResult {
  if (traceLengthMm <= 0) throw new Error('traceLengthMm must be positive');
  if (traceWidthMm <= 0) throw new Error('traceWidthMm must be positive');
  if (currentA < 0) throw new Error('currentA must be non-negative');

  const R_trace = COPPER_RESISTIVITY_OHM_MM * traceLengthMm / (traceWidthMm * traceThicknessMm); // Ω
  const irDropMv = currentA * R_trace * 1000; // mV
  const sheetResistanceMOhmSq = (COPPER_RESISTIVITY_OHM_MM / traceThicknessMm) * 1000; // mΩ/sq

  return {
    traceLengthMm, currentA, traceWidthMm, traceThicknessMm,
    sheetResistanceMOhmSq,
    traceResistanceMOhm: R_trace * 1000,
    irDropMv,
    withinBudget: irDropMv <= budgetMv,
  };
}

// ─── Decoupling Capacitor ─────────────────────────────────────────────────────

/**
 * Compute self-resonant frequency and effectiveness of a decoupling capacitor.
 * f_SRF = 1 / (2π√(LC))
 * ESR given in spec; effective below SRF.
 * targetFreqMHz: the fundamental to decouple.
 */
export function decouplingCapacitor(
  capacitanceUF: number,
  parasiticsInductanceNH: number,
  esr: number,
  targetFreqMHz?: number,
): DecouplingCapResult {
  if (capacitanceUF <= 0) throw new Error('capacitanceUF must be positive');
  if (parasiticsInductanceNH <= 0) throw new Error('parasiticsInductanceNH must be positive');

  const L = parasiticsInductanceNH * 1e-9; // H
  const C = capacitanceUF * 1e-6;          // F

  const selfResonantFreqMHz = 1 / (2 * Math.PI * Math.sqrt(L * C)) / 1e6;

  // Recommended cap for target frequency: C = 1 / ((2πf)² × L)
  let recommendedCapUF = capacitanceUF;
  let antiResonantFreqMHz: number | null = null;

  if (targetFreqMHz != null) {
    const f = targetFreqMHz * 1e6;
    const Crecommended = 1 / ((2 * Math.PI * f) ** 2 * L);
    recommendedCapUF = Crecommended * 1e6;

    // Anti-resonance between this cap and a bulk cap (10× larger)
    const C_bulk = C * 10;
    const f_anti = 1 / (2 * Math.PI * Math.sqrt(L * Math.sqrt(C * C_bulk)));
    antiResonantFreqMHz = f_anti / 1e6;
  }

  // Effective range: 1/10 SRF to SRF (capacitive region)
  const effectiveRangeMHz: [number, number] = [selfResonantFreqMHz * 0.1, selfResonantFreqMHz];

  return { selfResonantFreqMHz, esr, antiResonantFreqMHz, recommendedCapUF, effectiveRangeMHz };
}

// ─── DFM Rule Checker ─────────────────────────────────────────────────────────

export interface DFMInput {
  /** Minimum trace width mm (IPC-2221B Class B: 0.100 mm) */
  minTraceWidthMm: number;
  /** Minimum trace spacing mm */
  minTraceSpacingMm: number;
  /** Via drill diameter mm */
  viaDrillDiamMm: number;
  /** Annular ring width mm */
  annularRingMm: number;
  /** Silkscreen clearance from pad mm */
  silkscreenClearanceMm: number;
  /** Board edge clearance mm */
  edgeClearanceMm: number;
}

/** IPC-2221B Class B (commercial) minimums */
const IPC2221B_MINIMUMS = {
  minTraceWidthMm:       0.100,
  minTraceSpacingMm:     0.100,
  viaDrillDiamMm:        0.200,
  annularRingMm:         0.050,
  silkscreenClearanceMm: 0.100,
  edgeClearanceMm:       0.300,
};

export function dfmCheck(design: DFMInput): DFMResult {
  const checks: DFMCheck[] = Object.entries(IPC2221B_MINIMUMS).map(([rule, minimum]) => {
    const actual = design[rule as keyof DFMInput];
    return { rule, actual, minimum, passed: actual >= minimum };
  });

  const failures = checks.filter(c => !c.passed).length;
  return { checks, failures, manufacturable: failures === 0 };
}

// ─── BOM Cost Estimator ───────────────────────────────────────────────────────

export function bomCostEstimator(
  bomLines: BOMLine[],
  assemblyCostFraction = 0.20,
): BOMResult {
  if (bomLines.length === 0) throw new Error('BOM has no lines');

  let firstPassYield = 1.0;
  const lines = bomLines.map(line => {
    const lineCostUSD = line.quantity * line.unitCostUSD;
    const dr = line.defectRate ?? 0;
    const yieldFactor = Math.pow(1 - dr, line.quantity);
    firstPassYield *= yieldFactor;
    const yieldAdjustedCostUSD = lineCostUSD / Math.max(yieldFactor, 0.01);
    return { ...line, lineCostUSD, yieldAdjustedCostUSD };
  });

  const totalBOMCostUSD = lines.reduce((a, l) => a + l.lineCostUSD, 0);
  const assemblyCostUSD = totalBOMCostUSD * assemblyCostFraction;
  const totalUnitCostUSD = totalBOMCostUSD + assemblyCostUSD;

  return { lines, totalBOMCostUSD, assemblyCostUSD, totalUnitCostUSD, firstPassYield };
}

// ─── Thermal Junction Budget ──────────────────────────────────────────────────

/**
 * T_junction = T_ambient + P_diss × θ_JA
 * θ_JA = θ_JC + θ_CS + θ_SA
 */
export function thermalBudget(
  ambientTempC: number,
  powerDissipationW: number,
  thetaJC: number, // junction-to-case °C/W
  thetaCS: number, // case-to-sink °C/W
  thetaSA: number, // sink-to-ambient °C/W
  maxJunctionTempC = 125,
): ThermalBudgetResult {
  if (powerDissipationW < 0) throw new Error('powerDissipationW must be non-negative');

  const thetaJA = thetaJC + thetaCS + thetaSA;
  const junctionTempC = ambientTempC + powerDissipationW * thetaJA;
  const thermalHeadroomC = maxJunctionTempC - junctionTempC;

  return { ambientTempC, powerDissipationW, thetaJA, junctionTempC, maxJunctionTempC, thermalHeadroomC, withinBudget: junctionTempC <= maxJunctionTempC };
}

// ─── Signal Integrity Jitter Budget ──────────────────────────────────────────

/**
 * Simplified single-ended jitter budget.
 * Rise time (BW-limited): t_r = 0.35 / BW_GHz ns
 * BW_GHz = bitRateGbps / 2 (Nyquist)
 */
export function signalIntegrityBudget(
  bitRateGbps: number,
  traceLengthMm: number,
  propagationDelayPsMm: number,
  setupTimePs: number,
  holdTimePs: number,
): SignalIntegrityResult {
  if (bitRateGbps <= 0) throw new Error('bitRateGbps must be positive');
  if (traceLengthMm < 0) throw new Error('traceLengthMm must be non-negative');

  const bitPeriodPs = 1000 / bitRateGbps;          // ps
  const traceDelayPs = traceLengthMm * propagationDelayPsMm;
  const bwGHz = bitRateGbps / 2;
  const riseTimePs = (0.35 / bwGHz) * 1000;        // ps

  // Setup margin: bit period - trace delay - setup time - rise time
  const setupMarginPs = bitPeriodPs - traceDelayPs - setupTimePs - riseTimePs;
  // Hold margin: trace delay - hold time (minimum delay path)
  const holdMarginPs = traceDelayPs - holdTimePs;

  // Eye opening: proportion of bit period after accounting for worst-case jitter
  const totalJitter = riseTimePs + Math.abs(Math.min(0, setupMarginPs));
  const eyeOpeningPct = Math.max(0, (1 - totalJitter / bitPeriodPs) * 100);

  return { bitRateGbps, bitPeriodPs, traceDelayPs, riseTimePs, setupMarginPs, holdMarginPs, eyeOpeningPct, adequate: eyeOpeningPct > 30 };
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export interface HardwareAnalysisResult {
  impedance?: ImpedanceResult;
  irDrop?: PowerRailResult;
  decoupling?: DecouplingCapResult;
  dfm?: DFMResult;
  bom?: BOMResult;
  thermal?: ThermalBudgetResult;
  signalIntegrity?: SignalIntegrityResult;
  converged: true;
}

export function buildHardwareReceipt(
  result: HardwareAnalysisResult,
  options?: HardwareReceiptOptions,
): DomainSimulationReceipt {
  const violations: Array<{ criterion: string; message: string }> = [];

  if (result.impedance?.withinTolerance === false) {
    violations.push({ criterion: 'impedance', message: `Trace impedance ${result.impedance.impedanceOhms.toFixed(1)} Ω is outside ±10% of target` });
  }
  if (result.irDrop && !result.irDrop.withinBudget) {
    violations.push({ criterion: 'ir_drop', message: `IR drop ${result.irDrop.irDropMv.toFixed(1)} mV exceeds 50 mV budget` });
  }
  if (result.dfm && !result.dfm.manufacturable) {
    violations.push({ criterion: 'dfm', message: `${result.dfm.failures} DFM rule(s) violated — board may not be manufacturable` });
  }
  if (result.thermal && !result.thermal.withinBudget) {
    violations.push({ criterion: 'thermal', message: `Junction temperature ${result.thermal.junctionTempC.toFixed(1)}°C exceeds ${result.thermal.maxJunctionTempC}°C maximum` });
  }
  if (result.signalIntegrity && !result.signalIntegrity.adequate) {
    violations.push({ criterion: 'signal_integrity', message: `Eye opening ${result.signalIntegrity.eyeOpeningPct.toFixed(1)}% < 30% — signal integrity marginal` });
  }

  return buildDomainSimulationReceipt({
    plugin: 'hardware-invention',
    pluginVersion: '1.0.0',
    runId: options?.runId ?? `hw-${Date.now().toString(36)}`,
    solverConfig: { solverType: 'pcb-electronics-analysis', scale: 'board' },
    resultSummary: {
      impedanceOhms: result.impedance?.impedanceOhms,
      irDropMv: result.irDrop?.irDropMv,
      junctionTempC: result.thermal?.junctionTempC,
      dfmFailures: result.dfm?.failures,
      eyeOpeningPct: result.signalIntegrity?.eyeOpeningPct,
      totalBOMCostUSD: result.bom?.totalUnitCostUSD,
    },
    cael: { version: 'cael.v1', event: 'hardware_invention.hardware_analysis', solverType: 'hardware-invention.ipc2141a' },
    acceptance: { accepted: violations.length === 0, violations },
  });
}
