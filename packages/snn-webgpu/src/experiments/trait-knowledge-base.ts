/**
 * @holoscript/snn-webgpu - Trait Knowledge Base Builder
 *
 * Constructs a fact-retrieval dataset from HoloScript's VR trait system.
 * Each trait becomes a (input_vector, property_vector) pair where:
 *   - input_vector: one-hot encoded trait identity (dim = total traits)
 *   - property_vector: [category/10, physics, interactive, visual, auditory, complexity/2]
 *
 * Uses real trait data from @holoscript/core trait constants.
 *
 * @version 1.0.0
 */

import type { TraitFact, TraitKnowledgeBase } from './trait-retrieval-types.js';

// =============================================================================
// TRAIT CATEGORY DEFINITIONS
// =============================================================================

/**
 * HoloScript trait categories with their constituent traits and properties.
 * Derived from packages/core/src/traits/constants/*.ts
 */
interface TraitCategoryDef {
  name: string;
  categoryId: number;
  traits: string[];
  /** Default properties for traits in this category */
  defaults: {
    physicsEnabled: boolean;
    interactive: boolean;
    visual: boolean;
    auditory: boolean;
    complexityTier: number;
  };
}

const TRAIT_CATEGORIES: TraitCategoryDef[] = [
  {
    name: 'core-vr-interaction',
    categoryId: 0,
    traits: [
      'grabbable', 'throwable', 'pointable', 'hoverable', 'scalable',
      'rotatable', 'stackable', 'snappable', 'breakable', 'stretchable',
      'moldable', 'timeline', 'choreography',
    ],
    defaults: { physicsEnabled: true, interactive: true, visual: false, auditory: false, complexityTier: 0 },
  },
  {
    name: 'material-properties',
    categoryId: 1,
    traits: [
      'wooden', 'stone_material', 'brick', 'concrete', 'marble_material',
      'granite', 'sandstone', 'slate', 'clay', 'terracotta',
      'glass_material', 'stained_glass', 'crystal_material', 'ice_material',
      'bone', 'ivory', 'shell', 'coral', 'bamboo', 'paper',
    ],
    defaults: { physicsEnabled: false, interactive: false, visual: true, auditory: false, complexityTier: 0 },
  },
  {
    name: 'physics-expansion',
    categoryId: 2,
    traits: [
      'buoyancy', 'magnetic', 'electrostatic', 'aerodynamic', 'gyroscopic',
      'friction_override', 'density_override', 'deformable', 'shatterable',
      'springy', 'viscous', 'turbulent',
    ],
    defaults: { physicsEnabled: true, interactive: false, visual: false, auditory: false, complexityTier: 1 },
  },
  {
    name: 'visual-effects',
    categoryId: 3,
    traits: [
      'glowing', 'emissive_pulse', 'holographic', 'transparent',
      'reflective', 'refractive', 'iridescent', 'metallic_sheen',
      'subsurface_scattering', 'volumetric_fog', 'particle_emitter',
      'trail_renderer', 'lens_flare', 'bloom_override',
    ],
    defaults: { physicsEnabled: false, interactive: false, visual: true, auditory: false, complexityTier: 1 },
  },
  {
    name: 'audio',
    categoryId: 4,
    traits: [
      'spatial_audio', 'audio_occluded', 'reverb_zone', 'sound_emitter',
      'audio_reactive', 'doppler_enabled', 'audio_material',
      'ambient_sound', 'footstep_audio', 'impact_sound',
    ],
    defaults: { physicsEnabled: false, interactive: false, visual: false, auditory: true, complexityTier: 1 },
  },
  {
    name: 'intelligence-behavior',
    categoryId: 5,
    traits: [
      'behavior_tree', 'state_machine', 'goal_oriented', 'pathfinding',
      'flocking', 'obstacle_avoidance', 'perception', 'memory',
      'learning', 'decision_making', 'emotional_state', 'social_awareness',
    ],
    defaults: { physicsEnabled: false, interactive: true, visual: false, auditory: false, complexityTier: 2 },
  },
  {
    name: 'neuromorphic',
    categoryId: 6,
    traits: [
      'lif_neuron', 'cuba_lif_neuron', 'if_neuron', 'leaky_integrator',
      'integrator', 'synaptic_connection', 'linear_connection',
      'conv_connection', 'spike_encoder', 'rate_encoder',
      'spike_decoder', 'spike_delay', 'spike_pooling',
    ],
    defaults: { physicsEnabled: false, interactive: false, visual: false, auditory: false, complexityTier: 2 },
  },
  {
    name: 'locomotion-movement',
    categoryId: 7,
    traits: [
      'walkable', 'climbable', 'swimmable', 'flyable', 'teleportable',
      'slidable', 'rideable', 'mountable', 'grapple_point',
      'rail_grind', 'wall_run', 'zipline',
    ],
    defaults: { physicsEnabled: true, interactive: true, visual: false, auditory: false, complexityTier: 1 },
  },
  {
    name: 'environmental-biome',
    categoryId: 8,
    traits: [
      'forest_biome', 'desert_biome', 'ocean_biome', 'arctic_biome',
      'volcanic_biome', 'cave_biome', 'urban_biome', 'space_biome',
      'underwater_biome', 'mountain_biome', 'swamp_biome', 'prairie_biome',
    ],
    defaults: { physicsEnabled: false, interactive: false, visual: true, auditory: true, complexityTier: 2 },
  },
  {
    name: 'weather-particles',
    categoryId: 9,
    traits: [
      'rain', 'snow', 'hail', 'fog', 'mist', 'sandstorm',
      'thunder', 'lightning', 'wind_zone', 'tornado',
      'fire_spread', 'smoke',
    ],
    defaults: { physicsEnabled: true, interactive: false, visual: true, auditory: true, complexityTier: 1 },
  },
];

// =============================================================================
// TRAIT PROPERTY OVERRIDES
// =============================================================================

/**
 * Specific trait property overrides where the default doesn't apply.
 * Key = trait name, value = partial override of defaults.
 */
const TRAIT_OVERRIDES: Record<string, Partial<TraitFact>> = {
  // Some VR interaction traits are also visual
  breakable: { visual: true, auditory: true },
  stretchable: { visual: true },
  moldable: { visual: true },
  choreography: { visual: true, complexityTier: 2 },
  timeline: { complexityTier: 1 },

  // Some materials also have physics
  ice_material: { physicsEnabled: true },
  glass_material: { physicsEnabled: true },

  // Visual effects with interaction
  particle_emitter: { interactive: true, complexityTier: 2 },
  holographic: { complexityTier: 2 },
  volumetric_fog: { complexityTier: 2 },

  // Audio with visual
  lightning: { visual: true },
  fire_spread: { physicsEnabled: true },
  tornado: { physicsEnabled: true, complexityTier: 2 },

  // Neuromorphic with physics (simulation)
  lif_neuron: { physicsEnabled: true },
  cuba_lif_neuron: { physicsEnabled: true },

  // Locomotion with audio
  footstep_audio: { interactive: true },
  climbable: { auditory: true },
};

// =============================================================================
// KNOWLEDGE BASE BUILDER
// =============================================================================

/**
 * Build the trait knowledge base from category definitions.
 *
 * @returns Complete knowledge base with facts, encoding info, and metadata
 */
export function buildTraitKnowledgeBase(): TraitKnowledgeBase {
  const facts: TraitFact[] = [];
  const categoryNames = TRAIT_CATEGORIES.map(c => c.name);

  for (const category of TRAIT_CATEGORIES) {
    for (const traitName of category.traits) {
      const overrides = TRAIT_OVERRIDES[traitName] || {};

      const fact: TraitFact = {
        name: traitName,
        categoryId: category.categoryId,
        category: category.name,
        physicsEnabled: overrides.physicsEnabled ?? category.defaults.physicsEnabled,
        interactive: overrides.interactive ?? category.defaults.interactive,
        visual: overrides.visual ?? category.defaults.visual,
        auditory: overrides.auditory ?? category.defaults.auditory,
        complexityTier: overrides.complexityTier ?? category.defaults.complexityTier,
        propertyVector: [], // computed below
      };

      // Build normalized property vector
      fact.propertyVector = [
        fact.categoryId / 9.0,              // normalized category (0-1)
        fact.physicsEnabled ? 1.0 : 0.0,    // boolean
        fact.interactive ? 1.0 : 0.0,       // boolean
        fact.visual ? 1.0 : 0.0,            // boolean
        fact.auditory ? 1.0 : 0.0,          // boolean
        fact.complexityTier / 2.0,           // normalized complexity (0-1)
      ];

      facts.push(fact);
    }
  }

  return {
    facts,
    numCategories: TRAIT_CATEGORIES.length,
    inputDim: facts.length, // one-hot encoding
    outputDim: 6,           // property vector dimension
    categoryNames,
  };
}

/**
 * Encode a trait index as a one-hot input vector.
 *
 * @param traitIndex - Index into the knowledge base facts array
 * @param totalTraits - Total number of traits
 * @returns One-hot encoded vector
 */
export function encodeTraitOneHot(traitIndex: number, totalTraits: number): number[] {
  const vec = new Array(totalTraits).fill(0);
  vec[traitIndex] = 1.0;
  return vec;
}

/**
 * Encode a trait as a dense hash vector (alternative to one-hot).
 * Uses a simple deterministic hash to create a distributed representation.
 *
 * @param traitIndex - Index into the knowledge base
 * @param dim - Output vector dimension
 * @param seed - Hash seed
 * @returns Dense encoded vector with values in [0, 1]
 */
export function encodeTraitDense(traitIndex: number, dim: number, seed: number = 42): number[] {
  const vec = new Array(dim);
  let state = ((traitIndex + 1) * 2654435761 + seed) >>> 0;

  for (let i = 0; i < dim; i++) {
    // xorshift32
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    vec[i] = (state >>> 0) / 0xFFFFFFFF;
  }

  return vec;
}

/**
 * Split the knowledge base into train and test sets.
 *
 * @param kb - Knowledge base
 * @param trainFraction - Fraction for training (0-1)
 * @param seed - Random seed for shuffle
 * @returns Train and test splits
 */
export function splitTrainTest(
  kb: TraitKnowledgeBase,
  trainFraction: number,
  seed: number
): { train: TraitFact[]; test: TraitFact[] } {
  // Deterministic shuffle using Fisher-Yates with seeded PRNG
  const indices = Array.from({ length: kb.facts.length }, (_, i) => i);
  let state = seed >>> 0 || 1;

  for (let i = indices.length - 1; i > 0; i--) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    const j = (state >>> 0) % (i + 1);
    [indices[i], indices[j]] = [indices[j], indices[i]];
  }

  const splitIdx = Math.floor(kb.facts.length * trainFraction);
  const trainIndices = indices.slice(0, splitIdx);
  const testIndices = indices.slice(splitIdx);

  return {
    train: trainIndices.map(i => kb.facts[i]),
    test: testIndices.map(i => kb.facts[i]),
  };
}

/**
 * Compute accuracy between predicted and actual property vectors.
 * Uses threshold-based comparison for boolean properties and
 * tolerance-based comparison for continuous properties.
 *
 * @param predicted - Predicted property vector
 * @param actual - Ground truth property vector
 * @param booleanThreshold - Threshold for converting float to boolean
 * @param continuousTolerance - Tolerance for continuous value matching
 * @returns Accuracy as fraction of correctly predicted properties
 */
export function computePropertyAccuracy(
  predicted: number[],
  actual: number[],
  booleanThreshold: number = 0.5,
  continuousTolerance: number = 0.15,
): number {
  if (predicted.length !== actual.length) return 0;

  let correct = 0;
  for (let i = 0; i < actual.length; i++) {
    // Properties 1-4 are boolean, 0 and 5 are continuous
    if (i >= 1 && i <= 4) {
      // Boolean comparison
      const predBool = predicted[i] >= booleanThreshold;
      const actualBool = actual[i] >= booleanThreshold;
      if (predBool === actualBool) correct++;
    } else {
      // Continuous comparison
      if (Math.abs(predicted[i] - actual[i]) <= continuousTolerance) correct++;
    }
  }

  return correct / actual.length;
}

/**
 * Compute MSE between predicted and actual vectors.
 */
export function computeMSE(predicted: number[], actual: number[]): number {
  if (predicted.length !== actual.length) return Infinity;
  let sum = 0;
  for (let i = 0; i < actual.length; i++) {
    const diff = predicted[i] - actual[i];
    sum += diff * diff;
  }
  return sum / actual.length;
}
