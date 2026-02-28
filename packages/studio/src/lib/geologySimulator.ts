/**
 * geologySimulator.ts — Geology & Earth Science Engine
 *
 * Rock classification, Mohs hardness, plate tectonics,
 * mineral identification, seismic wave propagation, and stratigraphy.
 */

export type RockType = 'igneous' | 'sedimentary' | 'metamorphic';
export type RockFormation = 'intrusive' | 'extrusive' | 'clastic' | 'chemical' | 'organic' | 'foliated' | 'non-foliated';
export type PlateMotion = 'convergent' | 'divergent' | 'transform';
export type SeismicWave = 'P' | 'S' | 'Love' | 'Rayleigh';

export interface Mineral {
  id: string;
  name: string;
  hardness: number;          // Mohs scale 1-10
  luster: string;
  color: string;
  streak: string;
  crystalSystem: string;
  specificGravity: number;
  cleavage: string;
}

export interface RockSample {
  id: string;
  name: string;
  type: RockType;
  formation: RockFormation;
  minerals: string[];        // Mineral IDs
  grainSize: 'fine' | 'medium' | 'coarse';
  texture: string;
  age: number;               // millions of years
  location: string;
}

export interface TectonicPlate {
  id: string;
  name: string;
  area: number;              // km²
  motionType: PlateMotion;
  velocityCmPerYear: number;
  boundaryPartner: string;
}

// ═══════════════════════════════════════════════════════════════════
// Mineral Database
// ═══════════════════════════════════════════════════════════════════

export const MOHS_SCALE: Mineral[] = [
  { id: 'talc', name: 'Talc', hardness: 1, luster: 'pearly', color: 'white-green', streak: 'white', crystalSystem: 'monoclinic', specificGravity: 2.75, cleavage: 'perfect' },
  { id: 'gypsum', name: 'Gypsum', hardness: 2, luster: 'vitreous', color: 'white', streak: 'white', crystalSystem: 'monoclinic', specificGravity: 2.32, cleavage: 'perfect' },
  { id: 'calcite', name: 'Calcite', hardness: 3, luster: 'vitreous', color: 'colorless', streak: 'white', crystalSystem: 'hexagonal', specificGravity: 2.71, cleavage: 'perfect' },
  { id: 'fluorite', name: 'Fluorite', hardness: 4, luster: 'vitreous', color: 'purple', streak: 'white', crystalSystem: 'cubic', specificGravity: 3.18, cleavage: 'perfect' },
  { id: 'apatite', name: 'Apatite', hardness: 5, luster: 'vitreous', color: 'green', streak: 'white', crystalSystem: 'hexagonal', specificGravity: 3.19, cleavage: 'poor' },
  { id: 'orthoclase', name: 'Orthoclase', hardness: 6, luster: 'vitreous', color: 'pink', streak: 'white', crystalSystem: 'monoclinic', specificGravity: 2.56, cleavage: 'good' },
  { id: 'quartz', name: 'Quartz', hardness: 7, luster: 'vitreous', color: 'colorless', streak: 'white', crystalSystem: 'hexagonal', specificGravity: 2.65, cleavage: 'none' },
  { id: 'topaz', name: 'Topaz', hardness: 8, luster: 'vitreous', color: 'yellow', streak: 'white', crystalSystem: 'orthorhombic', specificGravity: 3.53, cleavage: 'perfect' },
  { id: 'corundum', name: 'Corundum', hardness: 9, luster: 'adamantine', color: 'varies', streak: 'white', crystalSystem: 'hexagonal', specificGravity: 4.02, cleavage: 'none' },
  { id: 'diamond', name: 'Diamond', hardness: 10, luster: 'adamantine', color: 'colorless', streak: 'white', crystalSystem: 'cubic', specificGravity: 3.52, cleavage: 'perfect' },
];

// ═══════════════════════════════════════════════════════════════════
// Rock & Mineral Analysis
// ═══════════════════════════════════════════════════════════════════

export function getMineralByHardness(hardness: number): Mineral | undefined {
  return MOHS_SCALE.find(m => m.hardness === hardness);
}

export function canScratch(scratcher: Mineral, target: Mineral): boolean {
  return scratcher.hardness > target.hardness;
}

export function classifyRock(formation: RockFormation): RockType {
  if (['intrusive', 'extrusive'].includes(formation)) return 'igneous';
  if (['clastic', 'chemical', 'organic'].includes(formation)) return 'sedimentary';
  return 'metamorphic';
}

export function rocksByType(samples: RockSample[], type: RockType): RockSample[] {
  return samples.filter(s => s.type === type);
}

// ═══════════════════════════════════════════════════════════════════
// Seismic Waves
// ═══════════════════════════════════════════════════════════════════

export function pWaveSpeed(depthKm: number): number {
  // Simplified: P-wave ~6 km/s in crust, faster in mantle
  if (depthKm < 35) return 6.5;
  if (depthKm < 2900) return 10 + depthKm * 0.001;
  return 13.5;             // outer core
}

export function sWaveSpeed(depthKm: number): number {
  if (depthKm < 35) return 3.6;
  if (depthKm < 2900) return 5.5 + depthKm * 0.0005;
  return 0;                // S-waves don't pass through liquid outer core
}

export function seismicArrivalTime(distanceKm: number, waveSpeed: number): number {
  return distanceKm / waveSpeed; // seconds
}

export function plateDisplacementOverTime(velocityCmPerYear: number, years: number): number {
  return velocityCmPerYear * years / 100; // meters
}

export function earthquakeMagnitudeEnergy(magnitude: number): number {
  // Energy in joules: log₁₀(E) = 1.5M + 4.8
  return Math.pow(10, 1.5 * magnitude + 4.8);
}
