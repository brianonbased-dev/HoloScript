/**
 * training-generators.ts
 *
 * Training data generation utilities for HoloScript MCP server.
 * Provides structured training examples and dataset generation for LLM fine-tuning.
 *
 * @module training-generators
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TrainingExampleMetadata {
  /** Broad category of the example */
  category: string;
  /** Difficulty rating: 'beginner' | 'intermediate' | 'advanced' */
  difficulty: string;
  /** HoloScript traits demonstrated */
  traits: string[];
  /** Searchable keywords */
  keywords: string[];
  /** Dataset version string */
  version: string;
}

export type TrainingCategory = string;

export interface TrainingExample {
  /** Human-readable instruction prompt */
  instruction: string;
  /** Optional context / input passed alongside the instruction */
  input: string;
  /** Expected HoloScript output */
  output: string;
  /** Structured metadata for filtering and curriculum learning */
  metadata: TrainingExampleMetadata;
}

// ---------------------------------------------------------------------------
// Base examples
// ---------------------------------------------------------------------------

export const ALL_TRAINING_EXAMPLES: TrainingExample[] = [
  // ── Spatial / Scene ──────────────────────────────────────────────────────
  {
    instruction: 'Create a simple cube object at the origin',
    input: '',
    output: `object cube {
  position: vec3(0, 0, 0)
  scale: vec3(1, 1, 1)
  trait RigidBody {}
}`,
    metadata: {
      category: 'spatial',
      difficulty: 'beginner',
      traits: ['RigidBody'],
      keywords: ['cube', 'object', 'origin', 'rigid'],
      version: '1.0.0',
    },
  },
  {
    instruction: 'Generate a VR lobby scene with ambient lighting',
    input: 'style: minimal',
    output: `scene VRLobby {
  ambient: color(0.2, 0.2, 0.3)
  object floor {
    position: vec3(0, 0, 0)
    scale: vec3(20, 0.1, 20)
    trait StaticCollider {}
  }
  object ceiling_light {
    position: vec3(0, 5, 0)
    trait PointLight { intensity: 1.5 }
  }
}`,
    metadata: {
      category: 'spatial',
      difficulty: 'intermediate',
      traits: ['StaticCollider', 'PointLight'],
      keywords: ['scene', 'vr', 'lobby', 'lighting', 'ambient'],
      version: '1.0.0',
    },
  },
  {
    instruction: 'Create a procedurally generated forest with 50 trees',
    input: 'density: high',
    output:
      'scene Forest {\n  repeat(50) {\n    object tree_{i} {\n      position: vec3(random(-20, 20), 0, random(-20, 20))\n      scale: vec3(1, random(2, 5), 1)\n      trait LOD { levels: [10, 30, 80] }\n    }\n  }\n}',
    metadata: {
      category: 'spatial',
      difficulty: 'advanced',
      traits: ['LOD'],
      keywords: ['forest', 'procedural', 'trees', 'random', 'generation'],
      version: '1.0.0',
    },
  },

  // ── Physics ───────────────────────────────────────────────────────────────
  {
    instruction: 'Apply gravity and collision to a falling sphere',
    input: '',
    output: `object sphere {
  position: vec3(0, 10, 0)
  trait RigidBody {
    mass: 1.0
    gravity: vec3(0, -9.8, 0)
  }
  trait SphereCollider { radius: 0.5 }
}`,
    metadata: {
      category: 'physics',
      difficulty: 'beginner',
      traits: ['RigidBody', 'SphereCollider'],
      keywords: ['gravity', 'sphere', 'collision', 'rigid body', 'falling'],
      version: '1.0.0',
    },
  },
  {
    instruction: 'Simulate cloth physics with wind forces',
    input: 'wind: moderate',
    output: `object cloth {
  position: vec3(0, 5, 0)
  trait ClothSimulation {
    stiffness: 0.8
    damping: 0.1
    wind: vec3(2, 0, 1)
  }
}`,
    metadata: {
      category: 'physics',
      difficulty: 'advanced',
      traits: ['ClothSimulation'],
      keywords: ['cloth', 'physics', 'wind', 'simulation', 'fabric'],
      version: '1.0.0',
    },
  },

  // ── Rendering ─────────────────────────────────────────────────────────────
  {
    instruction: 'Set up PBR material with metallic and roughness properties',
    input: 'material: steel',
    output: `material Steel {
  albedo: color(0.7, 0.7, 0.75)
  metallic: 0.95
  roughness: 0.1
  normalMap: "steel_normal.png"
}`,
    metadata: {
      category: 'rendering',
      difficulty: 'intermediate',
      traits: ['PBRMaterial'],
      keywords: ['pbr', 'material', 'metallic', 'roughness', 'rendering'],
      version: '1.0.0',
    },
  },
  {
    instruction: 'Add particle effects for fire and smoke',
    input: '',
    output: `object campfire {
  position: vec3(0, 0, 0)
  trait ParticleEmitter {
    count: 500
    lifetime: { min: 0.5, max: 2.0 }
    velocity: vec3(0, 3, 0)
    color_start: color(1.0, 0.5, 0.0)
    color_end: color(0.3, 0.3, 0.3)
  }
}`,
    metadata: {
      category: 'rendering',
      difficulty: 'intermediate',
      traits: ['ParticleEmitter'],
      keywords: ['particles', 'fire', 'smoke', 'emitter', 'effects'],
      version: '1.0.0',
    },
  },

  // ── AI / Behaviour ────────────────────────────────────────────────────────
  {
    instruction: 'Create an NPC with pathfinding behaviour',
    input: 'target: player',
    output: `object npc {
  position: vec3(5, 0, 5)
  trait NavAgent {
    speed: 3.0
    target: @player
    avoidance: true
  }
  trait Animator {
    idle: "idle_anim"
    walk: "walk_anim"
  }
}`,
    metadata: {
      category: 'ai',
      difficulty: 'advanced',
      traits: ['NavAgent', 'Animator'],
      keywords: ['npc', 'ai', 'pathfinding', 'navigation', 'behaviour'],
      version: '1.0.0',
    },
  },
];

// ---------------------------------------------------------------------------
// Generator functions
// ---------------------------------------------------------------------------

/**
 * Generate a requested number of variation examples based on a seed example.
 * Variations differ by inserting slightly modified phrasing or parameters.
 */
export function generateVariations(example: TrainingExample, count: number): TrainingExample[] {
  const variations: TrainingExample[] = [];

  for (let i = 0; i < count; i++) {
    const suffix = i + 1;
    variations.push({
      instruction: `${example.instruction} (variation ${suffix})`,
      input: example.input,
      output: example.output,
      metadata: {
        ...example.metadata,
        keywords: [...example.metadata.keywords, `variation-${suffix}`],
        version: example.metadata.version,
      },
    });
  }

  return variations;
}

/**
 * Generate an expanded Hololand dataset by producing variations of all base
 * examples.  The returned array is at least as large as ALL_TRAINING_EXAMPLES.
 *
 * @param variationsPerExample  Number of extra variations per base example
 *                              (minimum 1 to guarantee the result is at least
 *                              as large as the base array).
 */
export function generateHololandDataset(variationsPerExample: number = 1): TrainingExample[] {
  const safeVariations = Math.max(1, variationsPerExample);
  const dataset: TrainingExample[] = [...ALL_TRAINING_EXAMPLES];

  for (const example of ALL_TRAINING_EXAMPLES) {
    const vars = generateVariations(example, safeVariations);
    dataset.push(...vars);
  }

  return dataset;
}

/**
 * Serialise a single training example to an Alpaca-format JSONL line.
 * The output JSON object contains `instruction`, `input`, and `output` fields.
 */
export function toAlpacaJsonl(example: TrainingExample): string {
  return JSON.stringify({
    instruction: example.instruction,
    input: example.input,
    output: example.output,
  });
}

/**
 * Serialise an array of training examples as a multi-line JSONL string.
 * Each line is a self-contained Alpaca-format JSON object.
 */
export function datasetToJsonl(examples: TrainingExample[]): string {
  return examples.map((ex) => toAlpacaJsonl(ex)).join('\n') + '\n';
}
