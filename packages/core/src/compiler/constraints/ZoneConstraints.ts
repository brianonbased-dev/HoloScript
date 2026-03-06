/**
 * Zone-Level and World-Level Trait Constraints
 * biome_requires, biome_conflicts, ecological_coherence
 * @version 1.0.0
 */
export type BiomeType = 'forest'|'desert'|'ocean'|'arctic'|'urban'|'cave'|'mountain'|'grassland'|'volcanic'|'swamp'|'sky'|'underwater';
export interface BiomeRule { biome: BiomeType; requiredTraits: string[]; conflictingTraits: string[]; maxEntities: number; }
export interface EcologicalRule { traitA: string; traitB: string; relationship: 'symbiotic'|'predator-prey'|'competitive'|'neutral'; minDistance: number; maxDistance: number; }
export interface ZoneConstraintResult { valid: boolean; violations: string[]; warnings: string[]; }

export const DEFAULT_BIOME_RULES: BiomeRule[] = [
  { biome: 'ocean', requiredTraits: ['Buoyancy','WaterInteraction'], conflictingTraits: ['FireEffect','VolcanicTerrain'], maxEntities: 500 },
  { biome: 'arctic', requiredTraits: ['ColdResistance'], conflictingTraits: ['TropicalVegetation','DesertTerrain'], maxEntities: 200 },
  { biome: 'volcanic', requiredTraits: ['HeatResistance'], conflictingTraits: ['IceFormation','SnowCover'], maxEntities: 100 },
  { biome: 'forest', requiredTraits: [], conflictingTraits: ['DesertTerrain','LavaFlow'], maxEntities: 1000 },
  { biome: 'urban', requiredTraits: [], conflictingTraits: ['WildGrowth'], maxEntities: 2000 },
];

export class ZoneConstraintValidator {
  private biomeRules: Map<BiomeType, BiomeRule> = new Map();
  private ecologicalRules: EcologicalRule[] = [];
  constructor(customRules?: BiomeRule[], ecoRules?: EcologicalRule[]) {
    for (const r of customRules ?? DEFAULT_BIOME_RULES) this.biomeRules.set(r.biome, r);
    this.ecologicalRules = ecoRules ?? [];
  }
  addBiomeRule(rule: BiomeRule): void { this.biomeRules.set(rule.biome, rule); }
  addEcologicalRule(rule: EcologicalRule): void { this.ecologicalRules.push(rule); }
  validateZone(biome: BiomeType, entities: Array<{ name: string; traits: string[] }>): ZoneConstraintResult {
    const violations: string[] = []; const warnings: string[] = [];
    const rule = this.biomeRules.get(biome);
    if (!rule) { warnings.push(`No rules defined for biome '${biome}'`); return { valid: true, violations, warnings }; }
    if (entities.length > rule.maxEntities) violations.push(`Zone '${biome}' has ${entities.length} entities, max is ${rule.maxEntities}`);
    for (const entity of entities) {
      for (const conflict of rule.conflictingTraits) {
        if (entity.traits.includes(conflict)) violations.push(`Entity '${entity.name}' has conflicting trait '${conflict}' for biome '${biome}'`);
      }
      if (rule.requiredTraits.length > 0) {
        const hasRequired = rule.requiredTraits.some(t => entity.traits.includes(t));
        if (!hasRequired) warnings.push(`Entity '${entity.name}' in '${biome}' lacks required traits: ${rule.requiredTraits.join(', ')}`);
      }
    }
    return { valid: violations.length === 0, violations, warnings };
  }
  validateEcologicalCoherence(entities: Array<{ name: string; traits: string[]; position: [number,number,number] }>): ZoneConstraintResult {
    const violations: string[] = []; const warnings: string[] = [];
    for (const rule of this.ecologicalRules) {
      const groupA = entities.filter(e => e.traits.includes(rule.traitA));
      const groupB = entities.filter(e => e.traits.includes(rule.traitB));
      for (const a of groupA) for (const b of groupB) {
        const d = Math.sqrt((a.position[0]-b.position[0])**2+(a.position[1]-b.position[1])**2+(a.position[2]-b.position[2])**2);
        if (d < rule.minDistance) violations.push(`'${a.name}' (${rule.traitA}) too close to '${b.name}' (${rule.traitB}): ${d.toFixed(1)}m < ${rule.minDistance}m`);
        if (d > rule.maxDistance && rule.relationship === 'symbiotic') warnings.push(`Symbiotic pair '${a.name}'/'${b.name}' too far apart: ${d.toFixed(1)}m > ${rule.maxDistance}m`);
      }
    }
    return { valid: violations.length === 0, violations, warnings };
  }
}
