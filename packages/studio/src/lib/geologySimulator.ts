/**
 * geologySimulator.ts — Geology & Earth Science Engine
 *
 * Rock classification, Mohs hardness, plate tectonics,
 * mineral identification, seismic wave propagation, and stratigraphy.
 */

export type RockType = 'igneous' | 'sedimentary' | 'metamorphic';
export type RockFormation =
  | 'intrusive'
  | 'extrusive'
  | 'clastic'
  | 'chemical'
  | 'organic'
  | 'foliated'
  | 'non-foliated';
export type PlateMotion = 'convergent' | 'divergent' | 'transform';
export type SeismicWave = 'P' | 'S' | 'Love' | 'Rayleigh';

export interface Mineral {
  id: string;
  name: string;
  hardness: number; // Mohs scale 1-10
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
  minerals: string[]; // Mineral IDs
  grainSize: 'fine' | 'medium' | 'coarse';
  texture: string;
  age: number; // millions of years
  location: string;
}

export interface TectonicPlate {
  id: string;
  name: string;
  area: number; // km²
  motionType: PlateMotion;
  velocityCmPerYear: number;
  boundaryPartner: string;
}

// ═══════════════════════════════════════════════════════════════════
// Mineral Database
// ═══════════════════════════════════════════════════════════════════

export const MOHS_SCALE: Mineral[] = [
  {
    id: 'talc',
    name: 'Talc',
    hardness: 1,
    luster: 'pearly',
    color: 'white-green',
    streak: 'white',
    crystalSystem: 'monoclinic',
    specificGravity: 2.75,
    cleavage: 'perfect',
  },
  {
    id: 'gypsum',
    name: 'Gypsum',
    hardness: 2,
    luster: 'vitreous',
    color: 'white',
    streak: 'white',
    crystalSystem: 'monoclinic',
    specificGravity: 2.32,
    cleavage: 'perfect',
  },
  {
    id: 'calcite',
    name: 'Calcite',
    hardness: 3,
    luster: 'vitreous',
    color: 'colorless',
    streak: 'white',
    crystalSystem: 'hexagonal',
    specificGravity: 2.71,
    cleavage: 'perfect',
  },
  {
    id: 'fluorite',
    name: 'Fluorite',
    hardness: 4,
    luster: 'vitreous',
    color: 'purple',
    streak: 'white',
    crystalSystem: 'cubic',
    specificGravity: 3.18,
    cleavage: 'perfect',
  },
  {
    id: 'apatite',
    name: 'Apatite',
    hardness: 5,
    luster: 'vitreous',
    color: 'green',
    streak: 'white',
    crystalSystem: 'hexagonal',
    specificGravity: 3.19,
    cleavage: 'poor',
  },
  {
    id: 'orthoclase',
    name: 'Orthoclase',
    hardness: 6,
    luster: 'vitreous',
    color: 'pink',
    streak: 'white',
    crystalSystem: 'monoclinic',
    specificGravity: 2.56,
    cleavage: 'good',
  },
  {
    id: 'quartz',
    name: 'Quartz',
    hardness: 7,
    luster: 'vitreous',
    color: 'colorless',
    streak: 'white',
    crystalSystem: 'hexagonal',
    specificGravity: 2.65,
    cleavage: 'none',
  },
  {
    id: 'topaz',
    name: 'Topaz',
    hardness: 8,
    luster: 'vitreous',
    color: 'yellow',
    streak: 'white',
    crystalSystem: 'orthorhombic',
    specificGravity: 3.53,
    cleavage: 'perfect',
  },
  {
    id: 'corundum',
    name: 'Corundum',
    hardness: 9,
    luster: 'adamantine',
    color: 'varies',
    streak: 'white',
    crystalSystem: 'hexagonal',
    specificGravity: 4.02,
    cleavage: 'none',
  },
  {
    id: 'diamond',
    name: 'Diamond',
    hardness: 10,
    luster: 'adamantine',
    color: 'colorless',
    streak: 'white',
    crystalSystem: 'cubic',
    specificGravity: 3.52,
    cleavage: 'perfect',
  },
];

// ═══════════════════════════════════════════════════════════════════
// Rock & Mineral Analysis
// ═══════════════════════════════════════════════════════════════════

export function getMineralByHardness(hardness: number): Mineral | undefined {
  return MOHS_SCALE.find((m) => m.hardness === hardness);
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
  return samples.filter((s) => s.type === type);
}

// ═══════════════════════════════════════════════════════════════════
// Seismic Waves
// ═══════════════════════════════════════════════════════════════════

export function pWaveSpeed(depthKm: number): number {
  // Simplified: P-wave ~6 km/s in crust, faster in mantle
  if (depthKm < 35) return 6.5;
  if (depthKm < 2900) return 10 + depthKm * 0.001;
  return 13.5; // outer core
}

export function sWaveSpeed(depthKm: number): number {
  if (depthKm < 35) return 3.6;
  if (depthKm < 2900) return 5.5 + depthKm * 0.0005;
  return 0; // S-waves don't pass through liquid outer core
}

export function seismicArrivalTime(distanceKm: number, waveSpeed: number): number {
  return distanceKm / waveSpeed; // seconds
}

export function plateDisplacementOverTime(velocityCmPerYear: number, years: number): number {
  return (velocityCmPerYear * years) / 100; // meters
}

export function earthquakeMagnitudeEnergy(magnitude: number): number {
  // Energy in joules: log₁₀(E) = 1.5M + 4.8
  return Math.pow(10, 1.5 * magnitude + 4.8);
}

// ═══════════════════════════════════════════════════════════════════
// Geological Timeline
// ═══════════════════════════════════════════════════════════════════

export interface GeologicalPeriod {
  name: string;
  era: string;
  eon: string;
  startMya: number; // Million years ago
  endMya: number;
  fossilMarkers: string[];
  keyEvents: string[];
}

export const GEOLOGICAL_TIMELINE: GeologicalPeriod[] = [
  {
    name: 'Quaternary',
    era: 'Cenozoic',
    eon: 'Phanerozoic',
    startMya: 2.6,
    endMya: 0,
    fossilMarkers: ['Homo sapiens', 'mammoth'],
    keyEvents: ['Ice ages', 'Human evolution'],
  },
  {
    name: 'Neogene',
    era: 'Cenozoic',
    eon: 'Phanerozoic',
    startMya: 23.03,
    endMya: 2.6,
    fossilMarkers: ['grassland mammals', 'ape divergence'],
    keyEvents: ['Grassland expansion', 'Himalaya uplift'],
  },
  {
    name: 'Paleogene',
    era: 'Cenozoic',
    eon: 'Phanerozoic',
    startMya: 66,
    endMya: 23.03,
    fossilMarkers: ['early primates', 'whales'],
    keyEvents: ['Mammal radiation', 'India collision'],
  },
  {
    name: 'Cretaceous',
    era: 'Mesozoic',
    eon: 'Phanerozoic',
    startMya: 145,
    endMya: 66,
    fossilMarkers: ['T. rex', 'flowering plants'],
    keyEvents: ['K-Pg extinction', 'Pangaea breakup'],
  },
  {
    name: 'Jurassic',
    era: 'Mesozoic',
    eon: 'Phanerozoic',
    startMya: 201,
    endMya: 145,
    fossilMarkers: ['Brachiosaurus', 'Archaeopteryx'],
    keyEvents: ['Dinosaur dominance', 'First birds'],
  },
  {
    name: 'Triassic',
    era: 'Mesozoic',
    eon: 'Phanerozoic',
    startMya: 252,
    endMya: 201,
    fossilMarkers: ['early dinosaurs', 'first mammals'],
    keyEvents: ['Pangaea intact', 'End-Triassic extinction'],
  },
  {
    name: 'Permian',
    era: 'Paleozoic',
    eon: 'Phanerozoic',
    startMya: 299,
    endMya: 252,
    fossilMarkers: ['Dimetrodon', 'seed ferns'],
    keyEvents: ['Great Dying (96% species)'],
  },
  {
    name: 'Carboniferous',
    era: 'Paleozoic',
    eon: 'Phanerozoic',
    startMya: 359,
    endMya: 299,
    fossilMarkers: ['giant insects', 'coal forests'],
    keyEvents: ['Coal deposits', 'First reptiles'],
  },
  {
    name: 'Cambrian',
    era: 'Paleozoic',
    eon: 'Phanerozoic',
    startMya: 539,
    endMya: 485,
    fossilMarkers: ['trilobites', 'Anomalocaris'],
    keyEvents: ['Cambrian explosion'],
  },
];

export function periodByAge(ageMya: number): GeologicalPeriod | undefined {
  return GEOLOGICAL_TIMELINE.find((p) => ageMya >= p.endMya && ageMya <= p.startMya);
}

export function periodsByEra(era: string): GeologicalPeriod[] {
  return GEOLOGICAL_TIMELINE.filter((p) => p.era === era);
}

// ═══════════════════════════════════════════════════════════════════
// Earth Cross-Section
// ═══════════════════════════════════════════════════════════════════

export interface EarthLayer {
  name: string;
  depthStartKm: number;
  depthEndKm: number;
  state: 'solid' | 'liquid' | 'plastic';
  compositionMajor: string;
  temperatureC: number;
  densityKgM3: number;
}

export const EARTH_LAYERS: EarthLayer[] = [
  {
    name: 'Crust',
    depthStartKm: 0,
    depthEndKm: 35,
    state: 'solid',
    compositionMajor: 'silicates',
    temperatureC: 200,
    densityKgM3: 2700,
  },
  {
    name: 'Upper Mantle',
    depthStartKm: 35,
    depthEndKm: 670,
    state: 'plastic',
    compositionMajor: 'peridotite',
    temperatureC: 1400,
    densityKgM3: 3400,
  },
  {
    name: 'Lower Mantle',
    depthStartKm: 670,
    depthEndKm: 2900,
    state: 'solid',
    compositionMajor: 'silicate perovskite',
    temperatureC: 3000,
    densityKgM3: 5000,
  },
  {
    name: 'Outer Core',
    depthStartKm: 2900,
    depthEndKm: 5100,
    state: 'liquid',
    compositionMajor: 'iron-nickel',
    temperatureC: 4500,
    densityKgM3: 10000,
  },
  {
    name: 'Inner Core',
    depthStartKm: 5100,
    depthEndKm: 6371,
    state: 'solid',
    compositionMajor: 'iron-nickel',
    temperatureC: 5500,
    densityKgM3: 13000,
  },
];

export function layerAtDepth(depthKm: number): EarthLayer | undefined {
  return EARTH_LAYERS.find((l) => depthKm >= l.depthStartKm && depthKm < l.depthEndKm);
}
