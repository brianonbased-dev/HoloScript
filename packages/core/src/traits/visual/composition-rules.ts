import type { R3FMaterialProps } from './types';

/**
 * Composition rules for multi-trait visual merging.
 *
 * Rules control how traits interact when multiple are applied:
 * - **requires**: Trait only applies if objects has tags from other traits
 * - **suppresses**: Trait removes listed traits from consideration
 * - **additive**: Extra properties blended on top when trait is present
 * - **multi-trait merge**: When all listed traits are present, override with merged values
 */

export type CompositionRule = RequiresRule | SuppressesRule | AdditiveRule | MultiTraitMergeRule;

export interface RequiresRule {
  trait: string;
  requires: { tags: string[] };
}

export interface SuppressesRule {
  trait: string;
  suppresses: string[];
}

export interface AdditiveRule {
  trait: string;
  additive: Partial<R3FMaterialProps>;
}

export interface MultiTraitMergeRule {
  traits: string[];
  merge: Partial<R3FMaterialProps>;
}

/**
 * Default composition rules.
 * These handle common trait interactions and conflicts.
 */
export const COMPOSITION_RULES: CompositionRule[] = [
  // ══════════════════════════════════════════════════════════════════
  // REQUIREMENT RULES — trait only applies if another trait provides
  // the required tag (a trait cannot self-satisfy its own requirement)
  // ══════════════════════════════════════════════════════════════════

  // Corrosion traits only apply to objects with a metallic base
  { trait: 'rusted', requires: { tags: ['metallic'] } },
  { trait: 'tarnished', requires: { tags: ['metallic'] } },
  { trait: 'corroded', requires: { tags: ['metallic'] } },

  // Metal finishing requires a metallic base
  { trait: 'brushed', requires: { tags: ['metallic'] } },
  { trait: 'hammered', requires: { tags: ['metallic'] } },

  // Organic overgrowth requires an organic or mineral base
  { trait: 'moss_covered', requires: { tags: ['organic', 'mineral', 'stone'] } },
  { trait: 'vine_covered', requires: { tags: ['organic', 'mineral', 'stone'] } },

  // Biological processes require organic base
  { trait: 'decayed', requires: { tags: ['organic'] } },
  { trait: 'fossilized', requires: { tags: ['organic'] } },
  { trait: 'witherable', requires: { tags: ['organic'] } },
  { trait: 'bloomable', requires: { tags: ['organic'] } },

  // ══════════════════════════════════════════════════════════════════
  // SUPPRESSION RULES — trait removes listed traits from consideration
  // ══════════════════════════════════════════════════════════════════

  // Pristine/brand_new suppress all damage/wear states
  {
    trait: 'pristine',
    suppresses: [
      'rusted',
      'worn',
      'weathered',
      'decayed',
      'tarnished',
      'corroded',
      'crumbling',
      'faded',
      'stained',
      'scratched',
      'dented',
      'chipped',
      'cracked',
      'shattered',
      'battle_scarred',
      'charred',
      'tattered',
      'dust_covered',
      'moss_covered',
      'vine_covered',
    ],
  },
  {
    trait: 'brand_new',
    suppresses: [
      'rusted',
      'worn',
      'weathered',
      'decayed',
      'tarnished',
      'corroded',
      'faded',
      'stained',
      'scratched',
      'dented',
      'chipped',
      'antique',
      'dust_covered',
    ],
  },

  // Restored suppresses active decay (but not cosmetic scars)
  {
    trait: 'restored',
    suppresses: ['decayed', 'crumbling', 'corroded', 'rusted'],
  },

  // Mirrored overrides surface textures
  {
    trait: 'mirrored',
    suppresses: ['matte_surface', 'frosted_surface', 'brushed'],
  },

  // Temperature conflicts — fire and ice cancel each other
  {
    trait: 'frozen_liquid',
    suppresses: ['fiery', 'elemental_fire', 'volcanic_eruption', 'boiling', 'charred'],
  },
  {
    trait: 'elemental_fire',
    suppresses: ['frozen_liquid', 'elemental_ice', 'frosted_surface'],
  },

  // Visibility — invisible/cloaking suppress visual effects
  {
    trait: 'invisible',
    suppresses: ['glowing', 'neon_glow', 'luminous', 'bioluminescent', 'holographic', 'outlined'],
  },
  {
    trait: 'cloaking',
    suppresses: ['glowing', 'neon_glow', 'holographic', 'outlined'],
  },

  // Petrification/fossilization suppress living traits
  {
    trait: 'petrified',
    suppresses: ['growable', 'bloomable', 'photosynthetic', 'witherable'],
  },
  {
    trait: 'fossilized',
    suppresses: ['growable', 'bloomable', 'bioluminescent', 'photosynthetic'],
  },

  // Crystallization suppresses soft surface textures
  {
    trait: 'crystallized',
    suppresses: ['furry', 'velvety', 'woolly', 'silky'],
  },

  // Magic conflicts — blessed and cursed cancel each other
  { trait: 'cursed', suppresses: ['blessed'] },
  { trait: 'blessed', suppresses: ['cursed'] },

  // Environmental conflicts
  {
    trait: 'drought',
    suppresses: ['leaking', 'overflowing', 'moss_covered'],
  },
  {
    trait: 'flood',
    suppresses: ['drought', 'dust_covered', 'sandstorm'],
  },
  {
    trait: 'underwater',
    suppresses: ['fiery', 'elemental_fire'],
  },

  // ══════════════════════════════════════════════════════════════════
  // ADDITIVE RULES — extra properties blended on top
  // ══════════════════════════════════════════════════════════════════

  // Frozen adds blue tint
  { trait: 'frozen_liquid', additive: { color: '#D6EAF8' } },

  // Enchanted adds a subtle purple shimmer
  { trait: 'enchanted', additive: { emissive: '#9966FF', emissiveIntensity: 0.3 } },

  // Ghostly adds transparency
  { trait: 'ghostly', additive: { opacity: 0.3, transparent: true } },

  // Electric adds blue-white emissive
  { trait: 'electric_arc', additive: { emissive: '#00BFFF', emissiveIntensity: 0.5 } },

  // Bioluminescence adds green glow
  { trait: 'bioluminescent', additive: { emissive: '#00FFAA', emissiveIntensity: 0.4 } },

  // Iridescent/pearlescent add color-shift sheen
  { trait: 'iridescent', additive: { iridescence: 0.5 } },
  { trait: 'pearlescent', additive: { iridescence: 0.8 } },

  // ══════════════════════════════════════════════════════════════════
  // MULTI-TRAIT MERGE RULES — when all listed traits are present,
  // override merged material with these values (applied last)
  // ══════════════════════════════════════════════════════════════════

  // ── Metal synergies ─────────────────────────────────────────────

  // Iron + rusted = corroded bronze appearance
  {
    traits: ['rusted', 'iron_material'],
    merge: { color: '#6B3A1F', roughness: 0.9, metalness: 0.5 },
  },

  // Copper + rusted = verdigris patina
  {
    traits: ['rusted', 'copper_material'],
    merge: { color: '#5C8A7A', roughness: 0.7, metalness: 0.6 },
  },

  // Gold + polished = high-shine gold
  {
    traits: ['gold_material', 'polished'],
    merge: { roughness: 0.05, envMapIntensity: 2.0 },
  },

  // ── Elemental synergies ─────────────────────────────────────────

  // Water + frozen = deep ice
  {
    traits: ['elemental_water', 'frozen_liquid'],
    merge: { color: '#B0D4E8', transmission: 0.85, roughness: 0.05 },
  },

  // Fire + angry = rage inferno
  {
    traits: ['elemental_fire', 'angry'],
    merge: { emissive: '#FF1100', emissiveIntensity: 3.5 },
  },

  // Lightning + thunderstorm = storm energy
  {
    traits: ['elemental_lightning', 'thunderstorm'],
    merge: { emissive: '#FFFFFF', emissiveIntensity: 4.5 },
  },

  // Earth + ancient = primordial stone
  {
    traits: ['elemental_earth', 'ancient'],
    merge: { roughness: 1.0, color: '#5A4A3A' },
  },

  // ── Magic synergies ─────────────────────────────────────────────

  // Enchanted + ancient = magical artifact
  {
    traits: ['enchanted', 'ancient'],
    merge: { emissive: '#9966FF', emissiveIntensity: 0.5, color: '#8B6914' },
  },

  // Blessed + gold = holy golden artifact
  {
    traits: ['blessed', 'gold_material'],
    merge: { emissive: '#FFFACD', emissiveIntensity: 0.8, envMapIntensity: 2.0 },
  },

  // Enchanted + diamond = spellbound gem
  {
    traits: ['enchanted', 'diamond_gem'],
    merge: { emissive: '#CC88FF', emissiveIntensity: 0.6, iridescence: 1.0 },
  },

  // Crystal + enchanted = magical crystal
  {
    traits: ['crystal_gem', 'enchanted'],
    merge: { emissive: '#CC88FF', emissiveIntensity: 1.0, iridescence: 1.0 },
  },

  // Cursed + blood stained = profane artifact
  {
    traits: ['cursed', 'blood_stained'],
    merge: { emissive: '#660000', emissiveIntensity: 0.8, color: '#4A0000' },
  },

  // ── Age + condition synergies ───────────────────────────────────

  // Ancient + weathered = time-worn relic
  {
    traits: ['ancient', 'weathered'],
    merge: { roughness: 0.95, color: '#6B5A4A' },
  },

  // Ancient + moss = ancient overgrown ruins
  {
    traits: ['ancient', 'moss_covered'],
    merge: { roughness: 0.95, color: '#3A6A2F' },
  },

  // Pristine + crystal = flawless crystal
  {
    traits: ['pristine', 'crystal_gem'],
    merge: { roughness: 0.0, transmission: 0.98, envMapIntensity: 2.5 },
  },

  // ── Nature synergies ────────────────────────────────────────────

  // Bioluminescent + aquatic = glowing sea creature
  {
    traits: ['bioluminescent', 'aquatic'],
    merge: { emissive: '#00CCAA', emissiveIntensity: 1.2 },
  },

  // Venomous + glowing = toxic glow
  {
    traits: ['venomous', 'glowing'],
    merge: { emissive: '#00FF00', emissiveIntensity: 0.8, color: '#3A5A1A' },
  },

  // Wildfire + wooden = burning wood
  {
    traits: ['wildfire', 'wooden'],
    merge: { emissive: '#FF4500', emissiveIntensity: 2.5, roughness: 0.9 },
  },

  // ── Visual effect synergies ─────────────────────────────────────

  // Emissive + angry mood = intense red emissive
  {
    traits: ['emissive', 'angry'],
    merge: { emissive: '#FF2200', emissiveIntensity: 2.5 },
  },

  // Holographic + ghostly = spectral hologram
  {
    traits: ['holographic', 'ghostly'],
    merge: { opacity: 0.2, emissive: '#88BBFF', emissiveIntensity: 1.5 },
  },

  // Holographic + neon = vibrant holographic display
  {
    traits: ['holographic', 'neon_glow'],
    merge: { emissive: '#00FFFF', emissiveIntensity: 2.0, opacity: 0.5 },
  },

  // Frozen + crystalline = ice crystal formation
  {
    traits: ['frozen_liquid', 'crystalline'],
    merge: { transmission: 0.9, ior: 1.31, iridescence: 0.7 },
  },

  // Eerie + ghostly = spectral haunting
  {
    traits: ['eerie', 'ghostly'],
    merge: { emissive: '#6633AA', emissiveIntensity: 0.5, opacity: 0.25 },
  },

  // ── Sci-fi synergies ────────────────────────────────────────────

  // Plasma + force field = plasma barrier
  {
    traits: ['plasma', 'force_field'],
    merge: { emissive: '#FF00FF', emissiveIntensity: 2.5, opacity: 0.4 },
  },
];
