/**
 * bridgeEngineering.ts — Bridge Structural Engineering Engine
 *
 * Load analysis, stress-strain calculations, safety factors,
 * material properties, deflection estimation, and fatigue life.
 */

export type BridgeType = 'beam' | 'arch' | 'suspension' | 'cable-stayed' | 'truss' | 'cantilever';
export type MaterialType = 'steel' | 'concrete' | 'timber' | 'composite' | 'aluminum';
export type LoadType = 'dead' | 'live' | 'wind' | 'seismic' | 'thermal' | 'impact';

export interface Material {
  type: MaterialType;
  yieldStrengthMPa: number;
  elasticModulusMPa: number;    // Young's modulus
  densityKgM3: number;
  poissonRatio: number;
  fatigueStrengthMPa: number;
}

export interface BridgeSpan {
  id: string;
  type: BridgeType;
  lengthM: number;
  widthM: number;
  heightM: number;
  material: Material;
  crossSectionArea: number;     // m²
  momentOfInertia: number;      // m⁴
}

export interface AppliedLoad {
  id: string;
  type: LoadType;
  magnitudeKN: number;
  positionM: number;            // distance from left support
  distributed: boolean;         // point vs distributed load
  spanLength?: number;          // for distributed loads
}

export interface StressResult {
  normalStressMPa: number;
  shearStressMPa: number;
  vonMisesMPa: number;
  safetyFactor: number;
  yielded: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// Material Database
// ═══════════════════════════════════════════════════════════════════

export const MATERIALS: Record<MaterialType, Material> = {
  steel:     { type: 'steel',     yieldStrengthMPa: 250, elasticModulusMPa: 200000, densityKgM3: 7850, poissonRatio: 0.30, fatigueStrengthMPa: 160 },
  concrete:  { type: 'concrete',  yieldStrengthMPa: 30,  elasticModulusMPa: 30000,  densityKgM3: 2400, poissonRatio: 0.20, fatigueStrengthMPa: 10 },
  timber:    { type: 'timber',    yieldStrengthMPa: 40,  elasticModulusMPa: 12000,  densityKgM3: 600,  poissonRatio: 0.35, fatigueStrengthMPa: 15 },
  composite: { type: 'composite', yieldStrengthMPa: 500, elasticModulusMPa: 150000, densityKgM3: 1600, poissonRatio: 0.28, fatigueStrengthMPa: 300 },
  aluminum:  { type: 'aluminum',  yieldStrengthMPa: 270, elasticModulusMPa: 69000,  densityKgM3: 2700, poissonRatio: 0.33, fatigueStrengthMPa: 100 },
};

// ═══════════════════════════════════════════════════════════════════
// Structural Analysis
// ═══════════════════════════════════════════════════════════════════

export function normalStress(forceKN: number, areaSqM: number): number {
  return (forceKN * 1000) / (areaSqM * 1e6); // MPa
}

export function shearStress(forceKN: number, areaSqM: number): number {
  return (forceKN * 1000) / (areaSqM * 1e6); // MPa
}

export function vonMisesStress(normal: number, shear: number): number {
  return Math.sqrt(normal ** 2 + 3 * shear ** 2);
}

export function safetyFactor(yieldStrength: number, appliedStress: number): number {
  if (appliedStress <= 0) return Infinity;
  return yieldStrength / appliedStress;
}

export function isStructurallySafe(sf: number, minRequired: number = 1.5): boolean {
  return sf >= minRequired;
}

export function beamDeflection(
  loadKN: number, lengthM: number, E: number, I: number
): number {
  // Simply supported beam, point load at center: δ = PL³/(48EI)
  return (loadKN * 1000 * lengthM ** 3) / (48 * E * 1e6 * I);
}

export function naturalFrequency(lengthM: number, E: number, I: number, massPerMeter: number): number {
  // First mode: f = (π²/2L²) × √(EI/m)
  return (Math.PI ** 2 / (2 * lengthM ** 2)) * Math.sqrt((E * 1e6 * I) / massPerMeter);
}

export function totalLoad(loads: AppliedLoad[]): number {
  return loads.reduce((sum, l) => sum + l.magnitudeKN, 0);
}

export function deadLoadWeight(span: BridgeSpan): number {
  const volume = span.lengthM * span.crossSectionArea;
  return (volume * span.material.densityKgM3 * 9.81) / 1000; // kN
}

export function fatigueLifeCycles(stressRange: number, fatigueStrength: number): number {
  if (stressRange <= 0) return Infinity;
  // Simplified S-N curve: N = (fatigue/stress)^3 × 2e6
  return Math.pow(fatigueStrength / stressRange, 3) * 2e6;
}

// ═══════════════════════════════════════════════════════════════════
// FEA Mesh Generation
// ═══════════════════════════════════════════════════════════════════

export interface FEANode { id: number; x: number; y: number }
export interface FEAElement { id: number; nodes: [number, number, number] }

/**
 * Generate a 2D triangulated FEA mesh for a rectangular span.
 * Returns nodes and triangular elements for stress analysis.
 */
export function feaMeshGenerate(
  lengthM: number, heightM: number,
  nx: number, ny: number
): { nodes: FEANode[]; elements: FEAElement[] } {
  const nodes: FEANode[] = [];
  const elements: FEAElement[] = [];

  // Generate node grid
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      nodes.push({ id: j * (nx + 1) + i, x: (i / nx) * lengthM, y: (j / ny) * heightM });
    }
  }

  // Generate triangular elements (2 triangles per quad cell)
  let elemId = 0;
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const bl = j * (nx + 1) + i;
      const br = bl + 1;
      const tl = bl + (nx + 1);
      const tr = tl + 1;
      elements.push({ id: elemId++, nodes: [bl, br, tl] });
      elements.push({ id: elemId++, nodes: [br, tr, tl] });
    }
  }

  return { nodes, elements };
}

// ═══════════════════════════════════════════════════════════════════
// Wind Resonance (Vortex Shedding)
// ═══════════════════════════════════════════════════════════════════

/**
 * Check for wind resonance risk (Tacoma Narrows–style flutter).
 * Uses Strouhal number to estimate vortex shedding frequency,
 * then compares against the span's natural frequency.
 */
export function windResonanceCheck(
  span: BridgeSpan,
  windSpeedMs: number,
  strouhalNumber: number = 0.2
): { vortexFreqHz: number; naturalFreqHz: number; resonanceRisk: boolean } {
  const vortexFreqHz = strouhalNumber * windSpeedMs / span.widthM;
  const massPerMeter = span.crossSectionArea * span.material.densityKgM3;
  const naturalFreqHz = naturalFrequency(span.lengthM, span.material.elasticModulusMPa, span.momentOfInertia, massPerMeter);
  // Risk if vortex freq is within 20% of natural frequency
  const ratio = vortexFreqHz / naturalFreqHz;
  return { vortexFreqHz, naturalFreqHz, resonanceRisk: ratio > 0.8 && ratio < 1.2 };
}
