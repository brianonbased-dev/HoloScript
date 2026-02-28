/**
 * archaeologicalDig.ts — Archaeological Dig Simulation Engine
 *
 * Excavation layers, artifact cataloging, carbon-14 dating timeline,
 * fragment-to-artifact reconstruction, and stratigraphy modeling.
 */

export interface Vec3 { x: number; y: number; z: number }

export type ArtifactMaterial = 'ceramic' | 'stone' | 'metal' | 'bone' | 'wood' | 'glass' | 'textile' | 'organic';
export type ConservationStatus = 'excellent' | 'good' | 'fair' | 'poor' | 'fragmentary';
export type StratumPeriod = 'neolithic' | 'bronze-age' | 'iron-age' | 'roman' | 'medieval' | 'post-medieval' | 'modern';

export interface Stratum {
  id: string;
  name: string;
  period: StratumPeriod;
  depthMinM: number;
  depthMaxM: number;
  soilColor: string;
  composition: string;       // e.g., 'sandy loam', 'clay'
  estimatedAge: number;      // years BP (before present)
}

export interface ArtifactRecord {
  id: string;
  catalogNumber: string;
  name: string;
  material: ArtifactMaterial;
  stratumId: string;
  position: Vec3;
  dimensions: { lengthCm: number; widthCm: number; heightCm: number };
  weight: number;            // grams
  condition: ConservationStatus;
  description: string;
  photoUrls: string[];
  carbonDate?: { ageBP: number; margin: number }; // ± margin
  fragments: string[];       // IDs of associated fragments
}

export interface ExcavationGrid {
  id: string;
  unitLabel: string;         // e.g., 'A1', 'B3'
  position: Vec3;
  widthM: number;
  lengthM: number;
  stratumHistory: Stratum[];
  artifacts: ArtifactRecord[];
  excavated: boolean;
}

export interface ReconstructionGroup {
  id: string;
  name: string;
  fragmentIds: string[];
  completeness: number;      // 0-1
  reconstructedModel?: string; // URL to 3D model
}

// ═══════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════

export const PERIOD_TIMELINE: Record<StratumPeriod, { startBP: number; endBP: number; label: string }> = {
  neolithic:     { startBP: 10000, endBP: 4500,  label: 'Neolithic (10000-4500 BP)' },
  'bronze-age':  { startBP: 4500,  endBP: 2800,  label: 'Bronze Age (4500-2800 BP)' },
  'iron-age':    { startBP: 2800,  endBP: 2000,  label: 'Iron Age (2800-2000 BP)' },
  roman:         { startBP: 2000,  endBP: 1500,  label: 'Roman (2000-1500 BP)' },
  medieval:      { startBP: 1500,  endBP: 500,   label: 'Medieval (1500-500 BP)' },
  'post-medieval': { startBP: 500, endBP: 100,   label: 'Post-Medieval (500-100 BP)' },
  modern:        { startBP: 100,   endBP: 0,     label: 'Modern (<100 BP)' },
};

// ═══════════════════════════════════════════════════════════════════
// Carbon-14 Dating
// ═══════════════════════════════════════════════════════════════════

const C14_HALF_LIFE = 5730; // years

export function carbon14RemainingFraction(ageBP: number): number {
  return Math.pow(0.5, ageBP / C14_HALF_LIFE);
}

export function estimateAgeFromC14(fractionRemaining: number): number {
  if (fractionRemaining <= 0 || fractionRemaining >= 1) return 0;
  return -C14_HALF_LIFE * Math.log(fractionRemaining) / Math.log(2);
}

export function isC14Dateable(material: ArtifactMaterial): boolean {
  return ['bone', 'wood', 'textile', 'organic'].includes(material);
}

export function carbonDateRange(date: { ageBP: number; margin: number }): { min: number; max: number } {
  return { min: date.ageBP - date.margin, max: date.ageBP + date.margin };
}

// ═══════════════════════════════════════════════════════════════════
// Stratigraphy
// ═══════════════════════════════════════════════════════════════════

export function stratumThickness(stratum: Stratum): number {
  return stratum.depthMaxM - stratum.depthMinM;
}

export function identifyPeriodByDepth(strata: Stratum[], depth: number): StratumPeriod | null {
  const match = strata.find(s => depth >= s.depthMinM && depth <= s.depthMaxM);
  return match?.period ?? null;
}

export function stratigraphicSequenceValid(strata: Stratum[]): boolean {
  // Law of Superposition: deeper = older
  for (let i = 1; i < strata.length; i++) {
    if (strata[i].estimatedAge < strata[i - 1].estimatedAge) return false;
  }
  return true;
}

// ═══════════════════════════════════════════════════════════════════
// Artifact Management
// ═══════════════════════════════════════════════════════════════════

export function artifactsByMaterial(artifacts: ArtifactRecord[], material: ArtifactMaterial): ArtifactRecord[] {
  return artifacts.filter(a => a.material === material);
}

export function artifactsByStratum(artifacts: ArtifactRecord[], stratumId: string): ArtifactRecord[] {
  return artifacts.filter(a => a.stratumId === stratumId);
}

export function reconstructionCompleteness(group: ReconstructionGroup): string {
  if (group.completeness >= 0.9) return 'near-complete';
  if (group.completeness >= 0.6) return 'substantial';
  if (group.completeness >= 0.3) return 'partial';
  return 'fragmentary';
}

export function totalArtifactCount(grid: ExcavationGrid[]): number {
  return grid.reduce((sum, g) => sum + g.artifacts.length, 0);
}

export function excavationProgress(grid: ExcavationGrid[]): number {
  if (grid.length === 0) return 0;
  return grid.filter(g => g.excavated).length / grid.length;
}
