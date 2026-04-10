/**
 * TreePlacer.ts
 *
 * Procedural tree placement: biome rules, collision avoidance,
 * density control, and distribution patterns.
 *
 * @module environment
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TreeTemplate {
  id: string;
  meshId: string;
  minScale: number;
  maxScale: number;
  trunkRadius: number; // Collision radius
  biomes: string[]; // Which biomes this tree can appear in
  probability: number; // 0-1, relative spawn weight
}

export interface PlacedTree {
  id: string;
  templateId: string;
  position: { x: number; y: number; z: number };
  scale: number;
  rotation: number; // Y-axis radians
}

export interface BiomeRule {
  id: string;
  name: string;
  density: number; // trees per unit area
  minSpacing: number; // Minimum distance between trees
  heightRange: { min: number; max: number };
  slopeMax: number; // Max slope angle in degrees
}

// =============================================================================
// TREE PLACER
// =============================================================================

let _treeId = 0;

export class TreePlacer {
  private templates: Map<string, TreeTemplate> = new Map();
  private biomes: Map<string, BiomeRule> = new Map();
  private trees: PlacedTree[] = [];

  // ---------------------------------------------------------------------------
  // Templates & Biomes
  // ---------------------------------------------------------------------------

  addTemplate(template: TreeTemplate): void {
    this.templates.set(template.id, template);
  }
  getTemplate(id: string): TreeTemplate | undefined {
    return this.templates.get(id);
  }
  getTemplateCount(): number {
    return this.templates.size;
  }

  addBiome(biome: BiomeRule): void {
    this.biomes.set(biome.id, biome);
  }
  getBiome(id: string): BiomeRule | undefined {
    return this.biomes.get(id);
  }

  // ---------------------------------------------------------------------------
  // Placement
  // ---------------------------------------------------------------------------

  placeInRegion(
    biomeId: string,
    bounds: { x: number; z: number; w: number; h: number },
    heightSampler?: (x: number, z: number) => number,
    slopeSampler?: (x: number, z: number) => number,
    seed = 7
  ): PlacedTree[] {
    const biome = this.biomes.get(biomeId);
    if (!biome) return [];

    // Get valid templates for this biome
    const validTemplates = [...this.templates.values()].filter((t) => t.biomes.includes(biomeId));
    if (validTemplates.length === 0) return [];

    const totalWeight = validTemplates.reduce((sum, t) => sum + t.probability, 0);
    const area = bounds.w * bounds.h;
    const count = Math.floor(area * biome.density);

    let rng = seed;
    const rand = () => {
      rng = (rng * 1103515245 + 12345) & 0x7fffffff;
      return rng / 0x7fffffff;
    };

    const placed: PlacedTree[] = [];

    for (let attempt = 0; attempt < count * 3 && placed.length < count; attempt++) {
      const x = bounds.x + rand() * bounds.w;
      const z = bounds.z + rand() * bounds.h;
      const y = heightSampler ? heightSampler(x, z) : 0;

      // Height check
      if (y < biome.heightRange.min || y > biome.heightRange.max) continue;

      // Slope check
      if (slopeSampler) {
        const slope = slopeSampler(x, z);
        if (slope > biome.slopeMax) continue;
      }

      // Collision avoidance
      if (!this.checkSpacing(x, z, biome.minSpacing, placed)) continue;

      // Pick template weighted random
      const template = this.pickTemplate(validTemplates, totalWeight, rand);
      if (!template) continue;

      const scale = template.minScale + rand() * (template.maxScale - template.minScale);
      const tree: PlacedTree = {
        id: `tree_${_treeId++}`,
        templateId: template.id,
        position: { x, y, z },
        scale,
        rotation: rand() * Math.PI * 2,
      };

      placed.push(tree);
      this.trees.push(tree);
    }

    return placed;
  }

  private checkSpacing(x: number, z: number, minSpacing: number, placed: PlacedTree[]): boolean {
    const minSq = minSpacing * minSpacing;
    for (const tree of placed) {
      const dx = tree.position.x - x;
      const dz = tree.position.z - z;
      if (dx * dx + dz * dz < minSq) return false;
    }
    // Also check existing trees
    for (const tree of this.trees) {
      const dx = tree.position.x - x;
      const dz = tree.position.z - z;
      if (dx * dx + dz * dz < minSq) return false;
    }
    return true;
  }

  private pickTemplate(
    templates: TreeTemplate[],
    totalWeight: number,
    rand: () => number
  ): TreeTemplate | null {
    let r = rand() * totalWeight;
    for (const t of templates) {
      r -= t.probability;
      if (r <= 0) return t;
    }
    return templates[templates.length - 1];
  }

  // ---------------------------------------------------------------------------
  // Queries
  // ---------------------------------------------------------------------------

  getPlacedCount(): number {
    return this.trees.length;
  }
  getAllTrees(): PlacedTree[] {
    return [...this.trees];
  }

  getTreesInRadius(x: number, z: number, radius: number): PlacedTree[] {
    const rSq = radius * radius;
    return this.trees.filter((t) => {
      const dx = t.position.x - x;
      const dz = t.position.z - z;
      return dx * dx + dz * dz <= rSq;
    });
  }

  removeTree(id: string): boolean {
    const idx = this.trees.findIndex((t) => t.id === id);
    if (idx === -1) return false;
    this.trees.splice(idx, 1);
    return true;
  }

  clear(): void {
    this.trees = [];
  }
}

