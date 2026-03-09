/**
 * presetModels.ts — Built-in 3D Model Presets
 *
 * Catalog of pre-built primitive and complex models available in the editor.
 */

export interface ModelPreset {
  id: string;
  name: string;
  category: ModelCategory;
  type: 'primitive' | 'parametric' | 'asset';
  thumbnail?: string;
  defaultParams: Record<string, number | string | boolean>;
  tags: string[];
  vertexEstimate: number;
}

export type ModelCategory =
  | 'primitive'
  | 'architecture'
  | 'nature'
  | 'furniture'
  | 'vehicle'
  | 'character'
  | 'prop'
  | 'lighting'
  | 'vfx';

export const MODEL_PRESETS: ModelPreset[] = [
  // Primitives
  {
    id: 'cube',
    name: 'Cube',
    category: 'primitive',
    type: 'primitive',
    defaultParams: { width: 1, height: 1, depth: 1, segments: 1 },
    tags: ['box', 'basic'],
    vertexEstimate: 24,
    thumbnail: '/assets/templates/cube.png',
  },
  {
    id: 'sphere',
    name: 'Sphere',
    category: 'primitive',
    type: 'primitive',
    defaultParams: { radius: 0.5, widthSegments: 32, heightSegments: 16 },
    tags: ['ball', 'basic'],
    vertexEstimate: 512,
    thumbnail: '/assets/templates/sphere.png',
  },
  {
    id: 'cylinder',
    name: 'Cylinder',
    category: 'primitive',
    type: 'primitive',
    defaultParams: { radius: 0.5, height: 1, segments: 32 },
    tags: ['tube', 'basic'],
    vertexEstimate: 128,
    thumbnail: '/assets/templates/cylinder.png',
  },
  {
    id: 'plane',
    name: 'Plane',
    category: 'primitive',
    type: 'primitive',
    defaultParams: { width: 1, height: 1, widthSegments: 1, heightSegments: 1 },
    tags: ['flat', 'floor', 'basic'],
    vertexEstimate: 4,
  },
  {
    id: 'torus',
    name: 'Torus',
    category: 'primitive',
    type: 'primitive',
    defaultParams: { radius: 0.5, tubeRadius: 0.15, segments: 32, tubularSegments: 16 },
    tags: ['donut', 'ring'],
    vertexEstimate: 512,
    thumbnail: '/assets/templates/torus.png',
  },
  {
    id: 'cone',
    name: 'Cone',
    category: 'primitive',
    type: 'primitive',
    defaultParams: { radius: 0.5, height: 1, segments: 32 },
    tags: ['pyramid', 'basic'],
    vertexEstimate: 64,
  },

  // Parametric
  {
    id: 'stairs',
    name: 'Stairs',
    category: 'architecture',
    type: 'parametric',
    defaultParams: { steps: 10, width: 1, stepHeight: 0.2, stepDepth: 0.3 },
    tags: ['staircase', 'interior'],
    vertexEstimate: 240,
  },
  {
    id: 'arch',
    name: 'Arch',
    category: 'architecture',
    type: 'parametric',
    defaultParams: { radius: 1, thickness: 0.2, segments: 16 },
    tags: ['doorway', 'gate'],
    vertexEstimate: 128,
  },
  {
    id: 'tree',
    name: 'Simple Tree',
    category: 'nature',
    type: 'parametric',
    defaultParams: { trunkHeight: 2, trunkRadius: 0.15, canopyRadius: 1.5, canopyType: 'sphere' },
    tags: ['plant', 'foliage'],
    vertexEstimate: 800,
    thumbnail: '/assets/templates/tree.png',
  },
  {
    id: 'rock',
    name: 'Rock',
    category: 'nature',
    type: 'parametric',
    defaultParams: { size: 1, roughness: 0.4, seed: 42 },
    tags: ['stone', 'terrain'],
    vertexEstimate: 256,
  },

  // Lighting
  {
    id: 'point-light',
    name: 'Point Light',
    category: 'lighting',
    type: 'primitive',
    defaultParams: { intensity: 1, color: '#ffffff', range: 10 },
    tags: ['light', 'omni'],
    vertexEstimate: 0,
  },
  {
    id: 'spot-light',
    name: 'Spot Light',
    category: 'lighting',
    type: 'primitive',
    defaultParams: { intensity: 1, color: '#ffffff', angle: 45, range: 15 },
    tags: ['light', 'focused'],
    vertexEstimate: 0,
  },
  {
    id: 'area-light',
    name: 'Area Light',
    category: 'lighting',
    type: 'primitive',
    defaultParams: { intensity: 1, color: '#ffffff', width: 2, height: 2 },
    tags: ['light', 'soft'],
    vertexEstimate: 0,
  },
];

/**
 * Get presets by category.
 */
export function presetsByCategory(category: ModelCategory): ModelPreset[] {
  return MODEL_PRESETS.filter((p) => p.category === category);
}

/**
 * Search presets by name or tags.
 */
export function searchPresets(query: string): ModelPreset[] {
  const q = query.toLowerCase();
  return MODEL_PRESETS.filter(
    (p) => p.name.toLowerCase().includes(q) || p.tags.some((t) => t.includes(q))
  );
}

/**
 * Get all unique categories.
 */
export function modelCategories(): ModelCategory[] {
  return [...new Set(MODEL_PRESETS.map((p) => p.category))];
}

/**
 * Get a preset by ID.
 */
export function getPreset(id: string): ModelPreset | undefined {
  return MODEL_PRESETS.find((p) => p.id === id);
}
