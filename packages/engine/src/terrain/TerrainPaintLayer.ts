/**
 * TerrainPaintLayer — Splat map layers for terrain texturing
 *
 * Manages per-vertex paint weights across multiple texture layers
 * with blending, undo, and normalization.
 *
 * @version 1.0.0
 */

export interface PaintLayer {
  id: string;
  name: string;
  textureId: string;
  tiling: number;
  metallic: number;
  roughness: number;
}

export interface VertexWeights {
  weights: number[];
}

export class TerrainPaintLayer {
  private layers: PaintLayer[] = [];
  private splatMap: Map<string, VertexWeights> = new Map();
  private gridSize: number;
  private undoStack: Map<string, number[]>[] = [];

  constructor(gridSize: number = 64) {
    this.gridSize = gridSize;
  }

  /**
   * Add a texture layer
   */
  addLayer(layer: PaintLayer): number {
    this.layers.push(layer);
    const idx = this.layers.length - 1;

    // Extend existing splat entries
    for (const weights of this.splatMap.values()) {
      weights.weights.push(0);
    }

    // If first layer, init all verts to 100% this layer
    if (idx === 0) {
      for (let x = 0; x < this.gridSize; x++) {
        for (let z = 0; z < this.gridSize; z++) {
          this.splatMap.set(`${x},${z}`, { weights: [1] });
        }
      }
    }

    return idx;
  }

  /**
   * Remove a layer by index
   */
  removeLayer(index: number): boolean {
    if (index < 0 || index >= this.layers.length) return false;
    this.layers.splice(index, 1);
    for (const entry of this.splatMap.values()) {
      entry.weights.splice(index, 1);
      this.normalizeWeights(entry.weights);
    }
    return true;
  }

  /**
   * Paint a layer at a position with given weight
   */
  paintAt(x: number, z: number, layerIndex: number, weight: number, radius: number = 1): number {
    if (layerIndex < 0 || layerIndex >= this.layers.length) return 0;

    const snapshot = new Map<string, number[]>();
    let painted = 0;
    const r = Math.ceil(radius);

    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        const dist = Math.sqrt(dx * dx + dz * dz);
        if (dist > radius) continue;

        const key = `${x + dx},${z + dz}`;
        let entry = this.splatMap.get(key);
        if (!entry) {
          entry = { weights: new Array(this.layers.length).fill(0) };
          if (entry.weights.length > 0) entry.weights[0] = 1;
          this.splatMap.set(key, entry);
        }

        snapshot.set(key, [...entry.weights]);

        const falloff = 1 - dist / radius;
        const targetWeight = weight * falloff;

        entry.weights[layerIndex] = Math.min(1, entry.weights[layerIndex] + targetWeight);
        this.normalizeWeights(entry.weights);
        painted++;
      }
    }

    this.undoStack.push(snapshot);
    return painted;
  }

  /**
   * Get weights at a position
   */
  getWeights(x: number, z: number): number[] {
    return this.splatMap.get(`${x},${z}`)?.weights ?? [];
  }

  /**
   * Get dominant layer at a position
   */
  getDominantLayer(x: number, z: number): number {
    const weights = this.getWeights(x, z);
    if (weights.length === 0) return -1;
    let maxIdx = 0;
    for (let i = 1; i < weights.length; i++) {
      if (weights[i] > weights[maxIdx]) maxIdx = i;
    }
    return maxIdx;
  }

  /**
   * Undo last paint operation
   */
  undo(): boolean {
    const snapshot = this.undoStack.pop();
    if (!snapshot) return false;
    for (const [key, weights] of snapshot) {
      const entry = this.splatMap.get(key);
      if (entry) entry.weights = weights;
    }
    return true;
  }

  /**
   * Normalize weights to sum to 1
   */
  private normalizeWeights(weights: number[]): void {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (sum > 0) {
      for (let i = 0; i < weights.length; i++) weights[i] /= sum;
    }
  }

  /**
   * Get layer definitions
   */
  getLayers(): PaintLayer[] {
    return [...this.layers];
  }
  getLayerCount(): number {
    return this.layers.length;
  }
  getUndoCount(): number {
    return this.undoStack.length;
  }
}

