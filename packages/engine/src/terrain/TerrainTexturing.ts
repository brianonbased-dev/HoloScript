import type { Vector3 } from '@holoscript/core';
/**
 * TerrainTexturing.ts
 *
 * Splatmap blending: multi-layer texturing, triplanar mapping,
 * detail layers, and texture weights.
 *
 * @module terrain
 */

// =============================================================================
// TYPES
// =============================================================================

export interface TerrainLayer {
  id: string;
  textureId: string;
  normalMapId?: string;
  tiling: { x: number; y: number };
  metallic: number;
  roughness: number;
  heightBlend: boolean;
}

export interface SplatmapData {
  width: number;
  height: number;
  channels: Float32Array[]; // Up to 4 channels (RGBA), each is width*height
}

export interface TriplanarConfig {
  sharpness: number; // Blend sharpness for normals (1-8)
  tiling: number;
  enabled: boolean;
}

// =============================================================================
// TERRAIN TEXTURING
// =============================================================================

export class TerrainTexturing {
  private layers: TerrainLayer[] = [];
  private splatmap: SplatmapData | null = null;
  private triplanar: TriplanarConfig = { sharpness: 4, tiling: 1, enabled: false };
  private detailLayers: Array<{ layerIndex: number; distance: number; tiling: number }> = [];

  // ---------------------------------------------------------------------------
  // Layers
  // ---------------------------------------------------------------------------

  addLayer(layer: TerrainLayer): void {
    if (this.layers.length >= 16) throw new Error('Max 16 terrain layers');
    this.layers.push(layer);
  }

  getLayer(index: number): TerrainLayer | undefined {
    return this.layers[index];
  }
  getLayerCount(): number {
    return this.layers.length;
  }
  removeLayer(id: string): void {
    this.layers = this.layers.filter((l) => l.id !== id);
  }

  // ---------------------------------------------------------------------------
  // Splatmap
  // ---------------------------------------------------------------------------

  createSplatmap(width: number, height: number, channelCount = 4): SplatmapData {
    const channels: Float32Array[] = [];
    for (let i = 0; i < channelCount; i++) {
      const data = new Float32Array(width * height);
      if (i === 0) data.fill(1); // First channel = default
      channels.push(data);
    }
    this.splatmap = { width, height, channels };
    return this.splatmap;
  }

  paintSplatmap(
    channel: number,
    x: number,
    z: number,
    radius: number,
    strength: number,
    _heightMap?: Float32Array
  ): void {
    if (!this.splatmap || channel >= this.splatmap.channels.length) return;

    const w = this.splatmap.width,
      h = this.splatmap.height;
    const px = Math.floor(x * w),
      pz = Math.floor(z * h);
    const r = Math.floor(radius * Math.min(w, h));

    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const sx = px + dx,
          sz = pz + dy;
        if (sx < 0 || sx >= w || sz < 0 || sz >= h) continue;

        const dist = Math.sqrt(dx * dx + dy * dy) / r;
        if (dist > 1) continue;

        const falloff = 1 - dist * dist;
        const idx = sz * w + sx;

        // Add to target channel
        this.splatmap.channels[channel][idx] = Math.min(
          1,
          this.splatmap.channels[channel][idx] + strength * falloff
        );

        // Normalize across all channels
        this.normalizeSplatAt(idx);
      }
    }
  }

  private normalizeSplatAt(idx: number): void {
    if (!this.splatmap) return;
    let total = 0;
    for (const ch of this.splatmap.channels) total += ch[idx];
    if (total > 0) {
      for (const ch of this.splatmap.channels) ch[idx] /= total;
    }
  }

  getSplatWeights(x: number, z: number): number[] {
    if (!this.splatmap) return [1, 0, 0, 0];
    const w = this.splatmap.width,
      h = this.splatmap.height;
    const px = Math.min(w - 1, Math.max(0, Math.floor(x * w)));
    const pz = Math.min(h - 1, Math.max(0, Math.floor(z * h)));
    const idx = pz * w + px;
    return this.splatmap.channels.map((ch) => ch[idx]);
  }

  // ---------------------------------------------------------------------------
  // Triplanar
  // ---------------------------------------------------------------------------

  setTriplanar(config: Partial<TriplanarConfig>): void {
    Object.assign(this.triplanar, config);
  }
  getTriplanar(): TriplanarConfig {
    return { ...this.triplanar };
  }

  computeTriplanarWeights(normal: Vector3): Vector3 {
    const s = this.triplanar.sharpness;
    const ax = Math.pow(Math.abs(normal[0]), s);
    const ay = Math.pow(Math.abs(normal[1]), s);
    const az = Math.pow(Math.abs(normal[2]), s);
    const total = ax + ay + az || 1;
    return [ax / total, ay / total, az / total ];
  }

  // ---------------------------------------------------------------------------
  // Detail Layers
  // ---------------------------------------------------------------------------

  addDetailLayer(layerIndex: number, distance: number, tiling: number): void {
    this.detailLayers.push({ layerIndex, distance, tiling });
  }

  getDetailLayers(): typeof this.detailLayers {
    return [...this.detailLayers];
  }
}
